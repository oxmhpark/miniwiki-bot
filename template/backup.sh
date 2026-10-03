#!/usr/bin/env bash
#
# **이 서비스 하나의 백업** — 컴포즈 프로젝트의 볼륨을 전부 뜬다.
#
#   ./backup.sh --out /srv/backup/echo              # 한 벌
#   ./backup.sh --out ... --keep 14                 # 최근 14벌만 남긴다 (기본 7)
#   ./backup.sh --out ... --quiet                   # 실패했을 때만 말한다 (cron용)
#
# **볼륨 이름을 외우지 않는다.** 컴포즈는 자기가 만든 볼륨에 프로젝트 이름을 라벨로 단다
# (`com.docker.compose.project`). 그래서 이 스크립트는 `.env`의 `COMPOSE_PROJECT_NAME` 하나만
# 읽고 그 라벨의 볼륨을 찾는다 — 인스턴스(`echo` · `echo-test` · `dopple` …)가 늘어도 고칠 것이
# 없다(2026-10-04 요구 — *매번 인스턴스가 추가될 때마다 백업 스크립트를 고칠 순 없다*).
#
# **cron에 그대로 걸 수 있어야 한다** — 묻지 않고, 실패하면 0이 아닌 코드로 끝나고, 겹쳐 돌지
# 않고, 임시 디렉터리에 쓴 뒤 이름을 바꾼다(쓰다 만 것이 백업으로 보이지 않게).
#
# **봉인 열쇠는 담지 않는다.** `.env`의 열쇠 없이는 이 묶음을 열 수 없다 — 볼륨과 열쇠를
# **다른 곳에** 두는 것이 봉인의 뜻이다(`DEPLOY.md`의 *봉인 열쇠*).
#
# **이 파일은 사본이다** — 정본은 `miniwiki-bot`의 `template/backup.sh`이고, 봇들과 도플이
# 같은 것을 지닌다. 모체의 `check-copies.sh`가 어긋남을 잡는다.
#
# macOS의 bash 3.2에서도 돈다 — 연관 배열·`mapfile`을 쓰지 않는다.
set -euo pipefail

readonly ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

OUT=""
KEEP=7
QUIET=false
ENV_FILE="${ROOT}/.env"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --out) shift; OUT="${1:-}" ;;
    --keep) shift; KEEP="${1:-}" ;;
    --env) shift; ENV_FILE="${1:-}" ;;
    --quiet|-q) QUIET=true ;;
    *) printf '모르는 인자: %s\n' "$1" >&2; exit 2 ;;
  esac
  shift
done

die() { printf '%s\n' "$*" >&2; exit 1; }
say() { [[ "${QUIET}" == true ]] || printf '%s\n' "$*"; }

[[ -n "${OUT}" ]] || die "--out <경로>가 필요하다."
[[ "${KEEP}" =~ ^[0-9]+$ ]] && [[ "${KEEP}" -ge 1 ]] || die "--keep는 1 이상의 정수다."
[[ -f "${ENV_FILE}" ]] || die ".env가 없다: ${ENV_FILE}"

PROJECT="$(grep -E '^COMPOSE_PROJECT_NAME=' "${ENV_FILE}" | tail -n 1 | cut -d= -f2- | tr -d "\"' \r")"
[[ -n "${PROJECT}" ]] || die "${ENV_FILE}에 COMPOSE_PROJECT_NAME이 없다 — 볼륨을 찾을 열쇠다."

VOLUMES="$(docker volume ls -q --filter "label=com.docker.compose.project=${PROJECT}")"
[[ -n "${VOLUMES}" ]] || die "프로젝트 ${PROJECT}의 볼륨이 없다 — 서비스를 한 번이라도 올렸는가?"

