import { etfActionStep } from '../steps/etf-action-step'
import { portfolioAnalysisStep } from '../steps/portfolio-analysis-step'
import { ExecutionOrchestrator } from '../execution-orchestrator'
import { freezeResearchStep } from '../steps/freeze-research-step'
import { fetchPortfolioStep } from '../steps/fetch-portfolio-step'
import { portfolioDecisionStep } from '../steps/portfolio-decision-step'
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
import { generateReportStep } from '../steps/generate-report-step'

/** 综合分析共19个子流程：规则评估并入质量校验，持仓AI解读并入组合建议。 */
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

    // AI分析报告阶段
    marketAnalysisStep,
    newsAnalysisStep,
    companyAnalysisStep,
    industryOverviewStep,
    investmentAdviceStep,
    // 组合建议比较独立研究、不交易和技术规则；硬约束校验独立于策略信号。
    portfolioDecisionStep,
    socialReportStep,
    generateReportStep
  ],
  [etfActionStep,{...portfolioAnalysisStep,execute:async context=>{
    if(!context.artifacts.has('portfolio-analysis'))await portfolioAnalysisStep.execute(context)
    else await context.updateProgress(1,1,'持仓解读已合并至组合仓位建议')
  }}]
)
