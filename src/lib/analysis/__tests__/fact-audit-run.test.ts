// @vitest-environment node
import { createRequire } from 'node:module'
import { beforeAll, describe, expect, it } from 'vitest'
import { auditReportFacts, type FactAuditInput, type FactAuditResult } from '../fact-audit'
import { parseResearchObject } from '@/lib/workflow/research-output'

const Database=createRequire(import.meta.url)('better-sqlite3') as new(path:string,options:{readonly:true;fileMustExist:true})=>{
  prepare(sql:string):{get(...params:unknown[]):unknown};close():void
}

/** Opt-in regression of a failed attempt, without editing/retrying the live run. */
describe.skipIf(!process.env.FACT_AUDIT_DB || !process.env.FACT_AUDIT_RUN_ID)('read-only original market attempt',()=>{
  let response:Record<string,unknown>,input:FactAuditInput,result:FactAuditResult,originalError:string
  beforeAll(()=>{
    const db=new Database(process.env.FACT_AUDIT_DB!,{readonly:true,fileMustExist:true})
    try {
      const read=(key:string,step?:string)=>{
        const query='SELECT a.data FROM step_artifacts a JOIN execution_steps s ON s.id=a.stepId WHERE s.runId=? AND a.artifactKey=?'+(step?' AND s.stepName=?':'')+' ORDER BY a.createdAt DESC LIMIT 1'
        const row=db.prepare(query).get(process.env.FACT_AUDIT_RUN_ID,key,...(step?[step]:[])) as {data:string}|undefined
        if(!row)throw new Error(`指定run缺少产物：${key}`)
        return JSON.parse(row.data)
      }
      const raw=read('ai-response-attempt-1','market-analysis')
      const text=raw.content.filter((block:{type:string})=>block.type==='text').map((block:{text:string})=>block.text).join('\n')
      response=parseResearchObject(text)
      originalError=read('ai-error-attempt-1','market-analysis').message
      input={snapshot:read('research-snapshot'),evaluation:read('research-evaluation')}
      expect(input.snapshot!.id).toBe(input.evaluation!.snapshotId)
      result=auditReportFacts(response,input)
    } finally {db.close()}
  })
  it('preserves the original 19-yuan-hundred-million claim and removes its incorrect single-day rejection',()=>{
    const text=(response.dimensions as Array<{detail:string}>)[4].detail
    expect(text).toContain('9月7日领域短期反弹（4日累计净流入19亿元）')
    expect(originalError).toContain('2026-09-07/2026-09-07')
    const issues=result.issues.filter(i=>i.path==='report.dimensions[4].detail')
    expect(issues.some(i=>i.severity==='error')).toBe(false)
    expect(issues.some(i=>i.code==='value-mismatch'&&i.actual===19)).toBe(false)
    expect(issues.find(i=>i.actual===19)?.factIds[0]).toContain('2026-09-07/2026-09-10')
    expect(issues.find(i=>i.actual===19)?.expected).toBeCloseTo(19.07037376,8)
  })
  it('still distinguishes an incorrect single-day amount from the correct rounded four-day amount',()=>{
    const single=auditReportFacts('9月7日领域累计净流入19亿元',input)
    expect(single.issues[0]).toMatchObject({severity:'error',actual:19})
    expect(single.issues[0].expected).toBeCloseTo(288.57037376,8)
    const multiple=auditReportFacts('9月7日领域反弹（4日累计净流入19亿元）；10日当日三板块合计流出65.9亿元',input)
    expect(multiple.checkedNarrativeClaims).toBe(2)
    expect(multiple.issues.some(i=>i.severity==='error')).toBe(false)
  })
})
