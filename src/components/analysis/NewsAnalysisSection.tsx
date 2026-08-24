'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  FileText,
  Network,
  Newspaper,
} from 'lucide-react'
import { AnalysisModuleCard } from '@/components/analysis/AnalysisModuleCard'
import { buildAIAnalysisEndpoint, getAIAnalysisModule } from '@/config/ai-analysis-modules'

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

interface NewsAnalysisSectionProps {
  industryId: string
  industryName: string
}

interface AnalysisState {
  loading: boolean
  error: string | null
  news: NewsItem[] | null
  graph: GraphContext | null
  report: string | null
  reportId: string | null
}

interface SavedReport {
  id: string
  title: string
  createdAt: string
}

function getSavedReportTitle(report: SavedReport, industryName: string) {
  const title = typeof report.title === 'string' ? report.title.trim() : ''
  return title && /[\u4e00-\u9fff]/.test(title) && !/^[a-z0-9_-]{16,}$/i.test(title)
    ? title
    : `${industryName} 资讯与产业链分析报告`
}

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' ? value as UnknownRecord : {}
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function getGraphData(payload: unknown): UnknownRecord | null {
  const record = asRecord(payload)
  const data = asRecord(record.data)
  return Array.isArray(data.stages)
    ? data
    : Array.isArray(record.stages)
      ? record
      : null
}

function summarizeGraph(payload: unknown): GraphContext {
  const graph = getGraphData(payload)
  const stages = graph && Array.isArray(graph.stages) ? graph.stages.map(asRecord) : []
  const stageSummaries: GraphStageSummary[] = stages.map((stage) => {
    const segments = Array.isArray(stage.segments) ? stage.segments.map(asRecord) : []
    const companies = segments.flatMap((segment) =>
      Array.isArray(segment.companies) ? segment.companies.map(asRecord) : []
    )

    return {
      name: asString(stage.name, '未命名阶段'),
      segments: segments.map((segment) => asString(segment.name, '未命名环节')),
      companyCount: companies.length,
    }
  })

  const companyNames: string[] = stages.flatMap((stage) =>
    (Array.isArray(stage.segments) ? stage.segments.map(asRecord) : []).flatMap((segment) =>
      (Array.isArray(segment.companies) ? segment.companies.map(asRecord) : [])
        .map((company) => asString(company.name))
        .filter(Boolean)
    )
  )

  return {
    stages: stageSummaries,
    totalSegments: stageSummaries.reduce((total, stage) => total + stage.segments.length, 0),
    totalCompanies: stageSummaries.reduce((total, stage) => total + stage.companyCount, 0),
    companyNames: Array.from(new Set(companyNames)).slice(0, 30),
  }
}

