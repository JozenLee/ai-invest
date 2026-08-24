const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'

export async function fetchFundCategory(ticker: string): Promise<string | null> {
  try {
    const response = await fetch(`${DATA_SERVICE_URL}/api/fund/${encodeURIComponent(ticker)}/info`, {
      signal: AbortSignal.timeout(10000),
      cache: 'no-store',
    })
    if (!response.ok) return null
    const payload = await response.json()
    return payload?.data?.category || null
  } catch (error) {
    console.warn(`获取基金类别失败 ${ticker}:`, error)
    return null
  }
}
