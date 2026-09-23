import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * 다시 떠도 남는 것 — **계정과 봇들, 그리고 봇마다의 커서와 사람들**.
 *
 * ```
 * state/
 *   index/identity/{provider}-{subject}.json   신원 → 계정
 *   accounts/{accountId}.json                  임자
 *   bots/{botId}/
 *     bot.json                                 임자 · 시에라 · 봉한 클라이언트 비밀 · 선언
 *     cursor.json                              어디까지 읽었나
 *     users/{사용자 id}.json                    그 봇에게 맡긴 것
 * ```
 *
 * **봇 아래로 갈리는 것이 이 파일의 요점이다.** 사람 기록을 한 폴더에 평평하게 두면 시에라가
 * 둘일 때 **같은 GUID가 다른 사람**이 된다 — 봇 폴더가 그 자리를 없앤다.
 *
 * **대화 기록은 여기 없다.** 무엇을 남길지는 포크한 봇이 `data`에 정한다.
 */

/** 임자의 신원 — 지금은 GitHub 하나다. */
export interface Identity {
  readonly provider: 'github';
  /** 그 서비스가 준 변하지 않는 열쇠. GitHub은 숫자 id다 — **로그인 이름이 아니다**(바뀐다). */
  readonly subject: string;
}

export interface AccountRecord {
  readonly id: string;
  readonly identity: Identity;
  /** 보여 줄 이름. 바뀔 수 있으므로 열쇠로 쓰지 않는다. */
  readonly login: string;
  readonly createdAt: string;
}

/** 봇이 자기를 말하는 것 — 그대로 선언(`manifest.json`)이 된다. */
export interface BotDeclaration {
  readonly name: string;
  readonly summary: string;
  readonly avatar?: string;
  readonly header?: string;
}

export interface BotRecord {
  readonly id: string;
  /** 임자 — 이 서비스의 계정이다(시에라의 임자와 같은 사람일 필요는 없다). */
  readonly accountId: string;

  /** 붙는 시에라. 끝의 `/`는 떼어 둔다. */
  readonly origin: string;

  readonly declaration: BotDeclaration;

  /**
   * 선언의 판 뒷자리 — `{코드판}+{이 수}`가 `manifest.json`의 `version`이 된다.
   *
   * **선언이 바뀔 때마다 오른다.** 코어는 이 문자열을 비교해 임자에게 *새 판 승인*을 띄우므로,
   * 이름을 고쳤는데 판이 그대로면 **시에라가 모른다**.
   */
  readonly settingsVersion: number;

  /** 시에라에 실제로 선 뒤에 안다 — 그 전에는 없다. */
  readonly clientId?: string;
  /** **봉해 둔다**(`Sealer`). 푸는 것은 토큰을 받을 때 한 번이다. */
  readonly sealedClientSecret?: string;
  readonly handle?: string;
  readonly sierraBotId?: string;
  readonly connectedAt?: string;

  /** 임자가 멈춰 둔 것 — 자격 증명은 두고 폴링만 쉰다. */
  readonly stopped?: boolean;
}

/** 그 봇에게 무언가를 맡긴 사람. **`data`가 무엇인지는 포크한 봇이 정한다.** */
export interface UserRecord<T> {
  readonly id: string;
  readonly handle: string;
  readonly data: T;
}

/** 자격 증명이 다 있는가 — 없으면 폴링을 시작할 수 없다. */
export function isConnected(bot: BotRecord): boolean {
  return bot.clientId !== undefined && bot.sealedClientSecret !== undefined;
}

/** 지금 돌아야 하는 봇인가. */
export function isRunnable(bot: BotRecord): boolean {
  return isConnected(bot) && bot.stopped !== true;
}

/**
 * 읽는다 — **없으면 `undefined`**, 깨진 파일은 던진다: 조용히 빈 것으로 떨어지면 *처음 뜨는
 * 것*과 겉보기가 같아 사람이 알아채지 못한다.
 */
async function readJson<T>(path: string): Promise<T | undefined> {
  let raw: string;

  try {
    raw = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }

    throw error;
  }

  return JSON.parse(raw) as T;
}

/** 쓴다 — **임시 파일에 쓰고 옮긴다**. `rename`은 같은 파일 시스템 안에서 원자적이다. */
async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });

  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporary, path);
}

/**
 * **경로에 넣기 전에 모양을 본다.** 사람이 적은 문자열이 폴더 이름이 되는 자리라, 여기가
 * 막히지 않으면 `../`가 상태 폴더 밖을 가리킨다.
 */
function safeSegment(value: string, what: string): string {
  if (!/^[0-9a-zA-Z][0-9a-zA-Z_-]{0,63}$/.test(value)) {
    throw new Error(`${what}의 모양이 아니다: ${value}`);
  }

  return value;
}

/** 시에라의 id는 GUID다. */
function safeGuid(value: string, what: string): string {
  if (!/^[0-9a-fA-F-]{36}$/.test(value)) {
    throw new Error(`${what}의 모양이 아니다: ${value}`);
  }

  return value.toLowerCase();
}

export class FileStore {
  constructor(private readonly dir: string) {}

  // ── 계정 ────────────────────────────────────────────────────────────────

  async account(id: string): Promise<AccountRecord | undefined> {
    return await readJson<AccountRecord>(this.accountPath(id));
  }

  /** 신원으로 찾는다 — 로그인 왕복이 끝난 자리에서 부른다. */
  async accountByIdentity(identity: Identity): Promise<AccountRecord | undefined> {
    const pointer = await readJson<{ readonly accountId: string }>(this.identityPath(identity));
    return pointer === undefined ? undefined : await this.account(pointer.accountId);
  }

