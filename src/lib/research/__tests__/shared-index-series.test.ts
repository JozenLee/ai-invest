import { expect,it } from 'vitest'
import { fixture } from './fixtures'
import { sharedIndexSeries } from '../shared-index-series'
it('shares only verified identical index data and keeps fund factors isolated',()=>{
 const a=fixture().etfs[0],b=structuredClone(a),c=structuredClone(a)
 b.ticker='b';b.indexBars=b.indexBars.slice(0,-1);b.factors=[]
 c.ticker='c';c.indexCode='other';c.indexBars=c.indexBars.slice(0,-1)
 const result=sharedIndexSeries([a,b,c],'2026-09-04')
 expect(result[1].etf.indexBars.at(-1)?.date).toBe('2026-09-04')
 expect(result[1].etf.factors).toEqual([])
 expect(result[1].sourceTicker).toBe(a.ticker)
 expect(result[2].etf.indexBars.at(-1)?.date).toBe('2026-09-03')
 expect(b.indexBars.at(-1)?.date).toBe('2026-09-03')
})
