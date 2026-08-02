'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Company } from '@/types/industry-graph'

interface CompanyCardProps {
  company: Company
  onClick?: () => void
}

const POSITION_LABELS: Record<Company['marketPosition'], string> = {
  leader: '龙头',
  major: '主力',
  emerging: '新兴'
}

const POSITION_COLORS: Record<Company['marketPosition'], string> = {
  leader: 'bg-red-100 text-red-800 border-red-200',
  major: 'bg-blue-100 text-blue-800 border-blue-200',
  emerging: 'bg-green-100 text-green-800 border-green-200'
}

export function CompanyCard({ company, onClick }: CompanyCardProps) {
  return (
    <Card
      className="min-w-[280px] hover:shadow-md transition-shadow cursor-pointer border-l-4"
      style={{ borderLeftColor: company.marketPosition === 'leader' ? '#ef4444' : company.marketPosition === 'major' ? '#3b82f6' : '#22c55e' }}
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base font-semibold leading-tight">
            {company.name}
            {company.nameEn && (
              <div className="text-xs text-muted-foreground font-normal mt-1">
                {company.nameEn}
              </div>
            )}
          </CardTitle>
          <Badge
            variant="outline"
            className={`${POSITION_COLORS[company.marketPosition]} flex-shrink-0`}
          >
            {POSITION_LABELS[company.marketPosition]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {/* Stock Ticker */}
        {company.ticker && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">股票:</span>
            <code className="px-2 py-0.5 bg-muted rounded text-xs font-mono">
              {company.ticker}
              {company.exchange && ` (${company.exchange})`}
            </code>
          </div>
        )}

        {/* Country */}
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">国家:</span>
          <span className="font-medium">{company.country}</span>
        </div>

        {/* Key Products */}
        {company.keyProducts && company.keyProducts.length > 0 && (
          <div className="space-y-1">
            <span className="text-muted-foreground">主要产品:</span>
            <div className="flex flex-wrap gap-1">
              {company.keyProducts.map((product, idx) => (
                <Badge key={idx} variant="secondary" className="text-xs">
                  {product}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        {company.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 mt-2">
            {company.description}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
