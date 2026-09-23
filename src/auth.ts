import { randomUUID } from 'node:crypto';
import type { AccountRecord, FileStore, Identity } from './state.js';

/**
 * 임자가 이 서비스에 들어오는 길 — **GitHub OAuth**.
 *
 * **자기 비밀번호를 지지 않는다.** 지면 잊은 비밀번호·재설정 메일·그 메일을 보내는 자리가
 * 따라 붙고, 그것은 봇 서버가 질 것이 아니다. 시에라도 GitHub·구글로 로그인하므로 임자는
 * 이미 그 신원을 갖고 있다.
 *
 * **여기서 받는 것은 이 서비스의 신원뿐이다** — 시에라의 계정도, 봇의 자격 증명도 아니다.
 * 임자가 GitHub으로 들어온 뒤에 **자기 시에라에서 받은 것을 손으로 붙인다**.
 */

const AUTHORIZE = 'https://github.com/login/oauth/authorize';
const TOKEN = 'https://github.com/login/oauth/access_token';
const USER = 'https://api.github.com/user';

export class GithubAuthError extends Error {}

export interface GithubUser {
  readonly id: number;
  readonly login: string;
}

export interface GithubApp {
  readonly clientId: string;
  readonly clientSecret: string;
  /** 돌아올 자리 — `{publicOrigin}/auth/github/callback`. */
  readonly redirectUri: string;
}

/** 보낼 곳 — `state`는 부르는 쪽이 티켓으로 낸 것이다(**CSRF를 막는 자리**). */
export function authorizeUrl(app: GithubApp, state: string): string {
  const query = new URLSearchParams({
    client_id: app.clientId,
    redirect_uri: app.redirectUri,
    state,
    // 공개 프로필만 본다 — 봇을 세우는 데 그 이상이 필요 없다.
    scope: 'read:user',
  });

  return `${AUTHORIZE}?${query}`;
}

/** 코드를 사람으로 바꾼다. */
export async function exchange(app: GithubApp, code: string): Promise<GithubUser> {
  const granted = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      client_id: app.clientId,
      client_secret: app.clientSecret,
      code,
      redirect_uri: app.redirectUri,
    }),
  });

  if (!granted.ok) {
    throw new GithubAuthError(`GitHub이 토큰을 주지 않았다: ${granted.status}`);
  }

  const token = (await granted.json()) as {
    readonly access_token?: string;
    readonly error_description?: string;
  };

  if (token.access_token === undefined) {
    throw new GithubAuthError(token.error_description ?? 'GitHub이 토큰을 주지 않았다');
  }

  const profile = await fetch(USER, {
    headers: {
      authorization: `Bearer ${token.access_token}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'miniwiki-bot',
    },
  });

  if (!profile.ok) {
    throw new GithubAuthError(`GitHub이 사람을 주지 않았다: ${profile.status}`);
  }

  const user = (await profile.json()) as GithubUser;
  if (typeof user.id !== 'number') {
    throw new GithubAuthError('GitHub의 답에 id가 없다');
  }

  return user;
}

/**
 * 들어온 사람을 계정으로 맞이한다 — **있으면 찾고 없으면 낸다**.
 *
 * 열쇠는 **숫자 id**다. 로그인 이름은 바뀌므로 그것으로 찾으면 이름을 바꾼 사람이 남의
 * 계정에 앉거나 자기 봇을 잃는다.
 */
export async function welcome(
  store: FileStore,
  user: GithubUser,
  now: () => Date = () => new Date(),
): Promise<AccountRecord> {
  const identity: Identity = { provider: 'github', subject: String(user.id) };

  const found = await store.accountByIdentity(identity);
  if (found !== undefined) {
    if (found.login === user.login) {
      return found;
    }

    // 이름만 따라 적는다 — 열쇠는 그대로다.
    const renamed: AccountRecord = { ...found, login: user.login };
    await store.saveAccount(renamed);

    return renamed;
  }

  const made: AccountRecord = {
    id: randomUUID(),
    identity,
    login: user.login,
    createdAt: now().toISOString(),
  };

  await store.saveAccount(made);

  return made;
}
