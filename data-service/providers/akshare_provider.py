# AKShare 数据提供者
# 从 akshare_client.py 迁移，实现 DataProvider 接口
# 缓存由 Registry 统一管理，Provider 只负责数据获取

import asyncio
import time
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import akshare as ak
import pandas as pd

from providers.base import DataProvider


class AKShareProvider(DataProvider):
    """AKShare 数据提供者（东方财富数据源）"""

    name = "akshare"

    def __init__(self):
        pass

    # ==================== 工具方法 ====================

    @staticmethod
    async def _call(func, *args, retries: int = 2, delay: float = 2.0, timeout: float = 30.0, **kwargs) -> Any:
        """在线程池中调用同步的 AKShare 函数，带重试和超时"""
        def _sync_call():
            for attempt in range(retries):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    if attempt < retries - 1:
                        time.sleep(delay * (attempt + 1))
                    else:
                        raise e
        try:
            return await asyncio.wait_for(asyncio.to_thread(_sync_call), timeout=timeout)
        except asyncio.TimeoutError:
            raise Exception(f"AKShare API 调用超时 ({timeout}秒)")

    @staticmethod
    def _standardize_sector_flow(data: List[Dict], name_field: str = "行业",
                                  change_field: str = "行业-涨跌幅") -> List[Dict]:
        """统一板块资金流向字段名，将净额单位从亿元转换为元"""
        data = [dict(item) for item in data]
        for item in data:
            item["名称"] = item.get(name_field, "")
            try:
                item["今日涨跌幅"] = float(item.get(change_field, 0))
            except (ValueError, TypeError):
                item["今日涨跌幅"] = 0.0
            try:
                net_val = float(item.get("净额", 0)) * 1e8
            except (ValueError, TypeError):
                net_val = 0.0
            item["今日主力净流入-净额"] = net_val
            for key in list(item.keys()):
                if "主力净流入" in key and key != "今日主力净流入-净额":
                    try:
                        item[key] = float(item[key]) * 1e8
                    except (ValueError, TypeError):
                        del item[key]
        return data

    @staticmethod
    def _find_latest_valid_in_hist(df: pd.DataFrame, col_names: List[str]) -> tuple:
        """从历史 DataFrame 中查找最近的有效非零数据"""
        if df.empty:
            return 0.0, None
        for col in col_names:
            if col in df.columns:
                for idx in range(len(df) - 1, max(len(df) - 60, -1), -1):
                    val = df.iloc[idx][col]
                    if pd.notna(val) and float(val) != 0:
                        date_val = str(df.iloc[idx].get("日期", ""))
                        return float(val), date_val
        return 0.0, None

    # ==================== 指数数据 ====================

    @staticmethod
    def _validate_index_data(df: pd.DataFrame) -> bool:
        """验证指数数据是否为真实数据（排除测试假数据）"""
        if df.empty:
            return False
        if "最新价" not in df.columns:
            return False
        prices = df["最新价"].dropna()
        if prices.empty:
            return False
        # 检测假数据：所有价格都是整百（3000, 10000, 2000, 1000, 4000）
        all_round_hundred = all(float(p) % 100 == 0 for p in prices if float(p) > 0)
        if all_round_hundred:
            print("[AKShare] 检测到疑似假数据（价格均为整百），拒绝使用")
            return False
        return True

    async def get_index_spot(self) -> pd.DataFrame:
        """获取指数实时行情快照（含备用接口降级）"""
        # 主接口：东方财富EM版
        try:
            df = await self._call(ak.stock_zh_index_spot_em)
            if self._validate_index_data(df):
                return df
            print("[AKShare] stock_zh_index_spot_em 返回数据未通过验证，尝试备用接口")
        except Exception as e:
            print(f"[AKShare] stock_zh_index_spot_em 失败: {e}")

        # 备用接口：新浪版
        try:
            df = await self._call(ak.stock_zh_index_spot_sina)
            if not df.empty:
                # 统一列名到EM格式
                rename_map = {}
                for col in df.columns:
                    if "代码" in col or "symbol" in col.lower():
                        rename_map[col] = "代码"
                    elif "名称" in col or "name" in col.lower():
                        rename_map[col] = "名称"
                    elif "最新价" in col or "current" in col.lower() or "trade" in col.lower():
                        rename_map[col] = "最新价"
                    elif "涨跌额" in col or "change" == col.lower():
                        rename_map[col] = "涨跌额"
                    elif "涨跌幅" in col or "pct" in col.lower():
                        rename_map[col] = "涨跌幅"
                if rename_map:
                    df = df.rename(columns=rename_map)
                if self._validate_index_data(df):
                    return df
        except Exception as e:
            print(f"[AKShare] stock_zh_index_spot_sina 备用接口也失败: {e}")

        # 最后降级：通过日K数据获取最新收盘价
        try:
            target_codes = ["sh000001", "sz399001", "sz399006", "sh000688", "sh000300"]
            records = []
            for code in target_codes:
                try:
                    df = await self._call(ak.stock_zh_index_daily, symbol=code)
                    if not df.empty:
                        latest = df.iloc[-1]
                        records.append({
                            "代码": code,
                            "名称": code,  # 会被上层覆盖
                            "最新价": float(latest.get("close", 0)),
                            "涨跌额": float(latest.get("close", 0)) - float(latest.get("open", 0)),
                            "涨跌幅": 0,  # 需要昨收计算
                            "成交量": float(latest.get("volume", 0)),
                            "成交额": 0,
                        })
                except Exception:
                    continue
            if records:
                df = pd.DataFrame(records)
                if self._validate_index_data(df):
                    return df
        except Exception as e:
            print(f"[AKShare] 日K降级也失败: {e}")

        return pd.DataFrame()

    async def get_index_daily(self, code: str, start_date: str, end_date: str) -> pd.DataFrame:
        """获取指数日K数据"""
        df = await self._call(ak.stock_zh_index_daily, symbol=code)
        if not df.empty:
            df["date"] = pd.to_datetime(df["date"])
            df = df[(df["date"] >= start_date) & (df["date"] <= end_date)]
        return df

    async def get_index_realtime(self, symbols: List[str]) -> pd.DataFrame:
        """获取指定指数实时行情"""
        df = await self.get_index_spot()
        if not df.empty:
            df = df[df["代码"].isin(symbols)]
        return df

    # ==================== 个股数据 ====================

    async def get_stock_spot(self, symbols: List[str]) -> pd.DataFrame:
        """获取个股实时行情快照"""
        df = await self._call(ak.stock_zh_a_spot_em)
        if not df.empty:
            df = df[df["代码"].isin(symbols)]
        return df

    async def get_stock_daily(self, ticker: str, start_date: str, end_date: str,
                               adjust: str = "qfq") -> pd.DataFrame:
        """获取个股日K数据"""
        return await self._call(
            ak.stock_zh_a_hist,
            symbol=ticker, period="daily",
            start_date=start_date, end_date=end_date, adjust=adjust,
        )

    # ==================== ETF 数据 ====================

    async def get_etf_realtime(self, symbols: List[str]) -> pd.DataFrame:
        """获取ETF实时行情"""
        df = await self._call(ak.fund_etf_spot_em)
        if not df.empty:
            df = df[df["代码"].isin(symbols)]
        return df

    async def get_etf_daily(self, ticker: str, start_date: str, end_date: str) -> pd.DataFrame:
        """获取ETF日K数据"""
        return await self._call(
            ak.fund_etf_hist_em,
            symbol=ticker, period="daily",
            start_date=start_date, end_date=end_date, adjust="qfq",
        )

    async def get_etf_nav(self, ticker: str) -> Dict:
        """获取ETF净值和份额"""
        df = await self._call(ak.fund_etf_fund_info_em, fund=ticker)
        if not df.empty:
            return df.to_dict("records")[0]
        return {}

    # ==================== 资金流向 ====================

    async def get_market_capital_flow(self) -> Dict:
        """获取大盘资金流向（含内部降级：大盘接口 → 行业估算）"""
        # 优先：大盘资金流向接口
        try:
            df = await self._call(ak.stock_market_fund_flow)
            if not df.empty:
                latest = df.iloc[-1]
                return {
                    "主力净流入-净额": float(latest.get("主力净流入-净额", 0)),
                    "主力净流入-净占比": float(latest.get("主力净流入-净占比", 0)),
                    "中单净流入-净额": float(latest.get("中单净流入-净额", 0)),
                    "小单净流入-净额": float(latest.get("小单净流入-净额", 0)),
                    "日期": str(latest.get("日期", datetime.now().strftime("%Y-%m-%d"))),
                    "source": "market_fund_flow",
                    "dataQuality": "realtime",
                }
        except Exception as e:
            print(f"[AKShare] 大盘资金流向接口失败，尝试降级: {e}")

        # 降级：行业资金流向汇总估算
        df = await self._call(ak.stock_fund_flow_industry)
        if not df.empty:
            total_inflow = df["流入资金"].astype(float).sum()
            total_outflow = df["流出资金"].astype(float).sum()
            total_net = df["净额"].astype(float).sum()

            main_net = total_net * 1e8

            if total_inflow > 0:
                retail_ratio = min(0.4, max(0.2, 1 - (total_net / total_inflow)))
            else:
                retail_ratio = 0.3

            retail_net = -main_net * retail_ratio
            return {
                "主力净流入-净额": main_net,
                "主力净流入-净占比": round(total_net / (total_inflow + total_outflow) * 100, 2) if (total_inflow + total_outflow) > 0 else 0,
                "中单净流入-净额": retail_net * 0.6,
                "小单净流入-净额": retail_net * 0.4,
                "日期": datetime.now().strftime("%Y-%m-%d"),
                "source": "fund_flow_industry",
                "dataQuality": "estimated",
            }

        raise Exception("所有大盘资金流向接口都失败")

    async def get_sector_capital_flow(self, indicator: str = "今日") -> List[Dict]:
        """获取板块资金流向（含内部降级：行业 → 概念）

        返回所有行业板块数据，按净额降序排序，确保top10流入/流出数据完整
        """
        try:
            df = await self._call(ak.stock_fund_flow_industry)
            if not df.empty:
                # 不限制行数，获取所有行业板块
                data = df.to_dict("records")
                result = self._standardize_sector_flow(data)
                # 按净额降序排序，确保top10选择正确
                result.sort(key=lambda x: x.get("今日主力净流入-净额", 0), reverse=True)
                return result
        except Exception as e:
            print(f"[AKShare] 行业资金流向失败: {e}")

        # 降级：概念资金流向
        df = await self._call(ak.stock_fund_flow_concept)
        if not df.empty:
            data = df.to_dict("records")
            result = self._standardize_sector_flow(data)
            result.sort(key=lambda x: x.get("今日主力净流入-净额", 0), reverse=True)
            return result

        raise Exception("所有板块资金流向接口都失败")

    async def get_northbound_flow(self) -> Dict:
        """获取北向资金流向（含多级内部降级）"""
        # 1. 汇总接口
        try:
            df = await self._call(ak.stock_hsgt_fund_flow_summary_em)
            if not df.empty:
                northbound = None
                for col_name in ["资金方向", "类型", "方向"]:
                    if col_name in df.columns:
                        for keyword in ["北向", "北上", "沪港通", "陆股通"]:
                            matched = df[df[col_name].str.contains(keyword, na=False)]
                            if not matched.empty:
                                northbound = matched
                                break
                    if northbound is not None:
                        break

                if northbound is not None and not northbound.empty:
                    net_col = None
                    for col in ["资金净流入", "成交净买额", "净买额", "当日净买入", "净流入"]:
                        if col in northbound.columns:
                            net_col = col
                            break

                    if net_col:
                        total_net = northbound[net_col].sum()
                        value_yi = float(total_net) if pd.notna(total_net) else 0

                        # 检查数据是否有效（非零且非NaN）
                        if value_yi != 0:
                            sh_net, sz_net = 0.0, 0.0
                            for _, row in northbound.iterrows():
                                direction = str(row.get("资金方向", "")) + str(row.get("类型", ""))
                                net_val = float(row.get(net_col, 0)) if pd.notna(row.get(net_col, 0)) else 0
                                if "沪" in direction:
                                    sh_net = net_val
                                elif "深" in direction:
                                    sz_net = net_val

                            return {
                                "date": str(northbound.iloc[0].get("交易日", datetime.now().strftime("%Y-%m-%d"))),
                                "value": value_yi,
                                "shConnect": sh_net,
                                "szConnect": sz_net,
                                "source": "hsgt_summary",
                                "unit": "亿元",
                                "stale": False,
                            }
                        else:
                            print("[AKShare] 北向资金汇总接口返回净买额为0或null，数据不可用")
        except Exception as e:
            print(f"[AKShare] 北向资金汇总接口失败: {e}")

        # 2. 历史接口降级
        try:
            sh_df = await self._call(ak.stock_hsgt_hist_em, symbol="沪股通")
            sz_df = await self._call(ak.stock_hsgt_hist_em, symbol="深股通")
            net_col_names = ["当日成交净买额", "当日净买入", "净流入", "成交净买额"]

            sh_net, sh_date = self._find_latest_valid_in_hist(sh_df, net_col_names)
            sz_net, sz_date = self._find_latest_valid_in_hist(sz_df, net_col_names)

            if sh_net != 0 or sz_net != 0:
                date_str = sh_date or sz_date or datetime.now().strftime("%Y-%m-%d")
                return {
                    "date": date_str,
                    "value": sh_net + sz_net,
                    "shConnect": sh_net,
                    "szConnect": sz_net,
                    "source": "hsgt_hist",
                    "unit": "亿元",
                    "stale": True,  # 历史数据标记为过期
                }
        except Exception as e:
            print(f"[AKShare] 北向资金历史接口也失败: {e}")

        raise Exception("所有北向资金接口都失败（北向数据可能未披露）")

    async def get_northbound_flow_history(self, days: int = 30) -> List[Dict]:
        """获取北向资金历史数据"""
        sh_df = await self._call(ak.stock_hsgt_hist_em, symbol="沪股通")
        sz_df = await self._call(ak.stock_hsgt_hist_em, symbol="深股通")

        net_col = None
        for col in ["当日成交净买额", "当日净买入", "净流入", "成交净买额"]:
            if not sh_df.empty and col in sh_df.columns:
                net_col = col
                break

        if net_col is None:
            raise Exception(f"北向资金历史未找到净流入列")

        sh_map: Dict[str, float] = {}
        if not sh_df.empty:
            date_col = "日期" if "日期" in sh_df.columns else sh_df.columns[0]
            for _, row in sh_df.iterrows():
                if pd.notna(row[net_col]):
                    val = float(row[net_col])
                    if val != 0:
                        sh_map[str(row[date_col])] = val

        sz_map: Dict[str, float] = {}
        if not sz_df.empty:
            date_col = "日期" if "日期" in sz_df.columns else sz_df.columns[0]
            for _, row in sz_df.iterrows():
                if pd.notna(row[net_col]):
                    val = float(row[net_col])
                    if val != 0:
                        sz_map[str(row[date_col])] = val

        all_dates = sorted(set(list(sh_map.keys()) + list(sz_map.keys())))[-days:]
        records = []
        for date in all_dates:
            sh_val = sh_map.get(date, 0)
            sz_val = sz_map.get(date, 0)
            if sh_val != 0 or sz_val != 0:
                records.append({
                    "date": date,
                    "value": sh_val + sz_val,
                    "shConnect": sh_val,
                    "szConnect": sz_val,
                })

        if not records:
            raise Exception("北向资金历史数据为空")
        return records

    async def get_stock_capital_flow(self, ticker: str) -> Dict:
        """获取个股资金流向"""
        df = await self._call(
            ak.stock_individual_fund_flow,
            stock=ticker, market="sh" if ticker.startswith("6") else "sz",
        )
        if not df.empty:
            return df.iloc[-1].to_dict()
        raise Exception(f"个股资金流向为空: {ticker}")

    async def get_margin_data(self) -> Dict:
        """获取融资融券数据"""
        df = await self._call(
            ak.stock_margin_sse,
            start_date=(datetime.now() - timedelta(days=30)).strftime("%Y%m%d"),
        )
        if isinstance(df, pd.DataFrame) and not df.empty and len(df.columns) > 0:
            latest = df.iloc[-1]
            return {
                "date": str(latest.get("信用交易日期", latest.get("日期", ""))),
                "rzye": float(latest.get("融资余额(元)", latest.get("融资余额", 0))),
                "rzmre": float(latest.get("融资买入额(元)", latest.get("融资买入额", 0))),
                "rzche": float(latest.get("融资偿还额(元)", latest.get("融资偿还额", 0))),
                "rqye": float(latest.get("融券余额(元)", latest.get("融券余额", 0))),
                "rqmcl": float(latest.get("融券卖出量(股)", latest.get("融券卖出量", 0))),
                "rzrqye": float(latest.get("融资融券余额(元)", latest.get("融资融券余额", 0))),
                "source": "sse",
            }
        raise Exception("融资融券数据为空")

    async def get_market_fund_flow_rank(self) -> Dict:
        """获取大盘资金流向排名"""
        df = await self._call(ak.stock_market_fund_flow)
        if df is not None and not df.empty:
            latest = df.iloc[-1]
            return {
                "date": str(latest.get("日期", datetime.now().strftime("%Y-%m-%d"))),
                "mainNet": float(latest.get("主力净流入-净额", 0)),
                "mainPct": float(latest.get("主力净流入-净占比", 0)),
                "superLargeNet": float(latest.get("超大单净流入-净额", 0)),
                "superLargePct": float(latest.get("超大单净流入-净占比", 0)),
                "largeNet": float(latest.get("大单净流入-净额", 0)),
                "largePct": float(latest.get("大单净流入-净占比", 0)),
                "midNet": float(latest.get("中单净流入-净额", 0)),
                "midPct": float(latest.get("中单净流入-净占比", 0)),
                "smallNet": float(latest.get("小单净流入-净额", 0)),
                "smallPct": float(latest.get("小单净流入-净占比", 0)),
                "source": "market_fund_flow",
            }
        raise Exception("大盘资金流向排名数据为空")

    async def get_market_sentiment(self) -> Dict:
        """获取市场情绪指标"""
        df = await self._call(ak.stock_zh_a_spot_em)
        if df is not None and not df.empty:
            total = len(df)
            up_count = len(df[df["涨跌幅"] > 0])
            down_count = len(df[df["涨跌幅"] < 0])
            flat_count = total - up_count - down_count
            limit_up = len(df[df["涨跌幅"] >= 9.9])
            limit_down = len(df[df["涨跌幅"] <= -9.9])

            up_ratio = up_count / total * 100 if total > 0 else 50
            limit_ratio = limit_up / (limit_up + limit_down) * 100 if (limit_up + limit_down) > 0 else 50
            sentiment = int(round(up_ratio * 0.6 + limit_ratio * 0.4))

            return {
                "total": total,
                "upCount": up_count,
                "downCount": down_count,
                "flatCount": flat_count,
                "limitUp": limit_up,
                "limitDown": limit_down,
                "upRatio": round(up_ratio, 2),
                "sentiment": max(0, min(100, sentiment)),
                "source": "stock_zh_a_spot_em",
            }
        raise Exception("市场情绪数据为空")

    # ==================== 新闻 ====================

    async def get_news(self, keyword: str = "财联社", limit: int = 50) -> pd.DataFrame:
        """获取新闻资讯"""
        df = await self._call(ak.stock_news_em, symbol=keyword)
        if not df.empty:
            df = df.head(limit)
        return df
