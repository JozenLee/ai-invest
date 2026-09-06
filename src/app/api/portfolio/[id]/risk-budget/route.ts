import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sameOriginRequest } from '@/lib/security/request-origin'

type Context = { params: Promise<{ id: string }> }
const defaults = { riskProfile: 'moderate', investHorizon: 'medium', minCashRatio: .1, maxIndustryRatio: .2, maxFundRatio: .15, maxSingleAdjustmentRatio: .05, stagedAdjustment: true }
const ratio = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback

export async function GET(_request: NextRequest, { params }: Context) {
  const { id } = await params
  const portfolio = await prisma.portfolio.findUnique({ where: { id }, include: { user: { include: { settings: true } } } })
  if (!portfolio) return NextResponse.json({ success: false, error: '投资组合不存在' }, { status: 404 })
  const value = portfolio.user.settings
  return NextResponse.json({ success: true, data: value ? { riskProfile: value.riskProfile, investHorizon: value.investHorizon, minCashRatio: value.minCashRatio, maxIndustryRatio: value.maxIndustryRatio, maxFundRatio: value.maxFundRatio, maxSingleAdjustmentRatio: value.maxSingleAdjustmentRatio, stagedAdjustment: value.stagedAdjustment } : defaults })
}

export async function PUT(request: NextRequest, { params }: Context) {
  if (!sameOriginRequest(request)) return NextResponse.json({ success: false, error: '不接受跨站修改' }, { status: 403 })
  const { id } = await params
  const portfolio = await prisma.portfolio.findUnique({ where: { id }, select: { userId: true } })
  if (!portfolio) return NextResponse.json({ success: false, error: '投资组合不存在' }, { status: 404 })
  const body = await request.json()
  const riskProfile = ['conservative', 'moderate', 'aggressive'].includes(body.riskProfile) ? body.riskProfile : defaults.riskProfile
  const investHorizon = ['short', 'medium', 'long'].includes(body.investHorizon) ? body.investHorizon : defaults.investHorizon
  const data = { riskProfile, investHorizon, minCashRatio: ratio(body.minCashRatio, defaults.minCashRatio), maxIndustryRatio: ratio(body.maxIndustryRatio, defaults.maxIndustryRatio), maxFundRatio: ratio(body.maxFundRatio, defaults.maxFundRatio), maxSingleAdjustmentRatio: ratio(body.maxSingleAdjustmentRatio, defaults.maxSingleAdjustmentRatio), stagedAdjustment: body.stagedAdjustment !== false }
  if (data.minCashRatio + data.maxIndustryRatio > 1) return NextResponse.json({ success: false, error: '现金底仓与单领域上限合计不能超过100%' }, { status: 400 })
  const saved = await prisma.userSetting.upsert({ where: { userId: portfolio.userId }, create: { userId: portfolio.userId, ...data }, update: data })
  return NextResponse.json({ success: true, data: saved })
}
