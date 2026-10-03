# miniwiki-bot — 시에라에 붙는 봇의 라이브러리

**한 배포가 봇 여럿을 지는 봇 서비스의 바탕이다.** 실제 봇(`miniwiki-bot-{이름}`)은 이 저장소를
**포크하지 않고 의존한다**(2026-09-24 전환) — `github:oxmhpark/miniwiki-bot#v0.3.0`.
설계와 그 까닭은 [`.claude/PROJECT.md`](./.claude/PROJECT.md), 봇 일반의 것은
[`.claude/BOT.md`](./.claude/BOT.md)에 있다.

- 임자가 **GitHub으로 들어와** 봇을 만들고, 그 선언 주소를 **자기 시에라의 `봇 설치`**에 붙이고,
  거기서 받은 `client_id`·`client_secret`을 **이 서비스에 맡긴다.**
- 그러면 그 봇이 돈다. 봇마다 자기 커서·자기 시계·자기 시에라 토큰을 가진다.

## 손질하기

**이 저장소는 혼자 뜨지 않는다** — 라이브러리라 진입점이 없다. 실제로 도는 것을 보려면 봇
저장소(`miniwiki-bot-echo` · `miniwiki-bot-chatto`)에서 띄운다.

```sh
# 이 기계에는 node가 없다 — 도구는 컨테이너 안에 있다
docker run --rm -v "$PWD":/src -w /src node:24 sh -c "npm ci && npm run typecheck && npm test"
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

## 새 봇 짓기

```sh
gh repo create oxmhpark/miniwiki-bot-{이름} --private --clone
cd miniwiki-bot-{이름}
npm install miniwiki-bot@github:oxmhpark/miniwiki-bot#v0.3.0
cp -r node_modules/miniwiki-bot/template/. .   # Dockerfile · compose · Procfile · manifest.json · main.ts
```

짓는 것은 `src/main.ts`와 그 아래뿐이다. 그리고 **`ABOUT.md`를 둔다** — 첫 화면(`/`)에
서는 소개다. 이 파일(`README.md`)은 저장소를 여는 사람의 것이라 화면이 지지 않는다.

```ts
class MyBrain implements BotBrain {
  async tick(ctx: BotContext): Promise<number> {
    return await eachNotification(ctx, async (notification) => {
      // 여기가 이 봇이 하는 일이다
    });
  }
}

await startService({
  root: new URL('../', import.meta.url),   // 이 라이브러리가 봇의 ABOUT.md·manifest.json을 읽는 자리
  brain: () => new MyBrain(),
  codeVersion: '0.1.0',
});
```

### 명령을 알아듣게 하려면

사람이 봇을 부르는 길은 여럿이다 — 멘션 · 메시지 · 그냥 말. **명령은 그 가운데 모양이
정해진 한 길**이고, 선언해 두면 글을 쓰는 화면이 거들어 준다(`@아이디 /` 까지 치면 목록이
뜬다). 대응하지 않으면 그 길이 없는 것과 같다.

```ts
const COMMANDS = declare([
  { name: 'say',   summary: '옮겨 적는다', args: '<할 말>', who: 'everyone' },
  { name: 'drain', summary: '쌓인 것을 비운다',            who: 'owner' },
]);

await startService({
  root: new URL('../', import.meta.url),
  brain: () => new MyBrain(),
  codeVersion: '0.1.0',
  commands: COMMANDS,              // 선언에 실린다
});
```

들어온 글은 **같은 목록으로 읽는다** — 둘이 갈리면 화면이 제안한 명령을 봇이 모른다.

```ts
const call = readCommand(notification.post.body, COMMANDS);

if (call === undefined) {
  // 명령이 아니다 — 평범한 말이다
} else if (!call.known) {
  await ctx.sierra.reply(unknownReply(call, COMMANDS), notification.post.id);
} else if (call.name === 'say') {
  await 말하기(call.args);          // 인자는 줄 끝까지다
}
```

- **범위는 반드시 적는다**(`who`) — 기본값을 두면 *적지 않은 것*과 *그 값으로 정한 것*이
  구분되지 않는다. 코어가 빠진 선언을 **통째로 거절한다**.
- **`owner`를 가리는 것은 화면의 친절이지 문이 아니다** — 누구든 글자를 직접 칠 수 있으므로
  **거절은 봇이 한다**(`ctx.bot.accountId`와 견준다).
- **한 글에 하나**이고 **대소문자를 가리지 않는다**. 이름을 내리는 자리는 `declare` 하나다.
- **명령을 들이지 않으면 `commands`를 주지 않는다** — 선언에서 그 칸이 빠지고, 코어는
  담긴 것을 건드리지 않는다(`[]`를 주는 것이 *지운다*이다).

**판을 올리는 법**(태그를 가리킨다)과 봇 일반의 설계는
[`.claude/BOT.md`](./.claude/BOT.md)의 *봇을 짓는 법*에 있다.

## 운영으로 세우기

[`DEPLOY.md`](./DEPLOY.md) — 봇 서비스 하나를 한 기계에 세우고, 올리고, 지키는 차례. 봇마다 더하는 것은 그 봇의 `DEPLOY.md`.
