/**
 * **이 라이브러리의 공개 API** — 봇이 여기서만 가져다 쓴다.
 *
 * 2026-09-24까지 이 저장소는 **템플릿**이었다: 봇마다 포크해서 파일 열일곱 개를 복사해
 * 두고, 템플릿이 나아지면 `git merge`로 받았다. 그 방식이 덜컹거린 자리는 세 군데였다 —
 * `PROJECT.md`가 merge마다 부딪혔고, 복사된 파일을 *고치지 마라*는 규율이 사람에게 있었고,
 * 받지 않은 포크가 조용히 뒤처졌다.
 *
 * **이제 봇은 포크하지 않고 의존한다.** 봇 저장소에는 자기 코드만 남고, 이 라이브러리는
 * `vendor/bot` 서브모듈로 매달려 `file:`로 들어간다(`.claude/BOT.md`의 *봇을 짓는 법*).
 *
 * **내보내지 않는 것**: `web.ts` · `pages.ts` · `auth.ts` · `markdown.ts`. 화면과 문은
 * 이 라이브러리가 통째로 지는 것이라 봇이 손댈 자리가 아니다 — 봇이 화면에 더할 것은
 * `BotPanel`과 `BotIntake`로 **선언한다**.
 */

export { startService } from './service.js';
export type { ServiceOptions } from './service.js';

export * from './runner.js';
export * from './panel.js';
export * from './intake.js';
export * from './state.js';
export * from './sierra.js';
export * from './crypto.js';
export * from './text.js';
export * from './tickets.js';
export * from './config.js';
export * from './manifest.js';
