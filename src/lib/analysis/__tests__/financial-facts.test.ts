import { describe, expect, it } from 'vitest'
import { auditFinancialFacts, financialFacts, validateFinancialFacts } from '../financial-facts'
const facts=financialFacts([{code:'300502',name:'新易盛',cashConversionPct:21.3632,profitGrowthPct:91.9268,financials:[{period:'2026-06-30',evidenceId:'cash'}]}])
describe('frozen financial facts',()=>{
  it('catches upstream drift propagated into executive and public summaries',()=>{
    expect(()=>validateFinancialFacts({analysis:'新易盛现金转化率27.4%同样偏低'},facts)).toThrow('21.36%')
    expect(auditFinancialFacts({mainRisks:['新易盛现金转化率27%显示回款周期拉长']},facts)).toHaveLength(1)
    expect(auditFinancialFacts({key_companies:[{name:'新易盛',operatingEvidence:'现金转化率27%'}]},facts)).toHaveLength(1)
  })
  it('accepts rounding without confusing targets and historical comparisons with current facts',()=>{
    expect(auditFinancialFacts({analysis:'新易盛现金转化率21.4%',watch:'新易盛现金转化率改善至50%',historyComparison:['新易盛现金转化率27%']},facts)).toEqual([])
    expect(auditFinancialFacts({analysis:'新易盛现金转化率21%'},facts)).toEqual([])
  })
  it('does not assign another company’s number to the preceding subject',()=>{
    const all=[...facts,{...facts[0],name:'中际旭创',code:'300308',value:12.2}]
    expect(auditFinancialFacts('中际旭创现金转化率12%、新易盛现金转化率21%',all)).toEqual([])
  })
})

it('preserves negative signs and audits abbreviated list items',()=>{
  const negative=financialFacts([{code:'1',name:'样本企业',cashConversionPct:-20.07,financials:[{period:'2026-06-30'}]}])
  expect(auditFinancialFacts('样本企业经营现金流占利润比-20.1%',negative)).toEqual([])
  expect(auditFinancialFacts('现金转化率偏低，中际旭创转化率12%、新易盛27%显示回款风险',facts)).toHaveLength(1)
})

it('checks a joint range without assigning its lower bound to the last company',()=>{
  const all=[...facts,{...facts[0],name:'中际旭创',code:'300308',value:12.21}]
  expect(auditFinancialFacts('中际旭创、新易盛现金转化率12.21%-21.36%，回款待观察',all)).toEqual([])
  expect(auditFinancialFacts('中际旭创、新易盛现金转化率12.21%-27.4%',all)).toHaveLength(1)
})

it('resolves respectively lists and repeated subjects without accepting swapped values',()=>{
  const all=financialFacts([
    {code:'1',name:'紫光股份',cashConversionPct:-167.9,financials:[{period:'2026-06-30'}]},
    {code:'2',name:'中科曙光',cashConversionPct:-20.07,financials:[{period:'2026-06-30'}]},
    {code:'3',name:'中际旭创',cashConversionPct:12.21,financials:[{period:'2026-06-30'}]},
  ]).concat(facts)
  expect(auditFinancialFacts('紫光股份和中科曙光经营现金流转化率分别为-167.9%和-20.1%，紫光股份负债率82%',all)).toEqual([])
  expect(auditFinancialFacts('紫光股份和中科曙光现金转化率分别为-20.1%和-167.9%',all)).toHaveLength(2)
  expect(auditFinancialFacts('中际旭创和新易盛营收翻倍，但中际旭创现金转化率仅12.2%需关注',all)).toEqual([])
  expect(auditFinancialFacts('中际旭创和新易盛营收翻倍，但中际旭创现金转化率仅27%需关注',all)).toHaveLength(1)
})

it('validates comparison statements as inequalities rather than exact values',()=>{
  expect(auditFinancialFacts('新易盛现金转化率低于50%',facts)).toEqual([])
  expect(auditFinancialFacts('新易盛现金转化率超过50%',facts)).toHaveLength(1)
  expect(auditFinancialFacts('新易盛现金转化率不低于20%',facts)).toEqual([])
  expect(auditFinancialFacts('新易盛现金转化率不超过20%',facts)).toHaveLength(1)
})
