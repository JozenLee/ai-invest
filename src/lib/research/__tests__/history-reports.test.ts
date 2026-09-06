import { describe,expect,it } from 'vitest'
import { defaultProfile,validateProfile } from '../profile'
import { annotateHistoricalReports,selectHistoricalReports } from '../history-reports'

const report=(id:string,industryId:string,session:string,createdAt:string)=>({id,industryId,industryName:industryId,title:id,summary:id,dataJson:JSON.stringify({researchEvaluation:{expectedSession:session,decisions:[{state:'watch'}]},investmentAdvice:{confidencePct:66,recommendation:{unheld:'观望'}}}),createdAt})

describe('historical report context',()=>{
  it('defaults legacy and new profiles to ten trading days',()=>{
    const profile=defaultProfile('ai','AI')
    expect(profile.historyReports).toEqual({enabled:true,lookbackTradingDays:10,mode:'latest-per-trading-day'})
    const legacy=structuredClone(profile);delete legacy.historyReports
    expect(validateProfile(legacy,'ai').historyReports?.lookbackTradingDays).toBe(10)
  })
  it('selects the latest report for each configured trading day in the same industry',()=>{
    const profile=defaultProfile('ai','AI')
    profile.historyReports={enabled:true,lookbackTradingDays:2,mode:'latest-per-trading-day'}
    const candidates=[report('old','ai','2026-09-03','2026-09-03T10:00:00Z'),report('latest','ai','2026-09-03','2026-09-03T12:00:00Z'),report('today','ai','2026-09-04','2026-09-04T12:00:00Z'),report('other','ev','2026-09-04','2026-09-04T13:00:00Z')]
    const selected=selectHistoricalReports({candidates,profile,tradingSessions:['2026-09-02','2026-09-03','2026-09-04'],cutoff:'2026-09-04',asOf:'2026-09-05T00:00:00Z'})
    expect(selected.map(item=>item.reportId)).toEqual(['latest','today'])
    expect(selected[0]).toMatchObject({confidencePct:66,role:'historical-context'})
    const tags=annotateHistoricalReports(candidates,selected,'ai')
    expect(tags.map(item=>item.inclusionLabel)).toEqual(['同交易日较早版本','纳入下一轮分析','纳入下一轮分析','其他产业领域'])
  })
})
