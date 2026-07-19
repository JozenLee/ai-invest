#!/usr/bin/env python3
"""测试环境变量是否被正确加载"""

import os
from dotenv import load_dotenv

print("=== 测试环境变量加载 ===")
print(f"当前目录: {os.getcwd()}")
print()

# 1. 测试系统环境变量
print("1. 系统环境变量:")
print(f"  ANTHROPIC_API_KEY: {'已设置' if os.getenv('ANTHROPIC_API_KEY') else '未设置'}")
print(f"  ANTHROPIC_BASE_URL: {os.getenv('ANTHROPIC_BASE_URL')}")
print(f"  CLAUDE_MODEL: {os.getenv('CLAUDE_MODEL')}")
print()

# 2. 加载 .env 文件
print("2. 加载 .env 文件:")
load_dotenv()
print(f"  ANTHROPIC_API_KEY: {'已设置' if os.getenv('ANTHROPIC_API_KEY') else '未设置'}")
print(f"  ANTHROPIC_BASE_URL: {os.getenv('ANTHROPIC_BASE_URL')}")
print(f"  CLAUDE_MODEL: {os.getenv('CLAUDE_MODEL')}")
print()

# 3. 测试延迟初始化
print("3. 测试延迟初始化:")
from routers.ai import get_anthropic_client

client = get_anthropic_client()
print(f"  客户端: {type(client).__name__ if client else 'None'}")

