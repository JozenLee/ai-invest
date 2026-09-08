import { NextResponse } from 'next/server'
import { readCurrentCapitalFlow } from '@/lib/stored-market-data'
export const dynamic = 'force-dynamic'
export async function GET() { return NextResponse.json(await readCurrentCapitalFlow()) }
