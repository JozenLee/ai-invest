#!/bin/bash
# Phase 1 安装和测试脚本

set -e

echo "================================"
echo "Phase 1 安装和测试"
echo "================================"
echo ""

# 1. 安装 Python 依赖
echo "📦 步骤 1: 安装 Python 依赖..."
cd data-service
pip3 install -r requirements.txt

echo ""
echo "✅ Python 依赖安装完成"
echo ""

# 2. 生成 Prisma Client
echo "📦 步骤 2: 生成 Prisma Client..."
cd ..
npx prisma generate

echo ""
echo "✅ Prisma Client 生成完成"
echo ""

# 3. 检查数据库
echo "📊 步骤 3: 检查数据库状态..."
npx prisma db push --skip-generate

echo ""
echo "✅ 数据库状态正常"
echo ""

# 4. 测试导入
echo "🧪 步骤 4: 测试模块导入..."
cd data-service
python3 << 'PYEOF'
import sys
print("测试 Python 模块导入...")

# 测试基础导入
try:
    from services.fetch_service import fetch_service
    print("✅ FetchService 导入成功")
except Exception as e:
    print(f"❌ FetchService 导入失败: {e}")
    sys.exit(1)

try:
    from services.content_analyzer import content_analyzer
    print("✅ ContentAnalyzer 导入成功")
except Exception as e:
    print(f"❌ ContentAnalyzer 导入失败: {e}")
    sys.exit(1)

try:
    from services.scheduler_service import scheduler_service
    print("✅ SchedulerService 导入成功")
except Exception as e:
    print(f"❌ SchedulerService 导入失败: {e}")
    sys.exit(1)

# 测试数据库导入（可选）
try:
    from db import db
    print("✅ Prisma Client 导入成功")
except Exception as e:
    print(f"⚠️  Prisma Client 导入失败（需要先安装）: {e}")

print("\n所有核心模块导入测试通过！")
PYEOF

echo ""
echo "✅ 模块导入测试通过"
echo ""

# 5. 显示下一步
echo "================================"
echo "✅ Phase 1 安装完成！"
echo "================================"
echo ""
echo "📋 下一步操作："
echo ""
echo "1. 配置环境变量（可选）："
echo "   cp data-service/.env.example data-service/.env"
echo "   # 编辑 .env 文件设置 ANTHROPIC_API_KEY"
echo ""
echo "2. 启动数据服务："
echo "   cd data-service && python3 main.py"
echo ""
echo "3. 启动前端（另一个终端）："
echo "   npm run dev"
echo ""
echo "4. 验证采集任务："
echo "   curl http://localhost:8000/api/scheduler/status"
echo ""
echo "5. 查看数据库："
echo "   npm run db:studio"
echo ""
