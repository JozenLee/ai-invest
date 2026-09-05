import type { Profile } from './contracts'
export function defaultProfile(industryId: string, name: string): Profile {
  return { version: 1, industryId, name, benchmark: '000300.SH', horizonDays: 20, sectors: [], segments: [], leaders: [], rules: { minHistory: 120, maxPremiumPct: 0.5, minDailyAmount: 20000000, maxSpreadBps: 20, maxVolatilityPct: 60, flowDays: 5, entryConfirmDays: 3 } }
}
export function validateProfile(value: unknown, industryId: string): Profile {
  if (!value || typeof value !== 'object') throw new Error('领域配置必须为对象')
  const p = value as Profile
  if (p.version !== 1 || p.industryId !== industryId || !p.name?.trim() || p.name.length > 80 || !/^\d{6}\.(SH|SZ|CSI)$/.test(p.benchmark)) throw new Error('领域、名称或基准指数无效')
  for (const [key, min, max] of [['minHistory',60,500],['maxPremiumPct',0,10],['minDailyAmount',100000,1e11],['maxSpreadBps',1,500],['maxVolatilityPct',5,200],['flowDays',3,20],['entryConfirmDays',1,10]] as const) {
    const n = p.rules?.[key]
    if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max || (['minHistory','flowDays','entryConfirmDays'].includes(key) && !Number.isInteger(n))) throw new Error(`${key} 必须在 ${min}–${max} 范围内`)
  }
  if (!Number.isInteger(p.horizonDays) || p.horizonDays < 1 || p.horizonDays > 120) throw new Error('观察周期为1–120个交易日')
  if (!Array.isArray(p.sectors) || p.sectors.length > 30 || p.sectors.some(s=>typeof s !== 'string' || !s.trim() || s.length > 80)) throw new Error('板块映射无效')
  if (!Array.isArray(p.segments) || p.segments.length > 30 || p.segments.some(s=>!s || typeof s.name !== 'string' || !s.name.trim() || s.name.length > 80 || !Array.isArray(s.companies) || s.companies.length > 100 || s.companies.some(c=>typeof c !== 'string' || !/^[A-Za-z0-9.]{1,20}$/.test(c)))) throw new Error('细分环节配置无效')
  if (!Array.isArray(p.leaders) || p.leaders.length > 50 || p.leaders.some(l=>!l || !/^[A-Za-z0-9.]{1,20}$/.test(l.code) || typeof l.name !== 'string' || !l.name.trim() || l.name.length > 80 || typeof l.segment !== 'string' || !p.segments.some(s=>s.name === l.segment))) throw new Error('领先企业需要有效代码、名称和已配置的细分环节')
  if (new Set(p.leaders.map(l=>l.code)).size !== p.leaders.length || new Set(p.segments.map(s=>s.name)).size !== p.segments.length) throw new Error('企业或细分环节不能重复')
  return { version:1, industryId, name:p.name.trim(), benchmark:p.benchmark, horizonDays:p.horizonDays, sectors:[...new Set(p.sectors)], segments:p.segments.map(s=>({name:s.name,companies:[...new Set(s.companies)]})), leaders:p.leaders.map(l=>({code:l.code,name:l.name,segment:l.segment})), rules:{ ...p.rules } }
}
