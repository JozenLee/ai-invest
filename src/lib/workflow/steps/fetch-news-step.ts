import { prisma } from '@/lib/db'
import { getNewsTaxonomy, matchesNewsIndustry } from '@/lib/news-taxonomy'
import type { StepDefinition } from '../types'
export const fetchNewsStep: StepDefinition = {
  name: 'fetch-news', description: '读取并清洗已入库资讯', dependencies: ['fetch-etfs'], estimatedDuration: 1000,
  async execute(context) {
    const industry = context.artifacts.get('industry-info') as any
    const codes = new Set((await getNewsTaxonomy()).filter(row => row.industry_id === industry.id).map(row => row.segment_code))
    if (!codes.size) throw new Error('该产业没有有效分类词典，停止资讯分析以避免混入无关资讯')
    const candidates = await prisma.newsArticle.findMany({ where: { aiProcessed: true, publishTime: { gte: new Date(Date.now() - 30 * 86400000), lte: new Date() }, OR: [...codes].map(code => ({ segmentCodes: { contains: JSON.stringify(code) } })) }, orderBy: { publishTime: 'desc' }, take: 100 })
    const rows = candidates.filter(row => matchesNewsIndustry(row.segmentCodes, codes))
    const meaningful = rows.filter(row => { const body = (row.content || '').replace(/\s+/g, '').trim(); return body.length >= 80 && body !== row.title.replace(/\s+/g, '').trim() })
    const articles = [...new Map(meaningful.filter((row) => row.title.trim() && row.source && !/基因芯片|育种|生物芯片/.test(row.title)).map((row) => [row.title.trim(), row])).values()].slice(0, 50)
    await context.saveArtifact('news-evidence-gaps', { fetched: rows.length, excludedWithoutSubstantiveBody: rows.length - meaningful.length, usable: articles.length, rule: '正文至少80字且不是标题复制；正文缺失只记录缺口，不用于AI事实推断' }, 'DATA')
    const scored = articles.filter((row) => row.sentiment !== null && Number.isFinite(row.sentiment))
    const summary = { totalNews: articles.length, scoredNews: scored.length, positive: scored.filter((row) => row.sentiment! > 0.3).length, negative: scored.filter((row) => row.sentiment! < -0.3).length, neutral: scored.filter((row) => Math.abs(row.sentiment!) <= 0.3).length, avgSentiment: scored.length ? scored.reduce((sum, row) => sum + row.sentiment!, 0) / scored.length : null }
    await context.saveArtifact('news-articles', articles, 'DATA')
    await context.saveArtifact('news-trends', { hot_keywords: [], sentiment_summary: summary }, 'DATA')
    await context.saveArtifact('news-sentiment', summary, 'DATA')
    await context.updateProgress(1, 1, '已清洗 ' + articles.length + ' 条本地资讯；未评分不视为中性')
  }
}
