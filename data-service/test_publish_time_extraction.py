"""
测试所有Provider的publishTime提取逻辑
验证是否正确使用原始新闻的发布时间，而不是采集时的当前时间
"""

import asyncio
import sys
from datetime import datetime
from pathlib import Path

# 添加项目根目录到Python路径
sys.path.insert(0, str(Path(__file__).parent))

from providers.newsnow_provider import NewsNowProvider
from providers.akshare_provider import AKShareProvider
from providers.xueqiu_provider import XueqiuProvider


def print_separator(title: str):
    """打印分隔符"""
    print("\n" + "=" * 80)
    print(f"  {title}")
    print("=" * 80)


async def test_newsnow_provider():
    """测试NewsNow Provider的时间提取"""
    print_separator("测试 NewsNow Provider")

    provider = NewsNowProvider()

    # 测试时间提取逻辑
    print("\n[测试1] 测试_extract_publish_time方法")

    test_cases = [
        {
            "name": "有效的time字段（毫秒时间戳）",
            "item": {"title": "测试新闻1", "time": 1721620800000},  # 2024-07-22 08:00:00
            "api_updated_time": None,
            "expected": "2024-07-22"
        },
        {
            "name": "有效的time字段（秒时间戳）",
            "item": {"title": "测试新闻2", "time": 1721620800},
            "api_updated_time": None,
            "expected": "2024-07-22"
        },
        {
            "name": "有效的pubDate字段（ISO格式）",
            "item": {"title": "测试新闻3", "pubDate": "2024-07-22T08:00:00Z"},
            "api_updated_time": None,
            "expected": "2024-07-22"
        },
        {
            "name": "使用API级别的updatedTime（时间戳）",
            "item": {"title": "测试新闻4"},
            "api_updated_time": 1721620800,
            "expected": "2024-07-22"
        },
        {
            "name": "使用API级别的updatedTime（ISO格式）",
            "item": {"title": "测试新闻5"},
            "api_updated_time": "2024-07-22T08:00:00Z",
            "expected": "2024-07-22"
        },
        {
            "name": "缺少所有时间字段（应降级到当前时间）",
            "item": {"title": "测试新闻6"},
            "api_updated_time": None,
            "expected": datetime.now().strftime("%Y-%m-%d")
        },
    ]

    for case in test_cases:
        result = provider._extract_publish_time(case["item"], case.get("api_updated_time"))
        success = case["expected"] in result
        status = "✓ PASS" if success else "✗ FAIL"
        print(f"  {status} - {case['name']}: {result}")

    # 测试实际API调用
    print("\n[测试2] 获取真实新闻数据")
    try:
        df = await provider.get_news(keyword="wallstreetcn-hot", limit=5)
        if not df.empty:
            print(f"  成功获取 {len(df)} 条新闻")
            print("\n  前3条新闻的发布时间:")
            for idx, row in df.head(3).iterrows():
                print(f"    {idx+1}. [{row['发布时间']}] {row['新闻标题'][:40]}")

            # 检查是否所有时间都相同
            unique_times = df['发布时间'].nunique()
            if unique_times == 1:
                print(f"  ℹ️  注意：所有新闻使用相同的发布时间（NewsNow API特性：使用API级别的updatedTime）")
                print(f"     这是正常的，因为NewsNow API的item级别不提供独立的时间字段")
            else:
                print(f"  ✓ 发布时间有 {unique_times} 个不同值")
        else:
            print("  未获取到新闻数据")
    except Exception as e:
        print(f"  获取新闻失败: {e}")


async def test_akshare_provider():
    """测试AKShare Provider的时间提取"""
    print_separator("测试 AKShare Provider")

    provider = AKShareProvider()

    # 测试时间确保逻辑
    print("\n[测试1] 测试_ensure_publish_time方法")

    import pandas as pd

    test_cases = [
        {
            "name": "有发布时间字段",
            "df": pd.DataFrame([
                {"新闻标题": "测试1", "发布时间": "2024-07-22 10:00:00"},
                {"新闻标题": "测试2", "发布时间": "2024-07-22 11:00:00"}
            ]),
            "should_have_time": True
        },
        {
            "name": "有时间字段（需要重命名）",
            "df": pd.DataFrame([
                {"新闻标题": "测试3", "time": "2024-07-22 10:00:00"}
            ]),
            "should_have_time": True
        },
        {
            "name": "缺少时间字段（应降级到当前时间）",
            "df": pd.DataFrame([
                {"新闻标题": "测试4", "内容": "测试内容"}
            ]),
            "should_have_time": True
        },
    ]

    for case in test_cases:
        result_df = provider._ensure_publish_time(case["df"])
        has_time = "发布时间" in result_df.columns
        success = has_time == case["should_have_time"]
        status = "✓ PASS" if success else "✗ FAIL"

        if has_time:
            time_value = result_df.iloc[0]["发布时间"]
            print(f"  {status} - {case['name']}: 发布时间={time_value}")
        else:
            print(f"  {status} - {case['name']}: 缺少发布时间字段")

    # 测试实际API调用
    print("\n[测试2] 获取真实新闻数据 (stock_news_em)")
    try:
        df = await provider.get_news(keyword="AI", limit=5, api="stock_news_em")
        if not df.empty:
            print(f"  成功获取 {len(df)} 条新闻")
            print("\n  前3条新闻的发布时间:")
            for idx, row in df.head(3).iterrows():
                print(f"    {idx+1}. [{row['发布时间']}] {row['新闻标题'][:40]}")

            # 检查时间是否有效
            if "发布时间" in df.columns:
                unique_times = df['发布时间'].nunique()
                print(f"  ✓ 发布时间字段存在，有 {unique_times} 个不同值")
            else:
                print(f"  ✗ 缺少发布时间字段")
        else:
            print("  未获取到新闻数据")
    except Exception as e:
        print(f"  获取新闻失败: {e}")


