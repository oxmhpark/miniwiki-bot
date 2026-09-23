import type { Sealer } from './crypto.js';
import type { ConnectTicket, IntakeWho } from './intake.js';
import type { Notification, Sierra } from './sierra.js';
import { SierraClient, SierraError } from './sierra.js';
import type { BotRecord, FileStore } from './state.js';
import { isRunnable } from './state.js';
import type { Tickets } from './tickets.js';

/**
 * 봇 하나를 돌리는 자리 — **봇마다 자기 시계로 돈다**.
 *
 * 한 바퀴가 봇들을 차례로 돌면 봇이 늘수록 주기가 무너지고, 무엇보다 **봇 하나가 막히면
 * 나머지가 함께 선다**(죽은 시에라, `429`). 그래서 루프는 봇마다다.
 *
 * 코어의 한도(`bot.rate_limit_per_hour`, 기본 300)도 **봇 계정마다** 걸리므로 세는 자리도
 * 봇마다다 — 30초 폴링은 봇 하나에 120/h이고, 봇이 늘어도 그 숫자는 안 변한다. 늘어나는 것은
 * 이 프로세스가 바깥으로 내는 총량이다.
 */

/** 봇이 한 바퀴를 도는 동안 손에 쥐는 것. */
export interface BotContext {
  readonly bot: BotRecord;
  readonly sierra: Sierra;
  readonly store: FileStore;
  readonly sealer: Sealer;
  /** 사람이 브라우저로 닿는 이 서비스의 주소 — 연결 링크가 여기서 난다. */
  readonly publicOrigin: string;

  /**
   * **그 사람에게 보낼 연결 링크** — `/connect/{티켓}`의 온전한 주소다(`intake.ts`).
   *
   * 부를 때마다 새 티켓이 난다(15분). 링크에 실린 것은 *어느 봇의 누구인가*이고, 그것이
   * 곧 그 사람의 신원이다 — **말 거는 사람은 이 서비스의 계정을 만들지 않는다.**
   *
   * 포크가 `intake`를 주지 않았으면 링크를 내도 그 자리는 404다 — 부르기 전에 자기 봇이
   * 무엇을 청하는지 알고 있어야 한다.
   */
  readonly connectLink: (who: IntakeWho) => string;
  /** **읽고 부르되 쓰지 않는다.** */
  readonly dryRun: boolean;
  readonly log: (line: string) => void;
}

/**
 * **포크한 봇이 짓는 것은 이것 하나다.**
 *
 * 템플릿이 지는 것 — 계정·봇·자격 증명·시에라 왕복·선언·폴링·상태·봉인·웹. 봇이 지는 것 —
 * *한 바퀴에 무엇을 하는가*.
 */
export interface BotBrain {
  /** 한 바퀴. 다룬 건수를 돌려준다(로그에만 쓴다). */
  tick(ctx: BotContext): Promise<number>;
}

/**
 * 알림을 읽어 하나씩 넘기는 흔한 모양 — **멘션에 답하는 봇**이 이것을 쓴다.
 *
 * **`min_id`는 오래된 쪽부터 채우고 최신 순으로 돌려준다**(코어의 `CursorQuery`). 그래서
 * 뒤집어 처리하고 커서는 마지막 알림 id다.
 *
 * **처리 여부와 무관하게 커서는 나간다.** 하나가 던졌다고 커서를 붙들면 같은 것을 영영 다시
 * 읽는다 — 그 알림은 로그에 남기고 넘어간다.
 */
export async function eachNotification(
  ctx: BotContext,
  handle: (notification: Notification) => Promise<void>,
): Promise<number> {
  const since = await ctx.store.cursor(ctx.bot.id);
  const fresh = [...(await ctx.sierra.notifications(since))].reverse();

  let handled = 0;
  for (const notification of fresh) {
    try {
      await handle(notification);
      handled += 1;
    } catch (error) {
      ctx.log(`알림 ${notification.id}을(를) 넘긴다: ${(error as Error).message}`);
    }

    await ctx.store.setCursor(ctx.bot.id, notification.id);
  }

  return handled;
}

function sleep(ms: number, stopping: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const done = (): void => {
      clearTimeout(timer);
      clearInterval(wake);
      resolve();
    };

    const timer = setTimeout(done, ms);
    const wake = setInterval(() => {
      if (stopping()) {
        done();
      }
    }, 250);
  });
}

/** 봇 하나의 루프. **죽는 것은 밖에서 세울 때뿐이다** — 한 바퀴가 실패해도 다음 바퀴는 돈다. */
export class BotRunner {
  private stopping = false;
  private loop: Promise<void> | undefined;

