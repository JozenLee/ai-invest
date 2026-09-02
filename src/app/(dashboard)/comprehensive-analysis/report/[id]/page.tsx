'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, FileText, Calendar, Loader2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

interface Report {
  id: string
  type: string
  industryId: string
  industryName: string
  title: string
  summary: string
  content: string
  createdAt: string
}

export default function ComprehensiveReportPage() {
  const params = useParams()
  const router = useRouter()
  const reportId = params.id as string

  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const res = await fetch(`/api/analysis/reports/${reportId}`)
        if (!res.ok) throw new Error('Failed to fetch report')
        const data = await res.json()
        setReport(data)
      } catch (error) {
        console.error('Failed to fetch report:', error)
      } finally {
        setLoading(false)
      }
    }

    if (reportId) {
      fetchReport()
    }
  }, [reportId])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>加载报告中...</span>
        </div>
      </div>
    )
  }

  if (!report) {
    return (
      <div className="space-y-6 p-6">
        <Card className="p-8">
          <div className="text-center text-muted-foreground">
            <p>报告不存在或已被删除</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => router.push('/comprehensive-analysis')}
            >
              返回综合分析
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* 顶部导航 */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/comprehensive-analysis')}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回
        </Button>
      </div>

      {/* 报告头部 */}
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <CardTitle className="text-2xl">{report.title}</CardTitle>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4" />
                  <span>{new Date(report.createdAt).toLocaleString('zh-CN')}</span>
                </div>
                <Badge variant="secondary">{report.industryName}</Badge>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6">
          {/* 报告内容 - Markdown渲染 */}
          <div className="prose prose-slate dark:prose-invert max-w-none">
            <ReactMarkdown>{report.content}</ReactMarkdown>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
