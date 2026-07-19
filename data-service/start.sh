#!/bin/bash
# AI 投资分析系统 - Python 数据服务启动脚本

# 设置环境变量
export ANTHROPIC_API_KEY="sk-d65f4c3e3c4849fb168f0450491e7f070f1eafb7f6ee64abb874db661fe4cf2f"
export ANTHROPIC_BASE_URL="https://apiclaude.cc"
export ANTHROPIC_AUTH_TOKEN="sk-d65f4c3e3c4849fb168f0450491e7f070f1eafb7f6ee64abb874db661fe4cf2f"
export CLAUDE_MODEL="claude-opus-4-8"
export DATABASE_URL="file:../prisma/dev.db"
export LOG_LEVEL="info"
export NODE_ENV="production"
export TZ="Asia/Shanghai"

# 启动服务
cd "$(dirname "$0")"
python3 main.py
