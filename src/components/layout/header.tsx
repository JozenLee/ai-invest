'use client'

import { usePathname } from 'next/navigation'
import { Bell, Moon, Sun, User } from 'lucide-react'
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
import { useEffect, useState } from 'react'

export function Header() {
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

    // 检查是否是大V详情页 /events/influencers/[id]
    if (segments.length === 3 && segments[0] === 'events' && segments[1] === 'influencers') {
      const influencerId = segments[2]
      // 检查是否为 ID 格式 (inf_ 开头或纯数字)
      if (influencerId.startsWith('inf_') || /^\d+$/.test(influencerId)) {
        fetch(`/api/influencers/${influencerId}`)
          .then(res => res.json())
          .then(data => {
            if (data?.name) {
              setDynamicNames(prev => ({ ...prev, [influencerId]: data.name }))
            }
          })
          .catch(err => console.error('Failed to fetch influencer name:', err))
      }
    }
  }, [pathname])

  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-6">
      {/* 面包屑 */}
      <nav className="flex items-center space-x-2 text-sm">
        <span className="text-muted-foreground">首页</span>
        {breadcrumbs.map((crumb, index) => (
          <span key={crumb.href} className="flex items-center space-x-2">
            <span className="text-muted-foreground">/</span>
            <span
              className={
                index === breadcrumbs.length - 1
                  ? 'font-medium text-foreground'
                  : 'text-muted-foreground'
              }
            >
              {crumb.name}
            </span>
          </span>
        ))}
      </nav>

      {/* 右侧操作 */}
      <div className="flex items-center gap-2">
        {/* 通知 */}
        <Button variant="ghost" size="icon">
          <Bell className="h-4 w-4" />
        </Button>

        {/* 主题切换 */}
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex h-9 w-9 items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50">
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
          <DropdownMenuTrigger className="relative inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
            <Avatar className="h-8 w-8">
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
              <span>设置</span>
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
    return dynamicNames[segment]
  }

  const nameMap: Record<string, string> = {
    dashboard: '仪表盘',
    market: '市场数据',
    overview: '概览',
    sectors: '板块轮动',
    capital: '资金流向',
    events: '事件驱动',
    feed: '资讯流',
    analysis: '事件分析',
    trends: '领域趋势',
    influencers: '大V监控',
    graph: '知识图谱',
    explore: '图谱探索',
    propagation: '传导路径',
    cycles: '周期分析',
    edit: '图谱编辑',
    changelog: '变更历史',
    stock: '个股分析',
    sector: '板块分析',
    report: '综合报告',
    portfolio: '投资组合',
    optimize: '组合优化',
    risk: '风险分析',
    settings: '设置',
    new: '新建',
  }

  // 如果在nameMap中找到，直接返回
  if (nameMap[segment]) {
    return nameMap[segment]
  }

  // 尝试作为领域代码查询
  const domain = getDomainByCode(segment)
  if (domain) {
    return domain.name
  }

  // 如果是ID格式（inf_开头或纯数字），显示"详情"而不是ID
  if (segment.startsWith('inf_') || /^\d+$/.test(segment)) {
    return '详情'
  }

  // 默认返回原始segment
  return segment
}
