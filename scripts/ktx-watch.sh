#!/usr/bin/env bash
# KTX 잔여석 감시(jobs/watch_ktx.py) 실행 스크립트. 운영 서버에서 직접 쓴다 (pm2 · 자동 배포와 무관).
#
#   bash scripts/ktx-watch.sh start [옵션]   백그라운드로 감시 시작 (옵션은 watch_ktx.py 로 넘어간다. 예: --train-no 466)
#   bash scripts/ktx-watch.sh stop           감시 멈춤
#   bash scripts/ktx-watch.sh restart [옵션] 멈춘 뒤 다시 시작 (코드를 업데이트했으면 이걸로 반영)
#   bash scripts/ktx-watch.sh status         실행 중인지 확인
#   bash scripts/ktx-watch.sh log            로그 보기 (Ctrl+C 로 나가기)
#   bash scripts/ktx-watch.sh once [옵션]    1회만 조회 (전환이면 알림도 보낸다)
#   bash scripts/ktx-watch.sh test-notify    카카오톡 발송만 테스트
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

PY="$APP_DIR/venv/bin/python3"
[ -x "$PY" ] || PY="$(command -v python3)"
SCRIPT="$APP_DIR/jobs/watch_ktx.py"
PID_FILE="$APP_DIR/jobs/watch_ktx.pid"
LOG_FILE="$APP_DIR/jobs/watch_ktx.log"
OUT_FILE="$APP_DIR/jobs/watch_ktx.out" # 파이썬 에러 출력(트레이스백 등). 일반 로그는 watch_ktx.py 가 LOG_FILE 에 직접 쓴다

running_pid() {
  [ -f "$PID_FILE" ] || return 1
  local pid
  pid="$(cat "$PID_FILE")"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null && grep -q watch_ktx.py "/proc/$pid/cmdline" 2>/dev/null; then
    echo "$pid"
    return 0
  fi
  rm -f "$PID_FILE"
  return 1
}

start() {
  if pid="$(running_pid)"; then
    echo "이미 실행 중입니다 (PID $pid)"
    return 0
  fi
  nohup "$PY" "$SCRIPT" "$@" >/dev/null 2>>"$OUT_FILE" &
  echo $! >"$PID_FILE"
  sleep 2
  if pid="$(running_pid)"; then
    echo "감시 시작 (PID $pid). 로그: bash scripts/ktx-watch.sh log"
  else
    echo "시작하자마자 끝났습니다. 아래 출력과 jobs/watch_ktx.log 를 확인하세요:"
    tail -n 20 "$OUT_FILE" 2>/dev/null || true
    return 1
  fi
}

stop() {
  if ! pid="$(running_pid)"; then
    echo "실행 중이 아닙니다"
    return 0
  fi
  kill -TERM "$pid"
  # 조회 · 카톡 발송 중이면 그 작업을 마치고 끝난다 (요청 타임아웃 합계보다 넉넉히 기다린다)
  for _ in $(seq 1 45); do
    kill -0 "$pid" 2>/dev/null || break
    sleep 1
  done
  if kill -0 "$pid" 2>/dev/null; then
    kill -KILL "$pid"
  fi
  rm -f "$PID_FILE"
  echo "감시를 멈췄습니다 (PID $pid)"
}

cmd="${1:-status}"
[ $# -gt 0 ] && shift
case "$cmd" in
  start) start "$@" ;;
  stop) stop ;;
  restart) stop && start "$@" ;;
  status)
    if pid="$(running_pid)"; then
      echo "실행 중 (PID $pid)"
      [ -f "$LOG_FILE" ] && tail -n 3 "$LOG_FILE"
    else
      echo "실행 중이 아닙니다"
    fi
    ;;
  log) touch "$LOG_FILE" && tail -n 50 -f "$LOG_FILE" ;;
  once)
    # 감시와 동시에 돌리면 같은 전환을 두 번 알릴 수 있어 막는다
    if pid="$(running_pid)"; then
      echo "감시가 실행 중입니다 (PID $pid). once 는 stop 한 뒤에 쓰세요"
      exit 1
    fi
    "$PY" "$SCRIPT" --once "$@"
    ;;
  test-notify) "$PY" "$SCRIPT" --test-notify "$@" ;;
  *)
    sed -n '2,10p' "$0"
    exit 1
    ;;
esac
