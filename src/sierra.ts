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

  /**
   * 그 글에 붙은 것들 — **코어의 `PostView.Media`가 그대로 실려 온다**(2026-09-24에 타입만
   * 뒤늦게 세웠다).
   *
   * `url`은 **상대 경로**이고 받으려면 인증이 든다(`fetchMedia` — 쓰레드 권한을 탄다).
   * 숨김·삭제된 자리(placeholder)와 원격 항목에는 없다.
   */
  readonly media?: readonly MediaRef[];

  readonly hidden?: boolean;
  readonly deleted?: boolean;
  readonly created_at?: string;
}

/** 코어의 응답 그대로 — 부르는 쪽이 읽고 줄인다. 칸을 여기서 다 적지 않는다: 코어가 칸을 늘려도 봇이 따라 고칠 일이 없다. */
export type JsonRecord = Readonly<Record<string, unknown>>;

/**
 * `POST /api/v1/bots/me/manifest`의 답 — 섰는가(`applied`), 아니면 왜 아닌가(`groups_changed`), 그리고 **이번에 시에라 임자에게
 * 새 판을 알렸는가**(`noticed`, 2026-10-09 — 한 판에 한 번이라 다음에는 `false`. 옛 코어는 싣지 않는다).
 */
export interface ManifestRefresh {
  readonly applied: boolean;
  readonly reason?: string | null;
  readonly noticed?: boolean;
}

/**
 * **봇의 질의 문**에 싣는 것 — `POST /api/v1/bots/me/query`(sierrachat, 모체 M66 · 2026-10-09).
 *
 * 봇은 키를 모른다 — 코어가 **말 거는 사람의 키링**으로 모델을 부르고, 쓰레드도 그 사람의 시야로 읽는다.
 * 말 거는 사람은 `postId`의 글쓴이이고, 코어는 그 글이 이 봇을 불렀는지 확인한다(그 글 id가 곧 *그 사람이 부른
 * 일*의 증거다). 스코프 `chat:query`가 든다 — 선언이 청하고 시에라 임자가 승인한다.
 */
export interface QueryOptions {
  /** 그 사람이 덧붙인 프롬프트 — 봇의 성격(등록정보) 뒤에 선다. */
  readonly prompt?: string;
  /** 부른 글의 첨부를 모델에게 보내는 한도 — 코어가 미디어를 직접 읽는다. `max_count: 0`이면 보내지 않는다. */
  readonly media?: { readonly max_count: number; readonly max_bytes: number };
  /** 시에라 도구 — 말 거는 사람의 시야와 권한으로 돈다. 쓰기는 `write_paths` 아래만. */
  readonly tools?: { readonly mode: 'off' | 'read' | 'write'; readonly write_paths: readonly string[] };
}

/**
 * 모델의 답 — `text`(마크다운)·`html`(코어가 구운 것), 실패면 `error`(문장이 아니라 키다 — 말은 봇이 짓는다).
 * `wrote`는 도구가 고친 문서의 경로, `skipped_media`는 한도 밖이라 보내지 않은 첨부의 수.
 */
export type QueryAnswer =
  | {
      readonly text: string;
      readonly html: string;
      readonly service: string;
      readonly model: string;
      readonly wrote?: readonly string[];
      readonly skipped_media?: number;
      readonly error?: undefined;
    }
  | {
      readonly error: QueryError;
      readonly service: string;
      readonly model: string;
    };

/** `answer.error`의 키들 — 코어가 늘리면 모르는 키도 올 수 있다(`string`). */
export type QueryError =
  | 'insufficient_credit' | 'key_rejected' | 'service_rate_limited' | 'model_not_found'
  | 'refused' | 'service_error' | 'no_key' | 'interrupted' | (string & {});

/**
 * 모델을 부르지 않고 코어가 답한 것 — 명령(`/model`·`/help`)의 답이거나 부를 수 없는 사정. 낱말은 봇이 짓는다.
 */
