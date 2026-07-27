#!/usr/bin/env python3
"""
市场数据更新链路诊断脚本
排查数据获取、缓存和更新机制的问题
"""

import os
import sys
import json
from datetime import datetime
from pathlib import Path

# 添加项目路径
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root / "data-service"))

# 禁用代理
for key in ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy']:
    os.environ.pop(key, None)
os.environ['NO_PROXY'] = '*'

def check_cache_files():
    """检查缓存文件状态"""
    print("=" * 60)
    print("1. 检查缓存文件")
    print("=" * 60)

    cache_dir = project_root / "data-service" / ".cache"
    if not cache_dir.exists():
        print("❌ 缓存目录不存在:", cache_dir)
        return

    print(f"✅ 缓存目录: {cache_dir}")

    key_files = ["market_overview.json", "market_capital_flow.json", "sector_capital_flow_今日.json"]

    for filename in key_files:
        filepath = cache_dir / filename
        if filepath.exists():
            stat = filepath.stat()
            mtime = datetime.fromtimestamp(stat.st_mtime)
            age_hours = (datetime.now() - mtime).total_seconds() / 3600

            size = stat.st_size / 1024  # KB
            status = "🟢" if age_hours < 24 else "🟡" if age_hours < 48 else "🔴"

            print(f"{status} {filename}")
            print(f"   大小: {size:.1f} KB")
            print(f"   修改时间: {mtime.strftime('%Y-%m-%d %H:%M:%S')}")
            print(f"   数据年龄: {age_hours:.1f} 小时")
        else:
            print(f"❌ {filename} - 文件不存在")
        print()

def test_akshare_direct():
    """测试AKShare直接获取数据"""
    print("=" * 60)
    print("2. 测试AKShare数据获取")
    print("=" * 60)

    try:
        import akshare as ak
        print("✅ AKShare已安装")

        # 测试指数行情
        print("\n正在获取指数行情...")
        df = ak.stock_zh_index_spot_em()

        if df.empty:
            print("❌ 获取的数据为空")
            return False

        print(f"✅ 成功获取 {len(df)} 条指数数据")

        # 检查主要指数
        target_codes = ["000001", "399001", "399006", "000688", "000300"]
        for code in target_codes:
            row = df[df['代码'] == code]
            if not row.empty:
                name = row.iloc[0]['名称']
                price = row.iloc[0]['最新价']
                change_pct = row.iloc[0]['涨跌幅']
                print(f"  {name} ({code}): ¥{price:.2f} ({change_pct:+.2f}%)")

        return True

    except ImportError:
        print("❌ AKShare未安装")
        return False
    except Exception as e:
        print(f"❌ AKShare获取数据失败: {e}")
        return False

