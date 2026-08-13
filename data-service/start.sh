#!/usr/bin/env bash
# AI 投资分析系统 - Python 数据服务启动脚本

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

export DATABASE_URL="${DATABASE_URL:-file:../prisma/dev.db}"
export LOG_LEVEL="${LOG_LEVEL:-info}"
export NODE_ENV="${NODE_ENV:-development}"
export TZ="${TZ:-Asia/Shanghai}"

exec python3 main.py
