# Tushare Pro 数据提供者
# 通过 Tushare Pro API 获取 A 股数据
# 需要配置 TUSHARE_TOKEN 环境变量

import asyncio
import os
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import pandas as pd

from providers.base import DataProvider


class TushareProvider(DataProvider):
    """Tushare Pro 数据提供者

    需要 TUSHARE_TOKEN 环境变量。
    基础行情接口（120积分）可免费使用，
    资金流向/北向资金（2000+积分）需要付费升级。
    """

    name = "tushare"

    def __init__(self, token: Optional[str] = None):
        self._token = token or os.getenv("TUSHARE_TOKEN", "")
        self._pro = None
        if self._token:
            try:
                import tushare as ts
                ts.set_token(self._token)
                self._pro = ts.pro_api()
                print(f"[Tushare] 初始化成功")
            except ImportError:
                print("[Tushare] tushare 未安装，请 pip install tushare")
            except Exception as e:
                print(f"[Tushare] 初始化失败: {e}")
        else:
            print("[Tushare] 未配置 TUSHARE_TOKEN，Tushare 数据源不可用")

    @property
    def available(self) -> bool:
        """是否可用"""
        return self._pro is not None

    async def _call(self, func, *args, **kwargs) -> Any:
        """在线程池中调用同步的 Tushare 函数"""
        def _sync():
            return func(*args, **kwargs)
        return await asyncio.to_thread(_sync)

    def _check_available(self):
        """检查是否可用，不可用则抛出异常"""
        if not self.available:
            raise RuntimeError("Tushare 未初始化，请配置 TUSHARE_TOKEN")

    # ==================== 指数数据 ====================

    async def get_index_spot(self) -> pd.DataFrame:
        """获取指数实时行情快照

        Tushare 没有直接的指数实时快照接口，
        通过 index_daily 获取最新交易日数据模拟。
        """
        self._check_available()

        # 主要指数代码
        index_codes = [
            "000001.SH",  # 上证指数
            "399001.SZ",  # 深证成指
            "399006.SZ",  # 创业板指
            "000688.SH",  # 科创50
            "000300.SH",  # 沪深300
        ]

        today = datetime.now().strftime("%Y%m%d")
        # 往前多取几天以确保有数据（非交易日）
        start = (datetime.now() - timedelta(days=10)).strftime("%Y%m%d")

        records = []
        for code in index_codes:
            try:
                df = await self._call(
                    self._pro.index_daily,
                    ts_code=code, start_date=start, end_date=today,
                )
                if not df.empty:
                    latest = df.iloc[0]  # Tushare 返回按日期降序
                    # 提取纯代码（去掉 .SH/.SZ 后缀）
                    pure_code = code.split(".")[0]
                    market = code.split(".")[1]
                    # 映射为 AKShare 兼容格式
                    if market == "SH":
                        ak_code = f"sh{pure_code}"
                    else:
                        ak_code = f"sz{pure_code}"

                    records.append({
                        "代码": ak_code,
                        "名称": self._get_index_name(code),
                        "最新价": float(latest.get("close", 0)),
                        "涨跌额": float(latest.get("change", 0)),
                        "涨跌幅": float(latest.get("pct_chg", 0)),
                        "成交量": float(latest.get("vol", 0)),
                        "成交额": float(latest.get("amount", 0)),
                        "今开": float(latest.get("open", 0)),
                        "最高": float(latest.get("high", 0)),
                        "最低": float(latest.get("low", 0)),
                        "昨收": float(latest.get("pre_close", 0)),
                    })
            except Exception as e:
                print(f"[Tushare] 获取指数 {code} 失败: {e}")
                continue

        return pd.DataFrame(records) if records else pd.DataFrame()

    async def get_index_daily(self, code: str, start_date: str, end_date: str) -> pd.DataFrame:
        """获取指数日K数据

        Args:
            code: 指数代码，如 "sh000001"，会转换为 Tushare 格式 "000001.SH"
        """
        self._check_available()
        ts_code = self._to_ts_code(code)

        df = await self._call(
            self._pro.index_daily,
            ts_code=ts_code, start_date=start_date, end_date=end_date,
        )

        if not df.empty:
            # 统一列名为 AKShare 兼容格式
            df = df.rename(columns={
                "trade_date": "date",
                "open": "open",
                "high": "high",
                "low": "low",
                "close": "close",
                "vol": "volume",
                "amount": "amount",
            })
            df["date"] = pd.to_datetime(df["date"])
            df = df.sort_values("date").reset_index(drop=True)

        return df

    async def get_index_realtime(self, symbols: List[str]) -> pd.DataFrame:
        """获取指定指数实时行情"""
        # 复用 get_index_spot 后筛选
        df = await self.get_index_spot()
        if not df.empty:
            df = df[df["代码"].isin(symbols)]
        return df

    # ==================== 个股数据 ====================

    async def get_stock_spot(self, symbols: List[str]) -> pd.DataFrame:
        """获取个股实时行情快照

        通过 daily 获取最新交易日数据模拟实时行情。
        """
        self._check_available()

        today = datetime.now().strftime("%Y%m%d")
        start = (datetime.now() - timedelta(days=10)).strftime("%Y%m%d")

        records = []
        for symbol in symbols:
            try:
                ts_code = self._to_ts_code(symbol, default_market="SZ" if symbol.startswith(("0", "3")) else "SH")
                df = await self._call(
                    self._pro.daily,
                    ts_code=ts_code, start_date=start, end_date=today,
                )
                if not df.empty:
                    latest = df.iloc[0]
                    records.append({
                        "代码": symbol,
                        "名称": "",
                        "最新价": float(latest.get("close", 0)),
                        "涨跌额": float(latest.get("change", 0)),
                        "涨跌幅": float(latest.get("pct_chg", 0)),
                        "成交量": float(latest.get("vol", 0)),
                        "成交额": float(latest.get("amount", 0)),
                    })
            except Exception as e:
                print(f"[Tushare] 获取个股 {symbol} 失败: {e}")
                continue

        return pd.DataFrame(records) if records else pd.DataFrame()

    async def get_stock_daily(self, ticker: str, start_date: str, end_date: str,
                               adjust: str = "qfq") -> pd.DataFrame:
        """获取个股日K数据"""
        self._check_available()

        ts_code = self._to_ts_code(ticker, default_market="SZ" if ticker.startswith(("0", "3")) else "SH")

        # Tushare 的复权参数
        adj_map = {"qfq": "qfq", "hfq": "hfq", "": None}
        adj = adj_map.get(adjust)

        df = await self._call(
            self._pro.daily,
            ts_code=ts_code, start_date=start_date, end_date=end_date,
        )

        if not df.empty:
            df = df.rename(columns={"trade_date": "date"})
            df["date"] = pd.to_datetime(df["date"])
            df = df.sort_values("date").reset_index(drop=True)

        return df

    # ==================== ETF 数据 ====================

    async def get_etf_realtime(self, symbols: List[str]) -> pd.DataFrame:
        """获取ETF实时行情

        通过 fund_daily 获取最新数据模拟。
        """
        self._check_available()

        today = datetime.now().strftime("%Y%m%d")
        start = (datetime.now() - timedelta(days=10)).strftime("%Y%m%d")

        records = []
        for symbol in symbols:
            try:
                # ETF 代码格式：510300.SH / 159919.SZ
                ts_code = self._to_ts_code(symbol, default_market="SH" if symbol.startswith("5") else "SZ")
                df = await self._call(
                    self._pro.fund_daily,
                    ts_code=ts_code, start_date=start, end_date=today,
                )
                if not df.empty:
                    latest = df.iloc[0]
                    records.append({
                        "代码": symbol,
                        "名称": "",
                        "最新价": float(latest.get("close", 0)),
                        "涨跌幅": float(latest.get("pct_chg", 0)),
                        "成交量": float(latest.get("vol", 0)),
                        "成交额": float(latest.get("amount", 0)),
                    })
            except Exception as e:
                print(f"[Tushare] 获取 ETF {symbol} 失败: {e}")
                continue

        return pd.DataFrame(records) if records else pd.DataFrame()

    async def get_etf_daily(self, ticker: str, start_date: str, end_date: str) -> pd.DataFrame:
        """获取ETF日K数据"""
        self._check_available()

        ts_code = self._to_ts_code(ticker, default_market="SH" if ticker.startswith("5") else "SZ")

        df = await self._call(
            self._pro.fund_daily,
            ts_code=ts_code, start_date=start_date, end_date=end_date,
        )

        if not df.empty:
            df = df.rename(columns={"trade_date": "date"})
            df["date"] = pd.to_datetime(df["date"])
            df = df.sort_values("date").reset_index(drop=True)

        return df

    # ==================== 资金流向 ====================

    async def get_market_capital_flow(self) -> Dict:
        """获取大盘资金流向

        Tushare moneyflow_market_dtl 接口需要 2000+ 积分。
        """
        self._check_available()

        today = datetime.now().strftime("%Y%m%d")
        start = (datetime.now() - timedelta(days=10)).strftime("%Y%m%d")

        df = await self._call(
            self._pro.moneyflow_market_dtl,
            start_date=start, end_date=today,
        )

        if not df.empty:
            latest = df.iloc[0]  # 按日期降序
            return {
                "主力净流入-净额": float(latest.get("buy_elg_amount", 0)) - float(latest.get("sell_elg_amount", 0)),
                "主力净流入-净占比": 0.0,  # Tushare 不直接提供占比
                "中单净流入-净额": float(latest.get("buy_md_amount", 0)) - float(latest.get("sell_md_amount", 0)),
                "小单净流入-净额": float(latest.get("buy_sm_amount", 0)) - float(latest.get("sell_sm_amount", 0)),
                "日期": str(latest.get("trade_date", today)),
                "source": "tushare_moneyflow",
            }

        raise Exception("Tushare 大盘资金流向数据为空")

    async def get_sector_capital_flow(self, indicator: str = "今日") -> List[Dict]:
        """获取板块资金流向

        Tushare 没有直接的板块资金流向接口，抛出 NotImplemented。
        """
        raise NotImplementedError("Tushare 不支持板块资金流向数据")

    async def get_northbound_flow(self) -> Dict:
        """获取北向资金流向

        Tushare moneyflow_hsgt 接口需要 2000+ 积分。
        """
        self._check_available()

        today = datetime.now().strftime("%Y%m%d")
        start = (datetime.now() - timedelta(days=10)).strftime("%Y%m%d")

        df = await self._call(
            self._pro.moneyflow_hsgt,
            start_date=start, end_date=today,
        )

        if not df.empty:
            latest = df.iloc[0]
            north_money = float(latest.get("north_money", 0))  # 北向资金（万元）
            sh_money = float(latest.get("sh_money", 0))  # 沪股通（万元）
            sz_money = float(latest.get("sz_money", 0))  # 深股通（万元）

            return {
                "date": str(latest.get("trade_date", today)),
                "value": north_money / 10000,  # 万元 → 亿元
                "shConnect": sh_money / 10000,
                "szConnect": sz_money / 10000,
                "source": "tushare_hsgt",
                "unit": "亿元",
            }

        raise Exception("Tushare 北向资金数据为空")

    async def get_northbound_flow_history(self, days: int = 30) -> List[Dict]:
        """获取北向资金历史数据"""
        self._check_available()

        end = datetime.now().strftime("%Y%m%d")
        start = (datetime.now() - timedelta(days=days + 10)).strftime("%Y%m%d")

        df = await self._call(
            self._pro.moneyflow_hsgt,
            start_date=start, end_date=end,
        )

        if df.empty:
            raise Exception("Tushare 北向资金历史数据为空")

        df = df.sort_values("trade_date").tail(days)
        records = []
        for _, row in df.iterrows():
            north_money = float(row.get("north_money", 0))
            if north_money != 0:
                records.append({
                    "date": str(row["trade_date"]),
                    "value": north_money / 10000,
                    "shConnect": float(row.get("sh_money", 0)) / 10000,
                    "szConnect": float(row.get("sz_money", 0)) / 10000,
                })

        if not records:
            raise Exception("Tushare 北向资金历史数据为空")
        return records

    async def get_stock_capital_flow(self, ticker: str) -> Dict:
        """获取个股资金流向"""
        self._check_available()

        ts_code = self._to_ts_code(ticker, default_market="SZ" if ticker.startswith(("0", "3")) else "SH")
        today = datetime.now().strftime("%Y%m%d")
        start = (datetime.now() - timedelta(days=10)).strftime("%Y%m%d")

        df = await self._call(
            self._pro.moneyflow,
            ts_code=ts_code, start_date=start, end_date=today,
        )

        if not df.empty:
            latest = df.iloc[0]
            return {
                "主力净流入": float(latest.get("buy_elg_amount", 0)) - float(latest.get("sell_elg_amount", 0)),
                "超大单净流入": float(latest.get("buy_elg_amount", 0)) - float(latest.get("sell_elg_amount", 0)),
                "大单净流入": float(latest.get("buy_lg_amount", 0)) - float(latest.get("sell_lg_amount", 0)),
                "中单净流入": float(latest.get("buy_md_amount", 0)) - float(latest.get("sell_md_amount", 0)),
                "小单净流入": float(latest.get("buy_sm_amount", 0)) - float(latest.get("sell_sm_amount", 0)),
                "日期": str(latest.get("trade_date", today)),
                "source": "tushare",
            }

        raise Exception(f"Tushare 个股资金流向为空: {ticker}")

    async def get_margin_data(self) -> Dict:
        """获取融资融券数据"""
        self._check_available()

        today = datetime.now().strftime("%Y%m%d")
        start = (datetime.now() - timedelta(days=30)).strftime("%Y%m%d")

        df = await self._call(
            self._pro.margin_detail,
            start_date=start, end_date=today,
        )

        if not df.empty:
            # 按日期汇总
            latest_date = df["trade_date"].max()
            day_data = df[df["trade_date"] == latest_date]

            return {
                "date": str(latest_date),
                "rzye": float(day_data["rzye"].sum()) if "rzye" in day_data.columns else 0,
                "rzmre": float(day_data["rzmre"].sum()) if "rzmre" in day_data.columns else 0,
                "rzche": float(day_data["rzche"].sum()) if "rzche" in day_data.columns else 0,
                "rqye": float(day_data["rqye"].sum()) if "rqye" in day_data.columns else 0,
                "rqmcl": float(day_data["rqmcl"].sum()) if "rqmcl" in day_data.columns else 0,
                "rzrqye": float(day_data["rzrqye"].sum()) if "rzrqye" in day_data.columns else 0,
                "source": "tushare",
            }

        raise Exception("Tushare 融资融券数据为空")

    # ==================== 工具方法 ====================

    @staticmethod
    def _to_ts_code(code: str, default_market: str = "SH") -> str:
        """将各种格式的代码转换为 Tushare 格式

        支持的输入格式：
        - "sh000001" -> "000001.SH"
        - "sz399001" -> "399001.SZ"
        - "000001" -> "000001.SH" (根据 default_market)
        - "000001.SH" -> "000001.SH" (原样返回)
        """
        if "." in code:
            return code.upper()

        code = code.strip()
        if code.startswith(("sh", "SH")):
            pure = code[2:]
            return f"{pure}.SH"
        elif code.startswith(("sz", "SZ")):
            pure = code[2:]
            return f"{pure}.SZ"
        else:
            return f"{code}.{default_market}"

    @staticmethod
    def _get_index_name(ts_code: str) -> str:
        """获取指数名称"""
        names = {
            "000001.SH": "上证指数",
            "399001.SZ": "深证成指",
            "399006.SZ": "创业板指",
            "000688.SH": "科创50",
            "000300.SH": "沪深300",
        }
        return names.get(ts_code, ts_code)
