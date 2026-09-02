import { claudeClient } from '@/lib/ai/claude'
import type { StepDefinition } from '../types'

/**
 * 步骤9: 资讯分析
 */
export const newsAnalysisStep: StepDefinition = {
  name: 'news-analysis',
  description: '资讯分析',
  dependencies: ['fetch-news'],
  estimatedDuration: 20000,

  async execute(context) {
    await context.updateProgress(0, 1, '正在分析资讯动态...')

    const industryInfo = context.artifacts.get('industry-info') as any
    const newsArticles = (context.artifacts.get('news-articles') as any) || []
    const newsSentiment = (context.artifacts.get('news-sentiment') as any) || {}

    const prompt = `请分析以下资讯数据：

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

    const response = await claudeClient.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      system: '你是专业的资讯分析师，擅长解读新闻事件和市场情绪。',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    })

    const result = response.content[0].type === 'text' ? response.content[0].text : '{}'

    await context.saveArtifact('news-analysis', result, 'DATA')
    await context.updateProgress(1, 1, '资讯分析完成')
  }
}
