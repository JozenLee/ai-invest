import { describe,expect,it,vi } from 'vitest'
vi.mock('@/lib/db',()=>({prisma:{}}))
import { fixture } from './fixtures'
import { evaluateResearch } from '../engine'
import { assessDecisionHistory, buildUnifiedDecisionVersion, compactDecisionHistory } from '../decision-ledger'
import { datasetFromSnapshot } from '../lab/experiment'
import { STRATEGIES } from '../lab/contracts'
import { rollingValidation } from '../lab/rolling-validation'

function version(action:'建仓'|'观望'='建仓'){
  const snapshot=fixture(),evaluation=evaluateResearch(snapshot),generatedAt=`${snapshot.etfs[0].bars[80].date}T16:00:00+08:00`
  return {snapshot,evaluation,value:buildUnifiedDecisionVersion({reportId:'report-one',industryId:'ai',runId:'run-one',snapshotId:snapshot.id,generatedAt,horizonTradingDays:20,evaluation,
    investmentAdvice:{productDecisions:[{ticker:'159995',unheldAction:action,heldAction:action==='建仓'?'加仓':'持有',suggestedAdjustmentPct:action==='建仓'?2:0,confidencePct:70,reason:'测试决策',trigger:'收盘确认',invalidation:'趋势失效',quantitativeOverride:null,evidenceIds:['raw-one'],decisionSource:'ai',executionContract:{asOf:generatedAt,validUntil:snapshot.asOf,reviewPolicy:'daily',status:'verified',triggerRules:[]}}]},
    reportQuality:{overallScore:85,usability:'advice-grade',validationStatus:'paper-only',executionReadinessScore:100}})}
}

describe('unified decision ledger and rollback validation',()=>{
  it('turns a report into one immutable decision version and labels only later prices',()=>{
    const {snapshot,value}=version()
    expect(value.products[0]).toMatchObject({ticker:'159995',direction:'increase',executionStatus:'verified'})
    const history=assessDecisionHistory([value],snapshot)
    expect(history).toMatchObject({decisionVersions:1,matured:1,directionalMatured:1,pending:0})
    expect(history.outcomes[0]).toMatchObject({status:'matured',direction:'increase',startDate:expect.any(String),endDate:expect.any(String)})
    expect(compactDecisionHistory(history).hitRatePct).toBeNull()
  })

  it('keeps neutral recommendations out of directional hit-rate calibration',()=>{
    const {snapshot,value}=version('观望'),history=assessDecisionHistory([value],snapshot)
    expect(history.matured).toBe(1)
    expect(history.directionalMatured).toBe(0)
    expect(history.hitRatePct).toBeNull()
  })

  it('runs chronological non-overlapping rollback windows before forward promotion',()=>{
    const validation=rollingValidation(datasetFromSnapshot(fixture()),STRATEGIES[0])
    expect(validation.totalFolds).toBeGreaterThanOrEqual(3)
    expect(validation.folds.every((fold,index,rows)=>index===0||fold.startDate>rows[index-1].endDate)).toBe(true)
    expect(['historical-qualified','historical-unstable']).toContain(validation.status)
    expect(validation.limitations.join('')).toContain('不会自动替换账户')
  })
})
