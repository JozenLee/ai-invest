import { claudeClient } from '@/lib/ai/claude'
import type { StepDefinition } from '../types'

/**
 * 步骤12: 投资建议
 */
export const investmentAdviceStep: StepDefinition = {
  name: 'investment-advice',
  description: '投资建议',
  dependencies: ['industry-overview'],
  estimatedDuration: 20000,

  async execute(context) {
    await context.updateProgress(0, 1, '正在生成投资建议...')

    const marketAnalysis = context.artifacts.get('market-analysis') || '{}'
    const newsAnalysis = context.artifacts.get('news-analysis') || '{}'
    const companyAnalysis = context.artifacts.get('company-analysis') || '{}'
    const industryOverview = context.artifacts.get('industry-overview') || '{}'

    const prompt = `基于全面分析，请给出综合投资建议：

**市场分析**
${marketAnalysis}

**资讯分析**
${newsAnalysis}

**企业分析**
${companyAnalysis}

**行业总览**
${industryOverview}

请提供：
1. 综合评分（0-100）和评级
2. 投资逻辑和核心观点
3. 建议配置比例和持有周期
4. 关键风险提示
5. 后续跟踪要点

以JSON格式输出完整的投资建议。`

    const response = await claudeClient.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      system: '你是资深的投资顾问，擅长整合多维度信息提供投资建议。',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    })

    const result = response.content[0].type === 'text' ? response.content[0].text : '{}'

    await context.saveArtifact('investment-advice', result, 'DATA')

    // 保存综合评分
    try {
      const adviceData = JSON.parse(result)
      await context.saveArtifact(
        'overall-score',
        { score: adviceData.score || 50, rating: adviceData.rating || '中性' },
        'DATA'
      )
    } catch (e) {
      console.warn('Failed to parse investment advice for scoring')
    }

    await context.updateProgress(1, 1, '投资建议完成')
  }
}
