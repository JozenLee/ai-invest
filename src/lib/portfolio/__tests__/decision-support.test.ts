import { describe, expect, it } from 'vitest'
import { applyDecisionTimingGate, buildPortfolioDecisionSupport, resolveHoldingMapping, type RiskBudget } from '../decision-support'
import { assessDecisionTiming } from '@/lib/analysis/decision-timing'
import type { Decision, Evaluation } from '@/lib/research/contracts'

const decision = (ticker: string, state: Decision['state']): Decision => ({
  ticker, name: '芯片指数基金华夏', indexCode: '980017.SZ', state, unheldAction: '观望', heldAction: '观望', reason: '规则状态', trigger: '连续三日确认', invalidation: '跌破均线', horizon: '20日', evidence: [], conditions: [], gaps: [], evidenceIds: [], expiresAt: '2026-09-07', researchOnly: true,
  metrics: { date: '2026-09-04', ma20: 1, ma60: 1, return20Pct: -2, relative20Pct: -1, volatilityPct: 20, premiumPct: 0, amount20: 1e8, flowSum: -1, flowNetPct: -2, flowDays: 5, adjusted: true, trackingErrorPct: 1, disclosedWeightPct: 80 },
})
const evaluation = (state: Decision['state'] = 'risk-off') => ({ version: 1, snapshotId: 's', asOf: '2026-09-05T09:00:00.000Z', profile: { version: 1, industryId: 'ai', name: '人工智能算力硬件', benchmark: '000300.SH', horizonDays: 20, sectors: [], segments: [], leaders: [], rules: { minHistory: 60, maxPremiumPct: 1, minDailyAmount: 2e7, maxSpreadBps: 20, maxVolatilityPct: 50, flowDays: 5, entryConfirmDays: 3 } }, expectedSession: '2026-09-04', calendarVerified: true, validation: 'experimental-not-backtest-validated', decisions: [decision('159995', state)], indexBreadth: { mappedIndices: 1, usableIndices: 1, aboveMA20: 0, coverage: 1 }, modules: {}, events: [], changes: [], previousSnapshotId: null, evidence: [] }) as Evaluation
const policy: RiskBudget = { riskProfile: 'moderate', investHorizon: 'medium', minCashRatio: .1, maxIndustryRatio: .2, maxFundRatio: .15, maxSingleAdjustmentRatio: .05, stagedAdjustment: true }
const aiAdvice=(rows:Array<{ticker:string;heldAction:'加仓'|'持有'|'减仓'|'观望';unheldAction?:'建仓'|'观望';pct?:number}>)=>({
  rating:'中性',executiveSummary:{conclusion:'AI综合市场、企业与事件证据形成投资判断',allocationStance:'在风险预算内执行AI逐产品决策'},recommendation:{reason:'以逐产品决策为准'},
  productDecisions:rows.map(row=>({ticker:row.ticker,unheldAction:row.unheldAction??(row.heldAction==='加仓'?'建仓':'观望'),heldAction:row.heldAction,suggestedAdjustmentPct:row.pct??(row.heldAction==='加仓'||row.heldAction==='减仓'?5:0),confidencePct:72,reason:`AI建议${row.heldAction}`,trigger:'市场、企业与事件证据继续确认',invalidation:'核心证据反转',evidenceIds:['e-1']})),
})

