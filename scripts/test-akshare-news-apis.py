#!/usr/bin/env python3
"""
测试AKShare所有新闻相关接口的可用性
"""

import akshare as ak
import pandas as pd
from datetime import datetime
import time


def test_api(func_name, test_params, description):
    """测试单个API接口"""
    print(f"\n{'='*80}")
    print(f"测试: {func_name}")
    print(f"说明: {description}")
    print(f"参数: {test_params}")
    print("-" * 80)

    result = {
        "接口名称": func_name,
        "说明": description,
        "状态": "❌",
        "数据条数": 0,
        "字段列表": "",
        "错误信息": "",
        "适用场景": ""
    }

    try:
        func = getattr(ak, func_name)
        df = func(**test_params)

        if df is not None and not df.empty:
            result["状态"] = "✅"
            result["数据条数"] = len(df)
            result["字段列表"] = ", ".join(df.columns.tolist()[:5])  # 只显示前5个字段

            print(f"✅ 成功获取 {len(df)} 条数据")
            print(f"字段: {list(df.columns)}")
            print(f"\n前3条数据预览:")
            print(df.head(3).to_string())

            # 判断适用场景
            cols = df.columns.tolist()
            if "标题" in cols or "新闻标题" in cols:
                result["适用场景"] = "通用新闻资讯"
            elif "内容" in cols or "正文" in cols:
                result["适用场景"] = "详细新闻内容"
            else:
                result["适用场景"] = "特定数据/提醒"

        else:
            result["状态"] = "⚠️"
            result["错误信息"] = "返回空数据"
            print("⚠️ API调用成功但返回空数据")

    except Exception as e:
        result["状态"] = "❌"
        result["错误信息"] = str(e)[:100]
        print(f"❌ 失败: {e}")

    return result


def main():
    """主测试函数"""

    print("=" * 80)
    print("AKShare 新闻接口全面测试")
    print("=" * 80)

    results = []
    today = datetime.now().strftime("%Y%m%d")

    # 1. stock_news_em - 东方财富个股新闻
    results.append(test_api(
        "stock_news_em",
        {"symbol": "财联社"},
        "东方财富-个股新闻（实际是关键词搜索）"
    ))
    time.sleep(2)

    # 2. futures_news_shmet - 上海金属网快讯
    results.append(test_api(
        "futures_news_shmet",
        {"symbol": "全部"},
        "上海金属网-快讯"
    ))
    time.sleep(2)

    # 3. news_cctv - 新闻联播
    results.append(test_api(
        "news_cctv",
        {"date": today},
        "新闻联播文字稿"
    ))
    time.sleep(2)

    # 4. stock_news_main_cx - 财新网
    results.append(test_api(
        "stock_news_main_cx",
        {},
        "财新网-财新数据通"
    ))
    time.sleep(2)

    # 5. index_news_sentiment_scope - 新闻情绪指数
    results.append(test_api(
        "index_news_sentiment_scope",
        {},
        "数库-A股新闻情绪指数"
    ))
    time.sleep(2)

    # 6. news_economic_baidu - 百度经济数据
    results.append(test_api(
        "news_economic_baidu",
        {"date": today},
        "百度股市通-经济数据"
    ))
    time.sleep(2)

    # 7. news_report_time_baidu - 百度财报发布
    results.append(test_api(
        "news_report_time_baidu",
        {"date": today},
        "百度股市通-财报发行"
    ))
    time.sleep(2)

    # 8. news_trade_notify_dividend_baidu - 分红派息
    results.append(test_api(
        "news_trade_notify_dividend_baidu",
        {"date": today},
        "百度股市通-交易提醒-分红派息"
    ))
    time.sleep(2)

    # 9. news_trade_notify_suspend_baidu - 停复牌
    results.append(test_api(
        "news_trade_notify_suspend_baidu",
        {"date": today},
        "百度股市通-交易提醒-停复牌"
    ))

    # 生成汇总报告
    print("\n" + "=" * 80)
    print("测试结果汇总")
    print("=" * 80)

    df_results = pd.DataFrame(results)
    print(df_results.to_string(index=False))

    # 统计
    print("\n" + "=" * 80)
    print("统计信息")
    print("=" * 80)
    total = len(results)
    success = len([r for r in results if r["状态"] == "✅"])
    empty = len([r for r in results if r["状态"] == "⚠️"])
    failed = len([r for r in results if r["状态"] == "❌"])

    print(f"总接口数: {total}")
    print(f"✅ 可用: {success} ({success/total*100:.1f}%)")
    print(f"⚠️ 空数据: {empty} ({empty/total*100:.1f}%)")
    print(f"❌ 失败: {failed} ({failed/total*100:.1f}%)")

    # 推荐使用
    print("\n" + "=" * 80)
    print("推荐使用的接口")
    print("=" * 80)

    recommended = [r for r in results if r["状态"] == "✅" and r["适用场景"] == "通用新闻资讯"]
    if recommended:
        for r in recommended:
            print(f"\n✅ {r['接口名称']}")
            print(f"   说明: {r['说明']}")
            print(f"   数据量: {r['数据条数']}条")
            print(f"   场景: {r['适用场景']}")
    else:
        print("未找到适合的通用新闻接口")

    # 保存结果
    df_results.to_csv("docs/akshare-news-apis-test-result.csv", index=False, encoding='utf-8')
    print("\n详细结果已保存到: docs/akshare-news-apis-test-result.csv")


if __name__ == "__main__":
    main()
