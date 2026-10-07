import { describe, expect, it } from 'vitest';
import { fillHidden, readNames, readTokens, renderPanel } from './panel.js';

describe('renderPanel', () => {
  it('여러 줄 칸은 textarea로 서고 값을 이스케이프한다', () => {
    const html = renderPanel({
      fields: [{
        type: 'lines', name: 'repos', label: '저장소', value: 'https://a\n</textarea><b>', rows: 3,
      }],
    }, 'b1');

    expect(html).toContain('<textarea name="repos" rows="3">https://a\n&lt;/textarea&gt;&lt;b&gt;</textarea>');
  });
});

describe('토큰 칸과 묶음', () => {
  it('readTokens는 빈칸·쉼표로 가르고 앞의 #을 뗀다', () => {
    expect(readTokens(' #a, b\n#a  c ')).toEqual(['a', 'b', 'c']);
    expect(readTokens(null)).toEqual([]);
  });

  it('저장된 토큰을 칸 위에 그리고, 같은 group은 한 fieldset이다', () => {
    const html = renderPanel({
      fields: [
        { type: 'tokens', name: 't', label: '태그', value: ['클로드', '<b>'], prefix: '#', group: '대화' },
        { type: 'text', name: 'g', label: '그룹', value: '', group: '대화' },
        { type: 'number', name: 'n', label: '수', value: 1 },
      ],
    }, 'b1');

    expect(html).toContain('<span class="token">#클로드</span>');
    expect(html).toContain('#&lt;b&gt;');
    expect(html).toContain('value="클로드 &lt;b&gt;"');
    expect(html.match(/<fieldset>/g)).toHaveLength(1);
    expect(html).toContain('<legend>대화</legend>');
    expect(html.indexOf('</fieldset>')).toBeLessThan(html.indexOf('name="n"'));
  });
});

describe('비밀 칸', () => {
  it('값을 싣지 않고, 맡긴 것이 있으면 그 사실만 말한다', () => {
    const html = renderPanel({
      fields: [
        { type: 'secret', name: 's1', label: '토큰', hint: 'github_pat_…', filled: true },
        { type: 'secret', name: 's2', label: '토큰' },
      ],
    }, 'b1');

    expect(html).toContain('<input type="password" name="s1" autocomplete="off" placeholder="github_pat_…">');
    expect(html).not.toMatch(/type="password"[^>]*value=/);
    expect(html.match(/이미 맡긴 것이 있습니다/g)).toHaveLength(1);
  });
});

describe('칩 칸', () => {
  it('토큰 칸에는 칩 스크립트가 붙고, 값 하나의 칸은 data-max를 진다', () => {
    const html = renderPanel({
      fields: [
        { type: 'tokens', name: 't', label: '태그', value: ['a'], prefix: '#' },
        { type: 'tokens', name: 'g', label: '그룹', value: ['두 낱말'], max: 1 },
      ],
    }, 'b1');

    expect(html).toContain('name="t" value="a" data-chips data-prefix="#">');
    expect(html).toContain('name="g" value="두 낱말" data-chips data-max="1">');

    const script = /<script>([\s\S]*)<\/script>/.exec(html)?.[1] ?? '';
    expect(script).toContain('[\\s,]+');
    expect(() => new Function(script)).not.toThrow();
  });

  it('토큰 칸이 없으면 스크립트도 없다', () => {
    expect(renderPanel({ fields: [{ type: 'text', name: 'x', label: 'x', value: '' }] }, 'b1')).not.toContain('<script>');
  });
});

describe('목록', () => {
  const html = renderPanel({
    lists: [{
      name: 'repos', label: '저장소', note: '설명',
      items: [{ key: 'o/r', label: 'github.com/o/r', note: '토큰 있음', fields: [{ type: 'secret', name: 'token', label: '토큰', filled: true }] }],
      add: { label: '저장소 추가', fields: [{ type: 'text', name: 'url', label: '주소', value: '' }, { type: 'secret', name: 'token', label: '토큰' }] },
    }],
  }, 'b1');

  it('항목은 펼침이고, 고치기·빼기·추가가 저마다 폼으로 선다', () => {
    expect(html).toContain('<summary>github.com/o/r <small>토큰 있음</small></summary>');
    expect(html.match(/action="\/bots\/b1\/x\/list"/g)).toHaveLength(3);
    expect(html).toContain('name="op" value="edit"><input type="hidden" name="key" value="o/r">');
    expect(html).toContain('name="op" value="remove">');
    expect(html).toContain('<summary class="button plain">저장소 추가</summary>');
  });

  it('펼침을 접는 스크립트가 붙고, 그것은 문법이 맞다', () => {
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((one) => one[1] ?? '');
    expect(scripts).toHaveLength(1);
    expect(() => new Function(scripts[0] ?? '')).not.toThrow();
  });
});

