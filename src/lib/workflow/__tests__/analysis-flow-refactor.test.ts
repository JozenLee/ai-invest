import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StepContext } from '../types'
const model=vi.hoisted(()=>vi.fn())
const support=vi.hoisted(()=>vi.fn())
vi.mock('../analysis-prompt',()=>({runAnalysisPrompt:model,recoverableAnalysisError:(error:Error)=>/timeout/.test(error.message)}))
vi.mock('@/lib/portfolio/decision-support',()=>({buildPortfolioDecisionSupport:support}))
import { newsAnalysisStep } from '../steps/news-analysis-step'
import { portfolioDecisionStep } from '../steps/portfolio-decision-step'

function context(entries:Array<[string,unknown]>,input:Record<string,unknown>={}):StepContext{
  const artifacts=new Map(entries)
  return {runId:'test',stepId:'test',input,artifacts,saveArtifact:vi.fn(async(key,value)=>{artifacts.set(key,value)}),updateProgress:vi.fn()}
}
afterEach(()=>vi.unstubAllEnvs())
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('AI_ENABLE_EVENT_SYNTHESIS','false');vi.stubEnv('ANTHROPIC_BASE_URL','https://example.com')})

describe('事件与持仓合并研判',()=>{
  it('always analyzes cleaned events with AI, rather than stale evaluation events',async()=>{
    model.mockResolvedValue({content:[{type:'text',text:JSON.stringify({analysis:'产业事件研判',sentiment:'中性',catalysts:[],risks:[],evidence:[],watchlist:[]})}]})
    const ctx=context([
      ['news-events',[{id:'clean',title:'本轮清洗事件',status:'evidence',priority:3,excerpt:'最新清洗正文'}]],
      ['research-evaluation',{events:[{id:'old',title:'旧评估事件'}],decisions:[]}],
    ])
    await newsAnalysisStep.execute(ctx)
    expect(model).toHaveBeenCalledOnce()
    const request=model.mock.calls[0][1]
    expect(request.messages[0].content).toContain('本轮清洗事件')
    expect(request.messages[0].content).not.toContain('旧评估事件')
    expect(ctx.artifacts.get('news-analysis-ai-status')).toEqual({status:'completed'})
  })
  it('runs AI inside portfolio decision and excludes all monetary fields from its input',async()=>{
    support.mockReturnValue({actions:[{ticker:'001',name:'测试基金',action:'持有',currentWeightPct:10,targetWeightPct:10,changeWeightPct:0,amount:987654,estimatedFee:12345,estimatedUnits:45678,mapping:{verified:true}}],confidencePct:80,totalAssets:987654,cashWeightPct:20,gates:[{label:'费用核验',met:true,detail:'金额987654'}]})
    model.mockResolvedValue({content:[{type:'text',text:JSON.stringify({analysis:'维持仓位',conclusionApplication:'保持风险预算',priorities:[],risks:[],watchlist:[]})}]})
    const ctx=context([
      ['portfolio-evidence',{totalAssets:987654,email:'private@example.com',holdings:[{ticker:'001',name:'测试基金',weightPct:10,units:45678,amount:987654}],riskBudget:{minCashRatio:.1}}],
      ['research-evaluation',{decisions:[]}],['data-quality',{status:'available'}],['investment-advice',{rating:'谨慎',executiveSummary:{conclusion:'维持风险预算'}}],
    ],{publicOnly:false,portfolioAiConsent:'https://example.com'})
    await portfolioDecisionStep.execute(ctx)
    const sent=JSON.stringify(model.mock.calls[0][1])
    for(const secret of ['987654','12345','45678','private@example.com'])expect(sent).not.toContain(secret)
    expect(sent).toContain('测试基金')
    expect(ctx.artifacts.get('portfolio-analysis')).toMatchObject({aiAnalysis:{analysis:'维持仓位'}})
    expect(ctx.artifacts.get('portfolio-decision-support')).toMatchObject({totalAssets:987654})
  })
  it('does not call AI during a rules-only review even when consent exists',async()=>{
    support.mockReturnValue({actions:[],confidencePct:50,gates:[]})
    const ctx=context([['portfolio-evidence',{totalAssets:100,riskBudget:{}}],['research-evaluation',{}]],{rulesOnly:true,publicOnly:false,portfolioAiConsent:'https://example.com'})
    await portfolioDecisionStep.execute(ctx)
    expect(model).not.toHaveBeenCalled()
    expect(ctx.artifacts.get('portfolio-analysis-ai-status')).toMatchObject({status:'local-synthesis'})
  })
})
