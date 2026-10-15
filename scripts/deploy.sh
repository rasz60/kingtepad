#!/usr/bin/env bash
# Oracle 서버에서 실행하는 배포 스크립트. GitHub Actions(.github/workflows/deploy.yml)가 SSH 로 부르고,
# 서버에서 직접 실행해도 된다:  bash ~/kingtepad/scripts/deploy.sh
#
# 순서: 최신 main 받기 → 의존성/빌드 → (바뀌었으면) Python 패키지 → pm2 재시작
# 빌드가 실패하면 pm2 를 건드리지 않고 멈춘다 (지금 돌고 있는 프로세스는 그대로).
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

# 비대화형 SSH 세션은 ~/.bashrc 를 읽지 않으므로 nvm 으로 설치한 node/pm2 를 직접 잡는다
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  set +u # nvm.sh 는 정의 안 된 변수를 참조한다
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  set -u
fi

echo "== $(date '+%F %T') 배포 시작 ($(git rev-parse --short HEAD))"

before="$(git rev-parse HEAD)"
git fetch --quiet origin main
git merge --ff-only origin/main
after="$(git rev-parse HEAD)"
echo "== 코드: ${before:0:7} -> ${after:0:7}"

changed() { [ "$before" != "$after" ] && ! git diff --quiet "$before" "$after" -- "$@"; }

npm ci --no-audit --no-fund
npm run build

if [ ! -x venv/bin/python3 ]; then
  python3 -m venv venv
  ./venv/bin/pip install -q -r jobs/requirements.txt
elif changed jobs/requirements.txt; then
  ./venv/bin/pip install -q -r jobs/requirements.txt
fi

pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
echo "== $(date '+%F %T') 배포 완료 (${after:0:7})"
