import {describe,expect,it} from 'vitest'
import {executionWaves} from '../execution-waves'
import type {StepDefinition} from '../types'

const step=(name:string,dependencies:string[]=[]):StepDefinition=>({name,description:name,dependencies,execute:async()=>{}})

describe('comprehensive analysis execution waves',()=>{
  it('derives independent research and synthesis waves from the DAG',()=>{
    const waves=executionWaves([
      step('freeze-research'),step('market-analysis',['freeze-research']),step('news-analysis',['freeze-research']),step('company-analysis',['freeze-research']),step('industry-overview',['market-analysis','news-analysis','company-analysis']),step('investment-advice',['industry-overview']),
    ])
    expect(waves.map(wave=>wave.map(item=>item.name))).toEqual([
      ['freeze-research'],['market-analysis','news-analysis','company-analysis'],['industry-overview'],['investment-advice'],
    ])
  })
})
