'use client'

import { use, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Download, Edit3, Network, RefreshCw } from 'lucide-react'
import { useSwimLaneData } from '@/hooks/useSwimLaneData'
import { IndustryMatchButton } from '@/components/graph/IndustryMatchButton'
import { IndustryGraphWorkspace } from '@/components/graph/IndustryGraphWorkspace'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import html2canvas from 'html2canvas'

interface PageProps {
  params: Promise<{ id: string }>
}

interface MatchDetail {
  nodeId: string
  nodeName: string
  etfCount: number
  indexCount: number
  success: boolean
  etfs?: Array<{
    code: string
    name: string
    relevance: number
    reasoning: string
  }>
  indices?: Array<{
    code: string
    name: string
    relevance: number
    reasoning: string
  }>
}

export default function IndustryDetailPage({ params }: PageProps) {
  const { id } = use(params)
  const router = useRouter()
  const { data, isLoading, error, refetch } = useSwimLaneData({ industryId: id })
  const graphRef = useRef<HTMLDivElement>(null)
  const [matchResults, setMatchResults] = useState<Record<string, MatchDetail>>({})

  const handleCompanyClick = (companyId: string) => {
    console.debug('Company selected:', companyId)
  }

  const handleDownloadImage = async () => {
    if (!graphRef.current || !data) return

    try {
      // 显示下载提示
      const canvas = await html2canvas(graphRef.current, {
        backgroundColor: '#ffffff',
        scale: 2, // 提高分辨率
        logging: false,
        useCORS: true,
      })

      // 转换为图片并下载
      const link = document.createElement('a')
      link.download = `${data.industry.name}-泳道图-${new Date().toISOString().split('T')[0]}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch (error) {
      console.error('下载图片失败:', error)
      alert('下载图片失败，请重试')
    }
  }

  const handleMatchComplete = (results?: MatchDetail[]) => {
    if (results) {
      const resultsMap: Record<string, MatchDetail> = {}
      results.forEach(result => {
        resultsMap[result.nodeId] = result
      })
      setMatchResults(resultsMap)
    }
    // 重新获取数据以加载保存到数据库的匹配结果
    refetch()
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/graph')}
            className="-ml-2 mb-2 min-h-10 gap-2"
          >
            <ArrowLeft className="size-4" />
            返回图谱列表
          </Button>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            <Network className="size-3.5" aria-hidden="true" />
            Industry knowledge graph
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">产业链泳道图</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data ? `${data.industry.name} · 按阶段、环节、企业与投资映射逐层探索` : '按产业链层级加载结构与关系'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            className="min-h-10 gap-2"
            onClick={refetch}
            disabled={isLoading}
          >
            <RefreshCw className={`size-4 ${isLoading ? 'animate-spin' : ''}`} />
            刷新数据
          </Button>
          <Button
            variant="outline"
            className="min-h-10 gap-2"
            onClick={() => router.push(`/graph/edit/${id}`)}
            disabled={isLoading || !!error || !data}
          >
            <Edit3 className="size-4" />
            编辑图谱
          </Button>
          {data && (
            <IndustryMatchButton
              industryId={id}
              industryName={data.industry.name}
              onMatchComplete={handleMatchComplete}
            />
          )}
          <Button
            variant="outline"
            className="min-h-10 gap-2"
            onClick={handleDownloadImage}
            disabled={isLoading || !!error || !data}
          >
            <Download className="size-4" />
            下载图片
          </Button>
        </div>
      </header>

      {isLoading && (
        <div className="space-y-4" role="status" aria-label="正在加载知识图谱">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)}
          </div>
          <Skeleton className="h-[620px] rounded-xl" />
        </div>
      )}

      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={refetch}>重试</Button>
          </AlertDescription>
        </Alert>
      )}

      {!isLoading && !error && !data && (
        <Alert>
          <AlertDescription>暂无可展示的产业图谱数据。</AlertDescription>
        </Alert>
      )}

      {!isLoading && !error && data && (
        <div ref={graphRef}>
          <IndustryGraphWorkspace
            data={data}
            onCompanyClick={handleCompanyClick}
            matchResults={matchResults}
          />
        </div>
      )}
    </div>
  )
}
