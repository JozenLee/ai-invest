'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { IndustryAnalysis } from '@/components/analysis/IndustryAnalysis'
import { InvestmentAdvice } from '@/components/analysis/InvestmentAdvice'
import { TrendingUp, Briefcase } from 'lucide-react'

export default function AIAnalysisPage() {
  const [activeTab, setActiveTab] = useState<'industry' | 'advice'>('advice')

  return (
    <div className="space-y-6 p-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">AI 投资分析</h1>
        <p className="text-muted-foreground mt-2">
          结合新闻资讯、企业动态和市场趋势，从专业投资分析师的角度提供综合分析和投资建议
        </p>
      </div>

      {/* 主内容区 */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'industry' | 'advice')}>
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="industry" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            领域分析
          </TabsTrigger>
          <TabsTrigger value="advice" className="flex items-center gap-2">
            <Briefcase className="h-4 w-4" />
            综合分析
          </TabsTrigger>
        </TabsList>

        <TabsContent value="industry" className="mt-6">
          <IndustryAnalysis />
        </TabsContent>

        <TabsContent value="advice" className="mt-6">
          <InvestmentAdvice />
        </TabsContent>
      </Tabs>
    </div>
  )
}
