"""
Industry Analysis Router - 产业分析API路由
提供企业分析和市场分析接口
"""
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse
from typing import Any, Dict, List, Optional, Set
import asyncio
import json
import os
import re
from anthropic import Anthropic
from services.industry_company_analyzer import IndustryCompanyAnalyzer
from services.industry_market_analyzer import IndustryMarketAnalyzer
from services.neo4j_service import get_neo4j_service
from db import db

router = APIRouter(prefix="/industry-analysis", tags=["industry-analysis"])

company_analyzer = IndustryCompanyAnalyzer()
market_analyzer = IndustryMarketAnalyzer()


def _comprehensive_stage_error(stage: str, message: str, details: Dict[str, Any]) -> HTTPException:
    return HTTPException(
        status_code=502,
        detail={
            "stage": stage,
            "error_code": "COMPREHENSIVE_INPUT_INVALID",
            "message": message,
            "details": details,
        },
    )


async def _generate_ai_comprehensive_report(
    industry_name: str,
    company_result: Dict[str, Any],
    market_result: Dict[str, Any],
    news_result: Dict[str, Any],
) -> str:
    prompt = f"""你是严谨的产业研究员。请仅基于下面三个已完成分析阶段的结构化输出，生成《{industry_name} 产业综合分析报告》。不得补造输入中没有的事实；事实、推断和限制必须分开；缺失数据明确写“暂无”。

企业分析：
{json.dumps(company_result, ensure_ascii=False, default=str)}

市场分析：
{json.dumps(market_result, ensure_ascii=False, default=str)}

资讯分析：
{json.dumps(news_result, ensure_ascii=False, default=str)}

必须使用 Markdown，并包含：
# {industry_name} 产业综合分析
## 一、核心结论
## 二、企业发展与产业链表现
## 三、市场趋势与量化信号
## 四、资讯影响与验证条件
## 五、机会、风险与后续跟踪

核心结论必须给出“积极观察 / 谨慎观察 / 暂不判断”之一，并引用输入中的具体证据。不要输出确定性买卖指令。"""

    provider = getattr(company_analyzer, "ai_provider", "anthropic")
    if provider in {"chatgpt", "openai"}:
        client = getattr(company_analyzer, "chatgpt", None)
        if not client:
            raise _comprehensive_stage_error("ai_report", "综合分析 AI 客户端未配置", {"provider": provider})
        report = await asyncio.to_thread(client.complete, prompt, "你是严谨的产业研究员。", 3000)
    else:
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise _comprehensive_stage_error("ai_report", "综合分析 AI 客户端未配置", {"provider": provider})
        client = getattr(company_analyzer, "anthropic", None)
        if not client:
            client_kwargs: Dict[str, Any] = {"api_key": api_key, "max_retries": 0}
            if os.getenv("ANTHROPIC_BASE_URL"):
                client_kwargs["base_url"] = os.getenv("ANTHROPIC_BASE_URL")
            client = Anthropic(**client_kwargs)
        message = await asyncio.to_thread(
            client.messages.create,
            model=os.getenv("CLAUDE_MODEL", "claude-3-5-sonnet-20241022"),
            max_tokens=3000,
            messages=[{"role": "user", "content": prompt}],
            system="你是严谨的产业研究员。",
        )
        report = message.content[0].text if message.content else ""

    if not isinstance(report, str) or len(report.strip()) < 200:
        raise _comprehensive_stage_error("ai_report", "综合分析 AI 返回为空或过短", {"length": len(report or "")})
    return report.strip()


def _parse_json_list(value: Any) -> List[str]:
    """将数据库中的 JSON 数组字段安全转换为字符串列表。"""
    if isinstance(value, list):
        return [str(item) for item in value if item]
    if not value:
        return []

    try:
        parsed = json.loads(value) if isinstance(value, str) else value
        return [str(item) for item in parsed] if isinstance(parsed, list) else []
    except (TypeError, ValueError, json.JSONDecodeError):
        return []


def _normalize_news_row(row: Dict[str, Any]) -> Dict[str, Any]:
    """统一数据库新闻与旧实时数据源的返回字段。"""
    content = str(row.get("content") or "")
    summary = str(row.get("summary") or content[:200])
    publish_time = str(row.get("publishTime") or row.get("publish_time") or "")

    return {
        "id": str(row.get("id") or ""),
        "title": str(row.get("title") or ""),
        "summary": summary,
        "content": content,
        "published_at": publish_time,
        "publishTime": publish_time,
        "source": str(row.get("source") or "财联社"),
        "url": str(row.get("url") or ""),
        "sentiment": row.get("sentiment"),
        "sentimentLabel": row.get("sentimentLabel"),
        "impact": row.get("impact"),
        "segmentCodes": _parse_json_list(row.get("segmentCodes")),
    }


