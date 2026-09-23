import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { Sealer } from './crypto.js';
import { Fleet } from './runner.js';
import { FileStore } from './state.js';
import { createWebServer } from './web.js';

/**
 * **화면의 전 구간** — 들어와서, 만들고, 고치고, 지운다.
 *
 * GitHub만 흉내 낸다(`fetch` 두 자리). 그 밖은 실물이다 — 실제 서버가 뜨고, 실제 폴더에
 * 쓰이고, 지우면 실제로 사라진다. **지우는 일은 되돌릴 수 없어서** 여기서 한 번 서 보지
 * 않으면 처음 누르는 사람이 첫 실증자가 된다.
 */

const GITHUB = { id: 4242, login: '옥수박' };

let dir: string;
let store: FileStore;
let server: Server;
let origin: string;
let original: typeof globalThis.fetch;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'bot-web-'));
  store = new FileStore(dir);

  const sealer = new Sealer('0123456789abcdef0123');
  const fleet = new Fleet({
    store, sealer, publicOrigin: 'https://bots.example', dryRun: true, pollMs: 1000,
    log: () => undefined, brain: () => ({ tick: async () => 0 }),
  });

  server = createWebServer({
    store, sealer, fleet,
    github: { clientId: 'gh', clientSecret: 'sh', redirectUri: 'https://bots.example/auth/github/callback' },
    publicOrigin: 'https://bots.example',
    codeVersion: '0.1.0',
    maxBotsPerAccount: 2,
    scopes: ['read:posts'],
    log: () => undefined,
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  original = globalThis.fetch;
  globalThis.fetch = (async (input: Parameters<typeof globalThis.fetch>[0], init?: RequestInit): Promise<Response> => {
    const url = String(input instanceof Request ? input.url : input);

    if (url.startsWith('https://github.com/login/oauth/access_token')) {
      return Response.json({ access_token: 'token' });
    }

    if (url.startsWith('https://api.github.com/user')) {
      return Response.json(GITHUB);
    }

    return await original(input, init);
  }) as typeof globalThis.fetch;
});

afterEach(async () => {
  globalThis.fetch = original;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(dir, { recursive: true, force: true });
});

/** 쿠키 하나를 들고 다니는 손 — 리다이렉트는 **따라가지 않는다**(어디로 보내는지가 검사다). */
class Browser {
  private cookie = '';

  constructor(private readonly at: string) {}

  async get(path: string): Promise<Response> {
    return await this.go(path, {});
  }

  async post(path: string, form: Record<string, string> = {}): Promise<Response> {
    return await this.go(path, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
    });
  }

  private async go(path: string, init: RequestInit): Promise<Response> {
    const response = await original(`${this.at}${path}`, {
      ...init,
      redirect: 'manual',
      headers: { ...(init.headers ?? {}), ...(this.cookie === '' ? {} : { cookie: this.cookie }) },
    });

    const set = response.headers.get('set-cookie');
    if (set !== null) {
      this.cookie = set.split(';')[0] ?? '';
    }

    return response;
  }
}

/** 들어온다 — `state`는 GitHub으로 보내는 주소에서 받아 그대로 돌려준다. */
async function signIn(): Promise<Browser> {
  const browser = new Browser(origin);

  const sent = await browser.get('/auth/github');
  const state = new URL(sent.headers.get('location') ?? '').searchParams.get('state') ?? '';

  const back = await browser.get(`/auth/github/callback?state=${state}&code=c`);
  expect(back.status).toBe(302);

  return browser;
}

async function makeBot(browser: Browser, name = '에코'): Promise<string> {
  const made = await browser.post('/bots', {
    name, summary: '되받는다', origin: 'https://kbtest.codemach.net',
  });

  expect(made.status).toBe(302);

  // **만든 직후에는 인증으로 보낸다** — 급한 것이 잇는 일이다.
  const at = made.headers.get('location') ?? '';
  expect(at).toMatch(/\/auth$/);

  return at.replace('/bots/', '').replace('/auth', '');
}