  /** **계정과 색인을 함께 쓴다** — 색인이 없으면 다음 로그인이 계정을 또 만든다. */
  async saveAccount(account: AccountRecord): Promise<void> {
    await writeJson(this.accountPath(account.id), account);
    await writeJson(this.identityPath(account.identity), { accountId: account.id });
  }

  // ── 봇 ──────────────────────────────────────────────────────────────────

  async bot(id: string): Promise<BotRecord | undefined> {
    return await readJson<BotRecord>(this.botPath(id));
  }

  async saveBot(bot: BotRecord): Promise<void> {
    await writeJson(this.botPath(bot.id), bot);
  }

  /** 전부 — 프로세스가 뜰 때 무엇을 돌릴지 여기서 안다. */
  async bots(): Promise<readonly BotRecord[]> {
    const ids = await this.listDir(join(this.dir, 'bots'));

    const records: BotRecord[] = [];
    for (const id of ids) {
      const record = await readJson<BotRecord>(join(this.dir, 'bots', id, 'bot.json'));
      if (record !== undefined) {
        records.push(record);
      }
    }

    return records;
  }

  async botsOf(accountId: string): Promise<readonly BotRecord[]> {
    return (await this.bots()).filter((bot) => bot.accountId === accountId);
  }

  /** **봇 폴더째 지운다** — 커서도 맡긴 것도 함께 간다. */
  async forgetBot(id: string): Promise<void> {
    await rm(join(this.dir, 'bots', safeSegment(id, '봇 id')), { recursive: true, force: true });
  }

  // ── 봇마다의 커서 ───────────────────────────────────────────────────────

  async cursor(botId: string): Promise<string | undefined> {
    const parsed = await readJson<{ readonly id?: string }>(this.cursorPath(botId));
    return parsed?.id;
  }

  async setCursor(botId: string, id: string): Promise<void> {
    await writeJson(this.cursorPath(botId), { id });
  }

  /**
   * 커서를 지운다 — **처음부터 다시 읽는다**.
   *
   * 봇이 무엇을 담을지 정하는 규칙이 바뀌었을 때 드는 자리다(에코의 풀 그룹). 규칙만 고치면
   * *이미 읽은 것*은 커서 뒤에 남아 영영 다시 보지 않으므로, 고친 규칙이 옛 것에도 듣게
   * 하려면 커서를 물러야 한다.
   */
  async clearCursor(botId: string): Promise<void> {
    await rm(this.cursorPath(botId), { force: true });
  }

  // ── 봇마다의 포크 상태 ──────────────────────────────────────────────────

  /**
   * **포크가 정하는 모양**(`data.json`) — 템플릿은 안을 모른다.
   *
   * 커서는 템플릿의 것이지만(어느 봇이든 *어디까지 읽었나*가 있다) 그 밖에 봇이 남길 것은
   * 봇마다 다르다 — 에코의 풀과 발행 시계, 다른 봇의 무엇. **봇 폴더 안에 두므로 봇을 지우면
   * 함께 간다.**
   */
  async botData<T>(botId: string): Promise<T | undefined> {
    return await readJson<T>(this.botDataPath(botId));
  }

  async saveBotData<T>(botId: string, data: T): Promise<void> {
    await writeJson(this.botDataPath(botId), data);
  }

  // ── 봇마다의 사람들 ─────────────────────────────────────────────────────

  async user<T>(botId: string, userId: string): Promise<UserRecord<T> | undefined> {
    return await readJson<UserRecord<T>>(this.userPath(botId, userId));
  }

  async saveUser<T>(botId: string, user: UserRecord<T>): Promise<void> {
    await writeJson(this.userPath(botId, user.id), user);
  }

  async forgetUser(botId: string, userId: string): Promise<void> {
    await rm(this.userPath(botId, userId), { force: true });
  }

  async users<T>(botId: string): Promise<readonly UserRecord<T>[]> {
    const dir = join(this.dir, 'bots', safeSegment(botId, '봇 id'), 'users');
    const names = await this.listDir(dir);

    const records: UserRecord<T>[] = [];
    for (const name of names) {
      if (!name.endsWith('.json')) {
        continue;
      }

      const record = await readJson<UserRecord<T>>(join(dir, name));
      if (record !== undefined) {
        records.push(record);
      }
    }

    return records;
  }

  // ── 경로 ────────────────────────────────────────────────────────────────

  private async listDir(path: string): Promise<readonly string[]> {
    try {
      return await readdir(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }

      throw error;
    }
  }

  private accountPath(id: string): string {
    return join(this.dir, 'accounts', `${safeSegment(id, '계정 id')}.json`);
  }

  private identityPath(identity: Identity): string {
    const provider = safeSegment(identity.provider, '신원 제공자');
    const subject = safeSegment(identity.subject, '신원 열쇠');

    return join(this.dir, 'index', 'identity', `${provider}-${subject}.json`);
  }

  private botDir(id: string): string {
    return join(this.dir, 'bots', safeSegment(id, '봇 id'));
  }

  private botPath(id: string): string {
    return join(this.botDir(id), 'bot.json');
  }

  private cursorPath(botId: string): string {
    return join(this.botDir(botId), 'cursor.json');
  }

  private botDataPath(botId: string): string {
    return join(this.botDir(botId), 'data.json');
  }

  private userPath(botId: string, userId: string): string {
    return join(this.botDir(botId), 'users', `${safeGuid(userId, '사용자 id')}.json`);
  }
}
