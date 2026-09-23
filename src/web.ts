import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { GithubApp } from './auth.js';
import { authorizeUrl, exchange, welcome } from './auth.js';
import type { Sealer } from './crypto.js';
import { declarationChanged, manifestOf } from './manifest.js';
import {
  botPage, deletePage, gatePage, homePage, newBotPage, noRoomPage, stopPage,
} from './pages.js';
import { renderPanel, type BotPanel } from './panel.js';
import type { Fleet } from './runner.js';
import { SierraClient, SierraError } from './sierra.js';
import type { AccountRecord, BotRecord, FileStore } from './state.js';
import { isConnected } from './state.js';
import { escapeHtml } from './text.js';
import { Tickets } from './tickets.js';

/**
 * 사람이 브라우저로 닿는 자리 — **문을 열고 폼을 받는다. 그림은 `pages.ts`에 있다.**
 *
 * **스크립트가 없다.** 여는 일은 마크업이 맡고 폼이 전부다 — 봇 서버의 화면이라 프레임워크를
 * 들이지 않는다. 공개 지식(`manifest.json`)과 임자의 자리(`/bots/...`)가 한 서버에 있고,
 * **문지기는 쿠키 하나**다.
 *
 * **한 화면은 한 가지 일을 한다**(2026-09-23 요구) — 고르는 자리·짓는 자리·만지는 자리가
 * 각자 주소를 가진다. 한 장에 겹쳐 두면 봇이 셋일 때 만들기 폼이 목록을 밀어낸다.
 *
 * ```
 * GET  /healthz
 * GET  /                         내 봇들(로그인했으면) · 들어오는 문(아니면)
 * GET  /auth/github              GitHub으로 보낸다
 * GET  /auth/github/callback     돌아온다
 * POST /auth/logout
 * GET  /bots/new                 봇 만들기 폼
 * POST /bots                     봇을 만든다
 * GET  /bots/{id}                봇 하나 — 잇고 · 고치고 · 멈추는 자리
 * POST /bots/{id}/credentials    시에라에서 받은 client_id·secret을 붙인다
 * POST /bots/{id}/declaration    이름·소개를 고친다 — **선언의 판이 오른다**
 * POST /bots/{id}/stop           폴링을 쉰다 · POST /bots/{id}/start 다시 돌린다
 * GET  /bots/{id}/delete         지우기 전에 한 번 보인다
 * POST /bots/{id}/delete         **지운다** — 이 서비스의 것까지다
 * GET  /bots/{id}/manifest.json  **공개** — 코어가 읽는다
 * POST /bots/{id}/x/{무엇}       포크의 칸
 * ```
 */

const COOKIE = 'bot_session';

interface Session {
  readonly accountId: string;
}

export interface WebOptions {
  readonly store: FileStore;
  readonly sealer: Sealer;
  readonly fleet: Fleet;
  readonly github: GithubApp;
  readonly publicOrigin: string;
  readonly codeVersion: string;
  readonly maxBotsPerAccount: number;
  readonly scopes: readonly string[];
  /** 포크가 봇 화면에 더하는 칸 — 없으면 템플릿의 것만 선다. */
  readonly panel?: BotPanel;
  readonly log: (line: string) => void;
}

export function createWebServer(options: WebOptions): Server {
  // 세션과 CSRF 표는 **메모리에만** 있다 — 다시 뜨면 임자가 다시 로그인한다.
  const sessions = new Tickets<Session>(12 * 60 * 60 * 1000);
  const states = new Tickets<true>();

  return createServer((request, response) => {
    void handle(request, response, options, sessions, states).catch((error: unknown) => {
      options.log(`화면이 막혔다: ${(error as Error).message}`);
      send(response, 500, '<p>여기서 막혔습니다. 잠시 뒤 다시 열어 주세요.</p>');
    });
  });
}

