import { expect, test } from 'vitest';
import { renderMarkdown, withoutTitle } from './markdown.js';

/**
 * **첫 화면이 `ABOUT.md`를 그린다** — 그 문서가 화면에서 어떻게 서는지가 여기 있다.
 *
 * 특히 **남이 적은 것을 그리게 되는 날을 대비한 줄들**이 있다: HTML은 짓지 않고, 밖으로
 * 나가는 주소만 링크가 된다.
 */

test('그 문서의 가장 높은 제목이 h2가 된다 — 화면의 h1은 제목줄의 것이다', () => {
  expect(renderMarkdown('# 에코\n\n## 환경 변수'))
    .toBe('<h2>에코</h2>\n<h3>환경 변수</h3>');

  // 맨 앞 제목을 걷어 낸 문서도 `##`부터 제 높이로 선다.
  expect(renderMarkdown('## 환경 변수\n\n### 그 아래'))
    .toBe('<h2>환경 변수</h2>\n<h3>그 아래</h3>');
});

test('맨 앞 제목은 걷는다 — 제목줄이 이미 그 자리를 진다', () => {
  expect(withoutTitle('# 에코\n\n**한 줄.**')).toBe('**한 줄.**');
  // 제목이 아닌 문서는 그대로다.
  expect(withoutTitle('**한 줄.**\n\n# 뒤의 제목')).toBe('**한 줄.**\n\n# 뒤의 제목');
});

test('표는 자기 안에서 흐른다', () => {
  const html = renderMarkdown('| 변수 | 뜻 |\n|---|---|\n| `BOT_SECRET` | 열쇠 |');

  expect(html).toContain('<div class="scroll"><table>');
  expect(html).toContain('<th>변수</th>');
  expect(html).toContain('<td><code>BOT_SECRET</code></td>');
});

test('코드 덩어리 안은 아무것도 해석하지 않는다', () => {
  const html = renderMarkdown('```sh\nnpm run dev **그대로**\n```');

  expect(html).toBe('<pre><code>npm run dev **그대로**</code></pre>');
});

test('줄 안의 코드 안에서는 별이 그냥 별이다', () => {
  expect(renderMarkdown('`**이것**`은 코드다'))
    .toBe('<p><code>**이것**</code>은 코드다</p>');
});

test('HTML은 짓지 않는다 — 원문의 태그는 글자로 나간다', () => {
  expect(renderMarkdown('<script>alert(1)</script>'))
    .toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
});

test('밖으로 나가는 주소만 링크다 — 저장소의 상대 주소는 글자만 남는다', () => {
  const html = renderMarkdown('[템플릿](https://github.com/x) · [설계](./.claude/BOT.md)');

  expect(html).toContain('<a href="https://github.com/x" rel="noopener">템플릿</a>');
  expect(html).toContain('설계');
  expect(html).not.toContain('BOT.md"');
  expect(html).not.toContain('javascript:');
});

test('목록은 이어 쓴 줄을 그 항목에 붙인다', () => {
  const html = renderMarkdown('- 하나\n  이어서\n- 둘');

  expect(html).toBe('<ul><li>하나 이어서</li><li>둘</li></ul>');
});

test('인용과 가로줄', () => {
  expect(renderMarkdown('> **무겁다**')).toBe('<blockquote><p><b>무겁다</b></p></blockquote>');
  expect(renderMarkdown('---')).toBe('<hr>');
});

test('모르는 줄도 버리지 않는다', () => {
  expect(renderMarkdown('그냥 한 줄')).toBe('<p>그냥 한 줄</p>');
});