async def _get_industry_graph_context(industry_id: str) -> Dict[str, Any]:
    """读取产业图谱中的产业代码、环节代码和环节名称。"""
    graph = await get_neo4j_service().get_industry_full_graph(industry_id)
    if not graph:
        return {"industry_code": "", "segment_codes": set(), "keywords": []}

    segment_codes: Set[str] = set()
    keywords: List[str] = []
    for stage in graph.get("stages", []):
        for segment in stage.get("segments", []):
            code = segment.get("code")
            name = segment.get("name")
            if code:
                segment_codes.add(str(code))
            if name:
                keywords.append(str(name))

    industry = graph.get("industry") or {}
    if industry.get("name"):
        keywords.append(str(industry["name"]))

    return {
        "industry_code": str(industry.get("code") or ""),
        "segment_codes": segment_codes,
        "keywords": keywords,
    }


def _split_keywords(value: str) -> List[str]:
    """兼容中文产业名称，不再只依赖 str.split()。"""
    return [part.strip() for part in re.split(r"[\s,，、/|]+", value) if part.strip()]


async def _get_tagged_industry_news(
    industry_id: str,
    industry_name: str,
    limit: int,
) -> List[Dict[str, Any]]:
    """优先读取与领域趋势页相同的 NewsArticle.segmentCodes 新闻。"""
    try:
        graph_context = await _get_industry_graph_context(industry_id)
        segment_codes = graph_context["segment_codes"]
        if not segment_codes:
            return []

        rows = db.execute(
            """
            SELECT id, title, content, summary, source, url, publishTime,
                   sentiment, sentimentLabel, impact, segmentCodes
            FROM NewsArticle
            WHERE segmentCodes IS NOT NULL
              AND segmentCodes != '[]'
            ORDER BY publishTime DESC
            LIMIT ?
            """,
            (max(limit * 5, 50),),
        )

        matched: List[Dict[str, Any]] = []
        for row in rows:
            row_segment_codes = set(_parse_json_list(row.get("segmentCodes")))
            if row_segment_codes.intersection(segment_codes):
                matched.append(_normalize_news_row(row))
                if len(matched) >= limit:
                    break

        return matched
    except Exception as error:
        import logging
        logging.getLogger(__name__).warning(
            "读取产业标注新闻失败: industry_id=%s, error=%s",
            industry_id,
            error,
        )
        return []


@router.get("/{industry_id}/companies")
async def analyze_industry_companies(
    industry_id: str,
    period_days: int = Query(default=90, description="分析周期（天）", ge=30, le=365),
    source: str = Query(default="graph", description="企业候选来源：graph / etf_holdings"),
    etf_codes: str = Query(default="", description="ETF持仓来源使用的ETF代码，逗号分隔"),
):
    """
    分析产业领域的企业发展趋势

    - **industry_id**: 产业ID
    - **period_days**: 分析周期（天），默认90天
    """
    try:
        etf_holdings = {}
        if source in {"etf", "etf_holdings", "ETF持仓"}:
            codes = list(dict.fromkeys(item.strip() for item in etf_codes.split(",") if item.strip()))
            if not codes:
                return JSONResponse(status_code=400, content={"success": False, "error": "ETF持仓来源需要提供etf_codes"})
            holdings_response = await get_etf_holdings_for_analysis(codes)
            etf_holdings = holdings_response

        result = await company_analyzer.analyze_industry_companies(
            industry_id=industry_id,
            analysis_period_days=period_days,
            source=source,
            etf_holdings=etf_holdings,
        )

        if not result.get("success"):
            # 保留分析器返回的阶段、错误码和诊断详情，避免前端只能看到空的 detail。
            status_code = 404 if result.get("stage") == "graph" else 502
            return JSONResponse(status_code=status_code, content=result)

        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def get_etf_holdings_for_analysis(codes: List[str]) -> Dict[str, List[Dict[str, Any]]]:
    """通过 ETF provider 统一读取持仓，避免企业分析器直接依赖数据源实现。"""
    from routers.etf import etf_provider
    results: Dict[str, List[Dict[str, Any]]] = {}
    for code in codes[:50]:
        results[code] = await etf_provider.get_holdings(code)
    return results


