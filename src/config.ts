/**
 * 이 **프로세스**의 설정 — 봇의 설정이 아니다.
 *
 * 여기 있는 것은 *어느 봇에도 속하지 않는 것*뿐이다: 듣는 포트, 사람이 닿는 주소, 봉인 열쇠,
 * 상태 폴더, GitHub 가입에 쓰는 앱. **봇의 설정(시에라 주소·클라이언트·선언)은 상태에 산다** —
 * 봇은 사람이 화면에서 만드는 것이라 환경 변수로 설 수 없다.
 *
 * > 이 경계가 멀티테넌트의 시작이다. `_CLIENT_ID` 하나가 환경에 있으면 그 배포는 테넌트
 * > 하나짜리다(모체 `PROJECT.md`, *봇은 멀티테넌트를 전제로 짓는다*).
 */

export interface BotServiceConfig {
  /**
   * 사람이 브라우저로 닿는 이 서비스의 주소 — 가입·봇 등록·연결 링크와 **봇마다의 선언**이
   * 여기서 난다. 코어의 `PrivateAddressGuard`가 사설 주소를 막으므로 **공개 HTTPS**여야 한다.
   */
  readonly publicOrigin: string;

  /** 듣는 포트. `BOT_PORT` → `PORT` → 8080. */
  readonly port: number;

  /**
   * 맡은 비밀을 봉하는 열쇠. **잃으면 모든 봇의 자격 증명과 모든 사람의 키를 함께 잃는다** —
   * 봇 수만큼 무게가 커졌다. 바꾸는 것은 곧 전원 로그아웃이다.
   */
  readonly secret: string;

  /** 상태가 사는 **폴더** — `accounts/`와 `bots/`. */
  readonly stateDir: string;

  /** 임자가 이 서비스에 가입하는 길 — GitHub OAuth 앱. */
  readonly githubClientId: string;
  readonly githubClientSecret: string;

  /** 봇 하나가 알림을 보는 주기(ms). **봇마다 자기 시계로 돈다.** */
  readonly pollMs: number;

  /**
   * 한 계정이 만들 수 있는 봇 수.
   *
   * **코어의 `bot.max_per_user`(기본 3)를 넘겨 봐야 시에라가 막는다.** 그 값은 그 시에라
   * 관리자의 것이고 시에라마다 다를 수 있어 여기서 알 길이 없다 — 같은 수를 기본으로 둔다.
   */
  readonly maxBotsPerAccount: number;

  /** **읽고 부르되 쓰지 않는다** — 답이 어떻게 나올지 로그로 본다. */
  readonly dryRun: boolean;
}

const DEFAULTS = {
  stateDir: 'state',
  pollMs: 30 * 1000,
  port: 8080,
  maxBotsPerAccount: 3,
} as const;

export class ConfigError extends Error {}

/** 숫자 하나 — 초 단위로 받아 ms로 낸다. */
export function seconds(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new ConfigError(`${name}: 양의 정수(초)여야 합니다 — 받은 값 '${raw}'`);
  }

  return parsed * 1000;
}

function count(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new ConfigError(`${name}: 양의 정수여야 합니다 — 받은 값 '${raw}'`);
  }

  return parsed;
}

function port(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0 || parsed > 65535) {
    throw new ConfigError(`${name}: 포트 번호여야 합니다 — 받은 값 '${raw}'`);
  }

  return parsed;
}

export function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (value === undefined || value.trim() === '') {
    throw new ConfigError(`${name}이(가) 없습니다.`);
  }

  return value.trim();
}

function optional(env: NodeJS.ProcessEnv, name: string, fallback: string): string {
  const value = env[name];
  return value === undefined || value.trim() === '' ? fallback : value.trim();
}

export function readConfig(env: NodeJS.ProcessEnv): BotServiceConfig {
  const secret = required(env, 'BOT_SECRET');
  if (secret.length < 16) {
    throw new ConfigError('BOT_SECRET: 열여섯 글자 이상이어야 합니다.');
  }

  return {
    publicOrigin: required(env, 'BOT_PUBLIC_ORIGIN').replace(/\/+$/, ''),
    port: port(env.BOT_PORT ?? env.PORT, DEFAULTS.port, 'BOT_PORT'),
    secret,
    stateDir: optional(env, 'BOT_STATE', DEFAULTS.stateDir),
    githubClientId: required(env, 'BOT_GITHUB_CLIENT_ID'),
    githubClientSecret: required(env, 'BOT_GITHUB_CLIENT_SECRET'),
    pollMs: seconds(env.BOT_POLL_SECONDS, DEFAULTS.pollMs, 'BOT_POLL_SECONDS'),
    maxBotsPerAccount: count(
      env.BOT_MAX_PER_ACCOUNT, DEFAULTS.maxBotsPerAccount, 'BOT_MAX_PER_ACCOUNT'),
    dryRun: env.BOT_DRY_RUN === 'true',
  };
}
