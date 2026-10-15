import { beforeEach, describe, expect, it, vi } from 'vitest'
const { prompt, db } = vi.hoisted(() => ({ prompt: vi.fn(), db: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() } }))
vi.mock('@/lib/workflow/analysis-prompt', () => ({ runAnalysisPrompt: prompt, recoverableAnalysisError: (error:unknown) => /aborted|timed out|timeout/i.test(error instanceof Error ? error.message : String(error)) }))
vi.mock('@/lib/db', () => ({ prisma: { aIAnalysisReport: db, executionRun:{findUnique:vi.fn(async()=>null)} } }))
import { socialReportStep } from '../workflow/steps/social-report-step'
import { industryOverviewStep } from '../workflow/steps/industry-overview-step'
import { marketAnalysisStep } from '../workflow/steps/market-analysis-step'
import { newsAnalysisStep } from '../workflow/steps/news-analysis-step'
import { companyAnalysisStep } from '../workflow/steps/company-analysis-step'
import { generateReportStep } from '../workflow/steps/generate-report-step'
import { normalizeSocialReport, parseSocialReport, REPORT_SECTIONS } from '../analysis/social-report'
import type { StepContext } from '../workflow/types'
import type { Evaluation } from '../research/contracts'
import type { SocialReport } from '../analysis/social-report'

