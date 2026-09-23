import type { BotContext } from './runner.js';
import type { BotRecord } from './state.js';

/**
 * **포크가 봇 화면에 더하는 칸 — 그리는 일은 템플릿이 한다.**
 *
 * 템플릿의 봇 화면은 *선언 주소*와 *자격 증명*까지만 안다. 그 봇이 무엇으로 도는지(에코의
 * 발행 주기 같은 것)는 포크의 것이지만, **포크가 HTML을 쓰면 봇마다 옷이 갈린다** — 이스케이프도
 * 단추의 무게도 저장소 수만큼 흩어진다. 그래서 포크가 내는 것은 <b>무엇이 있는가</b>이고
 * 그리는 일은 여기 한 곳에서 한다.
 *
 * > 모체 `CLAUDE.md`의 *클라이언트 디자인 규칙* — 하나의 서비스에 클라이언트가 여럿이어도
 * > 요청 비용과 결과에 통일성이 있어야 하고, 이유 없이 다르게 동작해서는 안 된다.
 */

/** 고쳐 쓰는 칸 하나. `name`은 폼의 이름이자 저장될 때의 열쇠다. */
export type BotField =
  | {
      readonly type: 'number';
      readonly name: string;
      readonly label: string;
      readonly value: number;
      readonly min?: number;
      readonly max?: number;
      /** 숫자 뒤에 붙는 말 — `초`·`개`. */
      readonly unit?: string;
      readonly note?: string;
    }
  | {
      readonly type: 'text';
      readonly name: string;
      readonly label: string;
      readonly value: string;
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

/**
 * 누르면 무언가 하는 단추.
 *
 * **아직 서지 않은 기능의 단추도 세운다**(모체 `CLAUDE.md`) — 감추면 무엇이 남았는지 볼 수
 * 없다. 세우되 눌렀을 때 `act`가 *아직 안 된다*고 말하면 된다.
 */
export interface BotAction {
  readonly name: string;
  readonly label: string;

  /**
   * **되돌릴 수 없는가.** 그러면 가로줄 아래에 따로 선다 — 공개 글을 내보내는 것처럼 누른
   * 뒤에 무를 수 없는 것들이다.
   */
  readonly grave?: boolean;

  readonly note?: string;
}

/** 봇 화면에 설 것들 — **포크가 내고 템플릿이 그린다**. */
export interface PanelView {
  /** 칸의 제목. 없으면 *이 봇의 설정*이다. */
  readonly title?: string;

  /** 읽기만 하는 것들 — 풀에 몇 개, 마지막으로 언제 냈나. */
  readonly facts?: readonly (readonly [string, string])[];

  readonly fields?: readonly BotField[];
  readonly actions?: readonly BotAction[];
}

export interface BotPanel {
  /** 지금 무엇이 있는가. */
  describe(bot: BotRecord, ctx: BotContext): Promise<PanelView>;

  /**
   * 칸들을 저장한다 — `describe`가 낸 `fields`의 `name`으로 들어온다.
   *
   * **던지면 그 문장이 화면에 선다.** 돌려준 말은 봇 화면에 한 번 보인다.
   */
  save?(values: URLSearchParams, bot: BotRecord, ctx: BotContext): Promise<string | undefined>;

  /** 단추를 눌렀다. 던지면 그 문장이 화면에 선다. */
  act?(name: string, bot: BotRecord, ctx: BotContext): Promise<string | undefined>;
}

/** 사람이 적은 것이 화면으로 나가는 자리는 **여기 하나**다. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function field(one: BotField): string {
  const note = one.note === undefined ? '' : `<small>${esc(one.note)}</small>`;

  if (one.type === 'choice') {
    const options = one.options.map((o) =>
      `<option value="${esc(o.value)}"${o.value === one.value ? ' selected' : ''}>${esc(o.label)}</option>`).join('');

    return `<p><label>${esc(one.label)}
      <select name="${esc(one.name)}">${options}</select></label>${note}</p>`;
  }

  if (one.type === 'number') {
    const bounds = [
      one.min === undefined ? '' : ` min="${one.min}"`,
      one.max === undefined ? '' : ` max="${one.max}"`,
    ].join('');

    return `<p><label>${esc(one.label)}
      <input type="number" name="${esc(one.name)}" value="${one.value}"${bounds} required>
      </label>${one.unit === undefined ? '' : `<small>${esc(one.unit)}</small>`}${note}</p>`;
  }

  return `<p><label>${esc(one.label)}
    <input name="${esc(one.name)}" value="${esc(one.value)}"${
      one.maxLength === undefined ? '' : ` maxlength="${one.maxLength}"`}></label>${note}</p>`;
}

/**
 * 칸을 그린다 — **폼의 주소는 템플릿이 쥔다**(`x/settings` · `x/{단추}`).
 *
 * **되돌릴 수 없는 단추는 가로줄 아래에 모은다**(모체 `CLAUDE.md`의 펼침메뉴 규칙과 같은
 * 정신이다 — 되돌릴 수 있는 것과 없는 것을 가로줄로 나눈다).
 */
export function renderPanel(view: PanelView, botId: string): string {
  const facts = (view.facts ?? []).length === 0 ? '' : `<dl>${
    (view.facts ?? []).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;

  const fields = (view.fields ?? []).length === 0 ? '' : `
    <form method="post" action="/bots/${botId}/x/settings">
      ${(view.fields ?? []).map(field).join('')}
      <p><button class="button" type="submit">저장한다</button></p>
    </form>`;

  const buttons = view.actions ?? [];
  const draw = (one: BotAction): string => `
    <form method="post" action="/bots/${botId}/x/${esc(one.name)}">
      <button type="submit">${esc(one.label)}</button>
      ${one.note === undefined ? '' : `<small>${esc(one.note)}</small>`}
    </form>`;

  const plain = buttons.filter((one) => one.grave !== true).map(draw).join('');
  const grave = buttons.filter((one) => one.grave === true).map(draw).join('');

  return `<h2>${esc(view.title ?? '이 봇의 설정')}</h2>
    ${facts}${fields}${plain}
    ${grave === '' ? '' : `<div class="grave">${grave}</div>`}`;
}
