import { SierraError, type JsonRecord, type Sierra } from './sierra.js';

/**
 * **시에라를 도구로** — 모델이 부를 수 있는 일들(2026-10-08 요구 — 채토의 질의가 시에라를 MCP 서버처럼 쓴다).
 *
 * **정의는 MCP 모양이다**(`name` · `description` · `inputSchema`) — 서비스마다의 함수 호출(Anthropic `tools` ·
 * OpenAI `function` · Gemini `functionDeclarations`)로 옮기는 것은 봇이 하고, 나중에 진짜 MCP 서버로 낼 때 이 정의를
 * 그대로 쓴다.
 *
 * **봇 계정으로 부른다** — 모델이 보는 것은 봇이 볼 수 있는 것이다(코어의 판정 그대로). 걸러 내지 않는다(사람이
 * 정했다): 봇을 그룹에 넣거나 팔로우시키면 더 본다.
 *
 * **결과는 줄인 JSON 글자다** — 모델의 컨텍스트를 아끼려고 칸을 고르고 본문을 자른다(`RESULT_MAX`). **오류도 글자로
 * 돌려준다** — 모델이 읽고 다른 길을 고른다. `runTool`은 던지지 않는다.
 */

/** 도구 하나 — MCP의 `Tool`과 같은 칸에 `write`(쓰는가)를 더했다. */
export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: {
    readonly type: 'object';
    readonly properties: Readonly<Record<string, { readonly type: string; readonly description: string }>>;
    readonly required: readonly string[];
  };
  readonly write: boolean;
}

/** 무엇을 해도 되는가 — 쓰기는 **허용 경로(접두어) 아래만**. */
export interface ToolPolicy {
  readonly write: boolean;
  readonly writePaths: readonly string[];
}

/** 결과 하나의 상한(글자) — 넘으면 자르고 그 사실을 적는다. */
const RESULT_MAX = 8000;

/** 글 하나의 본문 상한 — 목록에서. */
const POST_TEXT_MAX = 500;

/** 문서 본문 상한 — 문서 하나를 읽을 때. */
const DOCUMENT_TEXT_MAX = 6000;

const LIMIT = { type: 'integer', description: '몇 개까지 (기본 10, 최대 40)' } as const;

export const SIERRA_TOOLS: readonly ToolDefinition[] = [
  {
    name: 'search_posts',
    description: '이 서버의 글을 찾는다. 문법: 낱말은 모두 들어간 글(AND), "구"는 붙은 말, ~낱말은 뺀다, from:아이디, tag:태그, before:2026-10-01, after:2026-09-01.',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: '검색어' }, limit: LIMIT }, required: ['query'] },
    write: false,
  },
  {
    name: 'read_thread',
    description: '글 하나와 그 쓰레드 전체(조상과 답글)를 읽는다.',
    inputSchema: { type: 'object', properties: { post_id: { type: 'string', description: '글의 id' } }, required: ['post_id'] },
    write: false,
  },
  {
    name: 'lookup_account',
    description: '아이디로 사람(계정)의 프로필을 본다 — 이름, 소개, 커스텀 필드, 글 수.',
    inputSchema: { type: 'object', properties: { handle: { type: 'string', description: '아이디 (@ 없이도 된다)' } }, required: ['handle'] },
    write: false,
  },
  {
    name: 'account_posts',
    description: '그 사람이 쓴 최근 글.',
    inputSchema: { type: 'object', properties: { handle: { type: 'string', description: '아이디' }, limit: LIMIT }, required: ['handle'] },
    write: false,
  },
  {
    name: 'tag_posts',
    description: '해시태그를 단 최근 글.',
    inputSchema: { type: 'object', properties: { tag: { type: 'string', description: '태그 (# 없이도 된다)' }, limit: LIMIT }, required: ['tag'] },
    write: false,
  },
  {
    name: 'search_documents',
    description: '위키 문서를 찾는다 — 경로, 제목, 갱신일, 요약.',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: '검색어' }, limit: LIMIT }, required: ['query'] },
    write: false,
  },
  {
    name: 'recent_documents',
    description: '최근 바뀐 위키 문서 — 누가 언제 무엇을 했는가.',
    inputSchema: { type: 'object', properties: { limit: LIMIT }, required: [] },
    write: false,
  },
  {
    name: 'read_document',
    description: '위키 문서 하나를 읽는다 — 제목, 판 번호, 본문(글자로). 경로는 /로 시작한다(예: /채토/메모).',
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: '문서 경로' } }, required: ['path'] },
    write: false,
  },
  {
    name: 'read_document_source',
    description: '위키 문서의 원본(적힌 그대로의 마크다운)을 읽는다 — 고치기 전에 읽는다. 쓸 수 있는 문서만 된다.',
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: '문서 경로' } }, required: ['path'] },
    write: false,
  },
  {
    name: 'write_document',
    description: '위키 문서를 쓴다 — 없으면 만들고, 있으면 본문 전체를 바꾼다(판 하나가 남아 되돌릴 수 있다). 고칠 때는 먼저 read_document_source로 읽고 base_seq에 그 판 번호를 준다. 허용된 경로 아래만 된다.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '문서 경로' },
        source: { type: 'string', description: '새 본문 전체 (마크다운)' },
        base_seq: { type: 'integer', description: '읽은 판 번호 — 그 사이 누가 고쳤으면 덮어쓴 사실이 돌아온다' },
      },
      required: ['path', 'source'],
    },
    write: true,
  },
];

