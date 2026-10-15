import { prisma } from '@/lib/db'
import { createHash } from 'node:crypto'
import { ensureUnderlyingEtfSubscription } from '@/lib/portfolio-fund-subscriptions'

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'

type HoldingSeed = {
  ticker: string
  name: string
  industryDomain?: string | null
  industryDomainCode?: string | null
}

type FeeTier = { condition: string; minDays: number; maxDays: number | null; feePct: number }
type FundProfile = {
  ticker: string
  name: string
  category?: string | null
  productType?: string | null
  benchmark?: string | null
  redemptionFeeSchedule?: FeeTier[]
  source?: string
  fetchedAt?: string
  targetEtfCode?: string | null
  targetEtfName?: string | null
  mappingConfidence?: number | null
  mappingEvidence?: Array<{source?:string;url?:string;locator?:string}>
}

type Identity = {
  ticker?: string
  productType?: string
  targetEtfCode?: string
  targetIndexCode?: string
  targetIndexName?: string
  evidence?: Array<{ id?: string; source?: string; url?: string; publishedAt?: string | null; locator?: string }>
}

export type VerifiedFundProduct = {
  ticker: string
  fundType: string | null
  targetEtfCode: string | null
  targetIndexCode: string | null
  mappingSource: string | null
  mappingConfidence: number | null
  mappingEvidence: string | null
  firstObservedAt: Date
  redemptionFeePct: number | null
  redemptionFeeSource: string | null
  category: string | null
}

function parseObject(value: string | null | undefined): Record<string, unknown> {
  try { const parsed = JSON.parse(value || '{}'); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {} } catch { return {} }
}

function date(value: unknown) {
  const parsed = new Date(String(value || ''))
  return Number.isFinite(parsed.getTime()) ? parsed : null
}

function exactOfficialIdentity(identity: Identity | undefined, ticker: string) {
  return identity?.ticker === ticker && identity.evidence?.some(item => item.source === 'official-document' && item.url)
}

export function conservativeRedemptionFee(schedule: FeeTier[] | undefined, heldSince: Date, now = new Date()) {
  if (!schedule?.length) return null
  const minimumDays = Math.max(0, (now.getTime() - heldSince.getTime()) / 86_400_000)
  // firstObservedAt is a lower bound, not a purchase date. Use the highest fee
  // that can still apply for any holding period at or above that bound.
  const possible = schedule.filter(tier => tier.maxDays == null || tier.maxDays > minimumDays)
  return possible.length ? Math.max(...possible.map(tier => tier.feePct)) : null
}

async function profiles(tickers: string[]) {
  const entries = await Promise.all(tickers.map(async ticker => {
    try {
      const response = await fetch(`${DATA_SERVICE_URL}/api/fund/${encodeURIComponent(ticker)}/profile`, { cache: 'no-store', signal: AbortSignal.timeout(25_000) })
      if (!response.ok) return [ticker, null] as const
      const payload = await response.json()
      return [ticker, payload?.success && payload.data ? payload.data as FundProfile : null] as const
    } catch (error) {
      console.warn(`基金产品档案获取失败 ${ticker}:`, error)
      return [ticker, null] as const
    }
  }))
  return new Map(entries)
}

async function storedIdentities(tickers: string[]) {
  const rows = await prisma.rawPayload.findMany({
    where: { datasetKey: 'fund_identity', targetCode: { in: tickers } },
    orderBy: { fetchedAt: 'desc' },
  })
  const result = new Map<string, { identity: Identity; rawId: string; fetchedAt: Date }>()
  for (const row of rows) {
    if (!row.targetCode || result.has(row.targetCode)) continue
    const payload = parseObject(row.payload)
    const identity = payload.identity && typeof payload.identity === 'object' && !Array.isArray(payload.identity) ? payload.identity as Identity : undefined
    if (identity) result.set(row.targetCode, { identity, rawId: row.id, fetchedAt: row.fetchedAt })
  }
  return result
}

async function observedSince(portfolioId: string, tickers: string[], fallback: Date) {
  const first = new Map(tickers.map(ticker => [ticker, fallback]))
  const rows = await prisma.rawPayload.findMany({ where: { datasetKey: 'portfolio_email_backup', targetCode: portfolioId }, orderBy: { fetchedAt: 'asc' } })
  for (const row of rows) {
    const payload = parseObject(row.payload)
    const holdings = Array.isArray(payload.holdings) ? payload.holdings as Array<Record<string, unknown>> : []
    for (const holding of holdings) {
      const ticker = String(holding.ticker || '')
      if (!first.has(ticker)) continue
      const observed = date((payload.portfolio as Record<string, unknown> | undefined)?.lastSyncedAt) || row.fetchedAt
      if (observed < first.get(ticker)!) first.set(ticker, observed)
    }
  }
  return first
}

