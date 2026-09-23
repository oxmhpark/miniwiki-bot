# Bot 개발지침서 — 이 저장소는 템플릿이다

> **이 저장소의 지침이다**(2026-09-23 착수).
>
> - **봇 일반의 설계는 [`BOT.md`](./BOT.md)에 있다** — 테넌트·계정·선언·상태·갈리는 것·
>   코어와 붙는 법. **포크한 봇도 그 파일을 그대로 받는다.**
> - 통합 지침·마일스톤: 모체 [`miniwiki`](https://github.com/oxmhpark/miniwiki)의 `.claude/`
> - 설치·이용: [`../README.md`](../README.md)

## 이 파일과 `BOT.md`가 갈린 까닭

**포크가 merge할 때마다 부딪히지 않게 하려는 것이다.**

처음에는 봇 일반의 설계를 이 파일에 두었다. 그랬더니 포크한 봇이 자기 `PROJECT.md`를 쓰는
순간 **`git merge upstream/main`이 늘 충돌한다** — 같은 파일을 양쪽이 자기 것으로 삼기
때문이다(2026-09-23에 에코가 첫 merge에서 바로 걸렸다).

| 파일 | 누구의 것 | 포크에서 |
|---|---|---|
| `.claude/BOT.md` | **템플릿** | 그대로 받는다. **고치지 않는다** — 고칠 것이 있으면 템플릿에서 고쳐 내려보낸다 |
| `.claude/PROJECT.md` | **그 저장소** | 자기 것으로 갈아엎는다. 봇 일반의 것을 여기 옮겨 적지 않고 `BOT.md`를 가리킨다 |

## 이 저장소가 하는 일

**포크되는 것.** 여기서 짓는 것은 *어느 봇에도 속하지 않는 것*이고, 실제 봇은 이것을 떠서
`miniwiki-bot-{이름}`이 된다.

`src/main.ts`는 **아무것도 하지 않는 봇**이다(`EmptyBrain` — 알림을 읽고 로그만 남긴다).
템플릿이 그대로 서 있어도 계정·봇 등록·선언·폴링은 다 돈다는 것을 보이는 자리이고, 포크는
이 파일부터 고친다.

## 포크하는 법

깃허브는 **자기 계정의 저장소를 같은 계정으로 fork 하지 못한다.** 그래서 clone으로 뜨고
`upstream`을 건다.

```sh
git clone https://github.com/oxmhpark/miniwiki-bot.git miniwiki-bot-{이름}
cd miniwiki-bot-{이름}
git remote rename origin upstream
git remote add origin https://github.com/oxmhpark/miniwiki-bot-{이름}.git
git remote set-url --push upstream no-push-to-template
git push -u origin main
```

**`upstream`의 푸시 주소를 막는 것**은 포크에서 낸 커밋이 템플릿으로 가지 않게 하려는 것이다.
**remote는 로컬 설정이라** 다른 기계에서 받으면 위 두 줄을 다시 해야 한다.

**템플릿이 나아지면 받아 온다:**

```sh
git fetch upstream && git merge upstream/main
```

포크가 `PROJECT.md`와 `src/main.ts`와 그 아래만 고치면 이 병합은 깨끗하다.