test('목록과 만들기가 갈려 있다 — 목록에는 폼이 없다', async () => {
  const browser = await signIn();

  const home = await browser.get('/');
  const listing = await home.text();
  expect(listing).toContain('아직 봇이 없습니다');
  expect(listing).toContain('/bots/new');
  expect(listing).not.toContain('action="/bots"');

  const form = await (await browser.get('/bots/new')).text();
  expect(form).toContain('action="/bots"');
});

test('한도에 닿으면 만들기 자리가 왜 없는지 말한다', async () => {
  const browser = await signIn();
  await makeBot(browser, '하나');
  await makeBot(browser, '둘');

  const home = await (await browser.get('/')).text();
  expect(home).not.toContain('/bots/new');

  // **주소를 직접 쳐도 막힌다** — 링크를 감추는 것은 문이 아니다.
  expect(await (await browser.get('/bots/new')).text()).toContain('한도');
  expect((await browser.post('/bots', {
    name: '셋', summary: '셋', origin: 'https://kbtest.codemach.net',
  })).status).toBe(400);
});

test('만들다 틀리면 적은 것이 남는다', async () => {
  const browser = await signIn();

  const said = await (await browser.post('/bots', {
    name: '에코', summary: '되받는다', origin: 'http://사설',
  })).text();

  expect(said).toContain('value="에코"');
  expect(said).toContain('https');
});

test('봇 하나의 자리가 넷으로 갈린다 — 탭이 곧 주소다', async () => {
  const browser = await signIn();
  const id = await makeBot(browser);

  const profile = await (await browser.get(`/bots/${id}`)).text();
  const features = await (await browser.get(`/bots/${id}/features`)).text();
  const auth = await (await browser.get(`/bots/${id}/auth`)).text();
  const advanced = await (await browser.get(`/bots/${id}/advanced`)).text();

  // 넷 다 같은 탭 줄을 지고, 자기 자리에만 표를 세운다.
  for (const [where, page] of [
    [`/bots/${id}"`, profile], [`/bots/${id}/features"`, features],
    [`/bots/${id}/auth"`, auth], [`/bots/${id}/advanced"`, advanced],
  ] as const) {
    expect(page).toContain('등록정보');
    expect(page).toContain(`<a href="${where} aria-current="page"`);
  }

  // 자리마다 자기 것만 진다.
  expect(profile).toContain('초상화');
  expect(profile).not.toContain('client_secret');
  expect(auth).toContain('client_secret');
  expect(auth).toContain('manifest.json');
  expect(advanced).toContain('지우러 간다');
  expect(features).toContain('이은 뒤에 섭니다');
});

test('커스텀 필드는 자리를 세우고 아직 안 선다고 말한다', async () => {
  const browser = await signIn();
  const id = await makeBot(browser);

  const profile = await (await browser.get(`/bots/${id}`)).text();
  expect(profile).toContain('커스텀 필드');
  expect(profile).toContain('아직 서지 않았습니다');
  expect(profile).toContain('disabled');
});

test('초상화와 배경은 선언으로 나간다 — 비우면 지워진다', async () => {
  const browser = await signIn();
  const id = await makeBot(browser);

  const same = { name: '에코', summary: '되받는다', origin: 'https://kbtest.codemach.net' };

  await browser.post(`/bots/${id}/declaration`, {
    ...same, avatar: 'https://cdn.example/a.png', header: 'https://cdn.example/h.png',
  });

  const manifest = await (await browser.get(`/bots/${id}/manifest.json`)).json() as {
    readonly avatar?: string; readonly header?: string; readonly version: string;
  };

  expect(manifest.avatar).toBe('https://cdn.example/a.png');
  expect(manifest.header).toBe('https://cdn.example/h.png');
  expect(manifest.version).toBe('0.1.0+2');

  // **비우면 지운다** — 빈 칸과 *안 적은 것*이 갈리면 초상화를 내릴 길이 없다.
  await browser.post(`/bots/${id}/declaration`, { ...same, avatar: '', header: '' });

  const bare = await (await browser.get(`/bots/${id}/manifest.json`)).json() as {
    readonly avatar?: string; readonly version: string;
  };

  expect(bare.avatar).toBeUndefined();
  expect(bare.version).toBe('0.1.0+3');

  // 주소가 아니면 받지 않는다.
  await browser.post(`/bots/${id}/declaration`, { ...same, avatar: '그림' });
  expect((await store.bot(id))?.declaration.avatar).toBeUndefined();
  expect((await store.bot(id))?.settingsVersion).toBe(3);
});

