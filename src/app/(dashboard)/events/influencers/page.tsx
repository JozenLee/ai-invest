'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Users,
  RefreshCw,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Minus,
  Search,
  MessageSquare,
  Clock,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { Influencer, Domain } from '@/types/event'
import { EVENTS_TEXT } from '@/constants/events-text'

const platformLabels: Record<string, string> = {
  weibo: '微博',
  bilibili: 'B站',
  xiaohongshu: '小红书',
  zhihu: '知乎',
  twitter: '推特',
  wechat: '微信公众号',
  xueqiu: '雪球',
}

const platformApiMap: Record<string, string> = {
  '微博': 'weibo',
  'B站': 'bilibili',
  '小红书': 'xiaohongshu',
  '知乎': 'zhihu',
  '推特': 'twitter',
  '微信公众号': 'wechat',
  '雪球': 'xueqiu',
}

const sentimentConfig = {
  bullish: { label: '利好', color: 'default', icon: TrendingUp },
  bearish: { label: '利空', color: 'destructive', icon: TrendingDown },
  neutral: { label: '中性', color: 'secondary', icon: Minus },
}

interface InfluencerStats {
  totalInfluencers: number
  todayPosts: number
  platforms: number
  lastUpdate: string | null
}

export default function InfluencersPage() {
  const [influencers, setInfluencers] = useState<Influencer[]>([])
  const [domains, setDomains] = useState<Domain[]>([])
  const [stats, setStats] = useState<InfluencerStats>({
    totalInfluencers: 0,
    todayPosts: 0,
    platforms: 0,
    lastUpdate: null,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [platformFilter, setPlatformFilter] = useState<string>('all')
  const [domainFilter, setDomainFilter] = useState<string>('all')
  const [searchInput, setSearchInput] = useState('')

  // 获取领域数据
  const fetchDomains = async () => {
    try {
      const response = await fetch('/api/events/domains')
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setDomains(data.data)
        }
      }
    } catch (error) {
      console.error('获取领域失败:', error)
    }
  }

  // 获取大V列表
  const fetchInfluencers = async () => {
    setIsLoading(true)
    try {
      let url = '/api/events/influencers?isActive=true'
      if (platformFilter !== 'all') {
        url += `&platform=${platformApiMap[platformFilter] || platformFilter}`
      }
      if (domainFilter !== 'all') {
        url += `&domainId=${domainFilter}`
      }

      const response = await fetch(url)
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          const influencerList = data.data || []
          setInfluencers(influencerList)

          // 计算统计数据
          const platforms = new Set(influencerList.map((inf: Influencer) => inf.platform))
          const todayStart = new Date()
          todayStart.setHours(0, 0, 0, 0)

          let todayPostsCount = 0
          let latestTime: string | null = null

          influencerList.forEach((inf: Influencer) => {
            if (inf.postCount) {
              todayPostsCount += inf.postCount
            }
            if (inf.latestPostTime) {
              if (!latestTime || new Date(inf.latestPostTime) > new Date(latestTime)) {
                latestTime = inf.latestPostTime
              }
            }
          })

          setStats({
            totalInfluencers: influencerList.length,
            todayPosts: todayPostsCount,
            platforms: platforms.size,
            lastUpdate: latestTime,
          })
        }
      }
    } catch (error) {
      console.error('获取大V列表失败:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchDomains()
  }, [])

  useEffect(() => {
    fetchInfluencers()
  }, [platformFilter, domainFilter])

  const handleRefresh = () => {
    fetchInfluencers()
  }

  const handleSearch = () => {
    fetchInfluencers()
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  const formatTime = (timeStr: string) => {
    try {
      const date = new Date(timeStr)
      const now = new Date()
      const diff = now.getTime() - date.getTime()
      const hours = Math.floor(diff / (1000 * 60 * 60))
      const minutes = Math.floor(diff / (1000 * 60))

      if (hours > 24) {
        return `${Math.floor(hours / 24)}${EVENTS_TEXT.time.daysAgo}`
      } else if (hours > 0) {
        return `${hours}${EVENTS_TEXT.time.hoursAgo}`
      } else if (minutes > 0) {
        return `${minutes}${EVENTS_TEXT.time.minutesAgo}`
      } else {
        return EVENTS_TEXT.time.justNow
      }
    } catch {
      return EVENTS_TEXT.time.unknown
    }
  }

  const filteredInfluencers = influencers.filter((inf) => {
    if (searchInput) {
      const searchLower = searchInput.toLowerCase()
      return (
        inf.name.toLowerCase().includes(searchLower) ||
        inf.tags.some((tag) => tag.toLowerCase().includes(searchLower))
      )
    }
    return true
  })

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{EVENTS_TEXT.influencers.title}</h1>
          <p className="text-muted-foreground">{EVENTS_TEXT.influencers.description}</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          {EVENTS_TEXT.common.refresh}
        </Button>
      </div>

      {/* 顶部统计 */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {EVENTS_TEXT.influencers.stats.totalInfluencers}
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalInfluencers}</div>
            <p className="text-xs text-muted-foreground">
              {EVENTS_TEXT.status.active}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {EVENTS_TEXT.influencers.stats.todayPosts}
            </CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.todayPosts}</div>
            <p className="text-xs text-muted-foreground">
              {EVENTS_TEXT.units.articles}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {EVENTS_TEXT.influencers.stats.platforms}
            </CardTitle>
            <Wifi className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.platforms}</div>
            <p className="text-xs text-muted-foreground">
              {EVENTS_TEXT.influencers.filter.platformAll}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {EVENTS_TEXT.influencers.stats.lastUpdate}
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.lastUpdate ? formatTime(stats.lastUpdate) : EVENTS_TEXT.time.never}
            </div>
            <p className="text-xs text-muted-foreground">
              {EVENTS_TEXT.influencers.card.lastPost}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 搜索和筛选栏 */}
      <div className="flex flex-wrap gap-4">
        {/* 搜索框 */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={EVENTS_TEXT.influencers.filter.searchPlaceholder}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyPress={handleKeyPress}
            className="pl-10"
          />
        </div>

        {/* 平台筛选 */}
        <Select value={platformFilter} onValueChange={(value) => setPlatformFilter(value ?? 'all')}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={EVENTS_TEXT.influencers.filter.platformAll}>
              {platformFilter === 'all' ? EVENTS_TEXT.influencers.filter.platformAll :
               platformFilter === '微博' ? EVENTS_TEXT.influencers.filter.platformWeibo :
               platformFilter === '推特' ? EVENTS_TEXT.influencers.filter.platformTwitter :
               platformFilter === '微信公众号' ? EVENTS_TEXT.influencers.filter.platformWechat :
               platformFilter === '雪球' ? EVENTS_TEXT.influencers.filter.platformXueqiu :
               EVENTS_TEXT.influencers.filter.platformAll}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{EVENTS_TEXT.influencers.filter.platformAll}</SelectItem>
            <SelectItem value="微博">{EVENTS_TEXT.influencers.filter.platformWeibo}</SelectItem>
            <SelectItem value="推特">{EVENTS_TEXT.influencers.filter.platformTwitter}</SelectItem>
            <SelectItem value="微信公众号">{EVENTS_TEXT.influencers.filter.platformWechat}</SelectItem>
            <SelectItem value="雪球">{EVENTS_TEXT.influencers.filter.platformXueqiu}</SelectItem>
          </SelectContent>
        </Select>

        {/* 领域筛选 */}
        <Select value={domainFilter} onValueChange={(value) => setDomainFilter(value ?? 'all')}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={EVENTS_TEXT.influencers.filter.domainAll}>
              {domainFilter === 'all'
                ? EVENTS_TEXT.influencers.filter.domainAll
                : domains.find(d => d.id === domainFilter)?.name || EVENTS_TEXT.influencers.filter.domainAll}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{EVENTS_TEXT.influencers.filter.domainAll}</SelectItem>
            {domains.map((domain) => (
              <SelectItem key={domain.id} value={domain.id}>
                {domain.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 主内容：大V卡片网格 */}
      <div>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredInfluencers.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Users className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                {EVENTS_TEXT.influencers.empty.title}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {EVENTS_TEXT.influencers.empty.description}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredInfluencers.map((inf) => (
              <Card key={inf.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="space-y-4">
                    {/* 头部：头像和基本信息 */}
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold text-lg shrink-0">
                        {inf.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <h3 className="font-semibold truncate">{inf.name}</h3>
                          <Badge variant="outline" className="shrink-0">
                            {platformLabels[inf.platform] || inf.platform}
                          </Badge>
                        </div>
                        {inf.category && (
                          <p className="text-xs text-muted-foreground">
                            {EVENTS_TEXT.influencers.card.domain}: {inf.category}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* 标签 */}
                    {inf.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {inf.tags.slice(0, 4).map((tag, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                        {inf.tags.length > 4 && (
                          <Badge variant="secondary" className="text-xs">
                            +{inf.tags.length - 4}
                          </Badge>
                        )}
                      </div>
                    )}

                    {/* 统计信息 */}
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <MessageSquare className="h-4 w-4" />
                        <span>{inf.postCount || 0}</span>
                        <span>{EVENTS_TEXT.influencers.card.posts}</span>
                      </div>
                      {inf.latestPostTime && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          <span>{formatTime(inf.latestPostTime)}</span>
                        </div>
                      )}
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex gap-2">
                      {inf.profileUrl ? (
                        <a
                          href={inf.profileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1"
                        >
                          <Button variant="outline" size="sm" className="w-full">
                            <ExternalLink className="mr-2 h-4 w-4" />
                            {EVENTS_TEXT.influencers.card.viewProfile}
                          </Button>
                        </a>
                      ) : (
                        <Button variant="outline" size="sm" className="flex-1" disabled>
                          <WifiOff className="mr-2 h-4 w-4" />
                          {EVENTS_TEXT.status.offline}
                        </Button>
                      )}
                    </div>

                    {/* 状态指示 */}
                    {inf.isActive ? (
                      <div className="flex items-center gap-1 text-xs text-green-600">
                        <div className="w-2 h-2 rounded-full bg-green-600"></div>
                        <span>{EVENTS_TEXT.status.active}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-xs text-gray-400">
                        <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                        <span>{EVENTS_TEXT.status.inactive}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