async function bindUnderlyingSubscriptions(rows: HoldingSeed[], verified: Map<string, VerifiedFundProduct>) {
  const graphRow = await prisma.rawPayload.findFirst({ where: { datasetKey: 'industry_graph' }, orderBy: { fetchedAt: 'desc' } })
  const groups = (() => { try { const value = JSON.parse(graphRow?.payload || '[]'); return Array.isArray(value) ? value as Array<Record<string, unknown>> : [] } catch { return [] } })()
  for (const holding of rows) {
    const product = verified.get(holding.ticker)
    if (!product?.targetEtfCode || (product.mappingConfidence || 0) < .8) continue
    const group = groups.find(item => item.id === holding.industryDomainCode || item.code === holding.industryDomainCode || item.name === holding.industryDomain)
    if (!group?.id) continue
    const instrument = await ensureUnderlyingEtfSubscription(product.targetEtfCode, holding.name.replace(/(?:发起式?|发起)?联接.*$/u,'').trim())
    const inferredName=holding.name.replace(/(?:发起式?|发起)?联接.*$/u,'').trim()
    if (inferredName && (!instrument.name || instrument.name === instrument.code)) await prisma.instrument.update({ where:{id:instrument.id},data:{name:inferredName} })
    const subscription = await prisma.dataSubscription.findUnique({ where: { instrumentId: instrument.id } })
    if (!subscription) continue
    let profile: Record<string, unknown> = {}
    try { profile = JSON.parse(subscription.profile || '{}') } catch { /* replace invalid legacy profile */ }
    await prisma.dataSubscription.update({ where: { id: subscription.id }, data: { profile: JSON.stringify({ ...profile, industryId: String(group.id), industryName: String(group.name || holding.industryDomain || ''), source: 'verified-portfolio-underlying' }) } })
  }
}

export async function verifyPortfolioFundProducts(portfolioId: string, holdings: HoldingSeed[], observedAt: Date): Promise<Map<string, VerifiedFundProduct>> {
  const tickers = [...new Set(holdings.map(item => item.ticker))]
  const [identities, profileMap, firstSeen] = await Promise.all([storedIdentities(tickers), profiles(tickers), observedSince(portfolioId, tickers, observedAt)])
  const result = new Map<string, VerifiedFundProduct>()
  for (const holding of holdings) {
    const identityRecord = identities.get(holding.ticker)
    const identity = identityRecord?.identity
    const profile = profileMap.get(holding.ticker)
    const official = exactOfficialIdentity(identity, holding.ticker)
    const providerVerified = !official && !!profile?.targetEtfCode && (profile.mappingConfidence || 0) >= .8 && (profile.mappingEvidence || []).filter(item=>item.url&&item.source).length >= 2
    const firstObservedAt = firstSeen.get(holding.ticker) || observedAt
    const fee = conservativeRedemptionFee(profile?.redemptionFeeSchedule, firstObservedAt)
    const evidence = official || providerVerified ? {
      identityRawPayloadId: identityRecord?.rawId || null,
      identityFetchedAt: identityRecord?.fetchedAt.toISOString() || profile?.fetchedAt || null,
      targetIndexName: identity?.targetIndexName || null,
      evidence: official ? identity?.evidence || [] : profile?.mappingEvidence || [],
      feeSchedule: profile?.redemptionFeeSchedule || [],
      feeSource: profile?.source || null,
      feeFetchedAt: profile?.fetchedAt || null,
      firstObservedAt: firstObservedAt.toISOString(),
      observationBoundary: '最早连续可观测日仅用于赎回费上界，不冒充真实申购日',
    } : null
    result.set(holding.ticker, {
      ticker: holding.ticker,
      fundType: identity?.productType || profile?.productType || null,
      targetEtfCode: official ? identity?.targetEtfCode || null : providerVerified ? profile?.targetEtfCode || null : null,
      targetIndexCode: official ? identity?.targetIndexCode || null : null,
      mappingSource: official ? 'official-document' : providerVerified ? 'provider-cross-check' : profile ? 'provider-profile' : null,
      mappingConfidence: official ? 1 : providerVerified ? profile?.mappingConfidence || .9 : profile ? .7 : null,
      mappingEvidence: evidence ? JSON.stringify(evidence) : null,
      firstObservedAt,
      redemptionFeePct: fee,
      redemptionFeeSource: fee == null ? null : 'provider-observed-floor',
      category: profile?.category || null,
    })
    if(providerVerified){
      const discovered={identity:{ticker:holding.ticker,productType:profile?.productType,targetEtfCode:profile?.targetEtfCode,evidence:profile?.mappingEvidence}}
      const payload=JSON.stringify(discovered)
      await prisma.rawPayload.create({data:{datasetKey:'fund_identity',targetCode:holding.ticker,provider:'provider-cross-check',payload,contentHash:createHash('sha256').update(payload).digest('hex')}})
    }
  }
  await bindUnderlyingSubscriptions(holdings, result)
  return result
}

export async function refreshStoredPortfolioFundProducts(portfolioId: string) {
  const portfolio = await prisma.portfolio.findUniqueOrThrow({ where:{id:portfolioId},include:{holdings:true} })
  const verified = await verifyPortfolioFundProducts(portfolioId, portfolio.holdings, portfolio.lastSyncedAt || new Date())
  await prisma.$transaction(portfolio.holdings.map(holding => {
    const product=verified.get(holding.ticker)!
    return prisma.holding.update({where:{id:holding.id},data:{
      fundType:holding.fundType||product.fundType,
      ...((holding.mappingSource==='manual')?{}:{targetEtfCode:product.targetEtfCode,targetIndexCode:product.targetIndexCode,mappingSource:product.mappingSource,mappingConfidence:product.mappingConfidence,mappingEvidence:product.mappingEvidence}),
      firstObservedAt:holding.firstObservedAt||product.firstObservedAt,
      ...((holding.redemptionFeeSource==='manual')?{}:{redemptionFeePct:product.redemptionFeePct,redemptionFeeSource:product.redemptionFeeSource}),
      ...(holding.category?{}:product.category?{category:product.category}:{}),
    }})
  }))
  return verified
}
