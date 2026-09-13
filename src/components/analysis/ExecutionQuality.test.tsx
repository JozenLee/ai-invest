import {render,screen,cleanup} from '@testing-library/react'
import {afterEach,expect,it} from 'vitest'
import {ExecutionQuality} from './ExecutionQuality'
afterEach(cleanup)
it('shows corrected historical dates without a data-limit warning',()=>{
 render(<ExecutionQuality artifacts={[{artifactKey:'company-analysis-validation',data:{status:'limited',issues:['判断日期已按冻结证据校正为2026-06-30']}}]}/> )
 expect(screen.getAllByText('已校正')[0]).toBeInTheDocument()
 expect(screen.queryByText(/存在.*限制/)).not.toBeInTheDocument()
})
it('shows the concrete unresolved issue without requiring expansion',()=>{
 render(<ExecutionQuality artifacts={[{artifactKey:'market-analysis-validation',data:{status:'limited',issues:['声明来源与冻结证据来源不匹配']}}]}/> )
 expect(screen.getAllByText('声明来源与冻结证据来源不匹配')[0].closest('p')).toBeTruthy()
})
it('shows a model failure separately from real data gaps',()=>{
 render(<ExecutionQuality artifacts={[{artifactKey:'portfolio-analysis-ai-status',data:{status:'fallback',reason:'持仓解读未完成'}},{artifactKey:'data-quality',data:{status:'limited',modules:{flow:{status:'limited',detail:'主力净占比缺失'}}}}]}/> )
 expect(screen.getByText(/持仓解读未完成；数据缺口：主力净占比缺失/)).toBeInTheDocument()
})
