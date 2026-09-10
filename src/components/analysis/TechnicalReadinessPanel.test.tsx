import { render,screen,cleanup } from '@testing-library/react'
import { afterEach,expect,it } from 'vitest'
import { TechnicalReadinessPanel } from './TechnicalReadinessPanel'
import { assessTechnicalReadiness } from '@/lib/research/technical-readiness'
import { fixture } from '@/lib/research/__tests__/fixtures'
afterEach(cleanup)
it('labels historical reference separately and provides an actionable subscription link',()=>{
 const snapshot=fixture();snapshot.asOf='2026-09-04T08:45:00Z';snapshot.etfs[0].factors.pop()
 const data=assessTechnicalReadiness(snapshot)
 render(<TechnicalReadinessPanel data={data}/>)
 expect(screen.getByRole('region',{name:'技术样本缺口与补齐'})).toBeTruthy()
 expect(screen.getByText(/当期有效 0\/1/)).toBeTruthy()
 expect(screen.getByText(/缺少复权因子：2026-09-04/)).toBeTruthy()
 expect(screen.getByText(/历史参考（2026-09-03）/)).toBeTruthy()
 expect(screen.getByRole('link',{name:'前往数据订阅补齐'}).getAttribute('href')).toBe('/data-center/subscriptions')
})
