// Yahoo Finance数据客户端
// 直接在Node.js中获取市场数据，无需Python服务

export interface IndexQuote {
  code: string
  name: string
  price: number
  change: number
  changePct: number
  timestamp: string
}

// 主要指数代码映射
const INDEX_MAP: Record<string, { symbol: string; name: string }> = {
  'sh000001': { symbol: '000001.SS', name: '上证指数' },
  'sz399001': { symbol: '399001.SZ', name: '深证成指' },
  'sz399006': { symbol: '399006.SZ', name: '创业板指' },
  'sh000688': { symbol: '000688.SS', name: '科创50' },
  'sh000300': { symbol: '000300.SS', name: '沪深300' },
}

/**
 * 从Yahoo Finance获取指数报价
 */
export async function fetchIndexFromYahoo(code: string): Promise<IndexQuote | null> {
  try {
    const indexInfo = INDEX_MAP[code]
    if (!indexInfo) return null

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${indexInfo.symbol}?interval=1d&range=1d`

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
      next: { revalidate: 300 },
    })

    if (!response.ok) {
      throw new Error(`Yahoo API error: ${response.status}`)
    }

    const data = await response.json()
    const result = data.chart?.result?.[0]

    if (!result) return null

    const meta = result.meta
    const price = meta.regularMarketPrice || 0
    const previousClose = meta.previousClose || price
    const change = price - previousClose
    const changePct = previousClose ? (change / previousClose) * 100 : 0

    return {
      code,
      name: indexInfo.name,
      price: Math.round(price * 100) / 100,
      change: Math.round(change * 100) / 100,
      changePct: Math.round(changePct * 100) / 100,
      timestamp: new Date().toISOString(),
    }
  } catch (error) {
    console.error(`获取${code}数据失败:`, error)
    return null
  }
}

/**
 * 批量获取指数报价
 */
export async function fetchIndicesFromYahoo(codes: string[]): Promise<IndexQuote[]> {
  const results = await Promise.allSettled(
    codes.map(code => fetchIndexFromYahoo(code))
  )

  return results
    .filter((r): r is PromiseFulfilledResult<IndexQuote | null> => r.status === 'fulfilled')
    .map(r => r.value)
    .filter((q): q is IndexQuote => q !== null)
}
