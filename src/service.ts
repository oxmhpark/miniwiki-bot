import { readConfig } from './config.js';
import { Sealer } from './crypto.js';
import { DEFAULT_SCOPES } from './manifest.js';
import type { BotPanel } from './panel.js';
import type { BotBrain } from './runner.js';
import { Fleet } from './runner.js';
import type { BotRecord } from './state.js';
import { FileStore } from './state.js';
import { createWebServer } from './web.js';

/**
 * 서비스를 세운다 — **포크한 봇이 부르는 자리**.
 *
 * 템플릿이 지는 것: 설정·상태·봉인·계정·봇·선언·시에라·폴링·화면.
 * 포크가 주는 것: `brain` — *한 바퀴에 무엇을 하는가* 하나.
 */

export interface ServiceOptions {
  /** 봇 하나의 머리를 짓는다. */
  readonly brain: (bot: BotRecord) => BotBrain;
  /** 이 봇 프로그램의 판 — 선언의 `version` 앞자리가 된다. */
  readonly codeVersion: string;
  /** 이 봇이 청하는 권한. 기본은 *멘션에 답하는 봇*의 넷이다. */
  readonly scopes?: readonly string[];

  /** 봇 화면에 더할 칸 — 그 봇의 설정과 단추가 여기 선다. */
  readonly panel?: BotPanel;
}

const log = (line: string): void => {
  console.log(`${new Date().toISOString()} ${line}`);
};

export async function startService(options: ServiceOptions): Promise<void> {
  const config = readConfig(process.env);
  const store = new FileStore(config.stateDir);
  const sealer = new Sealer(config.secret);

  const fleet = new Fleet({
    store,
    sealer,
    publicOrigin: config.publicOrigin,
    dryRun: config.dryRun,
    pollMs: config.pollMs,
    log,
    brain: options.brain,
  });

  const server = createWebServer({
    store,
    sealer,
    fleet,
    github: {
      clientId: config.githubClientId,
      clientSecret: config.githubClientSecret,
      redirectUri: `${config.publicOrigin}/auth/github/callback`,
    },
    publicOrigin: config.publicOrigin,
    codeVersion: options.codeVersion,
    maxBotsPerAccount: config.maxBotsPerAccount,
    scopes: options.scopes ?? DEFAULT_SCOPES,
    ...(options.panel === undefined ? {} : { panel: options.panel }),
    log,
  });

  await new Promise<void>((resolve) => server.listen(config.port, resolve));

  // 서 있던 봇들을 띄운다 — 다시 뜬 것뿐이라 화면을 거치지 않는다.
  await fleet.sync();

  const bots = (await store.bots()).length;
  log(
    `선다 — ${config.publicOrigin} (:${config.port}) · 봇 ${bots}`
    + ` · 읽기 ${config.pollMs / 1000}초${config.dryRun ? ' · 재기만 한다' : ''}`,
  );

  const down = (): void => {
    void (async (): Promise<void> => {
      await fleet.stopAll();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      log('내려간다');
    })();
  };

  process.on('SIGTERM', down);
  process.on('SIGINT', down);
}
