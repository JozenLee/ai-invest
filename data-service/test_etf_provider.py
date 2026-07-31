#!/usr/bin/env python3
"""
ETF Provider 测试脚本
测试 ETF 数据服务的持仓和基本信息接口
"""

import asyncio
import sys
from providers.etf_provider import ETFProvider


async def test_etf_provider():
    """测试 ETFProvider 类"""
    provider = ETFProvider()

    test_tickers = ["512480", "515070", "159995"]  # 半导体、AI、芯片 ETF

    print("=" * 60)
    print("ETF Provider 测试")
    print("=" * 60)

    for ticker in test_tickers:
        print(f"\n测试 ETF: {ticker}")
        print("-" * 60)

        # 测试基本信息
        print(f"\n1. 获取基本信息...")
        info = await provider.get_etf_info(ticker)
        if info:
            print(f"   ✓ 名称: {info['name']}")
            print(f"   ✓ 最新价: {info['latest_price']}")
            print(f"   ✓ 涨跌幅: {info['change_pct']}%")
            print(f"   ✓ 总市值: {info['market_value']:,.0f}")
        else:
            print(f"   ✗ 未找到 ETF {ticker} 的信息")

        # 测试持仓明细
        print(f"\n2. 获取持仓明细...")
        holdings = await provider.get_holdings(ticker)
        if holdings:
            print(f"   ✓ 获取到 {len(holdings)} 条持仓记录")
            for i, holding in enumerate(holdings[:5], 1):
                print(f"   {i}. {holding['stock_name']} ({holding['stock_code']}): {holding['weight']:.2%}")
        else:
            print(f"   ⚠ 持仓数据暂不可用（AKShare API限制）")

    print("\n" + "=" * 60)
    print("测试完成")
    print("=" * 60)


if __name__ == "__main__":
    try:
        asyncio.run(test_etf_provider())
    except KeyboardInterrupt:
        print("\n测试中断")
        sys.exit(1)
    except Exception as e:
        print(f"\n测试失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
