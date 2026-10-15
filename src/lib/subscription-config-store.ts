import { prisma } from '@/lib/db'
import { DEFAULT_SUBSCRIPTION_CONFIG, type SubscriptionConfig } from '@/lib/subscription-config'

export async function getSubscriptionConfig(): Promise<SubscriptionConfig> {
  const record = await prisma.subscriptionConfiguration.findUnique({ where: { id: 'global' } })
  if (record) {
    const saved = JSON.parse(record.payload) as SubscriptionConfig
    return {
      ...DEFAULT_SUBSCRIPTION_CONFIG,
      ...saved,
      storageRetention:{
        ...DEFAULT_SUBSCRIPTION_CONFIG.storageRetention,
        ...saved.storageRetention,
        rawPayloadDays:{...DEFAULT_SUBSCRIPTION_CONFIG.storageRetention.rawPayloadDays,...saved.storageRetention?.rawPayloadDays},
        rawPayloadMaxVersions:{...DEFAULT_SUBSCRIPTION_CONFIG.storageRetention.rawPayloadMaxVersions,...saved.storageRetention?.rawPayloadMaxVersions},
      },
      policies: Object.fromEntries(Object.entries(DEFAULT_SUBSCRIPTION_CONFIG.policies).map(([key, policy]) => [key, { ...policy, ...saved.policies?.[key], label: policy.label, scope: policy.scope }]))
    }
  }
  return structuredClone(DEFAULT_SUBSCRIPTION_CONFIG)
}
