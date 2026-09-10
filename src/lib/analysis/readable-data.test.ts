import {expect,it} from 'vitest'
import {readableResearchData} from './readable-data'
import {auditClaim} from './evidence-references'
import {renderValue} from './full-research-report'
it('keeps source/date references but hides internal identifiers in UI and report rendering',()=>{
  const audited=auditClaim({claim:'收入增长',evidenceIds:['internal-id']},[{id:'internal-id',source:'公司财报',dataDate:'2026-06-30',publishedAt:null,fetchedAt:'2026-09-01',hash:'hash'}])
  expect(audited.evidenceIds).toEqual(['internal-id'])
  expect(readableResearchData(audited)).toMatchObject({references:[{source:'公司财报',date:'2026-06-30'}]})
  expect(JSON.stringify(readableResearchData(audited))).not.toContain('internal-id')
  expect(renderValue({evidence:[audited]})).not.toContain('internal-id')
  expect(renderValue({evidence:[audited]})).toContain('公司财报')
})
