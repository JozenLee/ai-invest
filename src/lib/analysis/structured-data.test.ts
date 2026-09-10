import { describe, expect, it } from 'vitest'
import { cleanStructuredValue, parseStructuredValue, splitStructuredContent } from './structured-data'

describe('研究明细解析', () => {
  it('解析围栏和重复编码，保留零值、否值和异常状态', () => {
    expect(cleanStructuredValue('```json\n{"score":null,"valid":false,"count":0,"status":"unknown","empty":[],"nested":{"text":""}}\n```')).toEqual({valid:false,count:0,status:'unknown'})
    expect(parseStructuredValue(JSON.stringify(JSON.stringify({score:0})))).toEqual({score:0})
  })
  it('正文中的伪 JSON 模板不会吞掉后面的真实证据', () => {
    const parts = splitStructuredContent('输出JSON：{analysis,evidence:[]}。\n研究证据：{"count":2,"text":"研究证据：{带括号}和\\\"引号\\\""}\n请核对日期。')
    expect(parts.map(part=>part.kind)).toEqual(['text','data','text'])
    expect(parts[1].value).toEqual({count:2,text:'研究证据：{带括号}和"引号"'})
    expect(parts[2].value).toBe('请核对日期。')
  })
  it('支持多段结构化数据，且损坏的回复不会被误认为有效子对象', () => {
    expect(splitStructuredContent('证据：```json\n{"a":1}\n```\n边界：{"b":false}').filter(part=>part.kind==='data').map(part=>part.value)).toEqual([{a:1},{b:false}])
    expect(splitStructuredContent('{"analysis":"未完成","evidence":[{"count":2}]').map(part=>part.kind)).toEqual(['invalid'])
    expect(splitStructuredContent('[1,2').map(part=>part.kind)).toEqual(['invalid'])
  })
})
