import { dateKey } from './time'

/** Match the data service's canonical stock identity, including legacy HK codes. */
export function securityCode(value: unknown): string {
  const text = String(value || '').trim()
  const hk = text.match(/^(?:hk(\d+)|(\d+)\.hk)$/i)
  if (hk) return `${Number(hk[1] || hk[2])}.hk`
  return text.replace(/^(sh|sz|bj)(?=\d)/i, '').replace(/\.(sh|sz|bj)$/i, '')
}

export function securityAliases(code: string): string[] {
  if (!code.endsWith('.hk')) return [code]
  const digits = code.slice(0, -3)
  return [...new Set([code, ...[digits, digits.padStart(4, '0'), digits.padStart(5, '0')].flatMap(value => [`${value}.HK`, `${value}.hk`])])]
}

export function holdingPeriod(value: unknown): string | null {
  const direct = dateKey(value)
  if (direct) return direct
  const disclosed = String(value || '').match(/截止至[：:]\s*(\d{4}-\d{2}-\d{2})/)
  return disclosed ? dateKey(disclosed[1]) : null
}
