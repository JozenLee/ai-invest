"""
测试 NewsNow Provider 集成
验证能否正常获取华尔街见闻、财联社等平台的新闻数据
"""

import asyncio
import sys
import logging
from providers.newsnow_provider import NewsNowProvider

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def test_newsnow_provider():
    """测试 NewsNow Provider"""
    provider = NewsNowProvider()

    # 测试场景
    test_cases = [
        ("wallstreetcn-hot", "华尔街见闻热榜"),
        ("cls-hot", "财联社热榜"),
        ("thepaper", "澎湃财经"),
        ("36kr", "36氪"),
    ]

    print("=" * 80)
    print("NewsNow Provider 集成测试")
    print("=" * 80)

    for platform_id, platform_name in test_cases:
        print(f"\n{'=' * 80}")
        print(f"测试平台: {platform_name} ({platform_id})")
        print("=" * 80)

        try:
            # 获取新闻数据
            df = await provider.get_news(keyword=platform_id, limit=5)

            if df.empty:
                print(f"❌ {platform_name}: 未获取到数据")
                continue

            print(f"✅ {platform_name}: 成功获取 {len(df)} 条新闻\n")

            # 显示前3条新闻
            for idx, row in df.head(3).iterrows():
                print(f"{idx + 1}. {row['新闻标题']}")
                print(f"   来源: {row['来源']}")
                print(f"   链接: {row['新闻链接'][:80]}...")
                print(f"   排名: {row['排名']}")
                print()

        except Exception as e:
            print(f"❌ {platform_name}: 测试失败 - {str(e)}")
            import traceback
            traceback.print_exc()

    print("\n" + "=" * 80)
    print("测试完成")
    print("=" * 80)


async def test_data_service_integration():
    """测试 DataService 集成"""
    print("\n" + "=" * 80)
    print("测试 DataService 集成")
    print("=" * 80)

    from services.data_service import data_service

    # 初始化数据服务
    data_service.initialize()
    print(f"✅ 已注册数据源: {data_service.registry.list_providers()}\n")

    # 测试通过 DataService 获取 NewsNow 数据
    try:
        print("测试获取华尔街见闻新闻...")
        df = await data_service.get_news(keyword="wallstreetcn-hot", limit=3)

        if not df.empty:
            print(f"✅ 成功获取 {len(df)} 条新闻\n")
            for idx, row in df.iterrows():
                print(f"{idx + 1}. {row['新闻标题']}")
                print(f"   来源: {row['来源']}")
                print()
        else:
            print("❌ 未获取到数据")

    except Exception as e:
        print(f"❌ DataService 集成测试失败: {str(e)}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    try:
        asyncio.run(test_newsnow_provider())
        asyncio.run(test_data_service_integration())
    except KeyboardInterrupt:
        print("\n测试中断")
        sys.exit(0)
