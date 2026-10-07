import type { BotContext } from './runner.js';
import type { BotRecord } from './state.js';

/**
 * **봇이 봇 화면에 더하는 칸 — 그리는 일은 라이브러리가 한다.**
 *
 * 라이브러리의 봇 화면은 *선언 주소*와 *자격 증명*까지만 안다. 그 봇이 무엇으로 도는지(에코의
 * 발행 주기 같은 것)는 봇의 것이지만, **봇이 HTML을 쓰면 봇마다 옷이 갈린다** — 이스케이프도
 * 단추의 무게도 저장소 수만큼 흩어진다. 그래서 봇이 내는 것은 <b>무엇이 있는가</b>이고
 * 그리는 일은 여기 한 곳에서 한다.
 *
 * > 모체 `CLAUDE.md`의 *클라이언트 디자인 규칙* — 하나의 서비스에 클라이언트가 여럿이어도
 * > 요청 비용과 결과에 통일성이 있어야 하고, 이유 없이 다르게 동작해서는 안 된다.
 */

/**
 * 고쳐 쓰는 칸 하나. `name`은 폼의 이름이자 저장될 때의 열쇠다.
 *
 * **`group`이 같은 칸은 이어 서면 한 묶음이다**(제목이 선 `<fieldset>`) — 한 봇이 기능을
 * 여럿 질 때 *어느 칸이 어느 기능의 것인가*를 보인다(2026-10-06 요구). 폼은 여전히 하나라
 * 저장은 한 번이다.
 */
export type BotField = FieldShape & { readonly group?: string };

type FieldShape =
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
      /**
       * **여러 줄 칸** — 목록처럼 한 줄에 하나씩 적는 값.
       *
       * 한 줄 칸에 공백·쉼표로 늘어놓으면 **어디서 갈리는지를 봇마다 따로 정하게 된다** —
       * 줄바꿈이 그 규약을 대신한다. 값은 적힌 그대로 오고 줄을 가르는 것은 봇의 몫이다.
       */
      readonly type: 'lines';
      readonly name: string;
      readonly label: string;
      readonly value: string;
      /** 보이는 줄 수 — 기본 4. */
      readonly rows?: number;
      readonly maxLength?: number;
      readonly placeholder?: string;
      readonly note?: string;
    }
  | {
      /**
       * **토큰 칸** — 낱말 여럿을 받는다(해시태그 따위, 2026-10-06 요구).
       *
       * **하멜의 칩 칸과 같이 선다**(2026-10-07 요구) — 적은 것은 상자로 서고 `×`로 빼며,
       * 엔터·쉼표(여럿인 칸은 빈칸도)로 넣고 빈 칸의 지우기는 마지막 상자를 걷는다(`CHIPS`).
       *
       * **스크립트는 거들 뿐이다.** 마크업은 지금도 칸 하나에 빈칸·쉼표로 늘어놓는 칸이고, 저장된
       * 값은 칸 위에 토큰으로 그려진다 — 스크립트가 죽어도 그대로 받는다. 가르는 것도
       * 라이브러리가 한다(`readTokens`) — 봇마다 가르면 규약이 갈린다.
       */
      readonly type: 'tokens';
      readonly name: string;
      readonly label: string;
      readonly value: readonly string[];
      /** 토큰 앞에 그릴 표시 — `#`. 값에는 들지 않는다. */
      readonly prefix?: string;
      /**
       * 받는 개수 — **1이면 값 하나의 칸이다**(그룹 따위). 새로 넣으면 옛것을 갈아 끼우고,
       * 빈칸을 가르지 않아 이름에 빈칸이 들 수 있다. 받는 쪽은 그 칸을 한 줄 값으로 읽는다.
       */
      readonly max?: number;
      /**
       * **쉼표로만 가른다**(`comma`) — 이름에 빈칸이 들 수 있는 값(그룹 따위, 2026-10-07). 기본은
       * 빈칸·쉼표로 가른다(태그). 받는 쪽은 `readNames`로 읽는다.
       */
      readonly separator?: 'comma';
      readonly placeholder?: string;
      readonly note?: string;
    }
  | {
      readonly type: 'choice';
      readonly name: string;
      readonly label: string;
      readonly value: string;
      readonly options: readonly { readonly value: string; readonly label: string }[];
      readonly note?: string;
    }
  | {
      /**
       * **비밀 칸** — 봇 임자가 맡기는 열쇠(저장소 토큰 따위, 2026-10-06 요구).
       *
       * 맡기는 칸(`IntakeField`의 `secret`)과 같은 규약이다: **적은 것이 화면으로 돌아오지
       * 않고**, 이미 맡긴 것이 있으면 `filled`로 그 사실만 말하며, **빈 채로 내면 그대로 둔다**.
       * 봉하는 일은 봇의 몫이다(`ctx.sealer`).
       */
      readonly type: 'secret';
      readonly name: string;
      readonly label: string;
      readonly hint?: string;
      readonly filled?: boolean;
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

  /** 누른 뒤 덮개에 설 말 — `복제하는 중…`. 없으면 *처리하는 중…*. */
  readonly wait?: string;
}

