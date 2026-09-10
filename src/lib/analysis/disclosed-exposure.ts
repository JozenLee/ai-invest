import { securityCode } from '@/lib/research/normalization'
type Row = Record<string, unknown>
const rows = (value: unknown): Row[] => Array.isArray(value) ? value.filter(item => item && typeof item === 'object') : []

/** Canonical security identity; never merge mainland codes with HK listings. */
export const securityKey = securityCode

export function disclosedExposure(companyCodes: unknown[], holdings: unknown) {
  const codes = new Set(companyCodes.map(securityKey))
  const products = new Map<string, { ticker: string; weightPct: number; companies: string[]; periods: string[]; evidenceIds: string[] }>()
  const seen = new Set<string>()
  for (const holding of rows(holdings)) {
    const code = securityKey(holding.code || holding.stock_code)
    const ticker = String(holding.etfCode || '')
    const weight = holding.weight
    if (!codes.has(code) || !ticker || !holding.evidenceId || !/^\d{4}-\d{2}-\d{2}$/.test(String(holding.period || '')) || typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0 || weight > 100) continue
    const identity = `${ticker}:${code}`
    if (seen.has(identity)) continue
    seen.add(identity)
    const product = products.get(ticker) || { ticker, weightPct: 0, companies: [], periods: [], evidenceIds: [] }
    product.weightPct += weight
    product.companies.push(code)
    if (holding.period) product.periods.push(String(holding.period))
    if (holding.evidenceId) product.evidenceIds.push(String(holding.evidenceId))
    products.set(ticker, product)
  }
  return [...products.values()].map(product => ({ ...product, weightPct: Math.round(product.weightPct * 100) / 100,
    periods: [...new Set(product.periods)], evidenceIds: [...new Set(product.evidenceIds)],
    basis: '仅为冻结披露持仓中相关企业的权重合计；不代表实时权重、业务收入暴露或预期收益',
  }))
}

/** Resolve only unique exact frozen names; ambiguous A/H names remain unresolved. */
export function canonicalCompanyNames(values:unknown[], universe:unknown){
  const byName=new Map<string,Set<string>>()
  for(const row of rows(universe)){
    const code=securityKey(row.code||row.stockCode||row.stock_code),name=String(row.name||row.stockName||row.stock_name||'').trim()
    if(!name||!code)continue
    const codes=byName.get(name)||new Set<string>();codes.add(code);byName.set(name,codes)
  }
  const codes:string[]=[],unresolved:string[]=[]
  for(const value of values){
    const text=String(value).trim(),code=securityKey(text),matches=byName.get(text)
    if(/^\d{6}$|^\d+\.hk$/i.test(code))codes.push(code)
    else if(matches?.size===1)codes.push([...matches][0])
    else unresolved.push(text)
  }
  return {codes:[...new Set(codes)],unresolved:[...new Set(unresolved)]}
}

export function enrichCatalysts(value: Row, holdings: unknown, companies:unknown=[]): Row {
  return { ...value, catalysts: rows(value.catalysts).map(catalyst => {
    const identities=canonicalCompanyNames(Array.isArray(catalyst.affectedCompanies)?catalyst.affectedCompanies:[],[...rows(holdings),...rows(companies)])
    const exposure = disclosedExposure(identities.codes, holdings)
    return { ...catalyst, affectedCompanies:identities.codes, unresolvedCompanies:[...new Set([...identities.unresolved,...(Array.isArray(catalyst.unresolvedCompanies)?catalyst.unresolvedCompanies.filter(item=>typeof item==='string'):[])])], graphCandidateEtfs: catalyst.affectedEtfs || [],
      affectedEtfs: exposure.map(item => item.ticker), disclosedExposure: exposure,
      mappingBoundary: exposure.length ? '披露持仓已匹配，经济影响仍需验证业务关联与盈利敏感度' : '尚无直接企业持仓证据；图谱候选仅供研究，不确认受益产品',
    }
  }) }
}
