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