async function handle(
  request: IncomingMessage,
  response: ServerResponse,
  options: WebOptions,
  sessions: Tickets<Session>,
  states: Tickets<true>,
): Promise<void> {
  const url = new URL(request.url ?? '/', options.publicOrigin);
  const path = url.pathname;

  if (path === '/healthz') {
    response.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
    return;
  }

  // ── 공개: 코어가 읽는 선언 ───────────────────────────────────────────────
  const declared = /^\/bots\/([0-9a-fA-F-]{36})\/manifest\.json$/.exec(path);
  if (declared !== undefined && declared !== null && request.method === 'GET') {
    const bot = await options.store.bot(declared[1] ?? '');
    if (bot === undefined) {
      send(response, 404, '<p>그런 봇이 없습니다.</p>');
      return;
    }

    const body = JSON.stringify(manifestOf(bot, options.codeVersion, options.scopes), null, 2);
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' }).end(body);
    return;
  }

  // ── 들어오는 문 ─────────────────────────────────────────────────────────
  if (path === '/auth/github' && request.method === 'GET') {
    redirect(response, authorizeUrl(options.github, states.issue(true)));
    return;
  }

  if (path === '/auth/github/callback' && request.method === 'GET') {
    const state = url.searchParams.get('state') ?? '';
    const code = url.searchParams.get('code') ?? '';

    // **state를 태운다** — 이것이 CSRF를 막는 자리다.
    if (states.take(state) === undefined || code === '') {
      send(response, 400, '<p>로그인이 만료되었습니다. <a href="/">처음부터</a> 다시 해 주세요.</p>');
      return;
    }

    const account = await welcome(options.store, await exchange(options.github, code));
    const token = sessions.issue({ accountId: account.id });

    response.writeHead(302, {
      location: '/',
      'set-cookie': `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=43200`,
    }).end();
    return;
  }

  if (path === '/auth/logout' && request.method === 'POST') {
    sessions.take(cookie(request) ?? '');
    response.writeHead(302, {
      location: '/',
      'set-cookie': `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`,
    }).end();
    return;
  }

  // ── 여기부터는 임자의 자리다 ────────────────────────────────────────────
  const session = sessions.peek(cookie(request) ?? '');
  const account = session === undefined ? undefined : await options.store.account(session.accountId);

  if (account === undefined) {
    if (path === '/') {
      send(response, 200, gatePage());
      return;
    }

    redirect(response, '/');
    return;
  }

  const spoken = url.searchParams.get('said') ?? undefined;

  if (path === '/' && request.method === 'GET') {
    const bots = await options.store.botsOf(account.id);
    send(response, 200, homePage(account, bots, options.maxBotsPerAccount, spoken));
    return;
  }

  // **짓는 자리는 따로 선다** — 목록이 만들기 폼을 지고 다니지 않는다.
  if (path === '/bots/new' && request.method === 'GET') {
    const mine = await options.store.botsOf(account.id);
    send(response, 200, mine.length >= options.maxBotsPerAccount
      ? noRoomPage(options.maxBotsPerAccount)
      : newBotPage());
    return;
  }

  if (path === '/bots' && request.method === 'POST') {
    await createBot(request, response, options, account);
    return;
  }

  const one = /^\/bots\/([0-9a-fA-F-]{36})$/.exec(path);
  const what = /^\/bots\/([0-9a-fA-F-]{36})\/([a-z]{1,20})$/.exec(path);
  const extra = /^\/bots\/([0-9a-fA-F-]{36})\/x\/([A-Za-z0-9_-]{1,40})$/.exec(path);

  if (one !== null) {
    const bot = await ownBot(options, account, one[1] ?? '');
    if (bot === undefined) {
      send(response, 404, stopPage('없다', '<p>그런 봇이 없습니다.</p>', '/'));
      return;
    }

    await renderBot(response, options, bot, spoken);
    return;
  }

  // **포크의 칸** — 경로는 템플릿이 쥐고 이름은 포크가 정한다.
  if (extra !== null && request.method === 'POST') {
    const bot = await ownBot(options, account, extra[1] ?? '');
    if (bot === undefined || options.panel === undefined) {
      send(response, 404, stopPage('없다', '<p>그런 자리가 없습니다.</p>', '/'));
      return;
    }

    const name = extra[2] ?? '';
    const ctx = options.fleet.contextOf(bot);
    let line: string | undefined;

    try {
      line = name === 'settings'
        ? await options.panel.save?.(await readForm(request), bot, ctx)
        : await options.panel.act?.(name, bot, ctx);
    } catch (error) {
      send(response, 400, stopPage('안 됐다',
        `<p>${escapeHtml((error as Error).message)}</p>`, `/bots/${bot.id}`));
      return;
    }

    // **한 말은 한 번만 보인다** — 주소에 실어 보내고 새로고침에는 남지 않게 한다.
    back(response, bot.id, line);
    return;
  }

  if (what !== null) {
    const bot = await ownBot(options, account, what[1] ?? '');
    if (bot === undefined) {
      send(response, 404, stopPage('없다', '<p>그런 봇이 없습니다.</p>', '/'));
      return;
    }

    await botAction(request, response, options, bot, what[2] ?? '');
    return;
  }

  send(response, 404, stopPage('없다', '<p>그런 자리가 없습니다.</p>', '/'));
}

