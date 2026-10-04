import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

/**
 * 맡은 비밀을 봉한다 — **AES-256-GCM**, 열쇠는 그 서비스의 비밀(`*_SECRET`)에서 scrypt로.
 *
 * **이 파일은 사본이다** — 봇 라이브러리(`bot/src/crypto.ts`)와 도플(`dopple/src/crypto.ts`)이
 * 글자까지 같은 것을 들고, 모체의 `check-copies.sh`가 견준다. 암호만은 한쪽만 고쳐지면 안 된다.
 * 무엇을 봉하는지는 부르는 쪽의 것이다(봇은 클라이언트 비밀과 사람이 맡긴 키, 도플은 토큰).
 *
 * **열쇠는 한 번만 뽑는다.** scrypt는 느린 것이 목적이라 요청마다 돌리면 답이 그만큼 늦고,
 * 비밀은 사람이 적은 긴 문자열이라 솔트를 바꿔 얻는 것이 없다 — **솔트는 그 프로그램의
 * 이름이고 부르는 쪽이 준다**(`bot/v1` · `dopple/seal/v1`). 바꾸면 봉해 둔 것을 전부 잃는다.
 *
 * 봉한 것의 모양은 `v1.<iv>.<tag>.<본문>`(전부 base64url)이다. 판을 앞에 두는 것은 나중에
 * 방식을 갈아도 옛것을 읽을 수 있게 하기 위해서다.
 */
export class Sealer {
  private readonly key: Buffer;

  constructor(secret: string, salt: string) {
    this.key = scryptSync(secret, salt, 32);
  }

  seal(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return ['v1', b64(iv), b64(tag), b64(body)].join('.');
  }

  /** **틀린 열쇠면 던진다** — 조용히 빈 값을 내면 그것이 비밀인 줄 알고 남의 서버를 두드린다. */
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
