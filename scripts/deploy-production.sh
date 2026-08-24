#!/bin/bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

echo "== AI投资分析系统生产部署 =="
echo "项目目录: $PROJECT_DIR"

if ! command -v npm >/dev/null 2>&1; then
  echo "错误: 未找到 npm"
  exit 1
fi

echo "== 类型检查 =="
npm run typecheck

echo "== 生产构建 =="
npm run build:production

if command -v pm2 >/dev/null 2>&1; then
  echo "== 使用 PM2 重载生产服务 =="
  pm2 startOrReload ecosystem.config.js --update-env
  echo "== 生产服务状态 =="
  pm2 status ai-invest-web ai-invest-data
else
  echo "未找到 PM2。请使用以下命令启动生产 Web 服务:"
  echo "  npm run start:production"
fi

echo "部署完成。验证命令: npm run verify:production"
