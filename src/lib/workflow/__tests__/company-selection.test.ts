import {describe,expect,it} from 'vitest'
import {selectResearchCompanies} from '../company-selection'

describe('company research universe',()=>{
  const rows=[
    ...Array.from({length:40},(_,index)=>({code:`H${index}`,pool:'holding',segment:index<10?'图谱环节':'ETF持仓补充样本（图谱外）',representativenessScore:index})),
    ...Array.from({length:10},(_,index)=>({code:`G${index}`,pool:'graph',segment:'图谱环节',representativenessScore:100-index})),
    ...Array.from({length:5},(_,index)=>({code:`B${index}`,pool:'both',segment:'图谱环节',representativenessScore:200-index})),
  ]

  it('enforces the configured cap on holding candidates',()=>{
    const result=selectResearchCompanies(rows,{methodId:'etf-holdings-selection',maxCompanies:30})
    expect(result.selected).toHaveLength(30)
    expect(result.selected.every(row=>row.pool==='holding'||row.pool==='both')).toBe(true)
  })

  it('requires the holding and graph intersection when selected',()=>{
    const result=selectResearchCompanies(rows,{methodId:'graph-intersection-selection',maxCompanies:30})
    expect(result.selected.map(row=>row.code)).toEqual(expect.arrayContaining(['B0','B1','B2','B3','B4']))
    expect(result.selected.some(row=>row.pool==='graph')).toBe(false)
    expect(result.selected.some(row=>row.segment==='ETF持仓补充样本（图谱外）')).toBe(false)
  })
})