const valid = { version: 2, title: '产业观察', subtitle: '来源与日期待核验', takeaways: ['需求','盈利','风险'], sections: REPORT_SECTIONS.map(title => ({title,body:'有依据的分析'})), risks: ['风险一','风险二','风险三'] }
const response = (value: unknown) => ({ content: [{type:'text',text:JSON.stringify(value)}] })
function context(): StepContext {
  const decision={ticker:'159001',name:'测试ETF',indexCode:'IDX',state:'watch',metrics:{date:'2026-09-04',amount20:100},conditions:[],evidenceIds:['market-evidence']}
  const company={stockCode:'600001',stockName:'公司甲',stage:'中游',segment:'服务器',financials:[{evidenceId:'financial-evidence',reportType:'income',period:'2026-06-30',publishDate:'2026-08-01',source:'公司财报',currency:'CNY',metrics:[]}],announcements:[]}
  const artifacts = new Map<string, any>([['industry-info', {id:'industry',name:'AI硬件'}], ['market-analysis',JSON.stringify({analysis:'完整市场证据',evidence:[{source:'交易所',date:'2026-09-04'}]})], ['portfolio-analysis','PRIVATE'], ['etf-actions',[]],['data-quality',{status:'available',modules:{}}],['research-preflight',{status:'fresh',completed:0,partial:0,failed:0}],['research-evaluation',{decisions:[decision],events:[],evidence:[],modules:{},profile:{name:'AI硬件',horizonDays:20,rules:{}},indexBreadth:{mappedIndices:1,usableIndices:1,aboveMA20:0,coverage:1},products:[]}],['etf-market-data',[{ticker:'159001',name:'测试ETF',dataDate:'2026-09-04',source:'交易所',evidenceIds:['market-evidence']}]],['company-market-data',[company]]])
  return {runId:'run',stepId:'step',input:{},artifacts,saveArtifact:vi.fn(async (key,data) => { artifacts.set(key,data) }),updateProgress:vi.fn()}
}
beforeEach(() => { vi.clearAllMocks(); prompt.mockReset(); db.findFirst.mockResolvedValue(null); db.create.mockResolvedValue({id:'saved'}); db.update.mockResolvedValue({id:'saved'}) })
describe('report recovery', () => {
  it('archives independent domain research separately and makes it the report lead', async () => {
    const ctx=context()
    const domain={version:1,status:'completed',snapshotId:'s1',asOf:'2026-09-04T08:00:00Z',generatedAt:'2026-09-04T09:00:00Z',inputHash:'hash',promptVersion:'1',opinion:{conclusion:'独立领域判断：产业需求增长但等待价格确认'}}
    ctx.artifacts.set('domain-research',domain)
    ctx.artifacts.set('investment-advice',{executiveSummary:{conclusion:'原分步基线结论'},recommendation:{held:'观望'}})
    await generateReportStep.execute(ctx)
    const saved=db.create.mock.calls[0][0].data,structured=JSON.parse(saved.dataJson)
    expect(saved.summary).toContain(domain.opinion.conclusion)
    expect(structured.domainResearch).toEqual(domain)
    expect(structured.investmentAdvice.executiveSummary.conclusion).toBe('原分步基线结论')
    expect(structured.domainComparison.performanceWinner).toBeNull()
  })
  it('uses the configured Opus model for market research and the fast model for company research',async()=>{
    prompt.mockResolvedValueOnce(response({analysis:'市场判断',dimensions:[],dataBoundary:'边界',score:null,trend:'震荡',risk_level:'中',evidence:[],counterEvidence:[],watchlist:[]}))
      .mockResolvedValueOnce(response({analysis:'企业判断',key_companies:[],chain_structure:[],evidence:[],counterEvidence:[],watchlist:[]}))
    const ctx=context()
    await marketAnalysisStep.execute(ctx)
    await companyAnalysisStep.execute(ctx)
    expect(prompt.mock.calls[0][1]).toMatchObject({model:process.env.CLAUDE_MODEL||'claude-opus-5'})
    expect(prompt.mock.calls[1][1]).toMatchObject({model:process.env.CLAUDE_FAST_MODEL||process.env.CLAUDE_MODEL||'claude-opus-5'})
  })
  it('fails closed when an AI viewpoint cannot be generated',async()=>{
    prompt.mockRejectedValue(new Error('Request was aborted.'))
    const ctx=context()
    const event={id:'event-1',title:'算力项目进展',category:'technology',publishedAt:'2026-09-07T08:00:00Z',expiresAt:'2026-09-10T08:00:00Z',companies:['公司甲'],segments:['服务器'],evidenceIds:['event-evidence'],sources:['公司公告'],urls:['https://example.com'],excerpt:'项目进展材料',status:'evidence',priority:5,verification:'source-linked-not-independently-verified'}
    ctx.artifacts.set('research-evaluation',{...ctx.artifacts.get('research-evaluation'),events:[event]})
    ctx.artifacts.set('etf-market-data',[{ticker:'159001',name:'测试ETF',date:'2026-09-07',source:'交易所',evidenceIds:['market-evidence']}])
    ctx.artifacts.set('company-market-data',[{stockCode:'600001',stockName:'公司甲',stage:'中游',segment:'服务器',financials:[{evidenceId:'financial-evidence',reportType:'income',period:'2026-06-30',publishDate:'2026-08-01',source:'公司财报',currency:'CNY',metrics:[]}],announcements:[]}])
    await expect(marketAnalysisStep.execute(ctx)).rejects.toThrow('aborted')
    await expect(newsAnalysisStep.execute(ctx)).rejects.toThrow('aborted')
    await expect(companyAnalysisStep.execute(ctx)).rejects.toThrow('aborted')
    expect(ctx.artifacts.get('market-analysis-ai-status')).toMatchObject({status:'failed'})
    expect(ctx.artifacts.get('news-analysis-ai-status')).toMatchObject({status:'failed'})
    expect(ctx.artifacts.get('company-analysis-ai-status')).toMatchObject({status:'failed'})
    expect(ctx.artifacts.has('news-analysis')).toBe(false)
  })
  it('does not replace an AI industry overview with deterministic prose after timeout',async()=>{
    prompt.mockRejectedValue(new Error('Request timed out.'))
    const ctx=context()
    ctx.artifacts.set('graph-context',{revisionId:'r1',version:1,contentHash:'h1',mappingRevisionId:'m1',mappingContentHash:'mh1',industry:{id:'i',code:'ai',name:'AI'},coverage:{},stages:[{name:'上游',segments:[{name:'芯片',companies:[],etfs:[],indices:[]}]}],relations:[],etfExposure:[],eventMappings:[]})
    ctx.artifacts.set('news-analysis',{analysis:'事件结论',catalysts:[],evidence:[],counterEvidence:[],watchlist:[]})
    ctx.artifacts.set('company-analysis',{analysis:'企业结论',key_companies:[],evidence:[],counterEvidence:[],watchlist:[]})
    await expect(industryOverviewStep.execute(ctx)).rejects.toThrow('timed out')
    expect(ctx.artifacts.get('industry-overview-ai-status')).toMatchObject({status:'failed'})
    expect(ctx.artifacts.has('industry-overview')).toBe(false)
  })
  it('reports exact overflow paths and lengths, invalid JSON and section order', () => {
    expect(() => parseSocialReport(JSON.stringify({...valid,title:'字'.repeat(21)}))).toThrow('title：实际21字，最多20字')
    expect(() => parseSocialReport(JSON.stringify({...valid,sections:[...valid.sections].reverse()}))).toThrow('sections[0].title')
    expect(() => parseSocialReport('null')).toThrow('JSON对象')
    expect(() => parseSocialReport('{')).toThrow('有效JSON')
  })
  it('keeps valid legacy v1 reports readable', () => {
    expect(parseSocialReport(JSON.stringify({...valid,version:undefined})).title).toBe(valid.title)
  })
  it('repairs archived social valuation counts and resolvable company sources',()=>{
    const archived={...valid,takeaways:['战术：7只风险收缩，0只满足实验条件。','盈利','估值：18只产品有底层数据，仍为观察级。'],sections:valid.sections.map((section,index)=>index===1?{...section,body:'【来源待核验】澜起科技：现金流改善。'}:index===3?{...section,body:'覆盖18只A股ETF、11个跟踪指数；同指数产品按数据质量比较。'}:section)}
    const normalized=normalizeSocialReport(archived as SocialReport,{decisions:[{state:'risk-off'},{state:'eligible'}],indexBreadth:{mappedIndices:1},products:[{ticker:'A',indexCode:'IDX',feePct:null,navDate:null,shareChangePct:null,trackingErrorPct:null,pe:20,valuationSampleCount:1,exposure:[],alternatives:[]}]} as unknown as Evaluation,JSON.stringify({evidence:[{claim:'澜起科技现金流改善',source:'公司公告',date:'2026-09-03'}]}))
    expect(normalized.takeaways[2]).toContain('1个指数有可核验当期值')
    expect(normalized.takeaways[0]).toBe('战术：1只风险收缩，1只满足实验条件。')
    expect(normalized.sections[3].body).toContain('覆盖2只A股指数基金、1个跟踪指数')
    expect(normalized.sections[1].body).toContain('2026-09-03｜公司公告')
  })
  it('builds the one-page report deterministically without another AI call', async () => {
    prompt.mockResolvedValueOnce(response({...valid,subtitle:'字'.repeat(81)})).mockResolvedValueOnce(response(valid))
    const ctx = context()
    await socialReportStep.execute(ctx)
    expect(prompt).not.toHaveBeenCalled()
    const attempts = [...ctx.artifacts.entries()].filter(([key]) => key.startsWith('social-report-attempt-')).map(([,value]) => value)
    expect(attempts).toHaveLength(0)
    expect(ctx.artifacts.get('social-report-status').status).toBe('ready')
    expect(ctx.artifacts.get('social-report-status').compacted).toBe(true)
  })
  it('uses company evidence sources and counts valuation once per index',async()=>{
    const ctx=context()
    ctx.artifacts.set('company-analysis',JSON.stringify({key_companies:[{name:'澜起科技',code:'688008',fact:'经营现金流改善。'}],evidence:[{claim:'澜起科技经营现金流改善。',source:'公司公告',date:'2026-09-03'}]}))
    ctx.artifacts.set('research-evaluation',{decisions:[],indexBreadth:{mappedIndices:1},products:[
      {ticker:'A',indexCode:'IDX',pe:20,valuationSampleCount:1},
      {ticker:'B',indexCode:'IDX',pe:20,valuationSampleCount:1},
    ]})
    await socialReportStep.execute(ctx)
    const report=ctx.artifacts.get('social-report')
    expect(report.sections[1].body).toContain('2026-09-03｜公司公告')
    expect(report.takeaways[2]).toContain('1个指数有可核验当期值')
    expect(report.takeaways[2]).not.toContain('来源待核验')
  })
  it('saves full research when optional source analyses are sparse', async () => {
    prompt.mockResolvedValue(response({...valid,takeaways:[]}))
    const ctx = context()
    ctx.artifacts.set('social-report', valid) // stale output must not survive a failed replacement
    await socialReportStep.execute(ctx)
    expect(prompt).not.toHaveBeenCalled()
    expect(ctx.artifacts.get('social-report')).toBeTruthy()
    expect(ctx.artifacts.get('social-report-status').status).toBe('ready')
    await generateReportStep.execute(ctx)
    const saved = db.create.mock.calls[0][0].data
    expect(saved.content).toContain('完整市场证据')
    expect(saved.content).toContain('ETF投资建议')
    expect(saved.content).not.toContain('PRIVATE')
    expect(JSON.parse(saved.dataJson).privatePortfolioAnalysis).toBe('PRIVATE')
    expect(ctx.artifacts.get('report-id')).toBe('saved')
  })
  it('does not depend on an extra editor call and reuses an already saved report on resume', async () => {
    prompt.mockRejectedValue(new Error('AI连接失败'))
    const ctx = context()
    await socialReportStep.execute(ctx)
    db.findFirst.mockResolvedValue({id:'saved'})
    await generateReportStep.execute(ctx)
    expect(db.update).toHaveBeenCalledOnce()
    expect(db.create).not.toHaveBeenCalled()
  })
  it('archives graph end-to-end checks as verification reports',async()=>{
    const ctx=context();ctx.input={verificationMode:'graph-e2e'}
    await generateReportStep.execute(ctx)
    expect(db.create.mock.calls[0][0].data).toMatchObject({type:'verification'})
    expect(db.create.mock.calls[0][0].data.title).toContain('图谱链路验证')
  })
  it('inherits the nearest full-analysis narrative and stores an explicit review delta', async () => {
    const ctx=context()
    ctx.input={rulesOnly:true,parentRunId:'review-parent'}
    const evaluation={decisions:[],products:[],events:[],evidence:[],indexBreadth:{mappedIndices:0,usableIndices:0,aboveMA20:0,coverage:0}} as unknown as Evaluation
    ctx.artifacts.set('research-evaluation',evaluation)
    ctx.artifacts.set('data-quality',{status:'limited'})
    const parent={id:'parent-report',createdAt:new Date('2026-09-05T12:00:00Z'),dataJson:JSON.stringify({researchEvaluation:evaluation,metadata:{runId:'review-parent',parentRunId:'full-run',kind:'review'}})}
    const full={id:'full-report',createdAt:new Date('2026-09-05T09:00:00Z'),dataJson:JSON.stringify({socialReport:valid,marketAnalysis:{analysis:'继承市场正文'},industryAnalysis:{analysis:'继承行业正文'},companyAnalysis:{analysis:'继承企业正文'},sentimentAnalysis:{analysis:'继承资讯正文'},investmentAdvice:{analysis:'继承投资正文'},metadata:{runId:'full-run',parentRunId:null,kind:'analysis'}})}
    db.findFirst.mockResolvedValueOnce(parent).mockResolvedValueOnce(full).mockResolvedValueOnce(null)
    await generateReportStep.execute(ctx)
    const saved=db.create.mock.calls[0][0].data,structured=JSON.parse(saved.dataJson)
    expect(saved.content).toContain('继承市场正文')
    expect(saved.summary).toContain('本次复核未发现实质变化')
    expect(structured.inheritedFromReportId).toBe('full-report')
    expect(structured.reviewDelta).toMatchObject({status:'unchanged',baselineReportId:'parent-report'})
    expect(structured.reportQuality).toHaveProperty('overallScore')
  })
})
