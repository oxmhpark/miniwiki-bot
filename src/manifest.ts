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
): ManifestView {
  return {
    version: version(codeVersion, bot.settingsVersion),
    name: bot.declaration.name,
    summary: bot.declaration.summary,
    ...(bot.declaration.avatar === undefined ? {} : { avatar: bot.declaration.avatar }),
    ...(bot.declaration.header === undefined ? {} : { header: bot.declaration.header }),
    scopes: [...scopes],
  };
}

/** 선언이 바뀌었는가 — **바뀌었으면 판을 올려야 한다**. */
export function declarationChanged(before: BotDeclaration, after: BotDeclaration): boolean {
  return before.name !== after.name
    || before.summary !== after.summary
    || before.avatar !== after.avatar
    || before.header !== after.header;
}
