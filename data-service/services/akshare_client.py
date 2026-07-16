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

    @staticmethod
    def _standardize_sector_flow(data: List[Dict], name_field: str = "行业", change_field: str = "行业-涨跌幅") -> List[Dict]:
        """统一板块资金流向字段名，并将净额单位从亿元转换为元。

        Args:
            data: 原始板块数据列表（from AKShare DataFrame.to_dict('records')）
            name_field: 名称字段的原始键名（行业资金流向用 '行业'，概念资金流向用 '行业'）
            change_field: 涨跌幅字段的原始键名

        Returns:
            标准化后的数据列表，包含 '名称'、'今日涨跌幅'、'今日主力净流入-净额' 等统一字段
        """
        for item in data:
            item['名称'] = item.get(name_field, '')
            try:
                item['今日涨跌幅'] = float(item.get(change_field, 0))
            except (ValueError, TypeError):
                item['今日涨跌幅'] = 0.0
            # AKShare 直接返回的净额单位是亿元，转换为元存储
            try:
                net_val = float(item.get('净额', 0)) * 1e8
            except (ValueError, TypeError):
                net_val = 0.0
            item['今日主力净流入-净额'] = net_val
            # 保留原始多日字段（如果AKShare返回了的话）
            for key in list(item.keys()):
                if '主力净流入' in key and key != '今日主力净流入-净额':
                    try:
                        item[key] = float(item[key]) * 1e8
                    except (ValueError, TypeError):
                        del item[key]
        return data

    # ==================== 实时行情 ====================

    def get_index_spot(self) -> pd.DataFrame:
        """获取指数实时行情快照（东方财富）

        降级策略：
        1. 东方财富 stock_zh_index_spot_em()
        2. 文件缓存（上一次成功获取的数据）

        Returns:
            DataFrame with columns: 代码, 名称, 最新价, 涨跌额, 涨跌幅, 成交量, 成交额, etc.
        """
        cache_key = "index_spot"

        # 检查内存缓存
        cached = self._get_memory_cache(cache_key)
        if cached is not None:
            # 内存缓存可能是list-of-dicts（序列化后的格式），统一转为DataFrame
            if isinstance(cached, list):
                return pd.DataFrame(cached)
            return cached

        try:
            df = self._retry_call(ak.stock_zh_index_spot_em)
            if not df.empty:
                self._set(cache_key, df.to_dict('records'), memory_ttl=30)
            return df
        except Exception as e:
            print(f"获取指数实时行情快照失败，尝试文件缓存降级: {e}")

        # 降级：文件缓存
        cached = self._get_file_cache(cache_key)
        if cached:
            print("使用缓存的指数实时行情数据")
            df = pd.DataFrame(cached)
            self._set_memory_cache(cache_key, df, ttl_seconds=30)
            return df

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

    def _find_latest_valid_in_hist(self, df: pd.DataFrame, col_names: List[str]) -> tuple:
        """从历史DataFrame中查找最近的有效非零数据

        Args:
            df: 历史数据DataFrame
            col_names: 候选列名列表

        Returns:
            (value, date_str) 元组，未找到返回 (0.0, None)
        """
        if df.empty:
            return 0.0, None
        for col in col_names:
            if col in df.columns:
                # 搜索最近60行（约2个月交易日）
                for idx in range(len(df) - 1, max(len(df) - 60, -1), -1):
                    val = df.iloc[idx][col]
                    if pd.notna(val) and float(val) != 0:
                        date_val = str(df.iloc[idx].get('日期', ''))
                        return float(val), date_val
        return 0.0, None

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

        Args:
            indicator: 时间维度，"今日"/"3日"/"5日"/"10日"
        """
        cache_key = f"sector_capital_flow_{indicator}"

        # 尝试东方财富行业资金流向接口
        try:
            df = self._retry_call(ak.stock_fund_flow_industry)
            if not df.empty:
                data = df.head(50).to_dict('records')
                # 打印列名以便调试
                if data:
                    print(f"板块资金流向列名: {list(data[0].keys())}")
                data = self._standardize_sector_flow(data)
                self._set(cache_key, data, memory_ttl=600)
                return data
        except Exception as e:
            print(f"行业资金流向失败: {e}")

        # 降级：尝试概念资金流向
        try:
            df = self._retry_call(ak.stock_fund_flow_concept)
            if not df.empty:
                data = df.head(50).to_dict('records')
                data = self._standardize_sector_flow(data)
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
        """获取北向资金流向（单位：亿元）

        降级策略：
        1. 东方财富 stock_hsgt_fund_flow_summary_em()
        2. 东方财富 stock_hsgt_hist_em() (历史数据取最新)
        3. 返回缓存数据
        """
        cache_key = "northbound_flow"

        # 尝试东方财富汇总接口
        try:
            df = self._retry_call(ak.stock_hsgt_fund_flow_summary_em)
            if not df.empty:
                # 打印列名和数据以便调试
                print(f"北向资金汇总列名: {list(df.columns)}")
                print(f"北向资金汇总数据前3行:\n{df.head(3).to_string()}")

                # 尝试多种匹配方式
                northbound = None
                for col_name in ['资金方向', '类型', '方向']:
                    if col_name in df.columns:
                        for keyword in ['北向', '北上', '沪港通', '陆股通']:
                            matched = df[df[col_name].str.contains(keyword, na=False)]
                            if not matched.empty:
                                northbound = matched
                                print(f"北向资金通过 '{col_name}' 匹配 '{keyword}' 成功")
                                break
                    if northbound is not None:
                        break

                if northbound is not None and not northbound.empty:
                    # 查找净买额列（优先资金净流入，再成交净买额）
                    net_col = None
                    for col in ['资金净流入', '成交净买额', '净买额', '当日净买入', '净流入']:
                        if col in northbound.columns:
                            net_col = col
                            break

                    if net_col:
                        total_net = northbound[net_col].sum()
                        # AKShare返回单位为亿元，直接使用
                        value_yi = float(total_net) if pd.notna(total_net) else 0

                        # 如果汇总数据为0，尝试从历史数据获取最近交易日的有效数据
                        if value_yi == 0:
                            print("北向资金汇总数据为0，尝试从历史数据获取最近交易日收盘数据")
                            try:
                                sh_hist = self._retry_call(ak.stock_hsgt_hist_em, symbol="沪股通")
                                sz_hist = self._retry_call(ak.stock_hsgt_hist_em, symbol="深股通")
                                net_col_names = ['当日成交净买额', '当日净买入', '净流入', '成交净买额']
                                sh_val, sh_date = self._find_latest_valid_in_hist(sh_hist, net_col_names)
                                sz_val, sz_date = self._find_latest_valid_in_hist(sz_hist, net_col_names)
                                if sh_val != 0 or sz_val != 0:
                                    data_date = sh_date or sz_date or str(northbound.iloc[0].get('交易日', datetime.now().strftime("%Y-%m-%d")))
                                    data = {
                                        "date": data_date,
                                        "value": sh_val + sz_val,
                                        "shConnect": sh_val,
                                        "szConnect": sz_val,
                                        "source": "hsgt_hist",
                                        "unit": "亿元",
                                        "stale": True
                                    }
                                    self._set(cache_key, data, memory_ttl=600)
                                    return data
                            except Exception as hist_e:
                                print(f"北向资金历史降级也失败: {hist_e}")

                        # 如果汇总数据有效（非0），尝试获取沪股通/深股通拆分并返回
                        if value_yi != 0:
                            sh_net = 0.0
                            sz_net = 0.0
                            for _, row in northbound.iterrows():
                                direction = str(row.get('资金方向', '')) + str(row.get('类型', ''))
                                net_val = float(row.get(net_col, 0)) if pd.notna(row.get(net_col, 0)) else 0
                                if '沪' in direction:
                                    sh_net = net_val
                                elif '深' in direction:
                                    sz_net = net_val

                            data = {
                                "date": str(northbound.iloc[0].get('交易日', datetime.now().strftime("%Y-%m-%d"))),
                                "value": value_yi,
                                "shConnect": sh_net,
                                "szConnect": sz_net,
                                "source": "hsgt_summary",
                                "unit": "亿元"
                            }
                            self._set(cache_key, data, memory_ttl=600)
                            return data

                        # 汇总数据和历史数据都为0，继续降级到下一个try块
                        print("北向资金汇总和历史数据都为0，继续降级")

                print("北向资金汇总接口未匹配到北向数据，尝试历史接口")
        except Exception as e:
            print(f"北向资金汇总接口失败: {e}")

        # 降级：从历史数据获取最新有效值（搜索更广范围）
        try:
            sh_df = self._retry_call(ak.stock_hsgt_hist_em, symbol="沪股通")
            sz_df = self._retry_call(ak.stock_hsgt_hist_em, symbol="深股通")

            sh_net = 0.0
            sz_net = 0.0
            date_str = datetime.now().strftime("%Y-%m-%d")

            # 查找净流入列名
            net_col_names = ['当日成交净买额', '当日净买入', '净流入', '成交净买额']

            sh_net, sh_date = self._find_latest_valid_in_hist(sh_df, net_col_names)
            sz_net, sz_date = self._find_latest_valid_in_hist(sz_df, net_col_names)

            # 使用最新的有效日期
            if sh_date or sz_date:
                date_str = sh_date or sz_date

            total = sh_net + sz_net
            if total != 0:
                data = {
                    "date": date_str,
                    "value": total,
                    "shConnect": sh_net,
                    "szConnect": sz_net,
                    "source": "hsgt_hist_fallback",
                    "unit": "亿元",
                    "stale": True  # 标记为历史数据
                }
                self._set(cache_key, data, memory_ttl=600)
                return data
            else:
                print("北向资金历史数据60行内全部为NaN/0")
        except Exception as e:
            print(f"北向资金历史接口也失败: {e}")

        # 降级：返回文件缓存（最可靠的长期存储）
        cached = self._get(cache_key)
        if cached:
            print(f"使用缓存的北向资金数据: date={cached.get('date')}, value={cached.get('value')}")
            cached["stale"] = True
            return cached

        return {}

    def get_northbound_flow_history(self, days: int = 30) -> List[Dict]:
        """获取北向资金历史数据（单位：亿元）

        同时获取沪股通和深股通数据，合并为每日总净流入
        """
        cache_key = f"northbound_history_{days}"

        try:
            sh_df = self._retry_call(ak.stock_hsgt_hist_em, symbol="沪股通")
            sz_df = self._retry_call(ak.stock_hsgt_hist_em, symbol="深股通")

            # 找到净流入列名（优先当日成交净买额）
            net_col = None
            for col in ['当日成交净买额', '当日净买入', '净流入', '成交净买额']:
                if not sh_df.empty and col in sh_df.columns:
                    net_col = col
                    break

            if net_col is None:
                print(f"北向资金历史未找到净流入列，列名: {list(sh_df.columns) if not sh_df.empty else '空DataFrame'}")
                cached = self._get(cache_key)
                return cached if cached else []

            # 构建日期->金额映射（跳过NaN值）
            sh_map = {}
            if not sh_df.empty:
                date_col = '日期' if '日期' in sh_df.columns else sh_df.columns[0]
                for _, row in sh_df.iterrows():
                    if pd.notna(row[net_col]):
                        date_str = str(row[date_col])
                        val = float(row[net_col])
                        if val != 0:
                            sh_map[date_str] = val

            sz_map = {}
            if not sz_df.empty:
                date_col = '日期' if '日期' in sz_df.columns else sz_df.columns[0]
                for _, row in sz_df.iterrows():
                    if pd.notna(row[net_col]):
                        date_str = str(row[date_col])
                        val = float(row[net_col])
                        if val != 0:
                            sz_map[date_str] = val

            # 合并（只包含有有效数据的日期）
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

            if records:
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
        """获取融资融券数据（带缓存）"""
        cache_key = "margin_data"

        try:
            df = self._retry_call(
                ak.stock_margin_sse,
                start_date=(datetime.now() - timedelta(days=30)).strftime("%Y%m%d")
            )
            # 检查DataFrame是否有效（防止空DataFrame导致Length mismatch）
            if isinstance(df, pd.DataFrame) and not df.empty and len(df.columns) > 0:
                latest = df.iloc[-1].to_dict()
                # 标准化字段名
                result = {
                    "date": str(latest.get("信用交易日期", latest.get("日期", ""))),
                    "rzye": float(latest.get("融资余额(元)", latest.get("融资余额", 0))),  # 融资余额
                    "rzmre": float(latest.get("融资买入额(元)", latest.get("融资买入额", 0))),  # 融资买入额
                    "rzche": float(latest.get("融资偿还额(元)", latest.get("融资偿还额", 0))),  # 融资偿还额
                    "rqye": float(latest.get("融券余额(元)", latest.get("融券余额", 0))),  # 融券余额
                    "rqmcl": float(latest.get("融券卖出量(股)", latest.get("融券卖出量", 0))),  # 融券卖出量
                    "rzrqye": float(latest.get("融资融券余额(元)", latest.get("融资融券余额", 0))),  # 融资融券余额
                    "source": "sse"
                }
                self._set(cache_key, result, memory_ttl=600)
                return result
            else:
                print(f"融资融券数据为空或格式异常: type={type(df)}, empty={df.empty if isinstance(df, pd.DataFrame) else 'N/A'}")
        except Exception as e:
            print(f"获取融资融券数据失败: {e}")

        cached = self._get(cache_key)
        if cached:
            return cached
        return {}

    def get_market_fund_flow_rank(self) -> Dict:
        """获取大盘资金流向排名（超大单/大单/中单/小单）"""
        cache_key = "market_fund_flow_rank"

        try:
            # 使用 stock_market_fund_flow 获取大盘资金流向
            df = self._retry_call(ak.stock_market_fund_flow)
            if df is not None and not df.empty:
                latest = df.iloc[-1]
                result = {
                    "date": str(latest.get("日期", datetime.now().strftime("%Y-%m-%d"))),
                    "mainNet": float(latest.get("主力净流入-净额", 0)),  # 主力净流入（元）
                    "mainPct": float(latest.get("主力净流入-净占比", 0)),  # 主力净流入占比
                    "superLargeNet": float(latest.get("超大单净流入-净额", 0)),  # 超大单净流入
                    "superLargePct": float(latest.get("超大单净流入-净占比", 0)),
                    "largeNet": float(latest.get("大单净流入-净额", 0)),  # 大单净流入
                    "largePct": float(latest.get("大单净流入-净占比", 0)),
                    "midNet": float(latest.get("中单净流入-净额", 0)),  # 中单净流入
                    "midPct": float(latest.get("中单净流入-净占比", 0)),
                    "smallNet": float(latest.get("小单净流入-净额", 0)),  # 小单净流入
                    "smallPct": float(latest.get("小单净流入-净占比", 0)),
                    "source": "market_fund_flow"
                }
                self._set(cache_key, result, memory_ttl=600)
                return result
        except Exception as e:
            print(f"获取大盘资金流向排名失败: {e}")

        cached = self._get(cache_key)
        if cached:
            return cached
        return {}

    def get_market_sentiment(self) -> Dict:
        """获取市场情绪指标"""
        cache_key = "market_sentiment"

        try:
            # 获取A股涨跌数据
            df = self._retry_call(ak.stock_zh_a_spot_em)
            if df is not None and not df.empty:
                total = len(df)
                up_count = len(df[df['涨跌幅'] > 0])
                down_count = len(df[df['涨跌幅'] < 0])
                flat_count = total - up_count - down_count

                # 涨停/跌停
                limit_up = len(df[df['涨跌幅'] >= 9.9])
                limit_down = len(df[df['涨跌幅'] <= -9.9])

                # 涨跌比
                up_ratio = up_count / total * 100 if total > 0 else 50

                # 涨停跌停比
                limit_ratio = limit_up / (limit_up + limit_down) * 100 if (limit_up + limit_down) > 0 else 50

                # 综合情绪评分 (0-100)
                sentiment = int(round(up_ratio * 0.6 + limit_ratio * 0.4))

                result = {
                    "total": total,
                    "upCount": up_count,
                    "downCount": down_count,
                    "flatCount": flat_count,
                    "limitUp": limit_up,
                    "limitDown": limit_down,
                    "upRatio": round(up_ratio, 2),
                    "sentiment": max(0, min(100, sentiment)),
                    "source": "stock_zh_a_spot_em"
                }
                self._set(cache_key, result, memory_ttl=60)
                return result
        except Exception as e:
            print(f"获取市场情绪数据失败: {e}")

        cached = self._get(cache_key)
        if cached:
            return cached
        return {}


# 全局单例
client = AKShareClient()
