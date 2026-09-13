// @vitest-environment node
import { createRequire } from 'node:module'
import { beforeAll, describe, expect, it } from 'vitest'
import { auditReportFacts, type FactAuditInput, type FactAuditResult } from '../fact-audit'

// The installed runtime has no bundled declarations; keep the small read-only
// test boundary typed locally instead of changing the application's dependencies.
const Database = createRequire(import.meta.url)('better-sqlite3') as new (path:string, options:{readonly:true;fileMustExist:true}) => {
  prepare(sql:string): {get(...params:unknown[]):unknown}; close():void
}

/** Explicit opt-in; CI/unit tests do not depend on or open a user's database.
 * FACT_AUDIT_DB=prisma/dev.db npx vitest run .../fact-audit-archive.test.ts
 * Optional FACT_AUDIT_REPORT_ID pins the confirmed regression when newer reports exist.
 */
describe.skipIf(!process.env.FACT_AUDIT_DB)('read-only archived report fact regressions',()=>{
  let input:FactAuditInput, report:Record<string,unknown>, result:FactAuditResult
  beforeAll(()=>{
    const db=new Database(process.env.FACT_AUDIT_DB!,{readonly:true,fileMustExist:true})
    try {
      const row=(process.env.FACT_AUDIT_REPORT_ID
        ? db.prepare('SELECT id,dataJson FROM AIAnalysisReport WHERE id=?').get(process.env.FACT_AUDIT_REPORT_ID)
        : db.prepare('SELECT id,dataJson FROM AIAnalysisReport ORDER BY createdAt DESC LIMIT 1').get()) as {id:string;dataJson:string}|undefined
      if(!row)throw new Error('指定归档不存在')
      const data=JSON.parse(row.dataJson)
      const read=db.prepare('SELECT a.data FROM step_artifacts a JOIN execution_steps s ON s.id=a.stepId WHERE s.runId=? AND a.artifactKey=? ORDER BY a.createdAt DESC LIMIT 1')
      const artifact=(key:string)=>{
        const found=read.get(data.metadata.runId,key) as {data:string}|undefined
        if(!found)throw new Error(`同一运行的冻结产物缺失：${key}`)
        return JSON.parse(found.data)
      }
      input={snapshot:artifact('research-snapshot'),evaluation:data.researchEvaluation,companyData:artifact('company-market-data')}
      expect(input.snapshot!.id).toBe(input.evaluation!.snapshotId)
      report={market:data.marketAnalysis,companies:data.companyAnalysis,investment:data.investmentAdvice}
      result=auditReportFacts(report,input)
      // No save path is invoked, and SQLite itself prevents writes.
      expect((db.prepare('SELECT dataJson FROM AIAnalysisReport WHERE id=?').get(row.id) as {dataJson:string}).dataJson).toBe(row.dataJson)
    } finally {db.close()}
  })
  it('finds relative-return substitution, MA60 unit conversion and liquidity count errors',()=>{
    expect(result.issues.some(i=>i.code==='value-mismatch' && Array.isArray(i.actual) && i.actual[0]===-8.1 && i.actual[1]===-2.5)).toBe(true)
    expect(result.issues.some(i=>i.code==='unit-mismatch' && i.path.startsWith('report.market'))).toBe(true)
    expect(result.issues.some(i=>i.actual===-.03 && typeof i.expected==='number' && Math.abs(i.expected+3.2786)<.001)).toBe(true)
    expect(result.issues.some(i=>i.actual===5 && i.expected===6)).toBe(true)
  })
  it('checks both conflicting flow totals against the exact frozen four-day interval',()=>{
    for(const amount of [-133,-268.7]) {
      const issue=result.issues.find(i=>i.code==='value-mismatch' && i.actual===amount)
      expect(issue?.expected).toBeCloseTo(19.07037376,8)
      expect(issue?.factIds[0]).toContain('2026-09-07/2026-09-10')
      expect(issue?.severity).toBe('warning')
    }
  })
  it('does not audit September 10 daily -65.9 as a ten-session amount',()=>{
    expect(result.issues.filter(i=>i.path==='report.market.dimensions[3].detail')).toEqual([])
    const value={detail:'9月7日至10日领域累计流出268.7亿元；10日当日三板块合计流出-65.9亿元；9月8日至9日领域累计流出203.59亿元'}
    const r=auditReportFacts(value,input)
    expect(r.checkedNarrativeClaims).toBe(3)
    expect(r.issues.every(i=>i.actual===-268.7)).toBe(true)
  })
  it('traces normalized yuan amounts back to the archived provider payload and its original unit',()=>{
    const db=new Database(process.env.FACT_AUDIT_DB!,{readonly:true,fileMustExist:true})
    try {
      const rows=input.snapshot!.sectorFlows!.filter(f=>f.date>='2026-09-07'&&f.date<='2026-09-10')
      const sources=new Set<string>()
      for(const id of new Set(rows.map(r=>r.evidenceId))) {
        const evidence=input.snapshot!.evidence!.find(e=>e.id===id)!
        const found=db.prepare("SELECT payload FROM raw_payloads WHERE datasetKey='sector_capital_flow' AND contentHash=? LIMIT 1").get(evidence.hash) as {payload:string}
        const payload=JSON.parse(found.payload)
        expect(payload.unit).toBe('元')
        sources.add(payload.source)
        for(const row of rows.filter(r=>r.evidenceId===id)) {
          const original=payload.data.find((x:Record<string,unknown>)=>String(x['日期']).replaceAll('-','')===row.date.replaceAll('-','') && x['今日主力净流入-净额']===row.net)
          expect(original).toBeDefined()
          if(payload.source==='AKShare')expect(original['净额']*1e8).toBeCloseTo(row.net,2)
          else expect(payload.source).toBe('Tushare/moneyflow_ind_dc')
        }
      }
      expect(sources.size).toBe(2)
      expect(rows.reduce((sum,row)=>sum+row.net,0)/1e8).toBeCloseTo(19.07037376,8)
    } finally {db.close()}
  })
  it('keeps amount audits working when flowDays and percentage-gate evidence are unavailable',()=>{
    const evaluation=structuredClone(input.evaluation!)
    evaluation.decisions!.forEach(d=>{d.metrics.flowDays=0;d.metrics.flowNetPct=null;d.conditions=d.conditions.filter(c=>c.key!=='flow')})
    const r=auditReportFacts(report,{...input,evaluation})
    for(const amount of [-133,-268.7]) expect(r.issues.find(i=>i.actual===amount)?.expected).toBeCloseTo(19.07037376,8)
  })
  it('rejects the actual 15.13% Haiguang group statement against its verified holdings subset',()=>{
    const issue=result.issues.find(i=>i.path==='report.investment.etfImplications[0].exposureRationale' && i.code==='value-mismatch')
    expect(issue).toMatchObject({severity:'error',actual:15.13})
    expect(issue?.expected).toBeCloseTo(15.9,8)
    expect(issue?.factIds[0]).toContain('159995')
  })
  it('finds the accounting causal leap and unsubstantiated expectations without flagging scenario conditions',()=>{
    expect(result.issues.some(i=>i.code==='accounting-causality' && i.path==='report.companies.key_companies[1].operatingEvidence')).toBe(true)
    expect(result.issues.some(i=>i.code==='unsupported-expectation' && i.path==='report.companies.analysis')).toBe(true)
    expect(result.issues.some(i=>i.code==='unsupported-expectation' && /scenarios|informationStatus|invalidation/.test(i.path))).toBe(false)
  })
})