/** 봇 하나에 하는 일들 — 주소의 끝 한 마디가 무엇을 할지 정한다. */
async function botAction(
  request: IncomingMessage,
  response: ServerResponse,
  options: WebOptions,
  bot: BotRecord,
  verb: string,
): Promise<void> {
  const post = request.method === 'POST';

  if (verb === 'credentials' && post) {
    await connectBot(request, response, options, bot);
    return;
  }

  if (verb === 'declaration' && post) {
    await editDeclaration(request, response, options, bot);
    return;
  }

  // **멈추는 것은 자격 증명을 두고 읽기만 쉰다** — 지우는 것과 다른 무게다.
  if ((verb === 'stop' || verb === 'start') && post) {
    await options.store.saveBot({ ...bot, stopped: verb === 'stop' });
    await options.fleet.sync();
    options.log(`봇 ${bot.id}이(가) ${verb === 'stop' ? '멈췄다' : '다시 돈다'}`);

    back(response, bot.id, verb === 'stop' ? '멈췄습니다.' : '다시 돕니다.');
    return;
  }

  if (verb === 'delete') {
    if (post) {
      await deleteBot(response, options, bot);
    } else {
      send(response, 200, deletePage(bot));
    }

    return;
  }

  send(response, 404, stopPage('없다', '<p>그런 자리가 없습니다.</p>', `/bots/${bot.id}`));
}

/** **임자의 것인지 본다** — id를 아는 것만으로 남의 봇을 만지지 못한다. */
async function ownBot(
  options: WebOptions, account: AccountRecord, id: string,
): Promise<BotRecord | undefined> {
  const bot = await options.store.bot(id);
  return bot?.accountId === account.id ? bot : undefined;
}

async function createBot(
  request: IncomingMessage, response: ServerResponse, options: WebOptions, account: AccountRecord,
): Promise<void> {
  const form = await readForm(request);
  const name = (form.get('name') ?? '').trim();
  const summary = (form.get('summary') ?? '').trim();
  const origin = cleanOrigin(form.get('origin') ?? '');

  // **적은 것을 돌려준다** — 한 칸이 틀렸다고 셋을 다시 적게 하지 않는다.
  if (name === '' || summary === '' || origin === undefined) {
    send(response, 400, newBotPage({ name, summary, origin: (form.get('origin') ?? '').trim() },
      '이름·소개·시에라 주소(https)가 있어야 합니다.'));
    return;
  }

  const mine = await options.store.botsOf(account.id);
  if (mine.length >= options.maxBotsPerAccount) {
    send(response, 400, noRoomPage(options.maxBotsPerAccount));
    return;
  }

  const bot: BotRecord = {
    id: randomUUID(),
    accountId: account.id,
    origin,
    declaration: { name, summary },
    settingsVersion: 1,
  };

  await options.store.saveBot(bot);
  options.log(`봇 ${bot.id}이(가) 섰다 — ${origin}`);

  redirect(response, `/bots/${bot.id}`);
}

