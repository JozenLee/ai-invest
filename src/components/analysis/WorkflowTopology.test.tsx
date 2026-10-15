import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkflowTopology } from './WorkflowTopology'
import { comprehensiveWorkflowDefinition, normalizeWorkflowNodeConfigs } from '@/lib/workflow/comprehensive-definition'

afterEach(()=>vi.restoreAllMocks())

describe('WorkflowTopology',()=>{
  it('provides a keyboard-accessible list and configurable node inspector',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify(comprehensiveWorkflowDefinition),{status:200,headers:{'Content-Type':'application/json'}})))
    const configs=normalizeWorkflowNodeConfigs({})
    const onConfigsChange=vi.fn()
    const {container}=render(<WorkflowTopology locked={false} configs={configs} onConfigsChange={onConfigsChange} onChanged={vi.fn()}/>)
    await screen.findByRole('heading',{name:'分析链路拓扑'})
    expect(screen.getByRole('heading',{name:/链路说明/})).toBeInTheDocument()
    expect(screen.getByRole('heading',{name:'运行结果'})).toBeInTheDocument()
    expect(screen.queryByText('直接上游')).not.toBeInTheDocument()
    expect(screen.queryByText('直接下游')).not.toBeInTheDocument()
    expect(screen.getByRole('option',{name:'确定性处理'})).toBeInTheDocument()
    expect(container.querySelector('[data-connector="workflow"]')?.getAttribute('d')).toContain(' C ')
    const canvas=container.querySelector('[aria-label^="工作流拓扑画布"]')
    expect(canvas?.querySelectorAll('[data-workflow-node]')).toHaveLength(comprehensiveWorkflowDefinition.nodes.length)
    expect(canvas?.querySelector('[data-workflow-node="market-analysis"]')?.getAttribute('data-layout-rank')).toBe(canvas?.querySelector('[data-workflow-node="company-analysis"]')?.getAttribute('data-layout-rank'))
    fireEvent.click(screen.getByRole('button',{name:'全部连线'}))
    for(const connector of container.querySelectorAll('[data-connector="workflow"]')){
      expect(Number(connector.getAttribute('data-target-x'))).toBeGreaterThan(Number(connector.getAttribute('data-source-x')))
      const source=canvas?.querySelector(`[data-workflow-node="${connector.getAttribute('data-source-node')}"]`)
      const target=canvas?.querySelector(`[data-workflow-node="${connector.getAttribute('data-target-node')}"]`)
      expect(connector.getAttribute('data-source-x')).toBe(source?.getAttribute('data-output-x'))
      expect(connector.getAttribute('data-source-y')).toBe(source?.getAttribute('data-output-y'))
      expect(connector.getAttribute('data-target-x')).toBe(target?.getAttribute('data-input-x'))
      expect(connector.getAttribute('data-target-y')).toBe(target?.getAttribute('data-input-y'))
    }
    expect(Number(container.querySelector('#workflow-arrow-active')?.getAttribute('markerWidth'))).toBeLessThanOrEqual(5)
    fireEvent.click(screen.getAllByRole('button',{name:/企业筛选/})[0])
    expect(screen.getByRole('heading',{name:/链路说明 · 企业筛选/})).toBeInTheDocument()
    expect(screen.getByText('来自 ETF 成分持仓')).toBeInTheDocument()
    expect(screen.getByRole('option',{name:/图谱交集企业池/})).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('企业上限'),{target:{value:'45'}})
    await waitFor(()=>expect(onConfigsChange).toHaveBeenCalledWith(expect.objectContaining({'fetch-companies':expect.objectContaining({parameters:expect.objectContaining({maxCompanies:45})})})))
    fireEvent.click(screen.getAllByRole('button',{name:/标的指数与 ETF/})[0])
    expect(screen.queryByText('最低相关度')).not.toBeInTheDocument()
  })

  it('deduplicates repeated node ids from persisted definitions',async()=>{
    const duplicated={...comprehensiveWorkflowDefinition,nodes:[...comprehensiveWorkflowDefinition.nodes,comprehensiveWorkflowDefinition.nodes[0]]}
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify(duplicated),{status:200,headers:{'Content-Type':'application/json'}})))
    const {container}=render(<WorkflowTopology locked configs={{}} onConfigsChange={vi.fn()} onChanged={vi.fn()}/>)
    await screen.findByRole('heading',{name:'分析链路拓扑'})
    const canvas=container.querySelector('[aria-label^="工作流拓扑画布"]')
    expect(canvas?.querySelectorAll('[data-workflow-node="freeze-research"]')).toHaveLength(1)
  })
})
