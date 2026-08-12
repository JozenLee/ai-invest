"""
Industry Market Analyzer - 产业大盘分析服务
为知识图谱产业匹配ETF/指数，分析领域大盘趋势

修复版本：使用MultiSourceProvider提供多数据源智能降级
增强版本：集成完整技术指标库
"""
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import logging
import asyncio
from providers.multi_source_provider import MultiSourceProvider
from services.neo4j_service import Neo4jService
from services.technical_indicators import (
    calculate_ma, calculate_ema, calculate_macd, calculate_boll, calculate_dmi,
    calculate_rsi, calculate_kdj, calculate_cci, calculate_wr,
    calculate_obv, calculate_vol_ma, calculate_volatility, calculate_max_drawdown
)
from anthropic import Anthropic
import os

logger = logging.getLogger(__name__)


class IndustryMarketAnalyzer:
    """产业大盘分析器（使用多数据源）"""

    # 产业-ETF/指数映射配置（增强版）
    INDUSTRY_ETF_MAPPING = {
        # AI硬件产业链
        "AI芯片": ["159995", "512480", "515980", "159819"],  # 芯片ETF华夏、半导体ETF、人工智能ETF华富、人工智能ETF易方达
        "AI算力硬件": ["159819", "515070", "512480", "159995"],  # 人工智能ETF易方达、人工智能ETF华夏、半导体ETF、芯片ETF华夏
        "算力基础设施": ["159819", "515070", "516650"],  # 人工智能ETF、人工智能ETF华夏、通信ETF
        "半导体": ["512480", "159813", "159325", "159995"],  # 半导体ETF国联安、半导体ETF鹏华、半导体ETF南方、芯片ETF华夏
        "芯片设计": ["159995", "512480", "515980"],  # 芯片ETF华夏、半导体ETF、人工智能ETF华富
        "芯片制造": ["512480", "159995", "159813"],  # 半导体ETF、芯片ETF华夏、半导体ETF鹏华
        "芯片封测": ["512480", "159325", "159813"],  # 半导体ETF国联安、半导体ETF南方、半导体ETF鹏华

        # AI应用与软件
        "AI应用": ["159819", "515070", "515700"],  # 人工智能ETF易方达、人工智能ETF华夏、互联网ETF
        "云计算": ["516510", "516630", "515220"],  # 云计算ETF、软件ETF、5G ETF
        "大模型": ["159819", "515070", "516510"],  # 人工智能ETF易方达、人工智能ETF华夏、云计算ETF
        "AIGC": ["159819", "515070", "515700"],  # 人工智能ETF易方达、人工智能ETF华夏、互联网ETF

        # 智能硬件与终端
        "智能硬件": ["159997", "515710", "159992"],  # 消费电子ETF、科技ETF、创新药ETF
        "消费电子": ["159997", "515710"],  # 消费电子ETF、科技ETF
        "智能汽车": ["516390", "159806", "515030"],  # 智能汽车ETF、新能源车ETF、新能源ETF

        # 基础设施
        "数据中心": ["516970", "516650", "159819"],  # 数据中心ETF、通信ETF、人工智能ETF
        "网络设备": ["516650", "515220"],  # 通信ETF、5G ETF
        "服务器": ["516970", "159819"],  # 数据中心ETF、人工智能ETF

        # 通用科技
        "科技": ["515700", "159819", "516510"],  # 互联网ETF、人工智能ETF易方达、云计算ETF
        "互联网": ["515700", "159819"],  # 互联网ETF、人工智能ETF易方达
    }

    # 相关指数映射（增强版）
    INDUSTRY_INDEX_MAPPING = {
        # AI硬件产业链
        "AI芯片": ["000688", "399006", "399303", "931079"],  # 科创50、创业板指、国证半导体、中证算力
        "AI算力硬件": ["000688", "399303", "931079", "399006"],  # 科创50、国证半导体、中证算力、创业板指
        "算力基础设施": ["000688", "931079", "399006"],  # 科创50、中证算力、创业板指
        "半导体": ["399303", "000688", "399006"],  # 国证半导体、科创50、创业板指
        "芯片设计": ["399303", "000688"],  # 国证半导体、科创50
        "芯片制造": ["399303", "000688"],  # 国证半导体、科创50
        "芯片封测": ["399303", "000688"],  # 国证半导体、科创50

        # AI应用与软件
        "AI应用": ["000688", "399006", "000300"],  # 科创50、创业板指、沪深300
        "云计算": ["000688", "399006"],  # 科创50、创业板指
        "大模型": ["000688", "399006"],  # 科创50、创业板指
        "AIGC": ["000688", "399006"],  # 科创50、创业板指

        # 智能硬件与终端
        "智能硬件": ["399006", "000688", "000300"],  # 创业板指、科创50、沪深300
        "消费电子": ["399006", "000300"],  # 创业板指、沪深300
        "智能汽车": ["399006", "000300"],  # 创业板指、沪深300

        # 基础设施
        "数据中心": ["000688", "931079"],  # 科创50、中证算力
        "网络设备": ["000688", "000300"],  # 科创50、沪深300
        "服务器": ["000688", "931079"],  # 科创50、中证算力

        # 通用科技
        "科技": ["000688", "399006", "000300"],  # 科创50、创业板指、沪深300
        "互联网": ["000688", "399006"],  # 科创50、创业板指
    }

    # 关键词映射表（用于模糊匹配）
    INDUSTRY_KEYWORDS = {
        "AI芯片": ["AI", "芯片", "半导体", "GPU", "NPU", "算力芯片"],
        "AI算力硬件": ["AI", "算力", "硬件", "芯片", "GPU", "服务器", "半导体"],
        "算力基础设施": ["算力", "数据中心", "服务器", "基础设施", "云计算"],
        "半导体": ["半导体", "芯片", "集成电路", "IC"],
        "芯片设计": ["芯片", "设计", "IC设计"],
        "芯片制造": ["芯片", "制造", "晶圆", "代工"],
        "芯片封测": ["芯片", "封装", "测试", "封测"],
        "AI应用": ["AI", "应用", "人工智能", "智能"],
        "云计算": ["云", "云计算", "云服务"],
        "大模型": ["大模型", "LLM", "语言模型", "AI模型"],
        "AIGC": ["AIGC", "生成式", "AI内容"],
        "智能硬件": ["智能", "硬件", "终端"],
        "消费电子": ["消费电子", "手机", "电脑", "平板"],
        "智能汽车": ["智能汽车", "自动驾驶", "车联网", "新能源车"],
        "数据中心": ["数据中心", "IDC", "机房"],
        "网络设备": ["网络", "路由", "交换", "通信设备"],
        "服务器": ["服务器", "主机"],
        "科技": ["科技", "技术"],
        "互联网": ["互联网", "网络", "在线"],
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
            # 1. 从知识图谱中获取所有节点的ETF（已去重）
            etf_codes = await self._get_etfs_from_graph(industry_id)

            if not etf_codes:
                return {
                    "success": False,
                    "error": "未从知识图谱中找到匹配的ETF"
                }

            logger.info(f"📊 ETFs from graph (unique): {etf_codes}")

            # 2. 获取ETF数据
            etf_data = await self._fetch_etf_data(
                etf_codes,
                analysis_period_days
            )

            # 3. 获取市场整体数据 - 包含大盘指数和板块资金流向
            market_overview, sector_flow = await asyncio.gather(
                self._fetch_market_overview(),
                self._fetch_sector_capital_flow(),
                return_exceptions=True
            )

            # 处理异常结果
            if isinstance(market_overview, Exception):
                logger.warning(f"Failed to fetch market overview: {market_overview}")
                market_overview = None
            if isinstance(sector_flow, Exception):
                logger.warning(f"Failed to fetch sector flow: {sector_flow}")
                sector_flow = None

            # 4. 计算关键指标
            etf_analysis_raw = await self._analyze_etfs(etf_data)

            # 4.5 过滤无效数据：移除没有足够历史数据的ETF
            etf_analysis = self._filter_valid_data(etf_analysis_raw, min_data_points=20)

            logger.info(f"📊 Data filtering: ETF {len(etf_analysis_raw)} → {len(etf_analysis)}")

            # 5. 评估数据质量和计算量化评分（只基于ETF数据）
            data_quality = self._assess_data_quality(etf_analysis, [])
            quantitative_scores = self._calculate_quantitative_scores(etf_analysis, [])

            # ⚠️ 数据质量检查：如果数据质量太低，返回明确错误
            if data_quality["level"] == "低":
                error_msg = f"数据质量不足，无法生成可靠分析。{data_quality['summary']}"
                logger.warning(f"⚠️ {error_msg}")

                # 构建详细的错误说明
                issues_detail = "\n".join([f"- {issue}" for issue in data_quality.get("issues", [])])

                return {
                    "success": False,
                    "error": error_msg,
                    "error_detail": f"数据质量问题：\n{issues_detail}\n\n建议：\n1. 配置Tushare Token以获取稳定的历史数据\n2. 检查网络连接和代理设置\n3. 稍后重试",
                    "data_quality": data_quality,
                    "etf_analysis": etf_analysis
                }

            # 6. AI生成大盘趋势报告（传入市场指数和板块数据）
            trend_report = await self._generate_market_report(
                industry_name,
                etf_analysis,
                [],  # 不再传入index_analysis
                market_overview,
                sector_flow
            )

            return {
                "success": True,
                "industry_id": industry_id,
                "industry_name": industry_name,
                "analysis_period_days": analysis_period_days,
                "etf_analysis": etf_analysis,
                "index_analysis": [],  # 空列表，保持接口兼容
                "data_quality": data_quality,
                "quantitative_scores": quantitative_scores,
                "trend_report": trend_report,
                "analyzed_at": datetime.now().isoformat()
            }

        except Exception as e:
            logger.error(f"Error analyzing industry market: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    async def _get_etfs_from_graph(self, industry_id: str) -> List[str]:
        """
        从知识图谱中获取产业的所有ETF代码（去重）

        Args:
            industry_id: 产业ID

        Returns:
            去重后的ETF代码列表
        """
        try:
            import json
            async with self.neo4j_service.session() as s:
                query = """
                MATCH (ind:Industry {id: $industry_id})-[:HAS_STAGE]->(stage:Stage)-[:HAS_SEGMENT]->(seg:Segment)
                WHERE seg.matched_etfs IS NOT NULL AND seg.matched_etfs <> '[]'
                RETURN seg.name as segment_name, seg.matched_etfs as matched_etfs
                """
                result = await s.run(query, industry_id=industry_id)
                records = await result.data()

                all_etf_codes = []
                for record in records:
                    etfs = json.loads(record["matched_etfs"]) if isinstance(record["matched_etfs"], str) else record["matched_etfs"]

                    # 提取ETF代码（支持两种格式）
                    if isinstance(etfs, list) and len(etfs) > 0:
                        if isinstance(etfs[0], dict):
                            # 字典格式: [{"code": "159998", "name": "xxx", ...}]
                            codes = [etf.get('code') for etf in etfs if isinstance(etf, dict) and etf.get('code')]
                            all_etf_codes.extend(codes)
                            logger.debug(f"  - {record['segment_name']}: {codes}")
                        else:
                            # 字符串格式: ["159998", "159586"]
                            all_etf_codes.extend(etfs)
                            logger.debug(f"  - {record['segment_name']}: {etfs}")

                # 去重
                unique_etf_codes = list(set(all_etf_codes))
                logger.info(f"从知识图谱获取ETF: 总共 {len(all_etf_codes)} 个, 去重后 {len(unique_etf_codes)} 个")

                return unique_etf_codes

        except Exception as e:
            logger.error(f"Failed to get ETFs from graph: {e}")
            return []


    def _match_etfs(self, industry_name: str) -> List[str]:
        """匹配相关ETF（增强版：支持关键词权重打分）"""
        # 精确匹配
        if industry_name in self.INDUSTRY_ETF_MAPPING:
            logger.info(f"✅ Exact match for '{industry_name}': {self.INDUSTRY_ETF_MAPPING[industry_name]}")
            return self.INDUSTRY_ETF_MAPPING[industry_name]

        # 关键词模糊匹配（权重打分）
        best_match = None
        best_score = 0

        for key, codes in self.INDUSTRY_ETF_MAPPING.items():
            score = self._calculate_match_score(industry_name, key)
            if score > best_score:
                best_score = score
                best_match = codes

        # 如果匹配分数足够高（>30），使用匹配结果
        if best_score > 30:
            logger.info(f"🎯 Fuzzy match for '{industry_name}': score={best_score}, codes={best_match}")
            return best_match

        # 默认返回科技类ETF
        logger.warning(f"⚠️ No good match for '{industry_name}', using default tech ETFs")
        return ["515700", "159995"]

    def _match_indices(self, industry_name: str) -> List[str]:
        """匹配相关指数（增强版：支持关键词权重打分）"""
        # 精确匹配
        if industry_name in self.INDUSTRY_INDEX_MAPPING:
            logger.info(f"✅ Exact match for '{industry_name}': {self.INDUSTRY_INDEX_MAPPING[industry_name]}")
            return self.INDUSTRY_INDEX_MAPPING[industry_name]

        # 关键词模糊匹配（权重打分）
        best_match = None
        best_score = 0

        for key, codes in self.INDUSTRY_INDEX_MAPPING.items():
            score = self._calculate_match_score(industry_name, key)
            if score > best_score:
                best_score = score
                best_match = codes

        # 如果匹配分数足够高（>30），使用匹配结果
        if best_score > 30:
            logger.info(f"🎯 Fuzzy match for '{industry_name}': score={best_score}, codes={best_match}")
            return best_match

        # 默认返回大盘指数
        logger.warning(f"⚠️ No good match for '{industry_name}', using default indices")
        return ["000688", "399006"]

    def _calculate_match_score(self, industry_name: str, mapping_key: str) -> int:
        """计算产业名称与映射键的匹配分数

        匹配规则：
        1. 完全包含关系：+50分
        2. 关键词匹配：每个关键词 +10分
        3. 部分字符匹配：+5分
        """
        score = 0

        # 规则1: 完全包含关系
        if mapping_key in industry_name or industry_name in mapping_key:
            score += 50

        # 规则2: 关键词匹配
        if mapping_key in self.INDUSTRY_KEYWORDS:
            keywords = self.INDUSTRY_KEYWORDS[mapping_key]
            for keyword in keywords:
                if keyword.lower() in industry_name.lower():
                    score += 10

        # 规则3: 部分字符匹配
        common_chars = set(industry_name) & set(mapping_key)
        score += len(common_chars) * 5

        return score

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
                history_records = etf["history"]
                for i, record in enumerate(history_records):
                    # 兼容中英文key
                    close_val = record.get("收盘") or record.get("close", 0)
                    open_val = record.get("开盘") or record.get("open", 0)
                    high_val = record.get("最高") or record.get("high", 0)
                    low_val = record.get("最低") or record.get("low", 0)
                    volume_val = record.get("成交量") or record.get("volume", 0)
                    date_val = record.get("日期") or record.get("date", "")

                    # 计算涨跌幅（如果没有提供）
                    pct_chg = record.get("涨跌幅") or record.get("pct_chg", 0)
                    if pct_chg == 0 and i > 0:
                        # 从前一天计算涨跌幅
                        prev_close = history_records[i-1].get("收盘") or history_records[i-1].get("close", 0)
                        if prev_close > 0 and close_val > 0:
                            pct_chg = ((float(close_val) - float(prev_close)) / float(prev_close)) * 100

                    kline.append({
                        "日期": str(date_val),
                        "开盘": float(open_val) if open_val else 0,
                        "收盘": float(close_val) if close_val else 0,
                        "最高": float(high_val) if high_val else 0,
                        "最低": float(low_val) if low_val else 0,
                        "成交量": float(volume_val) if volume_val else 0,
                        "涨跌幅": float(pct_chg) if pct_chg else 0,
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
                "is_fallback": etf.get("history_fallback", False) and len(kline) < 30  # 只有当历史数据不足30天时才标记为降级
            })

        logger.info(f"✅ Retrieved {len(etf_data)} ETFs successfully")
        return etf_data

    async def _fetch_index_data(
        self,
        index_codes: List[str],
        period_days: int
    ) -> List[Dict[str, Any]]:
        """获取指数历史数据（使用多数据源）"""
        logger.info(f"📈 Fetching index history for {len(index_codes)} indices (period: {period_days} days)")

        # 计算日期范围
        end_date = datetime.now().strftime("%Y%m%d")
        start_date = (datetime.now() - timedelta(days=period_days)).strftime("%Y%m%d")

        # 批量获取指数历史数据
        index_data = []
        for code in index_codes:
            try:
                # 使用新的 get_index_history 方法
                index_hist = await self.multi_source.get_index_history(
                    code,
                    start_date,
                    end_date
                )

                if index_hist and index_hist.get("history"):
                    # 转换为标准K线格式
                    kline = []
                    for record in index_hist["history"]:
                        kline.append({
                            "日期": str(record.get("日期", "")),
                            "开盘": float(record.get("开盘", 0)),
                            "收盘": float(record.get("收盘", 0)),
                            "最高": float(record.get("最高", 0)),
                            "最低": float(record.get("最低", 0)),
                            "成交量": float(record.get("成交量", 0)),
                            "涨跌幅": float(record.get("涨跌幅", 0))
                        })

                    index_data.append({
                        "code": code,
                        "name": index_hist.get("name", code),
                        "kline": kline,
                        "is_fallback": index_hist.get("source") in ["fallback_spot", "fixed_mapping"],
                        "data_points": index_hist.get("data_points", len(kline)),
                        "source": index_hist.get("source", "unknown")
                    })
                else:
                    logger.warning(f"⚠️ No history data for index {code}")

            except Exception as e:
                logger.error(f"Failed to get index history for {code}: {e}")
                continue

        logger.info(f"✅ Retrieved {len(index_data)} indices with history data")
        return index_data

    async def _fetch_market_overview(self) -> Optional[Dict[str, Any]]:
        """获取市场概览（大盘指数当日表现）"""
        try:
            import aiohttp
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    "http://localhost:8000/api/market/overview",
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        if data.get("success") and data.get("data"):
                            logger.info("✅ Retrieved market overview")
                            return data["data"]
            return None
        except Exception as e:
            logger.warning(f"Failed to fetch market overview: {e}")
            return None

    # 已移除：_fetch_capital_flow 方法
    # 根据需求，不再获取主力和北向资金流向数据
    # async def _fetch_capital_flow(self) -> Optional[Dict[str, Any]]:
    #     """获取资金流向（主力、北向资金）"""
    #     ...

    async def _fetch_sector_capital_flow(self) -> Optional[Dict[str, Any]]:
        """获取板块资金流向（TOP10流入和流出）"""
        try:
            import aiohttp
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    "http://localhost:8000/api/capital-flow/advanced/enhanced",
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        if data.get("success") and data.get("data"):
                            logger.info("✅ Retrieved sector capital flow (TOP10 inflow & outflow)")
                            # 返回完整的板块数据结构
                            return {
                                "topInflowSectors": data["data"].get("topInflowSectors", []),
                                "topOutflowSectors": data["data"].get("topOutflowSectors", [])
                            }
            return None
        except Exception as e:
            logger.warning(f"Failed to fetch sector capital flow: {e}")
            return None

    async def _analyze_etfs(
        self,
        etf_data: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """分析ETF数据（使用完整技术指标库）"""
        analyzed = []

        for etf in etf_data:
            try:
                kline = etf.get('kline', [])
                if not kline:
                    logger.warning(f"ETF {etf.get('code')}: 无K线数据")
                    continue

                # 提取完整价格序列（兼容中英文列名）
                closes = []
                highs = []
                lows = []
                volumes = []

                for k in kline:
                    close_val = k.get('收盘') or k.get('close', 0)
                    high_val = k.get('最高') or k.get('high', 0)
                    low_val = k.get('最低') or k.get('low', 0)
                    volume_val = k.get('成交量') or k.get('volume', 0)

                    if close_val > 0:
                        closes.append(float(close_val))
                        highs.append(float(high_val) if high_val > 0 else float(close_val))
                        lows.append(float(low_val) if low_val > 0 else float(close_val))
                        volumes.append(float(volume_val) if volume_val else 0)

                if not closes:
                    logger.warning(f"ETF {etf.get('code')}: 无收盘价数据")
                    continue

                is_fallback = etf.get('is_fallback', False)
                current_price = closes[-1]

                # 基础指标
                info = etf.get('info', {})
                result = {
                    "code": etf['code'],
                    "name": info.get('基金简称', etf['code']),
                    "current_price": round(current_price, 3),
                    "data_points": len(closes),
                    "is_fallback": is_fallback,
                    "holdings_count": len(etf.get('holdings', [])),
                }

                # 单日数据降级处理
                if is_fallback and len(closes) == 1:
                    kline_item = kline[0]
                    result.update({
                        "price_change_pct": round(kline_item.get('涨跌幅', 0), 2),
                        "trend": "uptrend" if kline_item.get('涨跌幅', 0) > 0 else "downtrend" if kline_item.get('涨跌幅', 0) < 0 else "sideways",
                        # 所有技术指标设为None
                        "volatility": None,
                        "max_drawdown": None,
                        "ma5": None, "ma10": None, "ma20": None, "ma60": None,
                        "macd_dif": None, "macd_dea": None, "macd_macd": None,
                        "boll_upper": None, "boll_mid": None, "boll_lower": None,
                        "boll_bandwidth": None, "boll_percent_b": None,
                        "dmi_pdi": None, "dmi_mdi": None, "dmi_adx": None, "dmi_adxr": None,
                        "rsi": None,
                        "kdj_k": None, "kdj_d": None, "kdj_j": None,
                        "cci": None,
                        "wr": None,
                        "obv": None,
                        "vol_ma5": None, "vol_ma20": None,
                    })
                    # 转换为嵌套结构
                    nested_result = self._transform_to_nested_structure(result)
                    analyzed.append(nested_result)
                    continue

                # 多日历史数据 - 计算完整技术指标
                try:
                    # 期间涨跌幅（整个分析周期的累计涨跌）
                    if len(closes) > 1 and closes[0] != 0:
                        price_change = ((closes[-1] - closes[0]) / closes[0]) * 100
                    else:
                        price_change = 0
                    result["price_change_pct"] = round(price_change, 2)

                    # 当日涨跌幅（从K线数据最后一条记录提取）
                    if len(kline) > 0:
                        last_day = kline[-1]
                        daily_change = last_day.get('涨跌幅') or last_day.get('pct_chg', 0)
                        result["daily_change_pct"] = round(float(daily_change), 2) if daily_change else 0
                    else:
                        result["daily_change_pct"] = 0

                    # 趋势类指标
                    if len(closes) >= 60:
                        # 移动平均线
                        ma_result = calculate_ma(closes, [5, 10, 20, 60])
                        result["ma5"] = round(ma_result['ma5'][-1], 3) if ma_result['ma5'][-1] is not None else None
                        result["ma10"] = round(ma_result['ma10'][-1], 3) if ma_result['ma10'][-1] is not None else None
                        result["ma20"] = round(ma_result['ma20'][-1], 3) if ma_result['ma20'][-1] is not None else None
                        result["ma60"] = round(ma_result['ma60'][-1], 3) if ma_result['ma60'][-1] is not None else None

                        # MACD
                        macd_result = calculate_macd(closes)
                        result["macd_dif"] = round(macd_result['dif'][-1], 4) if macd_result['dif'][-1] is not None else None
                        result["macd_dea"] = round(macd_result['dea'][-1], 4) if macd_result['dea'][-1] is not None else None
                        result["macd_macd"] = round(macd_result['macd'][-1], 4) if macd_result['macd'][-1] is not None else None

                        # 布林带
                        boll_result = calculate_boll(closes, 20, 2.0)
                        result["boll_upper"] = round(boll_result['upper'][-1], 3) if boll_result['upper'][-1] is not None else None
                        result["boll_mid"] = round(boll_result['middle'][-1], 3) if boll_result['middle'][-1] is not None else None
                        result["boll_lower"] = round(boll_result['lower'][-1], 3) if boll_result['lower'][-1] is not None else None
                        result["boll_bandwidth"] = round(boll_result['bandwidth'][-1], 4) if boll_result['bandwidth'][-1] is not None else None
                        result["boll_percent_b"] = round(boll_result['percentB'][-1], 4) if boll_result['percentB'][-1] is not None else None

                        # DMI
                        dmi_result = calculate_dmi(highs, lows, closes, 14)
                        result["dmi_pdi"] = round(dmi_result['pdi'][-1], 2) if dmi_result['pdi'][-1] is not None else None
                        result["dmi_mdi"] = round(dmi_result['mdi'][-1], 2) if dmi_result['mdi'][-1] is not None else None
                        result["dmi_adx"] = round(dmi_result['adx'][-1], 2) if dmi_result['adx'][-1] is not None else None
                        result["dmi_adxr"] = round(dmi_result['adxr'][-1], 2) if dmi_result['adxr'][-1] is not None else None

                        # 动量类指标
                        # RSI
                        rsi_result = calculate_rsi(closes, 14)
                        result["rsi"] = round(rsi_result[-1], 2) if rsi_result[-1] is not None else None

                        # KDJ
                        kdj_result = calculate_kdj(highs, lows, closes, 9)
                        result["kdj_k"] = round(kdj_result['k'][-1], 2) if kdj_result['k'][-1] is not None else None
                        result["kdj_d"] = round(kdj_result['d'][-1], 2) if kdj_result['d'][-1] is not None else None
                        result["kdj_j"] = round(kdj_result['j'][-1], 2) if kdj_result['j'][-1] is not None else None

                        # CCI
                        cci_result = calculate_cci(highs, lows, closes, 14)
                        result["cci"] = round(cci_result[-1], 2) if cci_result[-1] is not None else None

                        # WR
                        wr_result = calculate_wr(highs, lows, closes, 14)
                        result["wr"] = round(wr_result[-1], 2) if wr_result[-1] is not None else None

                        # 成交量类指标
                        if volumes and sum(volumes) > 0:
                            # OBV
                            obv_result = calculate_obv(closes, volumes)
                            result["obv"] = round(obv_result[-1], 0) if obv_result[-1] is not None else None

                            # 成交量均线
                            vol_ma_result = calculate_vol_ma(volumes, [5, 20])
                            result["vol_ma5"] = round(vol_ma_result['vol_ma5'][-1], 0) if vol_ma_result['vol_ma5'][-1] is not None else None
                            result["vol_ma20"] = round(vol_ma_result['vol_ma20'][-1], 0) if vol_ma_result['vol_ma20'][-1] is not None else None
                        else:
                            result["obv"] = None
                            result["vol_ma5"] = None
                            result["vol_ma20"] = None

                        # 稳定性类指标
                        volatility_val = calculate_volatility(closes, 20)
                        result["volatility"] = round(volatility_val, 2) if volatility_val is not None else None

                        drawdown_result = calculate_max_drawdown(closes)
                        result["max_drawdown"] = round(drawdown_result['max_drawdown'], 2)

                        # 趋势判断（基于均线系统和MACD）
                        result["trend"] = self._determine_trend_enhanced(result)

                    else:
                        # 数据不足60天，部分指标可以计算
                        logger.info(f"ETF {etf['code']}: 数据点数{len(closes)}天 < 60天，部分指标不可用")

                        # 能计算的指标
                        if len(closes) >= 20:
                            ma_result = calculate_ma(closes, [5, 10, 20])
                            result["ma5"] = round(ma_result['ma5'][-1], 3) if ma_result['ma5'][-1] is not None else None
                            result["ma10"] = round(ma_result['ma10'][-1], 3) if ma_result['ma10'][-1] is not None else None
                            result["ma20"] = round(ma_result['ma20'][-1], 3) if ma_result['ma20'][-1] is not None else None
                            result["ma60"] = None

                            boll_result = calculate_boll(closes, 20, 2.0)
                            result["boll_upper"] = round(boll_result['upper'][-1], 3) if boll_result['upper'][-1] is not None else None
                            result["boll_mid"] = round(boll_result['middle'][-1], 3) if boll_result['middle'][-1] is not None else None
                            result["boll_lower"] = round(boll_result['lower'][-1], 3) if boll_result['lower'][-1] is not None else None
                            result["boll_bandwidth"] = round(boll_result['bandwidth'][-1], 4) if boll_result['bandwidth'][-1] is not None else None
                            result["boll_percent_b"] = round(boll_result['percentB'][-1], 4) if boll_result['percentB'][-1] is not None else None
                        else:
                            result.update({
                                "ma5": None, "ma10": None, "ma20": None, "ma60": None,
                                "boll_upper": None, "boll_mid": None, "boll_lower": None,
                                "boll_bandwidth": None, "boll_percent_b": None,
                            })

                        # MACD需要26天
                        if len(closes) >= 26:
                            macd_result = calculate_macd(closes)
                            result["macd_dif"] = round(macd_result['dif'][-1], 4) if macd_result['dif'][-1] is not None else None
                            result["macd_dea"] = round(macd_result['dea'][-1], 4) if macd_result['dea'][-1] is not None else None
                            result["macd_macd"] = round(macd_result['macd'][-1], 4) if macd_result['macd'][-1] is not None else None
                        else:
                            result["macd_dif"] = None
                            result["macd_dea"] = None
                            result["macd_macd"] = None

                        # 其他指标标记为None
                        result.update({
                            "dmi_pdi": None, "dmi_mdi": None, "dmi_adx": None, "dmi_adxr": None,
                            "rsi": None,
                            "kdj_k": None, "kdj_d": None, "kdj_j": None,
                            "cci": None,
                            "wr": None,
                            "obv": None,
                            "vol_ma5": None, "vol_ma20": None,
                            "volatility": None,
                            "max_drawdown": None,
                        })

                        result["trend"] = "unknown"

                except Exception as calc_error:
                    logger.error(f"Error calculating indicators for ETF {etf['code']}: {calc_error}")
                    # 填充None值
                    result.update({
                        "volatility": None, "max_drawdown": None,
                        "ma5": None, "ma10": None, "ma20": None, "ma60": None,
                        "macd_dif": None, "macd_dea": None, "macd_macd": None,
                        "boll_upper": None, "boll_mid": None, "boll_lower": None,
                        "boll_bandwidth": None, "boll_percent_b": None,
                        "dmi_pdi": None, "dmi_mdi": None, "dmi_adx": None, "dmi_adxr": None,
                        "rsi": None,
                        "kdj_k": None, "kdj_d": None, "kdj_j": None,
                        "cci": None, "wr": None,
                        "obv": None, "vol_ma5": None, "vol_ma20": None,
                        "trend": "error"
                    })

                # 转换为嵌套结构
                nested_result = self._transform_to_nested_structure(result)
                analyzed.append(nested_result)

            except Exception as e:
                logger.error(f"Error analyzing ETF {etf.get('code')}: {e}", exc_info=True)
                continue

        return analyzed

    def _filter_valid_data(
        self,
        data_list: List[Dict[str, Any]],
        min_data_points: int = 20
    ) -> List[Dict[str, Any]]:
        """
        过滤无效数据：移除数据点数不足的ETF/指数

        Args:
            data_list: ETF或指数分析结果列表
            min_data_points: 最小数据点数要求（默认20天，可计算基本均线和BOLL）

        Returns:
            过滤后的有效数据列表
        """
        if not data_list:
            return []

        valid_data = []
        filtered_out = []

        for item in data_list:
            data_points = item.get('data_points', 0)
            is_fallback = item.get('is_fallback', False)
            code = item.get('code', 'unknown')
            name = item.get('name', 'unknown')

            # 过滤条件：
            # 1. 数据点数不足最小要求
            # 2. 使用降级数据且数据点数 < 30（降级数据质量差）
            if data_points < min_data_points:
                filtered_out.append(f"{name}({code}): 数据点数不足({data_points} < {min_data_points})")
                logger.warning(f"⚠️ Filtering out {name}({code}): insufficient data points ({data_points} < {min_data_points})")
                continue
            elif is_fallback and data_points < 30:
                filtered_out.append(f"{name}({code}): 降级数据质量差({data_points}天)")
                logger.warning(f"⚠️ Filtering out {name}({code}): fallback data with insufficient points ({data_points} < 30)")
                continue

            valid_data.append(item)

        if filtered_out:
            logger.info(f"🔍 Filtered out {len(filtered_out)} items: {'; '.join(filtered_out)}")

        return valid_data

    async def _analyze_indices(
        self,
        index_data: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """分析指数数据（使用完整技术指标库）"""
        analyzed = []

        for index in index_data:
            try:
                kline = index.get('kline', [])
                if not kline:
                    continue

                # 提取完整价格序列（兼容中英文列名）
                closes = []
                highs = []
                lows = []
                volumes = []

                for k in kline:
                    close_val = k.get('收盘') or k.get('close', 0)
                    high_val = k.get('最高') or k.get('high', 0)
                    low_val = k.get('最低') or k.get('low', 0)
                    volume_val = k.get('成交量') or k.get('volume', 0)

                    if close_val > 0:
                        closes.append(float(close_val))
                        highs.append(float(high_val) if high_val > 0 else float(close_val))
                        lows.append(float(low_val) if low_val > 0 else float(close_val))
                        volumes.append(float(volume_val) if volume_val else 0)

                if not closes:
                    continue

                is_fallback = index.get('is_fallback', False)
                data_points = index.get('data_points', len(closes))
                current_price = closes[-1]

                # 基础结果
                result = {
                    "code": index['code'],
                    "name": index.get('name', index['code']),
                    "current_price": round(current_price, 3),
                    "data_points": data_points,
                    "is_fallback": is_fallback,
                    "source": index.get('source', 'unknown')
                }

                # 单日数据降级处理
                if data_points == 1 or len(closes) == 1:
                    kline_item = kline[0]
                    result.update({
                        "price_change_pct": round(kline_item.get('涨跌幅', 0), 2),
                        "trend": "uptrend" if kline_item.get('涨跌幅', 0) > 0 else "downtrend" if kline_item.get('涨跌幅', 0) < 0 else "sideways",
                        "volatility": None,
                        "ma5": None, "ma10": None, "ma20": None, "ma60": None,
                        "macd_dif": None, "macd_dea": None, "macd_macd": None,
                        "boll_upper": None, "boll_mid": None, "boll_lower": None,
                        "boll_bandwidth": None, "boll_percent_b": None,
                        "dmi_pdi": None, "dmi_mdi": None, "dmi_adx": None, "dmi_adxr": None,
                        "rsi": None,
                        "kdj_k": None, "kdj_d": None, "kdj_j": None,
                    })
                    # 转换为嵌套结构
                    nested_result = self._transform_to_nested_structure(result)
                    analyzed.append(nested_result)
                    continue

                # 多日历史数据 - 计算技术指标
                try:
                    # 期间涨跌幅（整个分析周期的累计涨跌）
                    if len(closes) > 1 and closes[0] != 0:
                        price_change = ((closes[-1] - closes[0]) / closes[0]) * 100
                    else:
                        price_change = 0
                    result["price_change_pct"] = round(price_change, 2)

                    # 当日涨跌幅（从K线数据最后一条记录提取）
                    if len(kline) > 0:
                        last_day = kline[-1]
                        daily_change = last_day.get('涨跌幅') or last_day.get('pct_chg', 0)
                        result["daily_change_pct"] = round(float(daily_change), 2) if daily_change else 0
                    else:
                        result["daily_change_pct"] = 0

                    # 根据数据量计算指标
                    if len(closes) >= 60:
                        # 完整指标
                        ma_result = calculate_ma(closes, [5, 10, 20, 60])
                        result["ma5"] = round(ma_result['ma5'][-1], 3) if ma_result['ma5'][-1] is not None else None
                        result["ma10"] = round(ma_result['ma10'][-1], 3) if ma_result['ma10'][-1] is not None else None
                        result["ma20"] = round(ma_result['ma20'][-1], 3) if ma_result['ma20'][-1] is not None else None
                        result["ma60"] = round(ma_result['ma60'][-1], 3) if ma_result['ma60'][-1] is not None else None

                        macd_result = calculate_macd(closes)
                        result["macd_dif"] = round(macd_result['dif'][-1], 4) if macd_result['dif'][-1] is not None else None
                        result["macd_dea"] = round(macd_result['dea'][-1], 4) if macd_result['dea'][-1] is not None else None
                        result["macd_macd"] = round(macd_result['macd'][-1], 4) if macd_result['macd'][-1] is not None else None

                        boll_result = calculate_boll(closes, 20, 2.0)
                        result["boll_upper"] = round(boll_result['upper'][-1], 3) if boll_result['upper'][-1] is not None else None
                        result["boll_mid"] = round(boll_result['middle'][-1], 3) if boll_result['middle'][-1] is not None else None
                        result["boll_lower"] = round(boll_result['lower'][-1], 3) if boll_result['lower'][-1] is not None else None
                        result["boll_bandwidth"] = round(boll_result['bandwidth'][-1], 4) if boll_result['bandwidth'][-1] is not None else None
                        result["boll_percent_b"] = round(boll_result['percentB'][-1], 4) if boll_result['percentB'][-1] is not None else None

                        dmi_result = calculate_dmi(highs, lows, closes, 14)
                        result["dmi_pdi"] = round(dmi_result['pdi'][-1], 2) if dmi_result['pdi'][-1] is not None else None
                        result["dmi_mdi"] = round(dmi_result['mdi'][-1], 2) if dmi_result['mdi'][-1] is not None else None
                        result["dmi_adx"] = round(dmi_result['adx'][-1], 2) if dmi_result['adx'][-1] is not None else None
                        result["dmi_adxr"] = round(dmi_result['adxr'][-1], 2) if dmi_result['adxr'][-1] is not None else None

                        rsi_result = calculate_rsi(closes, 14)
                        result["rsi"] = round(rsi_result[-1], 2) if rsi_result[-1] is not None else None

                        kdj_result = calculate_kdj(highs, lows, closes, 9)
                        result["kdj_k"] = round(kdj_result['k'][-1], 2) if kdj_result['k'][-1] is not None else None
                        result["kdj_d"] = round(kdj_result['d'][-1], 2) if kdj_result['d'][-1] is not None else None
                        result["kdj_j"] = round(kdj_result['j'][-1], 2) if kdj_result['j'][-1] is not None else None

                        volatility_val = calculate_volatility(closes, 20)
                        result["volatility"] = round(volatility_val, 2) if volatility_val is not None else None

                        drawdown_result = calculate_max_drawdown(closes)
                        result["max_drawdown"] = round(drawdown_result['max_drawdown'], 2)

                        result["trend"] = self._determine_trend_enhanced(result)

                    elif len(closes) >= 20:
                        # 部分指标
                        ma_result = calculate_ma(closes, [5, 10, 20])
                        result["ma5"] = round(ma_result['ma5'][-1], 3) if ma_result['ma5'][-1] is not None else None
                        result["ma10"] = round(ma_result['ma10'][-1], 3) if ma_result['ma10'][-1] is not None else None
                        result["ma20"] = round(ma_result['ma20'][-1], 3) if ma_result['ma20'][-1] is not None else None
                        result["ma60"] = None

                        if len(closes) >= 26:
                            macd_result = calculate_macd(closes)
                            result["macd_dif"] = round(macd_result['dif'][-1], 4) if macd_result['dif'][-1] is not None else None
                            result["macd_dea"] = round(macd_result['dea'][-1], 4) if macd_result['dea'][-1] is not None else None
                            result["macd_macd"] = round(macd_result['macd'][-1], 4) if macd_result['macd'][-1] is not None else None
                        else:
                            result["macd_dif"] = None
                            result["macd_dea"] = None
                            result["macd_macd"] = None

                        boll_result = calculate_boll(closes, 20, 2.0)
                        result["boll_upper"] = round(boll_result['upper'][-1], 3) if boll_result['upper'][-1] is not None else None
                        result["boll_mid"] = round(boll_result['middle'][-1], 3) if boll_result['middle'][-1] is not None else None
                        result["boll_lower"] = round(boll_result['lower'][-1], 3) if boll_result['lower'][-1] is not None else None
                        result["boll_bandwidth"] = round(boll_result['bandwidth'][-1], 4) if boll_result['bandwidth'][-1] is not None else None
                        result["boll_percent_b"] = round(boll_result['percentB'][-1], 4) if boll_result['percentB'][-1] is not None else None

                        result["dmi_pdi"] = None
                        result["dmi_mdi"] = None
                        result["dmi_adx"] = None
                        result["dmi_adxr"] = None
                        result["rsi"] = None
                        result["kdj_k"] = None
                        result["kdj_d"] = None
                        result["kdj_j"] = None
                        result["volatility"] = None
                        result["max_drawdown"] = None
                        result["trend"] = "unknown"
                    else:
                        # 数据不足
                        result.update({
                            "volatility": None,
                            "max_drawdown": None,
                            "ma5": None, "ma10": None, "ma20": None, "ma60": None,
                            "macd_dif": None, "macd_dea": None, "macd_macd": None,
                            "boll_upper": None, "boll_mid": None, "boll_lower": None,
                            "boll_bandwidth": None, "boll_percent_b": None,
                            "dmi_pdi": None, "dmi_mdi": None, "dmi_adx": None, "dmi_adxr": None,
                            "rsi": None,
                            "kdj_k": None, "kdj_d": None, "kdj_j": None,
                            "trend": "unknown"
                        })

                except Exception as calc_error:
                    logger.error(f"Error calculating indicators for index {index['code']}: {calc_error}")
                    result.update({
                        "volatility": None,
                        "max_drawdown": None,
                        "ma5": None, "ma10": None, "ma20": None, "ma60": None,
                        "macd_dif": None, "macd_dea": None, "macd_macd": None,
                        "boll_upper": None, "boll_mid": None, "boll_lower": None,
                        "boll_bandwidth": None, "boll_percent_b": None,
                        "dmi_pdi": None, "dmi_mdi": None, "dmi_adx": None, "dmi_adxr": None,
                        "rsi": None,
                        "kdj_k": None, "kdj_d": None, "kdj_j": None,
                        "trend": "error"
                    })

                # 转换为嵌套结构
                nested_result = self._transform_to_nested_structure(result)
                analyzed.append(nested_result)

            except Exception as e:
                logger.warning(f"Error analyzing index {index.get('code')}: {e}")
                continue

        return analyzed

    @staticmethod
    def _transform_to_nested_structure(flat_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        将扁平化的技术指标数据转换为嵌套结构

        Args:
            flat_data: 扁平化数据 (macd_dif, kdj_k, boll_upper等)

        Returns:
            嵌套结构数据 (macd: {dif, dea, macd}, kdj: {k, d, j}等)
        """
        # 复制基础字段
        result = {
            "code": flat_data.get("code"),
            "name": flat_data.get("name"),
            "current_price": flat_data.get("current_price"),
            "price_change_pct": flat_data.get("price_change_pct"),
            "daily_change_pct": flat_data.get("daily_change_pct"),  # 新增：当日涨跌幅

            # 简单指标（保持原样）
            "ma5": flat_data.get("ma5"),
            "ma10": flat_data.get("ma10"),
            "ma20": flat_data.get("ma20"),
            "ma60": flat_data.get("ma60"),
            "rsi": flat_data.get("rsi"),
            "cci": flat_data.get("cci"),
            "wr": flat_data.get("wr"),
            "obv": flat_data.get("obv"),
            "vol_ma5": flat_data.get("vol_ma5"),
            "vol_ma20": flat_data.get("vol_ma20"),
            "volatility": flat_data.get("volatility"),
            "max_drawdown": flat_data.get("max_drawdown"),

            # 元数据
            "trend": flat_data.get("trend"),
            "data_points": flat_data.get("data_points"),
            "is_fallback": flat_data.get("is_fallback", False),
        }

        # 转换复合指标为嵌套对象

        # MACD
        if any(k in flat_data for k in ["macd_dif", "macd_dea", "macd_macd"]):
            result["macd"] = {
                "dif": flat_data.get("macd_dif"),
                "dea": flat_data.get("macd_dea"),
                "macd": flat_data.get("macd_macd"),
            }

        # 布林带
        if any(k in flat_data for k in ["boll_upper", "boll_mid", "boll_lower"]):
            result["boll"] = {
                "upper": flat_data.get("boll_upper"),
                "mid": flat_data.get("boll_mid"),
                "lower": flat_data.get("boll_lower"),
                "bandwidth": flat_data.get("boll_bandwidth"),
                "percent_b": flat_data.get("boll_percent_b"),
            }

        # DMI/ADX
        if any(k in flat_data for k in ["dmi_pdi", "dmi_mdi", "dmi_adx"]):
            result["dmi"] = {
                "pdi": flat_data.get("dmi_pdi"),
                "mdi": flat_data.get("dmi_mdi"),
                "adx": flat_data.get("dmi_adx"),
                "adxr": flat_data.get("dmi_adxr"),
            }

        # KDJ
        if any(k in flat_data for k in ["kdj_k", "kdj_d", "kdj_j"]):
            result["kdj"] = {
                "k": flat_data.get("kdj_k"),
                "d": flat_data.get("kdj_d"),
                "j": flat_data.get("kdj_j"),
            }

        # 添加ETF特有字段（如果存在）
        if "holdings_count" in flat_data:
            result["holdings_count"] = flat_data.get("holdings_count")

        # 添加指数特有字段（如果存在）
        if "source" in flat_data:
            result["source"] = flat_data.get("source")

        return result

    def _determine_trend_enhanced(self, indicators: Dict[str, Any]) -> str:
        """增强版趋势判断（基于均线系统、MACD、RSI等多维度）"""
        try:
            current = indicators.get("current_price")
            ma5 = indicators.get("ma5")
            ma10 = indicators.get("ma10")
            ma20 = indicators.get("ma20")
            ma60 = indicators.get("ma60")
            macd_dif = indicators.get("macd_dif")
            macd_dea = indicators.get("macd_dea")
            rsi = indicators.get("rsi")
            adx = indicators.get("dmi_adx")

            # 如果关键指标缺失，返回未知
            if current is None or ma20 is None:
                return "unknown"

            # 多维度评分
            score = 0

            # 1. 均线系统 (权重40%)
            if ma5 and ma10 and ma20:
                if current > ma5 > ma10 > ma20:
                    score += 40
                elif current > ma20:
                    score += 20
                elif current < ma5 < ma10 < ma20:
                    score -= 40
                elif current < ma20:
                    score -= 20

            # 2. MACD信号 (权重30%)
            if macd_dif is not None and macd_dea is not None:
                if macd_dif > macd_dea and macd_dif > 0:
                    score += 30  # 金叉且在零轴上方
                elif macd_dif > macd_dea:
                    score += 15  # 金叉但在零轴下方
                elif macd_dif < macd_dea and macd_dif < 0:
                    score -= 30  # 死叉且在零轴下方
                elif macd_dif < macd_dea:
                    score -= 15  # 死叉但在零轴上方

            # 3. RSI动量 (权重20%)
            if rsi is not None:
                if rsi > 70:
                    score += 10  # 超买但有动能
                elif rsi > 50:
                    score += 20  # 强势区间
                elif rsi < 30:
                    score -= 10  # 超卖
                elif rsi < 50:
                    score -= 20  # 弱势区间

            # 4. ADX趋势强度 (权重10%)
            if adx is not None:
                if adx > 25:
                    # 趋势强劲，加强现有趋势判断
                    score = score * 1.2 if score != 0 else score
                elif adx < 20:
                    # 趋势不明，减弱现有趋势判断
                    score = score * 0.5

            # 根据综合评分判断趋势
            if score >= 50:
                return "strong_uptrend"
            elif score >= 20:
                return "uptrend"
            elif score <= -50:
                return "strong_downtrend"
            elif score <= -20:
                return "downtrend"
            else:
                return "sideways"

        except Exception as e:
            logger.warning(f"Error in trend determination: {e}")
            return "unknown"

    def _calculate_volatility(self, prices: List[float]) -> float:
        """计算波动率（已废弃，使用technical_indicators模块）"""
        logger.warning("Using deprecated _calculate_volatility, should use technical_indicators.calculate_volatility")
        if len(prices) < 2:
            return 0

        returns = []
        for i in range(1, len(prices)):
            if prices[i-1] != 0:
                ret = (prices[i] - prices[i-1]) / prices[i-1]
                returns.append(ret)

        if not returns:
            return 0

        mean = sum(returns) / len(returns)
        variance = sum((r - mean) ** 2 for r in returns) / len(returns)
        return (variance ** 0.5) * (252 ** 0.5) * 100

    def _calculate_max_drawdown(self, prices: List[float]) -> float:
        """计算最大回撤（已废弃，使用technical_indicators模块）"""
        logger.warning("Using deprecated _calculate_max_drawdown, should use technical_indicators.calculate_max_drawdown")
        if not prices:
            return 0

        max_price = prices[0]
        max_dd = 0

        for price in prices:
            if price > max_price:
                max_price = price
            if max_price != 0:
                dd = ((price - max_price) / max_price) * 100
                if dd < max_dd:
                    max_dd = dd

        return abs(max_dd)

    def _calculate_relative_strength(self, prices: List[float]) -> float:
        """计算相对强度（已废弃，使用technical_indicators.calculate_rsi）"""
        logger.warning("Using deprecated _calculate_relative_strength, should use technical_indicators.calculate_rsi")
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
        """判断趋势（已废弃，使用_determine_trend_enhanced）"""
        logger.warning("Using deprecated _determine_trend, should use _determine_trend_enhanced")
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
        index_analysis: List[Dict[str, Any]],
        market_overview: Optional[Dict[str, Any]] = None,
        sector_flow: Optional[Dict[str, Any]] = None
    ) -> str:
        """使用AI生成大盘趋势报告（增强版：整合市场指数和板块数据）"""
        try:
            # 评估数据质量（只基于ETF）
            data_quality = self._assess_data_quality(etf_analysis, [])

            # 计算量化评分（只基于ETF）
            scores = self._calculate_quantitative_scores(etf_analysis, [])

            # 构建代号说明表（只包含ETF）
            symbol_mapping = self._build_symbol_mapping(etf_analysis, [])

            # 构建增强上下文（包含市场指数和板块数据）
            context = self._build_enhanced_market_context(
                industry_name,
                etf_analysis,
                [],  # 不传入指数分析
                data_quality,
                scores,
                market_overview,
                sector_flow
            )

            message = self.anthropic.messages.create(
                model=os.getenv("CLAUDE_MODEL", "claude-3-5-sonnet-20241022"),
                max_tokens=2500,
                messages=[
                    {
                        "role": "user",
                        "content": f"""作为资深量化投资分析师，请基于完整技术指标体系分析{industry_name}领域的投资价值。

{context}

请按以下结构生成专业分析报告（**必须在开头添加代号说明表**）：

# {industry_name}产业技术分析报告
分析时间：{datetime.now().strftime('%Y-%m-%d %H:%M')}

{symbol_mapping}

---

## 一、数据质量评估
{data_quality["summary"]}

## 二、技术面综合分析

1. **趋势分析（均线系统+MACD）**
   - 均线排列：分析MA5/10/20/60排列状态，判断多空强弱
   - MACD信号：识别金叉/死叉、零轴位置、柱状图变化趋势
   - 布林带：价格相对布林带位置，是否突破上下轨
   - DMI/ADX：趋势方向（+DI vs -DI）和趋势强度（ADX值）

2. **动量分析（RSI+KDJ+CCI+WR）**
   - RSI：超买超卖状态（>70超买，<30超卖），背离信号
   - KDJ：金叉死叉状态，J值超买超卖（>100超买，<0超卖）
   - CCI：强弱势区间（>100强势，<-100弱势）
   - WR：超买超卖水平（>-20超买，<-80超卖）
   - 综合判断：多个动量指标是否共振

3. **成交量分析（OBV+量均线）**
   - OBV趋势：资金流入流出方向
   - 量价关系：价涨量增/价跌量缩等健康状态
   - 量均线：当前成交量相对近期均值

4. **风险评估（波动率+最大回撤）**
   - 波动率水平：低(<15%)、中(15-30%)、高(>30%)
   - 最大回撤：历史回撤幅度，风险承受能力要求

## 三、市场情绪与强弱对比
- ETF当日和期间涨跌分布、平均表现（区分当日和期间数据）
- **市场整体表现（使用上下文中的当日大盘数据）**：
  * 主要指数当日涨跌幅（上证、深证、创业板、科创50、沪深300）
  * 板块资金流向TOP10（包括净流入和净流出板块）
- **板块资金流向分析**：
  * 资金集中流入的板块及其与产业的关联性
  * 资金流出的板块反映的市场避险情绪
  * 板块涨跌幅与资金流向的匹配度（量价配合或背离）
- 板块轮动迹象

## 四、量化评分解读
- 产业热度：{scores["industry_heat"]}/100 → 解读评分含义
- 投资价值：{scores["investment_value"]}/100 → 解读评分含义
- 风险等级：{scores["risk_level"]}/100 → 解读评分含义

## 五、关键技术信号识别
重点标注以下信号（如存在）：
- ✅ 买入信号：MACD金叉、均线多头排列、KDJ金叉、布林带突破上轨、ADX>25趋势强劲
- ⚠️ 观望信号：指标背离、超买超卖区间、趋势不明（ADX<20）
- ❌ 风险信号：MACD死叉、均线空头排列、KDJ死叉、跌破布林带下轨

## 六、投资建议
基于技术指标综合判断，给出明确操作建议（买入/持有/观望/减仓），并说明：
- 核心逻辑（基于哪些关键指标）
- 进场时机（等待什么信号）
- 风险提示（关注哪些技术破位）
- 止盈止损参考（技术位）

**免责声明**：本分析基于历史技术数据，仅供参考，不构成投资建议。市场有风险，投资需谨慎，请根据自身风险承受能力决策。

**要求**：
- 数据驱动，重点分析技术指标的共振和背离
- 识别关键买卖信号，给出可执行的技术面建议
- 明确标识数据质量问题（如降级数据、指标缺失）
- 控制在1000字以内，突出核心发现
"""
                    }
                ]
            )

            report = message.content[0].text
            return report

        except Exception as e:
            logger.error(f"Error generating market report: {e}")
            return f"报告生成失败: {str(e)}"

    def _assess_data_quality(
        self,
        etf_analysis: List[Dict[str, Any]],
        index_analysis: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """评估数据质量（只基于ETF）"""
        if not etf_analysis:
            return {
                "level": "低",
                "total_etfs": 0,
                "fallback_etfs": 0,
                "avg_data_points": 0,
                "issues": ["未获取到任何ETF数据"],
                "summary": "数据质量: 低 | 问题: 未获取到任何ETF数据"
            }

        total_etfs = len(etf_analysis)
        fallback_etfs = sum(1 for e in etf_analysis if e.get("is_fallback", False))
        avg_data_points = sum(e.get("data_points", 0) for e in etf_analysis) / total_etfs if total_etfs > 0 else 0

        quality_level = "高"
        issues = []
        critical_issues = []

        # 关键问题：数据点数不足（无法计算技术指标）
        if avg_data_points < 5:
            quality_level = "低"
            critical_issues.append(f"历史数据严重不足（仅{avg_data_points:.0f}天），技术指标无效")
        elif avg_data_points < 30:
            quality_level = "中"
            issues.append(f"历史数据不足（{avg_data_points:.0f}天 < 30天），部分指标可能不准确")

        # 降级数据比例
        if fallback_etfs > total_etfs * 0.7:
            quality_level = "低"
            critical_issues.append(f"{fallback_etfs}/{total_etfs}个ETF使用实时数据降级（>70%）")
        elif fallback_etfs > total_etfs * 0.3:
            if quality_level != "低":
                quality_level = "中"
            issues.append(f"{fallback_etfs}/{total_etfs}个ETF使用实时数据降级")
        elif fallback_etfs > 0:
            issues.append(f"{fallback_etfs}/{total_etfs}个ETF使用实时数据降级")

        # 合并问题列表
        all_issues = critical_issues + issues

        summary = f"数据质量: {quality_level}"
        if all_issues:
            summary += f" | 问题: {'; '.join(all_issues)}"

        return {
            "level": quality_level,
            "total_etfs": total_etfs,
            "fallback_etfs": fallback_etfs,
            "avg_data_points": avg_data_points,
            "critical_issues": critical_issues,
            "issues": all_issues,
            "summary": summary
        }

    def _calculate_quantitative_scores(
        self,
        etf_analysis: List[Dict[str, Any]],
        index_analysis: List[Dict[str, Any]]
    ) -> Dict[str, int]:
        """计算量化评分（修正版：避免极端值0和100）"""
        if not etf_analysis:
            return {
                "industry_heat": 50,
                "investment_value": 50,
                "risk_level": 50
            }

        # 1. 产业热度评分 (0-100) - 基于多维度
        # 1.1 价格动量（40%）
        price_changes = [e.get("price_change_pct", 0) for e in etf_analysis]
        avg_change = sum(price_changes) / len(price_changes)
        # 映射：-50%→10分，0%→50分，+50%→90分（避免0和100）
        momentum_score = 50 + min(40, max(-40, avg_change * 0.8))

        # 1.2 成交活跃度（30%）
        volume_ratios = []
        for etf in etf_analysis:
            vol_ma5 = etf.get("vol_ma5")
            vol_ma20 = etf.get("vol_ma20")
            if vol_ma5 and vol_ma20 and vol_ma20 > 0:
                ratio = (vol_ma5 / vol_ma20 - 1) * 100
                volume_ratios.append(ratio)

        if volume_ratios:
            avg_volume_change = sum(volume_ratios) / len(volume_ratios)
            # 映射：-30%→20分，0%→50分，+30%→80分
            activity_score = 50 + min(30, max(-30, avg_volume_change * 1.0))
        else:
            activity_score = 50

        # 1.3 技术面热度（30%）
        technical_scores = []
        for etf in etf_analysis:
            rsi = etf.get("rsi")
            kdj = etf.get("kdj", {})
            kdj_j = kdj.get("j") if isinstance(kdj, dict) else None

            score = 50
            if rsi:
                score += (rsi - 50) * 0.3  # RSI>50加分，<50减分
            if kdj_j:
                score += (kdj_j - 50) * 0.15  # KDJ-J>50加分，<50减分
            technical_scores.append(score)

        tech_heat = sum(technical_scores) / len(technical_scores) if technical_scores else 50

        # 综合热度
        industry_heat = int(momentum_score * 0.4 + activity_score * 0.3 + tech_heat * 0.3)
        industry_heat = max(10, min(90, industry_heat))  # 限制在10-90范围

        # 2. 投资价值评分 (0-100) - 基于多维度技术指标
        value_score = 0
        valid_count = 0

        for etf in etf_analysis:
            etf_score = 0

            # 趋势强度 (30%)
            trend = etf.get("trend", "unknown")
            if trend == "strong_uptrend":
                etf_score += 30
            elif trend == "uptrend":
                etf_score += 20
            elif trend == "sideways":
                etf_score += 10
            elif trend == "downtrend":
                etf_score -= 10
            elif trend == "strong_downtrend":
                etf_score -= 20

            # MACD信号 (20%)
            macd = etf.get("macd")
            if macd:
                macd_dif = macd.get("dif")
                macd_dea = macd.get("dea")
            else:
                macd_dif = None
                macd_dea = None
            if macd_dif is not None and macd_dea is not None:
                if macd_dif > macd_dea and macd_dif > 0:
                    etf_score += 20  # 金叉且在零轴上方
                elif macd_dif > macd_dea:
                    etf_score += 10  # 金叉但在零轴下方
                elif macd_dif < macd_dea and macd_dif < 0:
                    etf_score -= 20  # 死叉且在零轴下方
                elif macd_dif < macd_dea:
                    etf_score -= 10  # 死叉但在零轴上方

            # RSI动量 (20%)
            rsi = etf.get("rsi")
            if rsi is not None:
                if 50 < rsi < 70:
                    etf_score += 20  # 强势但未超买
                elif rsi >= 70:
                    etf_score += 10  # 超买但有动能
                elif 30 < rsi <= 50:
                    etf_score += 5   # 弱势
                elif rsi <= 30:
                    etf_score -= 10  # 超卖

            # KDJ信号 (15%)
            kdj = etf.get("kdj")
            if kdj:
                kdj_k = kdj.get("k")
                kdj_d = kdj.get("d")
                kdj_j = kdj.get("j")
            else:
                kdj_k = None
                kdj_d = None
                kdj_j = None
            if kdj_k is not None and kdj_d is not None:
                if kdj_k > kdj_d and kdj_j is not None and 0 < kdj_j < 100:
                    etf_score += 15  # 金叉且在合理区间
                elif kdj_k > kdj_d:
                    etf_score += 8   # 金叉但可能超买
                elif kdj_k < kdj_d:
                    etf_score -= 8   # 死叉

            # ADX趋势强度 (15%)
            dmi = etf.get("dmi")
            if dmi:
                adx = dmi.get("adx")
                pdi = dmi.get("pdi", 0)
                mdi = dmi.get("mdi", 0)
            else:
                adx = None
                pdi = 0
                mdi = 0
            if adx is not None:
                if adx > 25:
                    # 趋势强劲，根据方向加分
                    if pdi and mdi and pdi > mdi:
                        etf_score += 15  # 强上升趋势
                    elif pdi and mdi and pdi < mdi:
                        etf_score -= 15  # 强下降趋势
                elif adx < 20:
                    etf_score -= 5   # 趋势不明

            value_score += etf_score
            valid_count += 1

        if valid_count > 0:
            investment_value = 50 + (value_score / valid_count)
            investment_value = max(10, min(90, int(investment_value)))  # 限制在10-90范围
        else:
            investment_value = 50

        # 3. 风险评分 (0-100, 越高风险越大) - 归一化处理
        volatility_scores = [e.get("volatility", 0) for e in etf_analysis if e.get("volatility") is not None]
        drawdown_scores = [e.get("max_drawdown", 0) for e in etf_analysis if e.get("max_drawdown") is not None]

        if volatility_scores:
            avg_volatility = sum(volatility_scores) / len(volatility_scores)
            # 映射：0%→10分，30%→50分，80%→90分（避免100）
            volatility_score = 10 + min(80, (avg_volatility / 80) * 80)
        else:
            volatility_score = 50

        if drawdown_scores:
            avg_drawdown = sum(drawdown_scores) / len(drawdown_scores)
            # 映射：0%→10分，20%→50分，60%→90分（避免100）
            drawdown_score = 10 + min(80, (avg_drawdown / 60) * 80)
        else:
            drawdown_score = 50

        # 综合风险（波动率60%，回撤40%）
        risk_level = int(volatility_score * 0.6 + drawdown_score * 0.4)
        risk_level = max(10, min(90, risk_level))  # 限制在10-90范围

        return {
            "industry_heat": industry_heat,
            "investment_value": investment_value,
            "risk_level": risk_level
        }

    def _build_symbol_mapping(
        self,
        etf_analysis: List[Dict[str, Any]],
        index_analysis: List[Dict[str, Any]]
    ) -> str:
        """构建ETF代号说明表（不包含指数）"""
        mapping = "## 代号说明\n\n"

        if etf_analysis:
            mapping += "**ETF代号：**\n"
            for etf in etf_analysis:
                mapping += f"- {etf['code']}: {etf['name']}\n"

        return mapping

    def _build_enhanced_market_context(
        self,
        industry_name: str,
        etf_analysis: List[Dict[str, Any]],
        index_analysis: List[Dict[str, Any]],
        data_quality: Dict[str, Any],
        scores: Dict[str, int],
        market_overview: Optional[Dict[str, Any]] = None,
        sector_flow: Optional[Dict[str, Any]] = None
    ) -> str:
        """构建增强的市场分析上下文（包含完整技术指标、市场指数和板块数据）"""
        context = f"产业: {industry_name}\n"
        context += f"分析时间: {datetime.now().strftime('%Y-%m-%d %H:%M')}\n\n"

        # 数据质量说明
        context += "=== 数据质量 ===\n"
        context += f"{data_quality['summary']}\n"
        context += f"ETF数量: {data_quality['total_etfs']}\n"
        context += f"平均数据点数: {data_quality['avg_data_points']:.0f}天\n\n"

        # 市场整体数据（新增）
        if market_overview or sector_flow:
            context += "=== 市场整体数据（当日） ===\n"

            if market_overview and market_overview.get('indices'):
                context += "主要指数当日表现:\n"
                for index in market_overview['indices']:
                    name = index.get('name', index.get('code', 'N/A'))
                    current = index.get('current') or index.get('price', 0)
                    change_pct = index.get('changePercent') or index.get('changePct', 0)
                    context += f"  {name}: {current:.2f} ({change_pct:+.2f}%)\n"
                context += "\n"

            if sector_flow:
                # TOP10 净流入板块
                top_inflow = sector_flow.get('topInflowSectors', [])
                if top_inflow:
                    context += "板块资金流向 - TOP10净流入:\n"
                    for idx, sector in enumerate(top_inflow, 1):
                        name = sector.get('sector', 'N/A')
                        net_flow = sector.get('netFlow', 0)
                        change_pct = sector.get('changePct', 0)
                        context += f"  {idx}. {name}: {net_flow:+.2f}亿 (涨跌: {change_pct:+.2f}%)\n"
                    context += "\n"

                # TOP10 净流出板块
                top_outflow = sector_flow.get('topOutflowSectors', [])
                if top_outflow:
                    context += "板块资金流向 - TOP10净流出:\n"
                    for idx, sector in enumerate(top_outflow, 1):
                        name = sector.get('sector', 'N/A')
                        net_flow = sector.get('netFlow', 0)
                        change_pct = sector.get('changePct', 0)
                        context += f"  {idx}. {name}: {net_flow:+.2f}亿 (涨跌: {change_pct:+.2f}%)\n"
                    context += "\n"

        # ETF分析（增强版 - 包含当日涨跌幅）
        if etf_analysis:
            context += "=== 相关ETF（技术指标详情）===\n"
            for etf in etf_analysis:
                fallback_mark = " ⚠️[降级数据]" if etf.get("is_fallback") else ""
                context += f"\n【{etf['name']} ({etf['code']})】{fallback_mark}\n"

                # 基础信息（新增当日涨跌幅）
                context += f"  当前价格: {etf['current_price']}\n"
                daily_change = etf.get('daily_change_pct', 'N/A')
                period_change = etf.get('price_change_pct', 'N/A')
                context += f"  当日涨跌: {daily_change}% | 期间涨跌: {period_change}%\n"
                context += f"  数据点数: {etf['data_points']}天 | 趋势: {etf.get('trend', 'unknown')}\n"

                # 趋势指标
                if etf.get('ma5') is not None:
                    context += f"  均线系统: MA5={etf['ma5']}"
                    if etf.get('ma10') is not None:
                        context += f" | MA10={etf['ma10']}"
                    if etf.get('ma20') is not None:
                        context += f" | MA20={etf['ma20']}"
                    if etf.get('ma60') is not None:
                        context += f" | MA60={etf['ma60']}"
                    context += "\n"

                macd = etf.get('macd')
                if macd and macd.get('dif') is not None:
                    macd_signal = ""
                    if macd.get('dea') is not None:
                        if macd['dif'] > macd['dea']:
                            macd_signal = " [金叉]" if macd['dif'] > 0 else " [低位金叉]"
                        else:
                            macd_signal = " [死叉]" if macd['dif'] < 0 else " [高位死叉]"

                    dea_str = f"{macd['dea']:.4f}" if macd.get('dea') is not None else "N/A"
                    macd_str = f"{macd['macd']:.4f}" if macd.get('macd') is not None else "N/A"
                    context += f"  MACD: DIF={macd['dif']:.4f} | DEA={dea_str} | MACD={macd_str}{macd_signal}\n"

                boll = etf.get('boll')
                if boll and boll.get('mid') is not None:
                    boll_pos = ""
                    if boll.get('upper') and boll.get('lower'):
                        price = etf['current_price']
                        if price > boll['upper']:
                            boll_pos = " [突破上轨]"
                        elif price < boll['lower']:
                            boll_pos = " [跌破下轨]"
                        elif price > boll['mid']:
                            boll_pos = " [中上轨]"
                        else:
                            boll_pos = " [中下轨]"
                    context += f"  布林带: 上轨={boll.get('upper', 'N/A')} | 中轨={boll['mid']} | 下轨={boll.get('lower', 'N/A')}{boll_pos}\n"

                dmi = etf.get('dmi')
                if dmi and dmi.get('adx') is not None:
                    trend_strength = "强势" if dmi['adx'] > 25 else "弱势" if dmi['adx'] < 20 else "中性"
                    context += f"  DMI: +DI={dmi.get('pdi', 'N/A')} | -DI={dmi.get('mdi', 'N/A')} | ADX={dmi['adx']} [{trend_strength}]\n"

                # 动量指标
                momentum_line = "  动量指标:"
                has_momentum = False
                if etf.get('rsi') is not None:
                    rsi_status = "超买" if etf['rsi'] > 70 else "超卖" if etf['rsi'] < 30 else "中性"
                    momentum_line += f" RSI={etf['rsi']:.1f}[{rsi_status}]"
                    has_momentum = True
                kdj = etf.get('kdj')
                if kdj and kdj.get('k') is not None:
                    kdj_signal = ""
                    if kdj.get('d') and kdj.get('j'):
                        if kdj['j'] > 100:
                            kdj_signal = "[超买]"
                        elif kdj['j'] < 0:
                            kdj_signal = "[超卖]"
                        elif kdj['k'] > kdj['d']:
                            kdj_signal = "[金叉]"
                        else:
                            kdj_signal = "[死叉]"

                    kdj_d_str = f"{kdj['d']:.1f}" if kdj.get('d') is not None else "N/A"
                    kdj_j_str = f"{kdj['j']:.1f}" if kdj.get('j') is not None else "N/A"
                    momentum_line += f" | KDJ(K={kdj['k']:.1f}, D={kdj_d_str}, J={kdj_j_str}){kdj_signal}"
                    has_momentum = True
                if etf.get('cci') is not None:
                    cci_status = "强势" if etf['cci'] > 100 else "弱势" if etf['cci'] < -100 else "常态"
                    momentum_line += f" | CCI={etf['cci']:.1f}[{cci_status}]"
                    has_momentum = True
                if etf.get('wr') is not None:
                    wr_status = "超买" if etf['wr'] > -20 else "超卖" if etf['wr'] < -80 else "常态"
                    momentum_line += f" | WR={etf['wr']:.1f}[{wr_status}]"
                    has_momentum = True
                if has_momentum:
                    context += momentum_line + "\n"

                # 成交量指标
                if etf.get('obv') is not None or etf.get('vol_ma5') is not None:
                    volume_line = "  成交量:"
                    if etf.get('obv') is not None:
                        volume_line += f" OBV={etf['obv']:.0f}"
                    if etf.get('vol_ma5') is not None:
                        volume_line += f" | 量均MA5={etf['vol_ma5']:.0f}"
                    if etf.get('vol_ma20') is not None:
                        volume_line += f" | 量均MA20={etf['vol_ma20']:.0f}"
                    context += volume_line + "\n"

                # 稳定性指标
                if etf.get('volatility') is not None or etf.get('max_drawdown') is not None:
                    risk_line = "  风险指标:"
                    if etf.get('volatility') is not None:
                        vol_level = "高" if etf['volatility'] > 30 else "中" if etf['volatility'] > 15 else "低"
                        risk_line += f" 波动率={etf['volatility']:.1f}%[{vol_level}]"
                    if etf.get('max_drawdown') is not None:
                        dd_level = "高" if etf['max_drawdown'] > 20 else "中" if etf['max_drawdown'] > 10 else "低"
                        risk_line += f" | 最大回撤={etf['max_drawdown']:.1f}%[{dd_level}]"
                    context += risk_line + "\n"

        # 市场统计
        if etf_analysis:
            avg_etf_change = sum(e.get('price_change_pct', 0) for e in etf_analysis) / len(etf_analysis)
            positive_etfs = sum(1 for e in etf_analysis if e.get('price_change_pct', 0) > 0)

            # 计算平均技术指标
            valid_rsi = [e['rsi'] for e in etf_analysis if e.get('rsi') is not None]
            valid_macd = [e['macd_dif'] for e in etf_analysis if e.get('macd_dif') is not None]
            valid_vol = [e['volatility'] for e in etf_analysis if e.get('volatility') is not None]

            context += "\n=== 市场统计 ===\n"
            context += f"ETF平均涨跌: {avg_etf_change:.2f}%\n"
            context += f"上涨ETF占比: {(positive_etfs/len(etf_analysis)*100):.1f}%\n"

            if valid_rsi:
                avg_rsi = sum(valid_rsi) / len(valid_rsi)
                context += f"平均RSI: {avg_rsi:.1f}\n"

            if valid_macd:
                avg_macd = sum(valid_macd) / len(valid_macd)
                macd_positive = sum(1 for m in valid_macd if m > 0)
                context += f"平均MACD DIF: {avg_macd:.4f} (正值占比: {(macd_positive/len(valid_macd)*100):.1f}%)\n"

            if valid_vol:
                avg_volatility = sum(valid_vol) / len(valid_vol)
                context += f"平均波动率: {avg_volatility:.2f}%\n"

        # 量化评分
        context += "\n=== 量化评分（供参考）===\n"
        context += f"产业热度: {scores['industry_heat']}/100\n"
        context += f"投资价值: {scores['investment_value']}/100\n"
        context += f"风险等级: {scores['risk_level']}/100\n"

        return context

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
