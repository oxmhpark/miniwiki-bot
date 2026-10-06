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

/** 이 봇이 청하는 권한의 기본 — **봇이 `scopes`로 자기 것을 준다**. */
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
  readonly commands?: readonly (BotCommand & { readonly groups?: readonly string[]; readonly denied?: string })[];
  readonly tags?: BotGates['tags'];
  readonly audience?: BotGates['audience'];
}

/**
 * 판은 **`{코드판}+{설정판}`**이다.
 *
 * 코어는 이 문자열을 비교해 임자에게 *새 판 승인*을 띄운다. 코드판만 실으면 임자가 이름을
 * 고쳐도 시에라가 모르고, 설정판만 실으면 이 프로그램이 스코프를 늘려도 승인이 뜨지 않는다 —
 * **둘 다 오를 자리가 있어야 한다.**
 */
/**
 * **봇의 문** — 선언에 실어 코어가 거르게 하는 것(코어 M61, 2026-10-06 요구).
 *
 * 명령은 이름으로 짝지어 `groups`·`denied`가 붙고, 태그와 `audience`는 선언에 그대로 선다.
 * **그룹은 하나라도 속하면 지나고, 비면 열려 있다.** 문구는 그룹 밖 사람에게 코어가 보낸다.
 */
export interface BotGates {
  readonly commands?: Readonly<Record<string, { readonly groups?: readonly string[]; readonly denied?: string }>>;
  readonly tags?: readonly {
    readonly name: string;
    readonly summary?: string;
    readonly groups?: readonly string[];
    readonly denied?: string;
  }[];
  readonly audience?: { readonly groups?: readonly string[]; readonly denied?: string };
}

/** 문이 적은 그룹 전부 — 정렬해서. */
export function gateGroups(gates: BotGates | undefined): readonly string[] {
  const all = new Set<string>();
  Object.values(gates?.commands ?? {}).forEach((one) => (one.groups ?? []).forEach((name) => all.add(name)));
  (gates?.tags ?? []).forEach((one) => (one.groups ?? []).forEach((name) => all.add(name)));
  (gates?.audience?.groups ?? []).forEach((name) => all.add(name));

  return [...all].sort();
}

/**
 * 선언의 판 — `{코드판}+{설정판}`, **문의 그룹이 있으면 그 지문을 덧붙인다**.
 *
 * **그룹이 바뀌면 판이 바뀌어 시에라에 새 판 승인이 뜬다** — 그룹은 권한이다(그 소속을 봇이 알게
 * 된다). 문구나 태그 이름만 바뀌면 판이 그대로라 코어가 승인 없이 다시 읽는다(`refreshManifest`).
 */
export function version(codeVersion: string, settingsVersion: number, groups: readonly string[] = []): string {
  if (groups.length === 0) {
    return `${codeVersion}+${settingsVersion}`;
  }

  // FNV-1a 32비트 — 암호가 아니라 *바뀌었는가*만 잰다.
  let hash = 0x811c9dc5;
  for (const char of groups.join('\n')) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return `${codeVersion}+${settingsVersion}.g${hash.toString(16).padStart(8, '0')}`;
}

export function manifestOf(
  bot: BotRecord,
  codeVersion: string,
  scopes: readonly string[] = DEFAULT_SCOPES,
  commands?: readonly BotCommand[],
  gates?: BotGates,
): ManifestView {
  const declared = commands === undefined ? undefined : declare(commands).map((one) => {
    const gate = gates?.commands?.[one.name];
    return {
      ...one,
      ...((gate?.groups ?? []).length === 0 ? {} : { groups: [...(gate?.groups ?? [])] }),
      ...(gate?.denied === undefined || gate.denied === '' ? {} : { denied: gate.denied }),
    };
  });

  return {
    version: version(codeVersion, bot.settingsVersion, gateGroups(gates)),
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
    ...(declared === undefined ? {} : { commands: declared }),
    ...((gates?.tags ?? []).length === 0 ? {} : { tags: gates?.tags }),
    ...(gates?.audience === undefined || (gates.audience.groups ?? []).length === 0 ? {} : { audience: gates.audience }),
  };
}

/** 선언이 바뀌었는가 — **바뀌었으면 판을 올려야 한다**. */
export function declarationChanged(before: BotDeclaration, after: BotDeclaration): boolean {
  return before.name !== after.name
    || before.summary !== after.summary
    || before.avatar !== after.avatar
    || before.header !== after.header;
}
