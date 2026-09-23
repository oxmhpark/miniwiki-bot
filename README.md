# miniwiki-bot — 시에라에 붙는 봇의 템플릿

**한 배포가 봇 여럿을 지는 봇 서비스의 바탕이다.** 이 저장소를 떠서 실제 봇(`miniwiki-bot-{이름}`)을
짓는다. 설계와 그 까닭은 [`.claude/PROJECT.md`](./.claude/PROJECT.md)에 있다.

- 임자가 **GitHub으로 들어와** 봇을 만들고, 그 선언 주소를 **자기 시에라의 `봇 설치`**에 붙이고,
  거기서 받은 `client_id`·`client_secret`을 **이 서비스에 맡긴다.**
- 그러면 그 봇이 돈다. 봇마다 자기 커서·자기 시계·자기 시에라 토큰을 가진다.

## 뜨기

```sh
npm install
npm run typecheck
npm run dev
```

## 환경 변수

**이 프로세스의 것만 환경에 있다.** 봇의 설정(시에라 주소·클라이언트·선언)은 사람이 화면에서
만드는 것이라 상태 폴더에 산다.

| 변수 | 필수 | 뜻 |
|---|---|---|
| `BOT_SECRET` | ● | 맡은 비밀을 봉하는 열쇠(16자 이상). **잃으면 모든 봇의 자격 증명과 맡긴 것을 함께 잃는다** |
| `BOT_PUBLIC_ORIGIN` | ● | 사람이 닿는 이 서비스의 주소. 코어의 `PrivateAddressGuard`가 사설 주소를 막으므로 **공개 HTTPS** |
| `BOT_GITHUB_CLIENT_ID` | ● | 가입에 쓰는 GitHub OAuth 앱 |
| `BOT_GITHUB_CLIENT_SECRET` | ● | 〃 |
| `BOT_PORT` | | 듣는 포트 (`PORT` → 8080) |
| `BOT_STATE` | | 상태 폴더 (`state`) |
| `BOT_POLL_SECONDS` | | 봇 하나의 폴링 주기 (30) |
| `BOT_MAX_PER_ACCOUNT` | | 계정당 봇 수 (3 — 코어의 `bot.max_per_user` 기본값) |
| `BOT_SERVICE_NAME` | | 화면 제목줄에 설 이름. 비우면 루트 `manifest.json`의 `name` |
| `BOT_DRY_RUN` | | `true`면 읽고 부르되 쓰지 않는다 |

**GitHub OAuth 앱의 콜백**은 `{BOT_PUBLIC_ORIGIN}/auth/github/callback`이다.

## 자기 봇 짓기

고치는 것은 `src/main.ts`와 그 아래뿐이다. 그리고 **`ABOUT.md`를 둔다** — 첫 화면(`/`)에
서는 소개다. 이 파일(`README.md`)은 저장소를 여는 사람의 것이라 화면이 지지 않는다.

```ts
class MyBrain implements BotBrain {
  async tick(ctx: BotContext): Promise<number> {
    return await eachNotification(ctx, async (notification) => {
      // 여기가 이 봇이 하는 일이다
    });
  }
}

await startService({ brain: () => new MyBrain(), codeVersion: '0.1.0' });
```

포크와 템플릿 갱신을 받는 법은 [`.claude/PROJECT.md`](./.claude/PROJECT.md)의 *포크하는 법*에 있고,
봇 일반의 설계는 [`.claude/BOT.md`](./.claude/BOT.md)에 있다.
