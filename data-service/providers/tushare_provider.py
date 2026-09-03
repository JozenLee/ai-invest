# Tushare Pro 数据提供者
# 通过 Tushare Promax 聚合接口获取 A 股数据
# 需要配置 TUSHARE_API_URL 和 TUSHARE_API_KEY 环境变量

import asyncio
import os
import requests
import threading
import time
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import pandas as pd

try:
    import tushare as tushare_sdk
except ImportError:
    tushare_sdk = None

from providers.base import DataProvider
from utils.trading_hours import is_trading_hours


_TUSHARE_GATEWAY_SEMAPHORE = threading.Semaphore(
    max(1, int(os.getenv("TUSHARE_MAX_CONCURRENCY", "1")))
)


class TushareProvider(DataProvider):
    """Tushare Promax 数据提供者。

    所有接口统一使用：
    ``GET {TUSHARE_API_URL}/{api}`` + ``X-API-Key``。

    这样新增 Tushare 接口时只需要增加接口名和参数，不再依赖
    SDK 的动态方法、SDK 版本或不同网关对参数的二次限制。
    """

    name = "tushare"

    def __init__(self, token: Optional[str] = None):
        self._api_url = os.getenv("TUSHARE_API_URL", "").rstrip("/")
        self._api_key = os.getenv("TUSHARE_API_KEY", "") or token or ""
        self._sdk_url = os.getenv("TUSHARE_HTTP_URL", "").rstrip("/")
        self._gateway_token = os.getenv("TUSHARE_GATEWAY_TOKEN", "")
        self._transport = os.getenv("TUSHARE_TRANSPORT", "auto").strip().lower()
        self._sdk = None
        if self._should_use_sdk() and tushare_sdk is not None:
            try:
                self._sdk = tushare_sdk.pro_api(
                    self._gateway_token,
                    timeout=float(os.getenv("TUSHARE_TIMEOUT_SECONDS", "30")),
                )
                self._sdk._DataApi__http_url = self._sdk_url
            except Exception as error:
                print(f"[Tushare] SDK 网关初始化失败，将回退 REST: {error}")
        if self._api_url and self._api_key:
            mode = "sdk" if self._sdk is not None else "rest"
            print(f"[Tushare] Promax 聚合接口初始化成功，transport={mode}")
        else:
            print("[Tushare] 未配置 TUSHARE_API_URL/TUSHARE_API_KEY，数据源不可用")

    def _should_use_sdk(self) -> bool:
        """仅在显式配置 ``TUSHARE_TRANSPORT=sdk`` 时使用 SDK。

        Promax 聚合接口的标准调用方式是 REST ``GET /{api}`` 搭配
        ``X-API-Key``。默认/auto 模式不能因为环境中残留了旧 SDK 网关参数
        就切换传输层，否则会绕过已验证可用的聚合接口。
        """
        return self._transport == "sdk"

    @property
    def available(self) -> bool:
        """是否可用"""
        return bool(self._api_url and self._api_key)

    async def _call_api(self, api: str, **params) -> pd.DataFrame:
        """调用 Tushare SDK 或 Promax 聚合接口，并统一返回 DataFrame。"""
        request_timeout = float(params.pop("_timeout_seconds", os.getenv("TUSHARE_TIMEOUT_SECONDS", "30")))
        def normalize(frame: pd.DataFrame) -> pd.DataFrame:
            if "date" in frame.columns and "trade_date" not in frame.columns:
                frame = frame.rename(columns={"date": "trade_date"})
            return frame

        def frame_from_payload(payload: Any) -> pd.DataFrame:
            """兼容 Promax 对 Tushare 返回结果的几种常见包装格式。"""
            if isinstance(payload, pd.DataFrame):
                return normalize(payload)

            if isinstance(payload, dict):
                data = payload.get("data", payload)
                if isinstance(data, dict):
                    fields = data.get("fields") or data.get("columns")
                    rows = next(
                        (
                            data[key]
                            for key in ("items", "rows", "result", "data")
                            if isinstance(data.get(key), list)
                        ),
                        [],
                    )
                    if fields and rows:
                        return normalize(pd.DataFrame(rows, columns=fields))
                    return normalize(pd.DataFrame(rows))
                if isinstance(data, list):
                    return normalize(pd.DataFrame(data))
                return pd.DataFrame()

            if isinstance(payload, list):
                return normalize(pd.DataFrame(payload))
            return pd.DataFrame()

        self._check_available()

        if self._sdk is not None:
            sdk_params = dict(params)
            try:
                return await asyncio.to_thread(self._sdk.query, api, **sdk_params)
            except Exception as error:
                raise RuntimeError(f"Tushare SDK API {api} 调用失败: {error}") from error

        def _request():
            # 网关对 upstream_busy 通常会固定等待约 8 秒；重复重试只会放大
            # 综合分析耗时，应立即交给本地/其他数据源降级。
            busy_retries = max(0, int(os.getenv("TUSHARE_BUSY_RETRIES", "0")))
            with _TUSHARE_GATEWAY_SEMAPHORE:
                for attempt in range(busy_retries + 1):
                    response = requests.get(
                        f"{self._api_url}/{api}",
                        params=params,
                        headers={"X-API-Key": self._api_key},
                        verify=os.getenv("TUSHARE_VERIFY_SSL", "true").lower() != "false",
                        timeout=request_timeout,
                    )
                    if response.status_code == 503 and "upstream concurrency" in response.text.lower():
                        if attempt < busy_retries:
                            time.sleep(1.0 * (attempt + 1))
                            continue
                        raise RuntimeError(f"Tushare API {api} 上游并发受限: {response.text[:240]}")
                    response.raise_for_status()
                    payload = response.json()
                    if isinstance(payload, dict) and payload.get("code") not in (None, 0, "0"):
                        raise RuntimeError(payload.get("msg") or f"Tushare API {api} 返回错误码 {payload.get('code')}")
                    return frame_from_payload(payload)
            raise RuntimeError(f"Tushare API {api} 未返回数据")
        return await asyncio.to_thread(_request)

    async def request_dataframe(self, api: str, **params) -> pd.DataFrame:
        """通过统一的 Promax 鉴权调用任意返回表格的 Tushare 接口。

        新增接口优先复用此方法，避免在其他 Provider 中重新实现 token、URL、
        SSL 和超时处理。
        """
        return await self._call_api(api, **params)

    def _check_available(self):
        """检查是否可用，不可用则抛出异常"""
        if not self.available:
            raise RuntimeError("Tushare Promax 未初始化，请配置 TUSHARE_API_URL 和 TUSHARE_API_KEY")

    # ==================== 指数数据 ====================

    async def get_index_spot(self) -> pd.DataFrame:
        """获取指数实时行情快照

        交易时段使用 Promax 的 rt_k 实时接口；非交易时段使用 index_daily
        返回最近一个交易日的收盘数据。

        不能在交易时段把 index_daily 当作实时行情，否则页面会显示上一交易日
        收盘价并错误标记为实时数据。
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

        # 市场概览是页面首屏接口，不能串行等待 5 个 Tushare 请求。
        # 单个指数失败或超时时跳过该指数，其他指数仍可正常返回。
        request_timeout = float(os.getenv("TUSHARE_MARKET_TIMEOUT_SECONDS", "8"))
        trading = is_trading_hours()

        async def fetch_realtime(code: str) -> Optional[Dict[str, Any]]:
            """通过 rt_k 获取单个指数实时快照。"""
            try:
                df = await asyncio.wait_for(
                    self._call_api("rt_k", ts_code=code),
                    timeout=request_timeout,
                )
                if df.empty:
                    return None

                latest = df.iloc[0]
                pure_code, market = code.split(".")
                ak_code = f"{'sh' if market == 'SH' else 'sz'}{pure_code}"

                def number(*names: str, default: float = 0.0) -> float:
                    for name in names:
                        value = latest.get(name)
                        if value is not None and not pd.isna(value):
                            try:
                                return float(value)
                            except (TypeError, ValueError):
                                continue
                    return default

                price = number("last", "price", "close", "最新价")
                previous_close = number("pre_close", "prev_close", "昨收")
                change = number("change", "chg", "涨跌额", default=price - previous_close)
                change_pct = number(
                    "pct_chg", "percent", "change_pct", "涨跌幅",
                    default=(change / previous_close * 100 if previous_close else 0.0),
                )

                return {
                    "代码": ak_code,
                    "名称": self._get_index_name(code),
                    "最新价": price,
                    "涨跌额": change,
                    "涨跌幅": change_pct,
                    "成交量": number("vol", "volume", "成交量"),
                    "成交额": number("amount", "成交额"),
                    "今开": number("open", "今开"),
                    "最高": number("high", "最高"),
                    "最低": number("low", "最低"),
                    "昨收": previous_close,
                    "数据日期": datetime.now().strftime("%Y-%m-%d"),
                }
            except Exception as e:
                print(f"[Tushare] 获取指数 {code} 实时行情失败: {e}")
                return None

        async def fetch_daily(code: str) -> Optional[Dict[str, Any]]:
            """非交易时段获取最近交易日收盘数据。"""
            today = datetime.now().strftime("%Y%m%d")
            start = (datetime.now() - timedelta(days=10)).strftime("%Y%m%d")
            try:
                df = await asyncio.wait_for(
                    self._call_api("index_daily", ts_code=code, start_date=start, end_date=today),
                    timeout=request_timeout,
                )
                if df.empty:
                    return None

                # 网关不保证排序方向，始终按交易日取最新记录。
                date_column = "trade_date" if "trade_date" in df.columns else "date"
                df = df.sort_values(date_column, ascending=False)
                latest = df.iloc[0]
                pure_code, market = code.split(".")
                ak_code = f"{'sh' if market == 'SH' else 'sz'}{pure_code}"
                trade_date = str(latest.get("trade_date", latest.get("date", "")))
                if len(trade_date) == 8 and trade_date.isdigit():
                    trade_date = f"{trade_date[:4]}-{trade_date[4:6]}-{trade_date[6:]}"

                return {
                    "代码": ak_code,
                    "名称": self._get_index_name(code),
                    "最新价": float(latest.get("close", latest.get("price", 0))),
                    "涨跌额": float(latest.get("change", 0)),
                    "涨跌幅": float(latest.get("pct_chg", 0)),
                    "成交量": float(latest.get("vol", latest.get("volume", 0))),
                    "成交额": float(latest.get("amount", 0)),
                    "今开": float(latest.get("open", 0)),
                    "最高": float(latest.get("high", 0)),
                    "最低": float(latest.get("low", 0)),
                    "昨收": float(latest.get("pre_close", 0)),
                    "数据日期": trade_date,
                }
            except Exception as e:
                print(f"[Tushare] 获取指数 {code} 日线失败: {e}")
                return None

        async def fetch_one(code: str) -> Optional[Dict[str, Any]]:
            return await (fetch_realtime(code) if trading else fetch_daily(code))

        results = await asyncio.gather(*(fetch_one(code) for code in index_codes))
        records = [record for record in results if record is not None]

        return pd.DataFrame(records) if records else pd.DataFrame()

    async def get_index_daily(self, code: str, start_date: str, end_date: str) -> pd.DataFrame:
        """获取指数日K数据

        Args:
            code: 指数代码，如 "sh000001"，会转换为 Tushare 格式 "000001.SH"
        """
        self._check_available()
        ts_code = self._to_ts_code(code)

        df = await self._call_api("index_daily", ts_code=ts_code, start_date=start_date, end_date=end_date)

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
        trading = is_trading_hours()
        for symbol in symbols:
            try:
                ts_code = self._to_ts_code(symbol, default_market="SZ" if symbol.startswith(("0", "3")) else "SH")
                if trading:
                    try:
                        df = await self._call_api("rt_k", ts_code=ts_code)
                    except Exception:
                        df = await self._call_api("daily", ts_code=ts_code, start_date=start, end_date=today)
                else:
                    # 非交易时间没有实时快照，直接取最近交易日日线，避免 rt_k 等待上游超时。
                    df = await self._call_api("daily", ts_code=ts_code, start_date=start, end_date=today)
                if not df.empty:
                    latest = df.iloc[0]
                    records.append({
                        "代码": symbol,
                        "名称": "",
                        "日期": str(latest.get("trade_date") or latest.get("date") or ""),
                        "开盘": float(latest.get("open", latest.get("今开", 0)) or 0),
                        "最高": float(latest.get("high", latest.get("最高", 0)) or 0),
                        "最低": float(latest.get("low", latest.get("最低", 0)) or 0),
                        "最新价": float(latest.get("close", 0)),
                        "涨跌额": float(latest.get("change", 0)),
                        "涨跌幅": float(latest.get("pct_chg", 0)),
                        "成交量": float(latest.get("vol", latest.get("volume", 0))),
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

        df = await self._call_api("daily", ts_code=ts_code, start_date=start_date, end_date=end_date)

        if not df.empty:
            df = df.rename(columns={"trade_date": "date"})
            df["date"] = pd.to_datetime(df["date"])
            df = df.sort_values("date").reset_index(drop=True)

        return df

    async def get_stock_kline(
        self,
        ticker: str,
        period: str = "daily",
        start_date: str = "",
        end_date: str = "",
    ) -> pd.DataFrame:
        """获取股票日/周/月 K 线，统一走 Promax。"""
        self._check_available()
        endpoint = {"daily": "daily", "weekly": "weekly", "monthly": "monthly"}.get(period)
        if not endpoint:
            raise ValueError(f"Tushare 不支持 K 线周期: {period}")

        ts_code = self._to_ts_code(
            ticker,
            default_market="SZ" if ticker.startswith(("0", "2", "3")) else "SH",
        )
        frame = await self._call_api(
            endpoint,
            ts_code=ts_code,
            start_date=str(start_date).replace("-", ""),
            end_date=str(end_date).replace("-", ""),
        )
        if not frame.empty:
            frame = frame.rename(columns={"trade_date": "date"})
            if "date" in frame.columns:
                frame["date"] = pd.to_datetime(frame["date"], errors="coerce")
                frame = frame.sort_values("date").reset_index(drop=True)
        return frame

    # ==================== ETF 数据 ====================

    async def get_etf_realtime(self, symbols: List[str]) -> pd.DataFrame:
        """获取ETF实时行情

        通过 fund_daily 获取最新数据模拟。
        """
        self._check_available()

        today = datetime.now().strftime("%Y%m%d")
        start = (datetime.now() - timedelta(days=10)).strftime("%Y%m%d")

        records = []
        trading = is_trading_hours()
        for symbol in symbols:
            try:
                # ETF 代码格式：510300.SH / 159919.SZ
                ts_code = self._to_ts_code(symbol, default_market="SH" if symbol.startswith("5") else "SZ")
                if trading:
                    try:
                        df = await self._call_api("rt_k", ts_code=ts_code)
                    except Exception:
                        df = await self._call_api("fund_daily", ts_code=ts_code, start_date=start, end_date=today)
                else:
                    # 非交易时间使用最近交易日的 ETF 日线，不调用实时快照接口。
                    df = await self._call_api("fund_daily", ts_code=ts_code, start_date=start, end_date=today)
                if not df.empty:
                    latest = df.iloc[0]
                    records.append({
                        "代码": symbol,
                        "名称": "",
                        "最新价": float(latest.get("close", latest.get("price", 0))),
                        "涨跌幅": float(latest.get("pct_chg", 0)),
                        "成交量": float(latest.get("vol", latest.get("volume", 0))),
                        "成交额": float(latest.get("amount", 0)),
                    })
            except Exception as e:
                print(f"[Tushare] 获取 ETF {symbol} 失败: {e}")
                continue

        return pd.DataFrame(records) if records else pd.DataFrame()

    async def get_etf_scale(self, ticker: str) -> Optional[Dict[str, Any]]:
        """获取 ETF 最新份额，供上层计算可用于排序的规模值。

        Tushare fund_share 的 fd_share 单位由接口定义保持原样；规模只用于同批
        ETF 的相对排序，因此使用份额×最新价即可避免缺失规模字段导致排序失真。
        """
        self._check_available()
        ts_code = self._to_ts_code(ticker, default_market="SH" if ticker.startswith("5") else "SZ")
        end_date = datetime.now().strftime("%Y%m%d")
        start_date = (datetime.now() - timedelta(days=30)).strftime("%Y%m%d")
        frame = await self.request_dataframe(
            "fund_share",
            ts_code=ts_code,
            start_date=start_date,
            end_date=end_date,
        )
        if frame.empty:
            return None

        share_column = next(
            (column for column in ("fd_share", "share", "shares", "份额") if column in frame.columns),
            None,
        )
        if share_column is None:
            return None
        frame = frame.copy()
        frame[share_column] = pd.to_numeric(frame[share_column], errors="coerce")
        frame = frame.dropna(subset=[share_column])
        if frame.empty:
            return None
        if "trade_date" in frame.columns:
            frame["trade_date"] = pd.to_datetime(frame["trade_date"], errors="coerce")
            frame = frame.sort_values("trade_date")
        latest = frame.iloc[-1]
        shares = float(latest[share_column])
        if shares <= 0:
            return None
        return {
            "shares": shares,
            "market_value": None,
            "source": "tushare_fund_share",
        }

    async def get_etf_daily(self, ticker: str, start_date: str, end_date: str) -> pd.DataFrame:
        """获取ETF日K数据"""
        self._check_available()

        ts_code = self._to_ts_code(ticker, default_market="SH" if ticker.startswith("5") else "SZ")

        df = await self._call_api("fund_daily", ts_code=ts_code, start_date=start_date, end_date=end_date)

        if not df.empty:
            df = df.rename(columns={
                "trade_date": "date",
                "vol": "volume",
            })
            if "date" in df.columns:
                df["date"] = pd.to_datetime(df["date"], errors="coerce")
            for column in ("open", "high", "low", "close", "volume", "amount", "pct_chg"):
                if column in df.columns:
                    df[column] = pd.to_numeric(df[column], errors="coerce")
            df = df.sort_values("date").reset_index(drop=True)

        return df

    # ==================== 资金流向 ====================

    async def get_market_capital_flow(self) -> Dict:
        """获取大盘资金流向

        Promax 的 moneyflow_mkt_dc 按单个交易日查询；传入 start_date/end_date
        会触发网关超时。
        """
        self._check_available()

        current = datetime.now()
        while current.weekday() >= 5:
            current -= timedelta(days=1)
        trade_date = current.strftime("%Y%m%d")
        df = await self._call_api("moneyflow_mkt_dc", trade_date=trade_date)

        if not df.empty:
            date_column = "trade_date" if "trade_date" in df.columns else "date"
            df = df.sort_values(date_column, ascending=False)
            latest = df.iloc[0]
            net_amount = float(latest.get("net_amount", latest.get("net_mf_amount", 0)) or 0)
            # DC 接口的 buy_*_amount 字段是各档位净流入额，不是买入总额。
            main_net = net_amount
            mid_net = float(latest.get("buy_md_amount", latest.get("net_md_amount", 0)) or 0)
            small_net = float(latest.get("buy_sm_amount", latest.get("net_sm_amount", 0)) or 0)
            return {
                "主力净流入-净额": main_net,
                "主力净流入-净占比": 0.0,  # Tushare 不直接提供占比
                "中单净流入-净额": mid_net,
                "小单净流入-净额": small_net,
                "日期": str(latest.get("trade_date", trade_date)),
                "source": "tushare_moneyflow",
            }

        raise Exception("Tushare 大盘资金流向数据为空")

    async def get_sector_capital_flow(self, indicator: str = "今日") -> List[Dict]:
        """获取行业/概念资金流向并统一金额单位为元。"""
        self._check_available()
        day_count = {"今日": 1, "3日": 3, "5日": 5, "10日": 10}.get(indicator, 1)
        end = datetime.now().strftime("%Y%m%d")
        start = (datetime.now() - timedelta(days=day_count + 10)).strftime("%Y%m%d")
        frame = pd.DataFrame()
        last_error = None
        # THS 接口返回行业分类；DC 接口可能同时包含概念、指数和互联互通分类，
        # 因此仅作为 Tushare 内部的兼容回退。
        for api in ("moneyflow_ind_ths", "moneyflow_ind_dc"):
            dc_params = {"content_type": "行业"} if api == "moneyflow_ind_dc" else {}
            for params in ({"trade_date": end, **dc_params}, {"start_date": start, "end_date": end, **dc_params}):
                try:
                    frame = await self._call_api(api, **params)
                    if not frame.empty:
                        break
                except Exception as error:
                    last_error = error
            if not frame.empty:
                break
        if frame.empty:
            raise last_error or Exception("Tushare 板块资金流向数据为空")

        latest_date = end
        name_col = next((c for c in ("name", "industry", "sector", "ts_code") if c in frame.columns), None)
        net_col = next((c for c in ("net_amount", "net_mf_amount", "net_amount_x") if c in frame.columns), None)
        pct_col = next((c for c in ("pct_change", "pct_chg", "change_pct") if c in frame.columns), None)
        if not name_col or not net_col:
            raise ValueError(f"Tushare 板块资金流向字段不兼容: {list(frame.columns)}")

        if "trade_date" in frame.columns:
            frame["trade_date"] = frame["trade_date"].astype(str)
            latest_date = frame["trade_date"].max()
            if day_count == 1:
                frame = frame[frame["trade_date"] == latest_date]
            else:
                valid_dates = sorted(frame["trade_date"].unique())[-day_count:]
                frame = frame[frame["trade_date"].isin(valid_dates)]

        # 交易时段不能把上一交易日的行业资金快照当作“今日”数据。
        # 抛出异常后由注册表继续尝试 AKShare，避免旧数据遮蔽备用实时源。
        if is_trading_hours() and day_count == 1:
            today = datetime.now().strftime("%Y%m%d")
            if latest_date != today:
                raise RuntimeError(f"Tushare 板块资金流向不是当日数据: {latest_date}")

        # 优先保留明确标记为行业的记录；若网关未返回分类字段，则 THS
        # 接口本身视为行业数据，DC 回退时排除明显的指数/互联互通/融资类名称。
        classify_col = next((c for c in ("content_type", "classify", "type", "category") if c in frame.columns), None)
        if classify_col:
            industry_rows = frame[frame[classify_col].astype(str).str.contains("行业", na=False)]
            if not industry_rows.empty:
                frame = industry_rows
        elif api == "moneyflow_ind_dc":
            excluded_keywords = ("融资融券", "深股通", "沪股通", "MSCI", "富时", "中证", "上证", "深成", "大盘")
            frame = frame[~frame[name_col].astype(str).str.contains("|".join(excluded_keywords), case=False, na=False)]

        grouped: Dict[str, Dict[str, Any]] = {}
        latest_trade_date = str(frame["trade_date"].max()) if "trade_date" in frame.columns and not frame.empty else end
        for _, row in frame.iterrows():
            name = str(row.get(name_col) or "").strip()
            if not name:
                continue
            item = grouped.setdefault(name, {"名称": name, "今日主力净流入-净额": 0.0, "今日涨跌幅": 0.0})
            raw_net_amount = float(row.get(net_col, 0) or 0)
            # moneyflow_ind_dc 返回元；moneyflow_ind_ths 返回亿元。
            # 统一转换为元，供增强接口按 1e8 转换为亿元。
            amount_multiplier = 1e8 if api == "moneyflow_ind_ths" else 1.0
            item["今日主力净流入-净额"] += raw_net_amount * amount_multiplier
            if pct_col:
                item["今日涨跌幅"] = float(row.get(pct_col, 0) or 0)
        result = list(grouped.values())
        for item in result:
            item["_source"] = "tushare"
            item["日期"] = latest_trade_date
        return result

    async def get_market_volume_amplification(self, lookback_days: int = 20) -> Dict:
        """使用上证指数日成交额计算真实成交额放大倍数。"""
        self._check_available()
        today = datetime.now().strftime("%Y%m%d")
        start = (datetime.now() - timedelta(days=lookback_days + 20)).strftime("%Y%m%d")
        frame = await self._call_api("index_daily", ts_code="000001.SH", start_date=start, end_date=today)
        if frame.empty or "amount" not in frame.columns:
            raise RuntimeError("Tushare 上证指数成交额数据为空或缺少 amount 字段")
        frame = frame.copy()
        frame["trade_date"] = frame.get("trade_date", "").astype(str)
        frame["amount"] = pd.to_numeric(frame["amount"], errors="coerce")
        frame = frame.dropna(subset=["amount"]).sort_values("trade_date")
        if len(frame) < 2:
            raise RuntimeError("Tushare 上证指数成交额历史数据不足")
        current = float(frame.iloc[-1]["amount"])
        history = frame.iloc[-(lookback_days + 1):-1]["amount"]
        average = float(history.mean()) if not history.empty else current
        amplification = current / average if average > 0 else 1.0
        return {
            "currentVolume": round(current, 2),
            "avgVolume": round(average, 2),
            "amplification": round(amplification, 2),
            "isAmplified": amplification >= 1.5,
            "date": str(frame.iloc[-1]["trade_date"]),
            "source": "tushare",
        }

    async def get_northbound_flow(self) -> Dict:
        """获取北向资金流向

        Tushare moneyflow_hsgt 接口需要 2000+ 积分。
        """
        self._check_available()

        today = datetime.now().strftime("%Y%m%d")
        start = (datetime.now() - timedelta(days=10)).strftime("%Y%m%d")

        frame = pd.DataFrame()
        last_error = None
        for params in ({"trade_date": today}, {"start_date": start, "end_date": today}):
            try:
                candidate = await self._call_api("moneyflow_hsgt", **params)
                frame = candidate

                # Promax/Tushare 在非交易日或当日数据尚未发布时，
                # 可能返回一行字段为空的占位记录。不能仅凭 DataFrame
                # 非空就停止尝试，否则会错过日期范围查询中的有效交易日数据。
                if not candidate.empty and "north_money" in candidate.columns:
                    north_values = pd.to_numeric(
                        candidate["north_money"], errors="coerce"
                    ).fillna(0)
                    if (north_values != 0).any():
                        break
                elif not candidate.empty:
                    # 没有 north_money 字段时也继续尝试备用查询。
                    continue
            except Exception as error:
                last_error = error
                continue

        if not frame.empty:
            if "trade_date" in frame.columns:
                frame = frame.sort_values("trade_date")
            valid_rows = frame[pd.to_numeric(frame.get("north_money"), errors="coerce").fillna(0) != 0]
            if valid_rows.empty:
                raise Exception("Tushare 北向资金返回空值或零值")
            latest = valid_rows.iloc[-1]
            north_money = float(latest.get("north_money", 0))  # 北向资金（万元）
            # Tushare moneyflow_hsgt 使用 hgt/sgt 表示沪股通/深股通。
            # 兼容部分网关返回的 sh_money/sz_money 别名。
            sh_money = float(latest.get("hgt", latest.get("sh_money", 0)) or 0)  # 沪股通（万元）
            sz_money = float(latest.get("sgt", latest.get("sz_money", 0)) or 0)  # 深股通（万元）

            return {
                "date": str(latest.get("trade_date", today)),
                "value": north_money / 10000,  # 万元 → 亿元
                "shConnect": sh_money / 10000,
                "szConnect": sz_money / 10000,
                "source": "tushare_hsgt",
                "unit": "亿元",
                "stale": str(latest.get("trade_date", today)) != today,
            }

        raise last_error or Exception("Tushare 北向资金数据为空")

    async def get_northbound_flow_history(self, days: int = 30) -> List[Dict]:
        """获取北向资金历史数据"""
        self._check_available()

        end = datetime.now().strftime("%Y%m%d")
        start = (datetime.now() - timedelta(days=days + 10)).strftime("%Y%m%d")

        df = await self._call_api("moneyflow_hsgt", start_date=start, end_date=end)

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
                    "shConnect": float(row.get("hgt", row.get("sh_money", 0)) or 0) / 10000,
                    "szConnect": float(row.get("sgt", row.get("sz_money", 0)) or 0) / 10000,
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

        df = await self._call_api("moneyflow", ts_code=ts_code, start_date=start, end_date=today)

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

        df = await self._call_api("margin_detail", start_date=start, end_date=today)

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

    async def get_lhb_data(self) -> List[Dict]:
        """获取最近交易日龙虎榜明细。"""
        self._check_available()
        last_error = None
        for offset in range(0, 11):
            trade_date = (datetime.now() - timedelta(days=offset)).strftime("%Y%m%d")
            try:
                frame = await self._call_api("top_list", trade_date=trade_date)
                if not frame.empty:
                    return self._normalize_lhb(frame)
            except Exception as error:
                last_error = error
        raise last_error or Exception("Tushare 龙虎榜数据为空")

    async def get_lhb_detail(self, date: str) -> List[Dict]:
        """获取指定交易日龙虎榜明细。"""
        self._check_available()
        frame = await self._call_api("top_list", trade_date=str(date).replace("-", ""))
        return self._normalize_lhb(frame)

    @staticmethod
    def _normalize_lhb(frame: pd.DataFrame) -> List[Dict]:
        if frame.empty:
            return []
        records = []
        for row in frame.to_dict("records"):
            record = dict(row)
            record["stock_code"] = record.get("stock_code") or record.get("ts_code") or record.get("代码", "")
            record["stock_name"] = record.get("stock_name") or record.get("name") or record.get("名称", "")
            record["netBuy"] = record.get("netBuy", record.get("net_amount", 0)) or 0
            record["amount"] = record.get("amount", record.get("net_amount", 0)) or 0
            records.append(record)
        return records

    async def get_news(self, keyword: str = "财联社", limit: int = 50, api: str = "news") -> pd.DataFrame:
        """获取 Tushare 新闻资讯并转换为事件页统一字段。"""
        self._check_available()
        endpoint = "major_news" if api in {"major_news", "tushare_major_news"} else "news"
        now = datetime.now()
        params = {
            "start_date": (now - timedelta(days=2)).strftime("%Y%m%d%H%M%S"),
            "end_date": now.strftime("%Y%m%d%H%M%S"),
        }
        source_map = {"财联社": "cls", "新浪财经": "sina", "华尔街见闻": "wallstreetcn"}
        source = source_map.get(keyword, keyword if keyword in {"cls", "sina", "wallstreetcn"} else "")
        if source:
            params["src"] = source
        frame = await self._call_api(endpoint, **params)
        if frame.empty:
            return frame

        def first(row: Dict[str, Any], *keys: str) -> Any:
            for key in keys:
                if row.get(key) not in (None, ""):
                    return row[key]
            return ""

        rows = []
        # Tushare news / major_news 不接受 limit 参数，统一在本地截取结果。
        for row in frame.to_dict("records")[:max(limit, 0)]:
            title = first(row, "title", "新闻标题", "content")
            content = first(row, "content", "新闻内容", "title")
            rows.append({
                "新闻标题": str(title),
                "新闻内容": str(content),
                "新闻链接": str(first(row, "url", "新闻链接")),
                "发布时间": str(first(row, "pub_time", "pubTime", "datetime", "date", "trade_date")),
                "来源": str(first(row, "src", "source")) or "Tushare",
            })
        return pd.DataFrame(rows)

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
