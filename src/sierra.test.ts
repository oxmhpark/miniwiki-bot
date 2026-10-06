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
