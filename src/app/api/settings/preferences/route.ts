import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

export async function GET() {
  const preferences = await prisma.userPreferences.findFirst()

  if (!preferences) {
    return NextResponse.json({
      showEstimatedData: true,
      showDataQualityBadge: true,
      autoRefreshInterval: 300000,
    })
  }

  return NextResponse.json(preferences)
}

export async function POST(request: Request) {
  const body = await request.json()

  const preferences = await prisma.userPreferences.upsert({
    where: { id: body.id || 'default' },
    update: body,
    create: { ...body, id: 'default' },
  })

  return NextResponse.json(preferences)
}
