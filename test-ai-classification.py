#!/usr/bin/env python3
"""
测试 AI 新闻分类功能
"""
import os
import sys
import asyncio
from dotenv import load_dotenv

# 加载 .env
load_dotenv('.env')

# 添加 data-service 到路径
sys.path.insert(0, 'data-service')

from services.content_analyzer import content_analyzer


async def test_classification():
    """测试新闻分类功能"""

    print("=" * 60)
    print("AI 新闻分类功能测试")
    print("=" * 60)

    # 检查环境变量
    api_key = os.getenv('ANTHROPIC_API_KEY')
    base_url = os.getenv('ANTHROPIC_BASE_URL')
    model = os.getenv('CLAUDE_MODEL')

    print(f"\n【环境配置】")
    print(f"API Key: {'已配置' if api_key else '❌ 未配置'} ({len(api_key) if api_key else 0} 字符)")
    print(f"Base URL: {base_url or '使用默认'}")
    print(f"Model: {model}")
    print(f"AI 客户端: {'✓ 已初始化' if content_analyzer.client else '❌ 未初始化（降级方案）'}")

    # 测试用例
    test_cases = [
        {
            "title": "英伟达发布H200 GPU",
            "content": "英伟达今日发布了最新的H200 GPU，性能相比H100提升40%，专为AI大模型训练设计，采用HBM3e显存技术。",
            "expected": ["ai", "chip", "product"]
        },
        {
            "title": "比亚迪Q2财报",
            "content": "比亚迪发布2026年第二季度财报，净利润同比增长30%，新能源汽车销量突破100万辆。",
            "expected": ["earnings", "new_energy"]
        },
        {
            "title": "央行降准政策",
            "content": "央行宣布下调存款准备金率50个基点，释放长期资金约1万亿元，支持实体经济发展。",
            "expected": ["macro", "policy"]
        },
        {
            "title": "台积电扩产计划",
            "content": "台积电宣布在美国亚利桑那州新建3nm芯片工厂，总投资400亿美元，预计2025年投产。",
            "expected": ["capacity", "chip"]
        },
        {
            "title": "美国对华芯片出口管制",
            "content": "美国商务部宣布扩大对华先进芯片出口限制，将更多AI芯片纳入管制清单。",
            "expected": ["regulation", "geopolitics"]
        }
    ]

    print(f"\n{'=' * 60}")
    print(f"开始测试 {len(test_cases)} 个用例")
    print(f"{'=' * 60}\n")

    results = []

    for i, case in enumerate(test_cases, 1):
        print(f"【测试 {i}/{len(test_cases)}】")
        print(f"标题: {case['title']}")
        print(f"内容: {case['content'][:50]}...")
        print(f"预期分类: {', '.join(case['expected'])}")

        combined_text = f"{case['title']}\n\n{case['content']}"

        # 调用分类接口
        try:
            category, confidence = await content_analyzer.categorize_news(combined_text)

            is_correct = category in case['expected']
            status = "✓ 通过" if is_correct else "✗ 未匹配"

            print(f"实际分类: {category}")
            print(f"置信度: {confidence:.2f}")
            print(f"结果: {status}")

            results.append({
                "case": i,
                "title": case['title'],
                "expected": case['expected'],
                "actual": category,
                "confidence": confidence,
                "correct": is_correct,
                "using_ai": bool(content_analyzer.client)
            })

        except Exception as e:
            print(f"❌ 错误: {e}")
            results.append({
                "case": i,
                "title": case['title'],
                "error": str(e)
            })

        print()

    # 统计结果
    print(f"{'=' * 60}")
    print("测试总结")
    print(f"{'=' * 60}")

    total = len(results)
    passed = sum(1 for r in results if r.get('correct', False))
    using_ai = results[0].get('using_ai', False) if results else False

    print(f"\n总测试数: {total}")
    print(f"通过数: {passed}")
    print(f"准确率: {passed/total*100:.1f}%")
    print(f"使用方案: {'AI 分类' if using_ai else '降级分类（基于关键词）'}")

    # 详细结果
    print(f"\n详细结果:")
    for r in results:
        if 'error' not in r:
            status = "✓" if r['correct'] else "✗"
            print(f"  {status} {r['title']}: {r['actual']} (预期: {', '.join(r['expected'])})")

    return results


if __name__ == "__main__":
    asyncio.run(test_classification())