export type QueryNotice =
  | { readonly kind: 'models'; readonly service: string; readonly current?: string; readonly models: readonly string[] }
  | { readonly kind: 'model_set'; readonly service: string; readonly model: string }
  | { readonly kind: 'help'; readonly commands: readonly { readonly name: string; readonly aliases?: readonly string[]; readonly args?: string }[] }
  | { readonly kind: 'no_key'; readonly service?: string }
  | { readonly kind: 'keyring_not_granted'; readonly bot?: string }
  | { readonly kind: 'unknown_service'; readonly given: string }
  | { readonly kind: 'unknown_model'; readonly service: string; readonly given: string }
  | { readonly kind: 'quota'; readonly limit: number }
  | { readonly kind: 'empty_query' };

/** 질의 문의 답 — 둘 중 하나가 선다. */
export type QueryResult =
  | { readonly answer: QueryAnswer; readonly notice?: undefined }
  | { readonly notice: QueryNotice; readonly answer?: undefined };

/** 봇이 코어에 하는 일 — **검사가 이 자리를 대신 채운다**. */
export interface Sierra {
  /** 나 — 아이디와 id. */
  me(): Promise<AccountRef>;

  /** `post.max_length` — 익명으로 열리는 `/api/v1/instance`에서. 없으면 20000. */
  maxPostLength(): Promise<number>;

  // ── 글·사람·문서의 읽기·쓰기 (2026-10-08 — v0.23의 도구가 쓰던 문. 도구는 v0.26에 코어로 갔다) ──
  // **봇 계정으로 읽는다** — 봇이 볼 수 있는 것을 본다(코어의 판정 그대로).

  /** 글 검색 — `GET /api/v1/search`(문법: `from:` `tag:` `before:` `after:` `"구"` `~부정`). `read:feeds`. */
  searchPosts(query: string, limit?: number): Promise<readonly JsonRecord[]>;
  /** 글 하나 — `GET /api/v1/posts/{id}`. */
  post(id: string): Promise<JsonRecord>;
  /** 아이디로 계정 — `GET /api/v1/accounts/lookup`. */
  lookup(handle: string): Promise<JsonRecord>;
  /** 그 사람의 글 — `GET /api/v1/accounts/{id}/posts`. `read:feeds`. */
  accountPosts(id: string, limit?: number): Promise<readonly JsonRecord[]>;
  /** 해시태그의 글 — `GET /api/v1/tags/{tag}`. `read:feeds`. */
  tagPosts(tag: string, limit?: number): Promise<readonly JsonRecord[]>;
  /** 위키 문서 — `GET /api/v1/documents/by-path/{path}`(렌더된 본문 · 판 번호). 확장이 없으면 404. */
  documentByPath(path: string): Promise<JsonRecord>;
  /** 문서의 원본 — `GET /api/v1/documents/{id}/source.md`. **쓸 수 있는 사람만** 받는다. */
  documentSource(id: string): Promise<string>;
  /** 문서 검색 — `GET /api/v1/documents/search`. */
  searchDocuments(query: string, limit?: number): Promise<readonly JsonRecord[]>;
  /** 최근 바뀐 문서 — `GET /api/v1/documents/updates`. */
  documentUpdates(limit?: number): Promise<readonly JsonRecord[]>;
  /** 문서를 세운다 — `POST /api/v1/documents`. `write:posts`, 그 경로의 쓰기 권한. */
  createDocument(path: string): Promise<JsonRecord>;
  /** 본문을 저장한다 — `PUT /api/v1/documents/{id}/source`. 저장 하나가 판 하나이고, 낡은 판에 저장하면 `overwritten`이 선다. */
  saveDocument(id: string, source: string, baseSeq: number): Promise<{ readonly seq: number; readonly overwritten: boolean }>;

