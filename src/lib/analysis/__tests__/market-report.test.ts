import { describe, expect, it } from 'vitest'
import { normalizeMarket, normalizeMarketReportText } from '../report-contract'

describe('market report compatibility', () => {
  it('reconciles legacy quality and flow wording with the full market snapshot', () => {
    const market = normalizeMarket({
      etf_analysis: [
        { code: '159000', price_change_pct: -3, volatility: 30, max_drawdown: 10, data_points: 63 },
        { code: '159001', price_change_pct: -61, volatility: 80, max_drawdown: 75, data_points: 63 },
      ],
    })
    const legacy = [
      '## 一、数据质量评估',
      '数据质量：**高**（6只ETF，平均63天数据，样本充足）',
      '⚠️ 板块资金流向数据缺失，影响市场情绪判断完整性',
      '板块资金流向：数据缺失无法判断资金轮动方向，但从大盘表现看，科技板块处于资金流出周期',
    ].join('\n')

    const result = normalizeMarketReportText(legacy, market)

    expect(result).toContain('数据质量：中（2只ETF，平均63天数据；其中1只存在异常收益、波动或回撤')
    expect(result).not.toContain('数据质量：高')
    expect(result).not.toContain('板块资金流向数据缺失')
    expect(result).toContain('历史报告未保存板块资金流向快照')
  })

  it('preserves a normalized sector flow snapshot for new reports', () => {
    const market = normalizeMarket({
      sector_flow: {
        top_inflow_sectors: [{ name: '半导体', net_flow: '2.5' }],
        top_outflow_sectors: [{ name: '地产', net_flow: '-1.2' }],
      },
    })

    expect(market.sectorFlow.topInflowSectors).toEqual([
      expect.objectContaining({ sector: '半导体', netFlow: 2.5, trend: 'inflow' }),
    ])
    expect(market.sectorFlow.topOutflowSectors).toEqual([
      expect.objectContaining({ sector: '地产', netFlow: -1.2, trend: 'outflow' }),
    ])
  })
})
