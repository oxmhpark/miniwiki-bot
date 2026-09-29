import { describe, expect, it } from 'vitest';
import { declare, readCommand, unknownReply, type BotCommand } from './commands.js';

/*
 * 봇이 알아듣는 명령 — **`@아이디 /이름 인자`** (2026-09-29 요구).
 *
 * **여기서 재는 것은 <i>같은 목록이 두 방향을 진다</i>는 것이다.** 선언이 코어로 나가고
 * 들어온 글이 그 목록으로 읽힌다 — 둘이 갈리면 <b>화면이 제안한 명령을 봇이 모른다</b>.
 */

const SAY: BotCommand = { name: 'say', who: 'everyone', args: '<할 말>' };
const DRAIN: BotCommand = { name: 'drain', who: 'owner' };

describe('명령 선언', () => {
  /** **내리는 자리는 하나다** — 선언·파싱·화면이 저마다 내리면 한 곳이 잊힌다. */
  it('이름을 내려서 받는다', () => {
    expect(declare([{ name: '  SAY ', who: 'everyone' }])[0]?.name).toBe('say');
  });

  it.each(['', 'say hello', '말하기', 'say!', 'a'.repeat(33)])(
    '이름이 어긋나면 던진다: %s',
    (name) => {
      expect(() => declare([{ name, who: 'everyone' }])).toThrow();
    },
  );

  /**
   * **범위는 반드시 적는다** — 기본값을 두면 *적지 않은 것*과 *그 값으로 정한 것*이
   * 구분되지 않는다. 코어도 같은 자리에서 거절한다.
   */
  it('범위가 없으면 던진다', () => {
    expect(() => declare([{ name: 'say' } as BotCommand])).toThrow();
  });

  /** **내린 뒤에 견준다** — `Say`와 `say`는 같은 명령이다. */
  it('같은 이름이 둘이면 던진다', () => {
    expect(() => declare([SAY, { name: 'SAY', who: 'owner' }])).toThrow();
  });
});

describe('명령 읽기', () => {
  const declared = declare([SAY, DRAIN]);

  it('이름과 인자를 가른다', () => {
    expect(readCommand('@echo /say 안녕하세요', declared))
      .toEqual({ name: 'say', args: '안녕하세요', known: true });
  });

  /** **인자는 줄 끝까지다** — 사람이 쓰는 말이라 빈칸으로 자를 수 없다. */
  it('인자는 줄 끝까지다', () => {
    expect(readCommand('@echo /say 여러 낱말 이 줄 전부', declared)?.args)
      .toBe('여러 낱말 이 줄 전부');
  });

  it('인자가 없으면 빈 글자다', () => {
    expect(readCommand('@echo /drain', declared))
      .toEqual({ name: 'drain', args: '', known: true });
  });

  /** **내려서 견준다** — 사람이 대문자로 쳐도 같은 명령이다. */
  it('대소문자를 가리지 않는다', () => {
    expect(readCommand('@echo /SAY 안녕', declared)?.name).toBe('say');
  });

  /**
   * **줄머리이거나 빈칸 뒤의 `/`다** — 주소나 날짜에서 열리면 평범한 글이 명령으로 읽힌다.
   * 화면의 자동완성도 같은 자리에서 연다.
   */
  it.each([
    'https://example.com/say 보세요',
    '오늘은 9/29입니다',
    '경로는 a/say 입니다',
  ])('붙어 있는 슬래시는 명령이 아니다: %s', (body) => {
    expect(readCommand(body, declared)).toBeUndefined();
  });

  /** **모르는 명령도 읽어 낸다** — 읽지 못하면 *모른다*고 답할 수도 없다. */
  it('모르는 이름도 읽어 낸다', () => {
    expect(readCommand('@echo /nope 무엇', declared))
      .toEqual({ name: 'nope', args: '무엇', known: false });
  });

  /** **한 글에 하나다** — 여럿을 받으면 차례와 실패의 뜻이 생긴다. */
  it('첫 번째 것만 읽는다', () => {
    expect(readCommand('/say 하나\n/drain', declared)?.name).toBe('say');
  });

  it('명령이 없으면 아무것도 아니다', () => {
    expect(readCommand('@echo 그냥 말을 겁니다', declared)).toBeUndefined();
  });
});

describe('모르는 명령에 답하기', () => {
  const declared = declare([SAY, DRAIN]);

  /**
   * **자동완성은 약속처럼 보인다** — 제안한 것이 먹히지 않으면 사람은 자기가 잘못 쳤다고
   * 생각하고 같은 것을 다시 친다. 봇이 조용하면 그 자리에 다른 답이 없다.
   */
  it('모르는 것과 아직 안 선 것을 가려 말한다', () => {
    const unknown = unknownReply(
      { name: 'nope', args: '', known: false }, declared);
    const idle = unknownReply(
      { name: 'say', args: '', known: true }, declared);

    expect(unknown).toContain('모르는');
    expect(idle).toContain('아직');

    // 둘 다 **지금 되는 것**을 함께 말한다 — 다시 물어보게 하지 않는다.
    expect(unknown).toContain('/say');
    expect(idle).toContain('/drain');
  });

  it('명령을 받지 않는 봇은 그렇다고 말한다', () => {
    expect(unknownReply({ name: 'nope', args: '', known: false }, []))
      .toContain('명령을 받지 않습니다');
  });
});
