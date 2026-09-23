# 봇 서비스 운영 이미지.
#
# **빌드 컨텍스트가 이 저장소다** — 봇은 **코어 밖에서
# REST로 부르는 남의 서버**이고 저장소 루트에 기대지 않아야 다른 기계에 그대로 옮겨 굽는다.
#
#     docker build -t bot:local .
#
# **런타임 의존이 없다** — 노드 표준 라이브러리와 `fetch`뿐이라 최종 이미지에 `node_modules`가
# 실리지 않는다. 포크한 봇이 SDK를 들이면 그때 이 주석과 아래 단계가 함께 바뀐다.
#
# **듣는다**(가입·봇 등록·봇마다의 `manifest.json`) — 그래서 포트를 연다.

FROM node:24-alpine AS build
WORKDIR /src

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig*.json ./
COPY src/ ./src/
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine AS final
WORKDIR /app

ENV NODE_ENV=production

COPY --from=build --chown=node:node /src/dist ./dist
COPY --from=build --chown=node:node /src/node_modules ./node_modules
# **첫 화면이 `README.md`를 그린다** — 소개를 화면용으로 다시 쓰면 두 벌이 갈린다.
COPY --chown=node:node package.json manifest.json README.md ./

# **상태가 사는 자리를 미리 만든다.** 도커는 이름 있는 볼륨을 만들 때 이미지의 그 자리에서
# 소유권을 베끼므로, 없으면 `root`의 것이 되고 우리는 `node`로 돈다(에코드와 같다).
ENV BOT_STATE=/app/state
RUN mkdir -p /app/state && chown node:node /app/state

USER node

EXPOSE 8080
CMD ["node", "dist/main.js"]
