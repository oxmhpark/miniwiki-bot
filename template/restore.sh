#!/usr/bin/env bash
#
# **이 서비스 하나를 백업 시점으로 되돌린다** — `backup.sh`의 짝.
#
#   ./restore.sh --from /srv/backup/echo/20261004T040000Z
#   ./restore.sh --from ... --yes                  # 묻지 않는다
#
# 묶음(`<볼륨>.tar.gz`)마다 **그 볼륨이 이 프로젝트의 것인지 확인하고**, 서비스를 세우고,
# 볼륨을 비우고, 풀고, 다시 띄운다. 비우지 않고 풀면 백업 뒤에 생긴 파일이 섞여 남는다.
#
# - **볼륨이 없으면 서비스를 먼저 한 번 올린다**(`docker compose … up -d`). 여기서 볼륨을 만들면
#   컴포즈의 라벨이 없어 다음 `up`이 *남이 만든 볼륨*이라며 거절한다.
# - **열쇠는 지금 `.env`의 것이다.** 백업한 때와 다르면 풀린 상태를 읽지 못한다 — 서비스가 그
#   자리에서 오류를 낸다(조용히 넘어가지 않는다).
# - **커서도 그때로 돌아간다.** 그 뒤의 일을 다시 한다 — 무엇이 다시 일어나는지는 서비스마다
#   다르다(`DEPLOY.md`).
#
# **cron에 걸 것이 아니다** — 지금 것을 지우는 일이라 묻는다. `--yes`를 적는 것이 곧 승인이다.
#
# **이 파일은 사본이다** — 정본은 `miniwiki-bot`의 `template/restore.sh`.
set -euo pipefail

readonly ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

FROM=""
ASSUME_YES=false
ENV_FILE="${ROOT}/.env"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --from) shift; FROM="${1:-}" ;;
    --env) shift; ENV_FILE="${1:-}" ;;
    --yes|-y) ASSUME_YES=true ;;
    *) printf '모르는 인자: %s\n' "$1" >&2; exit 2 ;;
  esac
  shift
done

die() { printf '%s\n' "$*" >&2; exit 1; }

[[ -n "${FROM}" ]] || die "--from <백업 디렉터리>가 필요하다."
FROM="$(cd "${FROM}" 2>/dev/null && pwd)" || die "그 디렉터리가 없다: ${FROM}"
[[ -f "${ENV_FILE}" ]] || die ".env가 없다: ${ENV_FILE}"

PROJECT="$(grep -E '^COMPOSE_PROJECT_NAME=' "${ENV_FILE}" | tail -n 1 | cut -d= -f2- | tr -d "\"' \r")"
[[ -n "${PROJECT}" ]] || die "${ENV_FILE}에 COMPOSE_PROJECT_NAME이 없다."

# 묶음에 든 프로젝트가 다르면 멈춘다 — 남의 볼륨에 풀면 그 서비스가 남의 상태로 선다.
if [[ -f "${FROM}/MANIFEST" ]]; then
  made_for="$(grep -E '^프로젝트 ' "${FROM}/MANIFEST" | awk '{print $2}' || true)"
  [[ -z "${made_for}" || "${made_for}" == "${PROJECT}" ]] \
    || die "이 백업은 ${made_for}의 것이다. 이 .env는 ${PROJECT}다."
fi

ARCHIVES=()
for archive in "${FROM}"/*.tar.gz; do
  [[ -f "${archive}" ]] || continue
  volume="$(basename "${archive}" .tar.gz)"
  owner="$(docker volume inspect -f '{{index .Labels "com.docker.compose.project"}}' "${volume}" 2>/dev/null || true)"
  [[ -n "${owner}" ]] || die "${volume}가 없다 — 서비스를 먼저 한 번 올린다(docker compose … up -d)."
  [[ "${owner}" == "${PROJECT}" ]] || die "${volume}는 ${owner}의 볼륨이다. 이 .env는 ${PROJECT}다."
  ARCHIVES+=("${archive}")
done
[[ ${#ARCHIVES[@]} -gt 0 ]] || die "묶음(*.tar.gz)이 없다: ${FROM}"

printf '되돌린다: %s → 프로젝트 %s\n' "${FROM}" "${PROJECT}"
for archive in "${ARCHIVES[@]}"; do printf '  %s\n' "$(basename "${archive}" .tar.gz)"; done
printf '지금 그 볼륨에 있는 것은 사라진다. 되돌릴 수 없다.\n'
if [[ "${ASSUME_YES}" != true ]]; then
  read -r -p "정말 되돌리는가? [y/N] " answer
  [[ "${answer}" == "y" || "${answer}" == "Y" ]] || die "그만둔다."
fi

# **내가 세운 것만 다시 띄운다** — 일부러 내려 둔 컨테이너를 되살리지 않는다. 실패해도 띄운다.
STOPPED=()
restart() {
  for container in ${STOPPED[@]+"${STOPPED[@]}"}; do
    docker start "${container}" >/dev/null 2>&1 || printf '%s를 다시 띄우지 못했다.\n' "${container}" >&2
  done
}
trap restart EXIT INT TERM

for container in $(docker ps -q --filter "label=com.docker.compose.project=${PROJECT}"); do
  docker stop "${container}" >/dev/null
  STOPPED+=("${container}")
done

for archive in "${ARCHIVES[@]}"; do
  volume="$(basename "${archive}" .tar.gz)"
  docker run --rm -v "${volume}:/state" -v "${FROM}:/in:ro" alpine:3.20 \
    sh -c "find /state -mindepth 1 -delete && tar xzf '/in/$(basename "${archive}")' -C /state" \
    || die "${volume}를 되돌리지 못했다."
  printf '  되돌렸다: %s\n' "${volume}"
done

restart
STOPPED=()
trap - EXIT INT TERM
printf '완료 — 로그를 본다: docker compose --env-file %s logs --tail 20\n' "${ENV_FILE}"
exit 0
