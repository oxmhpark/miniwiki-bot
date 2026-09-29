/**
 * 봇이 알아듣는 명령 — **`@아이디 /이름 인자`** (2026-09-29 요구).
 *
 * **선언과 파싱이 한 근원에서 나온다.** 봇이 목록을 한 번 적으면 이 라이브러리가 그것을
 * `manifest.json`에 싣고(코어가 그 표를 화면에 준다) **같은 목록으로 들어오는 글을 읽는다** —
 * 봇마다 정규식을 다시 쓰면 <b>봇마다 문법이 갈린다</b>: 하나는 대소문자를 보고 다른 하나는
 * 안 보는 식으로.
 *
 * **문법이 여기 사는 까닭.** 사람이 봇을 부르는 길은 여럿이다(멘션 · 메시지 · 그냥 말) —
 * 명령은 그 가운데 **모양이 정해진 한 길**일 뿐이고, 봇은 그 길로 온 것만 다루지 않아도 된다.
 * 선언해 두면 화면이 거들어 주고, 대응하지 않으면 그 길이 없는 것과 같다.
 */

/** 명령 하나의 선언 — **범위를 반드시 적는다**(코어가 빠진 선언을 거절한다). */
export interface BotCommand {
  /** `/` 뒤에 서는 낱말. 소문자·숫자·`_`·`-`만, 32자까지. */
  readonly name: string;

  /** 고르는 자리에 이름 곁에 서는 한 줄. */
  readonly summary?: string;

  /** 인자의 본보기 — `<할 말>` 따위. 없으면 인자가 없다는 뜻이다. */
  readonly args?: string;

  /**
   * 누가 쓸 수 있는가 — **화면이 이 값으로 가린다**.
   *
   * **가리는 것은 친절이지 문이 아니다.** 누구든 글자를 직접 칠 수 있으므로 <b>거절은 봇이
   * 한다</b> — 이 값을 보고 브레인이 판단하거나, 판단하지 않으면 누구나 쓰는 명령이 된다.
   */
  readonly who: 'owner' | 'everyone';
}

/** 글에서 읽어 낸 명령 한 줄. */
export interface CommandCall {
  /** 내린 이름 — 선언의 그것과 같은 꼴이다. */
  readonly name: string;

  /** `/이름` 뒤에 남은 글자. 없으면 빈 글자다. */
  readonly args: string;

  /** 선언에 있는 명령인가 — 없으면 **모르는 명령**이다. */
  readonly known: boolean;
}

/**
 * **모든 봇이 아는 명령** — 매뉴얼을 낸다 (2026-09-29 요구).
 *
 * **봇마다 다른 이름이면 그것을 또 외워야 한다.** 무엇을 할 수 있는지 묻는 일은 <b>봇을
 * 처음 만난 사람의 첫 물음</b>이고, 그 자리에서 *이 봇은 무슨 낱말을 쓰지*를 다시 물어야
 * 하면 자동완성이 있어도 소용이 없다 — 그래서 <b>선언하지 않아도 선다.</b>
 */
export const HELP = 'help';

/**
 * `/?`도 같은 것을 연다 — **짧은 쪽이 손에 먼저 온다**.
 *
 * **별칭이지 이름이 아니다.** 이름의 글자 집합에는 `?`가 없고(코어가 그 선언을 거절한다)
 * 있어야 할 까닭도 없다 — <b>읽는 자리에서 한 번 갈아 주면</b> 선언도 표도 목록도 `help`
 * 하나로 선다. 물음표를 이름으로 들이면 <i>주소·문장부호와 섞이는</i> 글자가 하나 는다.
 */
export const HELP_ALIAS = '?';

/**
 * 이름이 규칙에 맞는가 — **코어가 받아들이는 것과 같은 글자 집합**.
 *
 * 빈칸이 들어가면 인자와 경계가 사라지고(인자는 줄 끝까지다), 유니코드를 열면 **눈으로 같아
 * 보이는 두 이름**이 선다.
 */
const NAME = /^[a-z0-9_-]{1,32}$/;

/**
 * 선언을 **받아들일 수 있는 꼴로** 만든다 — 어긋난 것이 있으면 던진다.
 *
 * **내리는 자리는 여기 하나다**(`toLowerCase`). 선언·파싱·화면이 저마다 내리면 <b>한 곳이
 * 잊힌다</b> — 내려서 선언하고, 들어온 글도 내려서 견준다.
 *
 * **통째로 거절한다.** 어긋난 하나만 버리면 *적었는데 조용히 사라진 명령*이 생기고, 봇을
 * 짓는 사람은 화면을 열어 보기 전에는 그것을 알 수 없다 — 코어도 같은 판단을 한다.
 */
export function declare(commands: readonly BotCommand[]): readonly BotCommand[] {
  const seen = new Set<string>();

  /*
   * **매뉴얼은 선언하지 않아도 선다**(2026-09-29 요구) — 봇마다 다른 이름이면 *무엇을 할
   * 수 있나*를 묻기 전에 <b>묻는 법</b>을 먼저 알아야 한다.
   *
   * **봇이 제 것을 적었으면 그것을 쓴다** — 곁글을 달거나 범위를 좁히려는 봇이 있을 수 있고,
   * 여기서 덮어쓰면 그 뜻이 조용히 사라진다.
   */
  const told = commands.some((one) => one.name.trim().toLowerCase() === HELP);
  const all: readonly BotCommand[] = told
    ? commands
    : [{ name: HELP, summary: '이 봇이 아는 명령을 보인다', who: 'everyone' }, ...commands];

  return all.map((one) => {
    const name = one.name.trim().toLowerCase();

    if (!NAME.test(name)) {
      throw new Error(`명령 이름이 규칙에 맞지 않습니다: ${one.name}`);
    }

    if (one.who !== 'owner' && one.who !== 'everyone') {
      throw new Error(`명령 ${name}에 범위가 없습니다 — owner 또는 everyone.`);
    }

    if (seen.has(name)) {
      throw new Error(`명령 ${name}이(가) 둘입니다.`);
    }

    seen.add(name);

    return { ...one, name };
  });
}

