import { describe, expect, it, vi } from 'vitest'
import { domainEvidence, domainInputHash, domainPrompt, validateDomainOpinion, compareDomainResearch, type DomainOpinion } from '../domain-research'
import type { StepContext } from '../types'
import { comprehensiveWorkflowDefinition, validateWorkflowDefinition } from '../comprehensive-definition'
vi.mock('../analysis-prompt', () => ({ runAnalysisPrompt: vi.fn() }))
import { runAnalysisPrompt } from '../analysis-prompt'
import { domainResearchStep } from '../steps/domain-research-step'

function context(): StepContext {
  return { runId:'test',stepId:'domain-research',input:{},saveArtifact:vi.fn(),updateProgress:vi.fn(),artifacts:new Map<string, unknown>([
    ['research-snapshot',{id:'s1',asOf:'2026-10-14T08:00:00Z',profile:{name:'芯片'},etfs:[]}],
    ['research-evaluation',{snapshotId:'s1',asOf:'2026-10-14T08:00:00Z',decisions:[{ticker:'588200',indexCode:'i1',adjustmentAudit:{status:'verified'},metrics:{date:'2026-10-14',return20Pct:-10,factorScore:-90},state:'risk-off',heldAction:'减仓',evidenceIds:['s1:bars:588200']}],events:[{id:'e1',status:'evidence',category:'earnings',publishedAt:'2026-10-13T00:00:00Z',title:'订单',evidenceIds:['e1']},{id:'future',status:'evidence',publishedAt:'2026-10-15T00:00:00Z',title:'未来消息',evidenceIds:['future']}]}],
    ['company-market-data',[]],['industry-info',{name:'芯片'}],
  ]) }
}
const opinion: DomainOpinion = { conclusion:'产业成长但时机未确认',strategic:{stance:'积极',horizon:'6—12个月',reason:'需求增长'},tactical:{stance:'等待确认',horizon:'20个交易日',reason:'趋势偏弱'},drivers:[{statement:'订单证据',evidenceIds:['e1']}],counterEvidence:[{statement:'价格承压',evidenceIds:['s1:bars:588200']}],segments:[],products:[{ticker:'588200',role:'芯片暴露',evidenceIds:['s1:bars:588200']}],watchConditions:[{subject:'订单',observable:'订单增速转负',window:'下季度',consequence:'下调长期判断'}],limitations:['估值缺失'] }

describe('independent domain research', () => {
  it('does not change input when account, AI opinions or rule actions change', () => {
    const c=context(),first=domainEvidence(c)
    c.artifacts.set('portfolio-evidence',{cash:999,name:'PRIVATE'})
    c.artifacts.set('investment-advice',{conclusion:'BUY EVERYTHNG'})
    c.artifacts.set('industry-overview',{analysis:'BASELINE'})
    c.artifacts.set('historical-report-context',[{conclusion:'OLD'}])
    c.artifacts.get('research-evaluation').decisions[0].heldAction='加仓'
    c.artifacts.get('research-evaluation').decisions[0].metrics.factorScore=100
    expect(domainInputHash(domainEvidence(c))).toBe(domainInputHash(first))
    expect(JSON.stringify(first)).not.toMatch(/PRIVATE|risk-off|factorScore|未来消息/)
    expect(first.allowedEvidenceIds).not.toContain('future')
  })
  it('preserves missing metrics and changes hash with evidence', () => {
    const c=context(),a=domainEvidence(c)
    expect(a.market.products[0].metrics.relative20Pct).toBeUndefined()
    c.artifacts.get('research-evaluation').decisions[0].metrics.return20Pct=-20
    expect(domainInputHash(domainEvidence(c))).not.toBe(domainInputHash(a))
  })
  it('validates evidence citations, scope, counterevidence and review conditions', () => {
    const packet=domainEvidence(context())
    expect(validateDomainOpinion(JSON.stringify(opinion),packet)).toEqual(opinion)
    expect(()=>validateDomainOpinion(JSON.stringify({...opinion,drivers:[{statement:'编造',evidenceIds:['fake']}]}),packet)).toThrow(/引用/)
    expect(()=>validateDomainOpinion(JSON.stringify({...opinion,products:[{ticker:'999999',role:'越界',evidenceIds:['e1']}]}),packet)).toThrow(/产品越界/)
    expect(()=>validateDomainOpinion(JSON.stringify({...opinion,counterEvidence:[]}),packet)).toThrow(/counterEvidence/)
    expect(()=>validateDomainOpinion(JSON.stringify({...opinion,watchConditions:[]}),packet)).toThrow(/watchConditions/)
    expect(()=>validateDomainOpinion(JSON.stringify({...opinion,conclusion:'估值处于历史高位但缺少历史分位数据'}),packet)).toThrow(/历史估值分位/)
    expect(validateDomainOpinion(JSON.stringify({...opinion,conclusion:'估值缺少历史分位，无法判断是否处于历史高位'}),packet).conclusion).toContain('无法判断')
  })
  it('refuses silent truncation and does not declare a performance winner', () => {
    const packet=domainEvidence(context())
    packet.boundary='x'.repeat(60_001)
    expect(()=>domainPrompt(packet)).toThrow(/禁止静默截断/)
    expect(compareDomainResearch(undefined,{},'s1')).toMatchObject({status:'unavailable',performanceWinner:null})
  })
  it('has no AI or private upstream ports and report waits for the new node', () => {
    expect(validateWorkflowDefinition(comprehensiveWorkflowDefinition).valid).toBe(true)
    const node=comprehensiveWorkflowDefinition.nodes.find(row=>row.id==='domain-research')!
    expect(node.inputs.some(port=>port.confidentiality==='private'||/analysis|overview|advice/.test(port.sourceNodeId!))).toBe(false)
    expect(comprehensiveWorkflowDefinition.edges.some(edge=>edge.sourceNodeId==='domain-research'&&edge.targetNodeId==='generate-report'&&edge.required)).toBe(true)
  })
  it('archives the model opinion without overwriting baseline or account actions', async () => {
    const c=context()
    c.artifacts.set('investment-advice', { conclusion:'baseline' })
    vi.mocked(runAnalysisPrompt).mockResolvedValueOnce({content:[{type:'text',text:JSON.stringify(opinion)}],model:'test-model'} as never)
    await domainResearchStep.execute(c)
    expect(c.saveArtifact).toHaveBeenCalledWith('domain-research',expect.objectContaining({status:'completed',snapshotId:'s1',model:'test-model',opinion}),'DATA')
    expect(c.artifacts.get('investment-advice')).toEqual({conclusion:'baseline'})
  })
  it('does not invoke AI during rule-only review or archive success after failure', async () => {
    vi.mocked(runAnalysisPrompt).mockClear()
    const c=context();c.input.rulesOnly=true
    await domainResearchStep.execute(c)
    expect(runAnalysisPrompt).not.toHaveBeenCalled()
    expect(c.saveArtifact).toHaveBeenCalledWith('domain-research',expect.objectContaining({status:'not-run'}),'DATA')
    const failed=context()
    vi.mocked(runAnalysisPrompt).mockRejectedValueOnce(new Error('provider unavailable'))
    await expect(domainResearchStep.execute(failed)).rejects.toThrow('provider unavailable')
    expect(failed.saveArtifact).not.toHaveBeenCalledWith('domain-research',expect.objectContaining({status:'completed'}),'DATA')
  })
})
