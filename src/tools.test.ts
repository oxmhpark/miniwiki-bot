import { describe, expect, it } from 'vitest';
import { SierraError } from './sierra.js';
import { fakeSierra } from './testing.js';
import { normalPath, runTool, SIERRA_TOOLS, toolsFor, writable } from './tools.js';

const POLICY = { write: true, writePaths: ['/채토'] };

describe('도구의 정의', () => {
  it('MCP 모양이다 — 이름·설명·입력 스키마(object)', () => {
    for (const one of SIERRA_TOOLS) {
      expect(one.name).toMatch(/^[a-z_]+$/);
      expect(one.description.length).toBeGreaterThan(10);
      expect(one.inputSchema.type).toBe('object');
      for (const key of one.inputSchema.required) {
        expect(one.inputSchema.properties[key]).toBeDefined();
      }
    }
  });

  it('쓰기 도구는 쓰기가 허락되고 허용 경로가 있을 때만 보인다', () => {
    const names = (policy: { write: boolean; writePaths: string[] }): string[] => toolsFor(policy).map((one) => one.name);
    expect(names({ write: false, writePaths: ['/채토'] })).not.toContain('write_document');
    expect(names({ write: true, writePaths: [] })).not.toContain('write_document');
    expect(names({ write: true, writePaths: ['/채토'] })).toContain('write_document');
  });

  it('허용 경로는 그 자신과 그 아래 — 이름만 닮은 옆 경로는 아니다', () => {
    expect(normalPath('채토/메모/')).toBe('/채토/메모');
    expect(writable('/채토', POLICY)).toBe(true);
    expect(writable('/채토/메모', POLICY)).toBe(true);
    expect(writable('/채토봇/메모', POLICY)).toBe(false);
    expect(writable('/다른', POLICY)).toBe(false);
  });
});

describe('runTool', () => {
  it('검색 결과를 줄인다 — 누가 · 언제 · 본문 앞부분', async () => {
    const sierra = fakeSierra({
      searchPosts: async (query) => {
        expect(query).toBe('from:kim 복제');
        return [{ id: 'p1', kind: 'local', author: { handle: 'kim' }, created_at: '2026-10-08', visibility: 'server', content: 'x'.repeat(900), media: [] }];
      },
    });

    const got = JSON.parse(await runTool(sierra, 'search_posts', { query: 'from:kim 복제' }, POLICY)) as { author: string; text: string }[];

    expect(got[0]?.author).toBe('kim');
    expect(got[0]?.text.endsWith('…(잘림)')).toBe(true);
    expect(got[0]).not.toHaveProperty('media');
  });

  it('없거나 볼 수 없으면 오류를 글자로 돌려준다 — 던지지 않는다', async () => {
    const sierra = fakeSierra({ documentByPath: async () => { throw new SierraError(404, ''); } });
    expect(JSON.parse(await runTool(sierra, 'read_document', { path: '/없다' }, POLICY))).toEqual({ error: '없다(또는 봇이 볼 수 없다)' });
    expect(JSON.parse(await runTool(sierra, 'nope', {}, POLICY)).error).toContain('모르는 도구');
    expect(JSON.parse(await runTool(sierra, 'search_posts', {}, POLICY)).error).toContain('query');
  });

  it('쓰기 — 없으면 만들고 저장, 있으면 그 판으로 저장, 허용 경로 밖은 거절', async () => {
    const calls: string[] = [];
    const docs = new Map<string, { id: string; seq: number }>([['/채토/있다', { id: 'd1', seq: 3 }]]);
    const sierra = fakeSierra({
      documentByPath: async (path) => {
        const doc = docs.get(path);
        if (doc === undefined) {
          throw new SierraError(404, '');
        }
        return { id: doc.id, path, revision_seq: doc.seq };
      },
      createDocument: async (path) => { calls.push(`create ${path}`); return { id: 'd2', path }; },
      saveDocument: async (id, _source, base) => { calls.push(`save ${id}@${String(base)}`); return { seq: base + 1, overwritten: false }; },
    });
    const wrote: string[] = [];

    await runTool(sierra, 'write_document', { path: '채토/새것', source: '# 새것' }, POLICY, wrote);
    await runTool(sierra, 'write_document', { path: '/채토/있다', source: '고친 본문' }, POLICY, wrote);
    const outside = JSON.parse(await runTool(sierra, 'write_document', { path: '/남의/문서', source: '...' }, POLICY, wrote)) as { error: string };

    expect(calls).toEqual(['create /채토/새것', 'save d2@0', 'save d1@3']);
    expect(wrote).toEqual(['/채토/새것', '/채토/있다']);
    expect(outside.error).toContain('쓸 수 없다');
  });

  it('원본은 쓸 수 있는 문서만 — 아니면 읽으라고 말한다', async () => {
    const sierra = fakeSierra({ documentByPath: async () => ({ id: 'd1', can_write: false, body: '<p>본문</p>' }) });
    expect(JSON.parse(await runTool(sierra, 'read_document_source', { path: '/x' }, POLICY)).error).toContain('read_document');
    expect(JSON.parse(await runTool(sierra, 'read_document', { path: '/x' }, POLICY)).body).toBe('본문');
  });
});
