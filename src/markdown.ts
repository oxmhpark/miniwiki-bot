import { escapeHtml } from './text.js';

/**
 * **마크다운의 한 조각만 그린다** — 첫 화면에 서는 `ABOUT.md`를 위한 것이다.
 *
 * 라이브러리를 들이지 않는다. 이 저장소는 **런타임 의존이 없고**(`Dockerfile`) 최종 이미지에
 * `node_modules`가 실리지 않는다 — 문서 한 장을 그리자고 그 성질을 버리지 않는다.
 *
 * **아는 것만 그린다**: 제목 · 문단 · 목록 · 표 · 코드 · 인용 · 가로줄, 그리고 줄 안의
 * 코드·강조·기울임·링크. 모르는 것은 **글자 그대로 남는다** — 그리지 못한 것이 사라지면
 * 문서가 조용히 반쪽이 된다.
 *
 * **HTML은 짓지 않는다.** 원문에 있던 `<b>`는 글자로 나간다(`escapeHtml`이 먼저 지난다) —
 * 이 파일이 읽는 것은 저장소의 문서지만, 그 규칙이 흔들리면 남이 적은 것을 그리게 되는 날
 * 그대로 뚫린다.
 */

/** 줄 안의 코드를 잠시 빼 두는 자리 — 그 안에서는 `**`도 그냥 별이다. */
const HOLD = '\u0000';

/**
 * 문서 맨 앞의 제목 한 줄을 걷는다 — **화면의 제목줄이 이미 그 자리를 진다**.
 *
 * `ABOUT.md`는 문서로서 `# 이름`으로 시작하는 것이 자연스럽지만, 그대로 그리면 같은 말이 두
 * 번 선다(제목줄의 `에코` 바로 아래 `에코`).
 */
export function withoutTitle(source: string): string {
  return source.replace(/^\s*#\s+.*(\r?\n)+/, '');
}

export function renderMarkdown(source: string): string {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];

  /*
   * **그 문서의 가장 높은 제목이 `h2`가 된다.** 화면의 `h1`은 제목줄의 것이라 문서가 그
   * 자리를 다시 쓰지 않고, 맨 앞 제목을 걷어 낸 문서(`withoutTitle`)도 `##`부터 제 높이로
   * 선다 — 고정으로 한 단씩 내리면 그런 문서의 절이 통째로 한 칸 낮아진다.
   */
  const top = Math.min(...lines
    .map((one) => /^(#{1,6})\s+/.exec(one)?.[1]?.length ?? 9)
    .filter((n) => n < 9), 9);

  let at = 0;
  while (at < lines.length) {
    const line = lines[at] ?? '';

    // ── 코드 덩어리 — **안은 아무것도 해석하지 않는다**
    if (/^\s*```/.test(line)) {
      const body: string[] = [];
      at += 1;

      while (at < lines.length && !/^\s*```/.test(lines[at] ?? '')) {
        body.push(lines[at] ?? '');
        at += 1;
      }

      at += 1;
      out.push(`<pre><code>${escapeHtml(body.join('\n'))}</code></pre>`);
      continue;
    }

    if (line.trim() === '') {
      at += 1;
      continue;
    }

    if (/^\s*(---+|===+|\*\*\*+)\s*$/.test(line)) {
      at += 1;
      out.push('<hr>');
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading !== null) {
      const level = Math.min((heading[1] ?? '#').length - top + 2, 6);
      at += 1;
      out.push(`<h${level}>${inline(heading[2] ?? '')}</h${level}>`);
      continue;
    }

    // ── 표 — 머리줄과 `|---|` 구분줄이 나란히 서야 표다
    if (line.trim().startsWith('|') && /^\s*\|[\s:|-]+\|\s*$/.test(lines[at + 1] ?? '')) {
      const head = cells(line);
      const rows: string[] = [];
      at += 2;

      while (at < lines.length && (lines[at] ?? '').trim().startsWith('|')) {
        rows.push(`<tr>${cells(lines[at] ?? '').map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`);
        at += 1;
      }

      out.push(`<div class="scroll"><table><thead><tr>${
        head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${
        rows.join('')}</tbody></table></div>`);
      continue;
    }

    if (/^\s*>/.test(line)) {
      const body: string[] = [];

      while (at < lines.length && /^\s*>/.test(lines[at] ?? '')) {
        body.push((lines[at] ?? '').replace(/^\s*>\s?/, ''));
        at += 1;
      }

      out.push(`<blockquote>${renderMarkdown(body.join('\n'))}</blockquote>`);
      continue;
    }

    const bullet = /^\s*([-*+]|\d+\.)\s+/.exec(line);
    if (bullet !== null) {
      const ordered = /\d/.test(bullet[1] ?? '');
      const items: string[] = [];

      while (at < lines.length) {
        const one = /^\s*(?:[-*+]|\d+\.)\s+(.*)$/.exec(lines[at] ?? '');
        if (one === null) {
          // **이어 쓴 줄은 그 항목에 붙는다** — 들여쓴 줄이 새 문단으로 떨어지면 목록이 끊긴다.
          const wrapped = /^\s+\S/.test(lines[at] ?? '') && items.length > 0;
          if (!wrapped) {
            break;
          }

          items[items.length - 1] += ` ${inline((lines[at] ?? '').trim())}`;
          at += 1;
          continue;
        }

        items.push(inline(one[1] ?? ''));
        at += 1;
      }

      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((one) => `<li>${one}</li>`).join('')}</${tag}>`);
      continue;
    }

    // ── 문단 — 빈 줄까지 이어 붙인다
    const body: string[] = [];
    while (at < lines.length && (lines[at] ?? '').trim() !== ''
      && !/^\s*(```|>|#{1,6}\s|[-*+]\s|\d+\.\s|\|)/.test(lines[at] ?? '')) {
      body.push((lines[at] ?? '').trim());
      at += 1;
    }

    if (body.length === 0) {
      // 위의 어느 규칙도 먹지 않은 줄 — **버리지 않고 문단으로 낸다**.
      body.push(line.trim());
      at += 1;
    }

    out.push(`<p>${inline(body.join(' '))}</p>`);
  }

  return out.join('\n');
}

function cells(row: string): readonly string[] {
  return row.trim().replace(/^\||\|$/g, '').split('|').map((one) => one.trim());
}

/**
 * 줄 안의 것들 — **코드를 먼저 빼 둔다**.
 *
 * 빼 두지 않으면 `` `**` `` 같은 코드가 강조로 읽히고, 표의 *변수 이름*이 굵어진다.
 */
function inline(raw: string): string {
  const held: string[] = [];

  const withCode = escapeHtml(raw).replace(/`([^`]+)`/g, (_, code: string) => {
    held.push(`<code>${code}</code>`);
    return `${HOLD}${held.length - 1}${HOLD}`;
  });

  const linked = withCode
    // 그림은 **글자만 남긴다** — 남의 서버의 그림을 첫 화면이 부르지 않는다.
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text: string, href: string) =>
      // **밖으로 나가는 주소만 링크다.** 상대 주소는 저장소의 파일을 가리켜 여기서 깨진다.
      /^https?:\/\//.test(href) ? `<a href="${href}" rel="noopener">${text}</a>` : text)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>');

  return linked.replace(new RegExp(`${HOLD}(\\d+)${HOLD}`, 'g'),
    (_, index: string) => held[Number(index)] ?? '');
}
