#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="$PROJECT_DIR/.runtime"
LOG_DIR="$PROJECT_DIR/logs"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
DATA_SERVICE_PORT="${DATA_SERVICE_PORT:-8000}"

mkdir -p "$RUNTIME_DIR" "$LOG_DIR"
cd "$PROJECT_DIR"

if [ -f "$PROJECT_DIR/.env" ]; then
  set -a
  source "$PROJECT_DIR/.env"
  set +a
fi

port_pids() {
  lsof -tiTCP:"$1" -sTCP:LISTEN 2>/dev/null || true
}

process_cwd() {
  lsof -a -p "$1" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1
}

is_owned() {
  local pid="$1" service="$2" cwd
  cwd="$(process_cwd "$pid")"
  if [ "$service" = "frontend" ]; then
    [ "$cwd" = "$PROJECT_DIR" ]
  else
    [ "$cwd" = "$PROJECT_DIR/data-service" ]
  fi
}

ensure_port_available() {
  local port="$1" service="$2" pid
  for pid in $(port_pids "$port"); do
    if ! is_owned "$pid" "$service"; then
      echo "端口 $port 已被非本项目进程占用 (PID $pid)" >&2
      exit 1
    fi
  done
}

stop_service() {
  local service="$1" port="$2" pid
  for pid in $(port_pids "$port"); do
    if ! is_owned "$pid" "$service"; then
      echo "跳过非本项目进程 PID $pid (端口 $port)" >&2
      continue
    fi
    kill "$pid" 2>/dev/null || true
  done
  for _ in {1..20}; do
    [ -z "$(port_pids "$port")" ] && return 0
    sleep 1
  done
  for pid in $(port_pids "$port"); do
    is_owned "$pid" "$service" && kill -KILL "$pid" 2>/dev/null || true
  done
}

start_frontend() {
  ensure_port_available "$FRONTEND_PORT" frontend
  if [ -n "$(port_pids "$FRONTEND_PORT")" ]; then echo "前端已运行: http://localhost:$FRONTEND_PORT"; return; fi
  nohup env NODE_ENV=development npm run dev </dev/null >"$LOG_DIR/frontend.log" 2>&1 &
  local launcher_pid=$!
  disown "$launcher_pid" 2>/dev/null || true
  echo "$launcher_pid" >"$RUNTIME_DIR/frontend.pid"
  for _ in {1..60}; do
    curl -fsS "http://localhost:$FRONTEND_PORT/" >/dev/null 2>&1 && echo "前端已启动: http://localhost:$FRONTEND_PORT" && return
    sleep 1
  done
  echo "前端启动超时，日志: $LOG_DIR/frontend.log" >&2
  return 1
}

start_data_service() {
  ensure_port_available "$DATA_SERVICE_PORT" data
  if [ -n "$(port_pids "$DATA_SERVICE_PORT")" ]; then echo "数据服务已运行: http://localhost:$DATA_SERVICE_PORT"; return; fi
  (cd "$PROJECT_DIR/data-service" && nohup python3 main.py </dev/null >"$LOG_DIR/data-service.log" 2>&1 &
    local launcher_pid=$!
    disown "$launcher_pid" 2>/dev/null || true
    echo "$launcher_pid" >"$RUNTIME_DIR/data-service.pid")
  for _ in {1..60}; do
    curl -fsS "http://localhost:$DATA_SERVICE_PORT/health" >/dev/null 2>&1 && echo "数据服务已启动: http://localhost:$DATA_SERVICE_PORT" && return
    sleep 1
  done
  echo "数据服务启动超时，日志: $LOG_DIR/data-service.log" >&2
  return 1
}

status_service() {
  local service="$1" port="$2" pid
  pid="$(port_pids "$port" | head -n 1)"
  if [ -n "$pid" ] && is_owned "$pid" "$service"; then
    echo "$service: running (PID $pid, port $port)"
  else
    echo "$service: stopped (port $port)"
  fi
}

action="${1:-status}"
target="${2:-all}"
case "$action:$target" in
  start:frontend) start_frontend ;;
  start:data|start:data-service) start_data_service ;;
  start:all) start_data_service; start_frontend ;;
  stop:frontend) stop_service frontend "$FRONTEND_PORT" ;;
  stop:data|stop:data-service) stop_service data "$DATA_SERVICE_PORT" ;;
  stop:all) stop_service frontend "$FRONTEND_PORT"; stop_service data "$DATA_SERVICE_PORT" ;;
  restart:frontend) stop_service frontend "$FRONTEND_PORT"; start_frontend ;;
  restart:data|restart:data-service) stop_service data "$DATA_SERVICE_PORT"; start_data_service ;;
  restart:all) stop_service frontend "$FRONTEND_PORT"; stop_service data "$DATA_SERVICE_PORT"; start_data_service; start_frontend ;;
  status:frontend) status_service frontend "$FRONTEND_PORT" ;;
  status:data|status:data-service) status_service data "$DATA_SERVICE_PORT" ;;
  status:all) status_service frontend "$FRONTEND_PORT"; status_service data "$DATA_SERVICE_PORT" ;;
  *) echo "用法: $0 {start|stop|restart|status} {frontend|data|all}" >&2; exit 2 ;;
esac