  constructor(
    private readonly ctx: BotContext,
    private readonly brain: BotBrain,
    private readonly pollMs: number,
  ) {}

  get botId(): string {
    return this.ctx.bot.id;
  }

  start(): void {
    this.loop ??= this.run();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    await this.loop;
  }

  private async run(): Promise<void> {
    const name = this.ctx.bot.handle ?? this.ctx.bot.declaration.name;
    this.ctx.log(`[${name}] 돈다 — ${this.ctx.bot.origin} · ${this.pollMs / 1000}초`);

    while (!this.stopping) {
      let wait = this.pollMs;

      try {
        const handled = await this.brain.tick(this.ctx);
        if (handled > 0) {
          this.ctx.log(`[${name}] ${handled}건`);
        }
      } catch (error) {
        this.ctx.log(`[${name}] 한 바퀴가 막혔다: ${(error as Error).message}`);

        // 한도면 코어가 말한 만큼 쉰다.
        if (error instanceof SierraError && error.status === 429) {
          wait = Math.max(wait, (error.retryAfter ?? 60) * 1000);
        }
      }

      if (!this.stopping) {
        await sleep(wait, () => this.stopping);
      }
    }

    this.ctx.log(`[${name}] 멈춘다`);
  }
}

export interface FleetOptions {
  readonly store: FileStore;
  readonly sealer: Sealer;
  readonly publicOrigin: string;
  readonly dryRun: boolean;
  readonly pollMs: number;
  readonly log: (line: string) => void;
  /** 봇 하나의 머리를 짓는다 — **포크한 봇이 여기에 자기 것을 준다**. */
  readonly brain: (bot: BotRecord) => BotBrain;

  /**
   * 연결 링크의 표 — **화면과 같은 것을 쥔다**.
   *
   * 여기서 낸 티켓을 `/connect`가 받는다. 표가 둘이면 봇이 보낸 링크를 화면이 모른다.
   */
  readonly tickets: Tickets<ConnectTicket>;
}

/**
 * 서 있는 봇들 — **화면에서 봇이 생기고 멈추는 것을 따라간다**.
 *
 * 프로세스가 뜰 때 한 번 훑고 끝내면, 임자가 방금 이은 봇은 **다시 뜰 때까지 돌지 않는다**.
 * 그래서 봇을 만지는 자리(`web`)가 `sync()`를 부른다.
 */
export class Fleet {
  private readonly running = new Map<string, BotRunner>();

  constructor(private readonly options: FleetOptions) {}

  /** 상태를 보고 돌 것은 띄우고 아닌 것은 내린다. */
  async sync(): Promise<void> {
    const bots = await this.options.store.bots();
    const should = new Map(bots.filter(isRunnable).map((bot) => [bot.id, bot]));

    for (const [id, runner] of this.running) {
      if (!should.has(id)) {
        this.running.delete(id);
        await runner.stop();
      }
    }

    for (const [id, bot] of should) {
      if (this.running.has(id)) {
        continue;
      }

      const runner = this.spawn(bot);
      this.running.set(id, runner);
      runner.start();
    }
  }

  async stopAll(): Promise<void> {
    const all = [...this.running.values()];
    this.running.clear();

    await Promise.all(all.map(async (runner) => await runner.stop()));
  }

  /**
   * 그 봇의 손 — **화면이 포크의 칸을 그릴 때도 이것이 든다**(`BotPanel`).
   *
   * 봉인을 푸는 유일한 자리다. 아직 잇지 않은 봇이면 클라이언트 비밀이 없어 시에라 호출이
   * 그대로 실패한다 — 부르는 쪽이 `isConnected`를 먼저 본다.
   */
  contextOf(bot: BotRecord): BotContext {
    const clientSecret = bot.sealedClientSecret === undefined
      ? ''
      : this.options.sealer.open(bot.sealedClientSecret);

    return {
      bot,
      sierra: new SierraClient({
        origin: bot.origin,
        clientId: bot.clientId ?? '',
        clientSecret,
      }),
      store: this.options.store,
      sealer: this.options.sealer,
      publicOrigin: this.options.publicOrigin,
      connectLink: (who) => `${this.options.publicOrigin}/connect/${
        this.options.tickets.issue({ botId: bot.id, userId: who.id, handle: who.handle })}`,
      dryRun: this.options.dryRun,
      log: this.options.log,
    };
  }

  private spawn(bot: BotRecord): BotRunner {
    return new BotRunner(this.contextOf(bot), this.options.brain(bot), this.options.pollMs);
  }
}
