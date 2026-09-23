import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { GithubApp } from './auth.js';
import { authorizeUrl, exchange, welcome } from './auth.js';
import type { Sealer } from './crypto.js';
import { manifestOf } from './manifest.js';
import { renderPanel, type BotPanel } from './panel.js';
import type { Fleet } from './runner.js';
import { SierraClient, SierraError } from './sierra.js';
import type { AccountRecord, BotRecord, FileStore } from './state.js';
import { isConnected } from './state.js';
import { escapeHtml } from './text.js';
import { Tickets } from './tickets.js';

/**
 * 사람이 브라우저로 닿는 자리.
 *
 * **스크립트가 없다.** 여는 일은 마크업이 맡고 폼이 전부다 — 봇 서버의 화면이라 프레임워크를
 * 들이지 않는다. 공개 지식(`manifest.json`)과 임자의 자리(`/bots/...`)가 한 서버에 있고,
 * **문지기는 쿠키 하나**다.
 *
 * ```
 * GET  /healthz
 * GET  /                         봇 목록(로그인했으면) · 들어오는 문(아니면)
 * GET  /auth/github              GitHub으로 보낸다
 * GET  /auth/github/callback     돌아온다
 * POST /auth/logout
 * POST /bots                     봇을 만든다
 * GET  /bots/{id}                봇 하나 — 선언 주소와 자격 증명
 * POST /bots/{id}/credentials    시에라에서 받은 client_id·secret을 붙인다
 * GET  /bots/{id}/manifest.json  **공개** — 코어가 읽는다
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
      send(response, 200, page('봇을 세운다', `
        <p>시에라에 붙는 봇을 만들고 잇는 자리입니다.</p>
        <p><a class="button" href="/auth/github">GitHub으로 들어가기</a></p>`));
      return;
    }

    redirect(response, '/');
    return;
  }

  if (path === '/' && request.method === 'GET') {
    await renderHome(response, options, account);
    return;
  }

  if (path === '/bots' && request.method === 'POST') {
    await createBot(request, response, options, account);
    return;
  }

  const one = /^\/bots\/([0-9a-fA-F-]{36})$/.exec(path);
  const credentials = /^\/bots\/([0-9a-fA-F-]{36})\/credentials$/.exec(path);
  const extra = /^\/bots\/([0-9a-fA-F-]{36})\/x\/([A-Za-z0-9_-]{1,40})$/.exec(path);

  if (one !== null) {
    const bot = await ownBot(options, account, one[1] ?? '');
    if (bot === undefined) {
      send(response, 404, page('없다', '<p>그런 봇이 없습니다.</p>'));
      return;
    }

    await renderBot(response, options, bot, url.searchParams.get('said') ?? undefined);
    return;
  }

  // **포크의 칸** — 경로는 템플릿이 쥐고 이름은 포크가 정한다.
  if (extra !== null && request.method === 'POST') {
    const bot = await ownBot(options, account, extra[1] ?? '');
    if (bot === undefined || options.panel === undefined) {
      send(response, 404, page('없다', '<p>그런 자리가 없습니다.</p>'));
      return;
    }

    const what = extra[2] ?? '';
    const ctx = options.fleet.contextOf(bot);
    let said: string | undefined;

    try {
      said = what === 'settings'
        ? await options.panel.save?.(await readForm(request), bot, ctx)
        : await options.panel.act?.(what, bot, ctx);
    } catch (error) {
      send(response, 400, page('안 됐다', `
        <p>${escapeHtml((error as Error).message)}</p>
        <p><a href="/bots/${bot.id}">돌아가기</a></p>`));
      return;
    }

    // **한 말은 한 번만 보인다** — 주소에 실어 보내고 새로고침에는 남지 않게 한다.
    redirect(response, said === undefined
      ? `/bots/${bot.id}`
      : `/bots/${bot.id}?said=${encodeURIComponent(said)}`);
    return;
  }

  if (credentials !== null && request.method === 'POST') {
    const bot = await ownBot(options, account, credentials[1] ?? '');
    if (bot === undefined) {
      send(response, 404, page('없다', '<p>그런 봇이 없습니다.</p>'));
      return;
    }

    await connectBot(request, response, options, bot);
    return;
  }

  send(response, 404, page('없다', '<p>그런 자리가 없습니다.</p>'));
}

/** **임자의 것인지 본다** — id를 아는 것만으로 남의 봇을 만지지 못한다. */
async function ownBot(
  options: WebOptions, account: AccountRecord, id: string,
): Promise<BotRecord | undefined> {
  const bot = await options.store.bot(id);
  return bot?.accountId === account.id ? bot : undefined;
}

