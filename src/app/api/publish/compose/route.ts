import { NextRequest, NextResponse } from 'next/server'
import { sameOriginRequest } from '@/lib/security/request-origin'
import { buildPublishBundle, renderPublishBundleImages } from '@/lib/services/publish-bundle.service'

export async function POST(request: NextRequest) {
  if (!sameOriginRequest(request)) return NextResponse.json({ success:false,error:'不接受跨站生成发布内容' },{status:403})
  try {
    const body = await request.json()
    const reportIds = Array.isArray(body.reportIds) ? body.reportIds.filter((item:unknown):item is string=>typeof item==='string') : []
    const bundle = await buildPublishBundle(reportIds)
    const imageDataUrls = await renderPublishBundleImages(bundle)
    return NextResponse.json({ success:true,bundle,imageDataUrls })
  } catch (error) {
    return NextResponse.json({ success:false,error:error instanceof Error?error.message:'生成发布内容失败' },{status:400})
  }
}