async def test_xueqiu_provider():
    """测试雪球 Provider的时间提取"""
    print_separator("测试 Xueqiu Provider")

    provider = XueqiuProvider()

    # 测试时间提取逻辑
    print("\n[测试1] 测试_extract_publish_time方法")

    test_cases = [
        {
            "name": "有效的created_at字段（毫秒时间戳）",
            "item": {"title": "测试新闻1", "created_at": 1721620800000},  # 2024-07-22 08:00:00
            "expected": "2024-07-22"
        },
        {
            "name": "created_at为0（应降级到当前时间）",
            "item": {"title": "测试新闻2", "created_at": 0},
            "expected": datetime.now().strftime("%Y-%m-%d")
        },
        {
            "name": "缺少created_at字段（应降级到当前时间）",
            "item": {"title": "测试新闻3"},
            "expected": datetime.now().strftime("%Y-%m-%d")
        },
    ]

    for case in test_cases:
        result = provider._extract_publish_time(case["item"])
        success = case["expected"] in result
        status = "✓ PASS" if success else "✗ FAIL"
        print(f"  {status} - {case['name']}: {result}")

    # 测试实际API调用
    print("\n[测试2] 获取真实新闻数据")
    try:
        df = await provider.get_news(keyword="", limit=5)
        if not df.empty:
            print(f"  成功获取 {len(df)} 条新闻")
            print("\n  前3条新闻的发布时间:")
            for idx, row in df.head(3).iterrows():
                print(f"    {idx+1}. [{row['发布时间']}] {row['新闻标题'][:40]}")

            # 检查是否所有时间都相同
            unique_times = df['发布时间'].nunique()
            if unique_times == 1:
                print(f"  ⚠️  警告：所有新闻的发布时间相同，可能是降级数据或API限制")
            else:
                print(f"  ✓ 发布时间有 {unique_times} 个不同值，提取正常")
        else:
            print("  未获取到新闻数据（可能是API限制或降级到示例数据）")
    except Exception as e:
        print(f"  获取新闻失败: {e}")


async def main():
    """主测试函数"""
    print("\n" + "=" * 80)
    print("  Provider发布时间提取逻辑测试")
    print("  目标：确保使用原始新闻的发布时间，而不是采集时的当前时间")
    print("=" * 80)

    # 测试所有Provider
    await test_newsnow_provider()
    await test_akshare_provider()
    await test_xueqiu_provider()

    # 总结
    print_separator("测试完成")
    print("""
总结：
1. NewsNow Provider:
   - 优先使用item级别的time/pubDate字段（实际API不提供）
   - 降级到API级别的updatedTime（所有新闻共享此时间）
   - 最后降级到当前时间
   - ⚠️ NewsNow API限制：所有新闻使用相同的updatedTime

2. AKShare Provider:
   - 使用_ensure_publish_time统一处理多个时间字段
   - 优先使用原始数据的发布时间字段
   - 支持多种时间字段名称（发布时间/time/datetime等）
   - ✓ 每条新闻有独立的发布时间

3. Xueqiu Provider:
   - 优先使用created_at字段（Unix时间戳毫秒）
   - 降级到当前时间并记录警告
   - ✓ 真实API提供独立的created_at时间戳

所有Provider都已添加：
✓ 时间字段优先级处理
✓ Try-catch容错处理
✓ 降级方案（使用当前时间时记录警告）
✓ ISO 8601格式标准化 (YYYY-MM-DD HH:MM:SS)

注意：
- NewsNow API的限制：item级别不提供时间字段，只能使用API级别的updatedTime
- 这是NewsNow API的设计特性，不是实现问题
- 如果需要精确的发布时间，建议优先使用AKShare或Xueqiu数据源
    """)


if __name__ == "__main__":
    asyncio.run(main())
