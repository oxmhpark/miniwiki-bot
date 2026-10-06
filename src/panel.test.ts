import { describe, expect, it } from 'vitest';
import { readTokens, renderPanel } from './panel.js';

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
    expect(html).not.toContain('value=');
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
