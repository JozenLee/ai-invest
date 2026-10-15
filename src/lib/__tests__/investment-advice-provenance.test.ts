import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/research/strategy/store',()=>({prepareUnifiedAllocation:vi.fn().mockResolvedValue(null)}))
vi.mock('@/lib/workflow/analysis-prompt',()=>({runAnalysisPrompt:vi.fn()}))
import { runAnalysisPrompt } from '@/lib/workflow/analysis-prompt'
import { investmentAdviceStep } from '@/lib/workflow/steps/investment-advice-step'
import type { StepContext } from '@/lib/workflow/types'
import { fixture } from '@/lib/research/__tests__/fixtures'
import { evaluateResearch } from '@/lib/research/engine'

describe('investment advice provenance',()=>{
  it('preserves an AI assessment and exposes conflicting rules separately',async()=>{
    const snapshot=fixture(),evaluation=evaluateResearch(snapshot)
    evaluation.decisions.forEach(item=>item.state='risk-off')
    const recommendation={unheld:'观望',held:'持有',reason:'短期波动仍在预算内，继续等待现金流验证'}
    const productDecisions=[{ticker:'159995',unheldAction:'观望',heldAction:'持有',suggestedAdjustmentPct:0,confidencePct:70,reason:'短期波动仍在预算内',trigger:'现金流改善',invalidation:'盈利恶化',quantitativeOverride:'当前估值与现金流证据支持等待，若趋势条件继续恶化则撤销覆盖',evidenceIds:['raw-one']}]
    const executiveSummary={conclusion:'市场、企业与事件证据尚未形成一致改善，当前以控制风险暴露和等待现金流验证为主。',allocationStance:'维持谨慎配置',keyDrivers:['产业需求'],opportunities:[{title:'现金流改善',status:'待观察',evidence:'尚未确认',actionImplication:'确认后复核'}],mainRisks:['短期波动'],watchPoints:['现金流改善'],actionPlan:{priority:'等待现金流确认',unheld:'观望',held:'持有'},historyComparison:[]}
    vi.mocked(runAnalysisPrompt).mockResolvedValue({content:[{type:'text',text:JSON.stringify({rating:'谨慎',executiveSummary,recommendation,productDecisions,tacticalView:{},strategicView:{},thesis:'产业观点',etfImplications:[],scenarios:{},counterEvidence:[],risks:[],watchlist:[]})}]} as never)
    const module={analysis:'测试结论',evidence:[],counterEvidence:[],watchlist:[]}
    const artifacts=new Map<string,unknown>([['research-snapshot',snapshot],['research-evaluation',evaluation],['industry-info',{name:'测试领域'}],['market-analysis',module],['company-analysis',{...module,key_companies:[]}],['news-analysis',{...module,catalysts:[],risks:[]}],['industry-overview',{...module,stage:'成长期'}]])
    const context={artifacts,input:{industryId:'ai'},updateProgress:vi.fn(),saveArtifact:vi.fn(async(key:string,value:unknown)=>{artifacts.set(key,value)})} as unknown as StepContext
    await investmentAdviceStep.execute(context)
    const result=JSON.parse(String(artifacts.get('investment-advice')))
    expect(result.recommendation).toEqual(recommendation)
    expect(result.executiveSummary).toEqual(executiveSummary)
    expect(result.ruleAssessment).toMatchObject({signal:'risk-off',total:1})
    expect(result.recommendationSource).toContain('AI投资决策')
    expect(result.productDecisions[0]).toMatchObject({ticker:'159995',decisionSource:'ai'})
    expect(result.productSelection).toEqual(evaluation.productComparisons)
  })
})
