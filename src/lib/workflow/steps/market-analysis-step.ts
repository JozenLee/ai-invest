import { claudeClient } from '@/lib/ai/claude'
import type { StepDefinition } from '../types'

/**
 * 步骤8: 市场分析
 */
export const marketAnalysisStep: StepDefinition = {
  name: 'market-analysis',
  description: '市场分析',
  dependencies: ['fetch-etf-data', 'fetch-market-snapshot', 'calculate-market-trends'],
  estimatedDuration: 20000,

  async execute(context) {
    await context.updateProgress(0, 1, '正在分析市场趋势...')

    const industryInfo = context.artifacts.get('industry-info') as any
    const etfBindings = (context.artifacts.get('etf-bindings') as any) || []
    const etfMarketData = (context.artifacts.get('etf-market-data') as any) || []
    const marketTrends = (context.artifacts.get('market-trends') as any) || {}
    const marketSnapshot = context.artifacts.get('market-snapshot') || {}

    const prompt = `请分析以下市场数据：

**行业**: ${industryInfo?.name}

**相关ETF** (${etfBindings.length}个)
${JSON.stringify(etfBindings.slice(0, 10), null, 2)}

**ETF市场数据**
${JSON.stringify(etfMarketData.slice(0, 10), null, 2)}

**市场趋势指标**
${JSON.stringify(marketTrends, null, 2)}

**市场指数与板块资金流向**
${JSON.stringify(marketSnapshot, null, 2)}

请从以下角度分析：
1. ETF整体表现和市场热度
2. 价格趋势和技术形态
3. 成交量和资金流向
4. 短期和中期市场展望

以JSON格式输出，包含：analysis（文字分析）、score（0-100评分）、trend（up/down/stable）、risk_level（low/medium/high）`

    const response = await claudeClient.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      system: '你是专业的市场分析师，擅长解读ETF市场数据和技术指标。',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    })

    const result = response.content[0].type === 'text' ? response.content[0].text : '{}'

    await context.saveArtifact('market-analysis', result, 'DATA')
    await context.updateProgress(1, 1, '市场分析完成')
  }
}
