import { claudeClient } from '@/lib/ai/claude'
import type { StepDefinition } from '../types'

/**
 * 步骤11: 行业总览
 */
export const industryOverviewStep: StepDefinition = {
  name: 'industry-overview',
  description: '行业总览',
  dependencies: ['market-analysis', 'news-analysis', 'company-analysis'],
  estimatedDuration: 20000,

  async execute(context) {
    await context.updateProgress(0, 1, '正在生成行业总览...')

    const industryInfo = context.artifacts.get('industry-info') as any
    const marketAnalysis = context.artifacts.get('market-analysis') || '{}'
    const newsAnalysis = context.artifacts.get('news-analysis') || '{}'
    const companyAnalysis = context.artifacts.get('company-analysis') || '{}'

    const prompt = `基于前面的分析，请生成行业总览：

**行业**: ${industryInfo?.name}
**描述**: ${industryInfo?.description}

**市场分析**
${marketAnalysis}

**资讯分析**
${newsAnalysis}

**企业分析**
${companyAnalysis}

请提供：
1. 行业发展阶段和成熟度
2. 核心驱动因素
3. 主要挑战和风险
4. 未来3-6个月展望

以JSON格式输出，包含：analysis（文字分析）、stage（emerging/growing/mature/declining）、drivers（驱动因素）、outlook（展望）`

    const response = await claudeClient.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      system: '你是资深的行业研究专家，擅长整合多维度信息提供战略洞察。',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    })

    const result = response.content[0].type === 'text' ? response.content[0].text : '{}'

    await context.saveArtifact('industry-overview', result, 'DATA')
    await context.updateProgress(1, 1, '行业总览完成')
  }
}
