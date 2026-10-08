import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { GithubApp } from './auth.js';
import { authorizeUrl, exchange, welcome } from './auth.js';
import type { Sealer } from './crypto.js';
import type { BotIntake, ConnectTicket } from './intake.js';
import { renderIntake } from './intake.js';
import type { BotCommand } from './commands.js';
import { declarationChanged, manifestOf, type BotGates } from './manifest.js';
import type { BotTab } from './pages.js';
import {
  advancedTab, authTab, deletePage, featuresTab, guestPage, homePage, landingPage, newBotPage,
  noRoomPage, profileTab, stopPage,
} from './pages.js';
import { fillHidden, renderPanel, type BotPanel } from './panel.js';
import type { Fleet } from './runner.js';
import { SierraClient, SierraError } from './sierra.js';
import type { AccountRecord, BotDeclaration, BotRecord, FileStore, ImageKind } from './state.js';
import { FIELD_MAX, FIELDS_MAX, isConnected } from './state.js';
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
 * **봇 하나의 자리도 넷으로 갈린다 — 탭이 곧 주소다**(`pages.ts`).
 *
 * ```
 * GET  /healthz
 * GET  /                         **첫 화면** — 이 서비스가 무엇인가(`ABOUT.md`)
 * GET  /bots                     **내 봇들** — 로그인한 사람의 자리
 * GET  /auth/github              GitHub으로 보낸다
 * GET  /auth/github/callback     돌아온다
 * POST /auth/logout
 * GET  /bots/new                 봇 만들기 폼
 * POST /bots                     봇을 만든다
 * GET  /bots/{id}                **등록정보** — 이름·소개·초상화·배경
 * GET  /bots/{id}/features       **기능** — 그 봇 고유의 것(봇의 칸)
 * GET  /bots/{id}/auth           **인증** — 선언 주소와 자격 증명
 * GET  /bots/{id}/advanced       **고급** — 멈춤과 지우기
 * POST /bots/{id}/credentials    시에라에서 받은 client_id·secret을 붙인다
 * POST /bots/{id}/declaration    등록정보를 고친다 — **선언의 판이 오른다**
 * POST /bots/{id}/stop           폴링을 쉰다 · POST /bots/{id}/start 다시 돌린다
 * GET  /bots/{id}/delete         지우기 전에 한 번 보인다
 * POST /bots/{id}/delete         **지운다** — 이 서비스의 것까지다
 * GET  /bots/{id}/manifest.json  **공개** — 코어가 읽는다
 * GET  /bots/{id}/images/{kind}/{hash}  **공개** — 올린 초상화·배경(선언이 가리킨다, 2026-10-08)
 * GET  /connect/{티켓}            **말 거는 사람의 자리** — 봇에게 무언가를 맡긴다
 * POST /connect/{티켓}            맡는다 — **티켓은 여기서 탄다**
 * POST /bots/{id}/x/{무엇}       봇의 칸
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

  /** 이 봇이 알아듣는 명령 — 선언에 실린다. 없으면 그 칸이 빠진다(2026-09-29 요구). */
  readonly commands?: readonly BotCommand[];

  /** 봇의 문 — 선언에 실어 코어가 거른다(코어 M61). 봇마다 다르다. */
  readonly gates?: (bot: BotRecord, store: FileStore) => Promise<BotGates | undefined>;

  /** 화면의 제목줄에 서는 이름 — *아무개의 **에코***. */
  readonly serviceName: string;
  /** 첫 화면의 본문 — 그 봇의 `ABOUT.md`를 그린 것. 없으면 빈 문자열이다. */
  readonly about: string;
  /** 봇이 봇 화면에 더하는 칸 — 없으면 라이브러리의 것만 선다. */
  readonly panel?: BotPanel;
  /** 말 거는 사람이 무언가를 맡기는 자리 — 없으면 `/connect`가 404다. */
  readonly intake?: BotIntake;
  /** 연결 링크의 표 — **봇이 내고 여기가 받는다**. `service.ts`가 둘에 같은 것을 준다. */
  readonly tickets: Tickets<ConnectTicket>;
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
  if (declared !== null && request.method === 'GET') {
    const bot = await options.store.bot(declared[1] ?? '');
    if (bot === undefined) {
      send(response, 404, '<p>그런 봇이 없습니다.</p>');
      return;
    }

    const gates = await options.gates?.(bot, options.store);
    const body = JSON.stringify(
      manifestOf(bot, options.codeVersion, options.scopes, options.commands, gates), null, 2);
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' }).end(body);
    return;
  }

  /*
   * **올린 그림** — 선언이 이 주소를 가리키고 코어가 승인할 때 한 번 받아 간다(2026-10-08). 주소의
   * 끝이 내용 해시라 오래 담는다 — **지금 것과 다르면 404**다(옛 주소가 다른 그림을 내지 않는다).
   */
  const imaged = /^\/bots\/([0-9a-fA-F-]{36})\/images\/(avatar|header)\/([0-9a-f]{32})$/.exec(path);
  if (imaged !== null && request.method === 'GET') {
    const image = await options.store.image(imaged[1] ?? '', imaged[2] as ImageKind).catch(() => undefined);
    if (image === undefined || image.hash !== imaged[3]) {
      send(response, 404, '<p>그런 그림이 없습니다.</p>');
      return;
    }

    response.writeHead(200, {
      'content-type': image.mime,
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    }).end(image.bytes);
    return;
  }

  /*
   * ── **말 거는 사람의 자리** ───────────────────────────────────────────────
   *
   * **로그인 앞에 선다.** 여기 오는 사람은 이 서비스의 계정이 없고, 가진 것은 봇이 메시지로
   * 보낸 링크 하나다 — 그 티켓이 곧 신원이라 쿠키를 묻지 않는다(`intake.ts`).
   */
  const linked = /^\/connect\/([A-Za-z0-9_-]{8,128})$/.exec(path);
  if (linked !== null && (request.method === 'GET' || request.method === 'POST')) {
    await intakeRoute(request, response, options, linked[1] ?? '');
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

    // **들어오면 자기 봇들로 간다** — 소개는 방금 지나왔다.
    response.writeHead(302, {
      location: '/bots',
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

  /*
   * **첫 화면은 누구에게나 열린다** — 들어온 사람에게도 이 자리는 이 자리다(2026-09-23 요구).
   * 바뀌는 것은 제목줄과, 목록으로 가는 단추 하나뿐이다.
   */
  if (path === '/' && request.method === 'GET') {
    send(response, 200, landingPage(options.serviceName, options.about, account));
    return;
  }

  if (account === undefined) {
    redirect(response, '/');
    return;
  }

  const spoken = url.searchParams.get('said') ?? undefined;

  if (path === '/bots' && request.method === 'GET') {
    const bots = await options.store.botsOf(account.id);
    send(response, 200,
      homePage(options.serviceName, account, bots, options.maxBotsPerAccount, spoken));
    return;
  }

  // **짓는 자리는 따로 선다** — 목록이 만들기 폼을 지고 다니지 않는다.
  if (path === '/bots/new' && request.method === 'GET') {
    const mine = await options.store.botsOf(account.id);
    send(response, 200, mine.length >= options.maxBotsPerAccount
      ? noRoomPage(options.maxBotsPerAccount)
      : newBotPage(options.serviceName, account));
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
      send(response, 404, stopPage('없다', '<p>그런 봇이 없습니다.</p>', '/bots', '내 봇들'));
      return;
    }

    await renderTab(response, options, bot, 'profile', spoken);
    return;
  }

  // **봇의 칸** — 경로는 라이브러리가 쥐고 이름은 봇이 정한다.
  if (extra !== null && request.method === 'POST') {
    const bot = await ownBot(options, account, extra[1] ?? '');
    if (bot === undefined || options.panel === undefined) {
      send(response, 404, stopPage('없다', '<p>그런 자리가 없습니다.</p>', '/bots', '내 봇들'));
      return;
    }

    const name = extra[2] ?? '';
    const ctx = options.fleet.contextOf(bot);
    const form = await readForm(request);
    // **폼을 낸 장으로 돌아간다**(서브탭) — 첫 장으로 떨어지면 저장이 됐나를 다시 찾게 된다.
    const tabName = form.get('_tab') ?? undefined;
    const anchor = form.get('_at') ?? undefined;
    let line: string | undefined;

    try {
      if (name === 'settings') {
        // **폼에는 그 묶음의 칸만 온다** — 나머지는 지금 값으로 채운다(`panel.ts`의 `grouped`).
        const filled = fillHidden(await options.panel.describe(bot, ctx), form);
        line = await options.panel.save?.(filled, bot, ctx);
      } else if (name === 'list') {
        // **목록의 폼** — 어느 목록의 어느 항목에 무엇을 하는가가 칸으로 온다(`panel.ts`의 `BotList`).
        const op = form.get('op');
        if (op !== 'add' && op !== 'edit' && op !== 'remove') {
          throw new Error('목록에 할 일이 이상하다.');
        }
        line = await options.panel.list?.(op, form.get('list') ?? '', form.get('key') ?? '', form, bot, ctx);
      } else {
        line = await options.panel.act?.(name, bot, ctx);
      }
    } catch (error) {
      send(response, 400, stopPage('안 됐다',
        `<p>${escapeHtml((error as Error).message)}</p>`, `/bots/${bot.id}/features${subQuery(tabName)}`));
      return;
    }

    /*
     * **설정을 고쳤으면 코어가 선언을 다시 읽게 한다**(코어 M61 확정 4). 문구나 태그만 바뀌었으면
     * 승인 없이 서고, 문의 그룹이 바뀌었으면 시에라 임자의 승인을 기다린다 — 그 사실을 함께 말한다.
     * **못 불러도 저장은 섰다** — 봇이 붙지 않은 상태이거나 코어가 이 문을 모르는 판일 수 있다.
     */
    if (name === 'settings' && bot.sealedClientSecret !== undefined) {
      try {
        const refreshed = await ctx.sierra.refreshManifest();
        if (!refreshed.applied) {
          line = `${line ?? '저장했다'} — 문의 그룹이 바뀌어 시에라 임자의 새 판 승인을 기다린다`;
        }
        if (refreshed.noticed === true) {
          line = `${line ?? '저장했다'} — 시에라 임자에게 새 판을 알렸다`;
        }
      } catch (error) {
        options.log(`[${bot.handle ?? bot.id}] 선언을 다시 읽히지 못했다: ${(error as Error).message}`);
      }
    }

    // **한 말은 한 번만 보인다** — 주소에 실어 보내고 새로고침에는 남지 않게 한다.
    back(response, bot.id, 'features', line, tabName, anchor);
    return;
  }

  if (what !== null) {
    const bot = await ownBot(options, account, what[1] ?? '');
    if (bot === undefined) {
      send(response, 404, stopPage('없다', '<p>그런 봇이 없습니다.</p>', '/bots', '내 봇들'));
      return;
    }

    await botAction(request, response, options, bot, what[2] ?? '');
    return;
  }

  send(response, 404, stopPage('없다', '<p>그런 자리가 없습니다.</p>', '/bots', '내 봇들'));
}

/**
 * **맡기러 온 사람** — 폼을 그리고, 받는다.
 *
 * **티켓은 성공했을 때만 탄다.** 한 번 잘못 붙였다고 링크를 다시 받게 하면, 그 사람은 봇에게
 * 다시 말을 걸어야 하고 공개 쓰레드에 같은 말이 한 번 더 선다.
 *
 * **지난 링크와 없는 링크를 가르지 않는다** — 둘 다 *다시 말을 걸어 달라*로 끝난다. 가르면
 * 남의 티켓을 두드려 *있다/없다*를 읽을 수 있다.
 */
async function intakeRoute(
  request: IncomingMessage, response: ServerResponse, options: WebOptions, token: string,
): Promise<void> {
  const ticket = options.tickets.peek(token);
  const bot = ticket === undefined ? undefined : await options.store.bot(ticket.botId);

  if (ticket === undefined || bot === undefined || options.intake === undefined) {
    send(response, 404, guestPage('연결', '지난 링크입니다', `
      <p>이 링크는 15분만 삽니다. 봇에게 다시 말을 걸면 새 링크를 보냅니다.</p>`));
    return;
  }

  const who = { id: ticket.userId, handle: ticket.handle };
  const ctx = options.fleet.contextOf(bot);

  if (request.method === 'POST') {
    let line: string;

    try {
      line = await options.intake.save(await readForm(request), who, bot, ctx);
    } catch (error) {
      // **티켓은 산다** — 적은 것이 틀렸다고 링크까지 죽이지 않는다.
      const again = await options.intake.describe(who, bot, ctx);
      send(response, 400, guestPage(bot.declaration.name, again.title,
        renderIntake(again, token), (error as Error).message));
      return;
    }

    options.tickets.take(token);
    options.log(`봇 ${bot.id}에 @${who.handle}이(가) 맡겼다`);

    send(response, 200, guestPage(bot.declaration.name, '맡았습니다', `
      <p>${escapeHtml(line)}</p>
      <p>이제 ${escapeHtml(bot.handle === undefined ? bot.declaration.name : `@${bot.handle}`)}에게
         다시 말을 걸면 됩니다. 이 링크는 여기서 끝납니다.</p>`));
    return;
  }

  const view = await options.intake.describe(who, bot, ctx);
  send(response, 200, guestPage(bot.declaration.name, view.title, renderIntake(view, token)));
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

  // **탭은 GET이다** — 각자 주소를 가진 네 장이라 새로고침해도 그 자리다.
  if (!post && (verb === 'features' || verb === 'auth' || verb === 'advanced')) {
    await renderTab(response, options, bot, verb, said(request), sub(request));
    return;
  }

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

    back(response, bot.id, 'advanced', verb === 'stop' ? '멈췄습니다.' : '다시 돕니다.');
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

/** 주소에 실려 온 한 마디 — 탭을 옮겨도 같은 자리에서 읽는다. */
/** 기능 탭의 서브탭 — `?sub=이름`. */
function sub(request: IncomingMessage): string | undefined {
  return new URL(request.url ?? '/', 'http://x').searchParams.get('sub') ?? undefined;
}

function said(request: IncomingMessage): string | undefined {
  return new URL(request.url ?? '/', 'http://x').searchParams.get('said') ?? undefined;
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
    send(response, 400, newBotPage(options.serviceName, account,
      { name, summary, origin: (form.get('origin') ?? '').trim() },
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

  // **만든 직후에 급한 것은 잇는 일이다** — 등록정보는 이미 적었다.
  redirect(response, `/bots/${bot.id}/auth`);
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
  let form: FormData;
  try {
    form = await readMultipart(request, IMAGE_FORM_MAX);
  } catch (error) {
    back(response, bot.id, 'profile', (error as Error).message);
    return;
  }

  const name = String(form.get('name') ?? '').trim();
  const summary = String(form.get('summary') ?? '').trim();

  if (name === '' || summary === '') {
    back(response, bot.id, 'profile', '이름과 소개가 있어야 합니다.');
    return;
  }

  /*
   * **그림은 주소가 아니라 파일이다**(2026-10-08 요구). 올린 것을 맡고 **버전 있는 우리 주소**를 선언에
   * 싣는다 — 코어의 계약(선언의 `avatar`·`header`는 주소)은 그대로다. 지우기가 올리기보다 앞이고,
   * 둘 다 없으면 지금 것을 둔다(옛 판에서 주소로 적어 둔 것도).
   */
  const pictures: Partial<Record<ImageKind, string>> = {};
  for (const kind of ['avatar', 'header'] as const) {
    const kept = bot.declaration[kind];

    if (form.get(`clear_${kind}`) !== null) {
      await options.store.forgetImage(bot.id, kind);
      continue;
    }

    const file = form.get(kind);
    if (file instanceof File && file.size > 0) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const mime = imageMime(bytes);
      if (mime === undefined) {
        back(response, bot.id, 'profile', '초상화와 배경은 png·jpg·gif·webp 파일이어야 합니다.');
        return;
      }
      if (bytes.byteLength > IMAGE_MAX) {
        back(response, bot.id, 'profile', `그림은 ${String(IMAGE_MAX / 1024 / 1024)}MB까지입니다.`);
        return;
      }

      const hash = await options.store.saveImage(bot.id, kind, bytes, mime);
      pictures[kind] = `${options.publicOrigin}/bots/${bot.id}/images/${kind}/${hash}`;
      continue;
    }

    if (kept !== undefined) {
      pictures[kind] = kept;
    }
  }

  const { avatar, header } = pictures;

  /*
   * **커스텀 필드**(2026-10-08) — 이름이 빈 줄은 버린다(시에라와 같은 규칙). **한 번도 적지 않은 봇은 필드를 싣지
   * 않는다** — 빈 목록을 실으면 시에라에서 적어 둔 필드가 승인과 함께 지워진다.
   */
  const names = form.getAll('field_name').map((one) => String(one).trim());
  const values = form.getAll('field_value').map((one) => String(one).trim());
  const rows = names
    .map((fieldName, at) => ({ name: fieldName, value: values[at] ?? '' }))
    .filter((one) => one.name !== '');

  if (rows.length > FIELDS_MAX) {
    back(response, bot.id, 'profile', `커스텀 필드는 ${String(FIELDS_MAX)}줄까지입니다.`);
    return;
  }
  if (rows.some((one) => one.name.length > FIELD_MAX || one.value.length > FIELD_MAX)) {
    back(response, bot.id, 'profile', `커스텀 필드의 이름과 값은 ${String(FIELD_MAX)}자까지입니다.`);
    return;
  }

  const fields = rows.length === 0 && bot.declaration.fields === undefined ? undefined : rows;

  let origin = bot.origin;
  if (!isConnected(bot)) {
    const asked = cleanOrigin(String(form.get('origin') ?? ''));
    if (asked === undefined) {
      back(response, bot.id, 'profile', '시에라 주소는 https여야 합니다.');
      return;
    }

    origin = asked;
  }

  const declaration: BotDeclaration = {
    name,
    summary,
    ...(avatar === undefined ? {} : { avatar }),
    ...(header === undefined ? {} : { header }),
    ...(fields === undefined ? {} : { fields }),
  };

  const moved = declarationChanged(bot.declaration, declaration);

  if (!moved && origin === bot.origin) {
    back(response, bot.id, 'profile', '바뀐 것이 없습니다.');
    return;
  }

  const saved = { ...bot, origin, declaration, settingsVersion: moved ? bot.settingsVersion + 1 : bot.settingsVersion };
  await options.store.saveBot(saved);

  /*
   * **판이 올랐으면 코어가 선언을 다시 읽게 한다**(2026-10-09) — 코어가 기다리는 판을 시에라 임자에게 알린다(한 판에 한 번).
   * 못 불러도 저장은 섰다 — 옛 코어이거나 시에라가 잠깐 닿지 않을 수 있다.
   */
  let noticed = false;
  if (moved && isConnected(bot) && bot.sealedClientSecret !== undefined) {
    try {
      noticed = (await options.fleet.contextOf(saved).sierra.refreshManifest()).noticed === true;
    } catch (error) {
      options.log(`[${bot.handle ?? bot.id}] 선언을 다시 읽히지 못했다: ${(error as Error).message}`);
    }
  }

  back(response, bot.id, 'profile', moved && isConnected(bot)
    ? `고쳤습니다. 시에라에서 새 판을 승인해야 그쪽에 섭니다${noticed ? ' — 임자에게 알렸습니다.' : '.'}`
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

  redirect(response,
    `/bots?said=${encodeURIComponent(`${bot.declaration.name}을(를) 지웠습니다.`)}`);
}

/** 탭 하나를 그린다 — **어느 장인지는 주소가 정하고, 머리와 탭 줄은 `pages.ts`가 진다.** */
async function renderTab(
  response: ServerResponse, options: WebOptions, bot: BotRecord, tab: BotTab, line?: string, subTab?: string,
): Promise<void> {
  if (tab === 'profile') {
    send(response, 200, profileTab(bot, line));
    return;
  }

  if (tab === 'auth') {
    send(response, 200, authTab(bot, `${options.publicOrigin}/bots/${bot.id}/manifest.json`, line));
    return;
  }

  if (tab === 'advanced') {
    send(response, 200, advancedTab(bot, line));
    return;
  }

  // 봇의 칸은 **이어진 뒤에만** 선다 — 그 전에는 시에라를 부를 수 없다.
  const panel = options.panel !== undefined && isConnected(bot)
    ? renderPanel(await options.panel.describe(bot, options.fleet.contextOf(bot)), bot.id, subTab)
    : '';

  send(response, 200, featuresTab(bot, panel, line));
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
    back(response, bot.id, 'auth', '둘 다 있어야 합니다.');
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

  back(response, bot.id, 'auth', `@${handle}로 이어졌습니다.`);
}

// ── 잡일 ──────────────────────────────────────────────────────────────────

/**
 * 그림의 주소 — 비었으면 `undefined`, 아니면 `http(s)`여야 하고 **틀리면 `false`**.
 *
 * **코어가 한 번 닿을 수 있는 공개 주소여야 한다.** 코어는 이 주소를 받아 자기 것으로 만들고
 * (`ApplyManifestAsync`), 못 받아도 봇은 선다 — 기본 얼굴이 서고 임자가 나중에 올린다.
 */

/** 그림 하나의 상한 — 시에라의 `profile.image_max_size_bytes` 기본과 같다. 넘는 것은 코어도 받지 않는다. */
const IMAGE_MAX = 10 * 1024 * 1024;

/** 등록정보 폼의 상한 — 그림 둘과 글자 몇 줄. */
const IMAGE_FORM_MAX = 2 * IMAGE_MAX + 64 * 1024;

/** **내용이 형식을 말한다** — 브라우저가 적어 보낸 형식을 믿지 않는다(코어와 같은 규칙). */
function imageMime(bytes: Uint8Array): string | undefined {
  const at = (offset: number, ...want: number[]): boolean => want.every((one, index) => bytes[offset + index] === one);

  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return 'image/png';
  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp';

  return undefined;
}

/**
 * 파일이 실린 폼을 읽는다 — **Node 안의 `Request.formData()`가 가른다**(의존을 들이지 않는다).
 * 상한을 넘으면 읽기를 멈추고 던진다 — 남의 브라우저가 우리 메모리를 정하게 두지 않는다.
 */
async function readMultipart(request: IncomingMessage, max: number): Promise<FormData> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > max) {
      throw new Error(`올린 것이 너무 큽니다 — 그림은 하나에 ${String(IMAGE_MAX / 1024 / 1024)}MB까지입니다.`);
    }
    chunks.push(chunk as Buffer);
  }

  const type = request.headers['content-type'] ?? 'application/x-www-form-urlencoded';
  return await new Request('http://form.invalid/', { method: 'POST', headers: { 'content-type': type }, body: Buffer.concat(chunks) })
    .formData();
}

/** 끝의 `/`를 떼고 https인지 본다 — **아니면 `undefined`**. */
function cleanOrigin(raw: string): string | undefined {
  const origin = raw.trim().replace(/\/+$/, '');
  return /^https:\/\/[^\s/]+$/.test(origin) ? origin : undefined;
}

/**
 * **온 탭으로 돌려보낸다** — 한 말은 주소에 싣고 새로고침에는 남기지 않는다.
 *
 * 폼을 낸 탭이 아니라 첫 장으로 떨어지면 사람이 *저장이 됐나*를 두 번 확인하게 된다.
 */
function back(
  response: ServerResponse, botId: string, tab: BotTab, line?: string, subTab?: string, anchor?: string,
): void {
  const at = `/bots/${botId}${tab === 'profile' ? '' : `/${tab}`}`;
  const query = new URLSearchParams();
  if (subTab !== undefined) {
    query.set('sub', subTab);
  }
  if (line !== undefined) {
    query.set('said', line);
  }
  // **누른 자리로 돌아온다** — 장의 맨 위로 떨어지면 아래에서 누른 손이 제 자리를 다시 찾는다.
  const hash = anchor !== undefined && /^[A-Za-z0-9_-]{1,80}$/.test(anchor) ? `#${anchor}` : '';
  redirect(response, `${query.size === 0 ? at : `${at}?${query.toString()}`}${hash}`);
}

function subQuery(subTab: string | undefined): string {
  return subTab === undefined ? '' : `?sub=${encodeURIComponent(subTab)}`;
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
