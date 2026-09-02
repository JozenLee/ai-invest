import { claudeClient } from '@/lib/ai/claude'
import type { StepDefinition } from '../types'

/**
 * 步骤10: 企业分析
 */
export const companyAnalysisStep: StepDefinition = {
  name: 'company-analysis',
  description: '企业分析',
  dependencies: ['fetch-company-data'],
  estimatedDuration: 20000,

  async execute(context) {
    await context.updateProgress(0, 1, '正在分析企业基本面...')

    const industryInfo = context.artifacts.get('industry-info') as any
    const companies = (context.artifacts.get('companies') as any) || []
    const companyMarketData = (context.artifacts.get('company-market-data') as any) || []

    const prompt = `请分析以下企业数据：

**行业**: ${industryInfo?.name}

**产业链企业** (${companies.length}家)
${JSON.stringify(companyMarketData.slice(0, 20), null, 2)}

请从以下角度分析：
1. 产业链结构和关键环节
2. 龙头企业识别和竞争格局
3. 企业成长性和投资价值
4. 行业集中度和竞争壁垒

以JSON格式输出，包含：analysis（文字分析）、key_companies（重点企业列表）、chain_structure（产业链结构）`

    const response = await claudeClient.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      system: '你是专业的行业研究员，擅长产业链分析和企业价值评估。',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    })

    const result = response.content[0].type === 'text' ? response.content[0].text : '{}'

    await context.saveArtifact('company-analysis', result, 'DATA')
    await context.updateProgress(1, 1, '企业分析完成')
  }
}
