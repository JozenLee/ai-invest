import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { StructuredDataView } from './StructuredDataView'
import { AIExecutionTrace } from './AIExecutionTrace'

afterEach(cleanup)
describe('研究明细可视化', () => {
  it('分页后仍能访问最后一行，不丢失移动端记录', () => {
    render(<StructuredDataView value={Array.from({length:25},(_,index)=>({name:`样本${index+1}`,count:index,passed:false}))}/>)
    expect(screen.queryAllByText('样本25')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button',{name:'下一页'}))
    fireEvent.click(screen.getByRole('button',{name:'下一页'}))
    expect(screen.getAllByText('样本25').length).toBeGreaterThan(0)
    expect(screen.getByRole('button',{name:'下一页'})).toBeDisabled()
  })
  it('失败的第二轮不得显示第一轮旧回复；切换轮次可核对原始请求', () => {
    render(<AIExecutionTrace artifacts={[
      {artifactKey:'ai-request-attempt-1',data:{system:'首次角色',messages:[{role:'user',content:'首次输入'}]}},
      {artifactKey:'ai-response-attempt-1',data:{content:[{type:'text',text:'{"analysis":"旧回复"}'}]}},
      {artifactKey:'ai-response',data:{content:[{type:'text',text:'{"analysis":"旧回复"}'}]}},
      {artifactKey:'ai-request-attempt-2',data:{system:'重试角色',messages:[{role:'user',content:[{type:'text',text:'重试输入'}]}]}},
      {artifactKey:'ai-error-attempt-2',data:{message:'网络超时'}},
    ]}/>)
    expect(screen.getByText('重试输入')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab',{name:'模型回复'}))
    expect(screen.getByText('本次请求尚无已归档回复。')).toBeInTheDocument()
    expect(screen.queryByText('旧回复')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('请求轮次'),{target:{value:'1'}})
    expect(screen.getByText('旧回复')).toBeInTheDocument()
  })
  it('识别并切换同一步骤内带命名空间的模型阶段', () => {
    render(<AIExecutionTrace stepName="investment-advice" artifacts={[
      {artifactKey:'investment-advice-hypotheses-ai-request-attempt-1',data:{model:'claude-opus-5',messages:[{role:'user',content:'假设输入'}]}},
      {artifactKey:'investment-advice-hypotheses-ai-response-attempt-1',data:{model:'claude-opus-5',content:[{type:'text',text:'假设回复'}]}},
      {artifactKey:'investment-advice-synthesis-ai-request-attempt-1',data:{model:'claude-opus-5',messages:[{role:'user',content:'综合输入'}]}},
      {artifactKey:'investment-advice-synthesis-ai-response-attempt-1',data:{model:'claude-opus-5',content:[{type:'text',text:'综合回复'}]}},
      {artifactKey:'investment-advice-ai-status',data:{status:'completed'}},
    ]}/>)
    expect(screen.getByLabelText('模型阶段')).toHaveValue('investment-advice-synthesis-')
    expect(screen.getByText('综合输入')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('模型阶段'),{target:{value:'investment-advice-hypotheses-'}})
    expect(screen.getByText('假设输入')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab',{name:'模型回复'}))
    expect(screen.getByText('假设回复')).toBeInTheDocument()
  })
  it('空项被过滤但未知状态仍保留', () => {
    render(<StructuredDataView value={{count:0,passed:false,status:'unknown',score:null}}/>)
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.getByText('否')).toBeInTheDocument()
    expect(screen.getByText('未知')).toBeInTheDocument()
    expect(screen.queryByText('参考评分')).not.toBeInTheDocument()
  })
})
