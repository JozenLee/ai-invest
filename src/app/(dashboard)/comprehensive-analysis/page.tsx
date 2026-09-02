'use client'

import { ComprehensiveAnalysisFlow } from '@/components/analysis/ComprehensiveAnalysisFlow'
import { Lightbulb } from 'lucide-react'

export default function ComprehensiveAnalysisPage() {
  return (
    <div className="space-y-6 p-6">
      {/* 页面标题 */}
      <div>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Lightbulb className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">综合分析</h1>
            <p className="text-muted-foreground mt-1">
              基于可恢复工作流引擎，提供健壮的多维度投资分析
            </p>
          </div>
        </div>
      </div>

      {/* 主内容区 */}
      <ComprehensiveAnalysisFlow />
    </div>
  )
}
