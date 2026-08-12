"""
Industry Company Analyzer - 产业企业分析服务
对知识图谱节点关联的企业进行综合分析，生成领域企业发展趋势报告
"""
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import logging
from providers.stock_provider import StockProvider
from services.neo4j_service import Neo4jService
from anthropic import Anthropic
import os

logger = logging.getLogger(__name__)


class IndustryCompanyAnalyzer:
    """产业企业分析器"""

    def __init__(self):
        self.stock_provider = StockProvider()
        self.neo4j_service = Neo4jService()

        # 初始化Anthropic客户端，使用环境变量配置
        api_key = os.getenv("ANTHROPIC_API_KEY")
        base_url = os.getenv("ANTHROPIC_BASE_URL")

        if base_url:
            self.anthropic = Anthropic(api_key=api_key, base_url=base_url)
        else:
            self.anthropic = Anthropic(api_key=api_key)

    async def analyze_industry_companies(
        self,
        industry_id: str,
        analysis_period_days: int = 90
    ) -> Dict[str, Any]:
        """
        分析产业领域的企业发展趋势

        Args:
            industry_id: 产业ID
            analysis_period_days: 分析周期（天）

        Returns:
            企业发展趋势分析报告
        """
        try:
            # 1. 获取产业节点
            nodes = await self._get_industry_nodes(industry_id)
            if not nodes:
                return {
                    "success": False,
                    "error": "未找到产业节点"
                }

            # 2. 获取所有节点关联的企业
            all_companies = []
            for node in nodes:
                companies = await self._get_node_companies(node['id'])
                all_companies.extend(companies)

            # 去重
            unique_companies = self._deduplicate_companies(all_companies)
            logger.info(f"Found {len(unique_companies)} unique companies for industry {industry_id}")

            # 3. 批量获取企业数据
            company_data = await self._fetch_company_data(
                unique_companies,
                analysis_period_days
            )

            # 4. 计算关键指标
            analyzed_companies = await self._analyze_companies(company_data)

            # 5. 识别头部企业
            top_companies = self._identify_top_companies(analyzed_companies)

            # 6. AI生成发展趋势报告
            trend_report = await self._generate_trend_report(
                industry_id,
                nodes,
                analyzed_companies,
                top_companies
            )

            return {
                "success": True,
                "industry_id": industry_id,
                "analysis_period_days": analysis_period_days,
                "total_companies": len(analyzed_companies),
                "top_companies": top_companies,
                "trend_report": trend_report,
                "analyzed_at": datetime.now().isoformat()
            }

        except Exception as e:
            logger.error(f"Error analyzing industry companies: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    async def _get_industry_nodes(self, industry_id: str) -> List[Dict[str, Any]]:
        """获取产业的所有节点"""
        query = """
        MATCH (n:IndustryNode)
        WHERE n.industry_id = $industry_id
        RETURN n.id as id, n.name as name, n.layer as layer, n.type as type
        ORDER BY n.layer
        """
        result = self.neo4j_service.run_query(query, {"industry_id": industry_id})
        return [dict(record) for record in result]

    async def _get_node_companies(self, node_id: str) -> List[Dict[str, Any]]:
        """获取节点关联的企业"""
        query = """
        MATCH (n:IndustryNode {id: $node_id})-[:HAS_COMPANY]->(c:Company)
        RETURN c.symbol as symbol, c.name as name, c.market as market
        """
        result = self.neo4j_service.run_query(query, {"node_id": node_id})
        return [dict(record) for record in result]

    def _deduplicate_companies(
        self,
        companies: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """去重企业列表"""
        seen = set()
        unique = []
        for company in companies:
            key = f"{company['symbol']}_{company.get('market', 'cn')}"
            if key not in seen:
                seen.add(key)
                unique.append(company)
        return unique

    async def _fetch_company_data(
        self,
        companies: List[Dict[str, Any]],
        period_days: int
    ) -> List[Dict[str, Any]]:
        """批量获取企业数据"""
        company_data = []

        start_date = (datetime.now() - timedelta(days=period_days)).strftime("%Y-%m-%d")
        end_date = datetime.now().strftime("%Y-%m-%d")

        for company in companies:
            symbol = company['symbol']
            market = company.get('market', 'cn')

            try:
                # 获取基本信息
                info = await self.stock_provider.get_stock_info(symbol, market)

                # 获取K线数据
                kline = await self.stock_provider.get_kline(
                    symbol, 'daily', start_date, end_date, market
                )

                # 获取财报数据
                financial = await self.stock_provider.get_financial_report(
                    symbol, 'income', market
                )

                # 获取公告
                announcements = await self.stock_provider.get_announcements(
                    symbol, start_date, end_date, market
                )

                company_data.append({
                    "symbol": symbol,
                    "name": company['name'],
                    "market": market,
                    "info": info,
                    "kline": kline,
                    "financial": financial,
                    "announcements": announcements
                })

            except Exception as e:
                logger.warning(f"Error fetching data for {symbol}: {e}")
                continue

        return company_data

    async def _analyze_companies(
        self,
        company_data: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """分析企业数据，计算关键指标"""
        analyzed = []

        for company in company_data:
            try:
                kline = company.get('kline', [])
                financial = company.get('financial', [])

                if not kline:
                    continue

                # 计算价格指标
                prices = [k['收盘'] for k in kline if '收盘' in k]
                if not prices:
                    continue

                price_change = ((prices[-1] - prices[0]) / prices[0]) * 100 if len(prices) > 1 else 0
                volatility = self._calculate_volatility(prices)
                max_drawdown = self._calculate_max_drawdown(prices)

                # 财报指标
                financial_metrics = {}
                if financial and len(financial) > 0:
                    latest_report = financial[0]
                    financial_metrics = {
                        "revenue": latest_report.get("营业收入", 0),
                        "net_profit": latest_report.get("净利润", 0),
                        "revenue_growth": self._calculate_growth_rate(financial, "营业收入"),
                        "profit_growth": self._calculate_growth_rate(financial, "净利润")
                    }

                # 公告统计
                announcements = company.get('announcements', [])
                announcement_count = len(announcements)
                important_announcements = [
                    a for a in announcements
                    if any(keyword in a.get('公告标题', '') for keyword in ['重大', '业绩', '增持', '回购'])
                ]

                analyzed.append({
                    "symbol": company['symbol'],
                    "name": company['name'],
                    "market": company['market'],
                    "price_metrics": {
                        "current_price": prices[-1],
                        "price_change_pct": round(price_change, 2),
                        "volatility": round(volatility, 2),
                        "max_drawdown": round(max_drawdown, 2)
                    },
                    "financial_metrics": financial_metrics,
                    "announcement_count": announcement_count,
                    "important_announcements": len(important_announcements),
                    "raw_data": company  # 保留原始数据供后续使用
                })

            except Exception as e:
                logger.warning(f"Error analyzing company {company.get('symbol')}: {e}")
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
        return (variance ** 0.5) * (252 ** 0.5) * 100  # 年化波动率

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

    def _calculate_growth_rate(
        self,
        financial_data: List[Dict],
        field: str
    ) -> Optional[float]:
        """计算财报指标增长率"""
        if len(financial_data) < 2:
            return None

        try:
            latest = financial_data[0].get(field, 0)
            previous = financial_data[1].get(field, 0)

            if previous == 0:
                return None

            growth = ((latest - previous) / previous) * 100
            return round(growth, 2)

        except Exception:
            return None

    def _identify_top_companies(
        self,
        analyzed_companies: List[Dict[str, Any]],
        top_n: int = 10
    ) -> List[Dict[str, Any]]:
        """识别头部企业"""
        # 综合评分
        for company in analyzed_companies:
            score = 0

            # 价格表现 (30%)
            price_change = company['price_metrics'].get('price_change_pct', 0)
            if price_change > 20:
                score += 30
            elif price_change > 10:
                score += 20
            elif price_change > 0:
                score += 10

            # 财报表现 (40%)
            financial = company.get('financial_metrics', {})
            revenue_growth = financial.get('revenue_growth')
            profit_growth = financial.get('profit_growth')

            if revenue_growth and revenue_growth > 20:
                score += 20
            elif revenue_growth and revenue_growth > 10:
                score += 10

            if profit_growth and profit_growth > 20:
                score += 20
            elif profit_growth and profit_growth > 10:
                score += 10

            # 稳定性 (20%)
            volatility = company['price_metrics'].get('volatility', 100)
            max_dd = company['price_metrics'].get('max_drawdown', 100)

            if volatility < 30 and max_dd < 20:
                score += 20
            elif volatility < 50 and max_dd < 30:
                score += 10

            # 公告活跃度 (10%)
            if company['important_announcements'] > 3:
                score += 10
            elif company['important_announcements'] > 0:
                score += 5

            company['composite_score'] = score

        # 排序并返回Top N
        sorted_companies = sorted(
            analyzed_companies,
            key=lambda x: x['composite_score'],
            reverse=True
        )

        return sorted_companies[:top_n]

    async def _generate_trend_report(
        self,
        industry_id: str,
        nodes: List[Dict[str, Any]],
        analyzed_companies: List[Dict[str, Any]],
        top_companies: List[Dict[str, Any]]
    ) -> str:
        """使用AI生成发展趋势报告"""
        try:
            # 构建分析上下文
            context = self._build_analysis_context(
                industry_id,
                nodes,
                analyzed_companies,
                top_companies
            )

            # 调用Claude API
            message = self.anthropic.messages.create(
                model=os.getenv("CLAUDE_MODEL", "claude-3-5-sonnet-20241022"),
                max_tokens=2000,
                messages=[
                    {
                        "role": "user",
                        "content": f"""作为资深投资分析师，请基于以下数据分析该产业领域的企业发展趋势：

{context}

请从以下维度进行分析：
1. 整体行业景气度
2. 头部企业发展态势
3. 财务健康度评估
4. 关键风险因素
5. 未来发展展望

要求：
- 数据驱动，客观分析
- 突出关键发现
- 控制在500字以内
"""
                    }
                ]
            )

            report = message.content[0].text
            return report

        except Exception as e:
            logger.error(f"Error generating trend report: {e}")
            return f"报告生成失败: {str(e)}"

    def _build_analysis_context(
        self,
        industry_id: str,
        nodes: List[Dict[str, Any]],
        analyzed_companies: List[Dict[str, Any]],
        top_companies: List[Dict[str, Any]]
    ) -> str:
        """构建分析上下文"""
        context = f"产业ID: {industry_id}\n"
        context += f"节点数量: {len(nodes)}\n"
        context += f"企业数量: {len(analyzed_companies)}\n\n"

        # 头部企业信息
        context += "=== 头部企业 (Top 10) ===\n"
        for i, company in enumerate(top_companies[:10], 1):
            pm = company['price_metrics']
            fm = company.get('financial_metrics', {})
            context += f"{i}. {company['name']} ({company['symbol']})\n"
            context += f"   - 价格涨跌: {pm.get('price_change_pct', 0)}%\n"
            context += f"   - 波动率: {pm.get('volatility', 0)}%\n"
            if fm.get('revenue_growth') is not None:
                context += f"   - 营收增长: {fm['revenue_growth']}%\n"
            if fm.get('profit_growth') is not None:
                context += f"   - 利润增长: {fm['profit_growth']}%\n"
            context += f"   - 综合评分: {company['composite_score']}\n\n"

        # 行业统计
        context += "=== 行业统计 ===\n"
        avg_price_change = sum(
            c['price_metrics'].get('price_change_pct', 0)
            for c in analyzed_companies
        ) / len(analyzed_companies) if analyzed_companies else 0

        positive_count = sum(
            1 for c in analyzed_companies
            if c['price_metrics'].get('price_change_pct', 0) > 0
        )

        context += f"平均涨跌幅: {avg_price_change:.2f}%\n"
        context += f"上涨企业占比: {(positive_count/len(analyzed_companies)*100):.1f}%\n"

        return context
