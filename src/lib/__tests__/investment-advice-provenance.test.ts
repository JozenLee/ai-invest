import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/workflow/analysis-prompt',()=>({runAnalysisPrompt:vi.fn(),recoverableAnalysisError:(error:Error)=>/timeout|输出校验失败/.test(error.message)}))
import { runAnalysisPrompt } from '@/lib/workflow/analysis-prompt'
import { investmentAdviceStep, normalizeInvestmentSynthesisResponse, parseHypothesisResponse, recoverStoredHypotheses } from '@/lib/workflow/steps/investment-advice-step'
import { independentHypothesisInput, type InvestmentHypothesis } from '@/lib/workflow/hypotheses'
import type { StepContext } from '@/lib/workflow/types'
import { fixture } from '@/lib/research/__tests__/fixtures'
import { evaluateResearch } from '@/lib/research/engine'

describe('investment advice provenance',()=>{
  beforeEach(()=>{vi.mocked(runAnalysisPrompt).mockReset()})
  it('preserves an AI assessment and exposes conflicting rules separately',async()=>{
    const snapshot=fixture(),evaluation=evaluateResearch(snapshot)
    evaluation.decisions.forEach(item=>item.state='risk-off')
    const recommendation={unheld:'观望',held:'持有',reason:'短期波动仍在预算内，继续等待现金流验证'}
    const executiveSummary={conclusion:'市场、企业与事件证据尚未形成一致改善，当前以控制风险暴露和等待现金流验证为主。',allocationStance:'维持谨慎配置',keyDrivers:['产业需求'],opportunities:[{title:'现金流改善',status:'待观察',evidence:'尚未确认',actionImplication:'确认后复核'}],mainRisks:['短期波动'],watchPoints:['现金流改善'],actionPlan:{priority:'等待现金流确认',unheld:'观望',held:'持有'},historyComparison:[]}
    const hypothesis:InvestmentHypothesis={id:'orders',title:'订单兑现',productTickers:['159995'],evidenceIds:['event-one'],statements:[{kind:'推断',text:'订单需回款验证',evidenceIds:['event-one']}],firstDisclosedAt:null,informationStatus:'待核验',informationDelta:'新增信息待核验',pricingStatus:'待核验',pricingEvidenceIds:[],horizonDays:120,verification:{date:null,event:'下一期财报',metric:'经营现金流'},counterEvidence:['订单尚未兑现现金流'],invalidation:'订单取消',expectedReturnPct:null,probability:null,pressureAssumptions:[]}
    const assessment={hypothesisId:'orders',stance:'维持观察',rationale:'等待回款验证',technicalConflict:'虽均线偏弱，长期订单假设尚未失效',actionConditions:['核验回款'],alternativeToTrading:'未证明减仓优于持有'}
    vi.mocked(runAnalysisPrompt).mockResolvedValueOnce({content:[{type:'text',text:JSON.stringify({hypotheses:[hypothesis]})}]} as never).mockResolvedValueOnce({content:[{type:'text',text:JSON.stringify({thesisAssessments:[assessment],rating:'谨慎',executiveSummary,recommendation,tacticalView:{},strategicView:{},thesis:'产业观点',etfImplications:[],scenarios:{},counterEvidence:[],risks:[],watchlist:[]})}]} as never)
    const artifacts=new Map<string,unknown>([['research-snapshot',snapshot],['research-evaluation',evaluation],['industry-info',{name:'测试领域'}]])
    const context={artifacts,input:{industryId:'ai'},updateProgress:vi.fn(),saveArtifact:vi.fn(async(key:string,value:unknown)=>{artifacts.set(key,value)})} as unknown as StepContext
    await investmentAdviceStep.execute(context)
    const result=JSON.parse(String(artifacts.get('investment-advice')))
    expect(result.recommendation).toEqual(recommendation)
    expect(result.executiveSummary).toEqual(executiveSummary)
    expect(result.ruleAssessment).toMatchObject({signal:'risk-off',total:1})
    expect(result.recommendationSource).toContain('模型')
    expect(result.productSelection).toEqual(evaluation.productComparisons)
    expect(result.investmentTheses).toEqual([{...hypothesis,assessment}])
    expect(artifacts.get('investment-theses')).toEqual(result.investmentTheses)
    expect(artifacts.get('investment-hypotheses')).toEqual([hypothesis])
    const calls=vi.mocked(runAnalysisPrompt).mock.calls
    const first=calls.at(-2)!,second=calls.at(-1)!
    expect(first[1].messages[0].content).not.toContain('risk-off')
    expect(first[1].messages[0].content).not.toContain('sourceModules')
    expect(second[1].messages[0].content).toContain('independentHypotheses')
    expect(second[1].messages[0].content).toContain('订单兑现')
    expect(second[1].messages[0].content).toContain('风险收缩')
    // Exercise real stage-specific validators, even though transport is mocked.
    expect(()=>first[1].validateOutput?.(JSON.stringify({hypotheses:[{...hypothesis,probability:.8}]}))).toThrow('输出校验失败')
    expect(()=>first[1].validateOutput?.('{"hypotheses":[{"title":"未转义"引号"}]}')).toThrow(SyntaxError)
    expect(()=>second[1].validateOutput?.('{"thesisAssessments":[{"rationale":"未转义"引号"}]}')).toThrow(SyntaxError)
    expect(()=>second[1].validateOutput?.(JSON.stringify({...result,thesisAssessments:[]}))).toThrow('遗漏')
    expect(()=>first[1].validateOutput?.('```json\n'+JSON.stringify({hypotheses:[hypothesis]})+'\n```')).not.toThrow()
    expect(()=>second[1].validateOutput?.('```json\n'+JSON.stringify({...result,thesisAssessments:[assessment]})+'\n```\n以上为研究结论')).not.toThrow()
  })
  it('conservatively normalizes unsupported disclosure claims and a misspelled no-trade comparison',()=>{
    const snapshot=fixture()
    const scope={...{productTickers:['159995'],evidenceIds:['event-one'],asOf:snapshot.asOf},disclosureHistoryVerified:false,pricingComparisonVerified:false}
    const raw={id:'orders',title:'订单兑现',productTickers:['159995'],evidenceIds:['event-one'],statements:[{kind:'事实',text:'订单已披露',evidenceIds:['event-one']},{kind:'推断',text:'订单仍需回款验证',evidenceIds:[]}],firstDisclosedAt:'2026-09-03',informationStatus:'新增经济信息',informationDelta:'订单披露',pricingStatus:'未反映',pricingEvidenceIds:['event-one'],horizonDays:120,verification:{date:null,event:'季报',metric:'现金流'},counterEvidence:['回款待核验'],invalidation:'订单取消',expectedReturnPct:null,probability:null,pressureAssumptions:[]}
    const parsed=parseHypothesisResponse(JSON.stringify({hypotheses:[raw]}),scope)
    expect(parsed.hypotheses[0]).toMatchObject({firstDisclosedAt:null,informationStatus:'待核验',pricingStatus:'待核验',pricingEvidenceIds:[]})
    expect(parsed.hypotheses[0].statements[1].evidenceIds).toEqual(['event-one'])
    expect(parsed.corrections).toHaveLength(3)
    const report={rating:'谨慎',executiveSummary:{conclusion:'观察',allocationStance:'观察',keyDrivers:[],opportunities:[],mainRisks:[],watchPoints:[],actionPlan:{priority:'观察',unheld:'观察',held:'观察'},historyComparison:[]},tacticalView:{},strategicView:{},thesis:'观察',etfImplications:[],scenarios:{},counterEvidence:[],risks:[],watchlist:[],thesisAssessments:[{hypothesisId:'orders',stance:'维持观察',rationale:'等待现金流',technicalConflict:'技术信号偏弱',actionConditions:['季报确认现金流'],alternativeToTracing:'等待验证优于立即交易'}],factChecks:[{bad:true}]}
    const normalized=normalizeInvestmentSynthesisResponse(JSON.stringify(report),parsed.hypotheses)
    expect(JSON.parse(normalized.text).thesisAssessments[0].alternativeToTrading).toBe('等待验证优于立即交易')
    expect(JSON.parse(normalized.text).factChecks).toBeUndefined()
    expect(normalized.corrections).toHaveLength(2)
  })
  it('does not fabricate actionable theses when both model phases time out',async()=>{
    const snapshot=fixture(),evaluation=evaluateResearch(snapshot)
    evaluation.decisions.forEach(item=>item.state='risk-off')
    vi.mocked(runAnalysisPrompt).mockRejectedValue(new Error('timeout'))
    const artifacts=new Map<string,unknown>([['research-snapshot',snapshot],['research-evaluation',evaluation]])
    const context={runId:'test',stepId:'investment-advice',artifacts,input:{},updateProgress:vi.fn(),saveArtifact:vi.fn(async(key:string,value:unknown)=>{artifacts.set(key,value)})} as StepContext
    await investmentAdviceStep.execute(context)
    expect(artifacts.get('investment-hypotheses-status')).toMatchObject({status:'unavailable'})
    expect(artifacts.get('investment-theses')).toEqual([])
    const advice=JSON.parse(String(artifacts.get('investment-advice')))
    expect(advice.investmentTheses).toEqual([])
    expect(advice.executiveSummary.actionPlan.held).not.toContain('降低')
    expect(advice.executiveSummary.conclusion).toContain('不能据此自动生成操作')
  })

})


