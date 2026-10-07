import { describe, expect, it } from 'vitest';
import { homePage, landingPage } from './pages.js';

const account = { id: 'a1', login: 'okb', githubId: 1, createdAt: 0 } as never;

describe('제목줄의 드나드는 단추', () => {
  it('로그인한 사람에게는 내 봇들과 나가기가 제목줄에 나란히 선다', () => {
    const html = landingPage('채토', '', account);
    const top = /<header class="top">([\s\S]*?)<\/header>/.exec(html)?.[1] ?? '';

    expect(top).toContain('href="/bots"');
    expect(top).toContain('나가기');
    // 본문에는 더 서지 않는다.
    expect(html.match(/내 봇들/g)).toHaveLength(1);
  });

  it('내 봇들에서는 그 단추가 지금 자리임을 말한다', () => {
    expect(homePage('채토', account, [], 3)).toContain('href="/bots" aria-current="page">내 봇들');
  });
});
