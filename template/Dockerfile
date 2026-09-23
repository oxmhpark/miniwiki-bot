# 봇 서비스 운영 이미지.
#
# **빌드 컨텍스트가 이 저장소다** — 봇은 **코어 밖에서
# REST로 부르는 남의 서버**이고 저장소 루트에 기대지 않아야 다른 기계에 그대로 옮겨 굽는다.
#
#     docker build -t bot:local .
#
# **라이브러리는 보통 의존이다**(`miniwiki-bot`). 공개 저장소라 `npm ci`가 그냥 받아 온다 —
# 토큰도, 빌드 컨텍스트에 끌어다 둘 것도 없다(`.claude/BOT.md`의 *봇을 짓는 법*).
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
