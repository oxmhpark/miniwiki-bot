import type { BotBrain, BotContext } from './runner.js';
import { eachNotification } from './runner.js';
import { startService } from './service.js';

/**
 * **포크한 봇이 고치는 파일은 여기부터다.**
 *
 * 템플릿이 그대로 서 있으면 봇은 알림을 읽고 아무것도 하지 않는다 — 그래도 계정·봇 등록·선언·
 * 폴링은 다 돈다. 자기 봇을 지으려면 `tick`을 채우고, 이 파일 위쪽은 대개 그대로 둔다.
 */

class EmptyBrain implements BotBrain {
  async tick(ctx: BotContext): Promise<number> {
    return await eachNotification(ctx, async (notification) => {
      ctx.log(`[${ctx.bot.handle ?? ctx.bot.id}] ${notification.kind} — 아직 할 일이 없다`);
    });
  }
}

await startService({
  brain: () => new EmptyBrain(),
  codeVersion: '0.1.0',
});
