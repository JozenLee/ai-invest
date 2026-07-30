'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Route, ArrowRight, TrendingUp, TrendingDown, Clock, X } from 'lucide-react'

export interface PathNode {
  id: string
  name: string
  type: string
}

export interface PathEdge {
  sourceId: string
  targetId: string
  relation: string
  weight: number
  direction: 'positive' | 'negative'
  lag?: string
}

export interface Path {
  nodes: PathNode[]
  edges: PathEdge[]
  totalWeight: number
  totalLag?: string
}

interface PathExplorerProps {
  sourceNode: PathNode | null
  targetNode: PathNode | null
  paths: Path[]
  onClose: () => void
  onPathHover?: (path: Path | null) => void
  onPathClick?: (path: Path) => void
}

const RELATION_LABELS: Record<string, string> = {
  supply_chain: '供应链',
  demand_driver: '需求驱动',
  technology_dependency: '技术依赖',
  capital_flow: '资金流向',
  policy_impact: '政策影响',
  indirect_supply: '间接供应'
}

const DIRECTION_ICON = {
  positive: <TrendingUp className="h-3 w-3 text-green-600" />,
  negative: <TrendingDown className="h-3 w-3 text-red-600" />
}

export function PathExplorer({
  sourceNode,
  targetNode,
  paths,
  onClose,
  onPathHover,
  onPathClick
}: PathExplorerProps) {
  const [selectedPathIndex, setSelectedPathIndex] = useState<number | null>(null)

  if (!sourceNode || !targetNode) {
    return null
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Route className="h-5 w-5" />
              路径探索
            </CardTitle>
            <CardDescription>
              从 <span className="font-medium text-foreground">{sourceNode.name}</span> 到{' '}
              <span className="font-medium text-foreground">{targetNode.name}</span>
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {paths.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            未找到从 {sourceNode.name} 到 {targetNode.name} 的传导路径
          </div>
        ) : (
          <>
            <div className="text-sm text-muted-foreground">
              找到 <span className="font-medium text-foreground">{paths.length}</span> 条传导路径
            </div>

            <Separator />

            <div className="space-y-3 max-h-96 overflow-y-auto">
              {paths.map((path, index) => (
                <div
                  key={index}
                  className={`rounded-lg border p-3 transition-all cursor-pointer ${
                    selectedPathIndex === index
                      ? 'border-primary bg-primary/5'
                      : 'hover:border-primary/50 hover:bg-accent'
                  }`}
                  onMouseEnter={() => onPathHover?.(path)}
                  onMouseLeave={() => onPathHover?.(null)}
                  onClick={() => {
                    setSelectedPathIndex(index === selectedPathIndex ? null : index)
                    onPathClick?.(path)
                  }}
                >
                  {/* Path Header */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        路径 {index + 1}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {path.nodes.length} 跳
                      </Badge>
                      {path.totalLag && (
                        <Badge variant="secondary" className="gap-1 text-xs">
                          <Clock className="h-3 w-3" />
                          {path.totalLag}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs font-medium">
                      权重: {path.totalWeight.toFixed(2)}
                    </div>
                  </div>

                  {/* Path Visualization */}
                  <div className="space-y-2">
                    {path.nodes.map((node, nodeIndex) => (
                      <div key={node.id}>
                        {/* Node */}
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-primary" />
                          <span className="text-sm font-medium">{node.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {node.type}
                          </Badge>
                        </div>

                        {/* Edge */}
                        {nodeIndex < path.edges.length && (
                          <div className="ml-1 pl-4 border-l-2 border-dashed border-muted-foreground/30 py-1">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <ArrowRight className="h-3 w-3" />
                              <span>
                                {RELATION_LABELS[path.edges[nodeIndex].relation] ||
                                  path.edges[nodeIndex].relation}
                              </span>
                              {DIRECTION_ICON[path.edges[nodeIndex].direction]}
                              <span className="text-xs">
                                (权重 {path.edges[nodeIndex].weight.toFixed(2)})
                              </span>
                              {path.edges[nodeIndex].lag && (
                                <span className="text-xs">
                                  滞后 {path.edges[nodeIndex].lag}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Expanded Details */}
                  {selectedPathIndex === index && (
                    <>
                      <Separator className="my-3" />
                      <div className="space-y-2 text-xs text-muted-foreground">
                        <div>
                          <strong>传导逻辑:</strong> 通过{' '}
                          {path.edges
                            .map(e => RELATION_LABELS[e.relation] || e.relation)
                            .join(' → ')}
                        </div>
                        <div>
                          <strong>影响方向:</strong>{' '}
                          {path.edges.every(e => e.direction === 'positive')
                            ? '全程正向传导'
                            : path.edges.every(e => e.direction === 'negative')
                            ? '全程负向传导'
                            : '混合传导（部分反向）'}
                        </div>
                        {path.totalLag && (
                          <div>
                            <strong>预计时间:</strong> {path.totalLag}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