describe('portfolio decision support', () => {
  it('prefers explicit feeder mapping over name inference', () => {
    const mapping = resolveHoldingMapping({ ticker: '017470', name: '嘉实芯片ETF联接C', targetEtfCode: '159995', targetIndexCode: '980017.SZ', weightPct: 10, marketValue: 10000 }, evaluation())
    expect(mapping).toMatchObject({ method: 'manual', decisionTicker: '159995', verified: true })
  })

  it('keeps broad sector-name matches as proxies instead of inventing an ETF identity', () => {
    const mapping = resolveHoldingMapping({ ticker: '017470', name: '嘉实上证科创板芯片ETF发起联接C', industry: '人工智能算力硬件',industryMatchSource:'ai',industryMatchConfidence:.86, weightPct: 10, marketValue: 10000 }, evaluation())
    expect(mapping).toMatchObject({ method: 'domain-proxy', targetEtfCode: null, decisionTicker: null, fundType: 'feeder',domainVerified:true,scope:'domain' })
  })

  it('accepts exact official identities for feeder and active-sector risk controls',()=>{
    expect(resolveHoldingMapping({ticker:'017470',name:'嘉实芯片ETF联接C',industry:'人工智能算力硬件',industryMatchConfidence:.95,fundType:'feeder',targetEtfCode:'588200',targetIndexCode:'000685.SH',mappingSource:'official-document',mappingConfidence:1,weightPct:10,marketValue:10000},evaluation())).toMatchObject({method:'official-document',verified:true,scope:'product'})
    expect(resolveHoldingMapping({ticker:'026633',name:'平安半导体领航精选混合C',industry:'人工智能算力硬件',industryMatchConfidence:.91,fundType:'active',mappingSource:'official-document',mappingConfidence:1,weightPct:5,marketValue:5000},evaluation())).toMatchObject({method:'official-domain',verified:true,scope:'domain'})
  })

  it('turns a researched active fund into a fund-level AI action without inventing an ETF',()=>{
    const support=buildPortfolioDecisionSupport({evaluation:evaluation(),totalAssets:100000,cashWeightPct:20,policy,dataQualityAvailable:true,portfolioAsOf:new Date().toISOString(),investmentAdvice:aiAdvice([{ticker:'159995',heldAction:'持有'}]),holdings:[{ticker:'026633',name:'平安半导体领航精选混合C',industry:'人工智能算力硬件',industryMatchConfidence:.92,fundType:'active',researchReady:true,researchEvidenceIds:['fund-nav','fund-holdings'],redemptionFeePct:1,weightPct:5,marketValue:5000}]})
    expect(support.productMappingCoveragePct).toBe(100)
    expect(support.actions[0]).toMatchObject({ticker:'026633',action:'持有',targetWeightPct:5,mapping:{method:'research-fund',scope:'fund',verified:true},aiDecision:{ticker:'026633'}})
  })

  it('separates verified domain allocation from product-level execution mapping',()=>{
    const support=buildPortfolioDecisionSupport({evaluation:evaluation(),totalAssets:100000,cashWeightPct:10,policy,dataQualityAvailable:true,portfolioAsOf:new Date().toISOString(),holdings:[{ticker:'017470',name:'嘉实上证科创板芯片ETF发起联接C',industry:'人工智能算力硬件',industryMatchConfidence:.86,weightPct:10,marketValue:10000}]})
    expect(support).toMatchObject({domainMappingCoveragePct:100,productMappingCoveragePct:0})
    expect(support.gates.find(item=>item.key==='domain-mapping')).toMatchObject({met:true})
    expect(support.gates.find(item=>item.key==='mapping')).toMatchObject({met:false})
    expect(support.actions[0].reason).toContain('产业领域归属已核验')
  })

  it('applies an AI reduction inside portfolio and daily adjustment limits', () => {
    const support = buildPortfolioDecisionSupport({ evaluation: evaluation(), totalAssets: 100000, cashWeightPct: 3, policy, dataQualityAvailable: true, portfolioAsOf: new Date().toISOString(), investmentAdvice:aiAdvice([{ticker:'159995',heldAction:'减仓'}]), holdings: [
      { ticker: '017470', name: '嘉实芯片ETF联接C', industry: 'AI算力硬件', targetEtfCode: '159995', targetIndexCode: '980017.SZ', mappingConfidence: 1, redemptionFeePct: .5, costNav: 1, unitNav: 2, weightPct: 19, marketValue: 19000 },
    ] })
    expect(support.targetIndustryRangePct).toEqual([0, 20])
    expect(support.proposedIndustryWeightPct).toBe(14)
    expect(support.proposedCashWeightPct).toBe(8)
    expect(support.actions[0]).toMatchObject({ action: '减仓', amount: 5000, executable: false })
    expect(support.gates.find(item => item.key === 'validation')).toBeUndefined()
    expect(support.readiness).toBe('limited-advice')
    expect(support.adjustmentPlan).toMatchObject({ completed: false, remainingCashGapPct: 2 })
    expect(support.adjustmentPlan.steps.some(item=>item.label==='组合级现金底仓修复')).toBe(true)
  })

  it('only marks AI actions executable after portfolio gates pass', () => {
    const support = buildPortfolioDecisionSupport({ evaluation: evaluation(), totalAssets: 100000, cashWeightPct: 10, policy, dataQualityAvailable: true, portfolioAsOf: new Date().toISOString(), investmentAdvice:aiAdvice([{ticker:'159995',heldAction:'减仓'}]), holdings: [
      { ticker: '017470', name: '嘉实芯片ETF联接C', targetEtfCode: '159995', targetIndexCode: '980017.SZ', mappingConfidence: 1, redemptionFeePct: 0, costNav: 1, unitNav: 2, weightPct: 19, marketValue: 19000 },
    ] })
    expect(support.readiness).toBe('advice-ready')
    expect(support.actions[0].action).toBe('减仓')
    expect(support.adjustmentPlan.completed).toBe(true)
  })

  it('keeps the portfolio business date for disclosure without using it as an execution gate',()=>{
    const support=buildPortfolioDecisionSupport({evaluation:evaluation(),totalAssets:100000,cashWeightPct:10,policy,dataQualityAvailable:true,portfolioAsOf:'2026-09-01T00:00:00.000Z',portfolioSyncedAt:new Date().toISOString(),investmentAdvice:aiAdvice([{ticker:'159995',heldAction:'持有'}]),holdings:[
      {ticker:'017470',name:'嘉实芯片ETF联接C',targetEtfCode:'159995',targetIndexCode:'980017.SZ',mappingConfidence:1,redemptionFeePct:0,costNav:1,unitNav:2,weightPct:10,marketValue:10000},
    ]})
    expect(support.asOf).toBe('2026-09-01T00:00:00.000Z')
    expect(support.gates.find(item=>item.key==='portfolio-freshness')).toBeUndefined()
    expect(support.readiness).toBe('advice-ready')
    expect(support.actions[0]).toMatchObject({action:'持有',executable:true,targetWeightPct:10})
  })

  it('retains stale-account restrictions when reading archived reports',()=>{
    const current=buildPortfolioDecisionSupport({evaluation:evaluation(),totalAssets:100000,cashWeightPct:10,policy,dataQualityAvailable:true,portfolioAsOf:'2026-09-01T00:00:00.000Z',investmentAdvice:aiAdvice([{ticker:'159995',heldAction:'持有'}]),holdings:[
      {ticker:'017470',name:'嘉实芯片ETF联接C',targetEtfCode:'159995',targetIndexCode:'980017.SZ',mappingConfidence:1,redemptionFeePct:0,costNav:1,unitNav:2,weightPct:10,marketValue:10000},
    ]})
    const archived={...current,readiness:'limited-advice' as const,confidencePct:current.confidencePct-10,gates:[...current.gates,{key:'portfolio-freshness',label:'持仓时效',met:false,detail:'业务日期过期'}],actions:current.actions.map(action=>({...action,executable:false})),adjustmentPlan:{...current.adjustmentPlan,steps:current.adjustmentPlan.steps.map(step=>({...step,executable:false}))}}
    const timing=assessDecisionTiming({asOf:'2026-09-05T09:00:00.000Z',calendar:[{date:'2026-09-05',open:false}],expectedTickers:['159995'],quotes:[]})
    const normalized=applyDecisionTimingGate(archived,timing)!
    expect(normalized.gates.find(item=>item.key==='portfolio-freshness')?.met).toBe(false)
    expect(normalized.actions[0].executable).toBe(false)
    expect(normalized.readiness).toBe('limited-advice')
    expect(normalized.actions[0].amount).toBeNull()
    expect(normalized.adjustmentPlan.steps[0].executable).toBe(false)
  })

  it('does not manufacture a rule action when AI says hold', () => {
    const support = buildPortfolioDecisionSupport({ evaluation: evaluation('eligible'), totalAssets: 100000, cashWeightPct: 20, policy, dataQualityAvailable: true, portfolioAsOf: new Date().toISOString(), investmentAdvice:aiAdvice([{ticker:'159995',heldAction:'观望'}]), holdings: [
      { ticker: '017470', name: '嘉实芯片ETF联接C', targetEtfCode: '159995', targetIndexCode: '980017.SZ', mappingConfidence: 1, redemptionFeePct: 0, costNav: 1, unitNav: 2, weightPct: 5, marketValue: 5000 },
    ] })
    expect(support.proposedIndustryWeightPct).toBe(5)
    expect(support.actions[0]).toMatchObject({ action: '观望', amount: null })
    expect(support.gates.find(item => item.key === 'ai-decision')).toMatchObject({ met: true })
    expect(support.researchConclusion?.appliedToAllocation).toContain('AI逐产品决策决定投资方向')
  })

  it('can add exposure when AI decides to add even if the quantitative state is risk-off', () => {
    const ev = evaluation('risk-off')
    ev.products = [{ ticker: '159995', indexCode: '980017.SZ', feePct: .5, navDate: ev.expectedSession, nav: 2, navStatus: 'available', shareChangePct: 1, trackingErrorPct: 1, exposure: [], alternatives: [] }]
    const support = buildPortfolioDecisionSupport({ evaluation: ev, totalAssets: 100000, cashWeightPct: 20, policy, dataQualityAvailable: true, portfolioAsOf: new Date().toISOString(), investmentAdvice:aiAdvice([{ticker:'159995',heldAction:'加仓'}]), holdings: [
      { ticker: '017470', name: '嘉实芯片ETF联接C', targetEtfCode: '159995', targetIndexCode: '980017.SZ', mappingConfidence: 1, redemptionFeePct: 0, costNav: 1, unitNav: 2, weightPct: 5, marketValue: 5000 },
    ] })
    expect(support.proposedIndustryWeightPct).toBe(10)
    expect(support.proposedCashWeightPct).toBe(15)
    expect(support.actions[0]).toMatchObject({ action: '加仓', amount: 5000, targetWeightPct: 10 })
    expect(support.gates.find(item => item.key === 'ai-decision')).toMatchObject({ met: true })
    expect(support.allocationBasis).toContain('滚动回测样本数量不参与')
  })

  it('caps a larger AI suggestion at the configured daily adjustment ratio',()=>{
    const ev=evaluation('watch')
    ev.products=[{ticker:'159995',indexCode:'980017.SZ',feePct:.5,navDate:ev.expectedSession,nav:2,navStatus:'available',shareChangePct:1,trackingErrorPct:1,exposure:[],alternatives:[]}]
    const support=buildPortfolioDecisionSupport({evaluation:ev,totalAssets:100000,cashWeightPct:30,policy,dataQualityAvailable:true,portfolioAsOf:new Date().toISOString(),investmentAdvice:aiAdvice([{ticker:'159995',heldAction:'加仓',pct:12}]),holdings:[{ticker:'017470',name:'嘉实芯片ETF联接C',targetEtfCode:'159995',targetIndexCode:'980017.SZ',mappingConfidence:1,redemptionFeePct:0,costNav:1,unitNav:2,weightPct:5,marketValue:5000}]})
    expect(support.actions[0]).toMatchObject({action:'加仓',changeWeightPct:5,amount:5000})
    expect(support.actions[0].constraintNotes?.join('')).toContain('每日最大调整比例')
  })
})