/**
 * **목록** — 항목마다 따로 저장되는 것들(저장소와 그 토큰 따위, 2026-10-07 요구).
 *
 * 한 폼에 줄 목록과 그 줄마다의 칸을 함께 세우면 *저장하고 나서야 칸이 생기는* 두 걸음이 된다.
 * 목록은 그것을 한 걸음으로 만든다: **추가는 칸을 한꺼번에 받고, 항목을 누르면 그 항목의 칸이
 * 펼쳐진다.** 펼침은 `<details>`가 맡는다(스크립트는 바깥 누름·`Esc`로 접기만 거든다).
 *
 * 항목마다 폼이 따로라 설정 폼 **밖에** 선다 — 폼은 겹칠 수 없다.
 */
export interface BotList {
  /** 봇이 받는 이름 — `BotPanel.list`의 `list`. */
  readonly name: string;
  readonly label: string;
  readonly note?: string;
  readonly items: readonly {
    /** 항목을 가리키는 열쇠 — 고치기·빼기에 돌아온다. */
    readonly key: string;
    readonly label: string;
    /** 항목 옆에 작게 서는 말 — `토큰 있음`. */
    readonly note?: string;
    /** 펼치면 서는 칸 — 비면 빼기만 선다. */
    readonly fields: readonly BotField[];
  }[];
  readonly add: { readonly label: string; readonly fields: readonly BotField[] };
}

/**
 * **서브탭 하나** — 칸이 길어진 봇이 기능마다 장을 가른다(2026-10-07 요구).
 *
 * 위의 탭처럼 **주소가 탭이다**(`?sub=이름`) — 새로고침해도 그 자리이고 스크립트가 없어도 선다.
 * 장마다 그 장의 칸만 보이므로, 저장할 때 **보이지 않은 장의 칸은 라이브러리가 지금 값으로 채워**
 * 봇에게 넘긴다(`fillHidden`) — 봇의 `save`는 늘 칸 전부를 받는다.
 */
export interface PanelTab {
  readonly name: string;
  readonly label: string;
  readonly facts?: readonly (readonly [string, string])[];
  readonly fields?: readonly BotField[];
  readonly lists?: readonly BotList[];
  readonly actions?: readonly BotAction[];
}

/** 봇 화면에 설 것들 — **봇이 내고 라이브러리가 그린다**. */
export interface PanelView {
  /**
   * 칸의 제목 — **없으면 제목을 그리지 않는다**.
   *
   * 이 칸은 봇 화면의 *기능* 탭에 서고 탭 줄이 이미 그 이름을 지고 있다. 기본 제목을 두면
   * 탭 바로 아래에 같은 말이 한 번 더 선다.
   */
  readonly title?: string;

  /** 읽기만 하는 것들 — 풀에 몇 개, 마지막으로 언제 냈나. */
  readonly facts?: readonly (readonly [string, string])[];

