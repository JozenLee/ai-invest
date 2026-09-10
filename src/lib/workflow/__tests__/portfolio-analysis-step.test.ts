import {describe,expect,it,vi} from 'vitest'
vi.mock('../analysis-prompt',()=>({runAnalysisPrompt:vi.fn()}))
import {runAnalysisPrompt} from '../analysis-prompt'
import {portfolioAnalysisStep} from '../steps/portfolio-analysis-step'
import type {StepContext} from '../types'

describe('portfolio analysis privacy fallback',()=>{
  it('builds a local structured holding analysis from the final conclusion',async()=>{
    const saveArtifact=vi.fn(async()=>undefined)
    const context:StepContext={
      runId:'run',stepId:'step',input:{publicOnly:true},updateProgress:vi.fn(async()=>undefined),saveArtifact,
      artifacts:new Map<string,unknown>([
        ['investment-advice',JSON.stringify({rating:'谨慎',executiveSummary:{conclusion:'维持低配',allocationStance:'不新增风险'}})],
        ['portfolio-decision-support',{signal:'risk-off',readiness:'limited-advice',currentIndustryWeightPct:19,targetIndustryRangePct:[0,15],proposedIndustryWeightPct:19,cashWeightPct:3,proposedCashWeightPct:3,researchConclusion:{appliedToAllocation:'综合结论阻止新增风险'},actions:[{ticker:'017470',name:'联接基金',action:'补充数据',mapping:{verified:false},reason:'待穿透',gaps:['底层指数缺失']}]}],
      ]),
    }
    await portfolioAnalysisStep.execute(context)
    expect(saveArtifact).toHaveBeenCalledWith('portfolio-analysis',expect.objectContaining({mode:'综合结论驱动的本地持仓分析',sourceConclusion:expect.objectContaining({rating:'谨慎'}),verificationBoundary:expect.objectContaining({pendingProductCount:1})}),'DATA')
    expect(saveArtifact).toHaveBeenCalledWith('portfolio-analysis-ai-status',expect.objectContaining({status:'local-synthesis'}),'DATA')
  })
})

 it('accepts a complete model object followed by repeated Markdown fences',async()=>{
  const result={analysis:'按已冻结比例解释组合风险',priorities:[],risks:[],watchlist:[]}
  const response='```json\n'+JSON.stringify(result)+'```\n```'
  vi.mocked(runAnalysisPrompt).mockImplementationOnce(async(_context,params)=>{
    params.validateOutput?.(response)
    return {id:'test',model:'claude-opus-5',stop_reason:'end_turn',usage:{} as never,contentTypes:['text'],content:[{type:'text',text:response}]}
  })
  const artifacts=new Map()
  await portfolioAnalysisStep.execute({runId:'run',stepId:'step',input:{publicOnly:false,portfolioAiConsent:new URL(process.env.ANTHROPIC_BASE_URL||'https://api.anthropic.com').origin},artifacts,updateProgress:vi.fn(),saveArtifact:async(key,value)=>{artifacts.set(key,value)}})
  expect(artifacts.get('portfolio-analysis-ai-status')).toEqual({status:'completed'})
  expect(artifacts.get('portfolio-analysis').aiAnalysis).toEqual(result)
 })
