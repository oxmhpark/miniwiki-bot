import type { AccountRecord, BotRecord } from './state.js';
import { FIELD_MAX, FIELDS_MAX, isConnected } from './state.js';
import { escapeHtml } from './text.js';

/**
 * 사람이 보는 그림 — **여기만 HTML을 쓴다**.
 *
 * `web.ts`는 문을 열고 폼을 받는 자리이고, 그림은 이 파일과 `panel.ts`(봇의 칸)에 있다.
 * 가른 까닭은 **한 화면이 한 가지 일만 하게 하려는 것**이다 — 목록과 만들기가 한 장에 서면
 * 봇이 셋일 때 만들기 폼이 목록을 밀어내고, 봇이 없을 때는 목록 자리가 비어 선다.
 *
 * **봇 하나의 화면은 다시 넷으로 갈린다 — 주소가 탭이다**(2026-09-23 요구). 스크립트로
 * 감추고 보이는 탭이 아니라 각자 주소를 가진 네 장이다: 새로고침해도 그 자리이고, 링크로
 * 가리킬 수 있고, **스크립트가 죽어도 선다**(모체 `CLAUDE.md`의 펼침메뉴 규칙과 같은 정신).
 *
 * ```
 * /                     첫 화면            — 이 서비스가 무엇인가(ABOUT.md)
 * /bots                 내 봇들            — 고르는 자리
 * /bots/new             봇 만들기          — 짓는 자리
 * /bots/{id}            **등록정보**       — 이름·소개·초상화·배경
 * /bots/{id}/features   **기능**           — 그 봇 고유의 것(봇의 칸)
 * /bots/{id}/auth       **인증**           — 선언 주소와 자격 증명, 설치에 드는 것
 * /bots/{id}/advanced   **고급**           — 멈춤과 지우기
 * /bots/{id}/delete     지우기 전에 한 번  — 되돌릴 수 없는 것 앞의 한 걸음
 * ```
 *
 * **제목줄은 어느 장에서도 같은 모양이다**(2026-09-23 요구) — 왼쪽에 *여기가 어디인가*,
 * 오른쪽에 *드나드는 단추* 하나. 화면마다 자리를 달리하면 사람이 매번 다시 찾는다.
 */

/**
 * **보내면 덮는다**(2026-10-07 요구 — 하멜처럼). 폼을 보내는 순간 화면을 얇게 덮고 가운데에
 * 문구를 띄운다 — 문구는 폼의 `data-wait`, 없으면 *처리하는 중…*. 화면 전체가 다시 그려지므로
 * 걷는 일은 없다. **뒤로 가기로 돌아온 장**(bfcache)에는 덮개가 남아 있으므로 그때 걷는다.
 *
 * **링크로 옮기는 것도 덮는다**(2026-10-08 — 공용 규칙: 화면 전환을 포함한 모든 비동기 액션).
 * 이 화면이 그대로 남는 누름은 덮지 않는다 — 새 탭(보조 키 · 가운데 단추 · `target`), 내려받기,
 * 같은 장 안의 `#`, 남의 오리진.
 */
const WAIT = `<script>(() => {
  const cover = (text) => {
    if (document.querySelector('.veil')) return;
    const veil = document.createElement('p');
    veil.className = 'veil';
    veil.setAttribute('role', 'status');
    veil.textContent = text;
    document.body.append(veil);
  };
  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || event.defaultPrevented || form.method !== 'post') return;
    cover(form.dataset.wait || '처리하는 중…');
  });
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!link || link.target || link.hasAttribute('download')) return;
    const to = new URL(link.href, location.href);
    if (to.origin !== location.origin) return;
    if (to.pathname === location.pathname && to.search === location.search && to.hash !== '') return;
    cover(link.dataset.wait || '여는 중…');
  });
  window.addEventListener('pageshow', () => document.querySelectorAll('.veil').forEach((one) => one.remove()));
})();</script>`;

