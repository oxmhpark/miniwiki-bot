import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { Sealer } from './crypto.js';
import type { BotIntake, ConnectTicket } from './intake.js';
import { Fleet } from './runner.js';
import { FileStore } from './state.js';
import { Tickets } from './tickets.js';
import { createWebServer } from './web.js';

/**
 * **화면의 전 구간** — 들어와서, 만들고, 고치고, 지운다.
 *
 * GitHub만 흉내 낸다(`fetch` 두 자리). 그 밖은 실물이다 — 실제 서버가 뜨고, 실제 폴더에
 * 쓰이고, 지우면 실제로 사라진다. **지우는 일은 되돌릴 수 없어서** 여기서 한 번 서 보지
 * 않으면 처음 누르는 사람이 첫 실증자가 된다.
 */

const GITHUB = { id: 4242, login: '옥수박' };

/** 말 거는 사람 — **시에라의 id는 GUID다**(`state.ts`가 모양을 본다). */
const TALKER = '01a0b7c8-ce1c-7655-8154-874313000001';

/** 가짜 봇 — **무언가를 청하는 봇**의 자리. 한 칸을 받아 봉해 둔다. */
const intake: BotIntake = {
  describe: async (who) => ({
    title: '열쇠 맡기기',
    intro: [`@${who.handle}, 열쇠 하나가 듭니다.`],
    fields: [{ type: 'secret', name: 'key', label: '열쇠', hint: 'sk-…' }],
  }),
  save: async (values, who, bot, ctx) => {
    const key = (values.get('key') ?? '').trim();
    if (key === '') {
      throw new Error('열쇠가 있어야 합니다.');
    }

    await ctx.store.saveUser(bot.id, {
      id: who.id, handle: who.handle, data: { sealed: ctx.sealer.seal(key) },
    });

    return '열쇠를 맡았습니다.';
  },
};

