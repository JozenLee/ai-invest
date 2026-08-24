import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  await prisma.xiaohongshuAccount.delete({ where: { id } })
  return NextResponse.json({ success: true })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const account = await prisma.xiaohongshuAccount.update({
    where: { id },
    data: {
      enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
      lastVerifiedAt: body.verified === true ? new Date() : undefined,
      lastVerifyError: body.verified === true ? null : undefined,
    },
  })
  return NextResponse.json({ success: true, account: { id: account.id, enabled: account.enabled, lastVerifiedAt: account.lastVerifiedAt?.toISOString() || null } })
}