describe('서브탭', () => {
  const view = {
    tabs: [
      { name: 'post', label: '복제', facts: [['복제', '서 있다']] as [string, string][],
        fields: [{ type: 'tokens' as const, name: 'postTags', label: '태그', value: ['a', 'b'], group: '복제 태그' }],
        actions: [{ name: 'publish-now', label: '즉시 복제', grave: true }] },
      { name: 'chat', label: '대화',
        fields: [
          { type: 'number' as const, name: 'n', label: '수', value: 3 },
          { type: 'choice' as const, name: 'm', label: '모델', value: 'x', options: [{ value: 'x', label: 'x' }] },
          { type: 'secret' as const, name: 's', label: '비밀' },
        ] },
    ],
  };

  it('주소가 고른 장만 그리고, 폼마다 돌아올 장을 싣는다', () => {
    const html = renderPanel(view, 'b1', 'chat');

    expect(html).toContain('<a href="/bots/b1/features?sub=chat" aria-current="page">대화</a>');
    expect(html).toContain('name="n"');
    expect(html).not.toContain('name="postTags"');
    expect(html).toContain('<input type="hidden" name="_tab" value="chat">');
  });

  it('모르는 장이면 첫 장이다', () => {
    const html = renderPanel(view, 'b1', 'nope');
    expect(html).toContain('name="postTags"');
    expect(html.match(/name="_tab" value="post"/g)).toHaveLength(2);
  });

  it('보이지 않은 장의 칸을 지금 값으로 채우고, 보낸 칸과 비밀은 건드리지 않는다', () => {
    const filled = fillHidden(view, new URLSearchParams({ n: '5', _tab: 'chat' }));

    expect(filled.get('n')).toBe('5');
    expect(filled.get('m')).toBe('x');
    expect(filled.get('postTags')).toBe('a b');
    expect(filled.has('s')).toBe(false);
  });
});

describe('쉼표로 가르는 칩 칸', () => {
  it('readNames는 쉼표로만 가르고 이름 안의 빈칸을 둔다', () => {
    expect(readNames(' 편집 모임, 독자 ,, 편집 모임\n관리')).toEqual(['편집 모임', '독자', '관리']);
  });

  it('값을 쉼표로 이어 싣고 data-sep을 진다', () => {
    const html = renderPanel({ fields: [{ type: 'tokens', name: 'g', label: '그룹', value: ['편집 모임', '독자'], separator: 'comma' }] }, 'b1');
    expect(html).toContain('value="편집 모임, 독자" data-chips data-sep="comma">');
  });
});

describe('묶음마다 저장', () => {
  const html = renderPanel({
    fields: [
      { type: 'text', name: 'a', label: 'A', value: '', group: '하나' },
      { type: 'text', name: 'b', label: 'B', value: '', group: '하나' },
      { type: 'text', name: 'c', label: 'C', value: '', group: '둘' },
      { type: 'number', name: 'n', label: 'N', value: 1 },
    ],
    actions: [{ name: 'go', label: '간다', wait: '가는 중…' }],
  }, 'b1');

  it('묶음마다 폼과 저장 단추가 서고, 돌아올 자리와 대기 문구를 진다', () => {
    expect(html.match(/action="\/bots\/b1\/x\/settings"/g)).toHaveLength(3);
    expect(html.match(/>저장한다</g)).toHaveLength(3);
    expect(html).toContain('id="f1" data-wait="저장하는 중…"');
    expect(html).toContain('<input type="hidden" name="_at" value="f2">');
    expect(html).toContain('data-wait="가는 중…"');
  });

  it('폼에 없던 칸은 지금 값으로 채운다 — 서브탭이 없어도', () => {
    const view = { fields: [{ type: 'text' as const, name: 'a', label: 'A', value: '옛값' }, { type: 'number' as const, name: 'n', label: 'N', value: 3 }] };
    const filled = fillHidden(view, new URLSearchParams({ a: '새값' }));
    expect(filled.get('a')).toBe('새값');
    expect(filled.get('n')).toBe('3');
  });
});

describe('고를 수 없는 선택지', () => {
  it('disabled면 보이되 꺼진다', () => {
    const html = renderPanel({ fields: [{ type: 'choice', name: 'v', label: '공개 범위', value: 'server', options: [
      { value: 'federated', label: '연합', disabled: true }, { value: 'server', label: '이 서버' },
    ] }] }, 'b1');
    expect(html).toContain('<option value="federated" disabled>연합</option>');
    expect(html).toContain('<option value="server" selected>이 서버</option>');
  });
});
