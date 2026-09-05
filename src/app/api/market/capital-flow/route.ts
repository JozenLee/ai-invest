import { NextResponse } from 'next/server'
import { readStoredCapitalFlow } from '@/lib/stored-market-data'
export const dynamic = 'force-dynamic'
export async function GET() { return NextResponse.json(await readStoredCapitalFlow()) }
