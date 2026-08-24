"""
Multi-Source Data Provider - 多数据源智能提供者
实现中期解决方案：多数据源切换、启动预加载、固定指数映射

优先级策略：
1. ETF历史数据: Tushare > AKShare > 实时数据降级
2. ETF实时数据: AKShare > Sina
3. 指数数据: 固定映射 > AKShare > Sina
4. 指数历史数据: AKShare新浪财经 > AKShare东方财富 > 实时数据降级
"""
from typing import Optional, List, Dict, Any
import logging
import asyncio
import os
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
        self.etf_fetch_concurrency = max(1, int(os.getenv("MARKET_ETF_FETCH_CONCURRENCY", "6")))

        # 延迟导入避免循环依赖
        from providers.akshare_provider import AKShareProvider
        from providers.sina_provider import SinaProvider
        from providers.fallback_provider import FallbackProvider
        from providers.tushare_provider import TushareProvider

        self.tushare = TushareProvider()
        self.akshare = AKShareProvider()
        self.sina = SinaProvider()
        self.fallback = FallbackProvider()

        # 启动缓存
        self._etf_cache: Optional[Dict[str, Any]] = None
        self._index_cache: Optional[Dict[str, Any]] = None
        self._cache_loaded = False

    @staticmethod
    def _to_float(value: Any) -> Optional[float]:
        try:
            if value is None or value == "":
                return None
            return float(value)
        except (TypeError, ValueError):
            return None

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

        优先级: AKShare > Tushare > 实时数据降级
        """
        self.logger.info(f"🔍 Fetching history for ETF {code} ({start_date} to {end_date})")

        # 方案1: Tushare Promax（综合分析统一主数据源）
        if self.tushare.available:
            try:
                self.logger.info(f"[Tushare] Fetching ETF {code} history...")
                df = await self.tushare.get_etf_daily(code, start_date, end_date)
                if not df.empty:
                    date_column = '日期' if '日期' in df.columns else 'date' if 'date' in df.columns else 'trade_date' if 'trade_date' in df.columns else None
                    if date_column:
                        df = df.copy()
                        df[date_column] = pd.to_datetime(df[date_column], errors='coerce')
                        df = df.sort_values(date_column, ascending=True).reset_index(drop=True)
                    self.logger.info(f"✅ Tushare returned {len(df)} rows for {code}")
                    return df
            except Exception as e:
                self.logger.warning(f"⚠️ [Tushare] ETF {code} failed: {e}")

        # 方案2: AKShare（仅作为 Promax 不可用时的降级）
        try:
            self.logger.info(f"[AKShare] Fetching ETF {code} history...")
            df = await self.akshare.get_etf_daily(code, start_date, end_date)
            if not df.empty:
                date_column = '日期' if '日期' in df.columns else 'date' if 'date' in df.columns else None
                if date_column:
                    df = df.copy()
                    df[date_column] = pd.to_datetime(df[date_column], errors='coerce')
                    df = df.sort_values(date_column, ascending=True).reset_index(drop=True)
                self.logger.info(f"✅ AKShare returned {len(df)} rows for {code}")

                # 统一列名（新浪财经返回英文列名）
                if 'date' in df.columns and '日期' not in df.columns:
                    # 新浪财经格式，需要重命名
                    df = df.rename(columns={
                        'date': '日期',
                        'open': '开盘',
                        'close': '收盘',
                        'high': '最高',
                        'low': '最低',
                        'volume': '成交量',
                        'amount': '成交额'
                    })
                    # 计算涨跌幅（如果没有）
                    if '涨跌幅' not in df.columns and len(df) > 1:
                        df['涨跌幅'] = df['收盘'].pct_change() * 100
                        df['涨跌幅'] = df['涨跌幅'].fillna(0)

                return df
        except Exception as e:
            self.logger.warning(f"⚠️ [AKShare] ETF {code} failed: {e}")

        # 方案3: 降级到实时数据（单日）
        try:
            self.logger.warning(f"⚠️ [Fallback] Using spot data for ETF {code} (no history available)...")
            spot_data = await self.fallback.get_etf_spot_data(code)
            if spot_data and spot_data.get("kline"):
                # 转换为DataFrame格式
                kline = spot_data["kline"][0]
                df = pd.DataFrame([{
                    "日期": kline["日期"],
                    "开盘": kline["开盘"],
                    "收盘": kline["收盘"],
                    "最高": kline["最高"],
                    "最低": kline["最低"],
                    "成交量": kline["成交量"],
                    "成交额": kline["成交额"],
                    "涨跌幅": kline["涨跌幅"],
                }])
                df["日期"] = pd.to_datetime(df["日期"])
                self.logger.warning(f"⚠️ Fallback: only 1 day of data for {code}")
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
                "market_value": self._to_float(row.get("总市值")),
                "shares": self._to_float(row.get("最新份额")),
                "source": "cache"
            }

        # 方案2: Tushare Promax 实时查询
        if self.tushare.available:
            try:
                frame = await self.tushare.get_etf_realtime([code])
                if frame is not None and not frame.empty:
                    row = frame.iloc[0]
                    return {
                        "code": code,
                        "name": str(row.get("名称") or code),
                        "price": float(row.get("最新价", 0) or 0),
                        "change_pct": float(row.get("涨跌幅", 0) or 0),
                        "volume": float(row.get("成交量", 0) or 0),
                        "amount": float(row.get("成交额", 0) or 0),
                        "market_value": self._to_float(row.get("总市值")),
                        "shares": self._to_float(row.get("最新份额")),
                        "source": "tushare",
                    }
            except Exception as e:
                self.logger.warning(f"[Tushare] ETF spot data failed for {code}: {e}")

        # 方案3: 其他实时查询降级
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
                    "market_value": self._to_float(spot_data.get("info", {}).get("总市值")),
                    "shares": self._to_float(spot_data.get("info", {}).get("最新份额")),
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
        semaphore = asyncio.Semaphore(self.etf_fetch_concurrency)
        end_date = datetime.now().strftime("%Y%m%d")
        start_date = (datetime.now() - timedelta(days=period_days)).strftime("%Y%m%d")

        async def fetch_one(code: str) -> Optional[Dict[str, Any]]:
            async with semaphore:
                try:
                    spot = await self.get_etf_spot_data(code)
                    if not spot:
                        self.logger.warning("ETF %s 未获取到实时数据", code)
                        return None

                    etf_data = {
                        "code": code,
                        "name": spot["name"],
                        "current_price": spot["price"],
                        "change_pct": spot["change_pct"],
                        "volume": spot["volume"],
                        "amount": spot["amount"],
                        "market_value": spot.get("market_value"),
                        "shares": spot.get("shares"),
                        "source": spot["source"],
                    }

                    if with_history:
                        hist_df = await self.get_etf_hist_data(code, start_date, end_date)
                        if hist_df is not None and not hist_df.empty:
                            etf_data["history"] = hist_df.to_dict("records")
                            etf_data["history_days"] = len(hist_df)
                        else:
                            etf_data["history"] = []
                            etf_data["history_days"] = 0
                            etf_data["history_fallback"] = True
                    return etf_data
                except Exception as error:
                    self.logger.error("Failed to get ETF %s: %s", code, error)
                    return None

        results = await asyncio.gather(*(fetch_one(code) for code in dict.fromkeys(codes)))
        return [result for result in results if result is not None]

    async def get_index_history(
        self,
        code: str,
        start_date: str,
        end_date: str
    ) -> Optional[Dict[str, Any]]:
        """
        获取指数历史数据（多数据源）

        优先级: Tushare Promax > AKShare > 单点降级

        Args:
            code: 指数代码（如 000688, 399006, 399303, 931079）
            start_date: 开始日期 YYYYMMDD
            end_date: 结束日期 YYYYMMDD

        Returns:
            {
                "code": "000688",
                "name": "科创50",
                "history": [{"日期": "2026-05-01", "开盘": 1000, ...}],
                "source": "akshare_index_daily"
            }
        """
        self.logger.info(f"🔍 Fetching history for index {code} ({start_date} to {end_date})")

        # 统一代码格式
        normalized_code = code.replace("sh", "").replace("sz", "")

        # 获取指数名称（从固定映射）
        index_name = None
        if code in self.INDEX_FIXED_MAPPING:
            index_name = self.INDEX_FIXED_MAPPING[code]["name"]
        elif normalized_code in self.INDEX_FIXED_MAPPING:
            index_name = self.INDEX_FIXED_MAPPING[normalized_code]["name"]

        # 方案1: Tushare Promax index_daily（综合分析主数据源）
        if self.tushare.available:
            try:
                ts_code = self.tushare._to_ts_code(
                    normalized_code,
                    default_market='SZ' if normalized_code.startswith(('3', '399')) else 'SH',
                )
                df = await self.tushare.get_index_daily(ts_code, start_date, end_date)
                if not df.empty:
                    history = []
                    for _, row in df.iterrows():
                        history.append({
                            "日期": str(row.get("date", "")),
                            "开盘": float(row.get("open", 0) or 0),
                            "收盘": float(row.get("close", 0) or 0),
                            "最高": float(row.get("high", 0) or 0),
                            "最低": float(row.get("low", 0) or 0),
                            "成交量": float(row.get("volume", 0) or 0),
                            "涨跌幅": float(row.get("pct_chg", 0) or 0),
                        })
                    return {
                        "code": code,
                        "name": index_name or code,
                        "history": history,
                        "source": "tushare_index_daily",
                        "data_points": len(history),
                    }
            except Exception as e:
                self.logger.warning(f"⚠️ [Tushare index_daily] Index {code} failed: {e}")

        # 方案2: AKShare stock_zh_index_daily（仅作降级）
        try:
            # 转换代码格式：添加市场前缀
            sina_code = self._normalize_index_code(code)
            self.logger.info(f"[AKShare] Trying stock_zh_index_daily for {sina_code}...")

            df = await self.akshare.get_index_daily(sina_code, start_date, end_date)

            if not df.empty:
                self.logger.info(f"✅ AKShare returned {len(df)} rows for index {code}")

                # 转换为标准格式
                history = []
                for _, row in df.iterrows():
                    # 计算涨跌幅
                    if len(history) > 0:
                        prev_close = history[-1]["收盘"]
                        pct_chg = ((float(row.get("close", 0)) - prev_close) / prev_close * 100) if prev_close > 0 else 0
                    else:
                        pct_chg = 0

                    history.append({
                        "日期": str(row.get("date", "")),
                        "开盘": float(row.get("open", 0)),
                        "收盘": float(row.get("close", 0)),
                        "最高": float(row.get("high", 0)),
                        "最低": float(row.get("low", 0)),
                        "成交量": float(row.get("volume", 0)),
                        "涨跌幅": round(pct_chg, 2)
                    })

                return {
                    "code": code,
                    "name": index_name or code,
                    "history": history,
                    "source": "akshare_index_daily",
                    "data_points": len(history)
                }

        except Exception as e:
            self.logger.warning(f"⚠️ [AKShare stock_zh_index_daily] Index {code} failed: {e}")

        # 方案3: AKShare index_zh_a_hist（东方财富，支持更多指数）
        try:
            import akshare as ak
            self.logger.info(f"[AKShare] Trying index_zh_a_hist for {normalized_code}...")

            df = await self.akshare._call(
                ak.index_zh_a_hist,
                symbol=normalized_code,
                period='daily',
                start_date=start_date,
                end_date=end_date,
                timeout=15.0
            )

            if not df.empty:
                self.logger.info(f"✅ AKShare index_zh_a_hist returned {len(df)} rows for {code}")

                # 转换为标准格式
                history = []
                for _, row in df.iterrows():
                    history.append({
                        "日期": str(row.get("日期", "")),
                        "开盘": float(row.get("开盘", 0)),
                        "收盘": float(row.get("收盘", 0)),
                        "最高": float(row.get("最高", 0)),
                        "最低": float(row.get("最低", 0)),
                        "成交量": float(row.get("成交量", 0)),
                        "涨跌幅": float(row.get("涨跌幅", 0))
                    })

                return {
                    "code": code,
                    "name": index_name or code,
                    "history": history,
                    "source": "akshare_index_zh_a_hist",
                    "data_points": len(history)
                }

        except Exception as e:
            self.logger.warning(f"⚠️ [AKShare index_zh_a_hist] Index {code} failed: {e}")

        # 方案4: 降级到实时数据（单日）
        try:
            self.logger.warning(f"⚠️ [Fallback] Using spot data for index {code} (no history available)...")
            spot_data = await self.get_index_data(code)
            if spot_data:
                # 构造单日历史数据
                history = [{
                    "日期": datetime.now().strftime("%Y-%m-%d"),
                    "开盘": spot_data["price"],
                    "收盘": spot_data["price"],
                    "最高": spot_data["price"],
                    "最低": spot_data["price"],
                    "成交量": spot_data.get("volume", 0),
                    "涨跌幅": spot_data["change_pct"]
                }]

                self.logger.warning(f"⚠️ Fallback: only 1 day of data for index {code}")
                return {
                    "code": code,
                    "name": spot_data["name"],
                    "history": history,
                    "source": "fallback_spot",
                    "data_points": 1
                }
        except Exception as e:
            self.logger.warning(f"[Fallback] Index {code} failed: {e}")

        self.logger.error(f"❌ All sources failed for index {code}")
        return None

    def _normalize_index_code(self, code: str) -> str:
        """
        统一指数代码格式为新浪财经格式（sh/sz前缀）

        规则：
        - 上证指数（000开头）: sh + code
        - 深证指数（399开头）: sz + code
        - 中证指数（930/931开头）: 保持原样
        - 已有前缀：保持不变
        """
        # 移除现有前缀
        pure_code = code.replace("sh", "").replace("sz", "")

        # 如果已经有前缀，保持不变
        if code.startswith("sh") or code.startswith("sz"):
            return code

        # 添加市场前缀
        if pure_code.startswith("000"):
            return f"sh{pure_code}"
        elif pure_code.startswith("399"):
            return f"sz{pure_code}"
        elif pure_code.startswith("930") or pure_code.startswith("931"):
            # 中证指数，尝试不同格式
            return f"sh{pure_code}"  # 优先尝试上海
        else:
            return code

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
