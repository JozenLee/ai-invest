#!/bin/bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-3000}"
LOG_DIR="$PROJECT_DIR/logs"
PID_FILE="$LOG_DIR/nextjs.pid"
LOG_FILE="$LOG_DIR/nextjs.log"
PM2_APP_NAME="ai-invest-web-dev"

cd "$PROJECT_DIR"
mkdir -p "$LOG_DIR"

echo "刷新 AI投资分析系统 UI"
echo "项目目录: $PROJECT_DIR"
echo "端口: $PORT"

is_project_process() {
  local pid="$1"
  local cwd
  cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1 || true)
  [ "$cwd" = "$PROJECT_DIR" ]
}

stop_port_processes() {
  local pids
  pids=$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)

  if [ -z "$pids" ]; then
    return
  fi

  for pid in $pids; do
    if is_project_process "$pid"; then
      echo "停止旧 Web 进程: $pid"
      kill "$pid" 2>/dev/null || true
    else
      echo "错误: 端口 $PORT 被非当前项目进程占用 (PID $pid)，已停止刷新以避免误杀。"
      echo "请先确认该进程后释放端口，再重新执行本脚本。"
      exit 1
    fi
  done

  for _ in {1..30}; do
    if ! lsof -tiTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
      return
    fi
    sleep 1
  done

  echo "错误: 旧 Web 进程未能在 30 秒内退出。"
  exit 1
}

stop_port_processes

if command -v pm2 >/dev/null 2>&1; then
  echo "使用 PM2 持久托管 Next.js 开发服务器"
  pm2 delete "$PM2_APP_NAME" >/dev/null 2>&1 || true
  NODE_ENV=development pm2 start npm \
    --name "$PM2_APP_NAME" \
    --cwd "$PROJECT_DIR" \
    --time \
    --log "$LOG_FILE" \
    --error "$LOG_FILE" \
    -- run dev >/dev/null
  pm2 save >/dev/null 2>&1 || true
  NEXTJS_PID=""
else
  echo "启动 Next.js 开发服务器（支持源码变更自动热刷新）"
  NODE_ENV=development npm run dev >"$LOG_FILE" 2>&1 &
  NEXTJS_PID=$!
  echo "$NEXTJS_PID" >"$PID_FILE"
fi

for _ in {1..60}; do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 || curl -fsS "http://127.0.0.1:$PORT" >/dev/null 2>&1; then
    echo "UI 已刷新并运行在 http://127.0.0.1:$PORT"
    echo "进程 PID: $NEXTJS_PID"
    echo "日志: $LOG_FILE"
    exit 0
  fi

  if [ -n "$NEXTJS_PID" ] && ! kill -0 "$NEXTJS_PID" 2>/dev/null; then
    echo "错误: Next.js 启动失败，请查看 $LOG_FILE"
    exit 1
  fi
  sleep 1
done

echo "错误: Next.js 在 60 秒内未就绪，请查看 $LOG_FILE"
exit 1
