import { defineConfig } from 'vitest/config';

/**
 * **별칭이 없다.** 봇은 코어 밖의 프로그램이라 가리킬 것이 애초에 없다 —
 * 시에라와는 <b>HTTP로만</b> 만난다(`PROJECT.md`).
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
