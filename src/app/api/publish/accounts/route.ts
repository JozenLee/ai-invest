import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

function parseTopics(value: string) {
  try {
    const topics = JSON.parse(value)
    return Array.isArray(topics) ? topics : []
  } catch {
    return []
  }
}

function serializeAccount(account: {
  id: string
  displayName: string
  accountId: string
  authType: string
  appId: string | null
  appSecret: string | null
  redirectUri: string | null
  accessToken: string | null
  refreshToken: string | null
  tokenExpiresAt: Date | null
  defaultVisibility: string
  allowComments: boolean
  watermarkEnabled: boolean
  defaultTopics: string
  enabled: boolean
  lastVerifiedAt: Date | null
  lastVerifyError: string | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: account.id,
    displayName: account.displayName,
    accountId: account.accountId,
    authType: account.authType,
    hasAppCredentials: Boolean(account.appId && account.appSecret),
    redirectUri: account.redirectUri,
    hasAccessToken: Boolean(account.accessToken),
    hasRefreshToken: Boolean(account.refreshToken),
    tokenExpiresAt: account.tokenExpiresAt?.toISOString() || null,
    defaultVisibility: account.defaultVisibility,
    allowComments: account.allowComments,
    watermarkEnabled: account.watermarkEnabled,
    defaultTopics: parseTopics(account.defaultTopics),
    enabled: account.enabled,
    isConfigured: account.enabled && account.authType === 'personal_app',
    lastVerifiedAt: account.lastVerifiedAt?.toISOString() || null,
    lastVerifyError: account.lastVerifyError,
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  }
}

export async function GET() {
  const accounts = await prisma.xiaohongshuAccount.findMany({ orderBy: { updatedAt: 'desc' } })
  return NextResponse.json({ success: true, accounts: accounts.map(serializeAccount) })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : ''
  const accountId = typeof body.accountId === 'string' ? body.accountId.trim() : ''
  if (!displayName) {
    return NextResponse.json(
      { success: false, error: '个人账号名称不能为空' },
      { status: 400 },
    )
  }

  const normalizedAccountId = accountId || displayName

  const accountData = {
      displayName,
      accountId: normalizedAccountId,
      authType: 'personal_app',
      appId: null,
      appSecret: null,
      redirectUri: null,
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
      defaultVisibility: body.defaultVisibility === 'public' ? 'public' : 'private',
      allowComments: body.allowComments !== false,
      watermarkEnabled: body.watermarkEnabled !== false,
      defaultTopics: JSON.stringify(Array.isArray(body.defaultTopics) ? body.defaultTopics.filter((topic: unknown) => typeof topic === 'string') : []),
      lastVerifiedAt: body.verified === true ? new Date() : undefined,
      lastVerifyError: body.verified === true ? null : undefined,
  }

  const existingAccount = await prisma.xiaohongshuAccount.findFirst({ where: { accountId: normalizedAccountId } })
  const account = existingAccount
    ? await prisma.xiaohongshuAccount.update({
        where: { id: existingAccount.id },
        data: {
          displayName: accountData.displayName,
          authType: accountData.authType,
          enabled: true,
          lastVerifiedAt: accountData.lastVerifiedAt,
          lastVerifyError: accountData.lastVerifyError,
        },
      })
    : await prisma.xiaohongshuAccount.create({ data: accountData })

  return NextResponse.json({ success: true, account: serializeAccount(account) }, { status: existingAccount ? 200 : 201 })
}