/** 옷은 한 벌뿐이다 — 봇의 페이지라 하멜 스킨 밖이다. */
export function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  body { max-width: 38rem; margin: 2rem auto; padding: 0 1rem;
         font: 1rem/1.7 system-ui, sans-serif; color: #1a1a1a; background: #fff; }
  code { background: #f2f2f2; padding: .1rem .3rem; border-radius: .2rem; word-break: break-all; }
  input, select, textarea { width: 100%; padding: .4rem; font: inherit; box-sizing: border-box; }
  fieldset { border: 1px solid #ddd; border-radius: .3rem; margin: 1rem 0; padding: .2rem 1rem .6rem; }
  legend { font-weight: 600; padding: 0 .3rem; }
  .tokens { display: flex; flex-wrap: wrap; gap: .3rem; margin: .2rem 0; }
  .token { background: #f2f2f2; border: 1px solid #ddd; border-radius: 1rem; padding: 0 .6rem; font-size: .9rem; }
  /* **칩 칸** — 하멜의 \`.chip-field\`와 같은 모양(panel.ts의 CHIPS). 겉옷이 칸이고 안의 적는 칸은 테두리가 없다. */
  .chip-field { display: flex; flex-wrap: wrap; align-items: center; gap: .3rem; box-sizing: border-box;
                min-height: 2.4rem; padding: .25rem .4rem; border: 1px solid #767676; border-radius: .2rem;
                background: #fff; cursor: text; }
  .chip-field:focus-within { outline: 2px solid #1a1a1a; outline-offset: 1px; }
  .chip-field .chip { display: inline-flex; align-items: center; gap: .25rem; background: #f2f2f2;
                      border: 1px solid #ddd; border-radius: 1rem; padding: 0 .25rem 0 .6rem;
                      font-size: .9rem; line-height: 1.6; }
  .chip-field button.chip-drop { display: inline-flex; align-items: center; justify-content: center;
                                 width: 1.1rem; height: 1.1rem; padding: 0; border: 0; border-radius: 50%;
                                 background: #b5b5b5; color: #fff; font-size: .8rem; line-height: 1; }
  .chip-field button.chip-drop:hover { background: #888; }
  /* **목록** — 항목을 누르면 그 자리에서 펼쳐지고, 추가는 단추가 펼친다(panel.ts의 BotList). */
  .list ul { list-style: none; padding: 0; margin: .4rem 0; }
  .list li { border: 1px solid #ddd; border-radius: .3rem; margin: .4rem 0; }
  .list li summary { padding: .5rem .8rem; cursor: pointer; }
  .list li summary small { display: inline; margin-left: .4rem; }
  .list li details > form { padding: 0 .8rem; }
  .list li details > form.grave { margin: 0 0 .8rem; }
  .list details.add { margin-top: .6rem; }
  .list details.add > summary { list-style: none; }
  .list details.add > summary::-webkit-details-marker { display: none; }
  .list details.add[open] > summary { margin-bottom: .4rem; }
  .chip-field input.chip-entry { flex: 1 1 6rem; min-width: 6rem; width: auto; border: 0; outline: 0;
                                 padding: .15rem 0; background: none; color: inherit; }
  label { display: block; }
  small { display: block; color: #666; margin-top: .2rem; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: .3rem 1rem; margin: 1rem 0; }
  dt { color: #666; } dd { margin: 0; }
  form + form { margin-top: .5rem; }
  .button, button { padding: .5rem 1rem; font: inherit; cursor: pointer;
                    border: 1px solid #1a1a1a; border-radius: .3rem;
                    background: #1a1a1a; color: #fff; text-decoration: none; display: inline-block; }
  form button:not(.button) { background: #fff; color: #1a1a1a; }
  a.button.plain { background: #fff; color: #1a1a1a; }
  hr { border: 0; border-top: 1px solid #ddd; margin: 2rem 0; }
  /* **남는 알림** — 읽고 나서도 그 자리에 있어야 하는 것(아직 잇지 않았다 · 입력이 틀렸다). */
  .notice { padding: .6rem .8rem; border-left: 3px solid #1a1a1a; background: #f2f2f2; }
  /*
   * **결과는 떴다가 사라진다**(2026-10-07 요구) — ~~화면 맨 위의 줄~~은 아래에서 단추를 누른 손과
   * 호응하지 않았다. 화면 한가운데에 고정해 뜨고 스스로 걷힌다 — 스크립트 없이 CSS만으로.
   * 누름을 가로채지 않는다(pointer-events) — 떠 있는 동안에도 화면을 쓸 수 있다.
   */
  .said { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 50;
          box-sizing: border-box; max-width: min(28rem, calc(100% - 2rem)); margin: 0;
          padding: .8rem 1.2rem; border-radius: .4rem; background: #1a1a1a; color: #fff;
          box-shadow: 0 .4rem 1.2rem rgb(0 0 0 / .25); pointer-events: none;
          animation: said 2.8s ease forwards; }
  @keyframes said { 0% { opacity: 0; } 8% { opacity: 1; } 72% { opacity: 1; }
                    100% { opacity: 0; visibility: hidden; } }
  /* **대기 덮개** — 하멜의 \`.saving-veil\`과 같은 모양(얇게 덮고 가운데에 문구). 보내는 순간 선다. */
  .veil { position: fixed; inset: 0; z-index: 40; display: flex; align-items: center; justify-content: center;
          margin: 0; background-color: color-mix(in srgb, #fff 78%, transparent); backdrop-filter: blur(2px); }
  /* **되돌릴 수 없는 것은 가로줄 아래에 선다** — 누르면 공개 글이 나가는 자리다. */
  .grave { border-top: 1px solid #ddd; margin-top: 1.5rem; padding-top: 1rem; }
  /* **없애는 단추는 혼자 붉다** — 가로줄 아래의 다른 것들과도 무게가 다르다. */
  .danger, form button.danger { background: #fff; color: #a01b1b; border-color: #a01b1b; }
  /* **제목줄은 어느 장에서도 같다** — 왼쪽에 여기가 어디인가, 오른쪽에 드나드는 단추. */
  .top { display: flex; align-items: center; justify-content: space-between;
         gap: 1rem; flex-wrap: wrap; margin-bottom: .5rem; }
  .top h1 { margin: 0; font-size: 1.5rem; line-height: 1.3; }
  .top form { margin: 0; }
  .top .small-button, .top button { padding: .35rem .7rem; font-size: .9rem; }
  .top .doors { display: flex; align-items: center; gap: .4rem; }
  .top .doors a[aria-current] { font-weight: 600; }
  /* **주소가 탭이다** — 스크립트가 감추고 보이는 것이 아니라 네 장이 각자 선다. */
  .tabs { display: flex; flex-wrap: wrap; gap: .2rem; margin: 1rem 0 1.5rem;
          border-bottom: 1px solid #ddd; }
  .tabs a { padding: .4rem .8rem; text-decoration: none; color: #666;
            border-bottom: 2px solid transparent; margin-bottom: -1px; }
  .tabs a[aria-current] { color: #1a1a1a; font-weight: 600; border-bottom-color: #1a1a1a; }
  /* **서브탭** — 기능 탭 안의 장. 위의 탭과 같이 주소가 탭이고, 한 단 낮아 알약 모양이다. */
  .subtabs { display: flex; flex-wrap: wrap; gap: .3rem; margin: 0 0 1rem; }
  .subtabs a { padding: .2rem .8rem; border: 1px solid #ddd; border-radius: 1rem; text-decoration: none;
               color: #666; font-size: .95rem; }
  .subtabs a[aria-current] { background: #1a1a1a; border-color: #1a1a1a; color: #fff; }
  /* **아직 서지 않은 칸도 자리를 지킨다** — 감추면 무엇이 남았는지 볼 수 없다. */
  .todo input { opacity: .6; }
  /* **눈에서만 감춘다** — 보조 기술은 읽는다(공용 규칙). */
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden;
             clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
  /* **등록정보 카드**(2026-10-08) — 시에라의 프로필 카드와 같은 켜. 칸은 글자처럼 서 있다가 커서를 올리면 외곽선이 드러난다. */
  fieldset.profile-card { min-width: 0; margin: 0 0 1rem; padding: 0; border: 1px solid #ddd; border-radius: .5rem; overflow: visible; }
  .profile-card .card-header { position: relative; min-height: 9rem; background: #e9e9e9; border-radius: .5rem .5rem 0 0; overflow: hidden; }
  .profile-card .pick-header { position: absolute; inset: 0; z-index: 0; }
  .profile-card .pick-header .header { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .profile-card .pick-avatar { position: relative; z-index: 1; display: inline-block; margin: .75rem; border-radius: 50%; }
  .profile-card .avatar { display: block; width: 6rem; height: 6rem; border-radius: 50%; object-fit: cover; background: #fff; }
  .profile-card .avatar.fallback { display: flex; align-items: center; justify-content: center; color: #999; }
  /* **감춘 쪽은 감춘다** — 위의 \`display\`가 \`hidden\`을 덮어 빈 그림과 대체 얼굴이 함께 섰다(2026-10-09). */
  .profile-card .avatar[hidden] { display: none; }
  .profile-card .identity { position: absolute; left: 0; right: 0; bottom: 0; z-index: 2; display: flex; align-items: center;
                            gap: .5rem; padding: .25rem .75rem; background: rgb(0 0 0 / 55%); color: #fff; }
  .profile-card .identity .handle { background: #fff; color: #a01b1b; }
  .profile-card .pick:focus { outline: none; }
  .profile-card .pick-actions { position: absolute; display: flex; gap: .35rem; opacity: 0; pointer-events: none; transition: opacity .15s ease; }
  .profile-card .pick-header .pick-actions { top: .5rem; right: .5rem; }
  .profile-card .pick-avatar .pick-actions { inset: 0; align-items: center; justify-content: center; }
  @media (hover: hover) { .profile-card .pick:hover > .pick-actions { opacity: 1; pointer-events: auto; } }
  .profile-card .pick:focus-within > .pick-actions { opacity: 1; pointer-events: auto; }
  .profile-card .pick-button { display: inline-flex; align-items: center; justify-content: center; width: 2.25rem; height: 2.25rem;
                               border-radius: 50%; background: rgb(0 0 0 / 60%); color: #fff; cursor: pointer; }
  .profile-card .pick-button:hover { background: rgb(0 0 0 / 80%); }
  .profile-card .pick-button.danger:hover, .profile-card .pick-button.danger.active { background: #a01b1b; }
  .profile-card .pick-button:focus-within { outline: 2px solid #fff; outline-offset: 1px; }
  .profile-card input.inline-edit, .profile-card textarea.inline-edit { box-sizing: border-box; width: 100%; margin: 0; padding: .15rem .35rem;
      border: 1px solid transparent; border-radius: .3rem; background: transparent; color: inherit; font: inherit; line-height: 1.5; }
  .profile-card .inline-edit:hover { border-color: #bbb; }
  .profile-card .inline-edit:focus { outline: none; border-color: #1a1a1a; background: #fff; color: #1a1a1a; }
  .profile-card .identity .inline-edit { flex: 1 1 12rem; min-width: 0; font-weight: 600; }
  .profile-card .identity .inline-edit:hover { border-color: rgb(255 255 255 / 70%); }
  .profile-card .identity .inline-edit:focus { border-color: #fff; background: rgb(0 0 0 / 35%); color: #fff; }
  .profile-card textarea[data-autosize] { field-sizing: content; overflow: hidden; resize: none; }
  .profile-card textarea.summary { min-height: 3rem; }
  .profile-card .card-body { padding: .75rem .65rem 1rem; }
  .profile-card fieldset.fields { min-width: 0; margin: .5rem 0 0; padding: 0; border: 0; }
  .profile-card .field-row { display: grid; grid-template-columns: minmax(6rem, 30%) 1fr; gap: .25rem; align-items: start; }
  .profile-card .field-name { font-weight: 600; color: #666; }
  .profile-card .card-save { margin: .75rem .35rem 0; }
  /* **도움말은 툴팁이다** — 커서를 올리거나 적는 동안 선다. 글자는 \`data-tip\`이 진다. */
  .profile-card .tipped { position: relative; display: block; }
  .profile-card .tipped::after { content: attr(data-tip); position: absolute; left: 0; top: 100%; z-index: 5; width: max-content;
      max-width: min(18rem, 80vw); margin-top: .25rem; padding: .3rem .55rem; border-radius: .3rem; background: rgb(0 0 0 / 85%);
      color: #fff; font-size: .75rem; font-weight: 400; line-height: 1.4; white-space: normal; pointer-events: none; opacity: 0;
      transition: opacity .15s ease; }
  @media (hover: hover) { .profile-card .tipped:hover::after { opacity: 1; } }
  .profile-card .tipped:focus-within::after { opacity: 1; }
  .profile-card .pick-header.tipped { position: absolute; }
  .profile-card .pick-header.tipped::after { top: 3.1rem; right: .5rem; left: auto; margin: 0; }
  .profile-card .pick-avatar.tipped { display: inline-block; }
  .profile-card .pick-avatar.tipped::after { top: 50%; left: 100%; margin: 0 0 0 .5rem; transform: translateY(-50%); }
  /* **봇 목록은 프로필 카드의 나열이다**(2026-10-08) — 등록정보 카드와 같은 켜. 이름의 링크가 카드를 덮는다. */
  .bots { list-style: none; padding: 0; display: grid; gap: 1rem; }
  .bot-card { position: relative; margin: 0; border: 1px solid #ddd; border-radius: .5rem; overflow: hidden; }
  .bot-card:hover { border-color: #999; }
  .bot-card .card-header { position: relative; display: flow-root; min-height: 9rem; background: #e9e9e9; }
  .bot-card .header { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .bot-card .avatar { position: relative; display: block; margin: .75rem; width: 6rem; height: 6rem; border-radius: 50%;
                      object-fit: cover; background: #fff; }
  .bot-card .avatar.fallback { display: flex; align-items: center; justify-content: center; color: #999; }
  .bot-card .identity { position: absolute; left: 0; right: 0; bottom: 0; display: flex; align-items: baseline; gap: .5rem;
                        padding: .25rem .75rem; background: rgb(0 0 0 / 55%); color: #fff; }
  .bot-card .name { color: #fff; font-weight: 600; text-decoration: none; }
  .bot-card .name::after { content: ""; position: absolute; inset: 0; z-index: 1; }
  .bot-card .handle { margin-left: auto; background: #fff; color: #a01b1b; }
  .bot-card .card-body { padding: .75rem 1rem 0; }
  .bot-card .summary { margin: 0; white-space: pre-line; }
  .bot-card .fields { margin: .5rem 0 0; border-collapse: collapse; }
  .bot-card .fields th, .bot-card .fields td { padding: .15rem .75rem .15rem 0; text-align: left; vertical-align: top; }
  .bot-card .fields th { color: #666; font-weight: 600; white-space: nowrap; }
  .bot-card .card-foot { display: flex; align-items: baseline; gap: .6rem; margin: 0; padding: .6rem 1rem .75rem; }
  .bot-card .card-foot small { display: inline; margin: 0; }
  .bot-card .status { font-size: .85rem; padding: 0 .5rem; border-radius: 1rem; background: #e7f3ea; color: #1d6b35; }
  .bot-card .status.idle { background: #fbeaea; color: #a01b1b; }
  .idle { color: #a01b1b; }
  /* 첫 화면의 문서 — ABOUT.md가 여기 선다. */
  .doc { margin-top: 1.5rem; }
  .doc h2 { font-size: 1.25rem; margin-top: 2rem; }
  .doc h3 { font-size: 1.05rem; margin-top: 1.5rem; }
  .doc table { border-collapse: collapse; width: 100%; font-size: .95rem; }
  .doc th, .doc td { border: 1px solid #ddd; padding: .35rem .6rem; text-align: left;
                     vertical-align: top; }
  .doc th { background: #f7f7f7; }
  .doc pre { background: #f2f2f2; padding: .8rem 1rem; border-radius: .3rem; overflow-x: auto; }
  .doc pre code { background: none; padding: 0; word-break: normal; }
  .doc blockquote { margin: 1rem 0; padding: .2rem 0 .2rem 1rem; border-left: 3px solid #ddd;
                    color: #444; }
  /* **넓은 것은 자기 안에서 흐른다** — 본문이 옆으로 밀리지 않는다. */
  .scroll { overflow-x: auto; }
  @media (prefers-color-scheme: dark) {
    body { color: #e8e8e8; background: #161616; }
    code { background: #2a2a2a; }
    .notice { border-left-color: #e8e8e8; background: #2a2a2a; }
    .said { background: #e8e8e8; color: #161616; }
    .veil { background-color: color-mix(in srgb, #161616 78%, transparent); }
    .token, .chip-field .chip { background: #2a2a2a; border-color: #444; }
    .chip-field { background: #161616; border-color: #555; }
    .chip-field:focus-within { outline-color: #e8e8e8; }
    .chip-field button.chip-drop { background: #555; color: #e8e8e8; }
    .grave { border-top-color: #333; }
    small, dt { color: #9a9a9a; }
    .list li, .bot-card { border-color: #333; }
    .bot-card .card-header { background: #2a2a2a; }
    .bot-card .avatar { background: #161616; }
    .bot-card .fields th { color: #9a9a9a; }
    .bot-card .status { background: #1d3a26; color: #9fd8ae; }
    .bot-card .status.idle { background: #3a1d1d; color: #e88; }
    fieldset.profile-card { border-color: #333; }
    .profile-card .card-header { background: #2a2a2a; }
    .profile-card .avatar { background: #161616; }
    .profile-card .field-name { color: #9a9a9a; }
    .profile-card .inline-edit:focus { border-color: #e8e8e8; background: #161616; color: #e8e8e8; }
    .tabs { border-bottom-color: #333; }
    .tabs a { color: #9a9a9a; }
    .tabs a[aria-current] { color: #e8e8e8; border-bottom-color: #e8e8e8; }
    .subtabs a { border-color: #333; color: #9a9a9a; }
    .subtabs a[aria-current] { background: #e8e8e8; border-color: #e8e8e8; color: #161616; }
    .button, button { background: #e8e8e8; color: #161616; border-color: #e8e8e8; }
    form button:not(.button) { background: #161616; color: #e8e8e8; }
    a.button.plain { background: #161616; color: #e8e8e8; }
    .danger, form button.danger { background: #161616; color: #e88; border-color: #e88; }
    .idle { color: #e88; }
    .doc th, .doc td { border-color: #333; }
    .doc th { background: #202020; }
    .doc pre { background: #2a2a2a; }
    .doc blockquote { border-left-color: #333; color: #b8b8b8; }
  }
</style></head><body>${body}${WAIT}</body></html>`;
}

/**
 * **제목줄** — 왼쪽에 여기가 어디인가, 오른쪽에 드나드는 단추 하나.
 *
 * 목록도 봇 하나의 네 탭도 이 한 줄을 쓴다. 화면마다 자리를 달리하면 *나가기*를 찾는 눈이
 * 매번 화면을 새로 읽는다.
 */
function top(title: string, right: string): string {
  return `<header class="top"><h1>${title}</h1>${right}</header>`;
}

/**
 * **드나드는 단추 둘** — 로그인한 사람의 제목줄 오른쪽은 늘 이것이다: *내 봇들*과 *나가기*가
 * 나란히(2026-10-07 요구). ~~내 봇들은 화면마다 본문 끝에 섰다~~ — 자리가 화면마다 달라 매번
 * 찾아야 했다.
 *
 * @param here 지금 *내 봇들*에 있는가 — 그 단추가 지금 자리임을 말한다.
 */
function leave(here = false): string {
  return `<nav class="doors"><a class="button plain small-button" href="/bots"${here ? ' aria-current="page"' : ''}>내 봇들</a>
    <form method="post" action="/auth/logout"><button type="submit">나가기</button></form></nav>`;
}

/** 들어오는 단추 — 아직 누구인지 모르는 사람의 자리. */
const ENTER = '<a class="button small-button" href="/auth/github">GitHub으로 들어가기</a>';

/**
 * 한 말은 한 번만 보인다 — 주소에 실려 와서 새로고침에는 남지 않는다. **떴다가 사라진다**(`.said`).
 * `role="status"`라 보조 기술은 사라지기 전에 읽는다.
 */
function said(line: string | undefined): string {
  return line === undefined ? '' : `<p class="said" role="status">${escapeHtml(line)}</p>`;
}

/** 남는 알림 — 사라지면 안 되는 것(입력이 틀렸다 따위). */
function notice(line: string | undefined): string {
  return line === undefined ? '' : `<p class="notice">${escapeHtml(line)}</p>`;
}

/** 그 봇이 지금 무엇인가 — 목록과 설정 화면이 같은 말을 쓴다. */
export function statusOf(bot: BotRecord): string {
  if (!isConnected(bot)) {
    return '아직 잇지 않았다';
  }

  return bot.stopped === true ? '멈춰 있다' : '돈다';
}

/** 임자가 있으면 *아무개의 무엇*, 없으면 그냥 *무엇*. */
function who(service: string, account?: AccountRecord): string {
  return account === undefined
    ? escapeHtml(service)
    : `${escapeHtml(account.login)}의 ${escapeHtml(service)}`;
}

/**
 * **첫 화면**(`/`) — 이 서비스가 무엇인가.
 *
 * 본문은 그 봇의 `ABOUT.md`다(2026-09-23 요구) — **`README.md`가 아니다**. 그 파일은 저장소를
 * 여는 개발자의 것이고 라이브러리에도 있어야 한다 — 독자가 다른 글이다(`BOT.md`와 `PROJECT.md`를
 * 가른 것과 같은 까닭). 화면에 설 말은 화면의 파일에 적는다.
 *
 * **없어도 막히지 않는다** — 제목줄과 단추만 서고 소개 한 줄이 그 자리를 지킨다.
 *
 * **로그인해도 이 자리는 이 자리다.** 바뀌는 것은 제목줄과, 목록으로 가는 단추 하나뿐이다 —
 * 주소가 가리키는 것과 보이는 것이 같아야 하고, 들어온 사람도 소개를 다시 볼 수 있어야 한다.
 */
export function landingPage(service: string, about: string, account?: AccountRecord): string {
  return page(escapeHtml(service), `
    ${top(who(service, account), account === undefined ? ENTER : leave())}
    ${account === undefined ? '<p>시에라에 붙는 봇을 만들고 잇는 자리입니다.</p>' : ''}
    ${about === '' ? '' : `<div class="doc">${about}</div>`}`);
}

/**
 * 봇 하나의 카드 — **시에라의 프로필 카드와 같은 켜다**(2026-10-08 요구 — 하멜의 설정 › 연동처럼). 헤더(배경 · 초상화 ·
 * 이름 · 아이디) · 본문(소개 · 커스텀 필드) · 밑줄(상태 · 붙은 시에라). **이름이 곧 그 봇으로 가는 길**이고, 카드
 * 어디를 눌러도 같은 곳이다(이름의 링크가 카드를 덮는다 — 같은 곳으로 가는 링크를 둘 두지 않는다).
 */
function botCard(bot: BotRecord): string {
  const declared = bot.declaration;
  const fields = declared.fields ?? [];

  return `<li class="bot-card">
      <div class="card-header">
        ${declared.header === undefined ? '' : `<img class="header" src="${escapeHtml(declared.header)}" alt="">`}
        ${declared.avatar === undefined
          ? `<span class="avatar fallback">${ICON_PERSON}</span>`
          : `<img class="avatar" src="${escapeHtml(declared.avatar)}" alt="">`}
        <div class="identity">
          <a class="name" href="/bots/${bot.id}">${escapeHtml(declared.name)}</a>
          ${bot.handle === undefined ? '' : `<code class="handle">@${escapeHtml(bot.handle)}</code>`}
        </div>
      </div>
      <div class="card-body">
        <p class="summary">${escapeHtml(declared.summary)}</p>
        ${fields.length === 0 ? '' : `<table class="fields"><tbody>${fields.map((one) => `<tr>
          <th scope="row">${escapeHtml(one.name)}</th><td>${escapeHtml(one.value)}</td></tr>`).join('')}</tbody></table>`}
      </div>
      <p class="card-foot"><span class="status${isConnected(bot) ? '' : ' idle'}">${statusOf(bot)}</span>
        <small>${escapeHtml(bot.origin)}</small></p>
    </li>`;
}

/**
 * **내 봇들**(`/bots`) — 고르는 자리다.
 *
 * 만들기 폼은 여기 없다(`/bots/new`). 목록은 *무엇이 있고 무엇이 도는가*만 말한다 — **프로필 카드의 나열이다**
 * (2026-10-08 요구).
 */
export function homePage(
  service: string, account: AccountRecord, bots: readonly BotRecord[], max: number, line?: string,
): string {
  const rows = bots.length === 0
    ? '<p>아직 봇이 없습니다.</p>'
    : `<ul class="bots">${bots.map(botCard).join('')}</ul>`;

  return page(who(service, account), `
    ${top(who(service, account), leave(true))}
    ${said(line)}
    ${rows}
    <p>${bots.length < max
      ? '<a class="button" href="/bots/new">봇 만들기</a>'
      : `봇은 ${max}개까지입니다.`}</p>`);
}

/** **봇 만들기** — 짓는 자리 하나. */
export function newBotPage(
  service: string, account: AccountRecord,
  fields: { name?: string; summary?: string; origin?: string } = {}, wrong?: string,
): string {
  return page('봇 만들기', `
    ${top('봇 만들기', leave())}
    ${notice(wrong)}
    <form method="post" action="/bots">
      <p><label>이름 <input name="name" required maxlength="60"
        value="${escapeHtml(fields.name ?? '')}"></label>
        <small>시에라에 설 이 봇의 이름입니다.</small></p>
      <p><label>소개 <input name="summary" required maxlength="200"
        value="${escapeHtml(fields.summary ?? '')}"></label></p>
      <p><label>붙을 시에라 <input name="origin" required type="url" placeholder="https://..."
        value="${escapeHtml(fields.origin ?? '')}"></label>
        <small>이은 뒤에는 바꿀 수 없습니다 — 자격 증명이 그 시에라의 것이기 때문입니다.</small></p>
      <p><button class="button" type="submit">만든다</button>
         <a class="button plain" href="/bots">취소</a></p>
    </form>
    <p>${escapeHtml(account.login)}의 ${escapeHtml(service)}</p>`);
}

/** 한도에 닿았다 — 만들기 자리가 *왜 없는지* 말하는 한 장. */
export function noRoomPage(max: number): string {
  return page('한도', `
    ${top('한도', leave())}
    <p>봇은 ${max}개까지입니다. 시에라 쪽 한도(<code>bot.max_per_user</code>)에 맞춘 수라,
       늘리려면 그 시에라의 관리자가 먼저 늘려야 합니다.</p>
`);
}

/** 봇 하나의 화면 넷 — **주소가 탭이다**. */
export type BotTab = 'profile' | 'features' | 'auth' | 'advanced';

const TABS: readonly (readonly [BotTab, string, string])[] = [
  ['profile', '', '등록정보'],
  ['features', '/features', '기능'],
  ['auth', '/auth', '인증'],
  ['advanced', '/advanced', '고급'],
];

/**
 * 네 장이 함께 쓰는 틀 — **제목줄과 탭 줄은 어느 탭에서도 같다**.
 *
 * 제목줄의 모양은 봇 목록과 같다(2026-09-23 요구): 왼쪽에 *어느 봇인가*, 오른쪽에 나가는
 * 단추. 탭을 옮길 때마다 그것들이 자리를 바꾸면 사람이 매번 다시 읽는다.
 */
function shell(bot: BotRecord, current: BotTab, body: string, line?: string): string {
  const nav = TABS.map(([key, suffix, label]) =>
    `<a href="/bots/${bot.id}${suffix}"${key === current ? ' aria-current="page"' : ''}>${label}</a>`)
    .join('');

  return page(escapeHtml(bot.declaration.name), `
    ${top(escapeHtml(bot.declaration.name), leave())}
    <p>${statusOf(bot)}${bot.handle === undefined ? ''
      : ` · <code>@${escapeHtml(bot.handle)}</code>`} · ${escapeHtml(bot.origin)}</p>
    <nav class="tabs">${nav}</nav>
    ${said(line)}
    ${isConnected(bot) || current === 'auth' ? '' : `
      <p class="notice">아직 잇지 않았습니다 — <a href="/bots/${bot.id}/auth">인증</a>에서 잇습니다.</p>`}
    ${body}`);
}

/** 그림 자리의 단추 둘 — 아이콘뿐이고 레이블은 눈에서만 감춘다(공용 규칙). 지우기는 지금 그림이 있을 때만 선다. */
function pickButtons(kind: 'avatar' | 'header', label: string, current: string | undefined): string {
  return `<span class="pick-actions">
      <label class="pick-button" title="${label} 바꾸기">${ICON_IMAGE}<span class="sr-only">${label} 바꾸기</span>
        <input class="sr-only" type="file" name="${kind}" accept="image/png,image/jpeg,image/gif,image/webp" data-pick-file="${kind}"></label>
      ${current === undefined ? '' : `<label class="pick-button danger" title="${label} 지우기">${ICON_TRASH}<span class="sr-only">${label} 지우기</span>
        <input class="sr-only" type="checkbox" name="clear_${kind}" value="1" data-pick-clear="${kind}"></label>`}
    </span>`;
}

const ICON_IMAGE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>';
const ICON_TRASH = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
const ICON_PERSON = '<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';

const IMAGE_TIP = 'png·jpg·gif·webp, 10MB까지. 고르지 않으면 지금 것을 둡니다.';

/** 소개의 도움말 — **시에라의 프로필 고치기와 같은 말이다**(2026-10-08) — 이 소개가 곧 시에라 프로필의 소개라 같은 규칙을 진다. */
const BIO_TIP = '마크다운으로 적습니다. @아이디와 [[위키링크]]는 링크가 되지만 알림은 가지 않습니다.';

/** 커스텀 필드 한 줄 — 이름과 값, 저마다 툴팁을 진다. */
function fieldRow(field: { readonly name: string; readonly value: string }, at: number): string {
  return `<div class="field-row">
      <label class="sr-only" for="field-name-${String(at)}">필드 이름</label>
      <span class="tipped" data-tip="이름을 비우면 그 줄이 지워집니다."><input class="inline-edit field-name" id="field-name-${String(at)}"
        name="field_name" value="${escapeHtml(field.name)}" placeholder="이름" maxlength="${String(FIELD_MAX)}"></span>
      <label class="sr-only" for="field-value-${String(at)}">필드 값</label>
      <span class="tipped" data-tip="http로 시작하는 값은 링크가 됩니다."><textarea class="inline-edit field-value" id="field-value-${String(at)}"
        name="field_value" rows="1" placeholder="값" maxlength="${String(FIELD_MAX)}" data-autosize>${escapeHtml(field.value)}</textarea></span>
    </div>`;
}

/**
 * **등록정보** — 이 봇이 자기를 말하는 것.
 *
 * 여기 적은 것이 **선언**(`manifest.json`)이 되고, 고치면 판이 오른다. 시에라는 임자가
 * *새 판 승인*을 눌러야 그것을 가져간다 — **여기서 고쳤다고 저쪽이 바뀌지 않는다.**
 *
 * **시에라의 프로필 카드와 같은 켜다**(2026-10-08 요구 — 하멜의 프로필 고치기와 같은 스펙). 헤더(배경 · 초상화 ·
 * 이름) · 본문(소개 · 커스텀 필드)이고, **카드 하나가 저장 하나다**(공용 규칙). 그림의 단추는 아이콘뿐이고 커서를
 * 올리면 선다 — 배경은 우상귀, 초상화는 가운데, 터치 화면에서는 그림을 눌러야 선다(`:focus-within`). 칸은 글자처럼
 * 서 있다가 커서를 올리면 외곽선이 드러난다. 도움말은 툴팁이고, 소개와 값은 내용만큼 크며, 필드는 마지막 줄의
 * 이름과 값이 둘 다 차면 다음 줄이 선다(`PROFILE`).
 *
 * **초상화와 배경은 파일로 올린다**(2026-10-08 — ~~주소로 준다~~). 이 서비스가 맡아 **버전 있는 공개 주소**
 * (`/bots/{id}/images/{kind}/{hash}`)로 내주고 선언이 그 주소를 싣는다. 지우기 체크와 새 파일은 같은 자리라 한 요청이다.
 *
 * **커스텀 필드는 선언에 실린다**(2026-10-08 — 시에라의 `BotManifest.fields`). 한 번도 적지 않은 봇은 싣지 않는다.
 */
export function profileTab(bot: BotRecord, line?: string): string {
  const connected = isConnected(bot);
  const declared = bot.declaration;
  const fields = declared.fields ?? [];
  const rows = [...fields, ...(fields.length < FIELDS_MAX ? [{ name: '', value: '' }] : [])];

  return shell(bot, 'profile', `
    <form method="post" action="/bots/${bot.id}/declaration" enctype="multipart/form-data" data-wait="저장하는 중…">
      <fieldset class="profile-card">
        <legend class="sr-only">등록정보</legend>
        <div class="card-header">
          <div class="pick pick-header tipped" tabindex="0" data-pick="header" data-tip="${IMAGE_TIP}">
            <img class="header" src="${escapeHtml(declared.header ?? '')}" alt="" data-preview="header"${declared.header === undefined ? ' hidden' : ''}>
            ${pickButtons('header', '배경', declared.header)}
          </div>
          <div class="pick pick-avatar tipped" tabindex="0" data-pick="avatar" data-tip="${IMAGE_TIP} 없으면 시에라의 기본 얼굴이 섭니다.">
            <img class="avatar" src="${escapeHtml(declared.avatar ?? '')}" alt="" data-preview="avatar"${declared.avatar === undefined ? ' hidden' : ''}>
            <span class="avatar fallback" data-fallback="avatar"${declared.avatar === undefined ? '' : ' hidden'}>${ICON_PERSON}</span>
            ${pickButtons('avatar', '초상화', declared.avatar)}
          </div>
          <div class="identity">
            <label class="sr-only" for="bot-name">이름</label>
            <input class="inline-edit display-name" id="bot-name" name="name" required maxlength="60" placeholder="이름"
              value="${escapeHtml(declared.name)}">
            ${bot.handle === undefined ? '' : `<code class="handle">@${escapeHtml(bot.handle)}</code>`}
          </div>
        </div>
        <div class="card-body">
          <label class="sr-only" for="bot-summary">소개</label>
          <span class="tipped" data-tip="${BIO_TIP}"><textarea class="inline-edit summary" id="bot-summary" name="summary"
            required maxlength="200" rows="2" placeholder="소개" data-autosize>${escapeHtml(declared.summary)}</textarea></span>
          <fieldset class="fields" data-fieldrows data-max="${String(FIELDS_MAX)}">
            <legend class="sr-only">커스텀 필드</legend>
            ${rows.map(fieldRow).join('')}
          </fieldset>
          <p class="card-save"><button class="button" type="submit">저장한다</button></p>
        </div>
      </fieldset>
      ${connected
        ? `<p>붙은 시에라 <code>${escapeHtml(bot.origin)}</code>
           <small>이은 뒤에는 바꿀 수 없습니다 — 맡은 자격 증명이 그 시에라의 것입니다.</small></p>`
        : `<p><label>붙을 시에라 <input name="origin" required type="url"
           value="${escapeHtml(bot.origin)}"></label></p>`}
      <small>고치면 선언의 판이 오릅니다 — 시에라에서 <b>새 판 승인</b>을 눌러야 그쪽에 섭니다.</small>
    </form>
    ${PROFILE}`, line);
}

/**
 * **등록정보 카드를 거든다**(2026-10-08 — 하멜의 `behaviors`와 같은 일). 스크립트가 없어도 폼은 선다 — 그림은 파일 칸·
 * 체크로, 필드는 서 있는 줄만큼.
 *
 * - 그림을 고르면 그 자리에서 미리 보이고, 지우기는 미리 걷는다(다시 풀면 원래 그림으로). 저장해야 선다.
 * - `data-autosize` 칸은 내용만큼 큰다 — 스크롤바가 서지 않는다.
 * - 커스텀 필드는 마지막 줄의 이름과 값이 **둘 다 차면** 그 아래가 선다(`data-max`까지).
 */
const PROFILE = `<script>(() => {
  const fit = (area) => {
    const style = getComputedStyle(area);
    area.style.height = 'auto';
    area.style.height = (area.scrollHeight + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth)) + 'px';
  };
  document.querySelectorAll('textarea[data-autosize]').forEach(fit);

  document.addEventListener('change', (event) => {
    const target = event.target;
    const kind = target.dataset && (target.dataset.pickFile || target.dataset.pickClear);
    const pick = kind && target.closest('[data-pick]');
    if (!pick) return;
    const preview = pick.querySelector('[data-preview="' + kind + '"]');
    const fallback = pick.querySelector('[data-fallback="' + kind + '"]');
    const clear = pick.querySelector('[data-pick-clear="' + kind + '"]');
    const file = pick.querySelector('[data-pick-file="' + kind + '"]');
    if (preview.dataset.original === undefined) preview.dataset.original = preview.getAttribute('src') || '';
    const show = (src) => {
      preview.hidden = !src;
      if (src) preview.src = src;
      if (fallback) fallback.hidden = !preview.hidden;
    };
    if (target.dataset.pickFile !== undefined) {
      const chosen = target.files && target.files[0];
      if (chosen) {
        if (clear) { clear.checked = false; clear.closest('label').classList.remove('active'); }
        show(URL.createObjectURL(chosen));
      }
      return;
    }
    target.closest('label').classList.toggle('active', target.checked);
    if (target.checked) { if (file) file.value = ''; show(''); } else { show(preview.dataset.original); }
  });

  document.addEventListener('input', (event) => {
    const target = event.target;
    if (target instanceof HTMLTextAreaElement && target.dataset.autosize !== undefined) fit(target);
    const list = target.closest && target.closest('[data-fieldrows]');
    if (!list) return;
    const rows = [...list.querySelectorAll('.field-row')];
    const last = rows[rows.length - 1];
    if (!last || !last.contains(target) || rows.length >= Number(list.dataset.max)) return;
    const cells = (row) => [...row.querySelectorAll('input, textarea')];
    if (!cells(last).every((cell) => cell.value.trim() !== '')) return;
    const next = last.cloneNode(true);
    for (const cell of cells(next)) {
      const old = cell.id;
      cell.value = '';
      if (cell.tagName === 'TEXTAREA') { cell.textContent = ''; cell.style.removeProperty('height'); }
      cell.id = old.replace(/-\\d+$/, '-' + rows.length);
      const label = next.querySelector('label[for="' + old + '"]');
      if (label) label.htmlFor = cell.id;
    }
    last.after(next);
  });
})();</script>`;

/**
 * **기능** — 그 봇 고유의 것.
 *
 * 봇이 `BotPanel`로 선언한 칸이 여기 선다(`panel.ts`가 그린다). **이어진 뒤에만 설 수
 * 있다** — 그 전에는 시에라를 부를 수 없어 무엇이 있는지도 물을 수 없다.
 */
export function featuresTab(bot: BotRecord, panel: string, line?: string): string {
  const body = panel !== ''
    ? panel
    : isConnected(bot)
      ? `<p>이 봇이 화면에 더한 칸이 없습니다.
         <small>봇이 <code>BotPanel</code>을 주면 그 칸이 여기 섭니다.</small></p>`
      : '<p>이은 뒤에 섭니다 — 그 전에는 시에라에 물을 수 없습니다.</p>';

  return shell(bot, 'features', body, line);
}

/**
 * **인증** — 설치에 드는 것.
 *
 * 순서는 하나뿐이다: 선언 주소가 있어야 시에라가 설치를 받고, 설치를 해야 자격 증명이 난다.
 * **이은 뒤에는 안내가 접힌다** — 매번 같은 설명을 지나 아래로 내려가지 않게 한다.
 */
export function authTab(bot: BotRecord, declarationUrl: string, line?: string): string {
  const connected = isConnected(bot);

  return shell(bot, 'auth', `
    <h2>${connected ? '선언 주소' : '1. 이 주소를 시에라에 붙인다'}</h2>
    <p><code>${escapeHtml(declarationUrl)}</code></p>
    ${connected ? '' : `<p><b>${escapeHtml(bot.origin)}</b>에 그 시에라의 계정으로 들어가
       <b>봇 설치</b>에 위 주소를 붙이면 봇 계정이 서고 <code>client_id</code>와
       <code>client_secret</code>이 나옵니다.
       <b>비밀은 그때 한 번만 보이지만, 잃으면 다시 낼 수 있습니다.</b></p>`}

    <h2>${connected ? '자격 증명을 다시 맡긴다' : '2. 받은 것을 여기 맡긴다'}</h2>
    ${connected
      ? `<p>이어져 있습니다 — <code>@${escapeHtml(bot.handle ?? '')}</code>${
          bot.connectedAt === undefined ? '' : ` (${escapeHtml(bot.connectedAt.slice(0, 10))})`}.
         다시 맡기면 옛것을 덮습니다.</p>`
      : '<p>아직 잇지 않았습니다.</p>'}
    <form method="post" action="/bots/${bot.id}/credentials">
      <p><label>client_id <input name="client_id" required
        value="${escapeHtml(bot.clientId ?? '')}"></label></p>
      <p><label>client_secret <input name="client_secret" type="password" required></label></p>
      <p><button class="button" type="submit">맡긴다</button></p>
      <small>맡기기 전에 한 번 두드려 봅니다 — 틀리면 그 자리에서 말합니다.</small>
    </form>`, line);
}

/**
 * **고급** — 되돌릴 수 있는 것과 없는 것.
 *
 * 멈추는 것은 자격 증명을 두고 읽기만 쉬는 것이라 되돌릴 수 있고, 지우는 것은 아니다 —
 * **가로줄이 그 둘을 가른다**(모체 `CLAUDE.md`).
 */
export function advancedTab(bot: BotRecord, line?: string): string {
  const stopped = bot.stopped === true;

  return shell(bot, 'advanced', `
    ${isConnected(bot) ? `
    <h2>${stopped ? '멈춰 있다' : '돌고 있다'}</h2>
    <form method="post" action="/bots/${bot.id}/${stopped ? 'start' : 'stop'}">
      <p><button type="submit">${stopped ? '다시 돌린다' : '멈춘다'}</button></p>
      <small>${stopped
        ? '멈춘 동안 온 알림은 커서 뒤에 남아 있어, 다시 돌면 거기서부터 읽습니다.'
        : '자격 증명은 두고 읽기만 쉽니다. 언제든 다시 돌릴 수 있습니다.'}</small>
    </form>` : ''}

    <div class="grave">
      <h2>이 봇을 지운다</h2>
      <p>맡긴 자격 증명과 그동안 쌓인 것이 <b>여기서</b> 사라집니다.
         시에라의 봇 계정과 글은 남습니다.</p>
      <p><a class="button danger" href="/bots/${bot.id}/delete">지우러 간다</a></p>
    </div>`, line);
}

/**
 * **지우기 전에 한 번** — 되돌릴 수 없는 것 앞의 한 걸음.
 *
 * *무엇이 사라지고 무엇이 남는가*를 여기서 말한다. 시에라의 봇 계정은 이 서비스가 걷을 수
 * 없다(걷는 일은 **그 시에라의 임자**만 부를 수 있다) — 그 사실을 누르기 전에 읽어야
 * 사람이 *지웠는데 봇이 그대로 있다*고 놀라지 않는다.
 */
export function deletePage(bot: BotRecord): string {
  return page('지울까', `
    ${top('지울까', leave())}
    <p><b>${escapeHtml(bot.declaration.name)}</b>${bot.handle === undefined ? ''
      : ` (<code>@${escapeHtml(bot.handle)}</code>)`} — ${escapeHtml(bot.origin)}</p>
    <h2>여기서 사라지는 것</h2>
    <ul>
      <li>맡긴 자격 증명 — <b>다시 맡기려면 시에라에서 새로 내야 합니다</b></li>
      <li>어디까지 읽었나(커서)</li>
      <li>그 봇에게 사람들이 맡긴 것</li>
      <li>그 봇이 남긴 것</li>
    </ul>
    <h2>시에라에 남는 것</h2>
    <p>봇 계정과 그 봇이 쓴 글은 <b>${escapeHtml(bot.origin)}에 그대로 남습니다.</b>
       거기까지 걷으려면 그 시에라에 임자로 들어가 <b>봇 설치</b> 자리에서 따로 걷어야 합니다 —
       이 서비스는 그 계정의 임자가 아니라 봇일 뿐이라 대신 부를 수 없습니다.</p>
    <p><b>되돌릴 수 없습니다.</b></p>
    <form method="post" action="/bots/${bot.id}/delete">
      <p><button class="danger" type="submit">지운다</button>
         <a class="button plain" href="/bots/${bot.id}/advanced">취소</a></p>
    </form>`);
}

/**
 * **말 거는 사람의 자리**(`/connect/{티켓}`) — 로그인 밖이다.
 *
 * 이 화면을 보는 사람은 **이 서비스의 계정이 없고 만들지도 않는다**. 그래서 제목줄 오른쪽의
 * 드나드는 단추가 서지 않고(`나가기`는 남의 자리로 보낸다), 돌아갈 곳도 없다 — 그 사람이
 * 돌아가는 곳은 시에라이지 여기가 아니다.
 *
 * 제목줄에 서는 것은 **그 봇의 이름**이다. 서비스의 이름이 아니다: 그 사람이 말을 건 상대는
 * 봇이고, 봇이 어느 서비스 위에 도는지는 그 사람의 관심이 아니다.
 */
export function guestPage(botName: string, title: string, body: string, line?: string): string {
  return page(escapeHtml(botName), `
    ${top(escapeHtml(botName), '')}
    <h2>${escapeHtml(title)}</h2>
    ${said(line)}
    ${body}`);
}

/** 막힌 자리 — 어디로 돌아갈지가 늘 함께 선다. */
export function stopPage(title: string, body: string, back: string, word = '돌아가기'): string {
  return page(title, `
    ${top(title, leave())}
    ${body}
    <p><a class="button plain" href="${back}">${word}</a></p>`);
}
