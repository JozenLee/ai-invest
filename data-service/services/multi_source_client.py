# 多源聚合数据客户端
# 统一调度 AKShare（东方财富）+ 雪球，自动降级
# 提供统一的数据格式输出

import asyncio
from datetime import datetime
from typing import Optional, List, Dict, Any

from services.akshare_client import client as akshare_client
from services.xueqiu_client import xueqiu_client


class MultiSourceClient:
    """多源聚合客户端

    降级策略：
    1. AKShare（东方财富）→ 数据最全，优先使用
    2. 雪球 → 备选数据源
    3. 缓存 → 最后降级
    """

    # ==================== 指数行情 ====================

    async def get_index_overview(self) -> Dict[str, Any]:
        """获取主要指数行情概览（多源聚合）

        Returns:
            {
                "indices": [...],
                "source": "akshare" | "xueqiu" | "mixed",
                "timestamp": "..."
            }
        """
        # 配置：AKShare symbol → 雪球 symbol → 名称
        index_configs = [
            {"ak_symbol": "sh000001", "xq_symbol": "SH000001", "name": "上证指数"},
            {"ak_symbol": "sz399001", "xq_symbol": "SZ399001", "name": "深证成指"},
            {"ak_symbol": "sz399006", "xq_symbol": "SZ399006", "name": "创业板指"},
            {"ak_symbol": "sh000688", "xq_symbol": "SH000688", "name": "科创50"},
            {"ak_symbol": "sh000300", "xq_symbol": "SH000300", "name": "沪深300"},
        ]

        # 尝试 AKShare 实时行情
        ak_indices = await self._try_akshare_indices(index_configs)

        if ak_indices and len(ak_indices) >= 3:
            return {
                "indices": ak_indices,
                "source": "akshare",
                "timestamp": datetime.now().isoformat()
            }

        # 降级：尝试雪球
        xq_indices = await self._try_xueqiu_indices(index_configs)

        if xq_indices and len(xq_indices) >= 3:
            return {
                "indices": xq_indices,
                "source": "xueqiu",
                "timestamp": datetime.now().isoformat()
            }

        # 混合：部分来自 AKShare，部分来自雪球
        merged = self._merge_indices(ak_indices or [], xq_indices or [], index_configs)
        if merged:
            return {
                "indices": merged,
                "source": "mixed",
                "timestamp": datetime.now().isoformat()
            }

        return {
            "indices": [],
            "source": "unavailable",
            "timestamp": datetime.now().isoformat()
        }

    async def _try_akshare_indices(self, configs: List[Dict]) -> Optional[List[Dict]]:
        """尝试从 AKShare 获取指数行情"""
        try:
            import akshare as ak
            df = ak.stock_zh_index_spot_em()
            if df.empty:
                return None

            result = []
            for config in configs:
                # AKShare 的代码格式是纯数字，如 "000001"
                code = config["ak_symbol"].replace("sh", "").replace("sz", "")
                row = df[df["代码"] == code]
                if not row.empty:
                    r = row.iloc[0]
                    result.append({
                        "code": config["ak_symbol"],
                        "name": config["name"],
                        "price": round(float(r.get("最新价", 0)), 2),
                        "change": round(float(r.get("涨跌额", 0)), 2),
                        "changePct": round(float(r.get("涨跌幅", 0)), 2),
                        "volume": float(r.get("成交量", 0)),
                        "amount": float(r.get("成交额", 0)),
                        "source": "akshare"
                    })
            return result if result else None
        except Exception as e:
            print(f"AKShare 指数行情失败: {e}")
            return None

    async def _try_xueqiu_indices(self, configs: List[Dict]) -> Optional[List[Dict]]:
        """尝试从雪球获取指数行情"""
        try:
            symbols = [c["xq_symbol"] for c in configs]
            data = await xueqiu_client.get_index_realtime(symbols)

            if not data:
                return None

            result = []
            for item in data:
                # 找到对应的配置
                config = next((c for c in configs if c["xq_symbol"] == item["symbol"]), None)
                if config:
                    result.append({
                        "code": config["ak_symbol"],
                        "name": item.get("name", config["name"]),
                        "price": round(item.get("current", 0), 2),
                        "change": round(item.get("chg", 0), 2),
                        "changePct": round(item.get("percent", 0), 2),
                        "volume": item.get("volume", 0),
                        "amount": item.get("amount", 0),
                        "source": "xueqiu"
                    })
            return result if result else None
        except Exception as e:
            print(f"雪球指数行情失败: {e}")
            return None

    def _merge_indices(self, ak: List[Dict], xq: List[Dict], configs: List[Dict]) -> List[Dict]:
        """合并两个数据源的指数数据"""
        ak_map = {i["code"]: i for i in ak}
        xq_map = {}
        for i in xq:
            # 雪球返回的 code 可能是 AKShare 格式（已在 _try_xueqiu_indices 中转换）
            xq_map[i["code"]] = i

        result = []
        for config in configs:
            code = config["ak_symbol"]
            if code in ak_map:
                result.append(ak_map[code])
            elif code in xq_map:
                result.append(xq_map[code])

        return result

    # ==================== ETF 实时行情 ====================

    async def get_etf_realtime(self, etf_pool: Dict[str, Dict]) -> List[Dict]:
        """获取 ETF 实时行情（多源聚合）

        Args:
            etf_pool: {"510300": {"name": "沪深300ETF", ...}, ...}
        """
        # 尝试 AKShare
        try:
            symbols = list(etf_pool.keys())
            df = akshare_client.get_etf_realtime(symbols)
            if not df.empty:
                result = []
                for _, row in df.iterrows():
                    ticker = str(row.get("代码", ""))
                    if ticker in etf_pool:
                        result.append({
                            "ticker": ticker,
                            "name": etf_pool[ticker]["name"],
                            "price": float(row.get("最新价", 0)),
                            "changePct": float(row.get("涨跌幅", 0)),
                            "volume": float(row.get("成交额", 0)),
                            "source": "akshare"
                        })
                if result:
                    return result
        except Exception as e:
            print(f"AKShare ETF 行情失败: {e}")

        # 降级：雪球
        try:
            xq_symbols = [f"SH{t}" if t.startswith("5") else f"SZ{t}" for t in etf_pool.keys()]
            data = await xueqiu_client.get_etf_realtime(xq_symbols)
            if data:
                result = []
                for item in data:
                    # 从雪球 symbol 提取原始代码
                    xq_sym = item.get("symbol", "")
                    ticker = xq_sym[2:] if len(xq_sym) > 2 else ""
                    if ticker in etf_pool:
                        result.append({
                            "ticker": ticker,
                            "name": etf_pool[ticker]["name"],
                            "price": item.get("current", 0),
                            "changePct": item.get("percent", 0),
                            "volume": item.get("amount", 0),
                            "source": "xueqiu"
                        })
                if result:
                    return result
        except Exception as e:
            print(f"雪球 ETF 行情失败: {e}")

        return []


# 全局单例
multi_source_client = MultiSourceClient()
