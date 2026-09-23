import type { BotContext } from './runner.js';
import type { BotRecord } from './state.js';
import { escapeHtml } from './text.js';

/**
 * **사람이 봇에게 무언가를 맡기는 자리** — 포크가 선언하고, 템플릿이 그린다.
 *
 * 봇 화면(`panel.ts`)이 *임자*의 자리라면 여기는 **말 거는 사람**의 자리다. 그 사람은 이
 * 서비스의 계정이 없고 앞으로도 만들지 않는다 — 가진 것은 봇이 메시지로 보낸 **링크 하나**
 * (`/connect/{티켓}`)뿐이고, 그것이 곧 신원이다(`BOT.md`의 *비밀은 공개 글에 실리지 않는다*).
 *
 * **왜 템플릿이 지는가.** 채토는 LLM 키를, 다른 봇은 다른 것을 받겠지만 *받는 일*의 모양은
 * 같다 — 링크를 내고, 폼을 그리고, 봉해서 그 봇의 `users/{id}.json`에 넣는다. 포크가 저마다
 * HTML을 쓰면 **봇마다 옷이 갈리고** 이스케이프도 저장소 수만큼 흩어진다(모체 `CLAUDE.md`의
 * *클라이언트 디자인 규칙*). 그래서 포크가 내는 것은 <b>무엇을 청하는가</b>뿐이다.
 *
 * **스크립트가 없다.** 폼 하나이고, 티켓이 비밀이라 CSRF 토큰을 따로 두지 않는다.
 */

/** 링크에 실려 다니는 것 — **어느 봇의 누구인가**. */
export interface ConnectTicket {
  readonly botId: string;
  readonly userId: string;
  readonly handle: string;
}

/** 맡기러 온 사람. 이 서비스의 계정이 아니라 **그 시에라의 사람**이다. */
export interface IntakeWho {
  readonly id: string;
  readonly handle: string;
}

/**
 * 청하는 칸 하나.
 *
 * `secret`은 **적은 것이 화면으로 돌아오지 않는다** — 값을 다시 그리면 봉해 둔 뜻이 없다.
 * 이미 맡긴 것이 있으면 `filled`로 그 사실만 말하고, **빈 채로 내면 그대로 둔다**.
 */
export type IntakeField =
  | {
      readonly type: 'secret';
      readonly name: string;
      readonly label: string;
      /** 빈 칸에 흐리게 서는 본보기 — `sk-ant-…`. */
      readonly hint?: string;
      /** 이미 맡긴 것이 있는가. 있으면 *두면 그대로다*라고 말한다. */
      readonly filled?: boolean;
      readonly note?: string;
    }
  | {
      readonly type: 'text';
      readonly name: string;
      readonly label: string;
      readonly value?: string;
      readonly maxLength?: number;
      readonly note?: string;
    }
  | {
      readonly type: 'choice';
      readonly name: string;
      readonly label: string;
      readonly value: string;
      readonly options: readonly { readonly value: string; readonly label: string }[];
      readonly note?: string;
    };

/** 맡기는 화면에 설 것들 — **포크가 낸다**. */
export interface IntakeView {
  /** 이 자리의 제목 — *채토에 키 맡기기*. */
  readonly title: string;
  /** 왜 맡기는가 — 문단 하나에 한 줄씩. 평문이다(HTML이 아니다). */
  readonly intro?: readonly string[];
  readonly fields: readonly IntakeField[];
  /** 단추의 말. 기본은 *맡긴다*. */
  readonly submit?: string;
}

export interface BotIntake {
  /** 무엇을 청하는가. */
  describe(who: IntakeWho, bot: BotRecord, ctx: BotContext): Promise<IntakeView>;

  /**
   * 받은 것을 그 사람의 기록으로 — **봉하는 것도 포크의 일이다**(`ctx.sealer`).
   *
   * **던지면 그 문장이 폼 위에 서고 티켓은 살아 있다** — 한 번 잘못 붙였다고 링크를 다시
   * 받게 하지 않는다. 돌려준 말은 마친 화면에 선다.
   */
  save(
    values: URLSearchParams, who: IntakeWho, bot: BotRecord, ctx: BotContext,
  ): Promise<string>;
}

function draw(one: IntakeField): string {
  const note = one.note === undefined ? '' : `<small>${escapeHtml(one.note)}</small>`;

  if (one.type === 'choice') {
    const options = one.options.map((option) =>
      `<option value="${escapeHtml(option.value)}"${
        option.value === one.value ? ' selected' : ''}>${escapeHtml(option.label)}</option>`).join('');

    return `<p><label>${escapeHtml(one.label)}
      <select name="${escapeHtml(one.name)}">${options}</select></label>${note}</p>`;
  }

  if (one.type === 'text') {
    return `<p><label>${escapeHtml(one.label)}
      <input name="${escapeHtml(one.name)}" value="${escapeHtml(one.value ?? '')}"${
        one.maxLength === undefined ? '' : ` maxlength="${one.maxLength}"`}></label>${note}</p>`;
  }

  /*
   * **값을 싣지 않는다.** `type="password"`인 것은 어깨 너머를 막는 것이고, 값을 비워 두는
   * 것은 **봉한 것이 화면으로 돌아오지 않게** 하는 것이다 — 뒤가 더 무겁다.
   *
   * `autocomplete="off"`로 브라우저가 이것을 제 비밀번호로 기억하지 않게 한다.
   */
  const filled = one.filled === true
    ? '<small>이미 맡긴 것이 있습니다 — 비워 두면 그대로 둡니다.</small>'
    : '';

  return `<p><label>${escapeHtml(one.label)}
    <input type="password" name="${escapeHtml(one.name)}" autocomplete="off"${
      one.hint === undefined ? '' : ` placeholder="${escapeHtml(one.hint)}"`}></label>${filled}${note}</p>`;
}

/** 폼을 그린다 — **주소는 템플릿이 쥔다**(`/connect/{티켓}`). */
export function renderIntake(view: IntakeView, token: string): string {
  const intro = (view.intro ?? []).map((line) => `<p>${escapeHtml(line)}</p>`).join('');

  return `${intro}
    <form method="post" action="/connect/${encodeURIComponent(token)}">
      ${view.fields.map(draw).join('')}
      <p><button class="button" type="submit">${escapeHtml(view.submit ?? '맡긴다')}</button></p>
    </form>`;
}
