import type { AccountRecord, BotRecord } from './state.js';
import { isConnected } from './state.js';
import { escapeHtml } from './text.js';

/**
 * 사람이 보는 그림 — **여기만 HTML을 쓴다**.
 *
 * `web.ts`는 문을 열고 폼을 받는 자리이고, 그림은 이 파일과 `panel.ts`(포크의 칸)에 있다.
 * 가른 까닭은 **한 화면이 한 가지 일만 하게 하려는 것**이다 — 목록과 만들기가 한 장에 서면
 * 봇이 셋일 때 만들기 폼이 목록을 밀어내고, 봇이 없을 때는 목록 자리가 비어 선다.
 *
 * **봇 하나의 화면은 다시 넷으로 갈린다 — 주소가 탭이다**(2026-09-23 요구). 스크립트로
 * 감추고 보이는 탭이 아니라 각자 주소를 가진 네 장이다: 새로고침해도 그 자리이고, 링크로
 * 가리킬 수 있고, **스크립트가 죽어도 선다**(모체 `CLAUDE.md`의 펼침메뉴 규칙과 같은 정신).
 *
 * ```
 * /                     내 봇들            — 고르는 자리
 * /bots/new             봇 만들기          — 짓는 자리
 * /bots/{id}            **등록정보**       — 이름·소개·초상화·배경
 * /bots/{id}/features   **기능**           — 그 봇 고유의 것(포크의 칸)
 * /bots/{id}/auth       **인증**           — 선언 주소와 자격 증명, 설치에 드는 것
 * /bots/{id}/advanced   **고급**           — 멈춤과 지우기
 * /bots/{id}/delete     지우기 전에 한 번  — 되돌릴 수 없는 것 앞의 한 걸음
 * ```
 */

