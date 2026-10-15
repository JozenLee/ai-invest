import { describe, expect, it } from 'vitest'
import { comprehensiveWorkflowDefinition, normalizeWorkflowNodeConfigs, validateWorkflowDefinition } from '../comprehensive-definition'
import { workflowDefinitionHash } from '../definition-hash'

describe('comprehensive workflow definition',()=>{
  it('is a valid versioned DAG with compatible explicit ports',()=>{
    const result=validateWorkflowDefinition(comprehensiveWorkflowDefinition)
    expect(result).toEqual({valid:true,errors:[]})
    expect(comprehensiveWorkflowDefinition.nodes).toHaveLength(22)
    expect(comprehensiveWorkflowDefinition.edges.length).toBeGreaterThan(20)
    expect(workflowDefinitionHash(comprehensiveWorkflowDefinition)).toMatch(/^[a-f0-9]{64}$/)
  })

  it('does not allow private nodes to feed public nodes',()=>{
    const privateNodes=new Set(comprehensiveWorkflowDefinition.nodes.filter(node=>node.visibility==='private').map(node=>node.id))
    const publicNodes=new Set(comprehensiveWorkflowDefinition.nodes.filter(node=>node.visibility==='public').map(node=>node.id))
    expect(comprehensiveWorkflowDefinition.edges.filter(edge=>privateNodes.has(edge.sourceNodeId)&&publicNodes.has(edge.targetNodeId))).toEqual([])
  })

  it('connects the unified news and announcement event artifact to event analysis',()=>{
    const fetchNews=comprehensiveWorkflowDefinition.nodes.find(node=>node.id==='fetch-news')!
    const newsAnalysis=comprehensiveWorkflowDefinition.nodes.find(node=>node.id==='news-analysis')!
    expect(fetchNews.outputs).toEqual(expect.arrayContaining([expect.objectContaining({artifactKey:'news-events',schemaId:'news-events'})]))
    expect(newsAnalysis.inputs).toEqual(expect.arrayContaining([expect.objectContaining({artifactKey:'news-events',sourceNodeId:'fetch-news'})]))
    expect(comprehensiveWorkflowDefinition.edges).toEqual(expect.arrayContaining([expect.objectContaining({sourceNodeId:'fetch-news',targetNodeId:'news-analysis',artifactKey:'news-events'})]))
  })

  it('normalizes configurable methods and bounds numeric parameters',()=>{
    const configs=normalizeWorkflowNodeConfigs({'fetch-companies':{methodId:'graph-intersection-selection',parameters:{maxCompanies:999}},'fetch-news':{methodId:'missing',parameters:{lookbackDays:1}}})
    expect(configs['fetch-companies']).toEqual({methodId:'graph-intersection-selection',parameters:{maxCompanies:100}})
    expect(configs['fetch-news']).toEqual({methodId:'material-events',parameters:{lookbackDays:7}})
    expect(configs['market-analysis']).toEqual({methodId:'hybrid-ai',parameters:{effort:'low'}})
    expect(configs['investment-advice']).toEqual({methodId:'decision-ai',parameters:{effort:'medium'}})
  })

  it('makes market analysis wait for the frozen quantitative evaluation',()=>{
    const market=comprehensiveWorkflowDefinition.nodes.find(node=>node.id==='market-analysis')!
    expect(market.inputs).toEqual(expect.arrayContaining([expect.objectContaining({artifactKey:'research-evaluation',sourceNodeId:'etf-actions',required:true})]))
    expect(comprehensiveWorkflowDefinition.edges).toEqual(expect.arrayContaining([expect.objectContaining({sourceNodeId:'etf-actions',targetNodeId:'market-analysis',artifactKey:'research-evaluation'})]))
  })

})
