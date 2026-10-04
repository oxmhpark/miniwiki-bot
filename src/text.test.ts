import { describe, expect, it } from 'vitest';
import { postIdOf } from './text.js';

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
