# AKShare数据客户端封装
# 多源降级 + 持久缓存策略：
# 1. 优先调用东方财富接口（数据最全）
# 2. 限流时降级到替代接口
# 3. 所有接口都失败时，返回缓存的上一个交易日数据

import akshare as ak
import pandas as pd
import time
import json
import os
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

# 缓存文件目录
CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".cache")
os.makedirs(CACHE_DIR, exist_ok=True)


class AKShareClient:
    """AKShare数据客户端，多源降级 + 持久缓存"""

    def __init__(self):
        self._memory_cache: Dict[str, Any] = {}
        self._memory_cache_ttl: Dict[str, datetime] = {}

    # ==================== 缓存管理 ====================

    def _get_memory_cache(self, key: str) -> Optional[Any]:
        """内存缓存（短期）"""
        if key in self._memory_cache:
            if datetime.now() < self._memory_cache_ttl.get(key, datetime.min):
                return self._memory_cache[key]
        return None

    def _set_memory_cache(self, key: str, data: Any, ttl_seconds: int):
        """设置内存缓存"""
        self._memory_cache[key] = data
        self._memory_cache_ttl[key] = datetime.now() + timedelta(seconds=ttl_seconds)

    def _get_file_cache(self, key: str) -> Optional[Any]:
        """文件缓存（长期，跨进程重启）"""
        path = os.path.join(CACHE_DIR, f"{key}.json")
        if os.path.exists(path):
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception:
                pass
        return None

    def _set_file_cache(self, key: str, data: Any):
        """写入文件缓存"""
        path = os.path.join(CACHE_DIR, f"{key}.json")
        try:
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False)
        except Exception as e:
            print(f"写入文件缓存失败: {e}")

    def _get(self, key: str) -> Optional[Any]:
        """读取缓存：先内存，再文件"""
        cached = self._get_memory_cache(key)
        if cached is not None:
            return cached
        cached = self._get_file_cache(key)
        if cached is not None:
            # 回填内存缓存
            self._set_memory_cache(key, cached, ttl_seconds=600)
            return cached
        return None

    def _set(self, key: str, data: Any, memory_ttl: int = 600):
        """写入缓存：内存 + 文件"""
        self._set_memory_cache(key, data, ttl_seconds=memory_ttl)
        self._set_file_cache(key, data)

    def _retry_call(self, func, *args, retries: int = 2, delay: float = 2.0, **kwargs):
        """带重试的AKShare调用"""
        for attempt in range(retries):
            try:
                return func(*args, **kwargs)
            except Exception as e:
                if attempt < retries - 1:
                    time.sleep(delay * (attempt + 1))
                else:
                    raise e

    # ==================== 实时行情 ====================

    def get_index_spot(self) -> pd.DataFrame:
        """获取指数实时行情快照（东方财富）

        Returns:
            DataFrame with columns: 代码, 名称, 最新价, 涨跌额, 涨跌幅, 成交量, 成交额, etc.
        """
        cache_key = "index_spot"
        cached = self._get_memory_cache(cache_key)
        if cached is not None:
            return cached

        try:
            df = self._retry_call(ak.stock_zh_index_spot_em)
            if not df.empty:
                self._set_memory_cache(cache_key, df, ttl_seconds=30)
            return df
        except Exception as e:
            print(f"获取指数实时行情快照失败: {e}")
            return pd.DataFrame()

    def get_stock_spot(self, symbols: List[str]) -> pd.DataFrame:
        """获取个股实时行情快照

        Args:
            symbols: 股票代码列表，如 ["000001", "600519"]
        """
        try:
            df = self._retry_call(ak.stock_zh_a_spot_em)
            if not df.empty:
                df = df[df['代码'].isin(symbols)]
            return df
        except Exception as e:
            print(f"获取个股实时行情失败: {e}")
            return pd.DataFrame()

    # ==================== 行情数据 ====================

    def get_stock_daily(self, ticker: str, start_date: str, end_date: str, adjust: str = "qfq") -> pd.DataFrame:
        """获取个股日K数据"""
        try:
            return self._retry_call(
                ak.stock_zh_a_hist,
                symbol=ticker, period="daily",
                start_date=start_date, end_date=end_date, adjust=adjust
            )
        except Exception as e:
            print(f"获取个股数据失败 {ticker}: {e}")
            return pd.DataFrame()

    def get_index_daily(self, code: str, start_date: str, end_date: str) -> pd.DataFrame:
        """获取指数日K数据（带缓存）"""
        cache_key = f"index_daily_{code}"
        cached = self._get(cache_key)
        if cached is not None:
            return pd.DataFrame(cached)

        try:
            df = self._retry_call(ak.stock_zh_index_daily, symbol=code)
            if not df.empty:
                df['date'] = pd.to_datetime(df['date'])
                df = df[(df['date'] >= start_date) & (df['date'] <= end_date)]
                self._set(cache_key, df.to_dict('records'), memory_ttl=300)
            return df
        except Exception as e:
            print(f"获取指数数据失败 {code}: {e}")
            return pd.DataFrame()

    def get_index_realtime(self, symbols: List[str]) -> pd.DataFrame:
        """获取指数实时行情"""
        try:
            df = self._retry_call(ak.stock_zh_index_spot_em)
            if not df.empty:
                df = df[df['代码'].isin(symbols)]
            return df
        except Exception as e:
            print(f"获取指数实时行情失败: {e}")
            return pd.DataFrame()

    # ==================== ETF数据 ====================

    def get_etf_daily(self, ticker: str, start_date: str, end_date: str) -> pd.DataFrame:
        """获取ETF日K数据"""
        try:
            return self._retry_call(
                ak.fund_etf_hist_em,
                symbol=ticker, period="daily",
                start_date=start_date, end_date=end_date, adjust="qfq"
            )
        except Exception as e:
            print(f"获取ETF数据失败 {ticker}: {e}")
            return pd.DataFrame()

    def get_etf_realtime(self, symbols: List[str]) -> pd.DataFrame:
        """获取ETF实时行情"""
        try:
            df = self._retry_call(ak.fund_etf_spot_em)
            if not df.empty:
                df = df[df['代码'].isin(symbols)]
            return df
        except Exception as e:
            print(f"获取ETF实时行情失败: {e}")
            return pd.DataFrame()

    def get_etf_nav(self, ticker: str) -> Dict:
        """获取ETF净值和份额"""
        try:
            df = self._retry_call(ak.fund_etf_fund_info_em, fund=ticker)
            if not df.empty:
                return df.to_dict('records')[0]
            return {}
        except Exception as e:
            print(f"获取ETF净值失败 {ticker}: {e}")
            return {}

    # ==================== 资金流向（多源降级） ====================

    def get_market_capital_flow(self) -> Dict:
        """获取大盘资金流向

        降级策略：
        1. 东方财富 stock_market_fund_flow()（大盘资金流向，含主力/散户分单）
        2. 东方财富 stock_fund_flow_industry()（行业资金流向汇总，基于行业数据估算）
        3. 返回缓存数据
        """
        cache_key = "market_capital_flow"

        # 优先尝试大盘资金流向接口（有真实的主力/散户分单数据）
        try:
            df = self._retry_call(ak.stock_market_fund_flow)
            if not df.empty:
                latest = df.iloc[-1]
                main_net = float(latest.get("主力净流入-净额", 0))
                main_pct = float(latest.get("主力净流入-净占比", 0))
                mid_net = float(latest.get("中单净流入-净额", 0))
                small_net = float(latest.get("小单净流入-净额", 0))

                data = {
                    "主力净流入-净额": main_net,
                    "主力净流入-净占比": main_pct,
                    "中单净流入-净额": mid_net,
                    "小单净流入-净额": small_net,
                    "日期": str(latest.get("日期", datetime.now().strftime("%Y-%m-%d"))),
                    "source": "market_fund_flow",
                }
                self._set(cache_key, data, memory_ttl=600)
                return data
        except Exception as e:
            print(f"大盘资金流向接口失败，尝试降级: {e}")

        # 降级：行业资金流向汇总（改进估算逻辑）
        try:
            df = self._retry_call(ak.stock_fund_flow_industry)
            if not df.empty:
                total_inflow = df['流入资金'].astype(float).sum()
                total_outflow = df['流出资金'].astype(float).sum()
                total_net = df['净额'].astype(float).sum()

                # 主力净流入 ≈ 行业净额总和
                main_net = total_net * 1e8  # 亿→元

                # 改进估算：基于行业数据的流入/流出比例推算散户
                # 散户资金通常占市场成交的30-40%，且方向与主力相反
                # 使用行业流入流出比来动态估算散户占比
                if total_inflow > 0:
                    # 散户占比基于市场活跃度动态调整（20%-40%）
                    retail_ratio = min(0.4, max(0.2, 1 - (total_net / total_inflow)))
                else:
                    retail_ratio = 0.3

                retail_net = -main_net * retail_ratio
                mid_part = retail_net * 0.6
                small_part = retail_net * 0.4

                data = {
                    "主力净流入-净额": main_net,
                    "主力净流入-净占比": round(total_net / (total_inflow + total_outflow) * 100, 2) if (total_inflow + total_outflow) > 0 else 0,
                    "中单净流入-净额": mid_part,
                    "小单净流入-净额": small_part,
                    "日期": datetime.now().strftime("%Y-%m-%d"),
                    "source": "fund_flow_industry",
                }
                self._set(cache_key, data, memory_ttl=600)
                return data
        except Exception as e:
            print(f"行业资金流向汇总也失败: {e}")

        # 降级：返回缓存
        cached = self._get(cache_key)
        if cached:
            print("使用缓存的大盘资金流向数据")
            return cached

        return {}

    def get_sector_capital_flow(self, indicator: str = "今日") -> List[Dict]:
        """获取板块资金流向

        降级策略：
        1. 东方财富 stock_fund_flow_industry()（行业资金流向）
        2. 东方财富 stock_fund_flow_concept()（概念资金流向）
        3. 返回缓存数据
        """
        cache_key = f"sector_capital_flow_{indicator}"

        # 尝试东方财富行业资金流向接口
        try:
            df = self._retry_call(ak.stock_fund_flow_industry)
            if not df.empty:
                data = df.head(50).to_dict('records')
                # 统一字段名，兼容旧格式
                for item in data:
                    item['名称'] = item.get('行业', '')
                    item['今日主力净流入-净额'] = float(item.get('净额', 0)) * 1e8  # 亿→元
                    item['今日涨跌幅'] = float(item.get('行业-涨跌幅', 0))
                self._set(cache_key, data, memory_ttl=600)
                return data
        except Exception as e:
            print(f"行业资金流向失败: {e}")

        # 降级：尝试概念资金流向
        try:
            df = self._retry_call(ak.stock_fund_flow_concept)
            if not df.empty:
                data = df.head(50).to_dict('records')
                for item in data:
                    item['名称'] = item.get('行业', '')
                    item['今日主力净流入-净额'] = float(item.get('净额', 0)) * 1e8
                    item['今日涨跌幅'] = float(item.get('行业-涨跌幅', 0))
                self._set(cache_key, data, memory_ttl=600)
                return data
        except Exception as e:
            print(f"概念资金流向也失败: {e}")

        # 降级：返回缓存
        cached = self._get(cache_key)
        if cached:
            print("使用缓存的板块资金流向数据")
            return cached

        return []

    def get_northbound_flow(self) -> Dict:
        """获取北向资金流向

        降级策略：
        1. 东方财富 stock_hsgt_fund_flow_summary_em()
        2. 返回缓存数据
        """
        cache_key = "northbound_flow"

        # 尝试东方财富接口
        try:
            df = self._retry_call(ak.stock_hsgt_fund_flow_summary_em)
            if not df.empty:
                # 从汇总数据中提取北向资金
                northbound = df[df['资金方向'] == '北向']
                if not northbound.empty:
                    total_net = northbound['成交净买额'].sum()
                    data = {
                        "date": str(northbound.iloc[0].get('交易日', datetime.now().strftime("%Y-%m-%d"))),
                        "value": float(total_net) * 100000000 if pd.notna(total_net) else 0,
                        "source": "hsgt_summary"
                    }
                    self._set(cache_key, data, memory_ttl=600)
                    return data
        except Exception as e:
            print(f"北向资金汇总接口失败: {e}")

        # 降级：返回缓存
        cached = self._get(cache_key)
        if cached:
            print("使用缓存的北向资金数据")
            return cached

        return {}

    def get_northbound_flow_history(self, days: int = 30) -> List[Dict]:
        """获取北向资金历史数据"""
        cache_key = f"northbound_history_{days}"

        try:
            df = self._retry_call(ak.stock_hsgt_hist_em, symbol="沪股通")
            if not df.empty:
                records = df.tail(days).to_dict('records')
                self._set(cache_key, records, memory_ttl=600)
                return records
        except Exception as e:
            print(f"北向资金历史失败: {e}")

        cached = self._get(cache_key)
        if cached:
            return cached

        return []

    # ==================== 个股资金流向 ====================

    def get_stock_capital_flow(self, ticker: str) -> Dict:
        """获取个股资金流向"""
        try:
            df = self._retry_call(
                ak.stock_individual_fund_flow,
                stock=ticker, market="sh" if ticker.startswith("6") else "sz"
            )
            if not df.empty:
                return df.iloc[-1].to_dict()
            return {}
        except Exception as e:
            print(f"获取个股资金流向失败 {ticker}: {e}")
            return {}

    # ==================== 融资融券 ====================

    def get_margin_data(self) -> Dict:
        """获取融资融券数据"""
        try:
            df = self._retry_call(
                ak.stock_margin_sse,
                start_date=(datetime.now() - timedelta(days=30)).strftime("%Y%m%d")
            )
            if not df.empty:
                return df.iloc[-1].to_dict()
            return {}
        except Exception as e:
            print(f"获取融资融券数据失败: {e}")
            return {}


# 全局单例
client = AKShareClient()