  /**
   * **이 봇의 글이 연합에 닿는가** (2026-10-07) — 사이트 AND 봇 계정. 코어의 `FederationGate`와 같은
   * 판정이고, 닿지 않으면 코어가 `federated`를 `server`로 낮춰 저장한다. 사이트 값은 `/instance`의
   * 공개 설정, 계정 값은 `/settings/user`(`read:accounts`)다.
   *
   * **모르면 `undefined`다** — 옛 코어는 사이트 값을 내지 않고, 낮추지도 않는다. 그때 *닿지 않는다*고
   * 답하면 연합하는 서버에서 봇이 연합을 스스로 끈다.
   */
  federates(): Promise<boolean | undefined>;

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
   * 참여한 메시지들 — 코어는 **최신순**으로 돌려준다.
   *
   * **알림이 아니라 메시지함을 본다.** `/notifications`에는 `since_id`가 없어 *새것만*을
   * 물을 수 없다(`max_id`뿐이다).
   *
   * - `since`(`since_id`) — 그 뒤의 새것만. **커서로 도는 봇**이 쓴다.
   * - `before`(`max_id`) — 그 앞의 옛것. **과거로 넘기는** 봇이 쓴다.
   * - `limit` — 한 판. 코어의 상한은 `list.limit_max`(기본 40)이고 넘기면 그 값으로 깎인다.
   */
  messages(
    since: string | undefined,
    page?: { readonly before?: string; readonly limit?: number },
  ): Promise<readonly MessageEntry[]>;

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
   * **에셋 풀에 올린다** — `sierradoc` 확장의 자리다(`POST /api/v1/assets`).
   *
   * 미디어로 직접 올리는 것과 갈리는 점:
   *
   * - **파일이 한 번만 저장된다.** 글에 붙일 때(`assetToMedia`) 바이트를 복사하지 않고
   *   첨부 행이 에셋의 파일을 가리킨다 — 같은 것을 여러 글에 붙여도 저장은 하나다.
   * - **사람이 관리한다.** 에셋 풀 화면이 태그로 목록을 그리므로 봇이 쌓은 것을 보고 지운다.
   * - **에셋을 지우면 그것을 붙인 옛 글의 그림도 사라진다**(코어 44 확정 1·3).
   *
   * **라벨(`groups_read`·`groups_write`)은 올리는 자리가 정한다** — 고치는 일은 관리자의
   * 것이고(37 확정 4) 봇이 값으로 넘길 수는 없다. 대신 **어디에 올릴지로 고른다**:
   *
   * | `document` | 라벨 | 태그 |
   * |---|---|---|
   * | 없다(에셋 풀) | **올린 사람의 `groups` 전부** | 준 `tag` 하나 |
   * | 있다(그 문서) | 그 문서 사슬에서 **가장 깊은 `groups_read`** | 그 문서 사슬의 태그(준 `tag`는 무시된다) |
   *
   * 봇이 여러 그룹에 들어 있으면 풀로 올린 에셋은 **그 그룹이 전부 찍혀 넓어진다** — 쓰기
   * 권한 때문에 든 그룹(루트의 `편집자` 같은)까지 라벨이 되기 때문이다. **지금은 좁힐 길이
   * 없다**(48 확정 5가 그 자리다).
   *
   * **`document`는 문서에 딸린 그림을 올리는 길이지 라벨을 고르는 손잡이가 아니다.** 그
   * 문서의 쓰기 사슬을 지나야 하고(조상을 포함한다 — 38 확정 9) 라벨과 태그는 그 문서가 정한다.
   *
   * **확장이 없는 시에라에서는 404다** — 부르는 쪽이 미디어 직접 올리기로 물러선다.
   *
   * **태그는 여럿일 수 있다**(2026-10-07) — `tag` 칸을 거듭 적는다. 코어가 하나만 받던 판에서는
   * 마지막 하나만 붙는다.
   */
  uploadAsset(
    bytes: Uint8Array, mime: string, name: string, tag?: string | readonly string[], document?: string,
  ): Promise<{ readonly id: string }>;

  /**
   * 에셋을 **첨부로 바꾼다** — `POST /api/v1/assets/{id}/to-media`.
   *
   * 바이트를 열지 않는다. 읽을 수 있는 에셋만 붙고 못 읽으면 404다(존재가 새지 않는다).
   * **붙고 나면 그 글을 보는 사람 모두가 그 파일을 본다.**
   */
  assetToMedia(assetId: string): Promise<{ readonly id: string }>;

  /**
   * 마지막으로 낸 글의 시각 — **코어가 진실원이다**. 상태를 잃은 배포가 시계를 되찾는다.
   *
   * **스코프가 둘 든다**: 자기 아이디에 `read:accounts`, 자기 글 목록에 **`read:feeds`**
   * (2026-09-08에 403으로 드러났다 — 계정의 글은 프로필이 아니라 *목록*의 권한을 탄다).
   * **없으면 없는 것으로 친다** — 시계를 못 되찾을 뿐 봇은 그대로 돈다.
   */
  lastPost(): Promise<number | undefined>;

