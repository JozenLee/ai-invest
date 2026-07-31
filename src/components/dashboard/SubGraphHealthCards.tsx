// src/components/dashboard/SubGraphHealthCards.tsx

'use client'

import { SubGraphHealth } from '@/types/scoring'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Props {
  subGraphs: SubGraphHealth[]
}

export function SubGraphHealthCards({ subGraphs }: Props) {
  if (subGraphs.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        暂无子图数据
      </div>
    )
  }

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-green-600'
    if (score >= 50) return 'text-yellow-600'
    return 'text-red-600'
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      {subGraphs.map((sg) => (
        <Card key={sg.subGraphId} className="hover:shadow-lg transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">{sg.name}</CardTitle>
            <p className="text-xs text-muted-foreground">{sg.category}</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">平均评分</span>
                <span className={`text-lg font-bold ${getScoreColor(sg.avgScore)}`}>
                  {sg.avgScore.toFixed(1)}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">节点数</span>
                <span>{sg.nodeCount}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">活跃节点</span>
                <span className="font-medium text-primary">
                  {sg.activeNodeCount}
                </span>
              </div>
              {sg.signalCount > 0 && (
                <div className="mt-2 pt-2 border-t">
                  <span className="text-xs text-orange-600 font-medium">
                    {sg.signalCount} 个活跃信号
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
