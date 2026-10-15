import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { StrategyLab } from './StrategyLab'
vi.mock('./UnifiedValidationPanel',()=>({UnifiedValidationPanel:()=>null}))
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
it('shows deferred reanalysis and zero executable actions without implying strategy validity',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({settings:{enabled:true},experiment:null,history:[],loopMetrics:{products:10,executableActions:0,increase:0,reduce:0,requiresNewAnalysis:10,basis:'持有和观望不计入有效动作',reanalysis:{status:'deferred',reasons:['等待核心行情修复']},blockers:[{reason:'执行合同已过期',count:10}]}})}))
  render(<StrategyLab industryId="test"/> )
  expect(await screen.findByLabelText('实操性与迭代反馈')).toHaveTextContent('当前有效非零动作 0/10')
  expect(screen.getByText(/最近自动评估/)).toHaveTextContent('等待重新分析')
  expect(screen.getByText(/10只产品/)).toHaveTextContent('执行合同已过期')
})
