import type { BotCommand } from './commands.js';
import { declare } from './commands.js';
import type { BotDeclaration, BotRecord } from './state.js';

/**
 * 봇이 자기를 말하는 파일 — **봇마다 다르다**.
 *
 * 코어는 이 주소 하나로 봇을 세운다(`POST /api/v1/bots`). **설치하는 사람이 이름과 스코프를
 * 베껴 적지 않게 하는 것**이 이 파일의 목적이라, 한 서비스가 봇 여럿을 지면 선언도 여럿이어야
 * 한다 — 그래서 `/bots/{botId}/manifest.json`이고, 저장소 루트의 것은 **새 봇의 틀**이다.
 */

/** 이 봇이 청하는 권한 — **포크한 봇이 자기 것으로 바꾼다**. */
export const DEFAULT_SCOPES = [
  'read:notifications',
  'read:posts',
  'write:posts',
  'read:accounts',
] as const;

export interface ManifestView {
  readonly version: string;
  readonly name: string;
  readonly summary: string;
  readonly avatar?: string;
  readonly header?: string;
  readonly scopes: readonly string[];

  /**
   * 이 봇이 알아듣는 명령 — **없으면 칸째로 빠진다**(2026-09-29 요구).
   *
   * **안 적은 것과 없다고 적은 것은 다르다.** 코어는 칸이 없으면 담긴 것을 건드리지 않고,
   * `[]`를 받으면 지운다 — 명령을 들이지 않는 봇이 <b>남의 판에서 담긴 것을 지우는</b>
   * 일이 없어야 한다.
   */
  readonly commands?: readonly BotCommand[];
}

/**
 * 판은 **`{코드판}+{설정판}`**이다.
 *
 * 코어는 이 문자열을 비교해 임자에게 *새 판 승인*을 띄운다. 코드판만 실으면 임자가 이름을
 * 고쳐도 시에라가 모르고, 설정판만 실으면 이 프로그램이 스코프를 늘려도 승인이 뜨지 않는다 —
 * **둘 다 오를 자리가 있어야 한다.**
 */
export function version(codeVersion: string, settingsVersion: number): string {
  return `${codeVersion}+${settingsVersion}`;
}

export function manifestOf(
  bot: BotRecord,
  codeVersion: string,
  scopes: readonly string[] = DEFAULT_SCOPES,
  commands?: readonly BotCommand[],
): ManifestView {
  return {
    version: version(codeVersion, bot.settingsVersion),
    name: bot.declaration.name,
    summary: bot.declaration.summary,
    ...(bot.declaration.avatar === undefined ? {} : { avatar: bot.declaration.avatar }),
    ...(bot.declaration.header === undefined ? {} : { header: bot.declaration.header }),
    scopes: [...scopes],

    /*
     * **내려서 싣는다**(`declare`) — 코어도 내려서 담지만, 여기서 내리면 <b>어긋난 선언이
     * 봇 서버에서 먼저 걸린다</b>: 코어의 거절은 사람이 설치를 눌러야 보이고 그때는 이미
     * 늦다.
     */
    ...(commands === undefined ? {} : { commands: declare(commands) }),
  };
}

/** 선언이 바뀌었는가 — **바뀌었으면 판을 올려야 한다**. */
export function declarationChanged(before: BotDeclaration, after: BotDeclaration): boolean {
  return before.name !== after.name
    || before.summary !== after.summary
    || before.avatar !== after.avatar
    || before.header !== after.header;
}
