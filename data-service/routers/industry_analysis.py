"""
Industry Analysis Router - 产业分析API路由
提供企业分析和市场分析接口
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from services.industry_company_analyzer import IndustryCompanyAnalyzer
from services.industry_market_analyzer import IndustryMarketAnalyzer

router = APIRouter(prefix="/industry-analysis", tags=["industry-analysis"])

company_analyzer = IndustryCompanyAnalyzer()
market_analyzer = IndustryMarketAnalyzer()


@router.get("/{industry_id}/companies")
async def analyze_industry_companies(
    industry_id: str,
    period_days: int = Query(default=90, description="分析周期（天）", ge=30, le=365)
):
    """
    分析产业领域的企业发展趋势

    - **industry_id**: 产业ID
    - **period_days**: 分析周期（天），默认90天
    """
    try:
        result = await company_analyzer.analyze_industry_companies(
            industry_id=industry_id,
            analysis_period_days=period_days
        )

        if not result.get("success"):
            raise HTTPException(status_code=404, detail=result.get("error", "Analysis failed"))

        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
            raise HTTPException(status_code=404, detail=result.get("error", "Analysis failed"))

        return result

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
        from services.data_service import data_service

        # 使用产业名称作为关键词获取新闻
        df = await data_service.get_news(keyword=industry_name, limit=limit * 3)

        filtered_events = []

        if not df.empty:
            # 简单的关键词过滤
            keywords = industry_name.split()

            for _, row in df.iterrows():
                title = str(row.get("title", ""))
                content = str(row.get("content", ""))
                title_lower = title.lower()
                content_lower = content.lower()

                # 检查是否包含产业关键词
                if any(kw.lower() in title_lower or kw.lower() in content_lower for kw in keywords):
                    filtered_events.append({
                        "title": title,
                        "summary": content[:200] if len(content) > 200 else content,
                        "published_at": str(row.get("publish_time", "")),
                        "source": str(row.get("source", "财联社")),
                        "url": str(row.get("url", ""))
                    })

                    if len(filtered_events) >= limit:
                        break

        return {
            "success": True,
            "industry_id": industry_id,
            "industry_name": industry_name,
            "total": len(filtered_events),
            "news": filtered_events
        }

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
        import asyncio

        # 并行执行企业分析、市场分析和新闻获取
        company_result, market_result, news_result = await asyncio.gather(
            company_analyzer.analyze_industry_companies(industry_id, period_days),
            market_analyzer.analyze_industry_market(industry_id, industry_name, period_days),
            get_industry_news(industry_id, industry_name, limit=5)
        )

        if not company_result.get("success") and not market_result.get("success"):
            raise HTTPException(
                status_code=404,
                detail="Both company and market analysis failed"
            )

        # 生成综合分析报告
        comprehensive_report = _generate_comprehensive_report(
            industry_name,
            company_result,
            market_result,
            news_result
        )

        return {
            "success": True,
            "industry_id": industry_id,
            "industry_name": industry_name,
            "company_analysis": company_result if company_result.get("success") else None,
            "market_analysis": market_result if market_result.get("success") else None,
            "news": news_result.get("news", []) if news_result.get("success") else [],
            "comprehensive_report": comprehensive_report
        }

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
    sections.append("基于以上企业发展、市场趋势和行业资讯的分析，建议投资者关注该产业的发展动态，")
    sections.append("结合自身风险偏好做出投资决策。本分析仅供参考，不构成投资建议。")

    return "\n".join(sections)
