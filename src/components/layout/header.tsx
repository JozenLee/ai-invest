'use client'

import { usePathname } from 'next/navigation'
import { Bell, ChevronRight, Home, Menu, Moon, Sun, User } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getDomainByCode } from '@/config/etf-domains'
import { cn } from '@/lib/utils'
import { useEffect, useState } from 'react'
import { chineseNarrative } from '@/lib/analysis/chinese-labels'

export function Header({ onMenuOpen }: { onMenuOpen?: () => void }) {
  const pathname = usePathname()
  const { setTheme } = useTheme()
  const [dynamicNames, setDynamicNames] = useState<Record<string, string>>({})

  // 生成面包屑
  const breadcrumbs = pathname
    .split('/')
    .filter(Boolean)
    .map((segment, index, array) => {
      const href = '/' + array.slice(0, index + 1).join('/')
      const name = getBreadcrumbName(segment, dynamicNames)
      return { href, name }
    })

  // 检测动态路由并加载名称
  useEffect(() => {
    const segments = pathname.split('/').filter(Boolean)

    // 加载产业图谱名称
    if (segments.includes('industries') && segments.length > segments.indexOf('industries') + 1) {
      const industryIdIndex = segments.indexOf('industries') + 1
      const industryId = segments[industryIdIndex]

      // 只处理看起来像产业代码的ID（不是纯数字）
      if (industryId && !industryId.match(/^\d+$/)) {
        fetch(`/api/graph/industries/${industryId}`)
          .then(res => res.json())
          .then(data => {
            if (data.success && data.data?.name) {
              setDynamicNames(prev => ({
                ...prev,
                [industryId]: data.data.name
              }))
            }
          })
          .catch(err => console.error('Failed to load industry name:', err))
      }
    }

    // 综合报告的 [id] 不能直接展示数据库主键，改为加载报告标题作为面包屑名称。
    const reportTypeIndex = segments.includes('comprehensive-report') ? segments.indexOf('comprehensive-report') : segments.includes('comprehensive-analysis') && segments.includes('report') ? segments.indexOf('report') : -1
    if (reportTypeIndex >= 0 && segments[reportTypeIndex + 1]) {
      const reportId = segments[reportTypeIndex + 1]
      fetch(`/api/analysis/reports/${encodeURIComponent(reportId)}`)
        .then(res => res.json())
        .then(data => {
          const title = data?.report?.title || data?.report?.industryName || data?.title || data?.industryName
          if (title) setDynamicNames(prev => ({ ...prev, [reportId]: title }))
        })
        .catch(err => console.error('Failed to load report name:', err))
    }
  }, [pathname])

  return (
    <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between border-b border-border/80 bg-card/95 px-4 backdrop-blur md:px-6">
      {/* 面包屑 */}
      <div className="flex min-w-0 items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onMenuOpen}
          aria-label="打开主导航"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <nav aria-label="面包屑" className="flex min-w-0 items-center gap-1.5 overflow-hidden text-sm">
          <Home className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" aria-hidden="true" />
          <span className="hidden shrink-0 text-muted-foreground sm:inline">首页</span>
        {breadcrumbs.map((crumb, index) => (
          <span key={crumb.href} className="flex min-w-0 items-center gap-1.5">
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" aria-hidden="true" />
            <span
              title={crumb.name}
              className={cn(
                'truncate',
                index === breadcrumbs.length - 1
                  ? 'font-medium text-foreground'
                  : 'text-muted-foreground'
              )}
            >
              {crumb.name}
            </span>
          </span>
        ))}
        </nav>
      </div>

      {/* 右侧操作 */}
      <div className="flex items-center gap-2">
        {/* 通知 */}
        <Button variant="ghost" size="icon" aria-label="查看通知">
          <Bell className="h-4 w-4" />
        </Button>

        {/* 主题切换 */}
        <DropdownMenu>
          <DropdownMenuTrigger aria-label="切换主题" className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50">
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">切换主题</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setTheme('light')}>
              浅色模式
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme('dark')}>
              深色模式
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme('system')}>
              跟随系统
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 用户菜单 */}
        <DropdownMenu>
          <DropdownMenuTrigger aria-label="打开用户菜单" className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Avatar className="h-9 w-9">
              <AvatarImage src="/avatars/01.png" alt="用户头像" />
              <AvatarFallback>
                <User className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end">
            <DropdownMenuItem>
              <span>个人资料</span>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <span>退出登录</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}

function getBreadcrumbName(segment: string, dynamicNames: Record<string, string> = {}): string {
  // 检查是否有动态名称
  if (dynamicNames[segment]) {
    return chineseNarrative(dynamicNames[segment])
  }

  const nameMap: Record<string, string> = {
    market: '数据概览',
    overview: '概览',
    sectors: '板块轮动',
    capital: '资金流向',
    events: '事件驱动',
    feed: '资讯流',
    analysis: '事件分析',
    trends: '领域趋势',
    graph: '知识图谱',
    industries: '产业图谱',
    portfolio: '投资组合',
    create: '创建',
    edit: '编辑',
    stock: '个股分析',
    sector: '板块分析',
    report: '综合报告',
    'market-report': '市场分析报告',
    'comprehensive-report': '综合分析完整报告',
    'comprehensive-analysis': '综合分析',
    new: '新建',
  }

  // 如果在nameMap中找到，直接返回
  if (nameMap[segment]) {
    return nameMap[segment]
  }

  // 尝试作为领域代码查询
  const domain = getDomainByCode(segment)
  if (domain) {
    return chineseNarrative(domain.name)
  }

  // 默认返回原始segment
  return segment
}
