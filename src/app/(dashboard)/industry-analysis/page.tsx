'use client'

import { IndustryAnalysis } from '@/components/analysis/IndustryAnalysis'
import { TrendingUp } from 'lucide-react'

export default function IndustryAnalysisPage() {
  return (
    <div className="space-y-6 p-6">
      {/* 页面标题 */}
      <div>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">领域分析</h1>
            <p className="text-muted-foreground mt-1">
              基于产业图谱和市场数据，深入分析特定行业的投资机会
            </p>
          </div>
        </div>
      </div>

      {/* 主内容区 */}
      <IndustryAnalysis />
    </div>
  )
}
