import { describe, expect, it } from 'vitest'
import { assessReportQuality, buildRuleBasedAdvice, composeInvestmentConclusion, mergeNewsInsightIntoAdvice, mergeQualityIntoRiskWarning, parseJsonObject, validateAdvice } from '../daily-action'
import { summarizeNewsForAdvice } from '../news-insight'
import { extractMarkdownSection, normalizeAdvice, normalizeCompany, normalizeMarket, normalizeNews, normalizePortfolio } from '../report-contract'

describe('daily action report contract', () => {
  it('extracts new-protocol report sections without dropping content after the heading', () => {
    const report = '# 报告\n\n## 一、趋势判断\n\n趋势内容。\n\n## 二、关注重点\n\n关注内容。\n\n## 三、投资建议结论\n\n建议内容。'
    expect(extractMarkdownSection(report, '## 一、趋势判断')).toBe('趋势内容。')
    expect(extractMarkdownSection(report, '## 二、关注重点')).toBe('关注内容。')
    expect(extractMarkdownSection(report, '## 三、投资建议结论')).toBe('建议内容。')
  })

  it('maps legacy report sections into the new company report contract', () => {
    const company = normalizeCompany({
      trend_report: [
        '## 一、核心结论',
        '',
        '### 3. 核心判断',
        '',
        '趋势判断内容。',
        '',
        '## 四、风险与后续跟踪',
        '',
        '### 5. 后续跟踪触发条件',
        '',
        '关注重点内容。',
      ].join('\n'),
    })
    expect(company.trendJudgment).toContain('趋势判断内容')
    expect(company.focusPoints).toContain('关注重点内容')
  })

  it('keeps child headings inside a report section', () => {
    const report = '## 四、风险与后续跟踪\n\n### 1. 数据风险\n\n覆盖不足。\n\n### 2. 验证重点\n\n补齐现金流。\n\n## 五、结论\n\n暂不新增。'
    const section = extractMarkdownSection(report, '## 四、风险与后续跟踪')
    expect(section).toContain('数据风险')
    expect(section).toContain('验证重点')
    expect(section).not.toContain('## 五、结论')
  })

  it('normalizes snake_case data without losing numeric fields', () => {
    const market = normalizeMarket({
      etf_analysis: [{ name: '测试 ETF', code: '159000', price_change_pct: '-3.2', max_drawdown: '12.5' }],
      market_indices: [{ name: '上证指数', changePct: 1.2 }],
    })
    expect(market.etfs[0].price_change_pct).toBe(-3.2)
    expect(market.etfs[0].max_drawdown).toBe(12.5)
    expect(market.marketIndices[0].daily_change_pct).toBe(1.2)
  })

  it('flags extreme market values instead of reporting high quality', () => {
    const quality = assessReportQuality(
      normalizeMarket({ etf_analysis: [{ code: '159000', price_change_pct: -77, volatility: 390, max_drawdown: 87, data_points: 63 }] }),
      normalizeNews({ news: [{ title: '事件', sentiment: 0, impact: 1 }] }),
      { total: 1, analyzed: 1, topCompanies: [], summaries: [], segmentAnalysis: [], coreConclusion: '', trendReport: '', coverage: { quote_coverage_pct: 100, financial_coverage_pct: 100, announcement_coverage_pct: 100 } },
      normalizePortfolio({ holdings: [], cashBalance: 1000 }),
    )
    expect(quality.warnings.some((item) => item.includes('极端'))).toBe(true)
    expect(quality.level).not.toBe('high')
  })

  it('does not block the gate for the intentional top-company sample coverage', () => {
    const quality = assessReportQuality(
      normalizeMarket({ analyzedAt: '2026-08-22T18:47:43.168Z', etf_analysis: [
        { code: '159000', price_change_pct: 1, daily_change_pct: 1, trend: 'uptrend', volatility: 20, max_drawdown: 5 },
        { code: '159001', price_change_pct: 1, daily_change_pct: 1, trend: 'uptrend', volatility: 20, max_drawdown: 5 },
        { code: '159002', price_change_pct: 1, daily_change_pct: 1, trend: 'uptrend', volatility: 20, max_drawdown: 5 },
        { code: '159003', price_change_pct: 1, daily_change_pct: 1, trend: 'uptrend', volatility: 20, max_drawdown: 5 },
      ], index_analysis: [{ code: '000688', price_change_pct: 1 }] , sector_flow: { topInflowSectors: [], topOutflowSectors: [] } }),
      normalizeNews({ news: [{ title: '事件', sentiment: 0.2, impact: 2 }], analysis: '资讯分析' }),
      { total: 20, analyzed: 8, topCompanies: [{ name: '重点企业' }], summaries: [], segmentAnalysis: [], coreConclusion: '', trendReport: '', coverage: { quote_coverage_pct: 16, financial_coverage_pct: 17, announcement_coverage_pct: 16 } },
      normalizePortfolio({ holdings: [{ ticker: '159000', quantity: 10, unitNav: 1, marketValue: 10, weight: 1 }], cashBalance: 1000 }),
      { market: { status: 'success' }, news: { status: 'success' }, company: { status: 'success' }, portfolio: { status: 'success' } },
    )
    expect(quality.issues.some((item) => item.includes('企业数据平均覆盖率'))).toBe(false)
    expect(quality.gates.requiresDataReview).toBe(false)
    expect(quality.gates.canAddRisk).toBe(true)
  })

  it('attributes valid-code extreme history to the data source, not symbol mapping', () => {
    const quality = assessReportQuality(
      normalizeMarket({ etf_analysis: [{ code: '159739', name: '云计算ETF', price_change_pct: -55.19, volatility: 249.32, max_drawdown: 55.7, data_quality_source: '数据源' }] }),
      normalizeNews({ news: [{ title: '事件', sentiment: 0, impact: 1 }] }),
      { total: 1, analyzed: 1, topCompanies: [], summaries: [], segmentAnalysis: [], coreConclusion: '', trendReport: '', coverage: {} },
      normalizePortfolio({ holdings: [], cashBalance: 1000 }),
    )
    expect(quality.abnormalSamples?.[0]).toMatchObject({ symbol: '159739', source: '数据源' })
    expect(quality.diagnostics?.nextActions[0]).toContain('行情历史序列')
  })

  it('rejects a truncated AI summary instead of persisting it', () => {
    const market = normalizeMarket({ etf_analysis: [{ code: '159000', price_change_pct: 1, trend: 'uptrend' }] })
    const portfolio = normalizePortfolio({ holdings: [], cashBalance: 1000 })
    const quality = assessReportQuality(market, normalizeNews({ news: [] }), { total: 0, analyzed: 0, topCompanies: [], summaries: [], segmentAnalysis: [], coreConclusion: '', trendReport: '', coverage: {} }, portfolio)
    const result = validateAdvice({ summary: '综合判断，需等待业绩兑', strategy: '继续观察。', recommendations: [] }, buildRuleBasedAdvice('测试产业', market, normalizeNews({ news: [] }), { total: 0, analyzed: 0, topCompanies: [], summaries: [], segmentAnalysis: [], coreConclusion: '', trendReport: '', coverage: {} }, portfolio, quality, 'balanced', 'medium'), { quality, market, portfolio })
    expect(result.valid).toBe(false)
    expect(result.warnings.some((item) => item.includes('截断'))).toBe(true)
  })

  it('merges the quality gate state into the risk warning', () => {
    const warning = mergeQualityIntoRiskWarning('组合映射仍需复核', {
      level: 'medium',
      score: 77,
      coverage: 0.7,
      freshness: 1,
      integrity: 0.5,
      moduleScores: { market: 70, news: 70, company: 70, portfolio: 35, consistency: 80 },
      gates: { canAddRisk: false, canCalculateAllocation: false, requiresDataReview: true },
      issues: [],
      warnings: ['板块资金流向未返回'],
    })
    expect(warning).toContain('数据可执行性：需复核（有效行情 暂无/暂无，企业综合覆盖 70%）')
    expect(warning).toContain('当前不允许新增风险')
    expect(warning).toContain('板块资金流向未返回')
  })

  it('falls back to deterministic recommendations when AI JSON is unusable', () => {
    const advice = buildRuleBasedAdvice(
      'AI算力硬件',
      normalizeMarket({ etf_analysis: [{ name: '测试 ETF', code: '159000', price_change_pct: 4, trend: 'strong_uptrend', volatility: 30 }] }),
      normalizeNews({ news: [] }),
      { total: 0, analyzed: 0, topCompanies: [], summaries: [], segmentAnalysis: [], coreConclusion: '', trendReport: '', coverage: {} },
      normalizePortfolio({ holdings: [], cashBalance: 1000 }),
      { level: 'medium', score: 65, coverage: 0.6, freshness: 1, integrity: 1, moduleScores: { market: 80, news: 0, company: 0, portfolio: 20, consistency: 45 }, gates: { canAddRisk: false, canCalculateAllocation: false, requiresDataReview: true }, issues: [], warnings: [] },
      'balanced',
      'medium',
    )
    expect(advice.recommendations.length).toBe(0)
    expect(advice.decisionBrief?.headline).toBeTruthy()
    expect(advice.recommendations.every((item) => item.targetType === 'holding')).toBe(true)
  })

  it('uses the latest trading-day change as the daily action gate', () => {
    const market = normalizeMarket({
      etf_analysis: [{ code: '159000', name: '测试 ETF', price_change_pct: 28, daily_change_pct: -3.2, trend: 'strong_uptrend', volatility: 20, max_drawdown: 10 }],
    })
    const portfolio = normalizePortfolio({ holdings: [{ ticker: '159000', quantity: 100, unitNav: 1, industryDomain: '测试产业' }], cashBalance: 1000 })
    const company = { total: 1, analyzed: 1, topCompanies: [], summaries: [], segmentAnalysis: [], coreConclusion: '', trendReport: '', coverage: { quote_coverage_pct: 100, financial_coverage_pct: 100, announcement_coverage_pct: 100 } }
    const quality = { level: 'high' as const, score: 95, coverage: 1, freshness: 1, integrity: 1, moduleScores: { market: 100, news: 100, company: 100, portfolio: 100, consistency: 100 }, gates: { canAddRisk: true, canCalculateAllocation: true, requiresDataReview: false }, issues: [], warnings: [] }
    const advice = buildRuleBasedAdvice('测试产业', market, normalizeNews({ news: [{ title: '事件', sentiment: 0.2, impact: 2 }] }), company, portfolio, quality, 'aggressive', 'short')
    const recommendation = advice.recommendations.find((item) => item.symbol === '159000')
    expect(recommendation?.action).toBe('watch')
    expect(recommendation?.reason).toContain('最新交易日涨跌 -3.20%')
  })

  it('parses fenced JSON and rejects arrays', () => {
    expect(parseJsonObject('```json\n{"summary":"ok"}\n```')).toEqual({ summary: 'ok' })
    expect(parseJsonObject('[1,2,3]')).toBeNull()
  })

  it('blocks risk when portfolio allocation data is incomplete', () => {
    const portfolio = normalizePortfolio({ holdings: [{ ticker: '159000', quantity: 10, unitNav: 1 }], cashBalance: 1000 })
    const quality = assessReportQuality(
      normalizeMarket({ etf_analysis: [{ code: '159000', price_change_pct: 4, trend: 'strong_uptrend', volatility: 30 }] }),
      normalizeNews({ news: [{ title: '事件', sentiment: 0, impact: 1 }] }),
      { total: 1, analyzed: 1, topCompanies: [], summaries: [], segmentAnalysis: [], coreConclusion: '', trendReport: '', coverage: { quote_coverage_pct: 100, financial_coverage_pct: 100, announcement_coverage_pct: 100 } },
      portfolio,
    )
    expect(quality.gates.canAddRisk).toBe(false)
    expect(quality.gates.canCalculateAllocation).toBe(true)
    expect(portfolio.valuationMode).toBe('imported_nav')
    expect(portfolio.holdings[0].weight).toBeCloseTo(10 / 1010 * 100, 5)
  })

  it('treats a knowledge-graph industry domain as a valid portfolio mapping', () => {
    const market = normalizeMarket({ etf_analysis: [{ code: '159000', price_change_pct: 2, trend: 'uptrend', volatility: 20, max_drawdown: 10 }] })
    const portfolio = normalizePortfolio({ holdings: [{ ticker: '510300', name: '测试基金', quantity: 10, unitNav: 1, industryDomain: 'AI算力硬件', industryDomainSource: 'ai' }], cashBalance: 1000 })
    const quality = assessReportQuality(
      market,
      normalizeNews({ news: [{ title: '事件', sentiment: 0.2, impact: 1 }] }),
      { total: 1, analyzed: 1, topCompanies: [], summaries: [], segmentAnalysis: [], coreConclusion: '', trendReport: '', coverage: { quote_coverage_pct: 100, financial_coverage_pct: 100, announcement_coverage_pct: 100 } },
      portfolio,
      undefined,
      'AI算力硬件',
    )
    expect(quality.warnings.some((item) => item.includes('未与本次产业'))).toBe(false)
  })

  it('derives usable summary and strategy when AI only returns decisionBrief', () => {
    const advice = normalizeAdvice({
      decision: 'wait',
      decisionBrief: {
        headline: '数据门禁未通过，暂不新增风险',
        action: '完成数据复核后再评估',
        waitFor: ['补齐行情数据'],
      },
      recommendations: [],
    }, 'AI算力硬件')
    expect(advice.summary).toContain('数据门禁未通过')
    expect(advice.strategy).toContain('完成数据复核后再评估')
  })

  it('rejects AI risk actions without quality permission', () => {
    const market = normalizeMarket({ etf_analysis: [{ code: '159000', price_change_pct: 4, trend: 'strong_uptrend' }] })
    const portfolio = normalizePortfolio({ holdings: [], cashBalance: 1000 })
    const quality = assessReportQuality(market, normalizeNews({ news: [] }), { total: 0, analyzed: 0, topCompanies: [], summaries: [], segmentAnalysis: [], coreConclusion: '', trendReport: '', coverage: {} }, portfolio)
    const fallback = buildRuleBasedAdvice('测试产业', market, normalizeNews({ news: [] }), { total: 0, analyzed: 0, topCompanies: [], summaries: [], segmentAnalysis: [], coreConclusion: '', trendReport: '', coverage: {} }, portfolio, quality, 'balanced', 'medium')
    const result = validateAdvice({ summary: '加仓', strategy: '加仓', recommendations: [{ action: 'add', target: '测试 ETF', symbol: '159000', targetType: 'etf', reason: '理由', evidenceIds: ['quality-gate'] }] }, fallback, { quality, market, portfolio })
    expect(result.valid).toBe(false)
    expect(result.warnings.some((item) => item.includes('禁止 AI 输出新增风险动作'))).toBe(true)
  })

  it('keeps AI narrative when one recommendation references an unknown ETF', () => {
    const market = normalizeMarket({ etf_analysis: [{ code: '159000', name: '测试 ETF', price_change_pct: 2, trend: 'uptrend', data_points: 60 }] })
    const portfolio = normalizePortfolio({ holdings: [{ ticker: '159000', quantity: 10, unitNav: 1 }], cashBalance: 1000 })
    const quality = { level: 'high' as const, score: 90, coverage: 1, freshness: 1, integrity: 1, moduleScores: { market: 100, news: 100, company: 100, portfolio: 100, consistency: 100 }, gates: { canAddRisk: false, canCalculateAllocation: true, requiresDataReview: false }, issues: [], warnings: [] }
    const fallback = buildRuleBasedAdvice('测试产业', market, normalizeNews({ news: [{ title: '事件', sentiment: 0.2, impact: 2 }] }), { total: 1, analyzed: 1, topCompanies: [], summaries: [], segmentAnalysis: [], coreConclusion: '', trendReport: '', coverage: {} }, portfolio, quality, 'balanced', 'medium')
    const result = validateAdvice({
      summary: '市场短线修复，但区间趋势和企业现金流仍需验证。',
      strategy: '维持仓位，等待市场与基本面信号共振。',
      recommendations: [
        { action: 'watch', target: '未知 ETF', symbol: '999999', targetType: 'etf', reason: '未知标的', evidenceIds: ['quality-gate'], trigger: ['补齐行情'], invalidation: ['数据恢复'] },
        { action: 'watch', target: '测试 ETF', symbol: '159000', targetType: 'etf', reason: '有效标的', evidenceIds: ['quality-gate'], trigger: ['趋势延续'], invalidation: ['趋势转弱'] },
      ],
    }, fallback, { quality, market, portfolio })
    expect(result.valid).toBe(false)
    expect(result.narrativeValid).toBe(true)
    expect(result.advice.summary).toContain('市场短线修复')
    expect(result.advice.recommendations).toHaveLength(1)
    expect(result.advice.recommendations[0].symbol).toBe('159000')
  })

  it('uses imported holding amounts for allocation calculations', () => {
    const market = normalizeMarket({
      etf_analysis: [
        { code: '159000', name: '测试 ETF', price_change_pct: 8, trend: 'strong_uptrend', volatility: 20, max_drawdown: 10, data_points: 60 },
        { code: '159001', name: '测试 ETF 2', price_change_pct: 3, trend: 'uptrend', volatility: 20, max_drawdown: 10, data_points: 60 },
        { code: '159002', name: '测试 ETF 3', price_change_pct: 2, trend: 'uptrend', volatility: 20, max_drawdown: 10, data_points: 60 },
      ],
      index_analysis: [{ code: '000300', name: '沪深300', data_points: 60 }],
      sector_flow: { topInflowSectors: [{ sector: '半导体', netFlow: 2 }], topOutflowSectors: [{ sector: '地产', netFlow: -1 }] },
    })
    const portfolio = normalizePortfolio({ holdings: [{ ticker: '000001', name: '现有持仓', quantity: 100, unitNav: 10 }, { ticker: '159001', name: '产业映射持仓', quantity: 1, unitNav: 1, industryDomain: '测试产业' }], cashBalance: 1000 })
    const company = { total: 1, analyzed: 1, topCompanies: [], summaries: [], segmentAnalysis: [], coreConclusion: '', trendReport: '', coverage: { quote_coverage_pct: 100, financial_coverage_pct: 100, announcement_coverage_pct: 100 } }
    const news = normalizeNews({ analysis: '资讯聚合分析已完成，情绪与产业链标签可用于交叉验证。', news: Array.from({ length: 20 }, (_, index) => ({ title: `有效事件${index}`, sentiment: 0.4, impact: 2, segmentCodes: ['test'] })) })
    const quality = assessReportQuality(market, news, company, portfolio)
    const advice = buildRuleBasedAdvice('测试产业', market, news, company, portfolio, quality, 'aggressive', 'medium')
    expect(quality.gates.canCalculateAllocation).toBe(true)
    expect(quality.gates.canAddRisk).toBe(true)
    expect(advice.recommendations.every((item) => item.targetType === 'holding')).toBe(true)
    expect(advice.recommendations.find((item) => item.symbol === '159001')?.action).toBe('hold')
  })

  it('passes substantive news conclusions into investment action reasons', () => {
    const analysis = '# 资讯分析报告\n\n## 一、近期热点\n\n存储芯片价格剧烈波动。\n\n## 五、结论\n\n资讯面偏谨慎，等待价格与产业链数据验证。'
    expect(summarizeNewsForAdvice(analysis)).toContain('资讯面偏谨慎')

    const market = normalizeMarket({ etf_analysis: [{ code: '159000', price_change_pct: -3, trend: 'sideways', volatility: 30, max_drawdown: 10 }] })
    const news = normalizeNews({ analysis, news: [{ title: '存储芯片价格波动', sentiment: -0.3, impact: 2 }] })
    const company = { total: 1, analyzed: 1, topCompanies: [], summaries: [], segmentAnalysis: [], coreConclusion: '', trendReport: '', coverage: {} }
    const portfolio = normalizePortfolio({ holdings: [{ ticker: '159000', name: '测试 ETF', quantity: 10, unitNav: 1, industryDomain: '测试产业' }], cashBalance: 1000 })
    const quality = assessReportQuality(market, news, company, portfolio)
    const advice = buildRuleBasedAdvice('测试产业', market, news, company, portfolio, quality, 'balanced', 'medium')
    const reason = advice.recommendations.find((item) => item.symbol === '159000')?.reason || ''
    expect(reason).toContain('资讯面偏谨慎')
    expect(reason).not.toContain('资讯面资讯面')
  })

  it('keeps the complete news conclusion and removes Markdown markers from advice text', () => {
    const analysis = '## 五、结论\n当前AI算力硬件产业呈现**分化特征**：上游设备与材料景气度延续，云厂商算力投入维持高位，但存储芯片二级市场剧烈波动暴露需求预期分歧，地缘风险与资本开支压力增加不确定性。产业链中游（AI服务器供应链）供不应求与下游（存储芯片）估值承压并存，反映市场对AI算力需求可持续性存在疑虑。综合判断当前资讯面状态为**中性偏谨慎**，需重点跟踪三季度存储价格兑现情况及头部云厂商采购节奏变化。'
    const summary = summarizeNewsForAdvice(analysis)

    expect(summary).toContain('分化特征')
    expect(summary).toContain('中性偏谨慎')
    expect(summary).toContain('头部云厂商采购节奏变化')
    expect(summary).not.toContain('**')
  })

  it('normalizes terminal punctuation and adds readable conclusion headings', () => {
    const conclusion = composeInvestmentConclusion('核心判断。', '投资策略。。')
    expect(conclusion).toContain('核心判断：核心判断。')
    expect(conclusion).toContain('投资策略：投资策略。')
    expect(conclusion).not.toContain('📌')
    expect(conclusion).not.toContain('🧭')
    expect(conclusion).not.toContain('。。')
  })

  it('injects the news conclusion before accepting AI advice', () => {
    const candidate = mergeNewsInsightIntoAdvice({
      strategy: '维持观察',
      recommendations: [{
        action: 'watch', target: '测试 ETF', symbol: '159000', targetType: 'etf', reason: '市场趋势偏弱。', evidenceIds: ['market-risk'],
      }],
    }, normalizeNews({ analysis: '## 五、结论\n资讯面偏谨慎，等待价格验证。', news: [] }))
    const reason = candidate.recommendations?.[0]?.reason || ''
    expect(reason).toContain('资讯参考：偏谨慎，等待价格验证。')
    expect(candidate.strategy).toContain('资讯参考：偏谨慎，等待价格验证。')
  })
})
