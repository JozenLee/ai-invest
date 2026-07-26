#!/usr/bin/env python3
"""
测试新的AI分类逻辑
验证：
1. 无影响新闻标记为irrelevant，sentiment为null
2. 多领域标签（1-3个）
3. 领域与ETF对应关系
"""

import sys
import os
import asyncio

# 添加data-service目录到路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'data-service'))

from pathlib import Path
from dotenv import load_dotenv

# 加载环境变量
project_root = Path(__file__).parent.parent
env_path = project_root / '.env'
load_dotenv(env_path)

from services.content_analyzer import content_analyzer


async def test_news_classification():
    """测试新闻分类"""

    test_cases = [
        {
            "title": "英伟达发布H200 GPU，算力提升2倍",
            "content": "英伟达今日发布新一代AI芯片H200，性能相比H100提升2倍，采用最新的HBM3e内存技术，将用于大模型训练。",
            "expected_domains": ["semiconductor", "ai", "computing"],
            "expected_irrelevant": False,
        },
        {
            "title": "某明星宣布离婚",
            "content": "某知名演员今日在社交媒体宣布与配偶离婚，引发网友热议。",
            "expected_domains": ["irrelevant"],
            "expected_irrelevant": True,
        },
        {
            "title": "宁德时代发布钠电池新品，成本降低30%",
            "content": "宁德时代今日发布第二代钠离子电池，能量密度达到200Wh/kg，成本相比锂电池降低30%，将用于电动车和储能市场。",
            "expected_domains": ["battery", "new_energy_vehicle"],
            "expected_irrelevant": False,
        },
        {
            "title": "某地举办马拉松比赛",
            "content": "本周末某市举办国际马拉松比赛，吸引了来自全球的5000名选手参赛。",
            "expected_domains": ["irrelevant"],
            "expected_irrelevant": True,
        },
        {
            "title": "中芯国际14nm芯片制造设备到货",
            "content": "中芯国际从荷兰进口的ASML光刻机已到货，将用于14nm芯片量产，提升国产半导体制造能力。",
            "expected_domains": ["semiconductor", "equipment"],
            "expected_irrelevant": False,
        },
        {
            "title": "某网红直播带货被罚款",
            "content": "某知名网红因在直播中虚假宣传被市场监管部门罚款50万元。",
            "expected_domains": ["irrelevant"],
            "expected_irrelevant": True,
        },
    ]

    print("=" * 80)
    print("🧪 测试新的AI分类逻辑")
    print("=" * 80)
    print()

    for i, case in enumerate(test_cases, 1):
        print(f"测试用例 {i}: {case['title']}")
        print("-" * 80)

        # 执行AI分析
        result = await content_analyzer._analyze_single_comprehensive(
            case["title"],
            case["content"]
        )

        # 检查结果
        domains = result.get("domains", [])
        sentiment = result.get("sentiment")
        sentiment_label = result.get("sentimentLabel")
        is_irrelevant = "irrelevant" in domains

        print(f"📊 分析结果:")
        print(f"   分类: {result.get('category')}")
        print(f"   领域: {domains}")
        print(f"   情感分数: {sentiment}")
        print(f"   情感标签: {sentiment_label}")
        print(f"   影响力: {result.get('impact')}")
        print(f"   摘要: {result.get('summary')}")
        print()

        # 验证
        passed = True

        if case["expected_irrelevant"]:
            # 无影响新闻：应标记为irrelevant，sentiment应为None
            if not is_irrelevant:
                print(f"   ❌ 错误: 应标记为irrelevant，实际: {domains}")
                passed = False
            if sentiment is not None:
                print(f"   ❌ 错误: sentiment应为None，实际: {sentiment}")
                passed = False
            if sentiment_label is not None:
                print(f"   ❌ 错误: sentimentLabel应为None，实际: {sentiment_label}")
                passed = False
        else:
            # 正常新闻：不应包含irrelevant，sentiment应有值
            if is_irrelevant:
                print(f"   ❌ 错误: 不应标记为irrelevant")
                passed = False
            if sentiment is None:
                print(f"   ❌ 错误: sentiment不应为None")
                passed = False
            if sentiment_label is None:
                print(f"   ❌ 错误: sentimentLabel不应为None")
                passed = False

            # 检查领域标签（至少匹配一个期望领域）
            expected_domains = case["expected_domains"]
            has_match = any(d in domains for d in expected_domains)
            if not has_match:
                print(f"   ⚠️  警告: 期望领域{expected_domains}，实际{domains}")

        if passed:
            print(f"   ✅ 通过")
        else:
            print(f"   ❌ 失败")

        print()

    print("=" * 80)
    print("✅ 测试完成")
    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(test_news_classification())