it('withholds exact amounts for proxy holdings while retaining the domain budget',()=>{
  const support=buildPortfolioDecisionSupport({evaluation:evaluation(),totalAssets:100000,cashWeightPct:3,policy,dataQualityAvailable:true,portfolioAsOf:new Date().toISOString(),holdings:[{ticker:'017470',name:'上证科创芯片联接',industry:'人工智能算力硬件',weightPct:19,marketValue:19000}]})
  expect(support.targetIndustryRangePct).toEqual([0,20])
  expect(support.proposedIndustryWeightPct).toBe(19)
  expect(support.actions[0]).toMatchObject({action:'补充数据',amount:null,targetWeightPct:null,executable:false})
})
it('allocates the AI-requested reduction without using the quantitative state as the action',()=>{
  const ev=evaluation();ev.decisions.push(decision('159801','risk-off'))
  const support=buildPortfolioDecisionSupport({evaluation:ev,totalAssets:100000,cashWeightPct:10,policy,dataQualityAvailable:true,portfolioAsOf:new Date().toISOString(),investmentAdvice:aiAdvice([{ticker:'159995',heldAction:'持有'},{ticker:'159801',heldAction:'减仓',pct:4}]),holdings:[
    {ticker:'017470',name:'基金甲',targetEtfCode:'159995',weightPct:10,marketValue:10000,redemptionFeePct:1},
    {ticker:'017471',name:'基金乙',targetEtfCode:'159801',weightPct:9,marketValue:9000,redemptionFeePct:0},
  ]})
  expect(support.actions[0].amount).toBeNull()
  expect(support.actions[1].amount).toBe(4000)
})
