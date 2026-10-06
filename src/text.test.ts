import { describe, expect, it } from 'vitest';
import { hashtags, postIdOf, tagKey } from './text.js';

describe('postIdOf', () => {
  it('href의 끝마디에서 글의 id를 뽑는다 — 없으면 undefined', () => {
    const id = '00000001-0000-0000-0000-000000000000';

    expect(postIdOf(`/@kim/${id}`)).toBe(id);
    expect(postIdOf(`/@kim/${id}/`)).toBe(id);
    expect(postIdOf('/@kim')).toBeUndefined();
    expect(postIdOf(null)).toBeUndefined();
    expect(postIdOf(undefined)).toBeUndefined();
  });
});

describe('hashtags · tagKey — 코어의 HashtagSyntax와 같은 규칙', () => {
  it('열쇠로, 겹치지 않게, 나온 차례로', () => {
    expect(hashtags('@채토 #클로드 오늘 #Claude #클로드 날씨')).toEqual(['클로드', 'claude']);
  });

  it('숫자만은 태그가 아니고, 앞뒤에 단어 글자·/·#가 붙으면 아니다', () => {
    expect(hashtags('#2026 a#b https://x.test/#frag ##c #d#')).toEqual([]);
  });

  it('NFKC로 접고 소문자로 내린다', () => {
    expect(tagKey('#ＡＢＣ')).toBe('abc');
    expect(tagKey(' 무작위 복제 ')).toBe('무작위_복제');
    expect(tagKey('#123')).toBeUndefined();
    expect(tagKey('가'.repeat(140))).toBeUndefined();
  });
});
