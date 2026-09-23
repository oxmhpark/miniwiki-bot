import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

/**
 * 맡은 비밀을 봉한다 — **AES-256-GCM**, 열쇠는 `BOT_SECRET`에서 scrypt로.
 *
 * 봉하는 것이 둘이다 — **봇의 클라이언트 비밀**(시에라에 대는 신분)과 **사람이 맡긴 키**.
 * 열쇠는 하나이고 **잃으면 둘 다 잃는다**: 모든 봇이 말을 멈추고 모든 사람이 다시 맡긴다.
 *
 * **열쇠는 한 번만 뽑는다.** scrypt는 느린 것이 목적이라 요청마다 돌리면 답이 그만큼 늦고,
 * 비밀은 사람이 적은 긴 문자열이라 솔트를 바꿔 얻는 것이 없다 — 솔트는 이 프로그램의 이름이다.
 *
 * 봉한 것의 모양은 `v1.<iv>.<tag>.<본문>`(전부 base64url)이다. 판을 앞에 두는 것은 나중에
 * 방식을 갈아도 옛것을 읽을 수 있게 하기 위해서다.
 */
export class Sealer {
  private readonly key: Buffer;

  constructor(secret: string) {
    this.key = scryptSync(secret, 'bot/v1', 32);
  }

  seal(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return ['v1', b64(iv), b64(tag), b64(body)].join('.');
  }

  /** **틀린 비밀이면 던진다** — 조용히 빈 문자열을 내면 그것이 키인 줄 알고 서비스를 두드린다. */
  open(sealed: string): string {
    const [version, iv, tag, body] = sealed.split('.');
    if (version !== 'v1' || iv === undefined || tag === undefined || body === undefined) {
      throw new Error('봉한 것의 모양이 아니다');
    }

    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));

    return Buffer.concat([
      decipher.update(Buffer.from(body, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}

function b64(bytes: Buffer): string {
  return bytes.toString('base64url');
}
