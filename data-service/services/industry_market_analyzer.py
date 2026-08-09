"""
Industry Market Analyzer - 产业大盘分析服务
为知识图谱产业匹配ETF/指数，分析领域大盘趋势

修复版本：使用MultiSourceProvider提供多数据源智能降级
"""
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import logging
import asyncio
from providers.multi_source_provider import MultiSourceProvider
from services.neo4j_service import Neo4jService
from anthropic import Anthropic
import os

logger = logging.getLogger(__name__)


class IndustryMarketAnalyzer:
    """产业大盘分析器（使用多数据源）"""

    # 产业-ETF/指数映射配置
    INDUSTRY_ETF_MAPPING = {
        "AI芯片": ["159995", "512480", "515980"],  # AI芯片ETF、半导体ETF、芯片ETF
        "算力基础设施": ["516780", "516970"],  # 算力ETF、数据中心ETF
        "AI应用": ["159819", "515700"],  # 人工智能ETF、互联网ETF
        "智能硬件": ["159997", "515710"],  # 消费电子ETF、科技ETF
        "数据中心": ["516970"],  # 数据中心ETF
        "云计算": ["516510", "516630"],  # 云计算ETF、软件ETF
    }

    # 相关指数映射
    INDUSTRY_INDEX_MAPPING = {
        "AI芯片": ["000688", "399006", "399303"],  # 科技龙头、创业板指、国证半导体
        "算力基础设施": ["000688", "931079"],  # 科技龙头、中证算力指数
        "AI应用": ["000688", "399006"],  # 科技龙头、创业板指
        "智能硬件": ["399006", "000688"],  # 创业板指、科技龙头
    }

    def __init__(self):
        # 使用新的多数据源提供者
        self.multi_source = MultiSourceProvider()
        self.neo4j_service = Neo4jService()

        # 初始化Anthropic客户端，使用环境变量配置
        api_key = os.getenv("ANTHROPIC_API_KEY")
        base_url = os.getenv("ANTHROPIC_BASE_URL")

        if base_url:
            self.anthropic = Anthropic(api_key=api_key, base_url=base_url)
        else:
            self.anthropic = Anthropic(api_key=api_key)

    async def analyze_industry_market(
        self,
        industry_id: str,
        industry_name: str,
        analysis_period_days: int = 90
    ) -> Dict[str, Any]:
        """
        分析产业领域的大盘趋势

        Args:
            industry_id: 产业ID
            industry_name: 产业名称
            analysis_period_days: 分析周期（天）

        Returns:
            大盘趋势分析报告
        """
        try:
            # 1. 匹配相关ETF和指数
            etf_codes = self._match_etfs(industry_name)
            index_codes = self._match_indices(industry_name)

            if not etf_codes and not index_codes:
                return {
                    "success": False,
                    "error": "未找到匹配的ETF或指数"
                }

            # 2. 获取ETF数据
            etf_data = await self._fetch_etf_data(
                etf_codes,
                analysis_period_days
            )

            # 3. 获取指数数据
            index_data = await self._fetch_index_data(
                index_codes,
                analysis_period_days
            )

            # 4. 计算关键指标
            etf_analysis = await self._analyze_etfs(etf_data)
            index_analysis = await self._analyze_indices(index_data)

            # 5. AI生成大盘趋势报告
            trend_report = await self._generate_market_report(
                industry_name,
                etf_analysis,
                index_analysis
            )

            return {
                "success": True,
                "industry_id": industry_id,
                "industry_name": industry_name,
                "analysis_period_days": analysis_period_days,
                "etf_analysis": etf_analysis,
                "index_analysis": index_analysis,
                "trend_report": trend_report,
                "analyzed_at": datetime.now().isoformat()
            }

        except Exception as e:
            logger.error(f"Error analyzing industry market: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    def _match_etfs(self, industry_name: str) -> List[str]:
        """匹配相关ETF"""
        # 精确匹配
        if industry_name in self.INDUSTRY_ETF_MAPPING:
            return self.INDUSTRY_ETF_MAPPING[industry_name]

        # 模糊匹配
        for key, codes in self.INDUSTRY_ETF_MAPPING.items():
            if key in industry_name or industry_name in key:
                return codes

        # 默认返回科技类ETF
        return ["515700", "159995"]

    def _match_indices(self, industry_name: str) -> List[str]:
        """匹配相关指数"""
        # 精确匹配
        if industry_name in self.INDUSTRY_INDEX_MAPPING:
            return self.INDUSTRY_INDEX_MAPPING[industry_name]

        # 模糊匹配
        for key, codes in self.INDUSTRY_INDEX_MAPPING.items():
            if key in industry_name or industry_name in key:
                return codes

        # 默认返回大盘指数
        return ["000688"]

    async def _fetch_etf_data(
        self,
        etf_codes: List[str],
        period_days: int
    ) -> List[Dict[str, Any]]:
        """获取ETF数据（使用多数据源）"""
        logger.info(f"📊 Fetching ETF data for {len(etf_codes)} ETFs (period: {period_days} days)")

        # 使用多数据源提供者批量获取
        etf_list = await self.multi_source.get_multiple_etf_data(
            etf_codes,
            with_history=True,
            period_days=period_days
        )

        # 转换为旧格式以兼容现有分析逻辑
        etf_data = []
        for etf in etf_list:
            # 构造K线数据
            kline = []
            if etf.get("history"):
                # 有历史数据
                for record in etf["history"]:
                    kline.append({
                        "日期": str(record.get("date", "")),
                        "开盘": float(record.get("open", 0)),
                        "收盘": float(record.get("close", 0)),
                        "最高": float(record.get("high", 0)),
                        "最低": float(record.get("low", 0)),
                        "成交量": float(record.get("volume", 0)),
                        "涨跌幅": float(record.get("pct_chg", 0)),
                    })
            else:
                # 只有实时数据，构造单日K线
                kline.append({
                    "日期": datetime.now().strftime("%Y-%m-%d"),
                    "开盘": etf["current_price"],
                    "收盘": etf["current_price"],
                    "最高": etf["current_price"],
                    "最低": etf["current_price"],
                    "成交量": etf.get("volume", 0),
                    "涨跌幅": etf["change_pct"],
                })

            etf_data.append({
                "code": etf["code"],
                "info": {
                    "基金简称": etf["name"],
                    "基金代码": etf["code"],
                },
                "kline": kline,
                "holdings": [],  # 暂不获取持仓数据
                "is_fallback": etf.get("history_fallback", False) or etf.get("source") in ["cache", "realtime"]
            })

        logger.info(f"✅ Retrieved {len(etf_data)} ETFs successfully")
        return etf_data

    async def _fetch_index_data(
        self,
        index_codes: List[str],
        period_days: int
    ) -> List[Dict[str, Any]]:
        """获取指数数据（使用多数据源）"""
        logger.info(f"📈 Fetching index data for {len(index_codes)} indices")

        # 使用多数据源提供者批量获取
        index_list = await self.multi_source.get_multiple_index_data(index_codes)

        # 转换为旧格式以兼容现有分析逻辑
        index_data = []
        for index in index_list:
            # 构造单日K线数据（指数只用于当前状态分析）
            kline = [{
                "日期": datetime.now().strftime("%Y-%m-%d"),
                "开盘": index["price"],
                "收盘": index["price"],
                "最高": index["price"],
                "最低": index["price"],
                "涨跌幅": index["change_pct"],
            }]

            index_data.append({
                "code": index["code"],
                "kline": kline,
                "is_fallback": index.get("source") in ["fixed_mapping", "cache"]
            })

        logger.info(f"✅ Retrieved {len(index_data)} indices successfully")
        return index_data

    async def _analyze_etfs(
        self,
        etf_data: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """分析ETF数据"""
        analyzed = []

        for etf in etf_data:
            try:
                kline = etf.get('kline', [])
                if not kline:
                    continue

                prices = [k['收盘'] for k in kline if '收盘' in k]
                if not prices:
                    continue

                is_fallback = etf.get('is_fallback', False)

                # 计算指标
                current_price = prices[-1]

                # 对于单日数据，使用涨跌幅字段
                if is_fallback and len(prices) == 1:
                    kline_item = kline[0]
                    price_change = kline_item.get('涨跌幅', 0)
                    volatility = 0  # 单日无法计算波动率
                    max_drawdown = 0  # 单日无法计算回撤
                    ma5 = current_price
                    ma20 = current_price
                    ma60 = current_price
                    rs = 50  # 单日无法计算RSI
                    trend = "uptrend" if price_change > 0 else "downtrend" if price_change < 0 else "sideways"
                else:
                    # 多日历史数据，正常计算
                    price_change = ((prices[-1] - prices[0]) / prices[0]) * 100 if len(prices) > 1 else 0
                    volatility = self._calculate_volatility(prices)
                    max_drawdown = self._calculate_max_drawdown(prices)

                    # 移动平均线
                    ma5 = sum(prices[-5:]) / 5 if len(prices) >= 5 else current_price
                    ma20 = sum(prices[-20:]) / 20 if len(prices) >= 20 else current_price
                    ma60 = sum(prices[-60:]) / 60 if len(prices) >= 60 else current_price

                    # 相对强度
                    rs = self._calculate_relative_strength(prices)

                    # 趋势判断
                    trend = self._determine_trend(prices)

                info = etf.get('info', {})
                analyzed.append({
                    "code": etf['code'],
                    "name": info.get('基金简称', etf['code']),
                    "current_price": round(current_price, 3),
                    "price_change_pct": round(price_change, 2),
                    "volatility": round(volatility, 2),
                    "max_drawdown": round(max_drawdown, 2),
                    "ma5": round(ma5, 3),
                    "ma20": round(ma20, 3),
                    "ma60": round(ma60, 3),
                    "relative_strength": round(rs, 2),
                    "trend": trend,
                    "holdings_count": len(etf.get('holdings', [])),
                    "is_fallback": is_fallback,
                    "data_points": len(prices)
                })

            except Exception as e:
                logger.warning(f"Error analyzing ETF {etf.get('code')}: {e}")
                continue

        return analyzed

    async def _analyze_indices(
        self,
        index_data: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """分析指数数据"""
        analyzed = []

        for index in index_data:
            try:
                kline = index.get('kline', [])
                if not kline:
                    continue

                prices = [k['收盘'] for k in kline if '收盘' in k]
                if not prices:
                    continue

                is_fallback = index.get('is_fallback', False)

                # 计算指标
                current_price = prices[-1]

                # 对于单日数据，使用涨跌幅字段
                if is_fallback and len(prices) == 1:
                    kline_item = kline[0]
                    price_change = kline_item.get('涨跌幅', 0)
                    volatility = 0
                    ma20 = current_price
                    ma60 = current_price
                    trend = "uptrend" if price_change > 0 else "downtrend" if price_change < 0 else "sideways"
                else:
                    # 多日历史数据，正常计算
                    price_change = ((prices[-1] - prices[0]) / prices[0]) * 100 if len(prices) > 1 else 0
                    volatility = self._calculate_volatility(prices)

                    # 移动平均线
                    ma20 = sum(prices[-20:]) / 20 if len(prices) >= 20 else current_price
                    ma60 = sum(prices[-60:]) / 60 if len(prices) >= 60 else current_price

                    # 趋势判断
                    trend = self._determine_trend(prices)

                analyzed.append({
                    "code": index['code'],
                    "current_price": round(current_price, 3),
                    "price_change_pct": round(price_change, 2),
                    "volatility": round(volatility, 2),
                    "ma20": round(ma20, 3),
                    "ma60": round(ma60, 3),
                    "trend": trend,
                    "is_fallback": is_fallback,
                    "data_points": len(prices)
                })

            except Exception as e:
                logger.warning(f"Error analyzing index {index.get('code')}: {e}")
                continue

        return analyzed

    def _calculate_volatility(self, prices: List[float]) -> float:
        """计算波动率"""
        if len(prices) < 2:
            return 0

        returns = []
        for i in range(1, len(prices)):
            ret = (prices[i] - prices[i-1]) / prices[i-1]
            returns.append(ret)

        if not returns:
            return 0

        mean = sum(returns) / len(returns)
        variance = sum((r - mean) ** 2 for r in returns) / len(returns)
        return (variance ** 0.5) * (252 ** 0.5) * 100

    def _calculate_max_drawdown(self, prices: List[float]) -> float:
        """计算最大回撤"""
        if not prices:
            return 0

        max_price = prices[0]
        max_dd = 0

        for price in prices:
            if price > max_price:
                max_price = price
            dd = ((price - max_price) / max_price) * 100
            if dd < max_dd:
                max_dd = dd

        return abs(max_dd)

    def _calculate_relative_strength(self, prices: List[float]) -> float:
        """计算相对强度"""
        if len(prices) < 20:
            return 50

        period = min(14, len(prices) - 1)
        gains = []
        losses = []

        for i in range(len(prices) - period, len(prices)):
            change = prices[i] - prices[i-1]
            if change > 0:
                gains.append(change)
            else:
                losses.append(abs(change))

        avg_gain = sum(gains) / period if gains else 0
        avg_loss = sum(losses) / period if losses else 0

        if avg_loss == 0:
            return 100

        rs = avg_gain / avg_loss
        rsi = 100 - (100 / (1 + rs))
        return rsi

    def _determine_trend(self, prices: List[float]) -> str:
        """判断趋势"""
        if len(prices) < 20:
            return "unknown"

        ma5 = sum(prices[-5:]) / 5
        ma20 = sum(prices[-20:]) / 20
        current = prices[-1]

        if current > ma5 > ma20:
            return "strong_uptrend"
        elif current > ma20:
            return "uptrend"
        elif current < ma5 < ma20:
            return "strong_downtrend"
        elif current < ma20:
            return "downtrend"
        else:
            return "sideways"

    async def _generate_market_report(
        self,
        industry_name: str,
        etf_analysis: List[Dict[str, Any]],
        index_analysis: List[Dict[str, Any]]
    ) -> str:
        """使用AI生成大盘趋势报告"""
        try:
            context = self._build_market_context(
                industry_name,
                etf_analysis,
                index_analysis
            )

            message = self.anthropic.messages.create(
                model=os.getenv("CLAUDE_MODEL", "claude-3-5-sonnet-20241022"),
                max_tokens=2000,
                messages=[
                    {
                        "role": "user",
                        "content": f"""作为资深投资分析师，请基于以下数据分析{industry_name}领域的大盘趋势：

{context}

请从以下维度进行分析：
1. 大盘整体走势
2. ETF表现分析
3. 相关指数对比
4. 技术面分析（均线、趋势、支撑压力等）
5. 投资机会与风险

要求：
- 数据驱动，客观分析
- 突出关键发现
- 给出明确的趋势判断
- 控制在500字以内
"""
                    }
                ]
            )

            report = message.content[0].text
            return report

        except Exception as e:
            logger.error(f"Error generating market report: {e}")
            return f"报告生成失败: {str(e)}"

    def _build_market_context(
        self,
        industry_name: str,
        etf_analysis: List[Dict[str, Any]],
        index_analysis: List[Dict[str, Any]]
    ) -> str:
        """构建市场分析上下文"""
        context = f"产业: {industry_name}\n\n"

        # ETF分析
        if etf_analysis:
            context += "=== 相关ETF ===\n"
            for etf in etf_analysis:
                context += f"{etf['name']} ({etf['code']})\n"
                context += f"  当前价格: {etf['current_price']}\n"
                context += f"  期间涨跌: {etf['price_change_pct']}%\n"
                context += f"  波动率: {etf['volatility']}%\n"
                context += f"  最大回撤: {etf['max_drawdown']}%\n"
                context += f"  趋势: {etf['trend']}\n"
                context += f"  MA5: {etf['ma5']} | MA20: {etf['ma20']} | MA60: {etf['ma60']}\n"
                context += f"  相对强度(RSI): {etf['relative_strength']}\n\n"

        # 指数分析
        if index_analysis:
            context += "=== 相关指数 ===\n"
            for index in index_analysis:
                context += f"指数代码: {index['code']}\n"
                context += f"  当前点位: {index['current_price']}\n"
                context += f"  期间涨跌: {index['price_change_pct']}%\n"
                context += f"  波动率: {index['volatility']}%\n"
                context += f"  趋势: {index['trend']}\n"
                context += f"  MA20: {index['ma20']} | MA60: {index['ma60']}\n\n"

        # 市场统计
        if etf_analysis:
            avg_etf_change = sum(e['price_change_pct'] for e in etf_analysis) / len(etf_analysis)
            positive_etfs = sum(1 for e in etf_analysis if e['price_change_pct'] > 0)

            context += "=== 市场统计 ===\n"
            context += f"ETF平均涨跌: {avg_etf_change:.2f}%\n"
            context += f"上涨ETF占比: {(positive_etfs/len(etf_analysis)*100):.1f}%\n"

        return context