/** 이 정책에서 모델에게 보일 도구들 — 쓰기는 허락되고 허용 경로가 있을 때만. */
export function toolsFor(policy: ToolPolicy): readonly ToolDefinition[] {
  const writable = policy.write && policy.writePaths.length > 0;
  return SIERRA_TOOLS.filter((one) => !one.write || writable);
}

/** 문서 경로를 하나의 모양으로 — 앞에 `/`, 뒤의 `/`는 뗀다. */
export function normalPath(path: string): string {
  const inner = path.split('/').map((one) => one.trim()).filter((one) => one !== '').join('/');
  return `/${inner}`;
}

/** 허용 경로 아래인가 — 그 경로 자신이거나 그 아래. */
export function writable(path: string, policy: ToolPolicy): boolean {
  if (!policy.write) {
    return false;
  }

  const at = normalPath(path);
  return policy.writePaths.some((prefix) => {
    const base = normalPath(prefix);
    return base === '/' || at === base || at.startsWith(`${base}/`);
  });
}

/** 도구 하나를 부른다 — **던지지 않는다**: 오류도 결과 글자다. 쓴 문서는 `wrote`에 남긴다. */
export async function runTool(
  sierra: Sierra, name: string, args: unknown, policy: ToolPolicy, wrote: string[] = [],
): Promise<string> {
  const given = (args ?? {}) as Readonly<Record<string, unknown>>;
  const text = (key: string): string => (typeof given[key] === 'string' ? (given[key] as string).trim() : '');
  const limit = Math.min(Math.max(Number.isInteger(given['limit']) ? (given['limit'] as number) : 10, 1), 40);

  try {
    switch (name) {
      case 'search_posts':
        return out((await sierra.searchPosts(need(text('query'), 'query'), limit)).map(postOf));
      case 'read_thread':
        return out((await sierra.context(need(text('post_id'), 'post_id'))).map((one) => postOf(one as unknown as JsonRecord)));
      case 'lookup_account':
        return out(accountOf(await sierra.lookup(need(text('handle'), 'handle'))));
      case 'account_posts': {
        const account = await sierra.lookup(need(text('handle'), 'handle'));
        return out((await sierra.accountPosts(String(account['id']), limit)).map(postOf));
      }
      case 'tag_posts':
        return out((await sierra.tagPosts(need(text('tag'), 'tag'), limit)).map(postOf));
      case 'search_documents':
        return out((await sierra.searchDocuments(need(text('query'), 'query'), limit)).map((one) => pick(one, ['path', 'title', 'updated_at', 'summary'])));
      case 'recent_documents':
        return out((await sierra.documentUpdates(limit)).map((one) => pick(one, ['path', 'title', 'actor_handle', 'event', 'created_at'])));
      case 'read_document': {
        const document = await sierra.documentByPath(normalPath(need(text('path'), 'path')));
        return out({
          ...pick(document, ['path', 'title', 'revision_seq', 'can_write', 'redirect_to']),
          body: clip(plain(String(document['body'] ?? '')), DOCUMENT_TEXT_MAX),
        });
      }
      case 'read_document_source': {
        const document = await sierra.documentByPath(normalPath(need(text('path'), 'path')));
        if (document['can_write'] !== true) {
          return failure('이 문서는 쓸 수 없어 원본을 읽지 못한다 — read_document로 본문을 읽는다.');
        }
        return out({
          ...pick(document, ['path', 'title', 'revision_seq']),
          source: clip(await sierra.documentSource(String(document['id'])), DOCUMENT_TEXT_MAX * 2),
        });
      }
      case 'write_document':
        return await write(sierra, text('path'), typeof given['source'] === 'string' ? given['source'] : '', given['base_seq'], policy, wrote);
      default:
        return failure(`모르는 도구다: ${name}`);
    }
  } catch (error) {
    if (error instanceof SierraError) {
      return failure(error.status === 404 ? '없다(또는 봇이 볼 수 없다)' : `시에라가 거절했다(${String(error.status)}): ${error.body.slice(0, 200)}`);
    }
    return failure((error as Error).message);
  }
}

