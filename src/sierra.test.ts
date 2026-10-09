import { afterEach, describe, expect, it, vi } from 'vitest';
import { cannotAttach, SierraClient, SierraError } from './sierra.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('uploadAsset', () => {
  it('태그 여럿은 tag 칸을 거듭 적고, 빈 것은 뺀다', async () => {
    const forms: FormData[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (url.endsWith('/oauth/token')) {
        return new Response(JSON.stringify({ access_token: 't', expires_in: 3600 }));
      }
      forms.push(init?.body as FormData);
      return new Response(JSON.stringify({ id: 'a1' }));
    });

    const client = new SierraClient({ origin: 'https://s.test', clientId: 'c', clientSecret: 's' });
    await client.uploadAsset(new Uint8Array([1]), 'image/png', '표지', ['인물', '', '풍경']);
    await client.uploadAsset(new Uint8Array([1]), 'image/png', '표지', '하나');

    expect(forms[0]?.getAll('tag')).toEqual(['인물', '풍경']);
    expect(forms[1]?.getAll('tag')).toEqual(['하나']);
  });
});

describe('federates', () => {
  function stub(site: unknown, user: unknown): string[] {
    const asked: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      asked.push(new URL(url).pathname);
      if (url.endsWith('/oauth/token')) {
        return new Response(JSON.stringify({ access_token: 't', expires_in: 3600 }));
      }
      if (url.endsWith('/api/v1/instance')) {
        return new Response(JSON.stringify({ settings: site === undefined ? {} : { 'federation.enabled': site } }));
      }
      return new Response(JSON.stringify({ 'federation.enabled': { value: user } }));
    });
    return asked;
  }

  const client = (): SierraClient => new SierraClient({ origin: 'https://s.test', clientId: 'c', clientSecret: 's' });

  it('사이트 AND 봇 계정', async () => {
    stub(true, true);
    expect(await client().federates()).toBe(true);
    stub(true, false);
    expect(await client().federates()).toBe(false);
  });

  it('사이트가 끊었으면 계정을 묻지 않고 거짓, 사이트 값이 없으면(옛 코어) 모른다', async () => {
    const off = stub(false, true);
    expect(await client().federates()).toBe(false);
    expect(off).toEqual(['/api/v1/instance']);

    stub(undefined, true);
    expect(await client().federates()).toBeUndefined();
  });
});

describe('query', () => {
  it('글 id와 멘션 뗀 말을 싣고, 주지 않은 칸은 빼고, 코어의 답을 그대로 돌려준다', async () => {
    const sent: { url: string; body: unknown }[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (url.endsWith('/oauth/token')) {
        return new Response(JSON.stringify({ access_token: 't', expires_in: 3600 }));
      }
      sent.push({ url, body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ answer: { text: '답', html: '<p>답</p>', service: 'anthropic', model: 'm' } }));
    });

    const client = new SierraClient({ origin: 'https://s.test', clientId: 'c', clientSecret: 's' });
    const plain = await client.query('p1', '안녕');
    await client.query('p2', '/ask claude -- 안녕', {
      prompt: '짧게', media: { max_count: 2, max_bytes: 1000 }, tools: { mode: 'read', write_paths: [] },
    });

    expect(plain.answer?.service).toBe('anthropic');
    expect(sent[0]).toEqual({ url: 'https://s.test/api/v1/bots/me/query', body: { post_id: 'p1', body: '안녕' } });
    expect(sent[1]?.body).toEqual({
      post_id: 'p2', body: '/ask claude -- 안녕', prompt: '짧게',
      media: { max_count: 2, max_bytes: 1000 }, tools: { mode: 'read', write_paths: [] },
    });
  });
});

describe('cannotAttach — 붙을 수 없다는 거절(코어 M66 확정 3)', () => {
  it('빠진 확장과 판을 사람 말로 옮긴다', () => {
    const error = new SierraError(400, JSON.stringify({
      error: 'bot_requires_extension',
      error_params: { missing: [{ name: 'sierrachat', version: '>=1.2.0', installed: '1.1.0' }, { name: 'nosuch' }] },
    }));

    expect(error.missing).toHaveLength(2);
    expect(cannotAttach(error)).toBe(
      '이 시에라에는 봇이 필요로 하는 확장이 없어 붙을 수 없다 — sierrachat >=1.2.0 (지금 1.1.0), nosuch (없음)');
  });

  it('다른 거절이면 말하지 않는다', () => {
    expect(cannotAttach(new SierraError(400, JSON.stringify({ error: 'manifest_unreachable' })))).toBeUndefined();
    expect(cannotAttach(new Error('끊겼다'))).toBeUndefined();
  });
});

describe('SierraError.retryAfter — 오류 값은 error_params에 있다', () => {
  it('한도의 기다림은 error_params에서 읽는다 — 최상위에는 없다', () => {
    const limited = new SierraError(429, JSON.stringify({ error: 'rate_limited', error_params: { retry_after: 1800, limit: 300 } }));
    expect(limited.retryAfter).toBe(1800);
    expect(limited.params?.['limit']).toBe(300);
    expect(new SierraError(429, JSON.stringify({ error: 'rate_limited', retry_after: 30 })).retryAfter).toBeUndefined();
    expect(new SierraError(502, '<html>bad gateway</html>').retryAfter).toBeUndefined();
  });
});