/**
 * 글에서 명령을 읽는다 — **한 글에 하나**(2026-09-29 요구).
 *
 * **첫 번째 것만 본다.** 여럿을 받으면 차례와 실패의 뜻이 생기고(둘째가 실패하면 첫째는
 * 되돌리나?) 그것은 봇마다 다른 답을 갖는 물음이다 — 하나로 묶어 두면 그 물음이 서지 않는다.
 *
 * **인자는 줄 끝까지다.** 사람이 쓰는 말이라 빈칸으로 자를 수 없고, 한 글에 하나라는 규칙이
 * 그 경계를 이미 준다.
 *
 * **아이디는 보지 않는다.** 이 글이 우리에게 왔다는 사실은 부르는 쪽이 이미 안다(알림이
 * 그것이다) — 여기서 다시 재면 <b>멘션의 꼴</b>을 우리가 한 번 더 정하게 된다.
 */
export function readCommand(
  body: string,
  declared: readonly BotCommand[],
): CommandCall | undefined {
  /*
   * **줄머리이거나 빈칸 뒤의 `/`다** — 주소의 슬래시(`https://`)나 날짜(`9/29`)에서 열리면
   * 평범한 글이 명령으로 읽힌다. 화면의 자동완성도 같은 자리에서 연다.
   */
  const found = /(?:^|\s)\/([A-Za-z0-9_?-]{1,32})(?:[ \t]+(.*))?$/m.exec(body);

  if (found === null) {
    return undefined;
  }

  const typed = (found[1] ?? '').toLowerCase();

  // **`?`는 여기서 한 번 갈린다** — 그 뒤로는 어디에도 물음표가 없다(선언에도 표에도).
  const name = typed === HELP_ALIAS ? HELP : typed;

  return {
    name,
    args: (found[2] ?? '').trim(),
    known: declared.some((one) => one.name === name),
  };
}

/**
 * 모르는 명령에 **라이브러리가 대신 답한다** (2026-09-29 요구).
 *
 * **자동완성은 약속처럼 보인다.** 화면이 제안한 것이 먹히지 않으면 사람은 <b>자기가 잘못
 * 쳤다고 생각하고</b> 같은 것을 다시 친다 — 봇이 조용하면 그 자리에 다른 답이 없다.
 *
 * **선언에 있는데 브레인이 받지 않은 것**도 여기로 온다. 라이브러리는 선언을 들고 있으므로
 * 그 둘을 가려 말할 수 있고, 봇마다 이 문장을 짓지 않아도 된다.
 */
export function unknownReply(
  call: CommandCall,
  declared: readonly BotCommand[],
): string {
  /*
   * **긴 목록을 여기 쏟지 않는다.** 여기는 <i>그것이 아니다</i>를 말하는 자리이고, 무엇이
   * 있는지는 `/help`가 지는 일이다 — 두 자리가 같은 목록을 지으면 한쪽만 고쳐진다.
   */
  return call.known
    ? `\`/${call.name}\`은(는) 아직 서지 않은 명령입니다. \`/${HELP}\`로 목록을 봅니다.`
    : `\`/${call.name}\`은(는) 제가 모르는 명령입니다. \`/${HELP}\`로 목록을 봅니다.`;
}

/**
 * **매뉴얼** — `/help`(또는 `/?`)가 내는 글 (2026-09-29 요구).
 *
 * **여기서 짓는 까닭은 재료가 이미 여기 있기 때문이다.** 이름·곁글·인자·범위가 선언에 모두
 * 있으므로 봇이 그것을 <b>글로 한 벌 더 적으면</b> 둘이 갈린다 — 명령을 더하고 매뉴얼을
 * 잊는 일이 가장 흔한 어긋남이다(채토의 옛 `HELP` 상수가 그 모양이었다).
 *
 * **임자의 것은 임자에게만 보인다** — 화면이 가리는 것과 같은 잣대다. 다만 여기도
 * <b>친절이지 문이 아니다</b>: 거절은 명령을 받는 자리가 한다.
 *
 * **앞말은 봇이 준다**(<c>lead</c>) — *채토의 명령:* 처럼 제 이름을 대는 줄이고, 없으면
 * 담백한 한 줄이 선다.
 */
export function manual(
  declared: readonly BotCommand[],
  options: { readonly owner?: boolean; readonly lead?: string } = {},
): string {
  const shown = declared.filter((one) => one.who !== 'owner' || options.owner === true);

  if (shown.length === 0) {
    return '이 봇은 명령을 받지 않습니다. 그냥 말을 걸어 주세요.';
  }

  const lines = shown.map((one) => {
    const call = one.args === undefined || one.args === '' ? `/${one.name}` : `/${one.name} ${one.args}`;
    const said = one.summary === undefined || one.summary === '' ? '' : ` — ${one.summary}`;

    // **임자만 쓰는 것에는 표를 단다** — 목록만 있으면 *누구나 쓴다*로 읽힌다.
    const mark = one.who === 'owner' ? ' (임자만)' : '';

    return `- \`${call}\`${said}${mark}`;
  });

  return [options.lead ?? '제가 아는 명령:', ...lines].join('\n');
}
