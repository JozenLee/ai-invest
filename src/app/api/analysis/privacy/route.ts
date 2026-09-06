import { NextResponse } from 'next/server'
export function GET() { return NextResponse.json({ destination: new URL(process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').origin, fields: '持仓名称、代码、类别与权重比例；不发送邮箱、账户金额和份额。' }) }
