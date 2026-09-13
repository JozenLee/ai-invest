import { describe, expect, it } from 'vitest'
import { executionWaves } from '../execution-waves'
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
})
