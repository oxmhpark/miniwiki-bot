import { readFile } from 'node:fs/promises';
import { readConfig } from './config.js';
import { Sealer } from './crypto.js';
import { DEFAULT_SCOPES } from './manifest.js';
import type { BotPanel } from './panel.js';
import type { BotBrain } from './runner.js';
import { Fleet } from './runner.js';
import type { BotRecord } from './state.js';
import { FileStore } from './state.js';
import { renderMarkdown } from './markdown.js';
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

/**
 * 저장소의 파일 하나 — **없으면 `undefined`**.
 *
 * 자리는 이 모듈을 기준으로 잡는다(`dist/service.js` → `/app`, `src/service.ts` → 저장소
 * 루트). 프로세스를 어디서 띄웠는지에 기대면 **개발에서만 서고 이미지에서는 빈다.**
 */
async function beside(name: string): Promise<string | undefined> {
  try {
    return await readFile(new URL(`../${name}`, import.meta.url), 'utf8');
  } catch {
    return undefined;
  }
}

/**
 * 화면의 제목줄에 설 이름 — **환경이 먼저, 그다음이 선언의 틀**.
 *
 * 루트 `manifest.json`은 *새 봇의 틀*이고 **포크가 이미 자기 것으로 바꾸는 파일**이라(에코의
 * `에코`) 여기 적힌 이름이 곧 그 서비스의 이름이다. 한 저장소를 여러 자리에 세우면서 이름을
 * 달리해야 할 때만 `BOT_SERVICE_NAME`을 준다.
 */
async function serviceName(given: string | undefined): Promise<string> {
  if (given !== undefined) {
    return given;
  }

  const raw = await beside('manifest.json');
  if (raw === undefined) {
    return '봇';
  }

  try {
    return (JSON.parse(raw) as { readonly name?: string }).name ?? '봇';
  } catch {
    return '봇';
  }
}

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

  /*
   * **첫 화면의 본문은 `README.md`다**(2026-09-23 요구). 한 번 읽어 그려 두고 다시 읽지
   * 않는다 — 이미지 안에서 바뀌지 않는 파일이다.
   */
  const readme = await beside('README.md');
  const name = await serviceName(config.serviceName);

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
    serviceName: name,
    readme: readme === undefined ? '' : renderMarkdown(readme),
    ...(options.panel === undefined ? {} : { panel: options.panel }),
    log,
  });

  await new Promise<void>((resolve) => server.listen(config.port, resolve));

  // 서 있던 봇들을 띄운다 — 다시 뜬 것뿐이라 화면을 거치지 않는다.
  await fleet.sync();

  const bots = (await store.bots()).length;
  log(
    `선다 — ${name} · ${config.publicOrigin} (:${config.port}) · 봇 ${bots}`
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