  readonly fields?: readonly BotField[];
  readonly lists?: readonly BotList[];
  readonly actions?: readonly BotAction[];

  /** **서브탭** — 있으면 위의 `facts`·`fields`·`lists`·`actions` 대신 장마다 선다. */
  readonly tabs?: readonly PanelTab[];
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

  /** 단추를 눌렀다. 던지면 그 문장이 화면에 선다. **`settings`·`list`는 라이브러리가 쥔 이름이다.** */
  act?(name: string, bot: BotRecord, ctx: BotContext): Promise<string | undefined>;

  /**
   * 목록을 고쳤다 — `add`는 `key`가 비고, `edit`·`remove`는 그 항목의 `key`다. `values`는 그
   * 폼의 칸들이다. **던지면 그 문장이 화면에 선다.**
   */
  list?(
    op: 'add' | 'edit' | 'remove', list: string, key: string, values: URLSearchParams,
    bot: BotRecord, ctx: BotContext,
  ): Promise<string | undefined>;
}

/** 사람이 적은 것이 화면으로 나가는 자리는 **여기 하나**다. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 쉼표로 가른 칸의 값 — 앞뒤 공백만 떼고, 빈 것은 버리고, 겹치면 하나만(`separator: 'comma'`). */
export function readNames(raw: string | null | undefined): readonly string[] {
  return [...new Set((raw ?? '').split(/[,\n]/u).map((one) => one.trim()).filter((one) => one !== ''))];
}

/**
 * 토큰 칸의 값을 가른다 — **빈칸·쉼표·줄바꿈**, 빈 것은 버리고 겹치면 하나만. 앞의 `#`도 뗀다.
 * 접는 일(대소문자 따위)은 봇의 몫이다 — 무엇을 같은 것으로 볼지는 그 값의 뜻이 정한다.
 */
