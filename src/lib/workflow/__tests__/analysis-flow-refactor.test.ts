import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StepContext } from '../types'
const model=vi.hoisted(()=>vi.fn())
const support=vi.hoisted(()=>vi.fn())
vi.mock('../analysis-prompt',()=>({runAnalysisPrompt:model,recoverableAnalysisError:(error:Error)=>/timeout/.test(error.message)}))
vi.mock('@/lib/portfolio/decision-support',async importOriginal=>({...await importOriginal<typeof import('@/lib/portfolio/decision-support')>(),buildPortfolioDecisionSupport:support}))
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
    model.mockResolvedValueOnce({content:[{type:'text',text:JSON.stringify({version:1,proposals:[],scenarios:[],preferredId:'hold',selectionReason:'保持风险预算',evidenceBoundary:'暂无逐产品证据'})}]}).mockResolvedValueOnce({content:[{type:'text',text:JSON.stringify({selectedId:'hold',reason:'保持风险预算',rejectedAlternatives:[{id:'rules',reason:'技术规则未证明改善'}]})}]})
    const ctx=context([
      ['portfolio-evidence',{totalAssets:987654,email:'private@example.com',holdings:[{ticker:'001',name:'测试基金',weightPct:10,units:45678,amount:987654}],cashWeightPct:90,riskBudget:{minCashRatio:.1,maxIndustryRatio:.2,maxFundRatio:.15,maxSingleAdjustmentRatio:.05}}],
      ['research-evaluation',{asOf:'2026-09-11T00:00:00Z',profile:{name:'芯片'},decisions:[]}],['data-quality',{status:'available'}],['investment-advice',{rating:'谨慎',executiveSummary:{conclusion:'维持风险预算'}}],
    ],{publicOnly:false,portfolioAiConsent:'https://example.com'})
    await portfolioDecisionStep.execute(ctx)
    const sent=JSON.stringify(model.mock.calls.map(call=>call[1]))
    for(const secret of ['987654','12345','45678','private@example.com'])expect(sent).not.toContain(secret)
    expect(sent).toContain('测试基金')
    expect(ctx.artifacts.get('portfolio-analysis')).toMatchObject({mode:'投资假设与备选方案比较',conclusionApplication:'保持风险预算'})
    expect(ctx.artifacts.get('portfolio-decision-support')).toMatchObject({totalAssets:987654})
  })
  it('does not call AI during a rules-only review even when consent exists',async()=>{
    support.mockReturnValue({actions:[],confidencePct:50,gates:[]})
    const ctx=context([['portfolio-evidence',{totalAssets:100,riskBudget:{}}],['research-evaluation',{asOf:'2026-09-11T00:00:00Z',profile:{name:'芯片'},decisions:[]}]],{rulesOnly:true,publicOnly:false,portfolioAiConsent:'https://example.com'})
    await portfolioDecisionStep.execute(ctx)
    expect(model).not.toHaveBeenCalled()
    expect(ctx.artifacts.get('portfolio-analysis-ai-status')).toMatchObject({status:'local-synthesis'})
  })
})
