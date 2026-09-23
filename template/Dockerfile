# 봇 서비스 운영 이미지.
#
# **빌드 컨텍스트가 이 저장소다** — 봇은 **코어 밖에서
# REST로 부르는 남의 서버**이고 저장소 루트에 기대지 않아야 다른 기계에 그대로 옮겨 굽는다.
#
#     docker build -t bot:local .
#
# **라이브러리는 빌드 컨텍스트 안에 있다**(`vendor/bot` 서브모듈). 저장소가 비공개여도
# 빌드에 토큰이 들지 않는다 — 그것이 `file:` 의존을 고른 까닭이다(`.claude/BOT.md`).
#
# **듣는다**(가입·봇 등록·봇마다의 `manifest.json`) — 그래서 포트를 연다.

FROM node:24-alpine AS build
WORKDIR /src

COPY package.json package-lock.json ./
# 라이브러리가 먼저 와야 한다 — `file:` 의존이라 설치가 이 폴더를 읽는다.
COPY vendor/ ./vendor/
RUN npm ci --no-audit --no-fund

COPY tsconfig*.json ./
COPY src/ ./src/
# **`--ignore-scripts`가 있어야 한다** — `prune`은 링크된 패키지의 `prepare`를 다시 돌리는데,
# 그때는 그 패키지의 `typescript`가 이미 정리된 뒤라 `tsc: not found`로 죽는다.
RUN npm run build && npm prune --omit=dev --ignore-scripts && rm -rf vendor/*/node_modules

FROM node:24-alpine AS final
WORKDIR /app

ENV NODE_ENV=production

COPY --from=build --chown=node:node /src/dist ./dist
COPY --from=build --chown=node:node /src/node_modules ./node_modules
# `node_modules/miniwiki-bot`은 `../vendor/bot`을 가리키는 **상대 심링크**다 — 함께 옮긴다.
COPY --from=build --chown=node:node /src/vendor ./vendor
# **첫 화면이 `ABOUT.md`를 그린다** — 포크가 두는 파일이라 **템플릿에는 없다**.
#
# 그래서 글롭으로 받는다(`ABOUT.m[d]`) — 도커의 `COPY`는 없는 파일을 지목하면 그 자리에서
# 죽지만, 짝이 없는 글롭은 조용히 지나간다. **없으면 첫 화면은 제목과 단추만 선다.**
COPY --chown=node:node package.json manifest.json ABOUT.m[d] ./

# **상태가 사는 자리를 미리 만든다.** 도커는 이름 있는 볼륨을 만들 때 이미지의 그 자리에서
# 소유권을 베끼므로, 없으면 `root`의 것이 되고 우리는 `node`로 돈다(에코드와 같다).
ENV BOT_STATE=/app/state
RUN mkdir -p /app/state && chown node:node /app/state

USER node

EXPOSE 8080
CMD ["node", "dist/main.js"]
