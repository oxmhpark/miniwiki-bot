/**
 * **이 라이브러리의 공개 API** — 봇이 여기서만 가져다 쓴다.
 *
 * **봇은 포크하지 않고 의존한다.** 봇 저장소에는 자기 코드만 남고, 이 라이브러리는 git 태그
 * 의존으로 들어간다(`"miniwiki-bot": "github:oxmhpark/miniwiki-bot#v0.6.0"` — `.claude/BOT.md`의
 * *봇을 짓는 법*). 검사에서 쓰는 가짜 시에라는 `miniwiki-bot/testing`에 따로 있다.
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
export * from './commands.js';
