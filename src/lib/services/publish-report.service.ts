import { prisma } from '@/lib/db'
import { parseSocialReport, socialMarkdown } from '@/lib/analysis/social-report'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { renderReportPoster } from '@/lib/analysis/report-poster'

export async function preparePublicReport(reportId: string) {
  const report = await prisma.aIAnalysisReport.findUniqueOrThrow({ where: { id: reportId } })
  const data = JSON.parse(report.dataJson || '{}')
  if (report.type !== 'comprehensive' || !data.metadata?.runId || !data.socialReport) throw new Error('只能发布综合分析已生成的社媒报告')
  const social = parseSocialReport(JSON.stringify(data.socialReport))
  const directory = path.join(process.cwd(), '.runtime', 'publish', report.id)
  await mkdir(directory,{recursive:true})
  const svg = renderReportPoster(social, { industry: report.industryName || '产业观察', date: new Date(report.createdAt).toISOString().slice(0,10) })
  const imagePath = path.join(directory, 'one-page.png')
  await sharp(Buffer.from(svg)).png().toFile(imagePath)
  const images = [imagePath]
  const body = socialMarkdown(social).replace(/^#+\s*/gm,'').replace(/\n*仅供研究交流，不构成投资建议。\s*$/, '')
  return {reportId,runId:data.metadata.runId,title:Array.from(social.title).slice(0,20).join(''),content:Array.from(body).slice(0,940).join('')+'\n仅供研究交流，不构成投资建议。',images}
}