export function readTokens(raw: string | null | undefined): readonly string[] {
  const found: string[] = [];

  for (const one of (raw ?? '').split(/[\s,]+/u)) {
    const token = one.replace(/^#+/, '').trim();
    if (token !== '' && !found.includes(token)) {
      found.push(token);
    }
  }

  return found;
}

function field(one: BotField): string {
  const note = one.note === undefined ? '' : `<small>${esc(one.note)}</small>`;

  if (one.type === 'tokens') {
    const prefix = one.prefix ?? '';
    const chips = one.value.length === 0
      ? ''
      : `<span class="tokens">${one.value.map((token) => `<span class="token">${esc(prefix + token)}</span>`).join('')}</span>`;

    return `<p><label>${esc(one.label)}${chips}
      <input name="${esc(one.name)}" value="${esc(one.value.join(one.separator === 'comma' ? ', ' : ' '))}" data-chips${
        prefix === '' ? '' : ` data-prefix="${esc(prefix)}"`}${
        one.max === undefined ? '' : ` data-max="${one.max}"`}${
        one.separator === undefined ? '' : ` data-sep="${one.separator}"`}${
        one.placeholder === undefined ? '' : ` placeholder="${esc(one.placeholder)}"`}></label>${note}</p>`;
  }

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

  if (one.type === 'secret') {
    // 값을 싣지 않는다 — 봉한 것이 화면으로 돌아오지 않게(`intake.ts`와 같은 까닭).
    const filled = one.filled === true ? '<small>이미 맡긴 것이 있습니다 — 비워 두면 그대로 둡니다.</small>' : '';

    return `<p><label>${esc(one.label)}
      <input type="password" name="${esc(one.name)}" autocomplete="off"${
        one.hint === undefined ? '' : ` placeholder="${esc(one.hint)}"`}></label>${filled}${note}</p>`;
  }

  if (one.type === 'lines') {
    return `<p><label>${esc(one.label)}
      <textarea name="${esc(one.name)}" rows="${one.rows ?? 4}"${
        one.maxLength === undefined ? '' : ` maxlength="${one.maxLength}"`}${
        one.placeholder === undefined ? '' : ` placeholder="${esc(one.placeholder)}"`}>${
        esc(one.value)}</textarea></label>${note}</p>`;
  }

  return `<p><label>${esc(one.label)}
    <input name="${esc(one.name)}" value="${esc(one.value)}"${
      one.maxLength === undefined ? '' : ` maxlength="${one.maxLength}"`}></label>${note}</p>`;
}

/**
 * **묶음마다 폼 하나, 저장 단추 하나**(2026-10-07 요구) — ~~칸 전부를 한 폼으로~~ 두면 장이 길어질
 * 때 단추가 멀고, 무엇이 저장됐는지도 흐렸다. 이어 선 같은 `group`이 한 `<fieldset>`이자 한 폼이고,
 * 묶음이 없는 칸들도 저마다 폼 하나다.
 *
 * 폼에는 그 묶음의 칸만 실리므로 **나머지는 라이브러리가 지금 값으로 채워** 봇에게 넘긴다
 * (`fillHidden`). 저장한 뒤에는 **그 묶음으로 돌아온다**(`_at` → 주소의 `#`).
 */
function grouped(fields: readonly BotField[], botId: string, tab: string): string {
  let html = '';
  let at = 0;
  let count = 0;

  while (at < fields.length) {
    const group = fields[at]?.group;
    let end = at;
    while (end < fields.length && fields[end]?.group === group) {
      end += 1;
    }

    count += 1;
    const id = `${tab === '' ? 'f' : `${tab}-f`}${String(count)}`;
    const inner = `${fields.slice(at, end).map(field).join('')}
      <p><button class="button" type="submit">저장한다</button></p>`;
    html += `<form method="post" action="/bots/${botId}/x/settings" id="${esc(id)}" data-wait="저장하는 중…">${hiddenTab(tab)}
      <input type="hidden" name="_at" value="${esc(id)}">
      ${group === undefined ? inner : `<fieldset><legend>${esc(group)}</legend>${inner}</fieldset>`}</form>`;
    at = end;
  }

  return html;
}

/** 폼이 낸 장(서브탭) — 돌아올 자리. */
function hiddenTab(tab: string): string {
  return tab === '' ? '' : `<input type="hidden" name="_tab" value="${esc(tab)}">`;
}

/**
 * **토큰 칸을 칩 칸으로 갈아입힌다** — 하멜의 `chips.ts`를 옮겼다(2026-10-07 요구).
 *
 * 원래 칸은 감춘 채 값을 쥐고(보내는 것은 여전히 그 칸이다), 그 앞에 상자들과 적는 칸이 선다.
 *
 * **레이블이 적는 칸을 가리키게 한다** — 레이블 안의 첫 번째 누를 수 있는 것은 상자의 `×`이고,
 * 그대로 두면 칸의 이름을 누르는 것이 상자 하나를 지운다.
 */
const CHIPS = `<script>(() => {
  for (const field of document.querySelectorAll('input[data-chips]')) {
    const max = Number(field.dataset.max || 0);
    const prefix = field.dataset.prefix || '';
    const comma = field.dataset.sep === 'comma';
    const split = (raw) => max === 1
      ? [raw.trim()].filter(Boolean)
      : comma
        ? raw.split(',').map((one) => one.trim()).filter(Boolean)
        : raw.split(/[\\s,]+/u).map((one) => one.replace(/^#+/, '').trim()).filter(Boolean);
    let values = split(field.value);

    const box = document.createElement('div');
    const entry = document.createElement('input');
    const label = field.closest('label');
    box.className = 'chip-field';
    entry.className = 'chip-entry';
    entry.autocomplete = 'off';
    entry.id = 'chip-' + field.name;
    label?.querySelector('.tokens')?.remove();
    label?.setAttribute('for', entry.id);

    const write = (next) => {
      values = next;
      field.value = next.join(max === 1 ? '' : comma ? ', ' : ' ');
      draw();
    };

    const draw = () => {
      box.querySelectorAll(':scope > .chip').forEach((old) => old.remove());
      for (const value of values) {
        const chip = document.createElement('span');
        const drop = document.createElement('button');
        chip.className = 'chip';
        chip.textContent = prefix + value;
        drop.type = 'button';
        drop.className = 'chip-drop';
        drop.textContent = '×';
        drop.setAttribute('aria-label', prefix + value + ' 빼기');
        drop.addEventListener('click', (event) => {
          event.preventDefault();
          write(values.filter((other) => other !== value));
          entry.focus();
        });
        chip.append(drop);
        entry.before(chip);
      }
      entry.placeholder = values.length === 0 ? field.placeholder : '';
    };

    const commit = () => {
      const typed = split(entry.value);
      entry.value = '';
      if (typed.length === 0) return;
      const next = [...values];
      for (const one of typed) if (!next.includes(one)) next.push(one);
      write(max > 0 ? next.slice(-max) : next);
    };

    entry.addEventListener('keydown', (event) => {
      if (event.isComposing) return;
      const breaks = event.key === 'Enter' || event.key === ',' || (max !== 1 && !comma && event.key === ' ');
      if (breaks) {
        // 엔터는 적는 것이 있을 때만 붙잡는다 — 비어 있으면 그대로 폼을 보낸다.
        if (entry.value.trim() !== '') { event.preventDefault(); commit(); }
        else if (event.key !== 'Enter') event.preventDefault();
        return;
      }
      if (event.key === 'Backspace' && entry.value === '' && values.length > 0) {
        event.preventDefault();
        write(values.slice(0, -1));
      }
    });
    entry.addEventListener('blur', commit);
    field.form?.addEventListener('submit', commit, { capture: true });
    box.addEventListener('click', (event) => { if (event.target === box) entry.focus(); });

    box.append(entry);
    field.hidden = true;
    field.before(box);
    draw();
  }
})();</script>`;

/**
 * **펼친 목록 항목을 접는다** — 바깥을 누르거나 `Esc`(모체 `CLAUDE.md`의 펼침메뉴 규칙). 여는 것은
 * `<details>`가 한다.
 */
const FOLD = `<script>(() => {
  const open = () => document.querySelectorAll('.list details[open]');
  document.addEventListener('click', (event) => {
    for (const one of open()) if (!one.contains(event.target)) one.open = false;
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    for (const one of open()) { one.open = false; one.querySelector('summary')?.focus(); }
  });
})();</script>`;

function listHtml(one: BotList, botId: string, at: string, tab: string): string {
  const action = `/bots/${botId}/x/list`;
  const id = `${tab === '' ? '' : `${tab}-`}list-${one.name}`;
  const hidden = (op: string, key: string): string => `${at}<input type="hidden" name="_at" value="${esc(id)}">
      <input type="hidden" name="list" value="${esc(one.name)}">
      <input type="hidden" name="op" value="${op}"><input type="hidden" name="key" value="${esc(key)}">`;

  const items = one.items.map((item) => `<li><details>
      <summary>${esc(item.label)}${item.note === undefined ? '' : ` <small>${esc(item.note)}</small>`}</summary>
      ${item.fields.length === 0 ? '' : `<form method="post" action="${action}" data-wait="저장하는 중…">${hidden('edit', item.key)}
        ${item.fields.map(field).join('')}
        <p><button class="button" type="submit">저장한다</button></p></form>`}
      <form method="post" action="${action}" class="grave" data-wait="빼는 중…">${hidden('remove', item.key)}
        <button class="danger" type="submit">빼기</button></form>
    </details></li>`).join('');

  return `<fieldset class="list" id="${esc(id)}"><legend>${esc(one.label)}</legend>
    ${one.note === undefined ? '' : `<small>${esc(one.note)}</small>`}
    ${items === '' ? '' : `<ul>${items}</ul>`}
    <details class="add"><summary class="button plain">${esc(one.add.label)}</summary>
      <form method="post" action="${action}" data-wait="더하는 중…">${hidden('add', '')}
        ${one.add.fields.map(field).join('')}
        <p><button class="button" type="submit">더한다</button></p></form>
    </details></fieldset>`;
}

/**
 * 칸을 그린다 — **폼의 주소는 라이브러리가 쥔다**(`x/settings` · `x/{단추}`).
 *
 * **되돌릴 수 없는 단추는 가로줄 아래에 모은다**(모체 `CLAUDE.md`의 펼침메뉴 규칙과 같은
 * 정신이다 — 되돌릴 수 있는 것과 없는 것을 가로줄로 나눈다).
 */
export function renderPanel(view: PanelView, botId: string, sub?: string): string {
  const title = view.title === undefined ? '' : `<h2>${esc(view.title)}</h2>`;
  if (view.tabs === undefined || view.tabs.length === 0) {
    return `${title}${section(view, botId, '')}`;
  }

  const chosen = view.tabs.find((one) => one.name === sub) ?? view.tabs[0];
  const nav = view.tabs.map((one) => `<a href="/bots/${botId}/features?sub=${encodeURIComponent(one.name)}"${
    one === chosen ? ' aria-current="page"' : ''}>${esc(one.label)}</a>`).join('');

  return `${title}
    <nav class="subtabs">${nav}</nav>
    ${chosen === undefined ? '' : section(chosen, botId, chosen.name)}`;
}

/** 한 장 — 서브탭이 없으면 화면 전체, 있으면 고른 장. 폼마다 **돌아올 장**을 싣는다. */
function section(view: Omit<PanelTab, 'name' | 'label'>, botId: string, tab: string): string {
  const at = hiddenTab(tab);
  const facts = (view.facts ?? []).length === 0 ? '' : `<dl>${
    (view.facts ?? []).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;

  const fields = grouped(view.fields ?? [], botId, tab);

  const lists = (view.lists ?? []).map((one) => listHtml(one, botId, at, tab)).join('');
  const listed = lists === '' ? '' : `${lists}${FOLD}`;
  const chips = [...(view.fields ?? []), ...(view.lists ?? []).flatMap((one) => [
    ...one.add.fields, ...one.items.flatMap((item) => item.fields),
  ])].some((one) => one.type === 'tokens');

  const buttons = view.actions ?? [];
  const draw = (one: BotAction): string => `
    <form method="post" action="/bots/${botId}/x/${esc(one.name)}" id="${esc(`${tab}-do-${one.name}`)}"${
      one.wait === undefined ? '' : ` data-wait="${esc(one.wait)}"`}>${at}
      <input type="hidden" name="_at" value="${esc(`${tab}-do-${one.name}`)}">
      <button type="submit">${esc(one.label)}</button>
      ${one.note === undefined ? '' : `<small>${esc(one.note)}</small>`}
    </form>`;

  const plain = buttons.filter((one) => one.grave !== true).map(draw).join('');
  const grave = buttons.filter((one) => one.grave === true).map(draw).join('');

  return `${facts}${fields}${listed}${chips ? CHIPS : ''}${plain}
    ${grave === '' ? '' : `<div class="grave">${grave}</div>`}`;
}

/**
 * **폼에 없던 칸을 지금 값으로 채운다** — 묶음마다 폼이 따로라(`grouped`) 폼에는 그 묶음의 칸만
 * 온다. 봇의 `save`가 빠진 칸을 *비운 것*으로 읽지 않게 여기서 메운다.
 *
 * 비밀 칸은 채우지 않는다 — 값이 화면에 없고, 빈 비밀은 이미 *그대로 둔다*는 뜻이다.
 */
export function fillHidden(view: PanelView, form: URLSearchParams): URLSearchParams {
  const filled = new URLSearchParams(form);

  for (const one of [...(view.fields ?? []), ...(view.tabs ?? []).flatMap((tab) => tab.fields ?? [])]) {
    if (filled.has(one.name) || one.type === 'secret') {
      continue;
    }
    filled.set(one.name, one.type === 'tokens' ? one.value.join(one.separator === 'comma' ? ', ' : ' ') : String(one.value));
  }

  return filled;
}
