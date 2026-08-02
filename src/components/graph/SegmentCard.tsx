'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CompanyCard } from './CompanyCard'
import type { Segment } from '@/types/industry-graph'

interface SegmentCardProps {
  segment: Segment
  onCompanyClick?: (companyId: string) => void
}

export function SegmentCard({ segment, onCompanyClick }: SegmentCardProps) {
  return (
    <Card className="bg-slate-50">
      <CardHeader className="pb-3">
        <div className="space-y-2">
          <CardTitle className="text-sm font-semibold text-slate-900">
            {segment.name}
          </CardTitle>
          {segment.description && (
            <p className="text-xs text-muted-foreground">
              {segment.description}
            </p>
          )}
          {segment.keyCategories && segment.keyCategories.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {segment.keyCategories.map((category, idx) => (
                <Badge key={idx} variant="outline" className="text-xs">
                  {category}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {segment.companies.length > 0 ? (
          segment.companies.map((company) => (
            <CompanyCard
              key={company.id}
              company={company}
              onClick={() => onCompanyClick?.(company.id)}
            />
          ))
        ) : (
          <div className="text-center text-sm text-muted-foreground py-4">
            暂无企业数据
          </div>
        )}
      </CardContent>
    </Card>
  )
}
