import { readFile } from 'node:fs/promises';
import { readConfig } from './config.js';
import { Sealer } from './crypto.js';
import type { BotIntake, ConnectTicket } from './intake.js';
import { DEFAULT_SCOPES } from './manifest.js';
import type { BotPanel } from './panel.js';
import type { BotBrain } from './runner.js';
import { Fleet } from './runner.js';
import type { BotRecord } from './state.js';
import { FileStore } from './state.js';
import { renderMarkdown, withoutTitle } from './markdown.js';
import { Tickets } from './tickets.js';
import { createWebServer } from './web.js';

/**
 * 서비스를 세운다 — **포크한 봇이 부르는 자리**.
 *
 * 템플릿이 지는 것: 설정·상태·봉인·계정·봇·선언·시에라·폴링·화면.
 * 포크가 주는 것: `brain` — *한 바퀴에 무엇을 하는가* 하나.
 */

export interface ServiceOptions {
  /**
   * **봇 저장소의 루트** — `new URL('../', import.meta.url)`로 준다.
   *
   * 이 라이브러리가 봇의 `ABOUT.md`(첫 화면)와 `manifest.json`(서비스 이름)을 읽는 자리다.
   * 라이브러리 자신을 기준으로 잡으면 `node_modules/` 안을 보게 되고, `process.cwd()`로
   * 잡으면 **어디서 띄웠는지에 따라 달라진다** — 그래서 봇이 자기 자리를 말한다.
   */
  readonly root: URL;

  /** 봇 하나의 머리를 짓는다. */
  readonly brain: (bot: BotRecord) => BotBrain;
  /** 이 봇 프로그램의 판 — 선언의 `version` 앞자리가 된다. */
  readonly codeVersion: string;
  /** 이 봇이 청하는 권한. 기본은 *멘션에 답하는 봇*의 넷이다. */
  readonly scopes?: readonly string[];

  /** 봇 화면에 더할 칸 — 그 봇의 설정과 단추가 여기 선다. */
  readonly panel?: BotPanel;

  /**
   * **말 거는 사람이 무언가를 맡기는 자리**(`/connect/{티켓}`).
   *
   * 주지 않으면 그 주소는 404다 — 아무것도 맡을 것이 없는 봇(에코)이 그렇다.
   */
  readonly intake?: BotIntake;
}

const log = (line: string): void => {
  console.log(`${new Date().toISOString()} ${line}`);
};

/**
 * **봇 저장소의 파일 하나** — 없으면 `undefined`.
 *
 * 자리는 봇이 `root`로 준다(`new URL('../', import.meta.url)` — `dist/main.js`에서도
 * `src/main.ts`에서도 그 저장소의 루트다). **프로세스를 어디서 띄웠는지에 기대지 않는다**:
 * `process.cwd()`로 잡으면 개발에서만 서고 이미지에서는 빈다.
 *
 * 이 라이브러리를 기준으로 잡을 수도 없다 — 그러면 `node_modules/miniwiki-bot/` 안을 보게
 * 되고, `ABOUT.md`와 `manifest.json`은 **봇의 것**이다.
 */
async function beside(root: URL, name: string): Promise<string | undefined> {
  try {
    return await readFile(new URL(name, root), 'utf8');
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
async function serviceName(root: URL, given: string | undefined): Promise<string> {
  if (given !== undefined) {
    return given;
  }

  const raw = await beside(root, 'manifest.json');
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

  /*
   * **연결 링크의 표는 하나다** — 봇이 내고 화면이 받는다.
   *
   * 봇 쪽과 화면 쪽이 따로 쥐면 방금 보낸 링크를 화면이 모른다. 메모리에만 있고(`tickets.ts`)
   * 다시 뜨면 죽지만, 그래도 되는 까닭은 **다시 말을 걸면 새 링크가 오기** 때문이다.
   */
  const tickets = new Tickets<ConnectTicket>();

  const fleet = new Fleet({
    store,
    sealer,
    publicOrigin: config.publicOrigin,
    dryRun: config.dryRun,
    pollMs: config.pollMs,
    log,
    brain: options.brain,
    tickets,
  });

  /*
   * **첫 화면의 본문은 `ABOUT.md`다**(2026-09-23 요구). 한 번 읽어 그려 두고 다시 읽지
   * 않는다 — 이미지 안에서 바뀌지 않는 파일이다.
   *
   * **`README.md`가 아니다.** 그 파일은 저장소를 여는 개발자의 것이고 템플릿에도 있어야
   * 하는데, 첫 화면까지 그것으로 지면 **포크가 merge할 때마다 부딪힌다** — `BOT.md`와
   * `PROJECT.md`를 가른 것과 같은 까닭이다. 없으면 첫 화면은 제목과 단추만 선다.
   */
  const about = await beside(options.root, 'ABOUT.md');
  const name = await serviceName(options.root, config.serviceName);

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
    about: about === undefined ? '' : renderMarkdown(withoutTitle(about)),
    ...(options.panel === undefined ? {} : { panel: options.panel }),
    ...(options.intake === undefined ? {} : { intake: options.intake }),
    tickets,
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
