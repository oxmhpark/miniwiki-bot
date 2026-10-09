#!/usr/bin/env bash
#
# **판을 내는 한 자리** (2026-10-10) — `npm version`을 컨테이너에서 돌린다.
#
# 이 기계에는 node가 없다. 그래서 `package.json`만 손으로 고치고 `git tag`를 치는 지름길이 생겼고,
# 그 사이 `package-lock.json`의 판 표기가 0.23.0에 멈췄다(0.23.1 ~ 0.27.2). `npm version`은 둘을 함께
# 올리고 커밋과 태그까지 한 번에 짓는다.
#
#   ./release.sh patch|minor|major
#
# 서브모듈이라 `.git`이 파일이고 진짜 저장소는 모체의 `.git/modules/bot`에 있다 — 모체를 통째로 건다.
set -euo pipefail

bump="${1:?patch · minor · major}"
here="$(cd "$(dirname "$0")" && pwd)"
root="$(git -C "$here" rev-parse --show-superproject-working-tree)"
root="${root:-$here}"
name="$(git -C "$here" config user.name)"
mail="$(git -C "$here" config user.email)"

docker run --rm -v "$root":"$root" -w "$here" -u "$(id -u):$(id -g)" \
  -e HOME=/tmp -e NO_UPDATE_NOTIFIER=1 \
  -e GIT_AUTHOR_NAME="$name" -e GIT_AUTHOR_EMAIL="$mail" \
  -e GIT_COMMITTER_NAME="$name" -e GIT_COMMITTER_EMAIL="$mail" \
  node:24 sh -c "git config --global --add safe.directory '*' && npm version '$bump' --ignore-scripts"

git -C "$here" push --follow-tags origin main