async function write(
  sierra: Sierra, raw: string, source: string, baseSeq: unknown, policy: ToolPolicy, wrote: string[],
): Promise<string> {
  const path = normalPath(need(raw, 'path'));

  if (!writable(path, policy)) {
    return failure(`이 경로에는 쓸 수 없다 — 허용된 경로: ${policy.writePaths.map(normalPath).join(', ') || '(없음)'}`);
  }
  if (source.trim() === '') {
    return failure('본문이 비었다 — 지우는 일은 이 도구가 하지 않는다.');
  }

  let id: string;
  let seq = Number.isInteger(baseSeq) ? (baseSeq as number) : 0;

  try {
    const known = await sierra.documentByPath(path);
    id = String(known['id']);
    if (seq === 0) {
      seq = Number(known['revision_seq'] ?? 0);
    }
  } catch (error) {
    if (!(error instanceof SierraError) || error.status !== 404) {
      throw error;
    }
    id = String((await sierra.createDocument(path))['id']);
    seq = 0;
  }

  const saved = await sierra.saveDocument(id, source, seq);
  wrote.push(path);

  return out({ path, seq: saved.seq, overwritten: saved.overwritten });
}

function need(value: string, name: string): string {
  if (value === '') {
    throw new Error(`${name}이(가) 비었다`);
  }
  return value;
}

/** 글 하나를 줄인다 — 누가 · 언제 · 어디서 · 무엇을. 원격 글은 HTML이라 글자로 푼다. */
function postOf(item: JsonRecord): JsonRecord {
  const author = (item['author'] ?? item['account']) as JsonRecord | undefined;
  const body = typeof item['content'] === 'string' && item['content'] !== ''
    ? String(item['content'])
    : plain(String(item['content_html'] ?? ''));

  return {
    id: item['id'],
    ...(item['kind'] === undefined ? {} : { kind: item['kind'] }),
    author: author?.['acct'] ?? author?.['handle'],
    at: item['created_at'],
    visibility: item['visibility'],
    ...(item['in_reply_to'] === undefined || item['in_reply_to'] === null ? {} : { in_reply_to: item['in_reply_to'] }),
    text: clip(body, POST_TEXT_MAX),
  };
}

function accountOf(account: JsonRecord): JsonRecord {
  return {
    ...pick(account, ['id', 'handle', 'display_name', 'is_bot', 'created_at', 'posts_count', 'followers_count', 'following_count']),
    bio: clip(String(account['bio'] ?? ''), POST_TEXT_MAX),
    ...(Array.isArray(account['fields']) ? { fields: account['fields'] } : {}),
  };
}

function pick(record: JsonRecord, keys: readonly string[]): JsonRecord {
  return Object.fromEntries(keys.filter((key) => record[key] !== undefined && record[key] !== null).map((key) => [key, record[key]]));
}

/** HTML을 글자로 — 꼬리표를 걷고 줄은 남긴다. 모델에게 가는 것이라 모양을 지킬 일이 없다. */
function plain(html: string): string {
  return html
    .replace(/<(br|\/p|\/li|\/h\d|\/tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…(잘림)`;
}

function out(value: unknown): string {
  const text = JSON.stringify(value);
  return text.length <= RESULT_MAX ? text : `${text.slice(0, RESULT_MAX)}…(결과가 길어 잘림 — limit을 줄여 다시 부른다)`;
}

function failure(message: string): string {
  return JSON.stringify({ error: message });
}
