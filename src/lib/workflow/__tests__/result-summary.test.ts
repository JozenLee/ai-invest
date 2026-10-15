import { describe, expect, it } from 'vitest'
import { buildWorkflowResultSummary } from '../result-summary'

describe('workflow result summary',()=>{
  it('extracts decision counts instead of transport metadata',()=>{
    const result=buildWorkflowResultSummary('etf-actions',[{artifactKey:'etf-actions',data:JSON.stringify([
      {ticker:'159995',state:'risk-off',heldAction:'减仓'},
      {ticker:'588000',state:'eligible',unheldAction:'建仓'},
    ])}],'规则决策完成')
    expect(result.metrics).toContainEqual({label:'风险收缩',value:'1'})
    expect(result.metrics).toContainEqual({label:'满足条件',value:'1'})
    expect(result.highlights).toContain('159995 · 减仓')
  })

  it('parses JSON text artifacts from analysis nodes',()=>{
    const result=buildWorkflowResultSummary('market-analysis',[{artifactKey:'market-analysis',data:JSON.stringify(JSON.stringify({analysis:'趋势分化，等待资金确认。',trend:'震荡',risk_level:'中',watchlist:['关注成交扩散']}))}])
    expect(result.headline).toBe('趋势分化，等待资金确认。')
    expect(result.metrics).toContainEqual({label:'趋势',value:'震荡'})
    expect(result.highlights).toEqual(['关注成交扩散'])
  })

  it('supports projected news counters and exposes a clear completion assessment',()=>{
    const result=buildWorkflowResultSummary('fetch-news',[{artifactKey:'news-evidence-gaps',data:JSON.stringify({candidates:1000,textRelevant:900,eventClusters:320,leads:40,taxonomyAvailable:true})}],null,{stepStatus:'COMPLETED'})
    expect(result.metrics).toEqual(expect.arrayContaining([{label:'候选资讯',value:'1000'},{label:'事件聚类',value:'320'}]))
    expect(result.assessment).toMatchObject({status:'success',label:'运行成功'})
  })

  it('marks unexpected AI fallback as a warning instead of a success',()=>{
    const result=buildWorkflowResultSummary('market-analysis',[
      {artifactKey:'market-analysis-ai-status',data:JSON.stringify({status:'fallback',reason:'智能服务超时'})},
      {artifactKey:'market-analysis',data:JSON.stringify({analysis:'保留冻结行情，不新增推断。'})},
    ],null,{stepStatus:'COMPLETED'})
    expect(result.assessment).toEqual({status:'warning',label:'完成但发生降级',detail:'智能服务超时'})
  })

  it('renders structured outlook without object placeholders',()=>{
    const result=buildWorkflowResultSummary('industry-overview',[{artifactKey:'industry-overview',data:JSON.stringify({analysis:'行业结论',outlook:{base:'维持观察',bull:'盈利改善',bear:'需求下修'}})}])
    expect(result.highlights).toContain('基准情景：维持观察')
    expect(result.highlights.join(' ')).not.toContain('object Object')
  })
})