  /**
   * **그 사람이 그 그룹들에 드는가** — 선언의 트리거에 적혀 **승인된 그룹에 한해** 답한다(코어 M61).
   * 그룹마다 `true`/`false`, **없는 그룹은 `null`**. 프로필의 `groups`와 달리 뱃지를 끈 그룹도 답한다.
   */
  membership(accountId: string, groups: readonly string[]): Promise<Readonly<Record<string, boolean | null>>>;

  /**
   * **말 거는 사람의 키링으로 묻는다** — `POST /api/v1/bots/me/query`(sierrachat, 모체 M66).
   *
   * `body`는 멘션을 뗀 말이다. 코어가 채팅방과 같은 명령 읽기를 지난다 — `/model`·`/help`·`/ask`는 명령이고 아니면
   * 질의다. **동기다** — 모델이 답할 때까지 기다린다. 스코프 `chat:query`가 없거나 그 글이 이 봇을 부르지 않았으면
   * 403(`chat_query_not_invoked`·`chat_query_remote`)으로 던진다.
   */
  query(postId: string, body: string, options?: QueryOptions): Promise<QueryResult>;

  /**
   * **제 선언을 코어가 다시 읽게 한다** — 트리거의 그룹이 그대로면 승인 없이 선다(코어 M61 확정 4).
   * 그룹이 바뀌었으면 `applied: false`, `reason: 'groups_changed'` — 시에라 임자의 승인을 기다린다.
   */
  refreshManifest(): Promise<ManifestRefresh>;
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
    private readonly log: (line: string) => void = (line) => console.warn(line),
  ) {}

  async me(): Promise<AccountRef> {
    return await this.send<AccountRef>('GET', '/api/v1/accounts/verify_credentials');
  }

  async federates(): Promise<boolean | undefined> {
    const response = await fetch(`${this.config.origin}/api/v1/instance`);
    if (!response.ok) {
      throw new SierraError(response.status, await response.text());
    }

    const instance = (await response.json()) as { readonly settings?: Readonly<Record<string, unknown>> };
    const site = instance.settings?.['federation.enabled'];
    if (typeof site !== 'boolean') {
      return undefined;
    }
    if (!site) {
      return false;
    }

    const mine = await this.send<Readonly<Record<string, { readonly value?: unknown } | undefined>>>(
      'GET', '/api/v1/settings/user');

    return mine['federation.enabled']?.value === true;
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

  async searchPosts(query: string, limit = 20): Promise<readonly JsonRecord[]> {
    return await this.send('GET', `/api/v1/search?${new URLSearchParams({ q: query, limit: String(limit) }).toString()}`);
  }

  async post(id: string): Promise<JsonRecord> {
    return await this.send('GET', `/api/v1/posts/${encodeURIComponent(id)}`);
  }

  async lookup(handle: string): Promise<JsonRecord> {
    return await this.send('GET', `/api/v1/accounts/lookup?${new URLSearchParams({ handle: handle.replace(/^@/, '') }).toString()}`);
  }

  async accountPosts(id: string, limit = 20): Promise<readonly JsonRecord[]> {
    return await this.send('GET', `/api/v1/accounts/${encodeURIComponent(id)}/posts?limit=${String(limit)}`);
  }

  async tagPosts(tag: string, limit = 20): Promise<readonly JsonRecord[]> {
    return await this.send('GET', `/api/v1/tags/${encodeURIComponent(tag.replace(/^#/, ''))}?limit=${String(limit)}`);
  }

  async documentByPath(path: string): Promise<JsonRecord> {
    return await this.send('GET', `/api/v1/documents/by-path/${documentPath(path)}`);
  }

  async documentSource(id: string): Promise<string> {
    return await this.send('GET', `/api/v1/documents/${encodeURIComponent(id)}/source.md`, undefined, 'text');
  }

  async searchDocuments(query: string, limit = 10): Promise<readonly JsonRecord[]> {
    return await this.send('GET', `/api/v1/documents/search?${new URLSearchParams({ q: query, per_page: String(limit) }).toString()}`);
  }

  async documentUpdates(limit = 20): Promise<readonly JsonRecord[]> {
    return await this.send('GET', `/api/v1/documents/updates?limit=${String(limit)}`);
  }

  async createDocument(path: string): Promise<JsonRecord> {
    return await this.send('POST', '/api/v1/documents', { path });
  }

  async saveDocument(id: string, source: string, baseSeq: number): Promise<{ readonly seq: number; readonly overwritten: boolean }> {
    return await this.send('PUT', `/api/v1/documents/${encodeURIComponent(id)}/source`, { source, base_seq: baseSeq });
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

  async messages(
    since: string | undefined,
    page?: { readonly before?: string; readonly limit?: number },
  ): Promise<readonly MessageEntry[]> {
    const query = new URLSearchParams();
    if (since !== undefined) {
      query.set('since_id', since);
    }
    if (page?.before !== undefined) {
      query.set('max_id', page.before);
    }
    if (page?.limit !== undefined) {
      query.set('limit', String(page.limit));
    }

    const tail = query.size === 0 ? '' : `?${query}`;

    return await this.send<readonly MessageEntry[]>('GET', `/api/v1/messages${tail}`);
  }

  async account(id: string): Promise<AccountProfile> {
    return await this.send<AccountProfile>('GET', `/api/v1/accounts/${encodeURIComponent(id)}`);
  }

  async membership(
    accountId: string, groups: readonly string[],
  ): Promise<Readonly<Record<string, boolean | null>>> {
    const query = new URLSearchParams({ groups: groups.join(',') });
    return await this.send('GET', `/api/v1/bots/me/membership/${encodeURIComponent(accountId)}?${query}`);
  }

  async query(postId: string, body: string, options: QueryOptions = {}): Promise<QueryResult> {
    return await this.send('POST', '/api/v1/bots/me/query', {
      post_id: postId,
      body,
      ...(options.prompt === undefined ? {} : { prompt: options.prompt }),
      ...(options.media === undefined ? {} : { media: options.media }),
      ...(options.tools === undefined ? {} : { tools: options.tools }),
    });
  }

  async refreshManifest(): Promise<ManifestRefresh> {
    return await this.send('POST', '/api/v1/bots/me/manifest');
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

  async uploadAsset(
    bytes: Uint8Array, mime: string, name: string, tag?: string | readonly string[], document?: string,
  ): Promise<{ readonly id: string }> {
    const form = new FormData();
    form.set('file', new Blob([bytes], { type: mime }), name);
    form.set('name', name);
    for (const one of typeof tag === 'string' ? [tag] : tag ?? []) {
      if (one !== '') {
        form.append('tag', one);
      }
    }
    if (document !== undefined && document !== '') {
      form.set('document', document);
    }

    const response = await fetch(`${this.config.origin}/api/v1/assets`, {
      method: 'POST',
      headers: { authorization: `Bearer ${await this.accessToken()}` },
      body: form,
    });

    if (!response.ok) {
      throw new SierraError(response.status, await response.text());
    }

    return (await response.json()) as { readonly id: string };
  }

  async assetToMedia(assetId: string): Promise<{ readonly id: string }> {
    return await this.send<{ readonly id: string }>(
      'POST', `/api/v1/assets/${encodeURIComponent(assetId)}/to-media`);
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
    } catch (error) {
      // **없는 것으로 친다** — 다만 조용히는 아니다. 스코프(`read:feeds`)가 빠진 것이 여기서 드러난다.
      this.log(`마지막 글을 묻지 못했다 — ${(error as Error).message}`);
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

  private async send<T>(method: string, path: string, body?: unknown, as: 'json' | 'text' = 'json'): Promise<T> {
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

    if (response.status === 204) {
      return undefined as T;
    }

    return (as === 'text' ? await response.text() : await response.json()) as T;
  }
}

/** 문서 경로를 주소의 마디로 — 마디마다 거른다(`/`는 마디를 가르는 것이지 글자가 아니다). 앞뒤의 `/`는 뗀다. */
function documentPath(path: string): string {
  return path.split('/').filter((one) => one !== '').map(encodeURIComponent).join('/');
}
