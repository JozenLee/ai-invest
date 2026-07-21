#!/usr/bin/env python3
"""
数据源新闻采集能力分析工具
分析所有Provider的新闻采集能力，并生成完整报告
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'data-service'))

from typing import Dict, List, Optional
import asyncio
import pandas as pd


class ProviderAnalyzer:
    """数据源分析器"""

    def __init__(self):
        self.results = []

    async def test_provider(self, provider_name: str, provider_class, test_params: Dict) -> Dict:
        """测试单个Provider的新闻采集能力"""
        result = {
            "provider": provider_name,
            "has_get_news": False,
            "is_implemented": False,
            "api_available": False,
            "test_success": False,
            "sample_count": 0,
            "error": None,
            "status": "❌ 不支持",
            "notes": ""
        }

        try:
            # 检查是否有get_news方法
            if not hasattr(provider_class, 'get_news'):
                result["notes"] = "未实现get_news方法"
                return result

            result["has_get_news"] = True

            # 实例化Provider
            provider = provider_class(**test_params.get("init_args", {}))

            # 测试是否真实可用
            try:
                keyword = test_params.get("keyword", "AI")
                limit = test_params.get("limit", 10)

                print(f"  测试 {provider_name}.get_news(keyword='{keyword}', limit={limit})...")

                df = await provider.get_news(keyword=keyword, limit=limit)

                if df is not None and not df.empty:
                    result["is_implemented"] = True
                    result["api_available"] = True
                    result["test_success"] = True
                    result["sample_count"] = len(df)
                    result["status"] = "✅ 可用"
                    result["notes"] = f"成功获取{len(df)}条数据"

                    # 检查数据字段
                    expected_cols = ["新闻标题", "新闻内容", "新闻链接", "发布时间", "来源"]
                    missing_cols = [col for col in expected_cols if col not in df.columns]
                    if missing_cols:
                        result["notes"] += f"，缺少字段: {missing_cols}"
                else:
                    result["is_implemented"] = True
                    result["api_available"] = False
                    result["status"] = "⚠️ 无数据"
                    result["notes"] = "接口返回空数据"

            except NotImplementedError as e:
                result["notes"] = "方法未实现（抛NotImplementedError）"
            except Exception as e:
                result["is_implemented"] = True
                result["api_available"] = False
                result["status"] = "⚠️ 失败"
                result["error"] = str(e)
                result["notes"] = f"API调用失败: {str(e)[:100]}"

        except Exception as e:
            result["error"] = str(e)
            result["notes"] = f"初始化失败: {str(e)[:100]}"

        return result

    async def analyze_all(self):
        """分析所有数据源"""

        print("=" * 80)
        print("数据源新闻采集能力分析")
        print("=" * 80)
        print()

        # 1. AKShare Provider
        print("1. 测试 AKShare Provider...")
        try:
            from providers.akshare_provider import AKShareProvider
            result = await self.test_provider(
                "AKShare",
                AKShareProvider,
                {"keyword": "AI", "limit": 10}
            )
            self.results.append(result)
            print(f"   {result['status']} - {result['notes']}")
        except Exception as e:
            print(f"   ❌ 加载失败: {e}")
        print()

        # 2. 雪球 Provider
        print("2. 测试 雪球 Provider...")
        try:
            from providers.xueqiu_provider import XueqiuProvider
            result = await self.test_provider(
                "雪球",
                XueqiuProvider,
                {"keyword": "AI", "limit": 10}
            )
            self.results.append(result)
            print(f"   {result['status']} - {result['notes']}")
        except Exception as e:
            print(f"   ❌ 加载失败: {e}")
        print()

        # 3. 新浪 Provider
        print("3. 测试 新浪 Provider...")
        try:
            from providers.sina_provider import SinaProvider
            result = await self.test_provider(
                "新浪",
                SinaProvider,
                {"keyword": "AI", "limit": 10}
            )
            self.results.append(result)
            print(f"   {result['status']} - {result['notes']}")
        except Exception as e:
            print(f"   ❌ 加载失败: {e}")
        print()

        # 4. Tushare Provider
        print("4. 测试 Tushare Provider...")
        try:
            from providers.tushare_provider import TushareProvider
            result = await self.test_provider(
                "Tushare",
                TushareProvider,
                {"keyword": "AI", "limit": 10, "init_args": {"token": os.getenv("TUSHARE_TOKEN")}}
            )
            self.results.append(result)
            print(f"   {result['status']} - {result['notes']}")
        except Exception as e:
            print(f"   ❌ 加载失败: {e}")
        print()

        # 5. 微博 Provider
        print("5. 测试 微博 Provider...")
        try:
            from providers.weibo_provider import WeiboProvider
            # 微博Provider没有get_news，标记为不支持
            self.results.append({
                "provider": "微博",
                "has_get_news": False,
                "is_implemented": False,
                "api_available": False,
                "test_success": False,
                "sample_count": 0,
                "error": None,
                "status": "❌ 不支持",
                "notes": "未实现get_news方法，仅支持fetch_user_posts"
            })
            print(f"   ❌ 不支持 - 未实现get_news方法")
        except Exception as e:
            print(f"   ❌ 加载失败: {e}")
        print()

        # 6. B站 Provider
        print("6. 测试 B站 Provider...")
        try:
            from providers.bilibili_provider import BilibiliProvider
            self.results.append({
                "provider": "B站",
                "has_get_news": False,
                "is_implemented": False,
                "api_available": False,
                "test_success": False,
                "sample_count": 0,
                "error": None,
                "status": "❌ 不支持",
                "notes": "未实现get_news方法，仅支持fetch_user_videos"
            })
            print(f"   ❌ 不支持 - 未实现get_news方法")
        except Exception as e:
            print(f"   ❌ 加载失败: {e}")
        print()

        # 7. 小红书 Provider
        print("7. 测试 小红书 Provider...")
        try:
            from providers.xiaohongshu_provider import XiaohongshuProvider
            self.results.append({
                "provider": "小红书",
                "has_get_news": False,
                "is_implemented": False,
                "api_available": False,
                "test_success": False,
                "sample_count": 0,
                "error": None,
                "status": "❌ 不支持",
                "notes": "未实现get_news方法，仅支持fetch_user_notes"
            })
            print(f"   ❌ 不支持 - 未实现get_news方法")
        except Exception as e:
            print(f"   ❌ 加载失败: {e}")
        print()

    def generate_report(self):
        """生成分析报告"""
        print()
        print("=" * 80)
        print("数据源新闻采集能力总表")
        print("=" * 80)
        print()

        # 创建DataFrame
        df = pd.DataFrame(self.results)

        # 输出表格
        print(df.to_string(index=False, columns=[
            "provider", "status", "sample_count", "notes"
        ]))

        print()
        print("=" * 80)
        print("统计汇总")
        print("=" * 80)
        print(f"总数据源: {len(self.results)}")
        print(f"✅ 可用: {len([r for r in self.results if r['test_success']])}")
        print(f"⚠️ 部分可用/无数据: {len([r for r in self.results if r['is_implemented'] and not r['test_success']])}")
        print(f"❌ 不支持: {len([r for r in self.results if not r['has_get_news']])}")
        print()

        # 详细建议
        print("=" * 80)
        print("建议与结论")
        print("=" * 80)
        print()

        available_providers = [r for r in self.results if r['test_success']]

        if available_providers:
            print("✅ 可通过API获取资讯的数据源:")
            for r in available_providers:
                print(f"   • {r['provider']}: {r['notes']}")
            print()

        partial_providers = [r for r in self.results if r['is_implemented'] and not r['test_success']]
        if partial_providers:
            print("⚠️ 实现了接口但当前不可用的数据源:")
            for r in partial_providers:
                print(f"   • {r['provider']}: {r['notes']}")
            print()

        unsupported_providers = [r for r in self.results if not r['has_get_news']]
        if unsupported_providers:
            print("❌ 不支持资讯采集的数据源:")
            for r in unsupported_providers:
                print(f"   • {r['provider']}: {r['notes']}")
            print()

        print()
        print("推荐集成方案:")
        print("─" * 80)
        if available_providers:
            print(f"1. 优先使用: {', '.join([r['provider'] for r in available_providers])}")
            print("   - 这些数据源已验证可用，能够通过API获取资讯")
            print("   - 可直接配置到数据源管理系统")
            print()

        print("2. 社交媒体数据源（微博/B站/小红书）:")
        print("   - 当前未实现统一的get_news接口")
        print("   - 建议独立处理，使用各自的fetch_user_posts/videos/notes方法")
        print("   - 需要配置大V账号列表进行定向采集")
        print()

        return df


async def main():
    """主函数"""
    analyzer = ProviderAnalyzer()
    await analyzer.analyze_all()
    df = analyzer.generate_report()

    # 保存结果
    output_file = "docs/news-providers-analysis.csv"
    df.to_csv(output_file, index=False, encoding='utf-8')
    print(f"详细结果已保存到: {output_file}")
    print()


if __name__ == "__main__":
    asyncio.run(main())
