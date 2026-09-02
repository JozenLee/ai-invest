import { prisma } from '@/lib/db'
import type { StepDefinition } from '../types'

/**
 * 步骤7: 生成综合分析报告
 */
export const generateReportStep: StepDefinition = {
  name: 'generate-report',
  description: '生成综合分析报告',
  dependencies: ['investment-advice'],
  estimatedDuration: 5000,

  async execute(context) {
    await context.updateProgress(0, 2, '正在整合分析结果...')

    // 收集所有分析结果
    const industryInfo = context.artifacts.get('industry-info')
    const industryAnalysis = context.artifacts.get('industry-overview')
    const companyAnalysis = context.artifacts.get('company-analysis')
    const sentimentAnalysis = context.artifacts.get('news-analysis')
    const investmentAdvice = context.artifacts.get('investment-advice')
    const etfBindings = (context.artifacts.get('etf-bindings') as any[]) || []

    // 生成报告标题
    const title = `${industryInfo?.name || '行业'} - 综合投资分析报告`
    const timestamp = new Date().toLocaleString('zh-CN')

    // 构建Markdown格式报告
    const reportContent = `# ${title}

> 生成时间: ${timestamp}

## 一、行业概况

${industryAnalysis}

## 二、产业链结构

${companyAnalysis}

## 三、市场情绪与热点

${sentimentAnalysis}

## 四、投资建议

${investmentAdvice}

## 五、相关ETF

${etfBindings.map((etf: any, index: number) => `
### ${index + 1}. ${etf.etf_name || etf.etfName || 'ETF'} (${etf.etf_code || etf.etfCode || ''})
- 权重: ${etf.weight ?? '-'}
- 类型: ${(etf.bind_type || etf.bindType) === 'tracking' ? '跟踪型' : '主题型'}
`).join('\n')}

---

**免责声明**: 本报告由AI系统自动生成，仅供投资参考，不构成投资建议。投资有风险，决策需谨慎。
`

    await context.updateProgress(1, 2, '正在保存报告...')

    // 保存到数据库
    const report = await prisma.aIAnalysisReport.create({
      data: {
        type: 'comprehensive',
        industryId: industryInfo.id,
        industryName: industryInfo.name,
        title,
        summary: investmentAdvice.substring(0, 500),
        content: reportContent,
        dataJson: JSON.stringify({
          industryAnalysis,
          companyAnalysis,
          sentimentAnalysis,
          investmentAdvice,
          etfBindings,
          metadata: {
            runId: context.runId,
            generatedAt: new Date().toISOString()
          }
        })
      }
    })

    await context.updateProgress(2, 2, '报告生成完成')

    // 保存报告ID
    await context.saveArtifact('report-id', report.id, 'REFERENCE')
    await context.saveArtifact('report-content', reportContent, 'DATA')
  }
}