/** 옷은 한 벌뿐이다 — 봇의 페이지라 하멜 스킨 밖이다. */
export function page(title: string, body: string): string {
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
  a.button.plain { background: #fff; color: #1a1a1a; }
  hr { border: 0; border-top: 1px solid #ddd; margin: 2rem 0; }
  .said { padding: .6rem .8rem; border-left: 3px solid #1a1a1a; background: #f2f2f2; }
  /* **되돌릴 수 없는 것은 가로줄 아래에 선다** — 누르면 공개 글이 나가는 자리다. */
  .grave { border-top: 1px solid #ddd; margin-top: 1.5rem; padding-top: 1rem; }
  /* **없애는 단추는 혼자 붉다** — 가로줄 아래의 다른 것들과도 무게가 다르다. */
  .danger, form button.danger { background: #fff; color: #a01b1b; border-color: #a01b1b; }
  /* **주소가 탭이다** — 스크립트가 감추고 보이는 것이 아니라 네 장이 각자 선다. */
  .tabs { display: flex; flex-wrap: wrap; gap: .2rem; margin: 1rem 0 1.5rem;
          border-bottom: 1px solid #ddd; }
  .tabs a { padding: .4rem .8rem; text-decoration: none; color: #666;
            border-bottom: 2px solid transparent; margin-bottom: -1px; }
  .tabs a[aria-current] { color: #1a1a1a; font-weight: 600; border-bottom-color: #1a1a1a; }
  /* **아직 서지 않은 칸도 자리를 지킨다** — 감추면 무엇이 남았는지 볼 수 없다. */
  .todo input { opacity: .6; }
  .bots { list-style: none; padding: 0; }
  .bots li { border: 1px solid #ddd; border-radius: .3rem; padding: .8rem 1rem; margin: .6rem 0; }
  .bots a { font-weight: 600; }
  .bots small { margin-top: .3rem; }
  .idle { color: #a01b1b; }
  @media (prefers-color-scheme: dark) {
    body { color: #e8e8e8; background: #161616; }
    code { background: #2a2a2a; }
    .said { border-left-color: #e8e8e8; background: #2a2a2a; }
    .grave { border-top-color: #333; }
    small, dt { color: #9a9a9a; }
    .bots li { border-color: #333; }
    .tabs { border-bottom-color: #333; }
    .tabs a { color: #9a9a9a; }
    .tabs a[aria-current] { color: #e8e8e8; border-bottom-color: #e8e8e8; }
    .button, button { background: #e8e8e8; color: #161616; border-color: #e8e8e8; }
    form button:not(.button) { background: #161616; color: #e8e8e8; }
    a.button.plain { background: #161616; color: #e8e8e8; }
    .danger, form button.danger { background: #161616; color: #e88; border-color: #e88; }
    .idle { color: #e88; }
  }
</style></head><body><h1>${title}</h1>${body}</body></html>`;
}

/** 한 말은 한 번만 보인다 — 주소에 실려 와서 새로고침에는 남지 않는다. */
function said(line: string | undefined): string {
  return line === undefined ? '' : `<p class="said">${escapeHtml(line)}</p>`;
}

/** 그 봇이 지금 무엇인가 — 목록과 설정 화면이 같은 말을 쓴다. */
export function statusOf(bot: BotRecord): string {
  if (!isConnected(bot)) {
    return '아직 잇지 않았다';
  }

  return bot.stopped === true ? '멈춰 있다' : '돈다';
}

/** 들어오는 문 — 아직 누구인지 모르는 사람이 보는 한 장. */
export function gatePage(): string {
  return page('봇을 세운다', `
    <p>시에라에 붙는 봇을 만들고 잇는 자리입니다.</p>
    <p><a class="button" href="/auth/github">GitHub으로 들어가기</a></p>`);
}

/**
 * **내 봇들** — 고르는 자리다.
 *
 * 만들기 폼은 여기 없다(`/bots/new`). 목록은 *무엇이 있고 무엇이 도는가*만 말한다.
 */
export function homePage(
  account: AccountRecord, bots: readonly BotRecord[], max: number, line?: string,
): string {
  const rows = bots.length === 0
    ? '<p>아직 봇이 없습니다.</p>'
    : `<ul class="bots">${bots.map((bot) => `<li>
        <a href="/bots/${bot.id}">${escapeHtml(bot.declaration.name)}</a>
        <small>${escapeHtml(bot.origin)}${bot.handle === undefined ? ''
          : ` · <code>@${escapeHtml(bot.handle)}</code>`}</small>
        <small class="${isConnected(bot) ? '' : 'idle'}">${statusOf(bot)}</small>
      </li>`).join('')}</ul>`;

  const room = bots.length < max;

  return page(`${escapeHtml(account.login)}의 봇`, `
    ${said(line)}
    ${rows}
    <p>${room
      ? '<a class="button" href="/bots/new">봇 만들기</a>'
      : `봇은 ${max}개까지입니다.`}</p>
    <hr>
    <form method="post" action="/auth/logout"><button type="submit">나가기</button></form>`);
}

/** **봇 만들기** — 짓는 자리 하나. */
export function newBotPage(fields: { name?: string; summary?: string; origin?: string } = {},
  wrong?: string): string {
  return page('봇 만들기', `
    ${said(wrong)}
    <form method="post" action="/bots">
      <p><label>이름 <input name="name" required maxlength="60"
        value="${escapeHtml(fields.name ?? '')}"></label>
        <small>시에라에 설 이 봇의 이름입니다.</small></p>
      <p><label>소개 <input name="summary" required maxlength="200"
        value="${escapeHtml(fields.summary ?? '')}"></label></p>
      <p><label>붙을 시에라 <input name="origin" required type="url" placeholder="https://..."
        value="${escapeHtml(fields.origin ?? '')}"></label>
        <small>이은 뒤에는 바꿀 수 없습니다 — 자격 증명이 그 시에라의 것이기 때문입니다.</small></p>
      <p><button class="button" type="submit">만든다</button>
         <a class="button plain" href="/">취소</a></p>
    </form>`);
}

/** 한도에 닿았다 — 만들기 자리가 *왜 없는지* 말하는 한 장. */
export function noRoomPage(max: number): string {
  return page('한도', `
    <p>봇은 ${max}개까지입니다. 시에라 쪽 한도(<code>bot.max_per_user</code>)에 맞춘 수라,
       늘리려면 그 시에라의 관리자가 먼저 늘려야 합니다.</p>
    <p><a class="button plain" href="/">돌아가기</a></p>`);
}

/** 봇 하나의 화면 넷 — **주소가 탭이다**. */
export type BotTab = 'profile' | 'features' | 'auth' | 'advanced';

const TABS: readonly (readonly [BotTab, string, string])[] = [
  ['profile', '', '등록정보'],
  ['features', '/features', '기능'],
  ['auth', '/auth', '인증'],
  ['advanced', '/advanced', '고급'],
];

/**
 * 네 장이 함께 쓰는 틀 — **머리와 탭 줄은 어느 탭에서도 같다**.
 *
 * 머리가 *어느 봇의 무엇을 만지는 중인가*를 늘 지고 있어야 한다. 탭을 옮길 때마다 이름과
 * 상태가 자리를 바꾸면 사람이 매번 다시 읽는다.
 */
function shell(bot: BotRecord, current: BotTab, body: string, line?: string): string {
  const nav = TABS.map(([key, suffix, label]) =>
    `<a href="/bots/${bot.id}${suffix}"${key === current ? ' aria-current="page"' : ''}>${label}</a>`)
    .join('');

  return page(escapeHtml(bot.declaration.name), `
    <p>${statusOf(bot)}${bot.handle === undefined ? ''
      : ` · <code>@${escapeHtml(bot.handle)}</code>`} · ${escapeHtml(bot.origin)}</p>
    <nav class="tabs">${nav}</nav>
    ${said(line)}
    ${isConnected(bot) || current === 'auth' ? '' : `
      <p class="said">아직 잇지 않았습니다 — <a href="/bots/${bot.id}/auth">인증</a>에서 잇습니다.</p>`}
    ${body}
    <p><a href="/">내 봇들</a></p>`);
}

/**
 * **등록정보** — 이 봇이 자기를 말하는 것.
 *
 * 여기 적은 것이 **선언**(`manifest.json`)이 되고, 고치면 판이 오른다. 시에라는 임자가
 * *새 판 승인*을 눌러야 그것을 가져간다 — **여기서 고쳤다고 저쪽이 바뀌지 않는다.**
 *
 * **초상화와 배경은 주소로 준다.** 코어가 그 주소를 한 번 받아 자기 것으로 만들므로(남의
 * 주소를 그대로 걸면 그 봇의 프로필을 여는 사람마다 남의 서버에 발자국이 남는다) 여기 적는
 * 것은 **코어가 한 번 닿을 수 있는 공개 주소**다.
 */
export function profileTab(bot: BotRecord, line?: string): string {
  const connected = isConnected(bot);

  return shell(bot, 'profile', `
    <form method="post" action="/bots/${bot.id}/declaration">
      <p><label>이름 <input name="name" required maxlength="60"
        value="${escapeHtml(bot.declaration.name)}"></label></p>
      <p><label>소개 <input name="summary" required maxlength="200"
        value="${escapeHtml(bot.declaration.summary)}"></label></p>
      <p><label>초상화 <input name="avatar" type="url" placeholder="https://..."
        value="${escapeHtml(bot.declaration.avatar ?? '')}"></label>
        <small>비우면 시에라의 기본 얼굴이 섭니다.</small></p>
      <p><label>배경 <input name="header" type="url" placeholder="https://..."
        value="${escapeHtml(bot.declaration.header ?? '')}"></label></p>
      ${connected
        ? `<p>붙은 시에라 <code>${escapeHtml(bot.origin)}</code>
           <small>이은 뒤에는 바꿀 수 없습니다 — 맡은 자격 증명이 그 시에라의 것입니다.</small></p>`
        : `<p><label>붙을 시에라 <input name="origin" required type="url"
           value="${escapeHtml(bot.origin)}"></label></p>`}
      <p><button class="button" type="submit">저장한다</button></p>
      <small>고치면 선언의 판이 오릅니다 — 시에라에서 <b>새 판 승인</b>을 눌러야 그쪽에 섭니다.</small>
    </form>

    <div class="grave todo">
      <h2>커스텀 필드</h2>
      <p><label>이름 <input placeholder="사는 곳" disabled></label></p>
      <p><label>값 <input placeholder="어딘가" disabled></label></p>
      <p><b>아직 서지 않았습니다.</b> 코어의 선언(<code>manifest.json</code>)이 지는 것은
         이름·소개·초상화·배경·권한까지이고 <b>커스텀 필드를 아직 받지 않습니다</b> — 그 자리가
         열리기 전에는 여기서 적어도 갈 곳이 없어 칸만 세워 둡니다.</p>
    </div>`, line);
}

/**
 * **기능** — 그 봇 고유의 것.
 *
 * 포크가 `BotPanel`로 선언한 칸이 여기 선다(`panel.ts`가 그린다). **이어진 뒤에만 설 수
 * 있다** — 그 전에는 시에라를 부를 수 없어 무엇이 있는지도 물을 수 없다.
 */
export function featuresTab(bot: BotRecord, panel: string, line?: string): string {
  const body = panel !== ''
    ? panel
    : isConnected(bot)
      ? `<p>이 봇이 화면에 더한 칸이 없습니다.
         <small>포크가 <code>BotPanel</code>을 주면 그 칸이 여기 섭니다.</small></p>`
      : '<p>이은 뒤에 섭니다 — 그 전에는 시에라에 물을 수 없습니다.</p>';

  return shell(bot, 'features', body, line);
}

/**
 * **인증** — 설치에 드는 것.
 *
 * 순서는 하나뿐이다: 선언 주소가 있어야 시에라가 설치를 받고, 설치를 해야 자격 증명이 난다.
 * **이은 뒤에는 안내가 접힌다** — 매번 같은 설명을 지나 아래로 내려가지 않게 한다.
 */
export function authTab(bot: BotRecord, declarationUrl: string, line?: string): string {
  const connected = isConnected(bot);

  return shell(bot, 'auth', `
    <h2>${connected ? '선언 주소' : '1. 이 주소를 시에라에 붙인다'}</h2>
    <p><code>${escapeHtml(declarationUrl)}</code></p>
    ${connected ? '' : `<p><b>${escapeHtml(bot.origin)}</b>에 그 시에라의 계정으로 들어가
       <b>봇 설치</b>에 위 주소를 붙이면 봇 계정이 서고 <code>client_id</code>와
       <code>client_secret</code>이 나옵니다.
       <b>비밀은 그때 한 번만 보이지만, 잃으면 다시 낼 수 있습니다.</b></p>`}

    <h2>${connected ? '자격 증명을 다시 맡긴다' : '2. 받은 것을 여기 맡긴다'}</h2>
    ${connected
      ? `<p>이어져 있습니다 — <code>@${escapeHtml(bot.handle ?? '')}</code>${
          bot.connectedAt === undefined ? '' : ` (${escapeHtml(bot.connectedAt.slice(0, 10))})`}.
         다시 맡기면 옛것을 덮습니다.</p>`
      : '<p>아직 잇지 않았습니다.</p>'}
    <form method="post" action="/bots/${bot.id}/credentials">
      <p><label>client_id <input name="client_id" required
        value="${escapeHtml(bot.clientId ?? '')}"></label></p>
      <p><label>client_secret <input name="client_secret" type="password" required></label></p>
      <p><button class="button" type="submit">맡긴다</button></p>
      <small>맡기기 전에 한 번 두드려 봅니다 — 틀리면 그 자리에서 말합니다.</small>
    </form>`, line);
}

/**
 * **고급** — 되돌릴 수 있는 것과 없는 것.
 *
 * 멈추는 것은 자격 증명을 두고 읽기만 쉬는 것이라 되돌릴 수 있고, 지우는 것은 아니다 —
 * **가로줄이 그 둘을 가른다**(모체 `CLAUDE.md`).
 */
export function advancedTab(bot: BotRecord, line?: string): string {
  const stopped = bot.stopped === true;

  return shell(bot, 'advanced', `
    ${isConnected(bot) ? `
    <h2>${stopped ? '멈춰 있다' : '돌고 있다'}</h2>
    <form method="post" action="/bots/${bot.id}/${stopped ? 'start' : 'stop'}">
      <p><button type="submit">${stopped ? '다시 돌린다' : '멈춘다'}</button></p>
      <small>${stopped
        ? '멈춘 동안 온 알림은 커서 뒤에 남아 있어, 다시 돌면 거기서부터 읽습니다.'
        : '자격 증명은 두고 읽기만 쉽니다. 언제든 다시 돌릴 수 있습니다.'}</small>
    </form>` : ''}

    <div class="grave">
      <h2>이 봇을 지운다</h2>
      <p>맡긴 자격 증명과 그동안 쌓인 것이 <b>여기서</b> 사라집니다.
         시에라의 봇 계정과 글은 남습니다.</p>
      <p><a class="button danger" href="/bots/${bot.id}/delete">지우러 간다</a></p>
    </div>`, line);
}

/**
 * **지우기 전에 한 번** — 되돌릴 수 없는 것 앞의 한 걸음.
 *
 * *무엇이 사라지고 무엇이 남는가*를 여기서 말한다. 시에라의 봇 계정은 이 서비스가 걷을 수
 * 없다(걷는 일은 **그 시에라의 임자**만 부를 수 있다) — 그 사실을 누르기 전에 읽어야
 * 사람이 *지웠는데 봇이 그대로 있다*고 놀라지 않는다.
 */
export function deletePage(bot: BotRecord): string {
  return page('지울까', `
    <p><b>${escapeHtml(bot.declaration.name)}</b>${bot.handle === undefined ? ''
      : ` (<code>@${escapeHtml(bot.handle)}</code>)`} — ${escapeHtml(bot.origin)}</p>
    <h2>여기서 사라지는 것</h2>
    <ul>
      <li>맡긴 자격 증명 — <b>다시 맡기려면 시에라에서 새로 내야 합니다</b></li>
      <li>어디까지 읽었나(커서)</li>
      <li>그 봇에게 사람들이 맡긴 것</li>
      <li>그 봇이 남긴 것</li>
    </ul>
    <h2>시에라에 남는 것</h2>
    <p>봇 계정과 그 봇이 쓴 글은 <b>${escapeHtml(bot.origin)}에 그대로 남습니다.</b>
       거기까지 걷으려면 그 시에라에 임자로 들어가 <b>봇 설치</b> 자리에서 따로 걷어야 합니다 —
       이 서비스는 그 계정의 임자가 아니라 봇일 뿐이라 대신 부를 수 없습니다.</p>
    <p><b>되돌릴 수 없습니다.</b></p>
    <form method="post" action="/bots/${bot.id}/delete">
      <p><button class="danger" type="submit">지운다</button>
         <a class="button plain" href="/bots/${bot.id}/advanced">취소</a></p>
    </form>`);
}

/** 막힌 자리 — 어디로 돌아갈지가 늘 함께 선다. */
export function stopPage(title: string, body: string, back: string, word = '돌아가기'): string {
  return page(title, `${body}<p><a class="button plain" href="${back}">${word}</a></p>`);
}