@router.get("/{industry_id}/market")
async def analyze_industry_market(
    industry_id: str,
    industry_name: str = Query(..., description="产业名称"),
    period_days: int = Query(default=90, description="分析周期（天）", ge=30, le=365)
):
    """
    分析产业领域的大盘趋势

    - **industry_id**: 产业ID
    - **industry_name**: 产业名称（用于匹配ETF/指数）
    - **period_days**: 分析周期（天），默认90天
    """
    try:
        result = await market_analyzer.analyze_industry_market(
            industry_id=industry_id,
            industry_name=industry_name,
            analysis_period_days=period_days
        )

        if not result.get("success"):
            error_code = result.get("error_code")
            status_code = 504 if error_code in {"MARKET_ANALYSIS_TIMEOUT", "MARKET_SOURCE_TIMEOUT"} else 502
            raise HTTPException(status_code=status_code, detail=result)

        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{industry_id}/news")
async def get_industry_news(
    industry_id: str,
    industry_name: str = Query(..., description="产业名称"),
    limit: int = Query(default=10, description="返回新闻数量", ge=1, le=50)
):
    """
    获取产业相关新闻资讯

    - **industry_id**: 产业ID
    - **industry_name**: 产业名称（用于关键词过滤）
    - **limit**: 返回新闻数量，默认10条
    """
    try:
        # 与领域趋势详情页统一：优先使用已经完成产业链标注的 NewsArticle。
        tagged_news = await _get_tagged_industry_news(
            industry_id=industry_id,
            industry_name=industry_name,
            limit=limit,
        )
        if tagged_news:
            invalid_rows = [
                row for row in tagged_news
                if not row.get("title") or not row.get("content") or not row.get("published_at") or not row.get("source")
            ]
            if invalid_rows:
                raise HTTPException(
                    status_code=502,
                    detail={
                        "stage": "news",
                        "error_code": "NEWS_DATA_INVALID",
                        "message": "资讯分析失败：产业图谱新闻存在标题、正文、发布时间或来源缺失",
                        "invalid_count": len(invalid_rows),
                    },
                )
            return {
                "success": True,
                "industry_id": industry_id,
                "industry_name": industry_name,
                "total": len(tagged_news),
                "news": tagged_news,
                "source": "knowledge_graph_news",
            }

        raise HTTPException(
            status_code=404,
            detail={
                "stage": "news",
                "error_code": "NEWS_GRAPH_DATA_UNAVAILABLE",
                "message": "资讯分析失败：产业图谱未返回已标注新闻，拒绝使用关键词规则兜底",
                "industry_id": industry_id,
                "industry_name": industry_name,
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{industry_id}/comprehensive")
async def comprehensive_industry_analysis(
    industry_id: str,
    industry_name: str = Query(..., description="产业名称"),
    period_days: int = Query(default=90, description="分析周期（天）", ge=30, le=365)
):
    """
    综合产业分析（企业 + 大盘 + 新闻 + AI分析）

    - **industry_id**: 产业ID
    - **industry_name**: 产业名称
    - **period_days**: 分析周期（天），默认90天
    """
    try:
        # 资讯可以并行获取，但企业分析必须等待市场代表ETF选定后再读取持仓。
        market_result, news_result = await asyncio.gather(
            market_analyzer.analyze_industry_market(industry_id, industry_name, period_days),
            get_industry_news(industry_id, industry_name, limit=5),
        )

        if not market_result.get("success"):
            raise _comprehensive_stage_error("market", "市场分析未成功完成", market_result)
        if not news_result.get("success"):
            raise _comprehensive_stage_error("news", "资讯分析未成功完成", news_result)

        selected_codes = list(dict.fromkeys(
            str(item.get("code") or item.get("symbol"))
            for item in market_result.get("etf_selection", [])
            if item.get("selected") and (item.get("code") or item.get("symbol"))
        ))
        if not selected_codes:
            raise _comprehensive_stage_error(
                "market",
                "市场分析未返回可用于企业分析的代表ETF",
                {"etf_selection": market_result.get("etf_selection", [])},
            )
        etf_holdings = await get_etf_holdings_for_analysis(selected_codes)
        company_result = await company_analyzer.analyze_industry_companies(
            industry_id,
            period_days,
            source="etf_holdings",
            etf_holdings=etf_holdings,
        )
        if not company_result.get("success"):
            raise _comprehensive_stage_error("company", "企业分析未成功完成", company_result)
        company_result["market_etf_codes"] = selected_codes
        company_result["market_etf_holdings_coverage"] = {
            "requested": selected_codes,
            "with_holdings": [code for code, rows in etf_holdings.items() if rows],
            "empty": [code for code, rows in etf_holdings.items() if not rows],
        }

        invalid_sources = {
            "company": company_result.get("report_source"),
            "market": market_result.get("report_source"),
            "news": news_result.get("source"),
        }
        expected_sources = {
            "company": "ai",
            "market": "ai",
            "news": "knowledge_graph_news",
        }
        invalid_stages = {
            stage: {"actual": invalid_sources[stage], "expected": expected_sources[stage]}
            for stage in expected_sources
            if invalid_sources[stage] != expected_sources[stage]
        }
        if invalid_stages:
            raise _comprehensive_stage_error(
                "input_validation",
                "综合分析拒绝使用规则或关键词回退结果",
                {"invalid_sources": invalid_stages},
            )

        if not str(company_result.get("trend_report") or "").strip():
            raise _comprehensive_stage_error("company", "企业分析输出为空", {"keys": list(company_result)})
        if not str(market_result.get("trend_report") or "").strip():
            raise _comprehensive_stage_error("market", "市场分析输出为空", {"keys": list(market_result)})
        if not isinstance(news_result.get("news"), list) or not news_result.get("news"):
            raise _comprehensive_stage_error("news", "资讯分析输出格式异常", {"type": type(news_result.get("news")).__name__})

        comprehensive_report = await _generate_ai_comprehensive_report(
            industry_name, company_result, market_result, news_result
        )

        return {
            "success": True,
            "industry_id": industry_id,
            "industry_name": industry_name,
            "company_analysis": company_result if company_result.get("success") else None,
            "market_analysis": market_result if market_result.get("success") else None,
            "news": news_result.get("news", []) if news_result.get("success") else [],
            "comprehensive_report": comprehensive_report,
            "report_source": "ai",
            "input_sources": {
                "company": company_result.get("report_source"),
                "market": market_result.get("report_source"),
                "news": news_result.get("source"),
            },
            "market_to_company": {
                "selected_etf_codes": selected_codes,
                "holdings_coverage": company_result.get("market_etf_holdings_coverage"),
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _generate_comprehensive_report(
    industry_name: str,
    company_result: dict,
    market_result: dict,
    news_result: dict
) -> str:
    """生成综合分析报告"""

    sections = []

    sections.append(f"# {industry_name} 产业综合分析\n")

    # 企业发展趋势
    if company_result.get("success"):
        sections.append("## 一、企业发展趋势")
        sections.append(company_result.get("trend_report", "暂无企业分析数据"))
        sections.append("")

    # 市场趋势
    if market_result.get("success"):
        sections.append("## 二、市场趋势分析")
        sections.append(market_result.get("trend_report", "暂无市场分析数据"))
        sections.append("")

    # 最新资讯
    if news_result.get("success") and news_result.get("news"):
        sections.append("## 三、最新行业资讯")
        for idx, news in enumerate(news_result.get("news", [])[:3], 1):
            sections.append(f"{idx}. {news['title']}")
            sections.append(f"   {news['summary'][:100]}...")
        sections.append("")

    # 综合评估
    sections.append("## 四、综合评估")
    company_data = company_result.get("data", company_result)
    top_companies = company_data.get("top_companies", []) if isinstance(company_data, dict) else []
    market_data = market_result.get("data", market_result)
    etfs = market_data.get("etf_analysis", []) if isinstance(market_data, dict) else []
    actionable = []
    for company in top_companies[:5]:
        signal = company.get("investment_signal") or {}
        name = company.get("name") or company.get("symbol") or "重点企业"
        stance = signal.get("stance") or "谨慎观察"
        reasons = "；".join(signal.get("reasons") or []) or "证据不足"
        trigger = signal.get("trigger") or "等待新数据验证"
        actionable.append(f"- {name}：{stance}。依据：{reasons}。下一步：{trigger}。")
    if actionable:
        sections.append("结论必须同时满足产业链代表性、企业基本面和市场信号；当前重点企业观察如下：")
        sections.extend(actionable)
    elif etfs:
        sections.append("市场标的已返回，但企业级可核对证据不足，暂不形成企业方向判断；先补齐财报和公告数据。")
    else:
        sections.append("企业与市场数据均不足，暂不形成方向判断。")
    sections.append("以上为基于当前数据的观察与验证条件，不构成买卖指令；新增风险前应确认数据覆盖和异常样本均已复核。")

    return "\n".join(sections)
