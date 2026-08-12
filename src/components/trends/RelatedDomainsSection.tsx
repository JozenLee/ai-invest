import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { GitBranch, TrendingUp, TrendingDown } from 'lucide-react'
import { RelatedDomain } from '@/types/trend'
import Link from 'next/link'

interface RelatedDomainsSectionProps {
  relatedDomains: RelatedDomain[]
}

/**
 * 跨领域关联区块组件
 * 展示相关联的领域及其关联关系说明
 */
export function RelatedDomainsSection({ relatedDomains }: RelatedDomainsSectionProps) {
  if (!relatedDomains || relatedDomains.length === 0) {
    return (
      <Card className="rounded-xl shadow-sm">
        <div className="border-b p-6">
          <div className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">跨领域关联</h2>
          </div>
        </div>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground text-center py-8">
            暂无关联领域数据
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="rounded-xl shadow-sm">
      <div className="border-b p-6">
        <div className="flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-blue-600" />
          <h2 className="text-lg font-semibold">跨领域关联</h2>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          分析相关领域的关联关系和传导效应
        </p>
      </div>
      <CardContent className="p-6">
        <div className="space-y-4">
          {relatedDomains.map((domain) => {
            const Icon = domain.direction === 'positive' ? TrendingUp : TrendingDown
            const colorClass = domain.direction === 'positive'
              ? 'text-green-600 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
              : 'text-red-600 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'

            return (
              <div
                key={domain.code}
                className="p-4 rounded-lg border hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${colorClass}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <Link
                        href={`/events/trends/${domain.code}`}
                        className="font-medium hover:underline"
                      >
                        {domain.name}
                      </Link>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {domain.direction === 'positive' ? '正相关' : '负相关'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          关联度：{(domain.correlation * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed pl-12">
                  {domain.explanation}
                </p>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
