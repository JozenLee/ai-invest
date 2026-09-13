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
    render(<WorkflowTopology locked={false} configs={configs} onConfigsChange={onConfigsChange} onChanged={vi.fn()}/>)
    await screen.findByRole('heading',{name:'分析链路拓扑'})
    fireEvent.click(screen.getAllByRole('button',{name:/企业筛选/})[0])
    expect(screen.getByRole('heading',{name:'企业筛选'})).toBeInTheDocument()
    expect(screen.getByText('fetch-etf-holdings.etf-holdings')).toBeInTheDocument()
    expect(screen.getByRole('option',{name:/图谱交集企业池/})).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('企业上限'),{target:{value:'45'}})
    await waitFor(()=>expect(onConfigsChange).toHaveBeenCalledWith(expect.objectContaining({'fetch-companies':expect.objectContaining({parameters:expect.objectContaining({maxCompanies:45})})})))
  })
})
