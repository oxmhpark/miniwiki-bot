import { randomBytes } from 'node:crypto';

/**
 * 링크 하나를 한 번 쓰게 하는 표 — **메모리에만 있다**.
 *
 * 프로세스가 죽으면 링크가 죽는다. 그래도 되는 이유는 다시 말을 걸면 새 링크가 오기 때문이고,
 * 디스크에 남기면 *언제 지우는가*가 새 물음이 된다.
 *
 * **무엇에 쓰는 표인지는 부르는 쪽이 정한다**(`T`). 봇 템플릿이 아는 쓰임은 둘이다 —
 * 사람에게 보내는 연결 링크와, GitHub 왕복의 `state`. 포크한 봇이 셋째를 더해도 된다.
 */
export interface Ticket<T> {
  readonly payload: T;
  readonly issuedAt: number;
}

export const TICKET_TTL_MS = 15 * 60 * 1000;

export class Tickets<T> {
  private readonly live = new Map<string, Ticket<T>>();

  constructor(
    private readonly ttlMs: number = TICKET_TTL_MS,
    private readonly now: () => number = () => Date.now(),
  ) {}

  issue(payload: T): string {
    this.sweep();

    const token = randomBytes(24).toString('base64url');
    this.live.set(token, { payload, issuedAt: this.now() });

    return token;
  }

  /** 본다 — 살아 있으면 돌려주고 태우지 않는다(폼을 그리는 자리). */
  peek(token: string): T | undefined {
    this.sweep();
    return this.live.get(token)?.payload;
  }

  /** 쓴다 — **한 번뿐이다**. */
  take(token: string): T | undefined {
    const found = this.peek(token);
    if (found !== undefined) {
      this.live.delete(token);
    }

    return found;
  }

  private sweep(): void {
    const now = this.now();
    for (const [token, ticket] of this.live) {
      if (now - ticket.issuedAt > this.ttlMs) {
        this.live.delete(token);
      }
    }
  }
}
