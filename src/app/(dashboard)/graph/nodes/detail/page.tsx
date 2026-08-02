'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ETFBindingManager } from '@/components/graph/ETFBindingManager'
import { ArrowLeft, Network, TrendingUp, Tag as TagIcon, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

interface GraphNode {
  id: string
  name: string
  code: string
  type: string
  description?: string
  metadata?: any
}

interface NodeTag {
  id: string
  tagId: string
  confidence: number
  createdAt: string
  tag: {
    id: string
    name: string
    code: string
    type: string
    level: number
  }
}

function GraphNodeDetailContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const nodeId = searchParams.get('id')

  const [node, setNode] = useState<GraphNode | null>(null)
  const [tags, setTags] = useState<NodeTag[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchNodeData = async () => {
    if (!nodeId) return

    setIsLoading(true)
    try {
      // 获取节点基本信息
      const nodeResponse = await fetch(`/api/graph/nodes/${nodeId}`)
      if (nodeResponse.ok) {
        const nodeData = await nodeResponse.json()
        if (nodeData.success) {
          setNode(nodeData.data)
        }
      }

      // 获取节点标签
      const tagsResponse = await fetch(`/api/graph/nodes/${nodeId}/tags`)
      if (tagsResponse.ok) {
        const tagsData = await tagsResponse.json()
        if (tagsData.success) {
          setTags(tagsData.data)
        }
      }
    } catch (error) {
      console.error('获取节点数据失败:', error)
      toast.error('获取节点数据失败')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchNodeData()
  }, [nodeId])

  if (!nodeId) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Network className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">未指定节点</p>
            <Button className="mt-4" onClick={() => router.push('/graph/edit')}>
              返回图谱编辑
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (!node) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Network className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">节点不存在</p>
            <Button className="mt-4" onClick={() => router.push('/graph/edit')}>
              返回图谱编辑
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* 页面头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push('/graph/edit')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{node.name}</h1>
            <p className="text-muted-foreground mt-1">
              <code className="text-sm bg-muted px-2 py-0.5 rounded">{node.code}</code>
              <Badge variant="outline" className="ml-2">{node.type}</Badge>
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchNodeData}>
          <RefreshCw className="h-4 w-4 mr-2" />
          刷新
        </Button>
      </div>

      {/* 节点描述 */}
      {node.description && (
        <Card>
          <CardHeader>
            <CardTitle>节点描述</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{node.description}</p>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="etfs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="etfs">
            <TrendingUp className="h-4 w-4 mr-2" />
            ETF跟踪
          </TabsTrigger>
          <TabsTrigger value="tags">
            <TagIcon className="h-4 w-4 mr-2" />
            节点标签
          </TabsTrigger>
          <TabsTrigger value="info">
            <Network className="h-4 w-4 mr-2" />
            基本信息
          </TabsTrigger>
        </TabsList>

        {/* ETF绑定管理 */}
        <TabsContent value="etfs">
          <ETFBindingManager nodeId={node.id} nodeName={node.name} />
        </TabsContent>

        {/* 节点标签 */}
        <TabsContent value="tags">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TagIcon className="h-5 w-5" />
                节点标签
              </CardTitle>
              <CardDescription>
                AI自动提取或手动添加的分类标签
              </CardDescription>
            </CardHeader>
            <CardContent>
              {tags.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <TagIcon className="h-12 w-12 mb-4" />
                  <p>暂无标签</p>
                  <p className="text-sm mt-1">可以通过AI分析或手动添加标签</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {tags.map((nodeTag) => (
                    <div
                      key={nodeTag.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <Badge variant="default">{nodeTag.tag.name}</Badge>
                        <code className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                          {nodeTag.tag.code}
                        </code>
                        <Badge variant="outline" className="text-xs">
                          {nodeTag.tag.type}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        置信度: {(nodeTag.confidence * 100).toFixed(0)}%
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 基本信息 */}
        <TabsContent value="info">
          <Card>
            <CardHeader>
              <CardTitle>节点元数据</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="font-medium">节点ID</dt>
                  <dd className="text-muted-foreground">
                    <code className="bg-muted px-2 py-0.5 rounded">{node.id}</code>
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="font-medium">节点代码</dt>
                  <dd className="text-muted-foreground">
                    <code className="bg-muted px-2 py-0.5 rounded">{node.code}</code>
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="font-medium">节点类型</dt>
                  <dd>
                    <Badge variant="outline">{node.type}</Badge>
                  </dd>
                </div>
                {node.metadata && Object.keys(node.metadata).length > 0 && (
                  <div>
                    <dt className="font-medium mb-2">附加信息</dt>
                    <dd>
                      <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-60">
                        {JSON.stringify(node.metadata, null, 2)}
                      </pre>
                    </dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default function GraphNodeDetailPage() {
  return (
    <Suspense fallback={
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    }>
      <GraphNodeDetailContent />
    </Suspense>
  )
}
