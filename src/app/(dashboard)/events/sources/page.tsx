'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Newspaper,
  Globe,
  Building2,
  Scale,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Info,
  ExternalLink,
  Zap,
} from 'lucide-react'

interface NewsDataSource {
  id: string
  name: string
  description: string
  category: string
  provider: string
  website: string
  updateFrequency: string
  coverage: string[]
  dataQuality: string
  status: string
}

interface DataSourceResponse {
  sources: NewsDataSource[]
  categories: string[]
  total: number
  activeCount: number
}

const categoryIcons: Record<string, React.ReactNode> = {
  '综合财经媒体': <Newspaper className="h-5 w-5" />,
  '行业专业媒体': <Building2 className="h-5 w-5" />,
  '政策与监管': <Scale className="h-5 w-5" />,
  '国际视角': <Globe className="h-5 w-5" />,
}

const categoryColors: Record<string, string> = {
  '综合财经媒体': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  '行业专业媒体': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  '政策与监管': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  '国际视角': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
}

const qualityConfig: Record<string, { label: string; color: string }> = {
  high: { label: '高质量', color: 'text-green-600' },
  medium: { label: '中等质量', color: 'text-yellow-600' },
  low: { label: '低质量', color: 'text-red-600' },
}

export default function DataSourcesPage() {
  const [data, setData] = useState<DataSourceResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  const fetchDataSources = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/datasources')
      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          setData(result.data)
        }
      }
    } catch (error) {
      console.error('获取数据源信息失败:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchDataSources()
  }, [])

  const filteredSources = selectedCategory
    ? data?.sources.filter(s => s.category === selectedCategory)
    : data?.sources

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* 页面标题 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">新闻数据源</h1>
            <p className="text-muted-foreground mt-1">
              管理和查看新闻资讯数据来源
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchDataSources}
            disabled={isLoading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        </div>

        {/* 统计卡片 */}
        {data && (
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Newspaper className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{data.total}</p>
                    <p className="text-xs text-muted-foreground">数据源总数</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-600">{data.activeCount}</p>
                    <p className="text-xs text-muted-foreground">运行中</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                    <Globe className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{data.categories.length}</p>
                    <p className="text-xs text-muted-foreground">数据类别</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                    <Zap className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">实时</p>
                    <p className="text-xs text-muted-foreground">数据更新</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 分类筛选 */}
        {data && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant={selectedCategory === null ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory(null)}
            >
              全部
            </Button>
            {data.categories.map((category) => (
              <Button
                key={category}
                variant={selectedCategory === category ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedCategory(category)}
              >
                {categoryIcons[category]}<span className="ml-1">{category}</span>
              </Button>
            ))}
          </div>
        )}

        {/* 数据源列表 */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredSources && filteredSources.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredSources.map((source) => {
              const quality = qualityConfig[source.dataQuality] || qualityConfig.medium
              return (
                <Card key={source.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`p-2 rounded-lg ${categoryColors[source.category] || 'bg-gray-100'}`}>
                          {categoryIcons[source.category] || <Newspaper className="h-5 w-5" />}
                        </div>
                        <div>
                          <CardTitle className="text-base">{source.name}</CardTitle>
                          <p className="text-xs text-muted-foreground">{source.provider}</p>
                        </div>
                      </div>
                      <div className={`flex items-center gap-1 ${quality.color}`}>
                        <span className="text-xs font-medium">{quality.label}</span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">{source.description}</p>

                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{source.category}</Badge>
                      <Badge variant="outline">
                        <Zap className="h-3 w-3 mr-1" />
                        {source.updateFrequency}
                      </Badge>
                    </div>

                    <div className="pt-2 border-t">
                      <p className="text-xs text-muted-foreground mb-1">覆盖领域：</p>
                      <div className="flex flex-wrap gap-1">
                        {source.coverage.map((item, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {item}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="pt-2 border-t">
                      <a
                        href={source.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        访问官网
                      </a>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">暂无数据源信息</p>
            </CardContent>
          </Card>
        )}

        {/* 说明卡片 */}
        <Card className="bg-muted/50">
          <CardContent className="p-6">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div className="space-y-2">
                <h3 className="font-semibold">关于新闻数据源</h3>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• <strong>综合财经媒体</strong> 提供全面的市场新闻和财经资讯</li>
                  <li>• <strong>行业专业媒体</strong> 专注于特定行业的深度分析和报道</li>
                  <li>• <strong>政策与监管</strong> 发布官方政策文件和监管动态</li>
                  <li>• <strong>国际视角</strong> 提供全球市场的新闻和分析</li>
                  <li>• 所有数据仅供参考，不构成投资建议</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  )
}
