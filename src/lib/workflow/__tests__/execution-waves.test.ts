import {describe,expect,it} from 'vitest'
import {executionWaves} from '../execution-waves'
import type {StepDefinition} from '../types'

const step=(name:string):StepDefinition=>({name,description:name,dependencies:[],execute:async()=>{}})

describe('comprehensive analysis execution waves',()=>{
  it('serializes model requests sharing upstream capacity',()=>{
    const waves=executionWaves(['freeze-research','market-analysis','news-analysis','company-analysis','industry-overview','investment-advice'].map(step))
    expect(waves.map(wave=>wave.map(item=>item.name))).toEqual([
      ['freeze-research'],['market-analysis'],['news-analysis'],['company-analysis'],['industry-overview'],['investment-advice'],
    ])
  })
})
