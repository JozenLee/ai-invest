import { ExecutionOrchestrator } from '../execution-orchestrator'
import { freezeResearchStep } from '../steps/freeze-research-step'
import { fetchPortfolioStep } from '../steps/fetch-portfolio-step'
import { portfolioAnalysisStep } from '../steps/portfolio-analysis-step'
import { socialReportStep } from '../steps/social-report-step'
import { assessDataQualityStep } from '../steps/assess-data-quality-step'
import { fetchETFsStep } from '../steps/fetch-etfs-step'
import { fetchETFDataStep } from '../steps/fetch-etf-data-step'
import { fetchETFHoldingsStep } from '../steps/fetch-etf-holdings-step'
import { fetchCompaniesStep } from '../steps/fetch-companies-step'
import { fetchCompanyDataStep } from '../steps/fetch-company-data-step'
import { fetchNewsStep } from '../steps/fetch-news-step'
import { calculateMarketTrendsStep } from '../steps/calculate-market-trends-step'
import { fetchMarketSnapshotStep } from '../steps/fetch-market-snapshot-step'
import { marketAnalysisStep } from '../steps/market-analysis-step'
import { newsAnalysisStep } from '../steps/news-analysis-step'
import { companyAnalysisStep } from '../steps/company-analysis-step'
import { industryOverviewStep } from '../steps/industry-overview-step'
import { investmentAdviceStep } from '../steps/investment-advice-step'
import { etfActionStep } from '../steps/etf-action-step'
import { generateReportStep } from '../steps/generate-report-step'

/**
 * 综合分析工作流
 *
 * 新轮次先冻结研究快照，再执行数据投影与AI解释；动作由规则引擎决定。
 * 共20步（含冻结、私有持仓旁支和可降级的一页版），以数组定义为准。
 * 以下为旧版主干的步骤说明，仅用于理解数据依赖：
 *
 * 阶段1: 数据获取（7个步骤）
 * 1. fetch-etfs: 获取产业相关ETF列表
 * 2. fetch-etf-data: 获取ETF市场数据
 * 3. fetch-etf-holdings: 获取ETF持仓明细
 * 4. fetch-companies: 获取产业链企业
 * 5. fetch-company-data: 获取企业市场数据
 * 6. fetch-news: 获取相关新闻资讯
 * 7. calculate-market-trends: 计算市场趋势指标
 *
 * 阶段2: AI分析报告（6个步骤）
 * 8. market-analysis: 市场分析
 * 9. news-analysis: 资讯分析
 * 10. company-analysis: 企业分析
 * 11. industry-overview: 行业总览
 * 12. investment-advice: 投资建议
 * 13. generate-report: 生成分析报告
 */
export const comprehensiveAnalysisWorkflow = new ExecutionOrchestrator(
  'comprehensive-analysis',
  [
    // 冻结后其余数据步骤仅投影此版本，不再混入新数据。
    freezeResearchStep,
    fetchMarketSnapshotStep,
    fetchETFsStep,
    fetchETFDataStep,
    fetchETFHoldingsStep,
    fetchCompaniesStep,
    fetchCompanyDataStep,
    fetchNewsStep,
    fetchPortfolioStep,
    calculateMarketTrendsStep,
    assessDataQualityStep,
    etfActionStep,

    // AI分析报告阶段
    marketAnalysisStep,
    newsAnalysisStep,
    companyAnalysisStep,
    portfolioAnalysisStep,
    industryOverviewStep,
    investmentAdviceStep,
    socialReportStep,
    generateReportStep
  ]
)
