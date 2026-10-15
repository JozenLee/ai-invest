import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DomainResearchView } from './DomainResearchView'
import type { DomainResearch } from '@/lib/workflow/domain-research'

const research: DomainResearch = { version:1,status:'completed',snapshotId:'s',asOf:'2026-10-14T08:00:00Z',generatedAt:'2026-10-14T09:00:00Z',promptVersion:'1',opinion:{conclusion:'长期需求增长，短期等待确认',strategic:{stance:'积极',horizon:'6—12个月',reason:'需求增长'},tactical:{stance:'等待确认',horizon:'20个交易日',reason:'价格承压'},drivers:[{statement:'需求证据',evidenceIds:['e1']}],counterEvidence:[{statement:'现金转化不足',evidenceIds:['e2']}],segments:[],products:[{ticker:'588200',role:'芯片暴露',evidenceIds:['e1']}],watchConditions:[{subject:'现金流',observable:'连续改善',window:'下一季',consequence:'上调判断'}],limitations:['估值不足']} }
describe('DomainResearchView',()=>{
  it('keeps old reports compatible',()=>{const {container}=render(<DomainResearchView/>);expect(container).toBeEmptyDOMElement()})
  it('separates strategic value, timing, execution and baseline',()=>{
    render(<DomainResearchView research={research} baselineConclusion="原分步结论"/> )
    expect(screen.getByRole('heading',{name:'领域投资价值'})).toBeVisible()
    expect(screen.getByText('积极')).toBeVisible()
    expect(screen.getByText('等待确认')).toBeVisible()
    expect(screen.getByText(/不是交易许可/)).toBeVisible()
    expect(screen.getByText(/尚无前向收益证据/)).toBeInTheDocument()
    expect(screen.getByText('原分步结论')).toBeInTheDocument()
  })
  it('does not show a rules review as new AI research',()=>{
    render(<DomainResearchView research={{...research,status:'not-run',opinion:undefined,reason:'本轮仅复核规则'}}/> )
    expect(screen.getByText('本轮仅复核规则')).toBeVisible()
    expect(screen.queryByText('积极')).not.toBeInTheDocument()
  })
})
