import { NextResponse } from 'next/server'
import { readStoredCapitalFlow } from '@/lib/stored-market-data'
export const dynamic = 'force-dynamic'
export async function GET() { const result = await readStoredCapitalFlow(); return NextResponse.json({ success: result.success, sectors: [...(result.data?.topInflowSectors || []), ...(result.data?.topOutflowSectors || [])], source: result.source }) }
