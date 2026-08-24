'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowLeft, CalendarDays, ExternalLink, FileText, Network } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { localizeUserFacingText } from '@/lib/analysis/report-contract'
import { normalizeComprehensiveReportContent } from '@/lib/analysis/report-content'

interface Report {
  id: string
  type: string
  industryId: string
  industryName: string
  title: string
  summary?: string | null
  content: string
  createdAt: string
  data?: unknown
}

interface NewsItem {
  title: string
  summary?: string
  content?: string
  published_at?: string
  publish_time?: string
  source?: string
  url?: string
}

interface GraphStageSummary {
  name: string
  segments: string[]
  companyCount: number
}

interface GraphContext {
  stages: GraphStageSummary[]
  totalSegments: number
  totalCompanies: number
  companyNames: string[]
}

interface NewsReportData {
  news?: NewsItem[]
  graph?: GraphContext | null
}

interface CompanySummary {
  name?: string
  symbol?: string
  node_refs?: Array<{ stage_name?: string; segment_name?: string }>
  price_metrics?: {
    current_price?: number | null
    price_change_pct?: number | null
    latest_change_pct?: number | null
    volatility?: number | null
    max_drawdown?: number | null
    trend?: string
  }
  financial_metrics?: { revenue_growth?: number | null; profit_growth?: number | null }
  valuation_metrics?: { pe?: number | null; pb?: number | null; ps?: number | null }
  financial_quality?: { gross_margin?: number | null; net_margin?: number | null; operating_cash_flow?: number | null; available?: boolean }
  relative_price_change_pct?: number | null
  score_breakdown?: Record<string, number | null>
  overall_score?: number | null
  confidence_grade?: string
  announcement_count?: number
  important_announcements?: number
  composite_score?: number
  announcement_samples?: Array<{ title?: string; date?: string; url?: string; event_type?: string }>
  latest_announcement_samples?: Array<{ title?: string; date?: string; url?: string; event_type?: string }>
}

interface CompanyReportData {
  total_companies?: number
  analyzed_companies?: number
  graph?: {
    stage_count?: number
    segment_count?: number
    company_count?: number
    stages?: Array<{ name?: string; segments?: string[]; company_count?: number }>
  }
  data_coverage?: {
    graph_companies?: number
    analyzed_companies?: number
    quote_coverage?: number
    financial_coverage?: number
    announcement_coverage?: number
    companies_with_any_data?: number
    quote_coverage_pct?: number
    financial_coverage_pct?: number
    announcement_coverage_pct?: number
    coverage_grade?: { quote?: string; financial?: string; announcement?: string }
    conclusion_scope?: string
    analysis_started_at?: string
    analyzed_at?: string
    quote_period_start?: string | null
    quote_period_end?: string | null
    financial_period_latest?: string | null
    announcement_period_start?: string | null
    announcement_period_end?: string | null
  }
  source?: { provider?: string; adapter?: string; note?: string }
  top_companies?: CompanySummary[]
  segment_analysis?: Array<{ segment?: string; companies?: number; quote_companies?: number; quote_coverage_pct?: number; average_change?: number | null; financial_companies?: number; announcements?: number; coverage_grade?: string }>
}

function getNewsReportData(value: unknown): NewsReportData {
  if (!value || typeof value !== 'object') return {}
  return value as NewsReportData
}

function getCompanyReportData(value: unknown): CompanyReportData {
  if (!value || typeof value !== 'object') return {}
  return value as CompanyReportData
}

function formatNewsTime(value: string) {
  if (!value) return '时间未知'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN')
}

function getReportSummary(summary?: string | null) {
  if (!summary) return null
  return summary.replace(/\s*Markdown\s*/gi, '').replace(/\s{2,}/g, ' ').trim()
}

const typeLabels: Record<string, string> = {
  market: '大盘趋势',
  news: '资讯与产业链',
  company: '企业发展趋势',
  comprehensive: '综合分析',
}

