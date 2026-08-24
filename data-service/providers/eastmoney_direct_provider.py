# 东方财富直接API提供者
# 绕过AKShare的网络代理问题，直接请求东方财富API
# 解决 stock_market_fund_flow() 接口失败问题

import asyncio
import json
import time
from datetime import datetime
from typing import Any, Dict, List, Optional

import aiohttp
import pandas as pd
import requests

from providers.base import DataProvider


class EastmoneyDirectProvider(DataProvider):
    """东方财富直接API提供者（绕过代理问题）

    仅实现资金流向相关接口，其他方法抛出NotImplementedError
    """

    name = "eastmoney_direct"

    def __init__(self):
        self.timeout = aiohttp.ClientTimeout(total=15)
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Referer': 'http://data.eastmoney.com/'
        }
        # requests session（用于同步请求）
        self.session = requests.Session()
        self.session.headers.update(self.headers)
        # 禁用代理
        self.session.trust_env = False

    async def _fetch_sync(self, url: str, params: Dict[str, Any], retries: int = 3) -> Dict:
        """同步HTTP GET请求（在线程池中执行，禁用代理）"""
        def _sync_request():
            for attempt in range(retries):
                try:
                    response = self.session.get(
                        url,
                        params=params,
                        timeout=15,
                        proxies={'http': None, 'https': None}
                    )

                    if response.status_code == 200:
                        text = response.text

                        # 处理JSONP响应
                        if 'jQuery' in text or 'callback' in text:
                            start = text.index('(') + 1
                            end = text.rindex(')')
                            text = text[start:end]

                        return json.loads(text)
                    else:
                        raise Exception(f"HTTP {response.status_code}")

                except Exception as e:
                    if attempt < retries - 1:
                        time.sleep(1 * (attempt + 1))  # 递增重试延迟
                        continue
                    raise e

            raise Exception("所有重试都失败")

        # 在线程池中执行同步请求
        return await asyncio.to_thread(_sync_request)

    # ==================== 未实现的方法（抛出NotImplementedError）====================

    async def get_index_spot(self) -> pd.DataFrame:
        raise NotImplementedError("EastmoneyDirect不支持指数行情")

    async def get_index_daily(self, code: str, start_date: str, end_date: str) -> pd.DataFrame:
        raise NotImplementedError("EastmoneyDirect不支持指数日线")

    async def get_index_realtime(self, symbols: List[str]) -> pd.DataFrame:
        raise NotImplementedError("EastmoneyDirect不支持指数实时行情")

    async def get_stock_spot(self, symbols: List[str]) -> pd.DataFrame:
        raise NotImplementedError("EastmoneyDirect不支持个股行情")

    async def get_stock_daily(self, ticker: str, start_date: str, end_date: str, adjust: str = "qfq") -> pd.DataFrame:
        raise NotImplementedError("EastmoneyDirect不支持个股日线")

    async def get_etf_realtime(self, symbols: List[str]) -> pd.DataFrame:
        raise NotImplementedError("EastmoneyDirect不支持ETF实时行情")

    async def get_etf_daily(self, ticker: str, start_date: str, end_date: str) -> pd.DataFrame:
        raise NotImplementedError("EastmoneyDirect不支持ETF日线")

    async def get_sector_capital_flow(self, indicator: str = "今日") -> List[Dict]:
        raise NotImplementedError("EastmoneyDirect不支持板块资金流向")

    async def get_northbound_flow_history(self, days: int = 30) -> List[Dict]:
        raise NotImplementedError("EastmoneyDirect不支持北向资金历史")

    async def get_stock_capital_flow(self, ticker: str) -> Dict:
        raise NotImplementedError("EastmoneyDirect不支持个股资金流向")

    async def get_margin_data(self) -> Dict:
        raise NotImplementedError("EastmoneyDirect不支持融资融券数据")

    async def _fetch(self, url: str, params: Dict[str, Any]) -> Dict:
        """异步HTTP GET请求（禁用代理）"""
        # 强制禁用代理
        connector = aiohttp.TCPConnector(force_close=True)

        async with aiohttp.ClientSession(
            timeout=self.timeout,
            connector=connector,
            headers=self.headers,
            trust_env=False  # 禁用环境变量中的代理设置
        ) as session:
            async with session.get(url, params=params, proxy=None) as response:
                if response.status == 200:
                    text = await response.text()

                    # 处理JSONP响应
                    if 'jQuery' in text or 'callback' in text:
                        start = text.index('(') + 1
                        end = text.rindex(')')
                        text = text[start:end]

                    return json.loads(text)
                else:
                    raise Exception(f"HTTP {response.status}: {await response.text()}")

    # ==================== 资金流向 ====================

    async def get_market_capital_flow(self) -> Dict:
        """获取大盘资金流向（东方财富直接API）

        返回格式与AKShare保持一致：
        {
            "主力净流入-净额": float (元),
            "主力净流入-净占比": float (%),
            "中单净流入-净额": float (元),
            "小单净流入-净额": float (元),
            "日期": str (YYYY-MM-DD),
            "source": "eastmoney_direct",
            "dataQuality": "realtime"
        }
        """
        try:
            url = 'http://push2.eastmoney.com/api/qt/stock/fflow/daykline/get'
            params = {
                'lmt': 1,  # 最近1条数据
                'klt': 101,  # 日线
                'secid': '1.000001',  # 上证指数
                'secid2': '0.399001',  # 深证成指
                'fields1': 'f1,f2,f3,f7',
                'fields2': 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63',
                'ut': 'b2884a393a59ad64002292a3e90d46a5',
            }

            data = await self._fetch_sync(url, params)

            if 'data' not in data or not data['data'] or 'klines' not in data['data']:
                raise Exception("API返回数据格式异常")

            klines = data['data']['klines']
            if not klines:
                raise Exception("API返回空数据")

            # 解析最新一条数据
            latest = klines[-1].split(',')

            # 字段映射（东方财富文档）:
            # f51=日期, f52=主力净流入-净额, f53=小单净流入-净额, f54=中单净流入-净额,
            # f55=大单净流入-净额, f56=超大单净流入-净额,
            # f57=主力净流入-净占比, f58=小单净流入-净占比, f59=中单净流入-净占比,
            # f60=大单净流入-净占比, f61=超大单净流入-净占比

            if len(latest) < 10:
                raise Exception(f"数据字段不足: 仅{len(latest)}个字段")

            date_str = latest[0]  # YYYY-MM-DD
            main_net = float(latest[1])  # 主力净流入-净额（元）
            small_net = float(latest[2])  # 小单净流入-净额（元）
            mid_net = float(latest[3])  # 中单净流入-净额（元）
            main_pct = float(latest[6])  # 主力净流入-净占比（%）

            return {
                "主力净流入-净额": main_net,
                "主力净流入-净占比": main_pct,
                "中单净流入-净额": mid_net,
                "小单净流入-净额": small_net,
                "日期": date_str,
                "source": "eastmoney_direct",
                "dataQuality": "realtime",
            }

        except Exception as e:
            print(f"[EastmoneyDirect] 大盘资金流向失败: {e}")
            raise

    async def get_northbound_flow(self) -> Dict:
        """获取北向资金流向（沪深港通实时汇总）

        返回格式：
        {
            "date": str,
            "value": float (亿元),
            "shConnect": float (亿元),
            "szConnect": float (亿元),
            "source": "eastmoney_direct",
            "stale": bool
        }
        """
        try:
            # 方案1：实时接口（盘中数据）
            url = 'http://push2.eastmoney.com/api/qt/kamt.rtmin/get'
            params = {
                'fields1': 'f1,f2,f3,f4',
                'fields2': 'f51,f52,f53,f54,f55,f56',
                'ut': 'b2884a393a59ad64002292a3e90d46a5',
            }

            data = await self._fetch_sync(url, params)

            if 'data' not in data:
                raise Exception("实时接口无数据，尝试历史接口")

            # 解析实时数据
            result_data = data['data']

            # s2n = 北向资金 (深股通 + 沪股通)
            # n2s = 南向资金 (港股通)
            # 格式: "时间,净流入,余额,流入,余额上限,累计"

            s2n_date = result_data.get('s2nDate', '')

            # 解析沪股通 + 深股通数据
            s2n_data = result_data.get('s2n', [])
            if s2n_data:
                # 取最后一条（最新）
                latest_s2n = s2n_data[-1].split(',')
                if len(latest_s2n) >= 2:
                    northbound_net = float(latest_s2n[0]) / 10000  # 万元转亿元

                    return {
                        "date": f"2026-{s2n_date}",  # TODO: 年份处理
                        "value": northbound_net,
                        "shConnect": northbound_net / 2,  # 简化：平均分配
                        "szConnect": northbound_net / 2,
                        "source": "eastmoney_direct_realtime",
                        "stale": False,
                    }

            raise Exception("实时数据解析失败，降级到历史接口")

        except Exception:
            # 降级：历史接口
            try:
                url = 'http://push2his.eastmoney.com/api/qt/kamt/get'
                params = {
                    'fields1': 'f1,f2,f3,f4',
                    'fields2': 'f51,f52,f53,f54,f55,f56',
                    'klt': '101',  # 日线
                    'lmt': 1,  # 最近1条
                    'ut': 'b2884a393a59ad64002292a3e90d46a5',
                }

                data = await self._fetch_sync(url, params)

                if 'data' not in data or not data['data']:
                    raise Exception("历史接口无数据")

                result = data['data']

                # 北向资金 = 沪股通 + 深股通
                sh_net = float(result.get('hk2sh', {}).get('dayNetAmtIn', 0)) / 10000  # 万元转亿元
                sz_net = float(result.get('hk2sz', {}).get('dayNetAmtIn', 0)) / 10000
                date_str = result.get('hk2sh', {}).get('date2', datetime.now().strftime("%Y-%m-%d"))

                if sh_net == 0 and sz_net == 0:
                    raise Exception("东方财富历史北向资金返回零值")

                return {
                    "date": date_str,
                    "value": sh_net + sz_net,
                    "shConnect": sh_net,
                    "szConnect": sz_net,
                    "source": "eastmoney_direct_hist",
                    "stale": True,
                }

            except Exception as e:
                print(f"[EastmoneyDirect] 北向资金历史接口也失败: {e}")
                raise
