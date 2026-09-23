import type { BotBrain, BotContext } from 'miniwiki-bot';
import { eachNotification, startService } from 'miniwiki-bot';

/**
 * **새 봇은 이 파일에서 시작한다** — `miniwiki-bot` 라이브러리의 견본이다.
 *
 * 그대로 두면 봇은 알림을 읽고 아무것도 하지 않는다. 그래도 계정·봇 등록·선언·자격 증명·
 * 폴링·상태·봉인·화면은 **전부 라이브러리가 진다** — 봇이 짓는 것은 `tick` 하나다.
 */

class EmptyBrain implements BotBrain {
  async tick(ctx: BotContext): Promise<number> {
    return await eachNotification(ctx, async (notification) => {
      ctx.log(`[${ctx.bot.handle ?? ctx.bot.id}] ${notification.kind} — 아직 할 일이 없다`);
    });
  }
}

await startService({
  /**
   * **이 저장소의 루트** — 라이브러리가 `ABOUT.md`와 `manifest.json`을 여기서 읽는다.
   *
   * `dist/main.js`에서도 `src/main.ts`에서도 한 단계 위가 저장소 루트다. 라이브러리를
   * 기준으로 잡으면 `node_modules/` 안을 보게 되므로 **봇이 자기 자리를 말한다.**
   */
  root: new URL('../', import.meta.url),

  brain: () => new EmptyBrain(),
  codeVersion: '0.1.0',
});
