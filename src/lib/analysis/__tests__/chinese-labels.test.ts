import { describe, expect, it } from 'vitest'
import { chineseNarrative, chineseSource } from '../chinese-labels'

describe('中文展示适配', () => {
  it('将数据源函数名称转换为完整中文', () => {
    expect(chineseSource('eastmoney_direct')).toBe('东方财富直连数据')
    expect(chineseSource('Tushare/fund_adj')).toBe('金融数据聚合服务（基金复权因子）')
    expect(chineseSource('Tushare/index_weight+daily_basic')).toBe('金融数据聚合服务（指数成分权重与基础估值）')
    expect(chineseSource('Tushare/etf_share_size')).toBe('金融数据聚合服务（指数基金份额规模）')
    expect(chineseSource('eastmoney_public_direct')).toBe('东方财富公开直连数据')
    expect(chineseSource('web_search')).toBe('公开网络检索')
  })

  it('嵌入正文的来源也不暴露底层函数名', () => {
    const text = chineseNarrative('来源：eastmoney_direct、Tushare/moneyflow_ind_dc')
    expect(text).not.toMatch(/eastmoney|moneyflow|_direct/i)
    expect(text).toContain('东方财富直连数据')
    expect(text).toContain('行业资金流向')
  })
})
