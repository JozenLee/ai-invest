import { runAnalysisPrompt } from '../analysis-prompt'
import { researchPrompt, RESEARCH_SYSTEM } from '../research-input'
import type { StepDefinition } from '../types'
import { saveValidatedResearchOutput, valuationNarrative } from '../research-output'
import { reportAdviceConfidence } from '@/lib/analysis/report-insights'

/**
 * 步骤12: 投资建议
 */
export const investmentAdviceStep: StepDefinition = {
  name: 'investment-advice',
  description: '投资建议',
  dependencies: ['assess-data-quality', 'industry-overview'],
  estimatedDuration: 20000,

  async execute(context) {
    await context.updateProgress(0, 1, '正在生成投资建议...')

    const prompt = researchPrompt(context, 'investment-advice')

    const response = await runAnalysisPrompt(context, {
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      system: RESEARCH_SYSTEM,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    })

    const result = response.content[0].type === 'text' ? response.content[0].text : '{}'

    const validated=await saveValidatedResearchOutput(context,'investment-advice',result)
    const adviceData=JSON.parse(validated)
    const evaluation=context.artifacts.get('research-evaluation')
    const decisions=evaluation?.decisions||[]
    const riskOff=decisions.filter((item:{state?:string})=>item.state==='risk-off').length
    const eligible=decisions.filter((item:{state?:string})=>item.state==='eligible').length
    adviceData.confidencePct=reportAdviceConfidence(evaluation,context.artifacts.get('data-quality'))
    adviceData.recommendation=riskOff>=Math.ceil(Math.max(1,decisions.length)/2)
      ? {unheld:'观望',held:'减仓',reason:'多数跟踪产品处于风险收缩状态。'}
      : eligible>0
        ? {unheld:'分批建仓',held:'持有',reason:`${eligible}只产品满足本轮建仓条件。`}
        : {unheld:'观望',held:'持有',reason:'关键条件尚未形成一致方向。'}
    adviceData.strategicView={...(adviceData.strategicView||{}),valuation:valuationNarrative(context.artifacts.get('research-evaluation')?.products||[])}
    const enriched=JSON.stringify(adviceData)
    await context.saveArtifact('investment-advice',enriched,'DATA')

    // 保存综合评分
    try {
      await context.saveArtifact(
        'overall-score',
        { score: typeof adviceData.score === 'number' && Number.isFinite(adviceData.score) ? adviceData.score : null, rating: adviceData.rating || '证据不足，未评级' },
        'DATA'
      )
    } catch {
      console.warn('Failed to parse investment advice for scoring')
    }

    await context.updateProgress(1, 1, '投资建议完成')
  }
}
