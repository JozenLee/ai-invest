import { describe, expect, it, vi } from 'vitest'
import { auditClaim, auditEvidenceTree } from '@/lib/analysis/evidence-references'
import { researchEvidence } from '../research-input'
import { parseResearchObject, saveValidatedResearchOutput, validateResearchResponse } from '../research-output'
import { validatePortfolioOutput } from '../steps/portfolio-analysis-step'
import { socialReportStep } from '../steps/social-report-step'
import type { StepContext } from '../types'
import type { Evidence } from '@/lib/research/contracts'

const evidence=(id:string,source='tushare',date='2026-06-30'):Evidence=>({id,source,dataDate:date,publishedAt:null,fetchedAt:'2026-09-10',hash:id})
function context(entries:Array<[string,unknown]> = []){
 const artifacts=new Map(entries)
 return {runId:'test',stepId:'test',input:{},artifacts,updateProgress:vi.fn(),saveArtifact:async(key:string,value:unknown)=>{artifacts.set(key,value)}} as StepContext
}
describe('analysis output quality',()=>{
 it('merges a report and assessment returned as separate fenced JSON objects',()=>{
  const parsed=parseResearchObject('说明\n```json\n{"rating":"谨慎"}\n```\n补充\n```json\n{"thesisAssessments":[{"hypothesisId":"a"}]}\n```')
  expect(parsed).toEqual({rating:'谨慎',thesisAssessments:[{hypothesisId:'a'}]})
 })
 it('keeps corrected dates informational and preserves multi-period ranges across repeated audits',()=>{
  const sources=[evidence('a'),evidence('b','tushare','2026-03-31')]
  const row=auditClaim({claim:'财务变化',source:'tushare',date:'2026-09-10',evidenceIds:['a','b']},sources)
  expect(row.referenceIssues).toEqual([])
  expect(row.referenceCorrections).toHaveLength(1)
  expect(auditClaim(row,sources)).toEqual(row)
  expect(JSON.parse(auditEvidenceTree(JSON.stringify({evidence:[row]}),sources) as string).evidence[0]).toEqual(row)
 })
 it('rejects shortened ambiguous IDs and references to the wrong dataset',()=>{
  const sources=[evidence('12345678:one'),evidence('12345678:two'),evidence('flow','Tushare/moneyflow_ind_dc')]
  expect(auditClaim({claim:'趋势',evidenceIds:['12345678']},sources).evidenceIds).toEqual([])
  expect(auditClaim({claim:'融资余额',source:'Tushare/margin',evidenceIds:['flow']},sources).referenceIssues?.join('')).toContain('来源不匹配')
 })
 it('binds aggregate statistics to every frozen company, including those outside representative examples',()=>{
  const companies=Array.from({length:30},(_,i)=>({stockCode:String(i),segment:'芯片',evidenceIds:['company-'+i],profitGrowthPct:i,cashConversionPct:60,financials:[]}))
  const ctx=context([['company-market-data',companies],['research-snapshot',{asOf:'2026-09-10T15:00:00Z',evidence:companies.map(c=>evidence(c.evidenceIds[0]))}]])
  const packet=researchEvidence(ctx,'company-analysis')
  const derived=ctx.artifacts.get('research-citations-company-analysis')
  expect(derived[0].inputEvidenceIds).toHaveLength(30)
  expect(packet.coverage.evidenceIds).toEqual([derived[0].id])
  expect(packet.citationRegistry.some((row:{id:string})=>row.id===derived[0].id)).toBe(true)
 })
 it('rejects aggregate claims supported only by individual examples',()=>{
  expect(auditClaim({claim:'全池利润增速中位数改善',source:'tushare',evidenceIds:['a']},[evidence('a')]).referenceIssues?.join('')).toContain('完整冻结计算记录')
 })
 it('retries invalid citations but saves date-only corrections without downgrading',async()=>{
  const ctx=context([['research-snapshot',{evidence:[evidence('a')]}]])
  const output={analysis:'观察',trend:'震荡',risk_level:'中',evidence:[{claim:'财务变化',source:'tushare',date:'2026-09-10',evidenceIds:['a']}],counterEvidence:[],watchlist:[]}
  expect(()=>validateResearchResponse(JSON.stringify(output),'market-analysis',ctx)).not.toThrow()
  await saveValidatedResearchOutput(ctx,'market-analysis',JSON.stringify(output))
  expect(ctx.artifacts.get('market-analysis-validation')).toMatchObject({status:'corrected',issues:[]})
  output.evidence[0].evidenceIds=['bad']
  expect(()=>validateResearchResponse(JSON.stringify(output),'market-analysis',ctx)).toThrow('输出校验失败')
 })
 it('accepts an explicitly unmapped representative company and normalizes product text to a list',()=>{
  const output={analysis:'企业分化',key_companies:[{code:'688981',name:'中芯国际',graphPath:'晶圆制造',selectionReason:'现金流代表',mappingConfidence:null,matchedProducts:'',operatingEvidence:'现金回收较好',counterEvidence:'资本密集'},{code:'300308',name:'中际旭创',graphPath:'光通信',selectionReason:'增长代表',mappingConfidence:.5,matchedProducts:'ETF甲;ETF乙',operatingEvidence:'盈利增长',counterEvidence:'回款待核验'}],chain_structure:[],evidence:[],counterEvidence:[],watchlist:[]}
  const result=JSON.parse(validateResearchResponse(JSON.stringify(output),'company-analysis',context()).text)
  expect(result.key_companies[0]).toMatchObject({mappingConfidence:null,matchedProducts:[]})
  expect(result.key_companies[1].matchedProducts).toEqual(['ETF甲','ETF乙'])
 })
 it('enforces portfolio types and disallows model-invented allocation percentages',()=>{
  const valid={analysis:'保持谨慎',conclusionApplication:'先核验产品穿透',priorities:[],risks:[],watchlist:[]}
  expect(validatePortfolioOutput(JSON.stringify(valid))).toEqual(valid)
  expect(()=>validatePortfolioOutput(JSON.stringify({...valid,analysis:{overview:'解释'}}))).toThrow('analysis 必须是非空字符串')
  expect(()=>validatePortfolioOutput(JSON.stringify({...valid,analysis:'减至5-7%'}))).toThrow('仓位数值')
 })
 it('does not publish invalid upstream claims as verified one-page excerpts',async()=>{
  const ctx=context([['market-analysis',JSON.stringify({analysis:'不应摘录',evidence:[{claim:'无效引用结论',evidenceIds:[],referenceIssues:['引用失效']} ]})],['market-analysis-validation',{status:'limited',issues:['引用失效']}],['industry-info',{name:'测试'}]])
  await socialReportStep.execute(ctx)
  const report=ctx.artifacts.get('social-report')
  expect(JSON.stringify(report)).not.toContain('无效引用结论')
  expect(ctx.artifacts.get('social-report-status')).toMatchObject({status:'limited'})
 })
})

it('completes partial multi-source display without accepting an entirely wrong source',()=>{
 const sources=[evidence('main','Tushare/moneyflow_mkt_dc'),evidence('margin','Tushare/margin')]
 const mixed=auditClaim({claim:'资金和融资变化',source:'Tushare/moneyflow_mkt_dc',evidenceIds:['main','margin']},sources)
 expect(mixed.referenceIssues).toEqual([])
 expect(mixed.source).toBe('Tushare/moneyflow_mkt_dc；Tushare/margin')
 expect(mixed.referenceCorrections?.join('')).toContain('多来源显示已按冻结引用补齐')
 expect(auditClaim(mixed,sources)).toEqual(mixed)
 expect(auditClaim({claim:'融资变化',source:'Tushare/margin',evidenceIds:['main']},sources).referenceIssues?.join('')).toContain('来源不匹配')
})
