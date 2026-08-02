'use client'

import { use } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { SwimLaneGraph } from '@/components/graph/SwimLaneGraph'
import { useIndustrySwimLane } from '@/hooks/useIndustrySwimLane'

interface PageProps {
  params: Promise<{ id: string }>
}

export default function IndustryDetailPage({ params }: PageProps) {
  const { id } = use(params)
  const router = useRouter()
  const { data, isLoading, error, refetch } = useIndustrySwimLane(id)

  const handleCompanyClick = (companyId: string) => {
    // Navigate to company detail or show company modal
    console.log('Company clicked:', companyId)
    // TODO: Implement company detail navigation
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header with back button */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          返回
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">产业链泳道图</h1>
          <p className="text-sm text-muted-foreground mt-1">
            横向展示产业链各阶段、环节和企业分布
          </p>
        </div>
      </div>

      {/* Swim Lane Graph */}
      <SwimLaneGraph
        data={data}
        isLoading={isLoading}
        error={error}
        onRefetch={refetch}
        onCompanyClick={handleCompanyClick}
      />
    </div>
  )
}