# ── 락 ── `flock`은 macOS에 없다. `mkdir`은 어디서나 원자적이다.
mkdir -p "${OUT}"
readonly LOCK="${OUT}/.lock"
if ! mkdir "${LOCK}" 2>/dev/null; then
  stale="$(cat "${LOCK}/pid" 2>/dev/null || true)"
  if [[ -n "${stale}" ]] && kill -0 "${stale}" 2>/dev/null; then
    die "앞 회차가 아직 돈다 (pid ${stale})."
  fi
  rm -rf "${LOCK}"
  mkdir "${LOCK}" || die "락을 잡지 못했다: ${LOCK}"
fi
printf '%s' "$$" > "${LOCK}/pid"

STAGING=""
cleanup() {
  local code=$?
  [[ -n "${STAGING}" && -d "${STAGING}" ]] && rm -rf "${STAGING}"
  rm -rf "${LOCK}"
  exit "${code}"
}
trap cleanup EXIT INT TERM

# 시각은 UTC — 서머타임이 이름을 겹치게 하지 않도록.
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
STAGING="${OUT}/.staging-${STAMP}-$$"
FINAL="${OUT}/${STAMP}"
[[ -e "${FINAL}" ]] && die "이미 있다: ${FINAL}"
mkdir -p "${STAGING}"

say "백업 ${STAMP} — 프로젝트 ${PROJECT}"

# **root로 읽고 묶음만 내 것으로 돌린다.** 서비스는 `node`(1000)로 돌며 비밀을 `600`으로 쓴다 —
# 호스트 사용자로 읽으면 번호가 다른 기계(맥은 501)에서 열지 못한다. 멈추지 않고 뜬다: 상태
# 파일은 옮겨 놓기로 쓰므로 반쯤 쓴 파일이 담기지 않는다.
for volume in ${VOLUMES}; do
  docker run --rm -v "${volume}:/state:ro" -v "${STAGING}:/out" alpine:3.20 \
    sh -c "tar czf '/out/${volume}.tar.gz' -C /state . && chown $(id -u):$(id -g) '/out/${volume}.tar.gz'" \
    || die "${volume}를 뜨지 못했다."
  say "  $(du -h "${STAGING}/${volume}.tar.gz" | cut -f1)  ${volume}.tar.gz"
done

# **백업은 되돌릴 수 있어야 백업이다** — 이 디렉터리만 보고 되돌릴 수 있게 적어 둔다.
{
  printf '서비스 백업\n'
  printf '시각(UTC)    %s\n' "${STAMP}"
  printf '프로젝트     %s\n' "${PROJECT}"
  printf '\n들어 있는 것\n'
  for volume in ${VOLUMES}; do printf '  %s.tar.gz\n' "${volume}"; done
  printf '\n그때의 이미지\n'
  for container in $(docker ps -a -q --filter "label=com.docker.compose.project=${PROJECT}"); do
    docker inspect "${container}" \
      --format '  {{.Name}}  {{.Config.Image}}  {{index .Config.Labels "org.opencontainers.image.revision"}}'
  done
  printf '\n되돌리는 법\n'
  printf '  %s/restore.sh --from %s\n' "${ROOT}" "${FINAL}"
  printf '\n**.env는 여기 없다** — 봉인 열쇠가 들어 있다. 같은 열쇠가 있어야 이 묶음이 열린다.\n'
} > "${STAGING}/MANIFEST"

mv "${STAGING}" "${FINAL}"
STAGING=""
say "완료: ${FINAL}"

# **이번 회차가 끝난 뒤에 지운다** — 먼저 지우면 이번이 실패했을 때 가진 것이 하나 준다.
pruned=0
while IFS= read -r old; do
  [[ -z "${old}" ]] && continue
  rm -rf "${old}"
  pruned=$((pruned + 1))
done < <(find "${OUT}" -mindepth 1 -maxdepth 1 -type d -name '[0-9]*Z' | sort -r | tail -n "+$((KEEP + 1))")
[[ "${pruned}" -gt 0 ]] && say "오래된 백업 ${pruned}벌을 지웠다 (최근 ${KEEP}벌 보존)."

exit 0
