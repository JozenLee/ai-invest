import {describe,expect,it} from 'vitest'
import {retryableAnalysisError} from '../retry-policy'

describe('analysis retry policy',()=>{
  it('fails fast after a long timeout but retries transient and repairable failures',()=>{
    expect(retryableAnalysisError(new Error('Request was aborted.'))).toBe(false)
    expect(retryableAnalysisError(new Error('timeout after 90000ms'))).toBe(false)
    expect(retryableAnalysisError(new Error('503 overloaded'))).toBe(true)
    expect(retryableAnalysisError(new Error('智能分析输出缺少字段'))).toBe(true)
  })
})