export function NewsAnalysisSection({ industryId, industryName }: NewsAnalysisSectionProps) {
  const router = useRouter()
  const [savedReports, setSavedReports] = useState<SavedReport[]>([])
  const [selectedReportId, setSelectedReportId] = useState('')
  const [state, setState] = useState<AnalysisState>({
    loading: false,
    error: null,
    news: null,
    graph: null,
    report: null,
    reportId: null,
  })
  useEffect(() => {
    let cancelled = false

    async function loadReports() {
      try {
        const response = await fetch(`/api/analysis/reports?industryId=${encodeURIComponent(industryId)}&type=news&limit=20`)
        const payload = await response.json().catch(() => ({}))
        if (!cancelled && response.ok && payload.success) {
          setSavedReports(payload.reports || [])
        }
      } catch (error) {
        console.error('Failed to load news analysis reports:', error)
      }
    }

    if (industryId) loadReports()
    return () => { cancelled = true }
  }, [industryId])

  const handleAnalyze = async () => {
    if (!industryId || !industryName) return

    setState({
      loading: true,
      error: null,
      news: null,
      graph: null,
      report: null,
      reportId: null,
    })

    try {
      const [newsResponse, graphResponse] = await Promise.all([
        fetch(
          buildAIAnalysisEndpoint(getAIAnalysisModule('news'), industryId, industryName)
        ),
        fetch(`/api/graph/industries/${industryId}/graph`),
      ])

      const newsPayload = await newsResponse.json().catch(() => ({}))
      const graphPayload = await graphResponse.json().catch(() => ({}))

      if (!newsResponse.ok || newsPayload.success === false) {
        throw new Error(newsPayload.error || '获取近期资讯失败')
      }

      const news = Array.isArray(newsPayload.news)
        ? newsPayload.news
        : Array.isArray(newsPayload.data?.news)
          ? newsPayload.data.news
          : []
      const graph = graphResponse.ok ? summarizeGraph(graphPayload) : null

      setState((current) => ({
        ...current,
        news,
        graph,
        error: graphResponse.ok ? null : '产业图谱暂时不可用，报告将只基于近期资讯生成',
      }))

      if (news.length === 0) {
        setState((current) => ({
          ...current,
          loading: false,
          error: '近期没有匹配到相关新闻，暂时无法生成资讯分析报告',
        }))
        return
      }

      const analysisResponse = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'industry_news_insight',
          data: {
            industryName,
            recentNews: news,
            graphContext: graph,
          },
        }),
      })
      const analysisPayload = await analysisResponse.json().catch(() => ({}))

      if (!analysisResponse.ok || analysisPayload.success === false) {
        throw new Error(analysisPayload.error || '生成资讯分析报告失败')
      }

      const report = analysisPayload.analysis || analysisPayload.report || ''
      const saveResponse = await fetch('/api/analysis/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'news',
          industryId,
          industryName,
          title: `${industryName} 资讯与产业链分析报告`,
          summary: `基于 ${news.length} 条近期资讯和产业链信息生成的分析报告`,
          content: report,
          data: { news, graph },
        }),
      })
      const savePayload = await saveResponse.json().catch(() => ({}))
      if (!saveResponse.ok || savePayload.success === false || !savePayload.report?.id) {
        throw new Error(savePayload.error || '分析完成，但报告保存失败')
      }

      const savedReport = savePayload.report as SavedReport
      setSavedReports((current) => [savedReport, ...current.filter((item) => item.id !== savedReport.id)].slice(0, 20))
      setSelectedReportId(savedReport.id)

      setState((current) => ({
        ...current,
        loading: false,
        error: null,
        report,
        reportId: savedReport.id,
      }))
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : '资讯分析失败，请稍后重试',
      }))
    }
  }

  return (
    <AnalysisModuleCard
      icon={Newspaper}
      title="资讯与产业链分析"
      description="结合近期新闻、产业知识图谱和产业链节点，生成可追溯的热点影响分析报告"
      loading={state.loading}
      hasResult={Boolean(state.report)}
      error={state.error}
      onAnalyze={handleAnalyze}
      steps={[
        { icon: Newspaper, label: '近期资讯', detail: '采集并筛选相关新闻', active: Boolean(state.news) },
        { icon: Network, label: '产业知识图谱', detail: '映射产业链阶段与节点', active: Boolean(state.graph) },
        { icon: FileText, label: 'AI分析报告', detail: '提炼影响、机会与风险', active: Boolean(state.report) },
      ]}
      loadingMessage="正在读取资讯与产业链节点，并整理 AI 分析上下文..."
      reportTitle="AI资讯分析报告"
      reportBadge="基于当前领域数据"
      reportDescription="报告已经生成，点击“查看完整报告”了解资讯依据、产业链信息和分析结论。"
      reportReady={Boolean(state.report && state.reportId)}
      onOpenReport={() => state.reportId && router.push(`/analysis/report/${state.reportId}`)}
      history={{
        label: '历史资讯报告',
        value: selectedReportId,
        placeholder: '选择历史报告',
        options: savedReports.map((report) => ({
          id: report.id,
          label: `${getSavedReportTitle(report, industryName)} · ${new Date(report.createdAt).toLocaleString('zh-CN', {
            month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
          })}`,
        })),
        onChange: (value) => setSelectedReportId(value || ''),
        onOpen: () => selectedReportId && router.push(`/analysis/report/${selectedReportId}`),
      }}
      emptyTitle="点击“开始分析”获取资讯与产业链解读"
      emptyDescription="分析过程会保留新闻样本和图谱上下文，方便核对报告依据"
    />
  )
}
