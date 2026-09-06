'use client'

import { Suspense } from 'react'
import { AnalysisWorkspace } from '@/components/analysis/AnalysisWorkspace'

export default function ComprehensiveAnalysisPage() {
  return <Suspense fallback={<div className="p-8 text-sm text-muted-foreground" role="status">正在加载研究工作台…</div>}><AnalysisWorkspace /></Suspense>
}
