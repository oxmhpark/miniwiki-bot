import { afterEach, describe, expect, it, vi } from 'vitest';
import { SierraClient } from './sierra.js';

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
