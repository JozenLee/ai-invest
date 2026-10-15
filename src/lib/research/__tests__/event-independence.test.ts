import {expect,it} from 'vitest'
import {clusterEvents} from '../events'
import type {EventInput} from '../contracts'
it('does not count identical syndicated text as independent corroboration',()=>{
  const base:EventInput={id:'one',title:'算力企业订单大幅增长',content:'该公司披露算力芯片订单同比增长80%，新增产能将于明年投产，客户需求正在持续扩张。公司表示本次订单预计将对年度营业收入和经营现金流产生积极影响。',source:'媒体甲',publishedAt:'2026-09-20T00:00:00Z',fetchedAt:'2026-09-20T01:00:00Z',kind:'news',segments:['算力']}
  const [event]=clusterEvents([base,{...base,id:'two',source:'媒体乙'}],'2026-09-21T00:00:00Z')
  expect(event.sources).toHaveLength(2)
  expect(event.independentSourceCount).toBe(1)
  expect(event.sourceTier).toBe('secondary')
})
