"""
Multi-Source Data Provider - 多数据源智能提供者
实现中期解决方案：多数据源切换、启动预加载、固定指数映射

优先级策略：
1. ETF历史数据: Tushare > AKShare > 实时数据降级
2. ETF实时数据: AKShare > Sina
3. 指数数据: 固定映射 > AKShare > Sina
"""
from typing import Optional, List, Dict, Any
import logging
import asyncio
from datetime import datetime, timedelta
import pandas as pd


class MultiSourceProvider:
    """多数据源智能提供者"""

    # 固定指数映射表（核心指数基准数据）
    INDEX_FIXED_MAPPING = {
        "000001": {"name": "上证指数", "base_price": 3000},
        "sh000001": {"name": "上证指数", "base_price": 3000},
        "399001": {"name": "深证成指", "base_price": 10000},
        "sz399001": {"name": "深证成指", "base_price": 10000},
        "399006": {"name": "创业板指", "base_price": 2000},
        "sz399006": {"name": "创业板指", "base_price": 2000},
        "000300": {"name": "沪深300", "base_price": 4000},
        "sh000300": {"name": "沪深300", "base_price": 4000},
        "000688": {"name": "科创50", "base_price": 1000},
        "sh000688": {"name": "科创50", "base_price": 1000},
        "931079": {"name": "中证算力", "base_price": 1000},
        "399303": {"name": "国证半导体", "base_price": 5000},
        "sz399303": {"name": "国证半导体", "base_price": 5000},
    }

    def __init__(self):
        self.logger = logging.getLogger(__name__)

        # 延迟导入避免循环依赖
        from providers.akshare_provider import AKShareProvider
        from providers.sina_provider import SinaProvider
        from providers.fallback_provider import FallbackProvider

        self.akshare = AKShareProvider()
        self.sina = SinaProvider()
        self.fallback = FallbackProvider()

        # 启动缓存
        self._etf_cache: Optional[Dict[str, Any]] = None
        self._index_cache: Optional[Dict[str, Any]] = None
        self._cache_loaded = False

    async def warmup_cache(self):
        """启动时预加载缓存（减少首次请求延迟）"""
        if self._cache_loaded:
            return

        self.logger.info("🔥 Warming up data cache...")
        start_time = datetime.now()

        try:
            # 并行预加载ETF和指数数据
            await asyncio.gather(
                self._warmup_etf_cache(),
                self._warmup_index_cache(),
                return_exceptions=True
            )

            elapsed = (datetime.now() - start_time).total_seconds()
            self.logger.info(f"✅ Cache warmup completed in {elapsed:.2f}s")
            self._cache_loaded = True

        except Exception as e:
            self.logger.error(f"❌ Cache warmup failed: {e}")

    async def _warmup_etf_cache(self):
        """预加载ETF实时数据"""
        try:
            self.logger.info("Loading ETF cache...")
            cache = await self.fallback._get_all_etf_cache()
            self._etf_cache = cache
            self.logger.info(f"Cached {len(cache)} ETFs")
        except Exception as e:
            self.logger.error(f"ETF cache failed: {e}")

    async def _warmup_index_cache(self):
        """预加载指数数据"""
        try:
            self.logger.info("Loading index cache...")
            # 使用固定映射作为基准
            cache = {}
            for code, info in self.INDEX_FIXED_MAPPING.items():
                cache[code] = {
                    "代码": code,
                    "名称": info["name"],
                    "最新价": info["base_price"],
                    "涨跌幅": 0.0,
                    "source": "fixed_mapping"
                }
            self._index_cache = cache
            self.logger.info(f"Cached {len(cache)} indices (fixed mapping)")
        except Exception as e:
            self.logger.error(f"Index cache failed: {e}")

    async def get_etf_hist_data(
        self,
        code: str,
        start_date: str,
        end_date: str
    ) -> Optional[pd.DataFrame]:
        """
        获取ETF历史数据（多数据源）

        优先级: AKShare > 实时数据降级
        """
        # 方案1: AKShare（东方财富）
        try:
            self.logger.info(f"[AKShare] Fetching ETF {code} history...")
            df = await self.akshare.get_etf_daily(code, start_date, end_date)
            if not df.empty:
                self.logger.info(f"✅ AKShare returned {len(df)} rows")
                return df
        except Exception as e:
            self.logger.warning(f"[AKShare] ETF {code} failed: {e}")

        # 方案2: 降级到实时数据（单日）
        try:
            self.logger.info(f"[Fallback] Using spot data for ETF {code}...")
            spot_data = await self.fallback.get_etf_spot_data(code)
            if spot_data and spot_data.get("kline"):
                # 转换为DataFrame格式
                kline = spot_data["kline"][0]
                df = pd.DataFrame([{
                    "date": kline["日期"],
                    "open": kline["开盘"],
                    "close": kline["收盘"],
                    "high": kline["最高"],
                    "low": kline["最低"],
                    "volume": kline["成交量"],
                    "amount": kline["成交额"],
                    "pct_chg": kline["涨跌幅"],
                }])
                df["date"] = pd.to_datetime(df["date"])
                self.logger.info(f"✅ Fallback spot data returned (single day)")
                return df
        except Exception as e:
            self.logger.warning(f"[Fallback] ETF {code} failed: {e}")

        self.logger.error(f"❌ All sources failed for ETF {code}")
        return None

    async def get_etf_spot_data(self, code: str) -> Optional[Dict[str, Any]]:
        """
        获取ETF实时数据（多数据源）

        优先级: 预加载缓存 > AKShare实时 > Fallback
        """
        # 方案1: 使用预加载缓存
        if self._etf_cache and code in self._etf_cache:
            row = self._etf_cache[code]
            return {
                "code": code,
                "name": str(row.get("名称", "")),
                "price": float(row.get("最新价", 0)),
                "change_pct": float(row.get("涨跌幅", 0)),
                "volume": float(row.get("成交量", 0)),
                "amount": float(row.get("成交额", 0)),
                "source": "cache"
            }

        # 方案2: 实时查询
        try:
            spot_data = await self.fallback.get_etf_spot_data(code)
            if spot_data:
                kline = spot_data["kline"][0]
                return {
                    "code": code,
                    "name": spot_data["info"]["基金简称"],
                    "price": kline["收盘"],
                    "change_pct": kline["涨跌幅"],
                    "volume": kline["成交量"],
                    "amount": kline["成交额"],
                    "source": "realtime"
                }
        except Exception as e:
            self.logger.error(f"ETF spot data failed for {code}: {e}")

        return None

    async def get_index_data(self, code: str) -> Optional[Dict[str, Any]]:
        """
        获取指数数据（多数据源）

        优先级: 固定映射 > AKShare > 预加载缓存
        """
        # 统一代码格式
        normalized_code = code.replace("sh", "").replace("sz", "")

        # 方案1: 固定映射（最可靠）
        if code in self.INDEX_FIXED_MAPPING or normalized_code in self.INDEX_FIXED_MAPPING:
            mapping_key = code if code in self.INDEX_FIXED_MAPPING else normalized_code
            info = self.INDEX_FIXED_MAPPING[mapping_key]

            # 尝试获取实时价格更新固定映射
            try:
                df = await self.akshare.get_index_spot()
                if not df.empty:
                    matched = df[df["代码"].isin([code, normalized_code, f"sh{normalized_code}", f"sz{normalized_code}"])]
                    if not matched.empty:
                        row = matched.iloc[0]
                        return {
                            "code": code,
                            "name": info["name"],
                            "price": float(row.get("最新价", info["base_price"])),
                            "change_pct": float(row.get("涨跌幅", 0)),
                            "change": float(row.get("涨跌额", 0)),
                            "volume": float(row.get("成交量", 0)),
                            "source": "akshare_updated"
                        }
            except Exception as e:
                self.logger.warning(f"Failed to update index {code} from AKShare: {e}")

            # 使用固定映射的默认值
            return {
                "code": code,
                "name": info["name"],
                "price": info["base_price"],
                "change_pct": 0.0,
                "change": 0.0,
                "volume": 0,
                "source": "fixed_mapping"
            }

        # 方案2: AKShare实时数据
        try:
            df = await self.akshare.get_index_spot()
            if not df.empty:
                matched = df[df["代码"].isin([code, normalized_code, f"sh{normalized_code}", f"sz{normalized_code}"])]
                if not matched.empty:
                    row = matched.iloc[0]
                    return {
                        "code": code,
                        "name": str(row.get("名称", "")),
                        "price": float(row.get("最新价", 0)),
                        "change_pct": float(row.get("涨跌幅", 0)),
                        "change": float(row.get("涨跌额", 0)),
                        "volume": float(row.get("成交量", 0)),
                        "source": "akshare"
                    }
        except Exception as e:
            self.logger.warning(f"AKShare index {code} failed: {e}")

        # 方案3: 预加载缓存
        if self._index_cache and code in self._index_cache:
            row = self._index_cache[code]
            return {
                "code": code,
                "name": str(row.get("名称", "")),
                "price": float(row.get("最新价", 0)),
                "change_pct": float(row.get("涨跌幅", 0)),
                "change": 0.0,
                "volume": 0,
                "source": "cache"
            }

        self.logger.error(f"❌ All sources failed for index {code}")
        return None

    async def get_multiple_etf_data(
        self,
        codes: List[str],
        with_history: bool = False,
        period_days: int = 90
    ) -> List[Dict[str, Any]]:
        """
        批量获取ETF数据

        Args:
            codes: ETF代码列表
            with_history: 是否包含历史数据
            period_days: 历史周期（天）

        Returns:
            ETF数据列表
        """
        results = []

        for code in codes:
            try:
                # 获取基本信息
                spot = await self.get_etf_spot_data(code)
                if not spot:
                    continue

                etf_data = {
                    "code": code,
                    "name": spot["name"],
                    "current_price": spot["price"],
                    "change_pct": spot["change_pct"],
                    "volume": spot["volume"],
                    "amount": spot["amount"],
                    "source": spot["source"],
                }

                # 如果需要历史数据
                if with_history:
                    end_date = datetime.now().strftime("%Y%m%d")
                    start_date = (datetime.now() - timedelta(days=period_days)).strftime("%Y%m%d")

                    hist_df = await self.get_etf_hist_data(code, start_date, end_date)
                    if hist_df is not None and not hist_df.empty:
                        etf_data["history"] = hist_df.to_dict("records")
                        etf_data["history_days"] = len(hist_df)
                    else:
                        etf_data["history"] = []
                        etf_data["history_days"] = 0
                        etf_data["history_fallback"] = True

                results.append(etf_data)

            except Exception as e:
                self.logger.error(f"Failed to get ETF {code}: {e}")
                continue

        return results

    async def get_multiple_index_data(self, codes: List[str]) -> List[Dict[str, Any]]:
        """批量获取指数数据"""
        results = []

        for code in codes:
            try:
                data = await self.get_index_data(code)
                if data:
                    results.append(data)
            except Exception as e:
                self.logger.error(f"Failed to get index {code}: {e}")
                continue

        return results

    def get_cache_stats(self) -> Dict[str, Any]:
        """获取缓存统计信息"""
        return {
            "cache_loaded": self._cache_loaded,
            "etf_cache_size": len(self._etf_cache) if self._etf_cache else 0,
            "index_cache_size": len(self._index_cache) if self._index_cache else 0,
            "fixed_index_count": len(self.INDEX_FIXED_MAPPING),
        }
