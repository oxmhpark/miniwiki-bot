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

  /**
   * 그 사람이 속한 그룹들 — **프로필을 묻는 자리에서만 찬다**.
   *
   * <b>글·메시지의 작성자에는 실리지 않는다</b>(코어의 `PostProjection`은 `badge_html`만
   * 채운다). 그룹으로 무언가를 가르려면 `account(id)`를 따로 부르고 <b>그 답의 `account`
   * 안에서</b> 읽는다(`AccountProfile`).
   *
   * **뱃지를 끈 그룹은 여기 없다** — `Permission.Groups` 권한자에게만 보인다(코어 39 확정 2).
   * 봇은 보통 그 권한이 없으므로, 뱃지가 꺼진 그룹으로 거르면 **아무도 걸리지 않는다.**
   */
  readonly groups?: readonly string[];
}

/**
 * 한 사람의 프로필 — **계정을 감싼다**(코어의 `AccountProfileView`).
 *
 * <b>`groups`는 이 안의 `account`에 있다.</b> 펼쳐져 오지 않으므로 최상위에서 읽으면 늘
 * `undefined`다 — 2026-09-23에 에코가 아무도 걸러 내지 못하고 조용히 놀던 까닭이 이것이었다.
 */
export interface AccountProfile {
  readonly account: AccountRef;

  /**
   * **자동화 계정인가.** 프로필에만 실린다 — 글·알림에 실린 계정 한 칸에는 없다(코어가
   * 목록에서 조인을 늘리지 않으려고 뺐다). 봇끼리 핑퐁을 막으려면 이 값이 든다.
   */
  readonly is_bot?: boolean;

  /** 이사해 간 곳 — AP `movedTo`. */
  readonly moved_to?: string | null;
}

/** 나가는 글의 공개 범위. **`public`은 코어에 없는 이름이다**(2026-09-08에 400으로 드러났다). */
export type Visibility = 'server' | 'federated' | 'followers' | 'private';

/** 글에 붙은 것 하나 — 코어의 `MediaView`. */
export interface MediaRef {
  readonly id: string;
  readonly kind?: string;
  readonly mime_type?: string | null;
  /** 원본을 받는 자리. 상대 경로로 온다 — `origin`을 붙여 부른다. */
  readonly url?: string | null;
  readonly description?: string | null;
  readonly byte_size?: number;
}

/** 메시지함의 한 줄 — `PostView`를 감싼다. */
export interface MessageEntry {
  readonly message: {
    readonly id: string;
    readonly author: AccountRef;
    readonly content: string;
    readonly media?: readonly MediaRef[];
  };
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

  /**
   * 참여한 메시지들 — **`since_id` 뒤의 것만**. 코어는 최신순으로 돌려준다.
   *
   * **알림이 아니라 메시지함을 본다.** `/notifications`에는 `since_id`가 없어 *새것만*을
   * 물을 수 없다(`max_id`뿐이다) — 폴링이 커서로 도는 쪽을 고른다.
   */
  messages(since: string | undefined): Promise<readonly MessageEntry[]>;

  /** 한 사람의 프로필 — **그룹과 `is_bot`을 아는 유일한 자리**다. */
  account(id: string): Promise<AccountProfile>;

  /** 공개 글 하나. `mediaIds`가 있으면 그것을 붙인다. */
  publish(body: string, visibility: Visibility, mediaIds?: readonly string[]): Promise<void>;

  /**
   * 붙은 것 하나를 **받아 온다** — 봇의 눈으로 연다.
   *
   * 메시지의 첨부는 그 쓰레드의 권한을 타므로 인증이 든다. 못 받으면 던진다.
   */
  fetchMedia(url: string): Promise<{ readonly bytes: Uint8Array; readonly mime: string }>;

  /**
   * 받은 것을 **봇의 것으로 다시 올린다** — `multipart/form-data`.
   *
   * <b>원본 id를 그대로 붙일 수는 없다.</b> 코어는 미디어의 접근 권한을 *그것이 붙은 글*
   * 하나로 판정하고(`EnsureVisibleAsync`) `post_id`는 하나뿐이다 — 남의 것을 그대로 실으면
   * 보는 사람에게 깨지거나(권한이 원본 글을 따른다) 원본 글에서 첨부가 사라진다.
   */
  uploadMedia(
    bytes: Uint8Array, mime: string, description?: string,
  ): Promise<{ readonly id: string }>;

  /**
   * 마지막으로 낸 글의 시각 — **코어가 진실원이다**. 상태를 잃은 배포가 시계를 되찾는다.
   *
   * **스코프가 둘 든다**: 자기 아이디에 `read:accounts`, 자기 글 목록에 **`read:feeds`**
   * (2026-09-08에 403으로 드러났다 — 계정의 글은 프로필이 아니라 *목록*의 권한을 탄다).
   * **없으면 없는 것으로 친다** — 시계를 못 되찾을 뿐 봇은 그대로 돈다.
   */
  lastPost(): Promise<number | undefined>;
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

  async messages(since: string | undefined): Promise<readonly MessageEntry[]> {
    const query = since === undefined ? '' : `?since_id=${encodeURIComponent(since)}`;
    return await this.send<readonly MessageEntry[]>('GET', `/api/v1/messages${query}`);
  }

  async account(id: string): Promise<AccountProfile> {
    return await this.send<AccountProfile>('GET', `/api/v1/accounts/${encodeURIComponent(id)}`);
  }

  async publish(
    body: string, visibility: Visibility, mediaIds?: readonly string[],
  ): Promise<void> {
    await this.send('POST', '/api/v1/posts', {
      body,
      visibility,
      ...(mediaIds === undefined || mediaIds.length === 0 ? {} : { media_ids: [...mediaIds] }),
    });
  }

  async fetchMedia(url: string): Promise<{ readonly bytes: Uint8Array; readonly mime: string }> {
    const target = url.startsWith('http') ? url : `${this.config.origin}${url}`;

    const response = await fetch(target, {
      headers: { authorization: `Bearer ${await this.accessToken()}` },
    });

    if (!response.ok) {
      throw new SierraError(response.status, await response.text());
    }

    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      mime: response.headers.get('content-type') ?? 'application/octet-stream',
    };
  }

  async uploadMedia(
    bytes: Uint8Array, mime: string, description?: string,
  ): Promise<{ readonly id: string }> {
    const form = new FormData();
    // **코어는 매직 바이트로 형식을 판정한다** — 여기 적는 이름과 타입은 참고일 뿐이다.
    form.set('file', new Blob([bytes], { type: mime }), 'attachment');
    if (description !== undefined && description !== '') {
      form.set('description', description);
    }

    const response = await fetch(`${this.config.origin}/api/v1/media`, {
      method: 'POST',
      headers: { authorization: `Bearer ${await this.accessToken()}` },
      body: form,
    });

    if (!response.ok) {
      throw new SierraError(response.status, await response.text());
    }

    return (await response.json()) as { readonly id: string };
  }

  async lastPost(): Promise<number | undefined> {
    try {
      const me = await this.me();
      const posts = await this.send<readonly { readonly created_at: string }[]>(
        'GET', `/api/v1/accounts/${me.id}/posts?limit=1`,
      );

      const newest = posts[0]?.created_at;
      if (newest === undefined) {
        return undefined;
      }

      const at = Date.parse(newest);
      return Number.isNaN(at) ? undefined : at;
    } catch {
      return undefined;
    }
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
