"""
测试趋势分析的数据一致性
验证概览页面和详情页面的新闻数量是否一致
"""

import asyncio
import sys
from services.trend_analysis_service_v2 import get_trend_analysis_service
from db import db


async def test_trend_consistency():
    """测试趋势分析的数据一致性"""

    print("=" * 60)
    print("测试趋势分析数据一致性")
    print("=" * 60)

    # 获取服务实例
    service = get_trend_analysis_service(db)

    # 测试参数
    news_count = 100

    print(f"\n1. 获取概览数据（分析最近 {news_count} 条新闻）...")
    summaries = await service.analyze_all_domains_lightweight(news_count)

    if not summaries:
        print("❌ 未能获取概览数据")
        return False

    print(f"✅ 成功获取 {len(summaries)} 个领域的趋势摘要")

    # 打印概览数据
    print("\n概览数据：")
    print("-" * 60)
    print(f"{'领域':<15} {'趋势':<10} {'新闻数':<10}")
    print("-" * 60)

    summary_map = {}
    for summary in summaries:
        domain_code = summary['domainCode']
        domain_name = summary['domainName']
        trend = summary['trendDirection']
        news_count_summary = summary['relatedNewsCount']

        summary_map[domain_code] = {
            'name': domain_name,
            'count': news_count_summary,
            'trend': trend,
            'sentiment': summary['sentimentDistribution']
        }

        print(f"{domain_name:<15} {trend:<10} {news_count_summary:<10}")

    # 测试前3个领域的详情数据
    print(f"\n2. 测试详情页面数据一致性（前3个领域）...")
    print("-" * 60)

    test_domains = list(summary_map.keys())[:3]
    all_consistent = True

    for domain_code in test_domains:
        summary_data = summary_map[domain_code]

        print(f"\n测试领域: {summary_data['name']} ({domain_code})")
        print(f"  概览页面显示: {summary_data['count']} 条新闻")

        # 获取详情数据
        detail = await service.analyze_domain_detailed(domain_code, news_count, include_ai=False)

        if not detail:
            print(f"  ❌ 未能获取详情数据")
            all_consistent = False
            continue

        detail_count = detail['relatedNewsCount']
        detail_sentiment = detail['sentimentDistribution']

        print(f"  详情页面显示: {detail_count} 条新闻")

        # 检查数量是否一致
        if summary_data['count'] == detail_count:
            print(f"  ✅ 新闻数量一致")
        else:
            print(f"  ❌ 新闻数量不一致！")
            all_consistent = False

        # 检查情绪分布是否一致
        if summary_data['sentiment'] == detail_sentiment:
            print(f"  ✅ 情绪分布一致")
        else:
            print(f"  ❌ 情绪分布不一致！")
            print(f"     概览: {summary_data['sentiment']}")
            print(f"     详情: {detail_sentiment}")
            all_consistent = False

        # 检查相关新闻列表
        related_news = detail.get('relatedNews', [])
        print(f"  详情返回的新闻列表: {len(related_news)} 条")

        if len(related_news) > 0:
            print(f"  ✅ 新闻列表不为空")
        else:
            print(f"  ⚠️  新闻列表为空")

    print("\n" + "=" * 60)
    if all_consistent:
        print("✅ 所有测试通过！概览和详情数据完全一致")
        return True
    else:
        print("❌ 存在数据不一致的情况")
        return False


if __name__ == "__main__":
    try:
        result = asyncio.run(test_trend_consistency())
        sys.exit(0 if result else 1)
    except Exception as e:
        print(f"\n❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
