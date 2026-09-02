"""
Industry Company Analyzer - 产业企业发展趋势分析

分析链路：
1. 从现行知识图谱 Industry -> Stage -> Segment -> Company 结构汇总企业；
2. 通过 StockProvider 适配器获取行情、财报和公告；
3. 计算企业级指标和数据覆盖度；
4. 将图谱位置与企业数据交给 AI，生成可追溯的企业发展趋势报告。

StockProvider 是企业资讯底层数据源的适配边界。当前默认实现使用 AKShare，后续可以
在不改动本分析器和前端协议的情况下替换为 Tushare、Wind 或其他正式数据供应商。
"""

from typing import Any, Dict, List, Optional
from datetime import datetime, timedelta
import asyncio
import json
import logging
import math
import os
import re
from statistics import median

from anthropic import Anthropic
import httpx

from providers.stock_provider import StockProvider
from services.neo4j_service import Neo4jService

logger = logging.getLogger(__name__)


class AnalysisStageError(RuntimeError):
    """A user-actionable failure in one stage of the analysis pipeline."""

    def __init__(self, stage: str, error_code: str, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.stage = stage
        self.error_code = error_code
        self.details = details or {}


class ChatGPTTextClient:
    """OpenAI Chat Completions 兼容客户端，支持自定义 /v1 网关。"""

    def __init__(self, api_key: str, base_url: str, model: str, timeout: float):
        self.api_key = api_key
        self.url = base_url.rstrip('/') + '/chat/completions'
        self.model = model
        self.timeout = timeout

    def complete(self, prompt: str, system: str, max_tokens: int) -> str:
        response = httpx.post(
            self.url,
            headers={'Authorization': f'Bearer {self.api_key}', 'Content-Type': 'application/json'},
            json={
                'model': self.model,
                'max_tokens': max_tokens,
                'messages': [
                    {'role': 'system', 'content': system},
                    {'role': 'user', 'content': prompt},
                ],
            },
            timeout=self.timeout,
        )
        response.raise_for_status()
        payload = response.json()
        content = ((payload.get('choices') or [{}])[0].get('message') or {}).get('content')
        if not content:
            raise RuntimeError('ChatGPT 兼容接口返回空内容')
        return str(content)


class IndustryCompanyAnalyzer:
    """产业链企业综合分析器。"""

    def __init__(self):
        self.stock_provider = StockProvider()
        self.neo4j_service = Neo4jService()
        self.max_concurrency = max(1, int(os.getenv("COMPANY_ANALYSIS_CONCURRENCY", "4")))
        # 报告最多使用 8 家重点企业；限制下游抓取规模可避免 Promax 单并发网关
        # 在 15 家企业 × 4 类接口的请求洪峰下持续返回 503，最终拖到外层超时。
        self.selection_limit = max(4, int(os.getenv("COMPANY_ANALYSIS_SELECTION_LIMIT", "8")))
        # 数据抓取总超时：从90秒提升到600秒（10分钟），覆盖大量企业的并发抓取场景
        # 实测57家企业需要约300秒，留出足够buffer应对网络波动
        self.data_timeout_seconds = max(10, int(os.getenv("COMPANY_ANALYSIS_DATA_TIMEOUT_SECONDS", "600")))
        # 单个provider调用超时：从20秒提升到45秒，减少因网络延迟导致的空数据返回
        self.provider_timeout_seconds = max(1, int(os.getenv("COMPANY_ANALYSIS_PROVIDER_TIMEOUT_SECONDS", "45")))
        self.provider_retries = max(0, int(os.getenv("COMPANY_ANALYSIS_PROVIDER_RETRIES", "1")))
        self.cache_ttl_seconds = max(0, int(os.getenv("COMPANY_ANALYSIS_CACHE_TTL_SECONDS", "900")))
        # 外层超时用于保护整条分析链路；客户端超时用于尽快释放无响应的代理请求。
        self.ai_timeout_seconds = max(60, int(os.getenv("COMPANY_ANALYSIS_AI_TIMEOUT_SECONDS", "360")))
        self.ai_request_timeout_seconds = max(20, int(os.getenv("COMPANY_ANALYSIS_AI_REQUEST_TIMEOUT_SECONDS", "180")))
        self.ai_retries = max(0, int(os.getenv("COMPANY_ANALYSIS_AI_RETRIES", "1")))
        self.ai_max_tokens = max(2048, int(os.getenv("COMPANY_ANALYSIS_AI_MAX_TOKENS", "5000")))
        self.ai_provider = os.getenv('AI_PROVIDER', 'anthropic').strip().lower()
        self._provider_cache: Dict[str, Any] = {}
        self.last_report_warning: Optional[str] = None

        self.anthropic: Optional[Anthropic] = None
        self.chatgpt: Optional[ChatGPTTextClient] = None
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if api_key:
            kwargs: Dict[str, Any] = {"api_key": api_key}
            base_url = os.getenv("ANTHROPIC_BASE_URL")
            if base_url:
                kwargs["base_url"] = base_url
            try:
                # anthropic SDK 的 timeout 必须设置在客户端上，单纯包裹
                # asyncio.wait_for 无法中止底层同步 HTTP 请求。
                kwargs["timeout"] = self.ai_request_timeout_seconds
                # 报告生成由外层控制重试；SDK 默认重试会把一次超时放大成数分钟。
                kwargs["max_retries"] = 0
                self.anthropic = Anthropic(**kwargs)
            except Exception as error:
                logger.warning("初始化企业趋势分析 AI 客户端失败: %s", error)
        if self.ai_provider in {'chatgpt', 'openai'}:
            chatgpt_key = os.getenv('CHATGPT_API_KEY') or os.getenv('OPENAI_API_KEY')
            chatgpt_base = os.getenv('CHATGPT_BASE_URL') or os.getenv('OPENAI_BASE_URL')
            chatgpt_model = os.getenv('CHATGPT_MODEL') or os.getenv('OPENAI_MODEL') or 'gpt-5.6-luna'
            if chatgpt_key and chatgpt_base:
                self.chatgpt = ChatGPTTextClient(chatgpt_key, chatgpt_base, chatgpt_model, self.ai_request_timeout_seconds)

    def _clear_stale_cache(self):
        """清理过期的缓存数据，防止内存累积"""
        now = datetime.now().timestamp()
        stale_keys = [
            key for key, cached in self._provider_cache.items()
            if (now - cached.get("timestamp", 0)) >= self.cache_ttl_seconds
        ]
        for key in stale_keys:
            del self._provider_cache[key]

        if stale_keys:
            logger.info("清理过期缓存: %d 条", len(stale_keys))

    async def analyze_industry_companies(
        self,
        industry_id: str,
        analysis_period_days: int = 90,
        source: str = 'graph',
        etf_holdings: Optional[Dict[str, List[Dict[str, Any]]]] = None,
        generate_ai_report: bool = True,
        frontend_top_companies: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """按不同候选来源分析企业，后续行情/财报/公告/报告流程保持一致。"""
        # 清理旧缓存，防止数据累积
        self._clear_stale_cache()

        try:
            graph = None
            graph_error: Optional[Exception] = None
            for attempt in range(2):
                try:
                    graph = await self.neo4j_service.get_industry_full_graph(industry_id)
                    if graph:
                        break
                except Exception as error:
                    graph_error = error
                if attempt == 0:
                    await asyncio.sleep(1)
            if graph_error and graph is None:
                raise AnalysisStageError("graph", "GRAPH_READ_FAILED", f"图谱读取失败：{graph_error}") from graph_error
            if not graph:
                raise AnalysisStageError("graph", "GRAPH_NOT_FOUND", "图谱读取失败：未找到产业图谱", {"industry_id": industry_id})

            nodes = self._build_graph_nodes(graph)
            normalized_source = 'etf_holdings' if source in {'etf', 'etf_holdings', 'ETF持仓'} else 'graph'
            companies = self._collect_graph_companies(graph) if normalized_source == 'graph' else self._collect_etf_companies(etf_holdings or {})
            logger.info(
                "收集企业列表完成: source=%s, total_companies=%s",
                normalized_source, len(companies)
            )
            if normalized_source == 'etf_holdings':
                companies = self._enrich_company_names(companies, self._collect_graph_companies(graph))
            if not companies:
                raise AnalysisStageError(
                    "company_source",
                    "COMPANY_SOURCE_HAS_NO_COMPANIES",
                    "企业数据来源未返回可分析的企业",
                    {"industry_id": industry_id, "source": normalized_source, "graph": self._build_graph_summary(graph, nodes, 0)},
                )

            industry_name = (graph.get("industry") or {}).get("name", industry_id)

            # 获取全部企业数据，两种模式使用相同的筛选逻辑
            company_data = await self._fetch_company_data(companies, analysis_period_days)
            analyzed_companies = self._analyze_companies(company_data)
            # 计算综合评分和ETF引用数量，用于前端排序和展示
            analyzed_companies = self._identify_top_companies(analyzed_companies, top_n=len(analyzed_companies))
            segment_analysis = self._build_segment_signals(analyzed_companies)
            self._attach_relative_segment_metrics(analyzed_companies, segment_analysis)
            coverage = self._build_data_coverage(companies, company_data, analyzed_companies)
            coverage["analysis_started_at"] = (datetime.now() - timedelta(days=analysis_period_days)).isoformat()
            coverage["selection_pool_count"] = len(companies)
            coverage["data_fetch_selected_count"] = len(companies)

            graph_summary = self._build_graph_summary(graph, nodes, len(companies))

            if coverage["companies_with_any_data"] == 0:
                raise AnalysisStageError(
                    "company_data",
                    "COMPANY_DATA_UNAVAILABLE",
                    "企业数据获取失败：行情、财报和公告均未返回有效数据",
                    {"industry_id": industry_id, "coverage": coverage},
                )

            # 两种模式使用相同的证据筛选逻辑：保留具备财报或公告证据的企业
            candidates = self._build_evidence_candidates(analyzed_companies)
            coverage["report_candidate_count"] = len(candidates)
            coverage["report_evidence_both_count"] = sum(
                1 for item in candidates
                if (item.get("data_availability") or {}).get("financial")
                and (item.get("data_availability") or {}).get("announcements")
            )
            coverage["report_financial_only_count"] = sum(
                1 for item in candidates
                if (item.get("data_availability") or {}).get("financial")
                and not (item.get("data_availability") or {}).get("announcements")
            )
            coverage["report_announcement_only_count"] = sum(
                1 for item in candidates
                if not (item.get("data_availability") or {}).get("financial")
                and (item.get("data_availability") or {}).get("announcements")
            )
            if generate_ai_report and len(candidates) < 4:
                raise AnalysisStageError(
                    "company_selection",
                    "COMPANY_SELECTED_EVIDENCE_INSUFFICIENT",
                    "企业报告生成失败：AI选中的企业中具备财报或公告证据的企业不足4家",
                    {
                        "industry_id": industry_id,
                        "coverage": coverage,
                        "candidate_count": len(candidates),
                        "required_minimum": 4,
                    },
                )

            # 仅展示已解析出企业名称的样本，避免 ETF 持仓源缺少名称时把
            # "688126.SH"一类证券代码直接作为企业名输出到报告页面。
            named_companies = [item for item in analyzed_companies if not self._is_security_code_name(item)]
            named_candidates = [item for item in candidates if not self._is_security_code_name(item)]
            # 使用前端传递的top_companies参数，如果未提供则使用named_candidates的前10家
            if frontend_top_companies:
                # 前端已经筛选了top10，使用前端提供的企业列表
                frontend_symbols = set(frontend_top_companies)
                top_companies = [c for c in named_candidates if c.get('symbol') in frontend_symbols]
                # 保持前端传入的顺序
                symbol_to_company = {c.get('symbol'): c for c in top_companies}
                top_companies = [symbol_to_company[sym] for sym in frontend_top_companies if sym in symbol_to_company]
                logger.info(
                    "使用前端筛选的企业列表: requested=%d, matched=%d, symbols=%s",
                    len(frontend_top_companies), len(top_companies), [c.get('symbol') for c in top_companies]
                )
            else:
                # 前端未提供，使用所有具备证据的企业（前10家）
                top_companies = named_candidates[:10]

            ai_report_companies = top_companies if generate_ai_report else []
            coverage["report_selected_count"] = len(ai_report_companies) if generate_ai_report else len(top_companies)
            self.last_report_warning = None
            if not generate_ai_report:
                trend_report = ""
            else:
                try:
                    trend_report = await self._generate_trend_report(
                        industry_name=industry_name,
                        industry_id=industry_id,
                        nodes=nodes,
                        analyzed_companies=ai_report_companies,
                        top_companies=ai_report_companies,
                        coverage=coverage,
                    )
                except AnalysisStageError as error:
                    # AI 代理不可用时，不能丢弃已经完成的行情、财报和公告分析。
                    # 用同一份证据生成可追溯的规则报告，并把 AI 故障留在诊断字段中。
                    if error.stage != "ai_report":
                        raise
                    self.last_report_warning = str(error)
                    logger.warning("AI企业报告不可用，切换结构化兜底报告: %s", error)
                    trend_report = self._build_fallback_trend_report(
                        industry_name=industry_name,
                        top_companies=top_companies,
                        coverage=coverage,
                        warning=str(error),
                    )

            coverage["input_data_completeness"] = {
                "mode": "ai" if generate_ai_report else "data",
                "full_input_preserved": not generate_ai_report,
                "status": "complete" if len(company_data) == len(companies) else "partial",
                "candidate_count": len(companies),
                "fetched_count": len(company_data),
                "analyzed_count": len(analyzed_companies),
                "missing_companies": [
                    str(company.get("symbol") or company.get("name") or "")
                    for company in companies[len(company_data):]
                ],
            }

            return {
                "success": True,
                "industry_id": industry_id,
                "analysis_period_days": analysis_period_days,
                "total_companies": len(companies),
                "analyzed_companies": len(analyzed_companies),
                "company_source": normalized_source,
                "graph": graph_summary,
                "data_coverage": coverage,
                "segment_analysis": segment_analysis,
                "source": {
                    "provider": "AKShare/Tushare/OpenBB/东方财富",
                    "adapter": "StockProvider",
                    "status": (
                        "no_data"
                        if not coverage["companies_with_any_data"]
                        else "connected"
                        if coverage["companies_with_any_data"] == coverage["graph_companies"]
                        else "partial"
                    ),
                    "capabilities": self.stock_provider.capabilities(),
                    "note": "报告候选企业只需具备有效财报或公告证据；同时具备两类证据的企业优先作为核心证据，行情仅作为补充证据。",
                },
                "report_source": "ai" if generate_ai_report else "data",
                "report_warning": self.last_report_warning,
                "top_companies": top_companies,
                "selected_companies": top_companies,
                "company_summaries": analyzed_companies,
                "report_candidates": candidates if generate_ai_report else analyzed_companies,
                "selection_source": "ai" if generate_ai_report else "all_input",
                "core_conclusion": self._extract_core_conclusion(trend_report),
                "trend_judgment": self._extract_report_section(trend_report, "## 一、趋势判断"),
                "focus_points": self._extract_report_section(trend_report, "## 二、关注重点"),
                "investment_conclusion": self._extract_report_section(trend_report, "## 三、投资建议结论"),
                "trend_report": trend_report,
                "analysis_started_at": coverage.get("analysis_started_at"),
                "analyzed_at": coverage.get("analyzed_at"),
            }
        except AnalysisStageError as error:
            logger.warning("企业趋势分析在 %s 阶段失败: %s", error.stage, error)
            return {
                "success": False,
                "stage": error.stage,
                "error_code": error.error_code,
                "error": str(error),
                "details": error.details,
                "industry_id": industry_id,
            }
        except Exception as error:
            logger.exception("Error analyzing industry companies: %s", error)
            return {
                "success": False,
                "stage": "analysis",
                "error_code": "ANALYSIS_UNEXPECTED_ERROR",
                "error": f"企业趋势分析失败：{error}",
                "industry_id": industry_id,
            }

    @staticmethod
    def _build_graph_nodes(graph: Dict[str, Any]) -> List[Dict[str, Any]]:
        """把现行图谱的阶段/环节展开为分析上下文中的节点列表。"""
        nodes: List[Dict[str, Any]] = []
        for stage in graph.get("stages", []) or []:
            for segment in stage.get("segments", []) or []:
                nodes.append(
                    {
                        "id": segment.get("id") or segment.get("code"),
                        "code": segment.get("code"),
                        "name": segment.get("name") or "未命名环节",
                        "stage_id": stage.get("id"),
                        "stage_code": stage.get("code"),
                        "stage_name": stage.get("name") or "未命名阶段",
                    }
                )
        return nodes

    @classmethod
    def _collect_graph_companies(cls, graph: Dict[str, Any]) -> List[Dict[str, Any]]:
        """收集每个图谱环节的全部企业，并按证券标识/名称去重。"""
        companies: Dict[str, Dict[str, Any]] = {}
        for stage in graph.get("stages", []) or []:
            for segment in stage.get("segments", []) or []:
                for company in segment.get("companies", []) or []:
                    name = str(company.get("name") or "未命名企业").strip()
                    symbol = str(company.get("ticker") or company.get("symbol") or "").strip()
                    market = cls._normalize_market(
                        company.get("market") or company.get("country"),
                        symbol=symbol,
                    )
                    key = f"{symbol}:{market}" if symbol else f"name:{name.lower()}"

                    if key not in companies:
                        companies[key] = {
                            "id": company.get("id"),
                            "name": name,
                            "name_en": company.get("name_en") or company.get("nameEn"),
                            "symbol": symbol,
                            "market": market,
                            "exchange": company.get("exchange"),
                            "country": company.get("country"),
                            "market_position": company.get("market_position") or company.get("marketPosition"),
                            "category": company.get("category"),
                            "relevance": company.get("relevance"),
                            "key_products": company.get("key_products") or company.get("keyProducts") or [],
                            "description": company.get("description"),
                            "node_refs": [],
                        }

                    companies[key]["node_refs"].append(
                        {
                            "stage_id": stage.get("id"),
                            "stage_name": stage.get("name"),
                            "segment_id": segment.get("id"),
                            "segment_code": segment.get("code"),
                            "segment_name": segment.get("name"),
                        }
                    )

        return list(companies.values())

    @classmethod
    def _collect_etf_companies(cls, etf_holdings: Dict[str, List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
        """从多个 ETF 持仓提取企业并去重，同时保留每只 ETF 的暴露占比。

        每个ETF只取权重前10的持仓，避免企业数量过多。
        """
        companies: Dict[str, Dict[str, Any]] = {}
        top_n_per_etf = int(os.getenv("ETF_HOLDINGS_TOP_N_PER_ETF", "10"))

        for etf_code, rows in etf_holdings.items():
            # 只取每个ETF的前N个持仓
            top_holdings = (rows or [])[:top_n_per_etf]
            for row in top_holdings:
                symbol = str(row.get('stock_code') or row.get('code') or row.get('ticker') or '').strip()
                name = str(row.get('stock_name') or row.get('name') or symbol or '未命名企业').strip()
                if not symbol and not name:
                    continue
                market = cls._normalize_market(row.get('market'), symbol=symbol)
                key = f'{symbol}:{market}' if symbol else f'name:{name.lower()}'
                try:
                    weight = float(row.get('weight') or 0)
                except (TypeError, ValueError):
                    weight = 0
                if key not in companies:
                    companies[key] = {
                        'id': None,
                        'name': name,
                        'name_en': row.get('name_en'),
                        'symbol': symbol,
                        'market': market,
                        'exchange': row.get('exchange'),
                        'country': row.get('country'),
                        'market_position': None,
                        'category': 'ETF持仓企业',
                        'relevance': weight,
                        'key_products': [],
                        'description': None,
                        'node_refs': [],
                        'etf_exposures': [],
                        'total_etf_weight': 0,
                    }
                # 检查该ETF是否已经记录，避免重复计数
                existing_etf = next((exp for exp in companies[key]['etf_exposures'] if exp['etf_code'] == etf_code), None)
                if existing_etf:
                    # 如果该ETF已存在，累加权重（处理同一ETF中的多条记录）
                    existing_etf['weight'] += weight
                    companies[key]['total_etf_weight'] += weight
                else:
                    # 新的ETF持仓记录
                    companies[key]['total_etf_weight'] += weight
                    companies[key]['etf_exposures'].append({
                        'etf_code': etf_code,
                        'weight': weight,
                    })
        return sorted(companies.values(), key=lambda item: item.get('total_etf_weight', 0), reverse=True)

    @staticmethod
    def _enrich_company_names(
        companies: List[Dict[str, Any]],
        graph_companies: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """优先使用知识图谱中的中文企业名修复 ETF 持仓代码型名称。"""
        names_by_symbol = {
            str(item.get('symbol') or '').strip(): str(item.get('name') or '').strip()
            for item in graph_companies
            if str(item.get('symbol') or '').strip()
            and str(item.get('name') or '').strip()
            and str(item.get('name') or '').strip() != str(item.get('symbol') or '').strip()
        }
        enriched = []
        for company in companies:
            symbol = str(company.get('symbol') or '').strip()
            name = str(company.get('name') or '').strip()
            if (not name or name == symbol) and names_by_symbol.get(symbol):
                company = {**company, 'name': names_by_symbol[symbol]}
            enriched.append(company)
        return enriched

    async def _select_companies_with_ai(
        self,
        industry_name: str,
        companies: List[Dict[str, Any]],
        source: str,
    ) -> List[Dict[str, Any]]:
        try:
            if source == 'graph':
                return await self._select_graph_companies_with_ai(industry_name, companies)
            return await self._select_etf_companies_with_ai(industry_name, companies)
        except AnalysisStageError as error:
            # 选择阶段也不能让代理故障阻断整个企业分析；按来源候选的可解释字段降级排序。
            if error.stage != 'company_selection':
                raise
            minimum = 6 if source == 'graph' else 4
            if len(companies) < minimum:
                raise
            selection_count = min(self.selection_limit, len(companies))
            fallback = sorted(
                companies,
                key=lambda item: (
                    float(item.get('total_etf_weight') or 0),
                    1 if item.get('symbol') else 0,
                    len(item.get('node_refs') or []),
                ),
                reverse=True,
            )[:selection_count]
            for rank, company in enumerate(fallback, 1):
                company['ai_selection_rank'] = rank
                company['ai_selection_reason'] = (
                    'AI筛选服务暂不可用，已按ETF持仓权重、证券代码和产业链映射数量进行确定性排序。'
                    if source != 'graph'
                    else 'AI筛选服务暂不可用，已按产业链映射数量和证券代码进行确定性排序。'
                )
            logger.warning('企业候选筛选降级为规则排序: %s', error)
            return fallback

    def _build_fallback_trend_report(
        self,
        industry_name: str,
        top_companies: List[Dict[str, Any]],
        coverage: Dict[str, Any],
        warning: str,
    ) -> str:
        """基于已获取证据生成不依赖 AI 的最小可用企业报告。"""
        financial_rows = []
        announcement_rows = []
        quote_rows = []
        for company in top_companies:
            name = str(company.get('name') or company.get('symbol') or '未命名企业')
            financial = company.get('financial_metrics') or {}
            price = company.get('price_metrics') or {}
            announcement_signal = company.get('announcement_signal') or {}
            if financial:
                financial_rows.append(
                    f"{name}：营收增长 {financial.get('revenue_growth') if financial.get('revenue_growth') is not None else '暂无'}，"
                    f"利润增长 {financial.get('profit_growth') if financial.get('profit_growth') is not None else '暂无'}，"
                    f"经营现金流 {financial.get('operating_cash_flow') if financial.get('operating_cash_flow') is not None else '缺失'}。"
                )
            if company.get('latest_announcement_samples') or company.get('announcement_samples'):
                latest = (company.get('latest_announcement_samples') or company.get('announcement_samples') or [])[0]
                announcement_rows.append(
                    f"{name}：{latest.get('date') or '日期暂无'}，{latest.get('event_type') or '公告'}，"
                    f"{latest.get('title') or '标题暂无'}，方向{latest.get('direction') or '中性'}。"
                )
            if price:
                quote_rows.append(
                    f"{name}：区间涨跌 {price.get('price_change_pct') if price.get('price_change_pct') is not None else '暂无'}%，"
                    f"最新交易日涨跌 {price.get('latest_change_pct') if price.get('latest_change_pct') is not None else '暂无'}%。"
                )

        financial_text = '\n'.join(f"- {row}" for row in financial_rows[:6]) or '- 暂无有效财报证据。'
        announcement_text = '\n'.join(f"- {row}" for row in announcement_rows[:6]) or '- 暂无有效公告证据。'
        quote_text = '\n'.join(f"- {row}" for row in quote_rows[:6]) or '- 暂无有效行情证据。'
        coverage_text = (
            f"行情覆盖 {coverage.get('quote_coverage', '暂无')}，财报覆盖 {coverage.get('financial_coverage', '暂无')}，"
            f"公告覆盖 {coverage.get('announcement_coverage', '暂无')}。"
        )
        return f"""# {industry_name} 企业发展趋势分析

> 报告说明：企业分析 AI 服务暂不可用，以下结论由已获取的行情、财报和公告证据自动整理生成。{warning}

## 一、趋势判断

基于当前已选企业样本，{industry_name} 的企业层面信号需要结合行情、财报和公告交叉验证。当前证据不支持把单一企业或单条公告外推为整个领域趋势；对证据缺失的部分暂不判断。

### 行情证据
{quote_text}

### 财报证据
{financial_text}

### 公告证据
{announcement_text}

## 二、关注重点

1. 验证财报中的收入、利润变化能否被经营现金流和后续报告期确认；若现金流持续缺失，不能把利润增长直接解释为盈利质量改善。
2. 跟踪上述企业最新公告对应的订单、产能、合作或风险事项是否形成后续经营结果；公告本身不等于业绩兑现。
3. 对比企业最新交易日涨跌与分析区间表现，若短线价格与区间趋势背离，应先等待趋势确认。
4. {coverage_text}；覆盖不足的企业不纳入领域级确定性判断。

## 三、投资建议结论

建议：暂不将本次企业证据直接转换为新增风险，优先持有已标注领域的基金并等待财报、公告与价格趋势形成一致信号。若后续企业经营现金流、关键公告兑现和基金底层企业表现同时改善，再评估分批增加；若企业公告转为负面、价格趋势持续走弱或数据覆盖继续下降，则维持观察并控制回撤。
"""

    async def _select_etf_companies_with_ai(
        self,
        industry_name: str,
        companies: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        selection_count = min(self.selection_limit, len(companies))
        if selection_count < 4:
            raise AnalysisStageError(
                'company_selection',
                'ETF_HOLDING_COMPANIES_INSUFFICIENT',
                'ETF 持仓企业数量不足4家，无法形成可靠企业分析样本',
                {'company_count': len(companies), 'required_minimum': 4},
            )
        candidate_map: Dict[str, Dict[str, Any]] = {}
        payload = []
        for company in companies:
            candidate_id = f"{company.get('symbol')}:{company.get('market') or 'cn'}" if company.get('symbol') else f"name:{str(company.get('name') or '').lower()}"
            candidate_map[candidate_id] = company
            payload.append({
                'candidate_id': candidate_id,
                'name': company.get('name'),
                'symbol': company.get('symbol'),
                'market': company.get('market'),
                'total_etf_weight': company.get('total_etf_weight'),
                'etf_exposures': company.get('etf_exposures', [])[:8],
            })
        prompt = f"""你是产业研究首席分析师。请从"{industry_name}"相关 ETF 的底层持仓企业中筛选{selection_count}家最有代表性的企业，用于后续抓取行情、财报和公告。

筛选依据只能使用输入中的企业名称、证券代码和 ETF 持仓占比。优先考虑：被多只 ETF 共同持有、综合持仓占比较高、对当前产业有明确代表性的企业。不得补造企业或行业事实。

候选企业：
{json.dumps(payload, ensure_ascii=False, default=str)}

只返回 JSON：
{{"selected":[{{"candidate_id":"候选企业ID","rank":1,"reason":"基于 ETF 持仓覆盖和占比的筛选理由"}}]}}
要求 selected 必须正好包含{selection_count}个不同候选企业。"""
        content = await self._complete_ai_selection(prompt)
        try:
            match = re.search(r'\{[\s\S]*\}', content)
            result = json.loads(match.group(0) if match else content)
        except (TypeError, ValueError, json.JSONDecodeError) as error:
            raise AnalysisStageError('company_selection', 'AI_ETF_SELECTION_INVALID', 'ETF持仓企业筛选结果不是有效JSON') from error
        selected = result.get('selected') if isinstance(result, dict) else None
        if not isinstance(selected, list) or len(selected) != selection_count:
            raise AnalysisStageError('company_selection', 'AI_ETF_SELECTION_COUNT_INVALID', 'ETF持仓企业筛选数量不符合要求', {'selected_count': len(selected) if isinstance(selected, list) else 0})
        selected_companies = []
        seen = set()
        for item in selected:
            candidate_id = str(item.get('candidate_id') or '') if isinstance(item, dict) else ''
            if candidate_id not in candidate_map or candidate_id in seen:
                raise AnalysisStageError('company_selection', 'AI_ETF_SELECTION_MEMBER_INVALID', 'ETF持仓企业筛选包含不存在或重复企业')
            company = candidate_map[candidate_id].copy()
            company['ai_selection_rank'] = item.get('rank')
            company['ai_selection_reason'] = self._clean_selection_reason(str(item.get('reason') or ''))
            selected_companies.append(company)
            seen.add(candidate_id)
        return selected_companies

    @staticmethod
    def _normalize_market(value: Any, symbol: str = "") -> str:
        normalized = str(value or "").strip().lower()
        if normalized in {"us", "usa", "nasdaq", "nyse", "美国"}:
            return "us"
        if normalized in {"hk", "hkg", "港股", "香港"}:
            return "hk"
        # 图谱早期数据未必填写 market；字母 ticker 是最可靠的国际市场提示。
        # 纯数字代码保留为 A 股，避免改变现有图谱的默认行为。
        if symbol and any(char.isalpha() for char in symbol) and "." not in symbol:
            return "us"
        return "cn"

    @staticmethod
    def _market_position_label(value: Any) -> str:
        labels = {
            "leader": "头部",
            "major": "主要",
            "emerging": "新兴",
            "related": "相关",
            "头部": "头部",
            "主要": "主要",
            "核心": "核心",
            "龙头": "龙头",
        }
        normalized = str(value or "").strip().lower()
        return labels.get(normalized, str(value or "未标注"))

    @classmethod
    def _clean_selection_reason(cls, value: str) -> str:
        text = value.strip()
        text = re.sub(r"(?:代表性|综合)?评分\s*[:：]?\s*\d+(?:\.\d+)?\s*[，,；;]?\s*", "", text)
        for source, target in (("leader", "头部"), ("major", "主要"), ("emerging", "新兴"), ("related", "相关")):
            text = re.sub(source, target, text, flags=re.IGNORECASE)
        return text or "暂无"

    async def _select_graph_companies_with_ai(
        self,
        industry_name: str,
        companies: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """只基于知识图谱元数据，先筛选对领域发展最有影响力的企业。"""
        selection_count = min(self.selection_limit, len(companies))
        if selection_count < 6:
            raise AnalysisStageError(
                "company_selection",
                "GRAPH_COMPANIES_INSUFFICIENT",
                "企业报告生成失败：产业图谱企业数量不足6家",
                {"company_count": len(companies), "required_minimum": 6},
            )

        candidate_map: Dict[str, Dict[str, Any]] = {}
        payload = []
        for company in companies:
            candidate_id = f"{company.get('symbol')}:{company.get('market') or 'cn'}" if company.get("symbol") else f"name:{str(company.get('name') or '').lower()}"
            candidate_map[candidate_id] = company
            payload.append({
                "candidate_id": candidate_id,
                "name": company.get("name"),
                "name_en": company.get("name_en"),
                "symbol": company.get("symbol"),
                "market": company.get("market"),
                "market_position": self._market_position_label(company.get("market_position")),
                "category": company.get("category"),
                "description": company.get("description"),
                "key_products": company.get("key_products") or [],
                "relevance": company.get("relevance"),
                "industry_segments": [
                    ref.get("segment_name") for ref in company.get("node_refs", [])
                    if isinstance(ref, dict) and ref.get("segment_name")
                ],
                "industry_stages": [
                    ref.get("stage_name") for ref in company.get("node_refs", [])
                    if isinstance(ref, dict) and ref.get("stage_name")
                ],
            })

        prompt = f"""你是产业研究首席分析师。请从"{industry_name}"产业图谱企业中筛选{selection_count}家对该领域发展影响力最大的代表性企业，供后续抓取财报、公告和行情。

筛选依据只能使用输入中的图谱信息，优先考虑：
1. 对产业链关键环节、供给能力、技术路线、需求端或竞争格局的影响力；
2. 企业在产业链中的关键位置和代表性，而不是短期股价表现；
3. 产业链环节覆盖均衡，避免全部来自同一环节；
4. 有证券代码的企业优先，但不能仅凭证券代码判断行业地位。

输入不包含财报、公告或行情，不能假设任何未提供的数据，也不能因为缺少这些数据而排除企业。

候选企业数据如下：
{json.dumps(payload, ensure_ascii=False, default=str)}

只返回 JSON，不要 Markdown：
{{
  "selected": [
    {{"candidate_id": "候选企业的candidate_id", "rank": 1, "reason": "说明该企业对产业发展重要的具体图谱依据"}}
  ]
}}

要求：selected 必须正好包含{selection_count}个不同候选企业；candidate_id 必须来自输入；按影响力从高到低排序。"""

        content = await self._complete_ai_selection(prompt)
        try:
            match = re.search(r"\{[\s\S]*\}", content)
            result = json.loads(match.group(0) if match else content)
        except (TypeError, ValueError, json.JSONDecodeError) as error:
            raise AnalysisStageError(
                "company_selection",
                "AI_GRAPH_SELECTION_INVALID",
                "企业报告生成失败：AI图谱企业筛选结果不是有效JSON",
                {"content_preview": str(content)[:500]},
            ) from error

        selected = result.get("selected") if isinstance(result, dict) else None
        if not isinstance(selected, list) or len(selected) != selection_count:
            raise AnalysisStageError(
                "company_selection",
                "AI_GRAPH_SELECTION_COUNT_INVALID",
                f"企业报告生成失败：AI图谱筛选结果必须包含{selection_count}家企业",
                {
                    "selected_count": len(selected) if isinstance(selected, list) else 0,
                    "required_count": selection_count,
                },
            )

        selected_companies = []
        seen = set()
        for item in selected:
            if not isinstance(item, dict):
                raise AnalysisStageError("company_selection", "AI_GRAPH_SELECTION_INVALID", "企业报告生成失败：AI图谱筛选项格式异常")
            candidate_id = str(item.get("candidate_id") or "")
            if candidate_id not in candidate_map or candidate_id in seen:
                raise AnalysisStageError(
                    "company_selection",
                    "AI_GRAPH_SELECTION_MEMBER_INVALID",
                    "企业报告生成失败：AI图谱筛选结果包含不存在或重复企业",
                    {"candidate_id": candidate_id},
                )
            company = candidate_map[candidate_id].copy()
            company["ai_selection_rank"] = item.get("rank")
            company["ai_selection_reason"] = self._clean_selection_reason(str(item.get("reason") or ""))
            selected_companies.append(company)
            seen.add(candidate_id)
        return selected_companies

    @staticmethod
    def _build_graph_summary(
        graph: Dict[str, Any],
        nodes: List[Dict[str, Any]],
        company_count: int,
    ) -> Dict[str, Any]:
        stages = graph.get("stages", []) or []
        return {
            "stage_count": len(stages),
            "segment_count": len(nodes),
            "node_count": len(nodes),
            "company_count": company_count,
            "stages": [
                {
                    "id": stage.get("id"),
                    "name": stage.get("name") or "未命名阶段",
                    "segments": [segment.get("name") or "未命名环节" for segment in stage.get("segments", []) or []],
                    "company_count": sum(len(segment.get("companies", []) or []) for segment in stage.get("segments", []) or []),
                }
                for stage in stages
            ],
        }

    async def _fetch_company_data(
        self,
        companies: List[Dict[str, Any]],
        period_days: int,
    ) -> List[Dict[str, Any]]:
        """并发获取企业数据，保留单企业和单数据项的失败状态。"""
        logger.info(
            "开始并发抓取企业数据: total_companies=%s, max_concurrency=%s, timeout=%ss",
            len(companies), self.max_concurrency, self.data_timeout_seconds
        )
        start_date = (datetime.now() - timedelta(days=period_days)).strftime("%Y-%m-%d")
        end_date = datetime.now().strftime("%Y-%m-%d")
        semaphore = asyncio.Semaphore(self.max_concurrency)
        completed_count = 0
        lock = asyncio.Lock()

        async def fetch_one(company: Dict[str, Any]) -> Dict[str, Any]:
            nonlocal completed_count
            company_start = asyncio.get_event_loop().time()
            async with semaphore:
                symbol = company.get("symbol", "")
                name = company.get("name", "")
                if not symbol:
                    return {
                        **company,
                        "info": None,
                        "kline": None,
                        "financial": None,
                        "announcements": None,
                        "fetch_errors": {"symbol": "图谱企业缺少证券代码"},
                    }

                calls = {
                    "info": (self.stock_provider.get_stock_info, (symbol, company.get("market", "cn"))),
                    "kline": (
                        self.stock_provider.get_kline,
                        (symbol, "daily", start_date, end_date, company.get("market", "cn")),
                    ),
                    "financial": (
                        self.stock_provider.get_financial_report,
                        (symbol, "income", company.get("market", "cn")),
                    ),
                    "announcements": (
                        self.stock_provider.get_announcements,
                        (symbol, start_date, end_date, company.get("market", "cn")),
                    ),
                }
                results = await asyncio.gather(
                    *(self._call_provider(method, *args) for method, args in calls.values()),
                    return_exceptions=True,
                )

                # 详细日志：查看gather返回的原始结果
                logger.info(
                    "gather返回结果 [%s/%s]: %s (%s)",
                    name, symbol,
                    {key: f"{type(value).__name__}({len(value) if isinstance(value, list) else 'N/A'})"
                     for key, value in zip(calls.keys(), results)}
                )

                data: Dict[str, Any] = {**company, "fetch_errors": {}}
                for key, value in zip(calls.keys(), results):
                    if isinstance(value, Exception):
                        data[key] = None
                        error_msg = f"{type(value).__name__}: {str(value)}"
                        data["fetch_errors"][key] = error_msg
                        logger.warning("企业数据获取异常 [%s] %s: %s", name, key, error_msg)
                    else:
                        data[key] = value
                        # 记录成功获取的数据量
                        if isinstance(value, list):
                            logger.info("企业数据获取成功 [%s] %s: %d条", name, key, len(value))

                elapsed = asyncio.get_event_loop().time() - company_start
                async with lock:
                    completed_count += 1
                    logger.info(
                        "企业数据抓取完成 [%d/%d]: %s (%s) 耗时=%.2fs, kline=%d, financial=%d, announcements=%d",
                        completed_count, len(companies), name, symbol, elapsed,
                        len(data.get('kline', [])) if isinstance(data.get('kline'), list) else 0,
                        len(data.get('financial', [])) if isinstance(data.get('financial'), list) else 0,
                        len(data.get('announcements', [])) if isinstance(data.get('announcements'), list) else 0
                    )

                return data

        tasks = [asyncio.create_task(fetch_one(company)) for company in companies]
        done, pending = await asyncio.wait(tasks, timeout=self.data_timeout_seconds)

        logger.info(
            "企业数据抓取完成: completed=%s, pending=%s, total=%s, timeout=%ss",
            len(done), len(pending), len(companies), self.data_timeout_seconds
        )

        if pending:
            pending_companies = [companies[i].get("name", "未知") for i, task in enumerate(tasks) if task in pending]
            logger.warning(
                "企业数据抓取超时，取消剩余任务: pending_count=%s, timeout_s=%s, pending_companies=%s",
                len(pending), self.data_timeout_seconds, pending_companies[:10]
            )
            for task in pending:
                task.cancel()
            await asyncio.gather(*pending, return_exceptions=True)

        # 保持候选企业原顺序，便于覆盖率与 missing_companies 诊断稳定。
        results_by_index = {index: task.result() for index, task in enumerate(tasks) if task in done and not task.cancelled() and task.exception() is None}
        return [results_by_index[index] for index in sorted(results_by_index)]

    @staticmethod
    def _build_evidence_candidates(analyzed_companies: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """保留至少有财报或公告证据的企业，并按 AI 影响力排序。"""
        candidates = []
        for company in analyzed_companies:
            availability = company.get("data_availability") or {}
            if availability.get("financial") or availability.get("announcements"):
                candidates.append(company)
        return sorted(
            candidates,
            key=lambda item: (
                item.get("ai_selection_rank") is None,
                item.get("ai_selection_rank") or 999,
            ),
        )

    async def _call_provider(self, method: Any, *args: Any) -> Any:
        """调用 provider，带超时、有限重试和进程内短缓存。"""
        method_name = getattr(method, '__name__', 'provider')
        cache_key = f"{method_name}:{repr(args)}"
        cached = self._provider_cache.get(cache_key)
        if cached and (datetime.now().timestamp() - cached["timestamp"]) < self.cache_ttl_seconds:
            value = cached["value"]
            if isinstance(value, list):
                logger.debug("_call_provider缓存命中 %s: %d条", method_name, len(value))
            return value

        last_error: Optional[Exception] = None
        for attempt in range(self.provider_retries + 1):
            try:
                start_time = asyncio.get_event_loop().time()
                value = await asyncio.wait_for(
                    method(*args),
                    timeout=self.provider_timeout_seconds,
                )
                elapsed = asyncio.get_event_loop().time() - start_time

                self._provider_cache[cache_key] = {
                    "timestamp": datetime.now().timestamp(),
                    "value": value,
                }

                # 详细日志：记录每次Provider调用的结果
                if isinstance(value, list):
                    logger.info(
                        "_call_provider成功 %s(args=%s): %d条, 耗时=%.2fs",
                        method_name, args[0] if args else 'N/A', len(value), elapsed
                    )
                elif value is None:
                    logger.warning(
                        "_call_provider返回None %s(args=%s): 耗时=%.2fs",
                        method_name, args[0] if args else 'N/A', elapsed
                    )
                else:
                    logger.info(
                        "_call_provider成功 %s(args=%s): type=%s, 耗时=%.2fs",
                        method_name, args[0] if args else 'N/A', type(value).__name__, elapsed
                    )
                return value
            except asyncio.TimeoutError as error:
                last_error = error
                logger.warning(
                    "_call_provider超时 %s(args=%s): attempt=%d/%d, timeout=%ds",
                    method_name, args[0] if args else 'N/A',
                    attempt + 1, self.provider_retries + 1, self.provider_timeout_seconds
                )
                if attempt < self.provider_retries:
                    await asyncio.sleep(0.25 * (attempt + 1))
            except Exception as error:
                last_error = error
                logger.warning(
                    "_call_provider异常 %s(args=%s): %s: %s, attempt=%d/%d",
                    method_name, args[0] if args else 'N/A',
                    type(error).__name__, str(error)[:100],
                    attempt + 1, self.provider_retries + 1
                )
                if attempt < self.provider_retries:
                    await asyncio.sleep(0.25 * (attempt + 1))

        logger.error(
            "_call_provider最终失败 %s(args=%s): %s",
            method_name, args[0] if args else 'N/A', last_error
        )
        raise last_error or RuntimeError(f"provider调用失败: {method_name}")

    @staticmethod
    def _build_report_candidates(analyzed_companies: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """只保留同时具备有效财报和公告的企业，作为 AI 重点企业筛选池。"""
        candidates = []
        for company in analyzed_companies:
            availability = company.get("data_availability") or {}
            fetch_errors = company.get("fetch_errors") or {}
            if (
                company.get("symbol")
                and availability.get("financial")
                and availability.get("announcements")
                and not fetch_errors.get("financial")
                and not fetch_errors.get("announcements")
                and company.get("financial_samples")
                and (company.get("announcement_evidence") or company.get("latest_announcement_samples") or company.get("announcement_samples"))
            ):
                candidates.append(company)
        return candidates

    async def _select_report_companies_with_ai(
        self,
        industry_name: str,
        candidates: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """让 AI 从财报公告候选池中筛选 6-8 家头部企业，不使用规则替代。"""
        if len(candidates) < 6:
            raise AnalysisStageError(
                "company_selection",
                "COMPANY_REPORT_CANDIDATES_INSUFFICIENT",
                "企业报告生成失败：财报公告候选企业不足6家",
                {"candidate_count": len(candidates)},
            )

        candidate_map: Dict[str, Dict[str, Any]] = {}
        payload = []
        for index, company in enumerate(candidates):
            candidate_id = f"{company.get('symbol')}:{company.get('market') or 'cn'}"
            candidate_map[candidate_id] = company
            financial = company.get("financial_metrics") or {}
            announcements = company.get("announcement_evidence") or []
            payload.append({
                "candidate_id": candidate_id,
                "name": company.get("name"),
                "symbol": company.get("symbol"),
                "market": company.get("market"),
                "market_position": self._market_position_label(company.get("market_position")),
                "category": company.get("category"),
                "industry_segments": [
                    ref.get("segment_name") for ref in company.get("node_refs", [])
                    if isinstance(ref, dict) and ref.get("segment_name")
                ],
                "financial": {
                    "latest_period": financial.get("latest_period"),
                    "comparison_period": financial.get("comparison_period"),
                    "revenue": financial.get("revenue"),
                    "net_profit": financial.get("net_profit"),
                    "revenue_growth": financial.get("revenue_growth"),
                    "profit_growth": financial.get("profit_growth"),
                    "operating_cash_flow": financial.get("operating_cash_flow"),
                    "growth_basis": financial.get("growth_basis"),
                    "samples": company.get("financial_samples", [])[:3],
                },
                "announcements": announcements[:6],
            })

        prompt = f"""你是产业研究首席分析师。请从"{industry_name}"的候选企业中筛选6到8家头部企业，用于后续企业发展趋势报告。

筛选优先级：
1. 企业在产业链中的关键位置、业务影响力和代表性；
2. 财报和公告的时效性，优先最新报告期和最新公告；
3. 财报和公告对经营、订单、技术、产能、竞争格局或风险的影响力；
4. 产业链覆盖均衡，避免全部来自同一环节。

不要使用评分、英文市场地位词或覆盖率作为筛选理由；筛选理由应说明企业为什么重要，以及财报和公告分别提供了什么有效信息。

候选企业数据如下。只能使用这些数据，不能补造企业、日期、指标或事件：
{json.dumps(payload, ensure_ascii=False, default=str)}

只返回 JSON，不要 Markdown：
{{
  "selected": [
    {{"candidate_id": "候选企业的candidate_id", "rank": 1, "reason": "基于企业产业位置、财报时效性和具体证据价值的筛选理由"}}
  ]
}}

要求：selected 必须包含6到8个不同候选企业；candidate_id 必须来自输入；按优先级从高到低排序。"""

        content = await self._complete_ai_selection(prompt)
        try:
            match = re.search(r"\{[\s\S]*\}", content)
            result = json.loads(match.group(0) if match else content)
        except (TypeError, ValueError, json.JSONDecodeError) as error:
            raise AnalysisStageError(
                "company_selection",
                "AI_COMPANY_SELECTION_INVALID",
                "企业报告生成失败：AI头部企业筛选结果不是有效JSON",
                {"content_preview": str(content)[:500]},
            ) from error

        selected = result.get("selected") if isinstance(result, dict) else None
        if not isinstance(selected, list) or not 6 <= len(selected) <= 8:
            raise AnalysisStageError(
                "company_selection",
                "AI_COMPANY_SELECTION_COUNT_INVALID",
                "企业报告生成失败：AI筛选结果必须包含6到8家企业",
                {"selected_count": len(selected) if isinstance(selected, list) else 0},
            )

        selected_companies = []
        seen = set()
        for item in selected:
            if not isinstance(item, dict):
                raise AnalysisStageError("company_selection", "AI_COMPANY_SELECTION_INVALID", "企业报告生成失败：AI筛选项格式异常")
            candidate_id = str(item.get("candidate_id") or "")
            if candidate_id not in candidate_map or candidate_id in seen:
                raise AnalysisStageError(
                    "company_selection",
                    "AI_COMPANY_SELECTION_MEMBER_INVALID",
                    "企业报告生成失败：AI筛选结果包含不存在或重复企业",
                    {"candidate_id": candidate_id},
                )
            company = candidate_map[candidate_id].copy()
            company["ai_selection_rank"] = item.get("rank")
            company["ai_selection_reason"] = self._clean_selection_reason(str(item.get("reason") or ""))
            selected_companies.append(company)
            seen.add(candidate_id)
        return selected_companies

    async def _complete_ai_selection(self, prompt: str) -> str:
        if self.ai_provider in {"chatgpt", "openai"}:
            if not self.chatgpt:
                raise AnalysisStageError(
                    "company_selection",
                    "AI_COMPANY_SELECTION_NOT_CONFIGURED",
                    "企业报告生成失败：未配置头部企业筛选 AI 接口",
                    {"provider": self.ai_provider},
                )
            try:
                return await asyncio.wait_for(
                    asyncio.to_thread(self.chatgpt.complete, prompt, "你是严谨的产业研究员，只返回合法JSON。", 2200),
                    timeout=self.ai_timeout_seconds,
                )
            except Exception as error:
                raise AnalysisStageError(
                    "company_selection",
                    "AI_COMPANY_SELECTION_FAILED",
                    f"企业报告生成失败：头部企业筛选 AI 调用失败：{error}",
                    {"provider": self.ai_provider},
                ) from error

        if not self.anthropic:
            raise AnalysisStageError(
                "company_selection",
                "AI_COMPANY_SELECTION_NOT_CONFIGURED",
                "企业报告生成失败：未配置头部企业筛选 AI 接口",
                {"provider": self.ai_provider},
            )
        try:
            message = await asyncio.wait_for(
                asyncio.to_thread(
                    self.anthropic.messages.create,
                    model=os.getenv("CLAUDE_MODEL", "claude-3-5-sonnet-20241022"),
                    max_tokens=2200,
                    messages=[{"role": "user", "content": prompt}],
                    system="你是严谨的产业研究员，只返回合法JSON。",
                ),
                timeout=self.ai_timeout_seconds,
            )
            content = message.content[0].text if message.content else ""
            if not content.strip():
                raise ValueError("AI返回空内容")
            return content
        except Exception as error:
            raise AnalysisStageError(
                "company_selection",
                "AI_COMPANY_SELECTION_FAILED",
                f"企业报告生成失败：头部企业筛选 AI 调用失败：{error}",
                {"provider": self.ai_provider},
            ) from error

    def _analyze_companies(self, company_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """将原始数据归一化为前端和 AI 都可消费的企业摘要。"""
        analyzed: List[Dict[str, Any]] = []
        for company in company_data:
            symbol = company.get("symbol", "")
            info = company.get("info") or {}
            source_name = str(company.get("name") or "").strip()
            source_name_is_code = source_name == str(symbol).strip()
            resolved_name = str(
                (info.get("name") or info.get("名称") or info.get("股票名称") or info.get("stock_name"))
                if source_name_is_code else (company.get("name")
                or info.get("name")
                or info.get("名称")
                or info.get("股票名称")
                or info.get("stock_name")
                )
                or symbol
                or "未命名企业"
            ).strip()
            if resolved_name == symbol:
                resolved_name = str(info.get("name") or info.get("名称") or info.get("股票名称") or resolved_name).strip()

            # 追踪原始数据
            raw_kline = company.get("kline") or []
            raw_financial = company.get("financial") or []
            raw_announcements = company.get("announcements") or []
            logger.info(
                "企业原始数据 [%s]: kline=%d, financial=%d, announcements=%d",
                resolved_name, len(raw_kline) if isinstance(raw_kline, list) else 0,
                len(raw_financial) if isinstance(raw_financial, list) else 0,
                len(raw_announcements) if isinstance(raw_announcements, list) else 0
            )

            kline = self._sort_time_series(raw_kline, descending=False)
            financial = self._sort_time_series(raw_financial, descending=True)
            announcements = raw_announcements

            # 追踪排序后数据
            logger.info(
                "企业排序后数据 [%s]: kline=%d, financial=%d",
                resolved_name, len(kline), len(financial)
            )
            prices = [
                self._to_float(
                    row.get("收盘")
                    or row.get("close")
                    or row.get("Close")
                    or row.get("收盘价")
                )
                for row in kline
                if isinstance(row, dict)
            ]
            prices = [price for price in prices if price is not None]

            latest_row = kline[-1] if kline and isinstance(kline[-1], dict) else {}
            latest_change = self._first_number(
                latest_row,
                ["涨跌幅", "pct_chg", "change_pct", "daily_change_pct"],
            )
            high_prices = [
                self._to_float(row.get("最高") or row.get("high") or row.get("High"))
                for row in kline if isinstance(row, dict)
            ]
            low_prices = [
                self._to_float(row.get("最低") or row.get("low") or row.get("Low"))
                for row in kline if isinstance(row, dict)
            ]
            volumes = [
                self._to_float(row.get("成交量") or row.get("volume") or row.get("Volume"))
                for row in kline if isinstance(row, dict)
            ]
            high_prices = [value for value in high_prices if value is not None]
            low_prices = [value for value in low_prices if value is not None]
            volumes = [value for value in volumes if value is not None]

            price_change = ((prices[-1] - prices[0]) / prices[0] * 100) if len(prices) > 1 and prices[0] else None
            volatility = self._calculate_volatility(prices) if prices else None
            max_drawdown = self._calculate_max_drawdown(prices) if prices else None

            financial_metrics = self._build_financial_metrics(financial)
            announcement_rows = announcements if isinstance(announcements, list) else []

            # 追踪公告过滤过程
            logger.info(
                "企业公告处理 [%s]: announcement_rows=%d",
                resolved_name, len(announcement_rows)
            )

            important_announcements = [
                row for row in announcement_rows
                if self._is_official_announcement(row)
                and any(keyword in str(row.get("公告标题") or row.get("title") or "") for keyword in ["重大", "业绩", "增持", "回购", "减持", "预告"])
            ]
            normalized_announcements = [self._normalize_announcement(row) for row in announcement_rows]
            announcement_evidence = [
                item for item in normalized_announcements
                if item.get("evidence_kind") in {"official_filing", "company_ir", "exchange_announcement", "media_article"}
            ]

            # 追踪公告过滤结果
            logger.info(
                "企业公告过滤 [%s]: normalized=%d, evidence=%d",
                resolved_name, len(normalized_announcements), len(announcement_evidence)
            )

            official_announcements = [item for item in announcement_evidence if item.get("evidence_kind") != "media_article"]
            # 投资信号只使用正式公告；媒体报道保留为外部参考，不参与公告方向判断。
            announcement_signal = self._build_announcement_signal(official_announcements)

            availability = {
                "quote": bool(prices),
                "financial": bool(financial),
                "financial_records": len(financial),
                "announcements": bool(announcement_evidence),
                "announcement_records": len(announcement_evidence),
            }
            data_points = sum(1 for value in [availability["quote"], availability["financial"], availability["announcements"]] if value)

            analyzed.append(
                {
                    "id": company.get("id"),
                    "symbol": symbol,
                    "name": resolved_name,
                    "name_en": company.get("name_en"),
                    "market": company.get("market"),
                    "exchange": company.get("exchange"),
                    "country": company.get("country"),
                    "market_position": self._market_position_label(company.get("market_position")),
                    "category": company.get("category"),
                    "relevance": company.get("relevance"),
                    "key_products": company.get("key_products") or [],
                    "node_refs": company.get("node_refs") or [],
                    "ai_selection_rank": company.get("ai_selection_rank"),
                    "ai_selection_reason": company.get("ai_selection_reason"),
                    "price_metrics": {
                        "start_price": prices[0] if prices else None,
                        "current_price": prices[-1] if prices else None,
                        "price_change_pct": round(price_change, 2) if price_change is not None else None,
                        "latest_change_pct": round(latest_change, 2) if latest_change is not None else None,
                        "period_high": max(high_prices) if high_prices else (max(prices) if prices else None),
                        "period_low": min(low_prices) if low_prices else (min(prices) if prices else None),
                        "quote_data_points": len(prices),
                        "average_volume": round(sum(volumes) / len(volumes), 2) if volumes else None,
                        "volatility": round(volatility, 2) if volatility is not None else None,
                        "max_drawdown": round(max_drawdown, 2) if max_drawdown is not None else None,
                        "data_points": len(prices),
                        "latest_date": self._first_value(latest_row, ["日期", "date", "Date"]),
                        "start_date": self._first_value(kline[0], ["日期", "date", "Date"]) if kline and isinstance(kline[0], dict) else None,
                        "trend": "上涨" if price_change is not None and price_change > 3 else "下跌" if price_change is not None and price_change < -3 else "震荡",
                    },
                    "financial_metrics": financial_metrics,
                    "financial_samples": [self._normalize_financial_row(row) for row in financial[:4] if isinstance(row, dict)],
                    "valuation_metrics": self._build_valuation_metrics(info),
                    "financial_quality": self._build_financial_quality(financial_metrics),
                    "tracking_metrics": {
                        "latest_quote_date": self._first_value(latest_row, ["日期", "date", "Date"]),
                        "latest_financial_period": financial_metrics.get("latest_period"),
                        "latest_announcement_date": normalized_announcements[0].get("date") if normalized_announcements else None,
                    },
                    # 公告数量应统计所有证据类型，不只是official_announcements
                    "announcement_count": len(announcement_evidence),
                    "important_announcements": len(important_announcements),
                    "announcement_samples": official_announcements[:5],
                    "latest_announcement_samples": announcement_evidence[:5],
                    "announcement_evidence": announcement_evidence[:8],
                    "official_announcements": official_announcements[:8],
                    "media_evidence": [item for item in announcement_evidence if item.get("evidence_kind") == "media_article"][:8],
                    "announcement_signal": {
                        "latest_date": normalized_announcements[0].get("date") if normalized_announcements else None,
                        "important_titles": [item.get("title") for item in [self._normalize_announcement(row) for row in important_announcements[:5]]],
                        **announcement_signal,
                    },
                    "data_availability": availability,
                    "fetch_errors": company.get("fetch_errors") or {},
                    "data_points_available": data_points,
                    # ETF引用数据
                    "etf_exposures": company.get("etf_exposures", []),
                    "total_etf_weight": company.get("total_etf_weight", 0),
                    "etf_reference_count": len(company.get("etf_exposures", [])),
                }
            )

        # 过滤掉无效名称的企业（None、空字符串、"none"、"未命名企业"等）
        analyzed = [
            company for company in analyzed
            if company.get("name")
            and str(company.get("name")).strip().lower() not in ["none", "null", "未命名企业", ""]
            and company.get("name") != company.get("symbol")  # 排除名称=代码的企业
        ]

        return analyzed

    @staticmethod
    def _is_security_code_name(company: Dict[str, Any]) -> bool:
        name = str(company.get('name') or '').strip()
        symbol = str(company.get('symbol') or '').strip()
        return not name or name == symbol

    def _build_financial_metrics(self, financial: List[Dict[str, Any]]) -> Dict[str, Any]:
        if not financial:
            return {"latest_period": None, "comparison_period": None, "revenue": None, "net_profit": None, "revenue_growth": None, "profit_growth": None, "growth_basis": "无法确认", "revenue_growth_type": "无法确认", "profit_growth_type": "无法确认", "records": 0}

        latest = financial[0] if isinstance(financial[0], dict) else {}
        comparison = financial[1] if len(financial) > 1 and isinstance(financial[1], dict) else {}
        period_keys = ["报告期", "报告日期", "截止日期", "日期", "period", "date", "report_date", "report_period", "end_date", "fiscalDateEnding", "calendardate", "datekey"]
        latest_period = self._first_value(latest, period_keys)
        comparison_period = self._first_value(comparison, period_keys)
        basis = self._infer_growth_basis(latest_period, comparison_period, latest, comparison)
        return {
            "latest_period": latest_period,
            "comparison_period": comparison_period,
            "revenue": self._first_number(latest, ["营业收入", "营业总收入", "营收", "revenue", "total_revenue"]),
            "net_profit": self._first_number(latest, ["净利润", "归母净利润", "归属于母公司股东的净利润", "net_income", "net_profit"]),
            "gross_margin": self._first_number(latest, ["毛利率", "gross_margin", "gross_margin_pct"]),
            "net_margin": self._first_number(latest, ["净利率", "net_margin", "net_margin_pct"]),
            "operating_cash_flow": self._first_number(latest, ["经营现金流", "经营活动现金流量净额", "operating_cash_flow"]),
            "capex": self._first_number(latest, ["资本开支", "购建固定资产无形资产和其他长期资产支付的现金", "capex"]),
            "revenue_growth": self._calculate_growth_rate(financial, ["营业收入", "营业总收入", "营收", "revenue", "total_revenue"]),
            "profit_growth": self._calculate_growth_rate(financial, ["净利润", "归母净利润", "归属于母公司股东的净利润", "net_income", "net_profit"]),
            "growth_basis": basis,
            "revenue_growth_type": basis,
            "profit_growth_type": basis,
            "records": len(financial),
        }

    @classmethod
    def _normalize_financial_row(cls, row: Dict[str, Any]) -> Dict[str, Any]:
        """保留可核对的财报原始字段，避免 AI 只看到派生增长率。"""
        fields = [
            "报告期", "报告日期", "截止日期", "日期", "period", "date", "report_date", "report_period",
            "营业收入", "营业总收入", "营收", "revenue", "total_revenue",
            "净利润", "归母净利润", "归属于母公司股东的净利润", "net_income", "net_profit",
            "经营现金流", "经营活动现金流量净额", "operating_cash_flow",
            "报告类型", "报表类型", "period_type", "type",
        ]
        return {key: cls._json_safe(row[key]) for key in fields if key in row and row[key] is not None}

    @staticmethod
    def _json_safe(value: Any) -> Any:
        if value is None or isinstance(value, (str, int, bool)):
            return value
        if isinstance(value, float):
            return None if math.isnan(value) or math.isinf(value) else value
        if hasattr(value, "isoformat"):
            return value.isoformat()
        if hasattr(value, "item"):
            try:
                return IndustryCompanyAnalyzer._json_safe(value.item())
            except Exception:
                pass
        if isinstance(value, dict):
            return {str(key): IndustryCompanyAnalyzer._json_safe(item) for key, item in value.items()}
        if isinstance(value, (list, tuple)):
            return [IndustryCompanyAnalyzer._json_safe(item) for item in value]
        return str(value)

    @staticmethod
    def _infer_growth_basis(latest_period: Any, comparison_period: Any, latest: Dict[str, Any], comparison: Dict[str, Any]) -> str:
        text = " ".join(str(latest.get(key, "")) + " " + str(comparison.get(key, "")) for key in ["报告类型", "报表类型", "period_type", "type"])
        if any(token in text.lower() for token in ["同比", "yoy", "year"]):
            return "同比"
        if latest_period and comparison_period:
            try:
                latest_date = datetime.fromisoformat(str(latest_period)[:10])
                comparison_date = datetime.fromisoformat(str(comparison_period)[:10])
                days = abs((latest_date - comparison_date).days)
                if 300 <= days <= 430:
                    return "同比"
            except (TypeError, ValueError):
                pass
            return "连续报告期变化"
        return "无法确认"

    @staticmethod
    def _build_valuation_metrics(info: Dict[str, Any]) -> Dict[str, Any]:
        pe = IndustryCompanyAnalyzer._first_number(info, ["市盈率", "市盈率-动态", "市盈率(动态)", "pe", "PE", "pe_ttm"])
        pb = IndustryCompanyAnalyzer._first_number(info, ["市净率", "市净率(动态)", "pb", "PB"])
        ps = IndustryCompanyAnalyzer._first_number(info, ["市销率", "市销率(动态)", "ps", "PS"])
        return {"pe": pe, "pb": pb, "ps": ps, "source": "info" if any(value is not None for value in [pe, pb, ps]) else None}

    @staticmethod
    def _build_financial_quality(financial: Dict[str, Any]) -> Dict[str, Any]:
        values = {key: financial.get(key) for key in ["gross_margin", "net_margin", "operating_cash_flow", "capex"]}
        return {**values, "available": any(value is not None for value in values.values())}

    @staticmethod
    def _normalize_announcement(row: Dict[str, Any]) -> Dict[str, Any]:
        title = str(row.get("公告标题") or row.get("title") or "未命名公告")
        source = str(row.get("source") or "")
        evidence_kind = "media_article" if any(token in source.lower() for token in ["yfinance", "openbb", "news", "media"]) else "official_filing"
        return {
            "title": title,
            "date": str(row.get("公告日期") or row.get("date") or ""),
            "url": str(row.get("网址") or row.get("url") or ""),
            "source": source,
            "evidence_kind": evidence_kind,
            "event_type": IndustryCompanyAnalyzer._classify_announcement(title),
            "importance": "high" if evidence_kind != "media_article" and any(keyword in title for keyword in ["重大", "回购", "增持", "减持", "业绩预告", "诉讼", "处罚"]) else "normal",
            "direction": "positive" if any(keyword in title for keyword in ["回购", "增持", "订单", "中标", "合作", "扩产", "研发", "新品"]) else "negative" if any(keyword in title for keyword in ["减持", "亏损", "风险", "诉讼", "处罚"]) else "neutral",
            "post_5d_change_pct": None,
            "post_20d_change_pct": None,
        }

    @staticmethod
    def _is_official_announcement(row: Dict[str, Any]) -> bool:
        source = str(row.get("source") or "").lower()
        return not any(token in source for token in ["yfinance", "openbb", "news", "media"])

    @staticmethod
    def _build_announcement_signal(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
        if not rows:
            return {"direction": "unknown", "score": 0, "high_impact_count": 0}
        weights = {"positive": 1.0, "negative": -1.0, "neutral": 0.0}
        score = sum(weights.get(str(row.get("direction")), 0.0) for row in rows[:10])
        high_impact = sum(1 for row in rows[:10] if row.get("importance") == "high")
        direction = "positive" if score > 0.5 else "negative" if score < -0.5 else "mixed"
        return {"direction": direction, "score": round(score, 2), "high_impact_count": high_impact}

    @staticmethod
    def _classify_announcement(title: str) -> str:
        categories = [
            ("回购", ["回购"]), ("增持", ["增持"]), ("减持", ["减持"]),
            ("财报/业绩", ["年度报告", "半年度报告", "季度报告", "财务报告", "业绩预告", "业绩快报", "业绩说明会", "业绩"]),
            ("订单/合同", ["订单", "合同", "中标"]),
            ("战略合作", ["合作", "战略协议"]), ("产能扩张", ["扩产", "产能", "建设项目"]),
            ("技术/产品", ["技术", "产品", "发布", "研发"]), ("融资/发债", ["融资", "发债", "定增"]),
            ("股权激励", ["股权激励", "员工持股"]), ("风险/诉讼/处罚", ["风险", "诉讼", "处罚"]),
        ]
        for category, keywords in categories:
            if any(keyword in title for keyword in keywords):
                return category
        return "例行公告"

    @classmethod
    def _sort_time_series(cls, rows: List[Dict[str, Any]], descending: bool) -> List[Dict[str, Any]]:
        """统一外部数据顺序；行情旧→新，财报新→旧。"""
        if not isinstance(rows, list) or len(rows) < 2:
            return rows if isinstance(rows, list) else []
        date_keys = ["报告期", "报告日期", "截止日期", "日期", "period", "date", "report_date", "report_period", "end_date", "fiscalDateEnding", "calendardate", "datekey"]
        dated = []
        for index, row in enumerate(rows):
            if not isinstance(row, dict):
                continue
            value = cls._first_value(row, date_keys)
            try:
                value_text = str(value or "")
                quarter_match = re.match(r"^(\d{4})[- ]?Q([1-4])$", value_text, re.IGNORECASE)
                if quarter_match:
                    timestamp = datetime(int(quarter_match.group(1)), int(quarter_match.group(2)) * 3, 1).timestamp()
                    dated.append((timestamp, index, row))
                    continue
                timestamp = datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp() if value else float(index)
            except (TypeError, ValueError, OverflowError):
                try:
                    timestamp = datetime.strptime(str(value)[:10], "%Y-%m-%d").timestamp() if value else float(index)
                except (TypeError, ValueError, OverflowError):
                    timestamp = float(index)
            dated.append((timestamp, index, row))
        return [row for _, _, row in sorted(dated, key=lambda item: (item[0], item[1]), reverse=descending)] if dated else rows

    @staticmethod
    def _first_value(row: Dict[str, Any], keys: List[str]) -> Any:
        for key in keys:
            value = row.get(key)
            if value not in (None, "", "nan", "NaN"):
                # pandas.Timestamp 可能带时区；统一成字符串，避免跨数据源聚合时比较
                # tz-naive 与 tz-aware 时间戳导致整条分析链路失败。
                if hasattr(value, "isoformat"):
                    return value.isoformat()
                return str(value) if not isinstance(value, (int, float, bool)) else value
        return None

    @classmethod
    def _first_number(cls, row: Dict[str, Any], keys: List[str]) -> Optional[float]:
        for key in keys:
            value = cls._to_float(row.get(key))
            if value is not None:
                return value
        return None

    @staticmethod
    def _to_float(value: Any) -> Optional[float]:
        if value is None or isinstance(value, bool):
            return None
        if isinstance(value, (int, float)):
            return float(value) if math.isfinite(float(value)) else None
        text = str(value).replace(",", "").replace("%", "").strip()
        if not text or text.lower() in {"nan", "none", "null", "--", "-"}:
            return None
        match = re.search(r"[-+]?\d+(?:\.\d+)?", text)
        if not match:
            return None
        try:
            number = float(match.group(0))
            return number if math.isfinite(number) else None
        except ValueError:
            return None

    def _calculate_volatility(self, prices: List[float]) -> float:
        if len(prices) < 2:
            return 0
        returns = [(prices[index] - prices[index - 1]) / prices[index - 1] for index in range(1, len(prices) or 0) if prices[index - 1]]
        if not returns:
            return 0
        mean = sum(returns) / len(returns)
        variance = sum((item - mean) ** 2 for item in returns) / len(returns)
        return (variance ** 0.5) * (252 ** 0.5) * 100

    @staticmethod
    def _calculate_max_drawdown(prices: List[float]) -> float:
        if not prices:
            return 0
        peak = prices[0]
        max_drawdown = 0.0
        for price in prices:
            peak = max(peak, price)
            if peak:
                max_drawdown = min(max_drawdown, (price - peak) / peak * 100)
        return abs(max_drawdown)

    def _calculate_growth_rate(self, financial_data: List[Dict[str, Any]], fields: List[str]) -> Optional[float]:
        if len(financial_data) < 2:
            return None
        latest = self._first_number(financial_data[0], fields)
        previous = self._first_number(financial_data[1], fields)
        if latest is None or previous in (None, 0):
            return None
        return round((latest - previous) / abs(previous) * 100, 2)

    def _identify_top_companies(self, analyzed_companies: List[Dict[str, Any]], top_n: int = 10) -> List[Dict[str, Any]]:
        """
        优化后的企业排序评分系统 (v3 - 资金认可度优先)

        评分体系 (总分100):
        - 资金认可度: 40分 (ETF引用数量30 + 持仓权重10) ⭐ 核心指标
        - 行业影响力: 25分 (营收规模10 + 市场地位8 + 产业链位置7)
        - 基本面质量: 20分 (盈利能力10 + 成长性7 + 现金流3)
        - 市场表现: 10分 (区间涨幅7 + 稳定性3)
        - 成长潜力: 5分 (公告信号)

        设计理念：
        被多个ETF共同选为Top 10持仓，说明该企业在领域内具有广泛的资金认可度，
        这比单一维度的财务指标或市场表现更能体现其在领域中的核心地位。
        """
        # 先统计ETF引用数量的分布，用于计算相对得分
        etf_reference_counts = [c.get("etf_reference_count", 0) for c in analyzed_companies]
        max_etf_ref = max(etf_reference_counts) if etf_reference_counts else 1

        for company in analyzed_companies:
            # 新评分体系
            score_breakdown = {
                "capital_recognition": 0,      # 资金认可度 (40分) ⭐ 最重要
                "industry_influence": 0,       # 行业影响力 (25分)
                "fundamentals": 0,             # 基本面质量 (20分)
                "market_performance": 0,       # 市场表现 (10分)
                "growth_potential": 0,         # 成长潜力 (5分)
                "data_completeness": round(company.get("data_points_available", 0) / 3 * 10, 1),
            }

            # 1. 资金认可度评分 (40分) ⭐ 核心指标
            capital_score = 0

            # 1.1 ETF引用数量评分 (30分) - 被多少个ETF持有
            etf_ref_count = company.get("etf_reference_count", 0)
            if max_etf_ref > 0 and etf_ref_count > 0:
                # 基于相对排名的非线性评分，突出头部企业
                ref_ratio = etf_ref_count / max_etf_ref
                if ref_ratio >= 0.8:  # 被80%以上的顶级ETF持有
                    capital_score += 30
                elif ref_ratio >= 0.6:  # 被60%-80%的ETF持有
                    capital_score += 25
                elif ref_ratio >= 0.4:  # 被40%-60%的ETF持有
                    capital_score += 20
                elif ref_ratio >= 0.2:  # 被20%-40%的ETF持有
                    capital_score += 15
                else:  # 被少于20%的ETF持有
                    capital_score += max(5, ref_ratio * 30)

            # 1.2 ETF持仓权重评分 (10分) - 在持有企业的ETF中的平均权重
            total_etf_weight = company.get("total_etf_weight", 0)
            if total_etf_weight > 0 and etf_ref_count > 0:
                avg_weight = total_etf_weight / etf_ref_count  # 平均每个ETF的持仓占比
                if avg_weight > 3:  # 平均占比超过3%
                    capital_score += 10
                elif avg_weight > 2:
                    capital_score += 8
                elif avg_weight > 1:
                    capital_score += 6
                elif avg_weight > 0.5:
                    capital_score += 4
                else:
                    capital_score += 2

            score_breakdown["capital_recognition"] = round(capital_score, 1)

            # 2. 行业影响力评分 (25分)
            influence_score = 0

            # 2.1 营收规模评分 (10分) - 基于行业分位数
            # 2.1 营收规模评分 (10分) - 基于行业分位数
            revenue = company.get("financial_metrics", {}).get("revenue")
            if revenue is not None and revenue > 0:
                revenues = [c.get("financial_metrics", {}).get("revenue", 0)
                           for c in analyzed_companies
                           if c.get("financial_metrics", {}).get("revenue") is not None and c.get("financial_metrics", {}).get("revenue") > 0]

                if revenues:
                    revenues_sorted = sorted(revenues, reverse=True)
                    try:
                        rank_index = revenues_sorted.index(revenue)
                        percentile = (rank_index + 1) / len(revenues_sorted)

                        if percentile <= 0.1:  # Top 10%
                            influence_score += 10
                        elif percentile <= 0.25:  # Top 25%
                            influence_score += 8
                        elif percentile <= 0.5:  # Top 50%
                            influence_score += 5
                        else:
                            influence_score += 3
                    except ValueError:
                        influence_score += 3

            # 2.2 市场地位评分 (8分)
            position = str(company.get("market_position", "")).strip().lower()
            position_score = {
                "leader": 8, "头部": 8, "龙头": 8,
                "major": 6, "主要": 6, "核心": 6,
                "emerging": 3, "新兴": 3, "相关": 1,
            }.get(position, 0)
            influence_score += position_score

            # 2.3 产业链位置评分 (7分)
            refs = company.get("node_refs", [])
            segments = {ref.get("segment_name") for ref in refs if isinstance(ref, dict) and ref.get("segment_name")}
            coverage_score = min(7, len(segments) * 2)
            influence_score += coverage_score

            score_breakdown["industry_influence"] = round(influence_score, 1)

            # 3. 基本面质量评分 (20分)
            fundamentals_score = 0
            financial = company.get("financial_metrics", {})

            # 3.1 盈利能力评分 (10分) - 使用净利率估算
            net_profit = financial.get("net_profit")
            revenue_value = financial.get("revenue")
            if net_profit is not None and revenue_value is not None and revenue_value > 0:
                net_margin = (net_profit / revenue_value) * 100
                if net_margin > 15:
                    fundamentals_score += 10
                elif net_margin > 10:
                    fundamentals_score += 8
                elif net_margin > 5:
                    fundamentals_score += 5
                elif net_margin > 0:
                    fundamentals_score += 3

            # 3.2 成长性评分 (7分)
            revenue_growth = financial.get("revenue_growth")
            profit_growth = financial.get("profit_growth")
            growth_is_comparable = financial.get("growth_basis") not in (None, "无法确认")

            if growth_is_comparable:
                if revenue_growth is not None and profit_growth is not None:
                    if revenue_growth > 30 and profit_growth > 30:
                        fundamentals_score += 7
                    elif revenue_growth > 20 or profit_growth > 20:
                        fundamentals_score += 5
                    elif revenue_growth > 10 or profit_growth > 10:
                        fundamentals_score += 3

            # 3.3 现金流质量评分 (3分)
            cash_flow = financial.get("operating_cash_flow")
            if cash_flow is not None and net_profit is not None and net_profit > 0:
                cf_ratio = cash_flow / net_profit if net_profit != 0 else 0
                if cf_ratio > 1:
                    fundamentals_score += 3
                elif cf_ratio > 0.5:
                    fundamentals_score += 2
                elif cf_ratio > 0:
                    fundamentals_score += 1
            elif cash_flow is not None and cash_flow > 0:
                fundamentals_score += 1

            score_breakdown["fundamentals"] = round(fundamentals_score, 1)

            # 4. 市场表现评分 (10分)
            market_score = 0
            price_metrics = company.get("price_metrics", {})
            price_change = price_metrics.get("price_change_pct")

            if price_change is not None:
                # 区间涨幅 (7分)
                if price_change > 20:
                    market_score += 7
                elif price_change > 10:
                    market_score += 5
                elif price_change > 0:
                    market_score += 3
                elif price_change > -10:
                    market_score += 1

                # 稳定性 (3分)
                volatility = price_metrics.get("volatility")
                if volatility is not None:
                    if volatility < 30:
                        market_score += 3
                    elif volatility < 50:
                        market_score += 2
                    elif volatility < 70:
                        market_score += 1

            score_breakdown["market_performance"] = round(market_score, 1)

            # 5. 成长潜力评分 (5分)
            growth_score = 0
            announcement_signal = company.get("announcement_signal", {})
            announcement_score_raw = float(announcement_signal.get("score", 0))
            if company.get("announcement_count", 0) > 0:
                growth_score = min(5, max(0, 2.5 + announcement_score_raw * 2.5))

            score_breakdown["growth_potential"] = round(growth_score, 1)

            # 计算总分
            available_scores = [v for k, v in score_breakdown.items() if k != "data_completeness" and v is not None]
            score = sum(available_scores)

            # 保留旧字段以兼容前端
            company["score_breakdown"] = score_breakdown
            company["representativeness_score"] = score_breakdown["industry_influence"]
            company["representativeness_basis"] = self._representativeness_basis_v2(company, score_breakdown)
            company["fundamental_score"] = round(score_breakdown["fundamentals"] + score_breakdown["growth_potential"], 1)
            company["market_score"] = score_breakdown["market_performance"]
            company["overall_score"] = round(score, 1) if available_scores else None
            company["composite_score"] = company["overall_score"]
            company["score_confidence"] = round(company.get("data_points_available", 0) / 3, 2)
            company["confidence_grade"] = "高" if company["score_confidence"] >= 0.75 else "中" if company["score_confidence"] >= 0.5 else "低"
            company["risk_adjusted_score"] = round(score * (0.7 + company["score_confidence"] * 0.3), 1) if available_scores else None

            latest_change = company["price_metrics"].get("latest_change_pct")
            announcement_direction = (company.get("announcement_signal") or {}).get("direction")
            company["investment_signal"] = self._build_investment_signal(
                company, growth_is_comparable, latest_change, announcement_direction,
            )

            # 添加ETF引用数量（用于前端展示）
            company["etf_reference_count"] = company.get("etf_reference_count", 0)

        ranked = sorted(
            analyzed_companies,
            key=lambda item: (item.get("composite_score", 0), item.get("score_confidence", 0)),
            reverse=True,
        )

        # 对"AI算力硬件"图谱中的外围应用节点降级为补充样本：终端视觉/应用公司可以保留在完整企业清单，
        # 但不能因为市场地位高就挤占核心芯片、设备、服务器和数据中心企业的重点观察位。
        core_ranked = [item for item in ranked if not any(
            str(ref.get("segment_code") or "").lower() in {"edge_applications", "ai_applications"}
            or str(ref.get("segment_name") or "") in {"终端AI应用", "智能视觉与边缘应用"}
            for ref in (item.get("node_refs") or []) if isinstance(ref, dict)
        )]
        ranked = core_ranked + [item for item in ranked if item not in core_ranked]

        # 先覆盖不同产业链环节，再用综合分补足，避免 Top N 被单一环节垄断。
        selected: List[Dict[str, Any]] = []
        selected_ids = set()
        for company in ranked:
            primary_segment = next(iter(company.get("node_refs") or []), {}).get("segment_name")
            if primary_segment and primary_segment not in selected_ids:
                selected.append(company)
                selected_ids.add(primary_segment)
            if len(selected) >= top_n:
                return selected[:top_n]
        for company in ranked:
            if company not in selected:
                selected.append(company)
            if len(selected) >= top_n:
                break
        return selected[:top_n]

    @staticmethod
    def _build_investment_signal(
        company: Dict[str, Any],
        growth_is_comparable: bool,
        latest_change: Optional[float],
        announcement_direction: Optional[str],
    ) -> Dict[str, Any]:
        """把企业事实转换为可核对的观察结论，供页面/综合报告直接使用。"""
        financial = company.get("financial_metrics") or {}
        reasons: List[str] = []
        if growth_is_comparable and (financial.get("revenue_growth") or 0) > 0 and (financial.get("profit_growth") or 0) > 0:
            reasons.append("营收与净利润同向增长")
        elif financial.get("growth_basis") == "无法确认":
            reasons.append("财报期或对比口径缺失")
        if latest_change is not None:
            reasons.append(f"最新交易日{latest_change:+.2f}%")
        if announcement_direction in {"positive", "negative", "mixed"}:
            reasons.append(f"公告信号{announcement_direction}")
        if not reasons:
            reasons.append("可核对证据不足")
        stance = "积极观察" if growth_is_comparable and (financial.get("revenue_growth") or 0) > 0 and (financial.get("profit_growth") or 0) > 0 and (latest_change or 0) >= 0 else "谨慎观察"
        risks = []
        if financial.get("operating_cash_flow") is None:
            risks.append("经营现金流暂无，盈利质量未完成验证")
        if financial.get("growth_basis") == "无法确认":
            risks.append("财报期或增长口径无法确认")
        if not company.get("official_announcements"):
            risks.append("暂无可验证的正式公告")
        return {
            "stance": stance,
            "reasons": reasons,
            "risks": risks or ["暂无额外结构化风险"],
            "trigger": "等待最新财报期、经营现金流与正式公告补齐" if risks else "跟踪后续财报与公告执行结果",
        }

    @staticmethod
    def _calculate_representativeness(company: Dict[str, Any]) -> float:
        """基于图谱元数据计算行业代表性，不用短期行情替代行业地位。"""
        position = str(company.get("market_position") or "").strip().lower()
        position_score = {
            "leader": 40, "头部": 40, "龙头": 40,
            "major": 28, "主要": 28, "核心": 28,
            "emerging": 16, "新兴": 16, "相关": 8,
        }.get(position, 0)
        refs = company.get("node_refs") or []
        segments = {
            ref.get("segment_id") or ref.get("segment_code") or ref.get("segment_name")
            for ref in refs if isinstance(ref, dict)
        }
        coverage_score = min(10, max(0, len([item for item in segments if item])))
        product_score = min(10, len(company.get("key_products") or []) * 2)
        category_score = 8 if str(company.get("category") or "").strip() in {"核心标的", "核心", "重点"} else 0
        relevance = company.get("relevance")
        try:
            relevance_score = min(10, max(0, float(relevance) * 10)) if relevance is not None else 0
        except (TypeError, ValueError):
            relevance_score = 0
        return round(position_score + coverage_score + product_score + category_score + relevance_score, 1)

    @staticmethod
    def _representativeness_basis(company: Dict[str, Any]) -> str:
        position = company.get("market_position") or "未标注"
        refs = company.get("node_refs") or []
        segments = list(dict.fromkeys(
            ref.get("segment_name") for ref in refs
            if isinstance(ref, dict) and ref.get("segment_name")
        ))
        products = company.get("key_products") or []
        details = [f"市场地位={position}"]
        if company.get("category"):
            details.append(f"标的类别={company.get('category')}")
        if company.get("relevance") is not None:
            details.append(f"图谱相关度={company.get('relevance')}")
        if segments: details.append(f"覆盖环节={len(segments)}")
        if products: details.append(f"核心产品={len(products)}项")
        return "；".join(details)

    @staticmethod
    def _representativeness_basis_v2(company: Dict[str, Any], score_breakdown: Dict[str, Any]) -> str:
        """优化后的企业影响力描述（v2评分体系）"""
        details = []

        # 营收规模
        revenue = company.get("financial_metrics", {}).get("revenue")
        if revenue is not None and revenue > 0:
            revenue_billion = revenue / 1_000_000_000
            details.append(f"营收{revenue_billion:.0f}亿")

        # 市场地位
        position = company.get("market_position")
        if position and position != "未标注":
            details.append(f"市场地位={position}")

        # 产业链覆盖
        refs = company.get("node_refs") or []
        segments = {ref.get("segment_name") for ref in refs if isinstance(ref, dict) and ref.get("segment_name")}
        if segments:
            details.append(f"覆盖环节={len(segments)}个")

        # ETF认可度
        etf_weight = company.get("total_etf_weight", 0)
        if etf_weight > 0:
            details.append(f"ETF持仓{etf_weight:.1f}%")

        # 成长性
        financial = company.get("financial_metrics", {})
        revenue_growth = financial.get("revenue_growth")
        if revenue_growth is not None and revenue_growth > 20:
            details.append(f"营收增长{revenue_growth:.0f}%")

        return "；".join(details) if details else "数据不足"

    @staticmethod
    def _build_data_coverage(
        companies: List[Dict[str, Any]],
        company_data: List[Dict[str, Any]],
        analyzed: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        now = datetime.now()
        with_quote = sum(1 for item in analyzed if item.get("data_availability", {}).get("quote"))
        with_financial = sum(1 for item in analyzed if item.get("data_availability", {}).get("financial"))
        with_announcements = sum(1 for item in analyzed if item.get("data_availability", {}).get("announcements"))
        error_companies = sum(1 for item in analyzed if item.get("fetch_errors"))
        quote_dates = [item.get("price_metrics", {}).get("latest_date") for item in analyzed if item.get("price_metrics", {}).get("latest_date")]
        quote_start_dates = [item.get("price_metrics", {}).get("start_date") for item in analyzed if item.get("price_metrics", {}).get("start_date")]
        financial_periods = [item.get("financial_metrics", {}).get("latest_period") for item in analyzed if item.get("financial_metrics", {}).get("latest_period")]
        announcement_dates = [item.get("announcement_signal", {}).get("latest_date") for item in analyzed if item.get("announcement_signal", {}).get("latest_date")]
        def coverage_grade(value: int, total: int) -> str:
            ratio = value / total * 100 if total else 0
            return "不可判断" if ratio == 0 else "高" if ratio >= 75 and value >= 5 else "中" if ratio >= 50 else "低"
        return {
            "graph_companies": len(companies),
            "fetched_companies": len(company_data),
            "analyzed_companies": len(analyzed),
            "companies_with_any_data": sum(1 for item in analyzed if item.get("data_points_available", 0) > 0),
            "error_companies": error_companies,
            "quote_coverage": with_quote,
            "financial_coverage": with_financial,
            "announcement_coverage": with_announcements,
            "quote_coverage_pct": round(with_quote / len(companies) * 100, 1) if companies else 0,
            "financial_coverage_pct": round(with_financial / len(companies) * 100, 1) if companies else 0,
            "announcement_coverage_pct": round(with_announcements / len(companies) * 100, 1) if companies else 0,
            "missing_symbol": sum(1 for item in companies if not item.get("symbol")),
            "unresolved_companies": [item.get("name") for item in companies if not item.get("symbol")],
            "coverage_grade": {
                "quote": coverage_grade(with_quote, len(companies)),
                "financial": coverage_grade(with_financial, len(companies)),
                "announcement": coverage_grade(with_announcements, len(companies)),
            },
            "conclusion_scope": "全体企业" if with_quote == len(companies) and with_financial == len(companies) and with_announcements == len(companies) else "仅覆盖企业样本，未覆盖企业不纳入对应维度结论",
            "analysis_started_at": (now - timedelta(days=90)).isoformat(),
            "analyzed_at": now.isoformat(),
            "quote_period_start": min(quote_start_dates) if quote_start_dates else None,
            "quote_period_end": max(quote_dates) if quote_dates else None,
            "financial_period_latest": max(financial_periods) if financial_periods else None,
            "announcement_period_start": min(announcement_dates) if announcement_dates else None,
            "announcement_period_end": max(announcement_dates) if announcement_dates else None,
        }

    async def _generate_trend_report(
        self,
        industry_name: str,
        industry_id: str,
        nodes: List[Dict[str, Any]],
        analyzed_companies: List[Dict[str, Any]],
        top_companies: List[Dict[str, Any]],
        coverage: Dict[str, Any],
    ) -> str:
        context = self._build_analysis_context(industry_name, industry_id, nodes, analyzed_companies, top_companies, coverage)
        if self.ai_provider in {'chatgpt', 'openai'}:
            if not self.chatgpt:
                raise AnalysisStageError('ai_report', 'AI_REPORT_NOT_CONFIGURED', 'AI报告生成失败：未配置 ChatGPT 兼容接口', {'provider': self.ai_provider})
        elif not self.anthropic:
            raise AnalysisStageError(
                "ai_report",
                "AI_REPORT_NOT_CONFIGURED",
                "AI报告生成失败：未配置 Anthropic API Key",
                {"coverage": coverage},
            )

        try:
            system_prompt = "你是严谨的产业研究员。你的任务是把企业级证据综合为领域级判断，而不是复述企业卡片。优先保证事实可核对、影响链条清楚、数据限制透明；不要为了完整而猜测，不要输出空泛的行业套话。输出纯Markdown格式，不要使用额外的格式标记。"
            user_prompt = f"""你是资深产业研究员，请仅基于核心企业数据，生成《{industry_name} 企业发展趋势分析报告》。

{context}

分析目标：
- 从企业经营数据中提炼领域级趋势，不是罗列企业卡片
- 识别不同产业链环节的差异化表现（供给端、需求端、基础设施）
- 基于有效财报和公告数据形成判断，忽略无效或缺失的数据
- 给出明确的投资建议，不是模糊的"关注"或"观察"

核心规则：
1. **只使用输入中的有效数据**：只引用有财报期、营收数据或公告日期的企业；缺失值不参与判断
2. **聚焦差异化分析**：对比不同环节、不同规模企业的财报和公告表现，识别领域内的结构性变化
3. **验证数据质量**：标注增长口径（同比/环比/无法确认），提示现金流与利润的匹配度
4. **公告必须有实质内容**：只引用能说明订单、产能、合作、风险的公告，不引用"重要公告X条"等统计数字
5. **结论必须可执行**：每个建议必须说明"在什么条件下执行什么动作"，不能只写"关注"

输出纯Markdown格式，包含以下三个部分：

# {industry_name} 企业发展趋势分析

## 一、趋势判断

总结2-4条领域级趋势，每条需要：
- **经营/竞争事实**：哪些环节的哪类企业出现什么变化（用1-2家代表企业说明，不要逐家罗列）
- **核心证据**：具体的财报数据（营收增长%、利润增长%、现金流状况）或公告主题（订单/产能/合作）
- **领域影响**：这个变化对整个领域供需、竞争格局或资本开支的影响
- **证据分化**：是否有反向证据或待验证点

示例格式：
- **供给端产能扩张加速**：设备商A营收增长35%、B增长28%（均为同比），订单类公告集中在Q2，说明下游扩产需求强劲。但需验证利润增长是否与营收匹配（A利润仅增15%，B数据缺失），以及现金流能否支撑持续扩张。

## 二、关注重点

列出3-6个最重要的验证事项，格式：
- **验证什么**：具体的数据指标或事件（如"芯片厂Q3财报现金流"、"服务器厂新订单公告"）
- **为什么重要**：该数据如何验证或反驳趋势判断
- **如何改变判断**：验证通过vs验证失败，分别对应什么投资决策

## 三、投资建议结论

给出明确的领域级操作建议，必须包含：
- **建议动作**：允许小幅增加 / 维持仓位 / 降低风险 / 暂不新增（四选一）
- **适用标的**：哪些产业链环节或企业类型
- **支持理由**：基于趋势判断的2-3条核心依据（用数据说话）
- **反向风险**：什么情况下建议失效（具体的数据阈值或事件）
- **执行条件**：什么信号出现时执行（如"Q3财报确认现金流改善"）

禁止：
- 不要逐家企业罗列卡片式信息
- 不要引用"综合评分XX分"等评分数据
- 不要使用"关注"、"观察"、"等待"等模糊词汇作为最终建议
- 不要补造输入中没有的企业名称、财报数据或公告内容
"""

            def generate() -> Any:
                if self.ai_provider in {'chatgpt', 'openai'}:
                    return self.chatgpt.complete(user_prompt, system_prompt, self.ai_max_tokens)
                return self.anthropic.messages.create(
                    model=os.getenv("CLAUDE_MODEL", "claude-3-5-sonnet-20241022"),
                    max_tokens=self.ai_max_tokens,
                    messages=[
                        {
                            "role": "user",
                            "content": user_prompt,
                        }
                    ],
                    system=system_prompt,
                )

            message = None
            last_error: Optional[Exception] = None
            for attempt in range(self.ai_retries + 1):
                try:
                    message = await asyncio.wait_for(
                        asyncio.to_thread(generate),
                        timeout=self.ai_timeout_seconds,
                    )
                    break
                except Exception as error:
                    last_error = error
                    if attempt >= self.ai_retries or not self._is_retryable_ai_error(error):
                        raise
                    delay = min(5 * (attempt + 1), 15)
                    logger.warning(
                        "企业趋势 AI 报告第 %s 次调用超时，%s 秒后重试: %s",
                        attempt + 1,
                        delay,
                        error,
                    )
                    await asyncio.sleep(delay)

            if message is None and last_error:
                raise last_error
            content = message if isinstance(message, str) else (message.content[0].text if message.content else "")

            # 清理AI输出中的格式标记（如```markdown等）
            if content:
                content = self._clean_ai_report(content)

            if content and self._is_valid_trend_report(content):
                return content
            if content:
                raise AnalysisStageError(
                    "ai_report",
                    "AI_REPORT_INVALID",
                    "AI报告生成失败：报告缺少必需章节或内容过短",
                    {"coverage": coverage, "content_length": len(content)},
                )
            raise AnalysisStageError(
                "ai_report",
                "AI_REPORT_EMPTY",
                "AI报告生成失败：模型返回空内容",
                {"coverage": coverage},
            )
        except Exception as error:
            if isinstance(error, AnalysisStageError):
                raise
            logger.warning("企业趋势 AI 报告生成失败: %s", error)
            timeout_seconds = self.ai_timeout_seconds
            if isinstance(error, (asyncio.TimeoutError, TimeoutError)):
                message = f"AI报告生成失败：模型调用超时（{timeout_seconds}秒）"
            else:
                error_name = type(error).__name__
                error_detail = str(error).strip() or repr(error)
                message = f"AI报告生成失败：{error_name}：{error_detail}"
            raise AnalysisStageError(
                "ai_report",
                "AI_REPORT_GENERATION_FAILED",
                message,
                {"coverage": coverage, "exception_type": type(error).__name__},
            ) from error

    @staticmethod
    def _clean_ai_report(content: str) -> str:
        """清理AI报告中的格式标记和代码块包装"""
        if not content:
            return content

        # 移除Markdown代码块标记
        cleaned = re.sub(r'^```markdown\s*\n', '', content, flags=re.MULTILINE)
        cleaned = re.sub(r'^```\s*\n', '', cleaned, flags=re.MULTILINE)
        cleaned = re.sub(r'\n```\s*$', '', cleaned)

        # 移除多余的空行（超过2个连续换行）
        cleaned = re.sub(r'\n{3,}', '\n\n', cleaned)

        return cleaned.strip()

    @staticmethod
    def _is_timeout_error(error: Exception) -> bool:
        error_name = type(error).__name__.lower()
        return isinstance(error, (asyncio.TimeoutError, TimeoutError, httpx.TimeoutException)) or "timeout" in error_name

    @staticmethod
    def _is_retryable_ai_error(error: Exception) -> bool:
        """重试瞬时网络错误和网关故障，不把模型拒绝或格式错误伪装成成功。"""
        error_name = type(error).__name__.lower()
        if isinstance(error, httpx.HTTPStatusError):
            status_code = error.response.status_code if error.response is not None else None
            return status_code in {429, 500, 502, 503, 504}
        return (
            IndustryCompanyAnalyzer._is_timeout_error(error)
            or isinstance(error, httpx.RequestError)
            or any(marker in error_name for marker in ("remoteprotocol", "connectionreset", "connecterror"))
        )

    @staticmethod
    def _is_valid_trend_report(content: str) -> bool:
        required_sections = ["## 一、趋势判断", "## 二、关注重点", "## 三、投资建议结论"]
        return len(content.strip()) >= 400 and all(section in content for section in required_sections)

    @staticmethod
    def _extract_core_conclusion(content: str) -> str:
        trend = IndustryCompanyAnalyzer._extract_report_section(content, "## 一、趋势判断")
        advice = IndustryCompanyAnalyzer._extract_report_section(content, "## 三、投资建议结论")
        conclusion = "\n\n".join(item for item in (trend, advice) if item).strip() or content.strip()
        paragraphs = re.split(r"\n\s*\n", conclusion)
        excluded_markers = (
            "产业链结构性差异",
            "产业链企业整体表现",
            "各产业链环节",
            "各环节平均涨跌",
            "环节间涨跌幅",
        )
        filtered = [
            paragraph.strip()
            for paragraph in paragraphs
            if paragraph.strip() and not any(marker in paragraph for marker in excluded_markers)
        ]
        return "\n\n".join(filtered).strip() or conclusion

    @staticmethod
    def _extract_report_section(content: str, heading: str) -> str:
        match = re.search(re.escape(heading) + r"\s*(.*?)(?=\n##\s|\Z)", content, flags=re.S)
        return match.group(1).strip() if match else ""

    def _build_analysis_context(
        self,
        industry_name: str,
        industry_id: str,
        nodes: List[Dict[str, Any]],
        analyzed_companies: List[Dict[str, Any]],
        top_companies: List[Dict[str, Any]],
        coverage: Dict[str, Any],
    ) -> str:
        """构造AI分析上下文，聚焦有效的财报、公告和行情数据，过滤无效数据。"""
        lines = [
            f"产业名称: {industry_name}",
            f"核心企业数: {len(top_companies)}家",
            f"数据覆盖: 财报{coverage.get('financial_coverage', 0)}家，公告{coverage.get('announcement_coverage', 0)}家，行情{coverage.get('quote_coverage', 0)}家",
            "",
            "=== 核心企业数据 ===",
        ]

        for index, company in enumerate(top_companies, 1):
            financial = company.get("financial_metrics") or {}
            price_metrics = company.get("price_metrics") or {}
            announcement_signal = company.get("announcement_signal") or {}

            # 过滤：只保留有财报或公告数据的企业
            has_financial = financial.get('latest_period') and financial.get('revenue') is not None
            has_announcement = announcement_signal.get('latest_date') or company.get('announcement_count', 0) > 0
            has_price = price_metrics.get('price_change_pct') is not None

            if not (has_financial or has_announcement):
                continue

            # 产业链环节
            refs = "、".join(
                ref.get("segment_name") or ""
                for ref in company.get("node_refs", [])[:2]
                if ref.get("segment_name")
            ) or "未标注"

            lines.append(f"{index}. {company.get('name')} ({company.get('symbol') or '无代码'})")
            lines.append(f"   产业链位置: {refs}")

            # 财报数据 - 只输出有效数据
            if has_financial:
                revenue = financial.get('revenue')
                net_profit = financial.get('net_profit')
                revenue_growth = financial.get('revenue_growth')
                profit_growth = financial.get('profit_growth')
                cash_flow = financial.get('operating_cash_flow')
                growth_basis = financial.get('growth_basis', '无法确认')

                financial_parts = []
                if revenue is not None:
                    financial_parts.append(f"营收{self._format_amount(revenue)}")
                if net_profit is not None:
                    financial_parts.append(f"净利润{self._format_amount(net_profit)}")
                if revenue_growth is not None:
                    financial_parts.append(f"营收增长{revenue_growth:.1f}%")
                if profit_growth is not None:
                    financial_parts.append(f"利润增长{profit_growth:.1f}%")

                if financial_parts:
                    lines.append(f"   财报({financial.get('latest_period', '期间未知')}): {', '.join(financial_parts)}")
                    if growth_basis != '无法确认':
                        lines.append(f"   增长口径: {growth_basis}")
                    if cash_flow is not None:
                        lines.append(f"   经营现金流: {self._format_amount(cash_flow)}")

            # 公告数据 - 只输出重要公告
            if has_announcement:
                latest_announcements = company.get('latest_announcement_samples', [])[:3]
                important_count = company.get('important_announcements', 0)
                direction = announcement_signal.get('direction', '中性')

                if latest_announcements:
                    lines.append(f"   最新公告({len(latest_announcements)}条，重要{important_count}条，方向{direction}):")
                    for ann in latest_announcements:
                        date = ann.get('date', '日期未知')
                        title = ann.get('title', '标题缺失')
                        # 截断过长标题
                        if len(title) > 50:
                            title = title[:47] + "..."
                        lines.append(f"     - {date}: {title}")

            # 行情数据 - 只在有效时输出
            if has_price:
                price_change = price_metrics.get('price_change_pct')
                latest_change = price_metrics.get('latest_change_pct')
                volatility = price_metrics.get('volatility')

                price_parts = []
                if price_change is not None:
                    price_parts.append(f"区间涨跌{price_change:+.1f}%")
                if latest_change is not None:
                    price_parts.append(f"最新涨跌{latest_change:+.1f}%")
                if volatility is not None and volatility < 100:
                    price_parts.append(f"波动率{volatility:.1f}%")

                if price_parts:
                    lines.append(f"   行情: {', '.join(price_parts)}")

            lines.append("")

        # 添加数据质量说明
        lines.append("=== 数据质量说明 ===")
        lines.append(f"分析期间: {coverage.get('analysis_started_at', '未知')} 至 {coverage.get('analyzed_at', '未知')}")
        lines.append(f"财报覆盖率: {coverage.get('financial_coverage_pct', 0):.1f}%")
        lines.append(f"公告覆盖率: {coverage.get('announcement_coverage_pct', 0):.1f}%")

        return "\n".join(lines)

    @staticmethod
    def _format_amount(value: Any) -> str:
        """格式化金额为易读格式（亿元）"""
        if value is None:
            return "暂无"
        try:
            amount = float(value)
            if abs(amount) >= 1_000_000_000:
                return f"{amount / 1_000_000_000:.1f}亿"
            elif abs(amount) >= 100_000_000:
                return f"{amount / 100_000_000:.1f}亿"
            else:
                return f"{amount / 10000:.0f}万"
        except (TypeError, ValueError):
            return "暂无"

    @staticmethod
    def _financial_evidence_text(financial: Dict[str, Any]) -> str:
        values = [
            f"最新期={financial.get('latest_period') or '暂无'}",
            f"对比期={financial.get('comparison_period') or '暂无'}",
            f"营收={financial.get('revenue') if financial.get('revenue') is not None else '暂无'}",
            f"净利润={financial.get('net_profit') if financial.get('net_profit') is not None else '暂无'}",
            f"经营现金流={financial.get('operating_cash_flow') if financial.get('operating_cash_flow') is not None else '暂无'}",
            f"增长口径={financial.get('growth_basis') or '无法确认'}",
        ]
        return '；'.join(values)

    @staticmethod
    def _build_segment_signals(analyzed_companies: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """按图谱环节聚合行情、财报和公告信号，供 AI 报告引用。"""
        buckets: Dict[str, Dict[str, Any]] = {}
        for company in analyzed_companies:
            refs = company.get("node_refs") or []
            segment_names = list(dict.fromkeys(
                ref.get("segment_name") for ref in refs if ref.get("segment_name")
            )) or ["未标注环节"]
            for segment in segment_names:
                bucket = buckets.setdefault(segment, {
                    "companies": 0,
                    "quote_companies": 0,
                    "changes": [],
                    "latest_changes": [],
                    "financial_companies": 0,
                    "announcements": 0,
                })
                bucket["companies"] += 1
                metrics = company.get("price_metrics") or {}
                if metrics.get("price_change_pct") is not None:
                    bucket["quote_companies"] += 1
                    bucket["changes"].append(metrics["price_change_pct"])
                if metrics.get("latest_change_pct") is not None:
                    bucket["latest_changes"].append(metrics["latest_change_pct"])
                if (company.get("financial_metrics") or {}).get("records", 0):
                    bucket["financial_companies"] += 1
                bucket["announcements"] += company.get("announcement_count", 0)

        signals = []
        for segment, bucket in buckets.items():
            changes = bucket["changes"]
            latest_changes = bucket["latest_changes"]
            signals.append({
                "segment": segment,
                "companies": bucket["companies"],
                "quote_companies": bucket["quote_companies"],
                "average_change": round(sum(changes) / len(changes), 2) if changes else None,
                "latest_average_change": round(sum(latest_changes) / len(latest_changes), 2) if latest_changes else None,
                "latest_positive_ratio": round(sum(1 for value in latest_changes if value > 0) / len(latest_changes) * 100, 1) if latest_changes else None,
                "financial_companies": bucket["financial_companies"],
                "announcements": bucket["announcements"],
                "quote_coverage_pct": round(bucket["quote_companies"] / bucket["companies"] * 100, 1) if bucket["companies"] else 0,
                "coverage_grade": "不可判断" if not changes else "高" if bucket["quote_companies"] / bucket["companies"] >= 0.75 and bucket["quote_companies"] >= 5 else "中" if bucket["quote_companies"] / bucket["companies"] >= 0.5 else "低",
            })
        return sorted(signals, key=lambda item: item["companies"], reverse=True)

    @staticmethod
    def _attach_relative_segment_metrics(analyzed_companies: List[Dict[str, Any]], signals: List[Dict[str, Any]]) -> None:
        averages = {item["segment"]: item.get("average_change") for item in signals}
        latest_averages = {item["segment"]: item.get("latest_average_change") for item in signals}
        for company in analyzed_companies:
            segment_values = [averages.get(ref.get("segment_name")) for ref in company.get("node_refs", []) if averages.get(ref.get("segment_name")) is not None]
            segment_average = sum(segment_values) / len(segment_values) if segment_values else None
            company["relative_price_change_pct"] = round(company["price_metrics"].get("price_change_pct") - segment_average, 2) if segment_average is not None and company["price_metrics"].get("price_change_pct") is not None else None
            latest_segment_values = [latest_averages.get(ref.get("segment_name")) for ref in company.get("node_refs", []) if latest_averages.get(ref.get("segment_name")) is not None]
            latest_segment_average = sum(latest_segment_values) / len(latest_segment_values) if latest_segment_values else None
            latest_change = company["price_metrics"].get("latest_change_pct")
            company["relative_latest_change_pct"] = round(latest_change - latest_segment_average, 2) if latest_change is not None and latest_segment_average is not None else None
            company["segment_average_change_pct"] = round(segment_average, 2) if segment_average is not None else None
