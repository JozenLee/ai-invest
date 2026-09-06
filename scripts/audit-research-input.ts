// Read-only replay: compares historical prompts with current evidence construction.
import { config } from 'dotenv'
config({ quiet: true })
import { researchPrompt, researchEvidence } from '../src/lib/workflow/research-input'
import { renderReportPoster } from '../src/lib/analysis/report-poster'
import type { StepContext } from '../src/lib/workflow/types'
import sharp from 'sharp'
import { REPORT_SECTIONS, type SocialReport } from '../src/lib/analysis/social-report'

async function main() {
  const { prisma } = await import('../src/lib/db/prisma')
  try {
    const runId = process.argv[2]
    if (!runId) throw new Error('请提供要离线检查的runId；可选第三参数为预览PNG路径')
    const steps = await prisma.executionStep.findMany({ where: { runId }, include: { artifacts: true } })
    const artifacts = new Map(steps.flatMap(s => s.artifacts).filter(a => a.data).map(a => { let value; try { value=JSON.parse(a.data!) } catch { value=a.data } return [a.artifactKey,value] }))
    const context = { artifacts } as StepContext
    for (const step of steps.filter(s => s.artifacts.some(a => a.artifactKey === 'ai-prompt') && s.stepName !== 'portfolio-analysis')) {
      const previous = JSON.parse(step.artifacts.find(a=>a.artifactKey === 'ai-prompt')!.data!)
      const before = previous.messages.map((m: any)=>m.content).join('\n').length
      const after = step.stepName === 'social-report' ? JSON.stringify(researchEvidence(context, step.stepName)) : researchPrompt(context,step.stepName)
      console.log(JSON.stringify({ step: step.stepName, previousCharacters: before, newCharacters: after.length, reductionPct: Math.round((1-after.length/before)*100), operationalPointFields: /historyPoints|data_points|dataPoints|sampleCount/.test(after) }))
    }
    if (process.argv[3] && artifacts.get('social-report')) {
      const template: SocialReport = { version: 2, title: 'AI算力硬件：研究模板', subtitle: '排版示例，非最新投资判断。以产业驱动、盈利兑现与ETF暴露构建研究框架；数字和来源须在正式报告中核验。',
        takeaways: ['需求增长需要订单、收入与现金流共同验证', '价格趋势不等于估值便宜，缺少估值数据时暂不判断', '观察基准与反向情景，明确投资论点失效条件'],
        metrics: ['ETF样本A','ETF样本B','ETF样本C'].map(label=>({label,value:'待核验',date:'数据日期待核验',source:'示例占位 · 非真实行情'})),
        sections: REPORT_SECTIONS.map((title,i)=>({title,body:[
          '从算力需求、资本开支，到芯片、互联、供电与散热的传导。重点区分需求预期、已签订单与已确认收入，避免把新闻热度当作业绩。',
          '优先比较同口径营收同比、净利率及经营现金流与净利润之比。增长与现金流背离时，继续核验应收账款、库存和回款周期。',
          '趋势观察均线偏离、波动率与回撤；估值需要历史分位或同口径比较。价格序列有断点时停用相关技术指标，缺数据不补零。',
          '以已披露持仓连接产业链和A股ETF，识别集中度与重复暴露。披露期和权重未核验时，只呈现关系，不推断实时配置比例。',
          '基准：需求逐步兑现；上行：订单与现金流同步改善；下行：资本开支放缓。跟踪兑现条件，不编造情景概率或目标收益。',
          '观察后续财报的增长率、净利率与现金流，核验关键订单的收入确认。若需求增长未传导到利润和回款，应重新审视研究论点。'
        ][i]})), risks: ['需求和订单兑现低于预期，产业链盈利可能承压。','高估值、拥挤交易和持仓重叠可能放大回撤。','数据缺口、披露滞后和复权异常可能影响判断。'] }
      const svg=renderReportPoster(process.argv[4] === '--template' ? template : artifacts.get('social-report'),{industry:artifacts.get('industry-info')?.name || '产业',date:'排版预览 · 非实时研究'})
      await sharp(Buffer.from(svg)).png().toFile(process.argv[3])
      console.log('Preview: '+process.argv[3])
    }
  } finally { await prisma.$disconnect() }
}
void main()
