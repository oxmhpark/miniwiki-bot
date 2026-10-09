import { describe, expect, it } from 'vitest';
import { manifestOf, version } from './manifest.js';
import type { BotRecord } from './state.js';

const BOT: BotRecord = {
  id: 'b1', accountId: 'a1', origin: 'https://s.test',
  declaration: { name: '채토', summary: '답한다' }, settingsVersion: 3,
};

describe('manifestOf — 봇의 문(코어 M61)', () => {
  it('명령에 그룹·문구가 붙고 태그와 audience가 선다', () => {
    const view = manifestOf(BOT, '0.3.0', ['read:posts'], [{ name: 'usage', who: 'everyone' }], {
      commands: { usage: { groups: ['질의'], denied: '안에서만' } },
      tags: [{ name: '클로드', groups: ['질의'] }],
      audience: { groups: ['질의'], denied: '못 듣는다' },
    });

    expect(view.commands?.find((one) => one.name === 'usage')).toMatchObject({ groups: ['질의'], denied: '안에서만' });
    expect(view.commands?.find((one) => one.name === 'help')?.groups).toBeUndefined();
    expect(view.tags).toEqual([{ name: '클로드', groups: ['질의'] }]);
    expect(view.audience).toEqual({ groups: ['질의'], denied: '못 듣는다' });
  });

  it('**그룹이 바뀌면 판이 바뀌고, 문구만 바뀌면 판이 그대로다**', () => {
    const one = manifestOf(BOT, '0.3.0', [], undefined, { tags: [{ name: 'a', groups: ['질의'], denied: '하나' }] });
    const reworded = manifestOf(BOT, '0.3.0', [], undefined, { tags: [{ name: 'b', groups: ['질의'], denied: '둘' }] });
    const widened = manifestOf(BOT, '0.3.0', [], undefined, { tags: [{ name: 'a', groups: ['관리자'] }] });

    expect(one.version).toBe(reworded.version);
    expect(one.version).not.toBe(widened.version);
    expect(version('0.3.0', 3)).toBe('0.3.0+3');
    expect(one.version).toMatch(/^0\.3\.0\+3\.g[0-9a-f]{8}$/);
  });

  it('문이 없으면 옛 모양 그대로다 — 이미 선 봇의 판이 바뀌지 않는다', () => {
    const view = manifestOf(BOT, '0.3.0', [], undefined, undefined);
    expect(view.version).toBe('0.3.0+3');
    expect(view.tags).toBeUndefined();
    expect(view.audience).toBeUndefined();
  });
});

describe('manifestOf — 필요한 확장(코어 M66 확정 3)', () => {
  it('requires가 선언에 실리고, 없으면 칸째로 빠진다', () => {
    const view = manifestOf(BOT, '0.4.1', [], undefined, undefined, [{ name: 'sierrachat', version: '>=1.1.0' }]);
    expect(view.requires).toEqual([{ name: 'sierrachat', version: '>=1.1.0' }]);
    expect(view.version).toBe('0.4.1+3');

    expect('requires' in manifestOf(BOT, '0.4.1', [], undefined, undefined)).toBe(false);
    expect('requires' in manifestOf(BOT, '0.4.1', [], undefined, undefined, [])).toBe(false);
  });
});
