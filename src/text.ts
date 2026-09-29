/**
 * 나가는 글이 지나는 규칙들 — **전부 순수 함수다**.
 *
 * 봇이 쓰는 글은 사람이 쓴 것과 같은 자리에 선다. 그래서 **남을 부르지 않는 것**과
 * **한도를 넘지 않는 것**은 봇이 무엇을 하든 지켜야 한다.
 */

/**
 * 멘션을 무력화한다. 봇이 `@아이디`를 글에 실으면 그대로 나가 **남을 소환한다** —
 * 지어낸 이름이면 더 나쁘다. **지우지 않고 전각(`＠`)으로 바꾼다**: 지우면 무슨 말이었는지
 * 읽을 수 없다. 해시태그는 건드리지 않는다.
 */
export function defuseMentions(body: string): string {
  return body.replace(/(^|[^\w@])@(?=[\w.-])/g, '$1＠');
}

/** 트리거 본문에서 **나를 부른 멘션**을 뗀다 — 앞에 서 있으면 명령의 `/`가 안 보인다. */
export function stripMention(body: string, handle: string): string {
  const pattern = new RegExp(`(^|[^\\w/])@${escapeRegExp(handle)}(?![\\w@])`, 'gi');
  return body.replace(pattern, '$1').replace(/[ \t]{2,}/g, ' ').trim();
}

/**
 * 한도에 맞춘다 — 넘치면 자르고 **잘렸음을 말한다**.
 *
 * `tail`은 남는다. 꼬리표(있다면)가 잘리면 *왜 이렇게 끝났는가*를 읽을 자리가 없다.
 */
export function fit(body: string, maxLength: number, tail = ''): string {
  const room = maxLength - tail.length;
  if (room <= 1) {
    return tail.trim().slice(0, maxLength);
  }

  const trimmed = body.trim();
  const cut = trimmed.length > room ? `${trimmed.slice(0, room - 1).trimEnd()}…` : trimmed;

  return `${cut}${tail}`;
}

/** 화면에 사람이 적은 것을 실을 때 — **HTML은 이 자리 하나로만 나간다**. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 알림이 가리키는 **글의 아이디** — `href`의 끝마디 (2026-09-29에 채토에서 올렸다).
 *
 * **알림에는 본문이 없다.** 어느 글이 나를 불렀는지만 오므로, 무엇이라 했는지는 그 글을
 * 다시 물어야 안다(`context`) — 그 첫 걸음이 여기다.
 *
 * **봇마다 다시 쓰지 않는다.** 주소의 모양은 코어의 것이고, 봇이 저마다 정규식을 들면
 * <b>코어가 그 모양을 바꿀 때 어느 봇이 멈추는지 셀 수 없다.</b>
 */
export function postIdOf(href: string | null | undefined): string | undefined {
  if (href === null || href === undefined) {
    return undefined;
  }

  return /\/([0-9a-fA-F-]{36})\/?$/.exec(href)?.[1];
}