it('rejects empty successful output and preserves explicit insufficiency without a rating',async()=>{
  const scope={productTickers:['159995'],evidenceIds:['event-one']}
  expect(()=>parseHypothesisResponse('{"hypotheses":[]}',scope)).toThrow('未形成研究')
  expect(()=>parseHypothesisResponse('{"hypotheses":[],"rating":"积极"}',scope)).toThrow('未形成研究')
  const insufficient={hypotheses:[],insufficient:{reason:'缺少订单回款与可核验的盈利预期比较，不能形成可证伪假设'}}
  const snapshot=fixture(),evaluation=evaluateResearch(snapshot)
  vi.mocked(runAnalysisPrompt).mockReset().mockResolvedValueOnce({content:[{type:'text',text:JSON.stringify(insufficient)}]} as never)
  const artifacts=new Map<string,unknown>([['research-snapshot',snapshot],['research-evaluation',evaluation]])
  const ctx={runId:'test',stepId:'test',input:{},artifacts,updateProgress:vi.fn(),saveArtifact:vi.fn(async(key:string,value:unknown)=>{artifacts.set(key,value)})} as StepContext
  await investmentAdviceStep.execute(ctx)
  expect(runAnalysisPrompt).toHaveBeenCalledOnce()
  expect(artifacts.get('investment-hypotheses-status')).toMatchObject({status:'unavailable',reason:insufficient.insufficient.reason})
  expect(artifacts.get('investment-advice-ai-status')).toMatchObject({status:'unavailable'})
  expect(JSON.parse(String(artifacts.get('investment-advice')))).toMatchObject({rating:'未形成模型评级',investmentTheses:[]})
})


