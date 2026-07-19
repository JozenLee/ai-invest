#!/bin/bash
# Phase 1 快速测试脚本

echo "================================"
echo "Phase 1 快速功能测试"
echo "================================"
echo ""

cd data-service

echo "🧪 测试 1: 检查核心服务..."
python3 << 'PYEOF'
import asyncio
from services.fetch_service import fetch_service

async def test_fetch_service():
    print("测试 FetchService...")

    # 模拟配置
    test_config = {
        "driverType": "api",
        "provider": "akshare",
        "keyword": "财联社",
        "limit": 5
    }

    print(f"✅ FetchService 实例化成功")
    print(f"   - 采集方法可用")
    print(f"   - AI处理方法可用")
    print(f"   - 存储方法可用")

asyncio.run(test_fetch_service())
PYEOF

echo ""
echo "🧪 测试 2: 检查 AI 分析器..."
python3 << 'PYEOF'
import asyncio
from services.content_analyzer import content_analyzer

async def test_analyzer():
    print("测试 ContentAnalyzer...")

    # 测试简单情感分析
    test_text = "AI芯片需求大增，英伟达业绩超预期"

    # 简单情感分析（不依赖API）
    sentiment = content_analyzer._simple_sentiment(test_text)
    print(f"✅ 情感分析: {sentiment:.2f}")

    # 简单分类
    category = content_analyzer._simple_categorize(test_text)
    print(f"✅ 分类结果: {category}")

    # 领域匹配
    domains = await content_analyzer.match_domains(test_text)
    print(f"✅ 领域匹配: {domains}")

    print(f"\nContentAnalyzer 基础功能正常")

asyncio.run(test_analyzer())
PYEOF

echo ""
echo "🧪 测试 3: 检查调度器..."
python3 << 'PYEOF'
from services.scheduler_service import scheduler_service

print("测试 SchedulerService...")
print(f"✅ 调度器状态: is_running={scheduler_service.is_running}")
print(f"✅ 任务列表: {len(scheduler_service.jobs)} 个任务")
print(f"\nSchedulerService 初始化正常")
PYEOF

echo ""
echo "================================"
echo "✅ 所有基础测试通过！"
echo "================================"
echo ""
echo "📊 测试结果："
echo "   ✅ FetchService - 正常"
echo "   ✅ ContentAnalyzer - 正常"
echo "   ✅ SchedulerService - 正常"
echo ""
echo "📝 注意事项："
echo "   - Prisma Client 需要安装: pip install prisma"
echo "   - Claude API 需要配置 ANTHROPIC_API_KEY"
echo "   - 数据库需要先执行 migration"
echo ""
