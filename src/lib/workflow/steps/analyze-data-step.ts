import { claudeClient } from '@/lib/ai/claude'
import type { StepDefinition } from '../types'

/**
 * 步骤8: AI综合分析
 * 分阶段分析：市场 → 资讯 → 企业 → 行业总览 → 投资建议
 */
export const analyzeDataStep: StepDefinition = {
  name: 'analyze-data',
  description: 'AI综合分析',
  dependencies: [
    'fetch-etf-data',
    'fetch-company-data',
    'fetch-news',
    'calculate-market-trends'
  ],
  estimatedDuration: 90000,

  async execute(context) {
    await context.updateProgress(0, 5, '准备分析数据...')

    // 收集所有分析依据
    const industryInfo = context.artifacts.get('industry-info') as any
    const etfBindings = (context.artifacts.get('etf-bindings') as any) || []
    const etfMarketData = (context.artifacts.get('etf-market-data') as any) || []
    const companies = (context.artifacts.get('companies') as any) || []
    const companyMarketData = (context.artifacts.get('company-market-data') as any) || []
    const newsArticles = (context.artifacts.get('news-articles') as any) || []
    const newsSentiment = (context.artifacts.get('news-sentiment') as any) || {}
    const marketTrends = (context.artifacts.get('market-trends') as any) || {}

    // === 第一阶段：市场分析 ===
    await context.updateProgress(1, 5, '正在分析市场趋势...')

    const marketAnalysisPrompt = `请分析以下市场数据：

**行业**: ${industryInfo?.name}

**相关ETF** (${etfBindings.length}个)
${JSON.stringify(etfBindings.slice(0, 10), null, 2)}

**ETF市场数据**
${JSON.stringify(etfMarketData.slice(0, 10), null, 2)}

**市场趋势指标**
${JSON.stringify(marketTrends, null, 2)}

请从以下角度分析：
1. ETF整体表现和市场热度
2. 价格趋势和技术形态
3. 成交量和资金流向
4. 短期和中期市场展望

以JSON格式输出，包含：analysis（文字分析）、score（0-100评分）、trend（up/down/stable）、risk_level（low/medium/high）`

    const marketAnalysis = await claudeClient.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      system: '你是专业的市场分析师，擅长解读ETF市场数据和技术指标。',
      messages: [{ role: 'user', content: marketAnalysisPrompt }],
      temperature: 0.3
    })

    const marketResult = marketAnalysis.content[0].type === 'text'
      ? marketAnalysis.content[0].text
      : '{}'

    await context.saveArtifact('market-analysis', marketResult, 'DATA')

    // === 第二阶段：资讯分析 ===
    await context.updateProgress(2, 5, '正在分析资讯动态...')

    const newsAnalysisPrompt = `请分析以下资讯数据：

**行业**: ${industryInfo?.name}

**最近新闻** (${newsArticles.length}条)
${JSON.stringify(newsArticles.slice(0, 10), null, 2)}

**新闻情感汇总**
${JSON.stringify(newsSentiment, null, 2)}

请从以下角度分析：
1. 重大事件和政策影响
2. 市场情绪和舆论导向
3. 短期催化剂和风险事件
4. 投资者关注焦点

以JSON格式输出，包含：analysis（文字分析）、sentiment（positive/neutral/negative）、catalysts（催化剂列表）、risks（风险列表）`

    const newsAnalysis = await claudeClient.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      system: '你是专业的资讯分析师，擅长解读新闻事件和市场情绪。',
      messages: [{ role: 'user', content: newsAnalysisPrompt }],
      temperature: 0.3
    })

    const newsResult = newsAnalysis.content[0].type === 'text'
      ? newsAnalysis.content[0].text
      : '{}'

    await context.saveArtifact('news-analysis', newsResult, 'DATA')

    // === 第三阶段：企业分析 ===
    await context.updateProgress(3, 5, '正在分析企业基本面...')

    const companyAnalysisPrompt = `请分析以下企业数据：

**行业**: ${industryInfo?.name}

**产业链企业** (${companies.length}家)
${JSON.stringify(companyMarketData.slice(0, 20), null, 2)}

请从以下角度分析：
1. 产业链结构和关键环节
2. 龙头企业识别和竞争格局
3. 企业成长性和投资价值
4. 行业集中度和竞争壁垒

以JSON格式输出，包含：analysis（文字分析）、key_companies（重点企业列表）、chain_structure（产业链结构）`

    const companyAnalysis = await claudeClient.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      system: '你是专业的行业研究员，擅长产业链分析和企业价值评估。',
      messages: [{ role: 'user', content: companyAnalysisPrompt }],
      temperature: 0.3
    })

    const companyResult = companyAnalysis.content[0].type === 'text'
      ? companyAnalysis.content[0].text
      : '{}'

    await context.saveArtifact('company-analysis', companyResult, 'DATA')

    // === 第四阶段：行业总览 ===
    await context.updateProgress(4, 5, '正在生成行业总览...')

    const industryOverviewPrompt = `基于前面的分析，请生成行业总览：

**行业**: ${industryInfo?.name}
**描述**: ${industryInfo?.description}

**市场分析**
${marketResult}

**资讯分析**
${newsResult}

**企业分析**
${companyResult}

请提供：
1. 行业发展阶段和成熟度
2. 核心驱动因素
3. 主要挑战和风险
4. 未来3-6个月展望

以JSON格式输出，包含：analysis（文字分析）、stage（emerging/growing/mature/declining）、drivers（驱动因素）、outlook（展望）`

    const industryOverview = await claudeClient.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      system: '你是资深的行业研究专家，擅长整合多维度信息提供战略洞察。',
      messages: [{ role: 'user', content: industryOverviewPrompt }],
      temperature: 0.3
    })

    const overviewResult = industryOverview.content[0].type === 'text'
      ? industryOverview.content[0].text
      : '{}'

    await context.saveArtifact('industry-overview', overviewResult, 'DATA')

    // === 第五阶段：投资建议 ===
    await context.updateProgress(5, 5, '正在生成投资建议...')

    const investmentAdvicePrompt = `基于全面分析，请给出综合投资建议：

**市场分析**
${marketResult}

**资讯分析**
${newsResult}

**企业分析**
${companyResult}

**行业总览**
${overviewResult}

请提供：
1. 综合评分（0-100）和评级
2. 投资逻辑和核心观点
3. 建议配置比例和持有周期
4. 关键风险提示
5. 后续跟踪要点

以JSON格式输出完整的投资建议。`

    const investmentAdvice = await claudeClient.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      system: '你是资深的投资顾问，擅长整合多维度信息提供投资建议。',
      messages: [{ role: 'user', content: investmentAdvicePrompt }],
      temperature: 0.3
    })

    const adviceResult = investmentAdvice.content[0].type === 'text'
      ? investmentAdvice.content[0].text
      : '{}'

    await context.saveArtifact('investment-advice', adviceResult, 'DATA')

    // 保存综合评分
    try {
      const adviceData = JSON.parse(adviceResult)
      await context.saveArtifact(
        'overall-score',
        { score: adviceData.score || 50, rating: adviceData.rating || '中性' },
        'DATA'
      )
    } catch (e) {
      console.warn('Failed to parse investment advice for scoring')
    }

    await context.updateProgress(5, 5, 'AI分析完成')
  }
}
