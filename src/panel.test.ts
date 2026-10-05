import { describe, expect, it } from 'vitest';
import { renderPanel } from './panel.js';

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