async function renderHome(
  response: ServerResponse, options: WebOptions, account: AccountRecord,
): Promise<void> {
  const bots = await options.store.botsOf(account.id);

  const rows = bots.length === 0
    ? '<p>아직 봇이 없습니다.</p>'
    : `<ul>${bots.map((bot) => `<li><a href="/bots/${bot.id}">${escapeHtml(bot.declaration.name)}</a>
        — ${escapeHtml(bot.origin)} ·
        ${isConnected(bot) ? (bot.stopped === true ? '멈춰 있다' : '돈다') : '<b>아직 잇지 않았다</b>'}</li>`).join('')}</ul>`;

  const room = bots.length < options.maxBotsPerAccount;

  send(response, 200, page(`${escapeHtml(account.login)}의 봇`, `
    ${rows}
    <hr>
    ${room ? `
    <h2>봇 만들기</h2>
    <form method="post" action="/bots">
      <p><label>이름 <input name="name" required maxlength="60"></label></p>
      <p><label>소개 <input name="summary" required maxlength="200"></label></p>
      <p><label>붙을 시에라 <input name="origin" required type="url" placeholder="https://..."></label></p>
      <p><button class="button" type="submit">만든다</button></p>
    </form>`
    : `<p>봇은 ${options.maxBotsPerAccount}개까지입니다. 시에라 쪽 한도(<code>bot.max_per_user</code>)에
       맞춘 수라, 늘리려면 그 시에라의 관리자가 먼저 늘려야 합니다.</p>`}
    <form method="post" action="/auth/logout"><button type="submit">나가기</button></form>`));
}