test('선언을 고치면 판이 오른다', async () => {
  const browser = await signIn();
  const id = await makeBot(browser);

  expect((await store.bot(id))?.settingsVersion).toBe(1);

  await browser.post(`/bots/${id}/declaration`, {
    name: '에코2', summary: '되받는다', origin: 'https://kbtest.codemach.net',
  });

  const after = await store.bot(id);
  expect(after?.declaration.name).toBe('에코2');
  expect(after?.settingsVersion).toBe(2);

  // **바뀐 것이 없으면 판도 그대로다** — 저장을 누를 때마다 오르면 승인이 헛돈다.
  await browser.post(`/bots/${id}/declaration`, {
    name: '에코2', summary: '되받는다', origin: 'https://kbtest.codemach.net',
  });

  expect((await store.bot(id))?.settingsVersion).toBe(2);
});

test('멈추고 다시 돌린다', async () => {
  const browser = await signIn();
  const id = await makeBot(browser);

  const stopped = await browser.post(`/bots/${id}/stop`);
  expect(stopped.headers.get('location')).toContain('/advanced');
  expect((await store.bot(id))?.stopped).toBe(true);

  await browser.post(`/bots/${id}/start`);
  expect((await store.bot(id))?.stopped).toBe(false);
});

test('지우기 전에 한 번 보이고, 지우면 사라진다', async () => {
  const browser = await signIn();
  const id = await makeBot(browser);

  const asked = await (await browser.get(`/bots/${id}/delete`)).text();
  expect(asked).toContain('되돌릴 수 없습니다');
  // **무엇이 남는지도 말한다** — 시에라의 계정은 여기서 걷지 못한다.
  expect(asked).toContain('kbtest.codemach.net');

  const gone = await browser.post(`/bots/${id}/delete`);
  expect(gone.status).toBe(302);
  expect(gone.headers.get('location')).toContain('/?said=');

  expect(await store.bot(id)).toBeUndefined();
  expect(await (await browser.get(`/bots/${id}`)).text()).toContain('그런 봇이 없습니다');
});

test('남의 봇은 만지지 못한다', async () => {
  const owner = await signIn();
  const id = await makeBot(owner);

  // 다른 GitHub 사람이 들어온다.
  GITHUB.id = 9999;
  GITHUB.login = '남';
  const stranger = await signIn();
  GITHUB.id = 4242;
  GITHUB.login = '옥수박';

  expect(await (await stranger.get(`/bots/${id}`)).status).toBe(404);
  expect(await (await stranger.post(`/bots/${id}/delete`)).status).toBe(404);
  expect(await store.bot(id)).toBeDefined();
});

test('로그인하지 않은 사람은 봇 자리에 못 든다 — 선언만 공개다', async () => {
  const browser = await signIn();
  const id = await makeBot(browser);

  const nobody = new Browser(origin);
  expect((await nobody.get(`/bots/${id}`)).status).toBe(302);

  const manifest = await (await nobody.get(`/bots/${id}/manifest.json`)).json() as {
    readonly version: string; readonly name: string;
  };

  expect(manifest.version).toBe('0.1.0+1');
  expect(manifest.name).toBe('에코');
});
