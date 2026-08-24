'use client'

import Link from 'next/link'
import { NodeScoreDTO } from '@/types/scoring'
import { ArrowUp, ArrowDown, Minus } from 'lucide-react'

interface Props {
  nodes: NodeScoreDTO[]
}

export function TopRisingNodesTable({ nodes }: Props) {
  if (nodes.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        暂无上升节点数据
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-border">
        <thead>
          <tr className="text-left text-sm font-medium text-muted-foreground">
            <th className="py-3 px-4">节点名称</th>
            <th className="py-3 px-4">所属子图</th>
            <th className="py-3 px-4">当前评分</th>
            <th className="py-3 px-4">趋势</th>
            <th className="py-3 px-4">关联ETF</th>
            <th className="py-3 px-4">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {nodes.map((node) => (
            <tr key={node.nodeId} className="hover:bg-muted/50">
              <td className="py-3 px-4 font-medium">{node.nodeName}</td>
              <td className="py-3 px-4 text-sm text-muted-foreground">
                {node.subGraphName}
              </td>
              <td className="py-3 px-4">
                <span className="font-semibold text-primary">
                  {node.totalScore.toFixed(1)}
                </span>
              </td>
              <td className="py-3 px-4">
                {node.trendIndicator === 'up' && (
                  <span className="inline-flex items-center text-green-600">
                    <ArrowUp className="w-4 h-4 mr-1" />
                    上升
                  </span>
                )}
                {node.trendIndicator === 'down' && (
                  <span className="inline-flex items-center text-red-600">
                    <ArrowDown className="w-4 h-4 mr-1" />
                    下降
                  </span>
                )}
                {node.trendIndicator === 'stable' && (
                  <span className="inline-flex items-center text-gray-500">
                    <Minus className="w-4 h-4 mr-1" />
                    平稳
                  </span>
                )}
              </td>
              <td className="py-3 px-4 text-sm">
                {node.relatedETFs.length > 0 ? (
                  <span>{node.relatedETFs.slice(0, 2).join(', ')}</span>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </td>
              <td className="px-4 py-3">
                <Link
                  href="/graph"
                  className="inline-flex min-h-9 items-center rounded-md px-2 text-sm text-primary transition-colors hover:bg-primary/10 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  打开图谱
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