async function createBot(
  request: IncomingMessage, response: ServerResponse, options: WebOptions, account: AccountRecord,
): Promise<void> {
  const form = await readForm(request);
  const name = (form.get('name') ?? '').trim();
  const summary = (form.get('summary') ?? '').trim();
  const origin = (form.get('origin') ?? '').trim().replace(/\/+$/, '');

  if (name === '' || summary === '' || !/^https:\/\/[^\s/]+/.test(origin)) {
    send(response, 400, page('다시', '<p>이름·소개·시에라 주소(https)가 있어야 합니다. <a href="/">돌아가기</a></p>'));
    return;
  }

  const mine = await options.store.botsOf(account.id);
  if (mine.length >= options.maxBotsPerAccount) {
    send(response, 400, page('한도', '<p>봇 수가 한도에 닿았습니다. <a href="/">돌아가기</a></p>'));
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
  redirect(response, `/bots/${bot.id}`);
}

async function renderBot(
  response: ServerResponse, options: WebOptions, bot: BotRecord, said?: string,
): Promise<void> {
  const declaration = `${options.publicOrigin}/bots/${bot.id}/manifest.json`;

  // 포크의 칸은 **이어진 뒤에만** 선다 — 그 전에는 시에라를 부를 수 없다.
  const panel = options.panel !== undefined && isConnected(bot)
    ? renderPanel(await options.panel.describe(bot, options.fleet.contextOf(bot)), bot.id)
    : '';

  send(response, 200, page(escapeHtml(bot.declaration.name), `
    ${said === undefined ? '' : `<p class="said">${escapeHtml(said)}</p>`}
    <p>${escapeHtml(bot.declaration.summary)}</p>
    <h2>1. 이 주소를 시에라에 붙인다</h2>
    <p><code>${escapeHtml(declaration)}</code></p>
    <p><b>${escapeHtml(bot.origin)}</b>에 그 시에라의 계정으로 들어가 <b>봇 설치</b>에 위 주소를
       붙이면 봇 계정이 서고 <code>client_id</code>와 <code>client_secret</code>이 나옵니다.
       <b>비밀은 그때 한 번만 보이지만, 잃으면 다시 낼 수 있습니다.</b></p>
    <h2>2. 받은 것을 여기 맡긴다</h2>
    ${isConnected(bot)
      ? `<p>이어져 있습니다 — <code>${escapeHtml(bot.handle ?? '')}</code>.
         다시 맡기면 옛것을 덮습니다.</p>`
      : '<p>아직 잇지 않았습니다.</p>'}
    <form method="post" action="/bots/${bot.id}/credentials">
      <p><label>client_id <input name="client_id" required></label></p>
      <p><label>client_secret <input name="client_secret" type="password" required></label></p>
      <p><button class="button" type="submit">맡긴다</button></p>
    </form>
    ${panel}
    <p><a href="/">돌아가기</a></p>`));
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
    send(response, 400, page('다시', `<p>둘 다 있어야 합니다. <a href="/bots/${bot.id}">돌아가기</a></p>`));
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

    send(response, 400, page('안 통했다', `
      <p>그 자격 증명으로는 ${escapeHtml(bot.origin)}에 닿지 못했습니다 — ${escapeHtml(why)}.</p>
      <p><a href="/bots/${bot.id}">다시 맡기기</a></p>`));
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

  redirect(response, `/bots/${bot.id}`);
}

// ── 잡일 ──────────────────────────────────────────────────────────────────

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

/** 옷은 한 벌뿐이다 — 봇의 페이지라 하멜 스킨 밖이다. */
function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  body { max-width: 34rem; margin: 3rem auto; padding: 0 1rem;
         font: 1rem/1.7 system-ui, sans-serif; color: #1a1a1a; background: #fff; }
  code { background: #f2f2f2; padding: .1rem .3rem; border-radius: .2rem; word-break: break-all; }
  input, select { width: 100%; padding: .4rem; font: inherit; }
  label { display: block; }
  small { display: block; color: #666; margin-top: .2rem; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: .3rem 1rem; margin: 1rem 0; }
  dt { color: #666; } dd { margin: 0; }
  form + form { margin-top: .5rem; }
  .button, button { padding: .5rem 1rem; font: inherit; cursor: pointer;
                    border: 1px solid #1a1a1a; border-radius: .3rem;
                    background: #1a1a1a; color: #fff; text-decoration: none; display: inline-block; }
  form button:not(.button) { background: #fff; color: #1a1a1a; }
  hr { border: 0; border-top: 1px solid #ddd; margin: 2rem 0; }
  .said { padding: .6rem .8rem; border-left: 3px solid #1a1a1a; background: #f2f2f2; }
  /* **되돌릴 수 없는 것은 가로줄 아래에 선다** — 누르면 공개 글이 나가는 자리다. */
  .grave { border-top: 1px solid #ddd; margin-top: 1.5rem; padding-top: 1rem; }
  @media (prefers-color-scheme: dark) {
    body { color: #e8e8e8; background: #161616; }
    code { background: #2a2a2a; }
    .said { border-left-color: #e8e8e8; background: #2a2a2a; }
    .grave { border-top-color: #333; }
    small, dt { color: #9a9a9a; }
    .button, button { background: #e8e8e8; color: #161616; border-color: #e8e8e8; }
    form button:not(.button) { background: #161616; color: #e8e8e8; }
  }
</style></head><body><h1>${title}</h1>${body}</body></html>`;
}
