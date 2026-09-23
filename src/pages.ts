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
 * ```
 * /                    내 봇들            — 고르는 자리
 * /bots/new            봇 만들기          — 짓는 자리
 * /bots/{id}           봇 하나            — 잇고 · 고치고 · 멈추는 자리
 * /bots/{id}/delete    지우기 전에 한 번  — 되돌릴 수 없는 것 앞의 한 걸음
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

export interface BotPageView {
  readonly bot: BotRecord;
  /** 선언 주소 — 코어가 읽는 자리다. */
  readonly declarationUrl: string;
  /** 포크가 더한 칸 — 이어진 뒤에만 선다. */
  readonly panel: string;
  readonly line?: string;
}

/**
 * **봇 하나** — 잇고, 고치고, 멈추고, 지우는 자리.
 *
 * 차례가 곧 화면의 순서다: 아직 잇지 않았으면 *잇는 법*이 맨 위에 서고, 이은 뒤에는 그 자리가
 * 접혀 **설정이 먼저 보인다** — 매번 같은 안내를 지나 설정으로 내려가지 않게 한다.
 */
export function botPage(view: BotPageView): string {
  const { bot } = view;
  const connected = isConnected(bot);

  const connect = `
    <h2>${connected ? '자격 증명을 다시 맡긴다' : '2. 받은 것을 여기 맡긴다'}</h2>
    ${connected
      ? `<p>이어져 있습니다 — <code>@${escapeHtml(bot.handle ?? '')}</code>.
         다시 맡기면 옛것을 덮습니다.</p>`
      : '<p>아직 잇지 않았습니다.</p>'}
    <form method="post" action="/bots/${bot.id}/credentials">
      <p><label>client_id <input name="client_id" required></label></p>
      <p><label>client_secret <input name="client_secret" type="password" required></label></p>
      <p><button class="button" type="submit">맡긴다</button></p>
    </form>`;

  const install = `
    <h2>${connected ? '선언 주소' : '1. 이 주소를 시에라에 붙인다'}</h2>
    <p><code>${escapeHtml(view.declarationUrl)}</code></p>
    ${connected ? '' : `<p><b>${escapeHtml(bot.origin)}</b>에 그 시에라의 계정으로 들어가
       <b>봇 설치</b>에 위 주소를 붙이면 봇 계정이 서고 <code>client_id</code>와
       <code>client_secret</code>이 나옵니다.
       <b>비밀은 그때 한 번만 보이지만, 잃으면 다시 낼 수 있습니다.</b></p>`}`;

  // **선언은 고칠 수 있다** — 고치면 판이 오르고, 시에라는 임자에게 *새 판 승인*을 띄운다.
  const declaration = `
    <h2>선언</h2>
    <form method="post" action="/bots/${bot.id}/declaration">
      <p><label>이름 <input name="name" required maxlength="60"
        value="${escapeHtml(bot.declaration.name)}"></label></p>
      <p><label>소개 <input name="summary" required maxlength="200"
        value="${escapeHtml(bot.declaration.summary)}"></label></p>
      ${connected
        ? `<p>붙은 시에라 <code>${escapeHtml(bot.origin)}</code>
           <small>이은 뒤에는 바꿀 수 없습니다.</small></p>`
        : `<p><label>붙을 시에라 <input name="origin" required type="url"
           value="${escapeHtml(bot.origin)}"></label></p>`}
      <p><button class="button" type="submit">저장한다</button></p>
      <small>고치면 선언의 판이 오릅니다 — 시에라에서 <b>새 판 승인</b>을 눌러야 그쪽에 섭니다.</small>
    </form>`;

  return page(escapeHtml(bot.declaration.name), `
    ${said(view.line)}
    <p>${escapeHtml(bot.declaration.summary)}</p>
    <dl>
      <dt>지금</dt><dd>${statusOf(bot)}</dd>
      <dt>시에라</dt><dd>${escapeHtml(bot.origin)}</dd>
      ${bot.handle === undefined ? '' : `<dt>아이디</dt><dd><code>@${escapeHtml(bot.handle)}</code></dd>`}
    </dl>
    ${connected ? `${declaration}${view.panel}${install}${connect}` : `${install}${connect}${declaration}`}
    <div class="grave">
      ${connected ? `
      <form method="post" action="/bots/${bot.id}/${bot.stopped === true ? 'start' : 'stop'}">
        <button type="submit">${bot.stopped === true ? '다시 돌린다' : '멈춘다'}</button>
        <small>${bot.stopped === true
          ? '멈춰 있는 동안 쌓인 알림은 커서 뒤에 남아 있어, 다시 돌면 거기서부터 읽습니다.'
          : '자격 증명은 두고 읽기만 쉽니다. 언제든 다시 돌릴 수 있습니다.'}</small>
      </form>` : ''}
      <p><a class="button danger" href="/bots/${bot.id}/delete">이 봇을 지운다</a></p>
    </div>
    <p><a href="/">돌아가기</a></p>`);
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
         <a class="button plain" href="/bots/${bot.id}">취소</a></p>
    </form>`);
}

/** 막힌 자리 — 어디로 돌아갈지가 늘 함께 선다. */
export function stopPage(title: string, body: string, back: string, word = '돌아가기'): string {
  return page(title, `${body}<p><a class="button plain" href="${back}">${word}</a></p>`);
}