/**
 * 선언을 고친다 — **바뀌었으면 판을 올린다**.
 *
 * 판이 그대로면 코어는 새 선언을 보지 않는다(`manifest.ts`의 `version`). 그래서 이름만 고치고
 * 판을 두면 *여기서는 고쳐졌는데 시에라에서는 옛 이름*인 봇이 선다.
 *
 * **붙은 시에라는 이은 뒤에 못 바꾼다** — 맡은 자격 증명이 그 시에라의 것이라, 주소만 갈면
 * 봇이 남의 집 열쇠를 들고 서 있게 된다.
 */
async function editDeclaration(
  request: IncomingMessage, response: ServerResponse, options: WebOptions, bot: BotRecord,
): Promise<void> {
  const form = await readForm(request);
  const name = (form.get('name') ?? '').trim();
  const summary = (form.get('summary') ?? '').trim();

  if (name === '' || summary === '') {
    back(response, bot.id, '이름과 소개가 있어야 합니다.');
    return;
  }

  let origin = bot.origin;
  if (!isConnected(bot)) {
    const asked = cleanOrigin(form.get('origin') ?? '');
    if (asked === undefined) {
      back(response, bot.id, '시에라 주소는 https여야 합니다.');
      return;
    }

    origin = asked;
  }

  const declaration = { ...bot.declaration, name, summary };
  const moved = declarationChanged(bot.declaration, declaration);

  if (!moved && origin === bot.origin) {
    back(response, bot.id, '바뀐 것이 없습니다.');
    return;
  }

  await options.store.saveBot({
    ...bot,
    origin,
    declaration,
    settingsVersion: moved ? bot.settingsVersion + 1 : bot.settingsVersion,
  });

  back(response, bot.id, moved && isConnected(bot)
    ? '고쳤습니다. 시에라에서 새 판을 승인해야 그쪽에 섭니다.'
    : '고쳤습니다.');
}

/**
 * **지운다 — 이 서비스의 것까지다**(2026-09-23 결정).
 *
 * 시에라의 봇 계정은 여기서 걷지 못한다. 코어의 걷기(`DELETE /api/v1/bots/{id}`)는 **그
 * 계정의 임자**만 부를 수 있고 이 서비스가 쥔 것은 봇 자신의 자격 증명이다 — 화면이 그
 * 사실을 누르기 전에 말한다(`deletePage`).
 *
 * **먼저 세우고 지운다.** 도는 러너를 둔 채 폴더를 지우면 그 바퀴가 커서를 다시 써 빈 봇
 * 폴더를 되살린다.
 */
async function deleteBot(
  response: ServerResponse, options: WebOptions, bot: BotRecord,
): Promise<void> {
  await options.store.saveBot({ ...bot, stopped: true });
  await options.fleet.sync();

  await options.store.forgetBot(bot.id);
  options.log(`봇 ${bot.id}을(를) 지웠다 — ${bot.origin}${
    bot.handle === undefined ? '' : ` @${bot.handle}`}`);

  redirect(response, `/?said=${encodeURIComponent(`${bot.declaration.name}을(를) 지웠습니다.`)}`);
}

async function renderBot(
  response: ServerResponse, options: WebOptions, bot: BotRecord, line?: string,
): Promise<void> {
  // 포크의 칸은 **이어진 뒤에만** 선다 — 그 전에는 시에라를 부를 수 없다.
  const panel = options.panel !== undefined && isConnected(bot)
    ? renderPanel(await options.panel.describe(bot, options.fleet.contextOf(bot)), bot.id)
    : '';

  send(response, 200, botPage({
    bot,
    declarationUrl: `${options.publicOrigin}/bots/${bot.id}/manifest.json`,
    panel,
    ...(line === undefined ? {} : { line }),
  }));
}

