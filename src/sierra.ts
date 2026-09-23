/**
 * 코어와 말하는 자리 — **HTTP가 여기에만 있다**.
 *
 * 봇은 시에라를 `import` 하지 않는다. 코어 밖의 프로그램이므로 만나는 곳은 주소뿐이고,
 * 그래서 이 파일이 계약의 전부다. 모양은 코어의 뷰를 **읽는 만큼만** 옮겨 적었다
 * (`sierra/src/Sierra.Social/Views/SocialViews.cs`).
 *
 * **자격 증명을 인자로 받는다** — 프로세스 설정에서 읽지 않는다. 한 프로세스가 봇 여럿을
 * 지고 봇마다 붙는 시에라와 클라이언트가 다르므로, 이 클래스는 **테넌트마다 하나씩 선다**.
 */

/** 봇 하나가 시에라에 대는 신분 — 상태에 봉해 두었다가 풀어서 넘긴다. */
export interface SierraCredentials {
  /** 코어의 주소. 끝의 `/`는 떼어 둔다. */
  readonly origin: string;
  readonly clientId: string;
  readonly clientSecret: string;
}

export interface AccountRef {
  readonly id: string;
  readonly handle: string;
  readonly display_name?: string;
}

/** 알림의 행위자 — 로컬(`id`·`handle`)일 수도 원격(`acct`)일 수도 있다. */
export interface ActorRef {
  readonly id?: string;
  readonly handle?: string;
  readonly acct?: string;
}

export interface Notification {
  readonly id: string;
  readonly kind: string;
  readonly actor: ActorRef;
  readonly href: string | null;
  readonly created_at: string;
}

/**
 * 쓰레드의 한 마디 — `/context`의 항목. `kind`가 `local`이면 `PostView`, `remote`면
 * 원격 글이다. 숨김·삭제된 자리는 placeholder로 온다(`hidden`·`deleted`).
 */
export interface ThreadItem {
  readonly kind: 'local' | 'remote';
  readonly id: string;
  readonly author?: ActorRef;
  readonly content?: string;
  readonly visibility?: string;
  readonly in_reply_to?: string | null;
  readonly thread_root_id?: string;
  readonly recipients?: readonly AccountRef[];
  readonly hidden?: boolean;
  readonly deleted?: boolean;
  readonly created_at?: string;
}

/** 봇이 코어에 하는 일 — **검사가 이 자리를 대신 채운다**. */
export interface Sierra {
  /** 나 — 아이디와 id. */
  me(): Promise<AccountRef>;

  /** `post.max_length` — 익명으로 열리는 `/api/v1/instance`에서. 없으면 20000. */
  maxPostLength(): Promise<number>;

  /** `min_id` 뒤의 알림들. **코어는 최신 순으로 돌려준다** — 부르는 쪽이 뒤집어 처리한다. */
  notifications(minId: string | undefined): Promise<readonly Notification[]>;

  /** 쓰레드 전체 — 평평한 목록, `created_at` 순. */
  context(postId: string): Promise<readonly ThreadItem[]>;

  /**
   * 답글. **`visibility`도 `recipients`도 싣지 않는다** — 뿌리를 상속하고(M25), DM
   * 쓰레드면 참가자가 복사된다.
   */
  reply(body: string, inReplyTo: string): Promise<void>;

  /** 메시지 하나 — `recipients`가 있으면 그것이 곧 DM이다. */
  message(body: string, handle: string): Promise<void>;
}

interface TokenResponse {
  readonly access_token: string;
  readonly expires_in: number;
}

/** 토큰은 짧고 회전이 없다(M22). **만료 30초 전에 갈아 끼운다.** */
const RENEW_MARGIN_MS = 30 * 1000;

export class SierraError extends Error {
  constructor(readonly status: number, readonly body: string) {
    super(`시에라가 ${status}로 답했습니다: ${body.slice(0, 200)}`);
    this.name = 'SierraError';
  }

  /** 코어의 오류 키(`ERRORS.md`) — 본문이 JSON이 아니면 `undefined`. */
  get key(): string | undefined {
    try {
      const parsed = JSON.parse(this.body) as { readonly error?: string };
      return parsed.error;
    } catch {
      return undefined;
    }
  }

  /** `429 rate_limited`의 `retry_after`(초). */
  get retryAfter(): number | undefined {
    try {
      const parsed = JSON.parse(this.body) as { readonly retry_after?: number };
      return parsed.retry_after;
    } catch {
      return undefined;
    }
  }
}

export class SierraClient implements Sierra {
  private token: string | undefined;
  private expiresAt = 0;

  constructor(
    private readonly config: SierraCredentials,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async me(): Promise<AccountRef> {
    return await this.send<AccountRef>('GET', '/api/v1/accounts/verify_credentials');
  }

  async maxPostLength(): Promise<number> {
    const response = await fetch(`${this.config.origin}/api/v1/instance`);
    if (!response.ok) {
      throw new SierraError(response.status, await response.text());
    }

    const instance = (await response.json()) as {
      readonly settings?: Readonly<Record<string, unknown>>;
    };
    const raw = instance.settings?.['post.max_length'];
    const parsed = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10);

    return Number.isNaN(parsed) || parsed <= 0 ? 20_000 : parsed;
  }

  async notifications(minId: string | undefined): Promise<readonly Notification[]> {
    const query = new URLSearchParams({ limit: '40' });
    if (minId !== undefined) {
      query.set('min_id', minId);
    }

    return await this.send<readonly Notification[]>('GET', `/api/v1/notifications?${query}`);
  }

  async context(postId: string): Promise<readonly ThreadItem[]> {
    return await this.send<readonly ThreadItem[]>(
      'GET', `/api/v1/posts/${encodeURIComponent(postId)}/context`,
    );
  }

  async reply(body: string, inReplyTo: string): Promise<void> {
    await this.send('POST', '/api/v1/posts', { body, in_reply_to: inReplyTo });
  }

  async message(body: string, handle: string): Promise<void> {
    await this.send('POST', '/api/v1/posts', { body, recipients: [handle] });
  }

  /** 비밀은 바디로 보낸다 — 프록시가 헤더를 적는 일이 흔하다. */
  private async accessToken(): Promise<string> {
    if (this.token !== undefined && this.now() < this.expiresAt - RENEW_MARGIN_MS) {
      return this.token;
    }

    const response = await fetch(`${this.config.origin}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      }),
    });

    if (!response.ok) {
      throw new SierraError(response.status, await response.text());
    }

    const granted = (await response.json()) as TokenResponse;

    this.token = granted.access_token;
    this.expiresAt = this.now() + granted.expires_in * 1000;

    return granted.access_token;
  }

  private async send<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await this.accessToken();

    const response = await fetch(`${this.config.origin}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    if (!response.ok) {
      // 401이 만료 때문일 수 있다 — 버리면 다음 요청이 새것을 받아 낫는다.
      if (response.status === 401) {
        this.token = undefined;
      }

      throw new SierraError(response.status, await response.text());
    }

    return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
  }
}
