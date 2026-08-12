'use client'

import { use, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Download } from 'lucide-react'
import { SwimLaneGraph } from '@/components/graph/SwimLaneGraph'
import { useSwimLaneData } from '@/hooks/useSwimLaneData'
import { IndustryMatchButton } from '@/components/graph/IndustryMatchButton'
import { useRef, useState } from 'react'
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

  // 当数据加载完成时，从segment数据中提取已有的匹配结果
  useEffect(() => {
    if (data?.stages) {
      const results: Record<string, MatchDetail> = {}
      data.stages.forEach((stage: any) => {
        stage.segments?.forEach((segment: any) => {
          if (segment.matchedEtfs?.length > 0 || segment.matchedIndices?.length > 0) {
            results[segment.id] = {
              nodeId: segment.id,
              nodeName: segment.name,
              etfCount: segment.matchedEtfs?.length || 0,
              indexCount: segment.matchedIndices?.length || 0,
              success: true,
              etfs: segment.matchedEtfs || [],
              indices: segment.matchedIndices || []
            }
          }
        })
      })
      setMatchResults(results)
    }
  }, [data])

  const handleCompanyClick = (companyId: string) => {
    // Navigate to company detail or show company modal
    console.log('Company clicked:', companyId)
    // TODO: Implement company detail navigation
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
    <div className="container mx-auto py-6 space-y-6">
      {/* Header with back button and actions */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/graph')}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          返回
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">产业链泳道图</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data ? data.industry.name : '横向展示产业链各阶段、环节和企业分布'}
          </p>
        </div>
        {data && (
          <IndustryMatchButton
            industryId={id}
            industryName={data.industry.name}
            onMatchComplete={handleMatchComplete}
          />
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownloadImage}
          disabled={isLoading || !!error || !data}
        >
          <Download className="mr-2 h-4 w-4" />
          下载图片
        </Button>
      </div>

      {/* Swim Lane Graph */}
      <div ref={graphRef}>
        <SwimLaneGraph
          data={data}
          isLoading={isLoading}
          error={error}
          onRefetch={refetch}
          onCompanyClick={handleCompanyClick}
          matchResults={matchResults}
        />
      </div>
    </div>
  )
}