/**
 * 받은 자격 증명을 **한 번 두드려 보고** 봉한다.
 *
 * 사람의 다른 비밀과 달리 이것은 **봇이 서는 값**이라 첫 실패까지 미룰 수 없다 — 틀린 채로
 * 받아 두면 봇이 조용히 돌지 않고 임자는 왜인지 모른다.
 */
async function connectBot(
  request: IncomingMessage, response: ServerResponse, options: WebOptions, bot: BotRecord,
): Promise<void> {
  const form = await readForm(request);
  const clientId = (form.get('client_id') ?? '').trim();
  const clientSecret = (form.get('client_secret') ?? '').trim();

  if (clientId === '' || clientSecret === '') {
    back(response, bot.id, '둘 다 있어야 합니다.');
    return;
  }

  let handle: string;
  let sierraBotId: string;

  try {
    const me = await new SierraClient({ origin: bot.origin, clientId, clientSecret }).me();
    handle = me.handle;
    sierraBotId = me.id;
  } catch (error) {
    const why = error instanceof SierraError
      ? `시에라가 ${error.status}로 답했습니다${error.key === undefined ? '' : ` (${error.key})`}`
      : (error as Error).message;

    send(response, 400, stopPage('안 통했다', `
      <p>그 자격 증명으로는 ${escapeHtml(bot.origin)}에 닿지 못했습니다 — ${escapeHtml(why)}.</p>`,
      `/bots/${bot.id}`, '다시 맡기기'));
    return;
  }

  await options.store.saveBot({
    ...bot,
    clientId,
    sealedClientSecret: options.sealer.seal(clientSecret),
    handle,
    sierraBotId,
    connectedAt: new Date().toISOString(),
    stopped: false,
  });

  // **방금 이은 봇이 곧바로 돌아야 한다** — 여기서 부르지 않으면 다시 뜰 때까지 조용하다.
  await options.fleet.sync();
  options.log(`봇 ${bot.id}이(가) ${bot.origin}의 @${handle}로 이어졌다`);

  back(response, bot.id, `@${handle}로 이어졌습니다.`);
}

// ── 잡일 ──────────────────────────────────────────────────────────────────

/** 끝의 `/`를 떼고 https인지 본다 — **아니면 `undefined`**. */
function cleanOrigin(raw: string): string | undefined {
  const origin = raw.trim().replace(/\/+$/, '');
  return /^https:\/\/[^\s/]+$/.test(origin) ? origin : undefined;
}

/** 봇 화면으로 돌려보낸다 — **한 말은 주소에 싣고 새로고침에는 남기지 않는다**. */
function back(response: ServerResponse, botId: string, line?: string): void {
  redirect(response, line === undefined
    ? `/bots/${botId}`
    : `/bots/${botId}?said=${encodeURIComponent(line)}`);
}

function cookie(request: IncomingMessage): string | undefined {
  const raw = request.headers.cookie;
  if (raw === undefined) {
    return undefined;
  }

  for (const part of raw.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE) {
      return rest.join('=');
    }
  }

  return undefined;
}

async function readForm(request: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    // 폼은 짧다 — 남의 브라우저가 우리 메모리를 정하게 두지 않는다.
    if (size > 64 * 1024) {
      throw new Error('폼이 너무 큽니다');
    }

    chunks.push(chunk as Buffer);
  }

  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

function redirect(response: ServerResponse, location: string): void {
  response.writeHead(302, { location }).end();
}

function send(response: ServerResponse, status: number, html: string): void {
  response.writeHead(status, { 'content-type': 'text/html; charset=utf-8' }).end(html);
}
