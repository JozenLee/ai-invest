import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSubscriptionConfig } from '@/lib/subscription-config-store'
export async function GET() {
  const [config, datasets] = await Promise.all([getSubscriptionConfig(), prisma.subscriptionDataset.findMany({ include: { subscription: { select: { enabled: true } } } })])
  const data = Object.entries(config.policies).map(([key, policy]) => {
    const rows = datasets.filter((row) => row.datasetKey === key && row.enabled && row.subscription.enabled)
    const active = rows.filter((row) => ['running', 'queued'].includes(row.status))
    const next = rows.map((row) => row.nextRunAt?.getTime()).filter((time): time is number => time !== undefined).sort((a, b) => a - b)[0]
    const success = rows.map((row) => row.lastSuccessAt?.getTime()).filter((time): time is number => time !== undefined).sort((a, b) => b - a)[0]
    return { key, label: policy.label, scope: policy.scope, enabled: policy.enabled && config.scopeEnabled[policy.scope as keyof typeof config.scopeEnabled], targets: rows.length, active: active.length, failed: rows.filter((row) => ['failed', 'partial'].includes(row.status)).length, nextRunAt: next ? new Date(next).toISOString() : null, lastSuccessAt: success ? new Date(success).toISOString() : null }
  })
  return NextResponse.json({ success: true, data, serverTime: Date.now() })
}