let dir: string;
let store: FileStore;
let tickets: Tickets<ConnectTicket>;
let server: Server;
let origin: string;
let original: typeof globalThis.fetch;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'bot-web-'));
  store = new FileStore(dir);

  const sealer = new Sealer('0123456789abcdef0123', 'bot/v1');
  tickets = new Tickets<ConnectTicket>();
  const fleet = new Fleet({
    store, sealer, publicOrigin: 'https://bots.example', dryRun: true, pollMs: 1000,
    log: () => undefined, brain: () => ({ tick: async () => 0 }), tickets,
  });

  server = createWebServer({
    store, sealer, fleet,
    github: { clientId: 'gh', clientSecret: 'sh', redirectUri: 'https://bots.example/auth/github/callback' },
    publicOrigin: 'https://bots.example',
    codeVersion: '0.1.0',
    maxBotsPerAccount: 2,
    scopes: ['read:posts'],
    serviceName: '에코',
    about: '<h2>소개</h2><p>맡긴 메시지를 옮겨 적습니다.</p>',
    intake,
    tickets,
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

  /** 파일이 실린 폼 — 경계는 `fetch`가 짓는다. */
  async upload(path: string, form: FormData): Promise<Response> {
    return await this.go(path, { method: 'POST', body: form });
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
  // **들어오면 자기 봇들로 간다** — 소개는 방금 지나왔다.
  expect(back.headers.get('location')).toBe('/bots');

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

test('첫 화면은 누구에게나 열리고, 제목줄만 바뀐다', async () => {
  const nobody = new Browser(origin);

  const outside = await (await nobody.get('/')).text();
  expect(outside).toContain('<h1>에코</h1>');
  expect(outside).toContain('/auth/github');
  expect(outside).toContain('맡긴 메시지를 옮겨 적습니다');
  expect(outside).not.toContain('/auth/logout');

  // 들어온 사람에게도 이 자리는 이 자리다 — 제목줄과 단추 하나만 바뀐다.
  const browser = await signIn();
  const inside = await (await browser.get('/')).text();
  expect(inside).toContain('<h1>옥수박의 에코</h1>');
  expect(inside).toContain('/auth/logout');
  expect(inside).toContain('href="/bots"');
  expect(inside).toContain('맡긴 메시지를 옮겨 적습니다');
});

test('목록과 만들기가 갈려 있다 — 목록에는 폼이 없다', async () => {
  const browser = await signIn();

  const home = await browser.get('/bots');
  const listing = await home.text();
  expect(listing).toContain('<h1>옥수박의 에코</h1>');
  expect(listing).toContain('/auth/logout');
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

  const home = await (await browser.get('/bots')).text();
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

test('커스텀 필드는 선언에 실린다 — 한 번도 적지 않으면 싣지 않고, 다 지우면 빈 목록이다', async () => {
  const browser = await signIn();
  const id = await makeBot(browser);
  const same = { name: '에코', summary: '되받는다', origin: 'https://kbtest.codemach.net' };
  const save = async (rows: readonly (readonly [string, string])[]): Promise<Response> => {
    const form = new FormData();
    for (const [key, value] of Object.entries(same)) {
      form.append(key, value);
    }
    for (const [name, value] of rows) {
      form.append('field_name', name);
      form.append('field_value', value);
    }
    return await browser.upload(`/bots/${id}/declaration`, form);
  };
  const manifest = async (): Promise<{ readonly fields?: readonly { name: string; value: string }[] }> =>
    await (await browser.get(`/bots/${id}/manifest.json`)).json() as { readonly fields?: readonly { name: string; value: string }[] };

  // **화면에 필드 줄이 서고 꺼져 있지 않다.**
  const profile = await (await browser.get(`/bots/${id}`)).text();
  expect(profile).toContain('name="field_name"');
  expect(profile).not.toContain('아직 서지 않았습니다');

  // **한 번도 적지 않으면 싣지 않는다** — 시에라에서 적어 둔 필드를 지우지 않는다.
  await save([['', '']]);
  expect((await manifest()).fields).toBeUndefined();

  // **이름이 빈 줄은 버린다.**
  await save([['사는 곳', '어딘가'], ['', '버려진다'], ['누리집', 'https://bot.example']]);
  expect((await manifest()).fields).toEqual([{ name: '사는 곳', value: '어딘가' }, { name: '누리집', value: 'https://bot.example' }]);

  // **상한을 넘으면 받지 않는다.**
  await save([['1', 'a'], ['2', 'b'], ['3', 'c'], ['4', 'd'], ['5', 'e']]);
  expect((await manifest()).fields).toHaveLength(2);

  // **다 지우면 빈 목록이다** — 시에라가 지운다.
  await save([['', '']]);
  expect((await manifest()).fields).toEqual([]);
});

test('초상화와 배경은 올린 파일이다 — 버전 있는 우리 주소가 선언에 실리고, 지우기로 내린다', async () => {
  const browser = await signIn();
  const id = await makeBot(browser);
  const same = { name: '에코', summary: '되받는다', origin: 'https://kbtest.codemach.net' };
  const png = (tail: number): File => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, tail])], 'a.png');
  const form = (extra: Record<string, string | File>): FormData => {
    const one = new FormData();
    for (const [key, value] of Object.entries({ ...same, ...extra })) {
      one.append(key, value);
    }
    return one;
  };
  const manifest = async (): Promise<{ readonly avatar?: string; readonly version: string }> =>
    await (await browser.get(`/bots/${id}/manifest.json`)).json() as { readonly avatar?: string; readonly version: string };

  await browser.upload(`/bots/${id}/declaration`, form({ avatar: png(1) }));
  const first = (await manifest()).avatar ?? '';
  expect(first).toMatch(new RegExp(`/bots/${id}/images/avatar/[0-9a-f]{32}$`));

  // **그 주소로 그림이 나가고 오래 담긴다.**
  const served = await browser.get(new URL(first).pathname);
  expect(served.status).toBe(200);
  expect(served.headers.get('content-type')).toBe('image/png');
  expect(served.headers.get('cache-control')).toContain('immutable');

  // **새로 올리면 주소가 바뀌고 옛 주소는 아무것도 내지 않는다.**
  await browser.upload(`/bots/${id}/declaration`, form({ avatar: png(2) }));
  const second = (await manifest()).avatar ?? '';
  expect(second).not.toBe(first);
  expect((await browser.get(new URL(first).pathname)).status).toBe(404);

  // **고르지 않으면 지금 것을 둔다.**
  await browser.upload(`/bots/${id}/declaration`, form({ name: '에코2' }));
  expect((await manifest()).avatar).toBe(second);

  // **그림이 아니면 받지 않는다.**
  await browser.upload(`/bots/${id}/declaration`, form({ avatar: new File(['<svg/>'], 'a.svg') }));
  expect((await manifest()).avatar).toBe(second);

  // **지우기로 내린다.**
  await browser.upload(`/bots/${id}/declaration`, form({ clear_avatar: '1' }));
  expect((await manifest()).avatar).toBeUndefined();
  expect((await browser.get(new URL(second).pathname)).status).toBe(404);
});

test('옛 판에서 주소로 적어 둔 그림은 새로 올리기 전까지 그대로다', async () => {
  const browser = await signIn();
  const id = await makeBot(browser);
  const bot = await store.bot(id);
  await store.saveBot({ ...bot!, declaration: { ...bot!.declaration, header: 'https://cdn.example/h.png' } });

  await browser.post(`/bots/${id}/declaration`, { name: '에코2', summary: '되받는다', origin: 'https://kbtest.codemach.net' });

  expect((await store.bot(id))?.declaration.header).toBe('https://cdn.example/h.png');
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
  expect(gone.headers.get('location')).toContain('/bots?said=');

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
  expect((await nobody.get('/bots')).status).toBe(302);

  const manifest = await (await nobody.get(`/bots/${id}/manifest.json`)).json() as {
    readonly version: string; readonly name: string;
  };

  expect(manifest.version).toBe('0.1.0+1');
  expect(manifest.name).toBe('에코');
});

/**
 * **맡기러 오는 사람의 전 구간** — 로그인 없이, 링크 하나로.
 *
 * 봇이 낸 링크(`ctx.connectLink`)와 화면이 받는 자리가 **같은 표를 쥐는지**가 여기서 선다.
 * 둘이 갈리면 방금 보낸 링크를 화면이 모르고, 그 사실은 사람이 링크를 열어야 드러난다.
 */
test('말 거는 사람은 링크 하나로 맡긴다 — 티켓은 성공했을 때만 탄다', async () => {
  const owner = await signIn();
  const id = await makeBot(owner);

  const token = tickets.issue({ botId: id, userId: TALKER, handle: '말건이' });
  const nobody = new Browser(origin);

  // **로그인 밖이다** — 쿠키 없이 폼이 선다.
  const form = await nobody.get(`/connect/${token}`);
  expect(form.status).toBe(200);

  const html = await form.text();
  expect(html).toContain('열쇠 맡기기');
  expect(html).toContain('@말건이');
  // 비밀은 `password` 칸으로 서고 값을 싣지 않는다.
  expect(html).toContain('type="password"');
  expect(html).not.toContain('나가기');

  // **틀리면 티켓은 산다** — 다시 적게 하고 링크를 죽이지 않는다.
  const empty = await nobody.post(`/connect/${token}`, { key: '' });
  expect(empty.status).toBe(400);
  expect(await empty.text()).toContain('열쇠가 있어야 합니다');
  expect(tickets.peek(token)).toBeDefined();

  const done = await nobody.post(`/connect/${token}`, { key: 'sk-abc' });
  expect(done.status).toBe(200);
  expect(await done.text()).toContain('열쇠를 맡았습니다');

  // 맡은 것은 **그 봇 아래** 그 사람의 자리에 있고, 봉해져 있다.
  const saved = await store.user<{ readonly sealed: string }>(id, TALKER);
  expect(saved?.handle).toBe('말건이');
  expect(saved?.data.sealed).not.toContain('sk-abc');

  // **한 번뿐이다.**
  expect((await nobody.get(`/connect/${token}`)).status).toBe(404);
});

test('지난 링크와 없는 링크를 가르지 않는다', async () => {
  const nobody = new Browser(origin);

  const gone = await nobody.get('/connect/aaaaaaaaaaaaaaaa');
  expect(gone.status).toBe(404);
  expect(await gone.text()).toContain('다시 말을 걸면');
});
