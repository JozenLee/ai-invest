"""
测试领域筛选功能
"""
import sys
import json
from services.fetch_service import FetchService

def test_domain_filter():
    """测试领域筛选逻辑"""

    service = FetchService()

    # 准备测试数据
    test_articles = [
        {"title": "AI芯片新突破", "domainIds": ["chip", "ai"]},
        {"title": "光模块出货量增长", "domainIds": ["optical"]},
        {"title": "服务器市场分析", "domainIds": ["server"]},
        {"title": "通用新闻", "domainIds": []},
        {"title": "芯片与光通信", "domainIds": ["chip", "optical"]},
    ]

    print("=" * 60)
    print("测试1: include模式 - 只保留chip和optical")
    print("=" * 60)

    config_include = {
        "enabled": True,
        "domainIds": ["chip", "optical"],
        "mode": "include"
    }

    filtered = service.apply_domain_filter(test_articles, config_include)
    print(f"原始数量: {len(test_articles)}")
    print(f"筛选后数量: {len(filtered)}")
    print("筛选结果:")
    for article in filtered:
        print(f"  - {article['title']} -> {article['domainIds']}")

    assert len(filtered) == 3, f"Expected 3, got {len(filtered)}"

    print("\n" + "=" * 60)
    print("测试2: exclude模式 - 过滤掉chip和optical")
    print("=" * 60)

    config_exclude = {
        "enabled": True,
        "domainIds": ["chip", "optical"],
        "mode": "exclude"
    }

    filtered = service.apply_domain_filter(test_articles, config_exclude)
    print(f"原始数量: {len(test_articles)}")
    print(f"筛选后数量: {len(filtered)}")
    print("筛选结果:")
    for article in filtered:
        print(f"  - {article['title']} -> {article['domainIds']}")

    assert len(filtered) == 2, f"Expected 2, got {len(filtered)}"

    print("\n" + "=" * 60)
    print("测试3: 未启用筛选")
    print("=" * 60)

    config_disabled = {
        "enabled": False,
        "domainIds": ["chip"],
        "mode": "include"
    }

    filtered = service.apply_domain_filter(test_articles, config_disabled)
    print(f"原始数量: {len(test_articles)}")
    print(f"筛选后数量: {len(filtered)}")

    assert len(filtered) == 5, f"Expected 5, got {len(filtered)}"

    print("\n" + "=" * 60)
    print("测试4: 配置为None")
    print("=" * 60)

    filtered = service.apply_domain_filter(test_articles, None)
    print(f"原始数量: {len(test_articles)}")
    print(f"筛选后数量: {len(filtered)}")

    assert len(filtered) == 5, f"Expected 5, got {len(filtered)}"

    print("\n" + "=" * 60)
    print("测试5: domainIds为JSON字符串格式")
    print("=" * 60)

    articles_with_json = [
        {"title": "测试1", "domainIds": json.dumps(["chip", "ai"])},
        {"title": "测试2", "domainIds": json.dumps(["optical"])},
        {"title": "测试3", "domainIds": "[]"},
    ]

    config_include = {
        "enabled": True,
        "domainIds": ["chip"],
        "mode": "include"
    }

    filtered = service.apply_domain_filter(articles_with_json, config_include)
    print(f"原始数量: {len(articles_with_json)}")
    print(f"筛选后数量: {len(filtered)}")
    print("筛选结果:")
    for article in filtered:
        print(f"  - {article['title']} -> {article['domainIds']}")

    assert len(filtered) == 1, f"Expected 1, got {len(filtered)}"

    print("\n" + "=" * 60)
    print("✅ 所有测试通过！")
    print("=" * 60)

if __name__ == "__main__":
    try:
        test_domain_filter()
    except Exception as e:
        print(f"❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