describe('same-input rejected hypothesis recovery',()=>{
  const setup=()=>{
    const snapshot=fixture()
    const artifacts=new Map<string,unknown>([['research-snapshot',snapshot],['research-evaluation',evaluateResearch(snapshot)]])
    const context={runId:'resume',stepId:'advice',input:{},artifacts,updateProgress:vi.fn(),saveArtifact:vi.fn(async(key:string,value:unknown)=>{artifacts.set(key,value)})} as StepContext
    const input=independentHypothesisInput(context)
    const response={content:[{type:'text',text:JSON.stringify({hypotheses:[{id:'orders',title:'订单兑现',productTickers:['159995'],evidenceIds:[],statements:[{kind:'推断',text:'订单需要回款验证',evidenceIds:['event-one']}],firstDisclosedAt:null,informationStatus:'待核验',informationDelta:'新增信息待核验',pricingStatus:'待核验',pricingEvidenceIds:[],horizonDays:120,verification:{date:null,event:'下一期财报',metric:'经营现金流'},counterEvidence:['订单尚未兑现现金流'],invalidation:'订单取消',expectedReturnPct:null,probability:null,pressureAssumptions:[]}]})}]}
    artifacts.set('investment-advice-hypotheses-ai-request-attempt-1',{messages:[{role:'user',content:'原任务\n冻结证据：'+JSON.stringify(input)}]})
    artifacts.set('investment-advice-hypotheses-ai-response-attempt-1',response)
    artifacts.set('investment-advice-hypotheses-ai-error-attempt-1',{message:'旧父子引用校验拒绝'})
    return {context,input,artifacts,response}
  }
  it('recovers valid rejected raw output without modifying historical attempts or paying for hypothesis regeneration',async()=>{
    const {context,artifacts}=setup()
    const before=JSON.stringify([...artifacts].filter(([key])=>key.includes('-attempt-')))
    vi.mocked(runAnalysisPrompt).mockReset().mockRejectedValueOnce(new Error('timeout')) // synthesis only
    await investmentAdviceStep.execute(context)
    expect(runAnalysisPrompt).toHaveBeenCalledOnce()
    expect(vi.mocked(runAnalysisPrompt).mock.calls[0][1].messages[0].content).toContain('independentHypotheses')
    expect(artifacts.get('investment-hypotheses-status')).toMatchObject({status:'completed',origin:'recovered-response',count:1})
    expect(artifacts.get('hypotheses-recovery')).toEqual({sourceArtifact:'investment-advice-hypotheses-ai-response-attempt-1',asOf:'2026-09-04T09:00:00.000Z',reason:'修复校验后恢复原模型输出'})
    expect(JSON.stringify([...artifacts].filter(([key])=>key.includes('-attempt-')))).toBe(before)
  })
  it.each(['asOf','registry','facts','other-stage','still-invalid'])('does not reuse %s mismatches',async(mode)=>{
    const {context,input,artifacts}=setup()
    const original=JSON.parse(JSON.stringify(input))
    if(mode==='asOf')original.asOf='2026-09-05'
    if(mode==='registry')original.citationRegistry=[]
    if(mode==='facts')original.products[0].valuation.pe=999
    artifacts.set('investment-advice-hypotheses-ai-request-attempt-1',{messages:[{role:'user',content:'原任务\n冻结证据：'+JSON.stringify(original)}]})
    if(mode==='other-stage'){
      artifacts.set('investment-advice-synthesis-ai-response-attempt-1',artifacts.get('investment-advice-hypotheses-ai-response-attempt-1'))
      artifacts.delete('investment-advice-hypotheses-ai-response-attempt-1')
    }
    if(mode==='still-invalid')artifacts.set('investment-advice-hypotheses-ai-response-attempt-1',{content:[{type:'text',text:'{"hypotheses":[]}' }]})
    expect(await recoverStoredHypotheses(context,input)).toBeNull()
    expect(artifacts.has('hypotheses-recovery')).toBe(false)
  })
})
