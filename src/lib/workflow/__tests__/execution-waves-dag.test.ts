import { describe, expect, it } from 'vitest'
import { executionWaves, settleExecutionWave } from '../execution-waves'
import type { StepDefinition } from '../types'

const step=(name:string,dependencies:string[]=[]):StepDefinition=>({name,description:name,dependencies,execute:async()=>undefined})

describe('executionWaves',()=>{
  it('derives parallel waves from dependencies',()=>{
    expect(executionWaves([step('freeze'),step('market',['freeze']),step('companies',['freeze']),step('synthesis',['market','companies'])]).map(wave=>wave.map(item=>item.name))).toEqual([['freeze'],['market','companies'],['synthesis']])
  })

  it('rejects cycles and missing dependencies',()=>{
    expect(()=>executionWaves([step('a',['b']),step('b',['a'])])).toThrow(/循环或缺失/)
    expect(()=>executionWaves([step('a',['missing'])])).toThrow(/循环或缺失/)
  })

  it('waits for every started node to settle before surfacing a parallel failure',async()=>{
    const events:string[]=[]
    const wave=[step('fails'),step('finishes')]
    await expect(settleExecutionWave(wave,async item=>{
      if(item.name==='fails')throw new Error('node failed')
      await Promise.resolve()
      events.push(item.name)
    })).rejects.toThrow('node failed')
    expect(events).toEqual(['finishes'])
  })
})