def test_registry_fetch():
    """测试Registry数据获取"""
    print("\n" + "=" * 60)
    print("3. 测试Registry数据源")
    print("=" * 60)

    try:
        import asyncio
        from providers.registry import registry
        from providers.akshare_provider import AKShareProvider
        from providers.sina_provider import SinaProvider

        # 注册provider
        registry.register(AKShareProvider())
        registry.register(SinaProvider())

        print(f"✅ 已注册数据源: {registry.list_providers()}")

        async def fetch_test():
            print("\n正在通过Registry获取指数数据...")
            df = await registry.fetch(
                category="index_spot",
                method="get_index_spot",
                cache_key=None,  # 不使用缓存
            )

            if df.empty:
                print("❌ 获取的数据为空")
                return False

            print(f"✅ 成功获取 {len(df)} 条指数数据")

            # 显示前几行
            if '代码' in df.columns and '名称' in df.columns and '最新价' in df.columns:
                for _, row in df.head(5).iterrows():
                    print(f"  {row['名称']} ({row['代码']}): ¥{row['最新价']:.2f}")

            return True

        return asyncio.run(fetch_test())

    except Exception as e:
        print(f"❌ Registry测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False

def check_data_service_api():
    """检查Python数据服务API"""
    print("\n" + "=" * 60)
    print("4. 检查Python数据服务API")
    print("=" * 60)

    try:
        import requests

        # 检查健康状态
        response = requests.get("http://localhost:8000/health", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print("✅ 数据服务运行中")
            print(f"   版本: {data.get('version')}")
            print(f"   调度器: {'运行中' if data.get('scheduler_running') else '未运行'}")
            print(f"   活跃任务: {data.get('active_jobs')}")
        else:
            print(f"❌ 数据服务异常: HTTP {response.status_code}")
            return False

        # 检查市场数据API
        print("\n正在获取市场概览...")
        response = requests.get("http://localhost:8000/api/market/overview", timeout=10)
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                indices = data.get('data', {}).get('indices', [])
                timestamp = data.get('data', {}).get('timestamp')
                meta = data.get('data', {}).get('meta', {})

                print(f"✅ 成功获取 {len(indices)} 个指数")
                print(f"   时间戳: {timestamp}")
                print(f"   是否实时: {meta.get('isRealtime')}")
                print(f"   数据日期: {meta.get('dataDate')}")

                # 显示前3个指数
                for idx in indices[:3]:
                    print(f"  {idx['name']}: ¥{idx['price']:.2f} ({idx['changePct']:+.2f}%)")

                return True
            else:
                print(f"❌ API返回失败: {data.get('error')}")
                return False
        else:
            print(f"❌ API请求失败: HTTP {response.status_code}")
            return False

    except requests.exceptions.ConnectionError:
        print("❌ 无法连接到数据服务 (端口8000)")
        print("   请先启动数据服务: cd data-service && python main.py")
        return False
    except Exception as e:
        print(f"❌ 检查失败: {e}")
        return False

def check_scheduler():
    """检查定时任务状态"""
    print("\n" + "=" * 60)
    print("5. 检查定时任务")
    print("=" * 60)

    try:
        import requests

        response = requests.get("http://localhost:8000/api/scheduler/status", timeout=5)
        if response.status_code == 200:
            data = response.json()
            jobs = data.get('jobs', [])

            print(f"✅ 调度器运行中，共 {len(jobs)} 个任务")

            # 查找缓存刷新任务
            cache_refresh_job = None
            for job in jobs:
                if job.get('id') == 'daily_cache_refresh':
                    cache_refresh_job = job
                    break

            if cache_refresh_job:
                next_run = cache_refresh_job.get('next_run')
                print(f"\n🔄 每日缓存刷新任务:")
                print(f"   下次运行: {next_run}")
                print(f"   Cron: {cache_refresh_job.get('cron')}")
                print(f"   状态: {cache_refresh_job.get('status')}")
            else:
                print("⚠️  未找到每日缓存刷新任务")

            return True
        else:
            print(f"❌ 无法获取调度器状态: HTTP {response.status_code}")
            return False

    except Exception as e:
        print(f"❌ 检查失败: {e}")
        return False

def main():
    print("\n" + "=" * 60)
    print("市场数据更新链路诊断")
    print("=" * 60)
    print(f"执行时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()

    results = []

    # 1. 检查缓存文件
    check_cache_files()

    # 2. 测试AKShare
    results.append(("AKShare数据获取", test_akshare_direct()))

    # 3. 测试Registry
    results.append(("Registry数据源", test_registry_fetch()))

    # 4. 检查API
    results.append(("Python数据服务", check_data_service_api()))

    # 5. 检查定时任务
    results.append(("定时任务调度", check_scheduler()))

    # 总结
    print("\n" + "=" * 60)
    print("诊断总结")
    print("=" * 60)

    for name, passed in results:
        status = "✅ 通过" if passed else "❌ 失败"
        print(f"{status} - {name}")

    all_passed = all(passed for _, passed in results)

    print("\n" + "=" * 60)
    if all_passed:
        print("✅ 所有检查通过，数据链路正常")
    else:
        print("⚠️  存在问题，请查看上述详细信息")
    print("=" * 60)

    return 0 if all_passed else 1

if __name__ == "__main__":
    sys.exit(main())