export default function AnalysisReportPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const reportId = params.id
    if (!reportId) return

    async function loadReport() {
      try {
        const response = await fetch(`/api/analysis/reports/${reportId}`)
        const payload = await response.json().catch(() => ({}))
        if (!response.ok || payload.success === false) {
          throw new Error(payload.error || '读取报告失败')
        }
        setReport(payload.report)
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : '读取报告失败')
      } finally {
        setLoading(false)
      }
    }

    loadReport()
  }, [params.id])

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-10 w-28" />
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="h-[520px] w-full" />
      </div>
    )
  }

  if (error || !report) {
    return (
      <div className="space-y-6 p-6">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回
        </Button>
        <Alert variant="destructive">
          <AlertDescription>{error || '报告不存在'}</AlertDescription>
        </Alert>
      </div>
    )
  }

  const newsData = report.type === 'news' ? getNewsReportData(report.data) : {}
  const news = newsData.news || []
  const graph = newsData.graph
  const companyData = report.type === 'company' ? getCompanyReportData(report.data) : {}
  const reportSummary = getReportSummary(report.summary)
  const reportContent = report.type === 'comprehensive' ? normalizeComprehensiveReportContent(report.content, report.data) : report.content

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Button variant="ghost" onClick={() => router.back()} className="mb-2 -ml-3">
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回分析页
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{typeLabels[report.type] || 'AI分析报告'}</Badge>
            <span className="text-sm text-muted-foreground">{report.industryName}</span>
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{report.title}</h1>
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            {new Date(report.createdAt).toLocaleString('zh-CN')}
          </div>
        </div>
        <Button variant="outline" onClick={() => router.push('/analysis')} className="shrink-0 gap-2">
          <FileText className="h-4 w-4" />
          返回 AI 分析
        </Button>
      </div>

      {report.type === 'news' && (news.length > 0 || graph) && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">分析依据与产业链上下文</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-lg border bg-muted/20 p-3">
                  <div className="text-2xl font-semibold">{news.length}</div>
                  <div className="text-xs text-muted-foreground">匹配资讯</div>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <div className="text-2xl font-semibold">{graph?.stages.length || 0}</div>
                  <div className="text-xs text-muted-foreground">产业链阶段</div>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <div className="text-2xl font-semibold">{graph?.totalSegments || 0}</div>
                  <div className="text-xs text-muted-foreground">产业链环节</div>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <div className="text-2xl font-semibold">{graph?.totalCompanies || 0}</div>
                  <div className="text-xs text-muted-foreground">关联企业</div>
                </div>
              </div>

              {news.length > 0 && (
                <div className="order-2 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold">近期资讯样本</h3>
                      <p className="text-xs text-muted-foreground">这部分内容是本次分析参考的新闻信息</p>
                    </div>
                    <Badge variant="secondary">{news.length} 条</Badge>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {news.map((item, index) => {
                      const summary = item.summary || item.content || '暂无摘要'
                      const content = summary.length > 220 ? `${summary.slice(0, 220)}...` : summary

                      return (
                        <div key={`${item.title}-${index}`} className="rounded-lg border p-3">
                          <div className="flex items-start justify-between gap-3">
                            <h4 className="line-clamp-2 text-sm font-medium">{item.title}</h4>
                            {item.url && (
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={`打开资讯：${item.title}`}
                                className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            )}
                          </div>
                          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{content}</p>
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            {item.source && <Badge variant="outline">{item.source}</Badge>}
                            <span>{formatNewsTime(item.published_at || item.publish_time || '')}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {graph && graph.stages.length > 0 && (
                <div className="order-1 rounded-lg border bg-muted/20 p-4">
                  <div className="flex items-center gap-2">
                    <Network className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold">产业图谱上下文</h3>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {graph.stages.map((stage) => (
                      <Badge key={stage.name} variant="outline" className="h-auto py-1">
                        {stage.name} · {stage.segments.slice(0, 3).join('、') || '暂无环节'}
                        {stage.segments.length > 3 ? '…' : ''}
                      </Badge>
                    ))}
                  </div>
                  {graph.companyNames.length > 0 && (
                    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                      代表企业：{graph.companyNames.slice(0, 12).join('、')}
                      {graph.companyNames.length > 12 ? '等' : ''}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {report.type === 'company' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">企业分析依据与数据覆盖</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              {[
                ['图谱企业', companyData.data_coverage?.graph_companies ?? companyData.total_companies ?? 0],
                ['完成分析', companyData.data_coverage?.analyzed_companies ?? companyData.analyzed_companies ?? 0],
                ['行情覆盖', companyData.data_coverage?.quote_coverage ?? 0],
                ['财报覆盖', companyData.data_coverage?.financial_coverage ?? 0],
                ['公告覆盖', companyData.data_coverage?.announcement_coverage ?? 0],
                ['有数据企业', companyData.data_coverage?.companies_with_any_data ?? 0],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border bg-muted/20 p-3">
                  <div className="text-2xl font-semibold tabular-nums">{value}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
            <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
              覆盖可信度：行情 {companyData.data_coverage?.coverage_grade?.quote || '暂无'}、财报 {companyData.data_coverage?.coverage_grade?.financial || '暂无'}、公告 {companyData.data_coverage?.coverage_grade?.announcement || '暂无'}。{companyData.data_coverage?.conclusion_scope || ''}
              <div className="mt-2">分析时间：{companyData.data_coverage?.analysis_started_at || '暂无'} 至 {companyData.data_coverage?.analyzed_at || '暂无'}；行情：{companyData.data_coverage?.quote_period_start || '暂无'} 至 {companyData.data_coverage?.quote_period_end || '暂无'}；最新财报：{companyData.data_coverage?.financial_period_latest || '暂无'}；公告：{companyData.data_coverage?.announcement_period_start || '暂无'} 至 {companyData.data_coverage?.announcement_period_end || '暂无'}</div>
            </div>

            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="flex items-center gap-2"><Network className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">知识图谱上下文</h3></div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="outline">阶段 {companyData.graph?.stage_count || 0}</Badge>
                <Badge variant="outline">环节 {companyData.graph?.segment_count || 0}</Badge>
                {(companyData.graph?.stages || []).map((stage, index) => <Badge key={`${stage.name}-${index}`} variant="secondary">{stage.name || '未命名阶段'} · {stage.company_count || 0} 家企业</Badge>)}
              </div>
              {companyData.source?.note && <p className="mt-3 text-xs leading-relaxed text-muted-foreground">数据源：{companyData.source.provider || '企业数据适配器'}。{companyData.source.note}</p>}
            </div>

            {companyData.segment_analysis && companyData.segment_analysis.length > 0 && <div className="overflow-x-auto rounded-lg border"><table className="w-full text-left text-xs"><thead className="bg-muted/40"><tr><th className="p-2">产业链环节</th><th className="p-2">企业/行情覆盖</th><th className="p-2">平均涨跌</th><th className="p-2">财报覆盖</th><th className="p-2">公告量</th><th className="p-2">可信度</th></tr></thead><tbody>{companyData.segment_analysis.map((segment) => <tr key={segment.segment} className="border-t"><td className="p-2 font-medium">{segment.segment || '未标注环节'}</td><td className="p-2">{segment.companies ?? 0} / {segment.quote_companies ?? 0}（{segment.quote_coverage_pct ?? 0}%）</td><td className="p-2">{segment.average_change == null ? '暂无' : `${segment.average_change >= 0 ? '+' : ''}${segment.average_change}%`}</td><td className="p-2">{segment.financial_companies ?? 0}</td><td className="p-2">{segment.announcements ?? 0}</td><td className="p-2">{segment.coverage_grade || '暂无'}</td></tr>)}</tbody></table></div>}

            {companyData.top_companies && companyData.top_companies.length > 0 && (
              <div>
                <div className="mb-3 flex items-center justify-between"><div><h3 className="text-sm font-semibold">重点企业样本</h3><p className="text-xs text-muted-foreground">以下企业用于支撑报告中的重点观察，不代表完整企业清单</p></div><Badge variant="secondary">{companyData.top_companies.length} 家</Badge></div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {companyData.top_companies.map((company, index) => {
                    const price = company.price_metrics?.price_change_pct
                    const currentPrice = company.price_metrics?.current_price
                    const volatility = company.price_metrics?.volatility
                    const drawdown = company.price_metrics?.max_drawdown
                    const revenueGrowth = company.financial_metrics?.revenue_growth
                    const profitGrowth = company.financial_metrics?.profit_growth
                    return <div key={`${company.symbol || company.name}-${index}`} className="rounded-lg border p-3"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-medium">{company.name || '未命名企业'}</div><div className="mt-1 text-xs text-muted-foreground">{company.symbol || '无证券代码'}{company.node_refs?.[0]?.segment_name ? ` · ${company.node_refs[0].segment_name}` : ''}</div></div><Badge>{company.overall_score == null ? '暂无评分' : `${company.overall_score} 分`}</Badge></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4"><div><div className="text-muted-foreground">当前价格</div><div className="mt-1 font-semibold">{currentPrice == null ? '暂无' : currentPrice.toFixed(2)}</div></div><div><div className="text-muted-foreground">区间涨跌</div><div className={`mt-1 font-semibold ${price == null ? 'text-muted-foreground' : price >= 0 ? 'text-green-600' : 'text-red-600'}`}>{price == null ? '暂无' : `${price >= 0 ? '+' : ''}${price.toFixed(2)}%`}</div></div><div><div className="text-muted-foreground">波动/回撤</div><div className="mt-1 font-semibold">{volatility == null && drawdown == null ? '暂无' : `${volatility == null ? '-' : `${volatility.toFixed(1)}%`} / ${drawdown == null ? '-' : `${drawdown.toFixed(1)}%`}`}</div></div><div><div className="text-muted-foreground">重要公告</div><div className="mt-1 font-semibold">{company.important_announcements ?? 0} 条</div></div></div><div className="mt-2 text-xs"><span className="text-muted-foreground">营收/利润增长：</span><span className="font-semibold">{revenueGrowth == null && profitGrowth == null ? '暂无' : `${revenueGrowth == null ? '-' : `${revenueGrowth.toFixed(1)}%`} / ${profitGrowth == null ? '-' : `${profitGrowth.toFixed(1)}%`}`}</span></div><div className="mt-2 text-xs text-muted-foreground">相对所在环节：{company.relative_price_change_pct == null ? '暂无' : `${company.relative_price_change_pct >= 0 ? '+' : ''}${company.relative_price_change_pct}%`}；评分置信度：{company.confidence_grade || '暂无'}</div>{company.score_breakdown && <div className="mt-2 text-xs text-muted-foreground">评分拆解：行情 {company.score_breakdown.market ?? '暂无'} / 财报 {company.score_breakdown.financial ?? '暂无'} / 公告 {company.score_breakdown.announcement ?? '暂无'} / 稳定性 {company.score_breakdown.stability ?? '暂无'} / 完整性 {company.score_breakdown.data_completeness ?? '暂无'}</div>}{(company.latest_announcement_samples || company.announcement_samples || []).length > 0 && <div className="mt-3 border-t pt-3 text-xs text-muted-foreground"><div className="mb-1 font-medium text-foreground">公告样本</div>{(company.latest_announcement_samples || company.announcement_samples || []).slice(0, 3).map((item, itemIndex) => <div key={`${item.title}-${itemIndex}`} className="flex items-start gap-1"><span>·</span><span>{item.title || '未命名公告'}{item.date ? ` · ${item.date}` : ''}{item.event_type ? ` · ${item.event_type}` : ''}</span></div>)}</div>}</div>
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">分析报告</CardTitle>
          {reportSummary && <p className="text-sm leading-6 text-muted-foreground">{reportSummary}</p>}
        </CardHeader>
        <CardContent>
          <article className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-semibold prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-p:leading-7 prose-li:leading-7 prose-table:block prose-table:overflow-x-auto">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{localizeUserFacingText(reportContent)}</ReactMarkdown>
          </article>
        </CardContent>
      </Card>
    </div>
  )
}
