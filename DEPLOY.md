# 봇 서비스를 운영으로 세우기

이 라이브러리로 지은 봇(포크가 아니라 **의존**한 저장소) 하나를 **한 기계에 하나의 서비스로**
세우는 차례다. 봇마다 더 보는 것은 그 봇 저장소의 `DEPLOY.md`가 적는다 — 여기는 모든 봇에
같은 것만 둔다.

> **봇 서비스는 코어 밖의 프로그램이다.** 시에라와 한 컴포즈에 실리지 않고, 시에라와는
> HTTP로만 만난다. 그래서 봇 저장소 하나와 도커만 있으면 어느 기계에서든 선다.

## 필요한 것

| 무엇 | 왜 |
|---|---|
| 도커와 컴포즈 v2 | 이미지는 그 기계에서 굽는다 — 레지스트리를 거치지 않는다. `node:24-alpine`은 amd64·arm64 둘 다 있다 |
| 깃허브에 닿는 망 | 굽는 동안 `npm ci`가 이 라이브러리를 **git 태그로** 받는다(공개 저장소라 인증은 필요 없다) |
| **공개 HTTPS 주소 하나** | 사람이 가입·봇 등록을 하는 화면이고, **시에라가 봇의 `manifest.json`을 이 주소로 가져간다** — 코어의 `PrivateAddressGuard`가 사설 주소를 막으므로 공개 HTTPS가 아니면 설치가 안 된다 |
| 깃허브 OAuth 앱 하나 | 이 서비스의 가입 수단. **OAuth App이어야 한다**(Client ID가 `Ov23li…`) — GitHub App(`Iv23li…`)이 아니다. 콜백은 `{BOT_PUBLIC_ORIGIN}/auth/github/callback`. **웹 화면으로만 만든다** |

## 세우는 차례

```sh
git clone https://github.com/<계정>/<봇 저장소>.git
cd <봇 저장소>
cp .env.example .env && chmod 600 .env     # 아래 표대로 채운다
docker build --build-arg GIT_REVISION="$(git describe --always --dirty --abbrev=7)" -t <봇>:local .
docker compose --env-file .env up -d --no-build
```

같은 기계에 시에라가 있고 봇이 컨테이너 이름으로 코어를 부르게 하려면 링크 망을 덧씌운다:

```sh
docker compose -f docker-compose.yml -f docker-compose.link.yml --env-file .env up -d --no-build
```

그러면 임자가 봇을 만들 때 시에라 주소를 `http://<시에라 컨테이너>:8080`으로 적을 수 있다 —
봇의 왕복이 공개면을 돌아 나가지 않는다. **선언 주소는 그래도 공개 HTTPS다**(시에라가 가져가므로).

### `.env`

| 변수 | 필수 | 뜻 |
|---|---|---|
| `COMPOSE_PROJECT_NAME` | ● | **볼륨 이름이 여기서 나온다**(`<이름>_bot-state`). 폴더 이름으로 서게 두면 다른 자리에서 올렸을 때 **빈 상태로 새로 선다** |
| `BOT_NAME` · `BOT_IMAGE` | | 컨테이너 이름 · 이미지 태그 |
| `BOT_BIND` | | 듣는 자리 `호스트:포트` (기본 `127.0.0.1:8080`). 앞단이 다른 기계면 그 기계가 닿는 주소로 |
| `BOT_PUBLIC_ORIGIN` | ● | 위의 공개 HTTPS 주소 |
| `BOT_CORE_NETWORK` | | 링크 망 이름(`docker-compose.link.yml`을 쓸 때) |
| `BOT_SECRET` | ● | 봉인 열쇠 — 아래 *봉인 열쇠*. 기계를 옮길 때 이것과 볼륨을 함께 옮긴다 |
| `BOT_GITHUB_CLIENT_ID` · `BOT_GITHUB_CLIENT_SECRET` | ● | 위의 OAuth 앱 |
| `BOT_POLL_SECONDS` · `BOT_MAX_PER_ACCOUNT` · `BOT_DRY_RUN` | | 기본 30 · 3 · `false` |

## 봉인 열쇠 (`BOT_SECRET`)

**상태 볼륨에 남는 비밀을 암호문으로만 쓰게 하는 열쇠다.** 기동 때 이 값에서 scrypt로 열쇠를 한 번
뽑고, 비밀마다 AES-256-GCM으로 봉한다. 봉하는 것은 **임자가 붙인 시에라 봇 비밀**(`client_secret`)과
**말 거는 사람이 맡긴 것**(채토의 LLM 키 같은). 로그인 세션은 메모리에만 있어 이것과 관계없다.

- **발급** — 인스턴스마다 새로: `openssl rand -base64 48`을 `.env`에 넣고 `chmod 600 .env`.
  16자보다 짧으면 기동하지 않는다. **다른 인스턴스(테스트)의 값을 쓰지 않는다** — 한쪽의 백업을
  다른 쪽이 열 수 있게 된다.
- **보관** — 볼륨 백업과 **다른 곳**에(비밀번호 관리자 같은). 막아 주는 것은 *볼륨이나 그 백업만
  샌* 경우이고, 둘이 함께 있으면 함께 샌다. 기계가 뚫리는 것은 막지 못한다.
- **바꾸지 않는다** — 옛 열쇠로 열어 새 열쇠로 다시 봉하는 도구가 없다. 바꾸는 것은 잃는 것과 같다.
- **잃으면** — 봉한 것을 전부 못 연다(조용히 넘어가지 않고 그 자리에서 오류다). 임자는 시에라에서
  봇 비밀을 다시 받아 붙이고, 사람은 맡긴 것을 다시 맡긴다.

## 확인

```sh
curl -fsS https://<공개 주소>/healthz                     # ok
docker inspect <봇> --format '{{index .Config.Labels "org.opencontainers.image.revision"}}'
docker logs --tail 50 <봇>
```

라벨이 `unknown`이면 `GIT_REVISION` 없이 구운 것이고, `-dirty`면 커밋하지 않은 채로 구운 것이다.

그다음은 사람의 차례다 — 임자가 가입해 봇을 만들고, 선언 주소를 **자기 시에라의 봇 설치**에
붙이고, 나온 `client_id`·`client_secret`을 봇 화면에 맡긴다(`BOT.md`의 *봇이 서는 차례*).

## 올리기

```sh
git pull
docker build --build-arg GIT_REVISION="$(git describe --always --dirty --abbrev=7)" -t <봇>:local .
docker compose --env-file .env up -d --no-build --force-recreate
```

**`--force-recreate`를 빼지 않는다** — 빼면 컴포즈가 이미지가 바뀐 것을 알아보지 못하고 옛
이미지로 그대로 서는 일이 있었다. 올린 뒤 위의 라벨로 확인한다.

## 지키는 것

**상태는 볼륨 하나다**(`/app/state`) — 계정·봇·봉한 자격 증명·커서·사람이 맡긴 것. 백업은 볼륨과
`.env`(열쇠) **둘을 함께** 둔다. 하나만 있으면 읽을 수 없다.

```sh
docker run --rm -v <이름>_bot-state:/s -v "$PWD":/b alpine tar czf /b/bot-state.tgz -C /s .
```

**볼륨을 지우면**(`down -v` · `volume rm`) 모든 봇과 맡긴 것이 사라진다 — 임자가 봇을 처음부터
다시 잇고 사람마다 다시 맡긴다. 지우기 전에 열어 본다.
