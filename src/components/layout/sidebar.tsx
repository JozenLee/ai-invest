'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  BarChart3,
  Newspaper,
  GitBranch,
  Brain,
  Briefcase,
  Settings,
  TrendingUp,
} from 'lucide-react'

const navigation = [
  {
    name: '仪表盘',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    name: '市场数据',
    href: '/market',
    icon: BarChart3,
    children: [
      { name: '市场概览', href: '/market/overview' },
      { name: '资金流向', href: '/market/capital' },
    ],
  },
  {
    name: '事件驱动',
    href: '/events',
    icon: Newspaper,
    children: [
      { name: '资讯流', href: '/events/feed' },
      { name: '事件分析', href: '/events/analysis' },
      { name: '领域趋势', href: '/events/trends' },
    ],
  },
  {
    name: '知识图谱',
    href: '/graph',
    icon: GitBranch,
    children: [
      { name: '图谱探索', href: '/graph/explore' },
      { name: '传导路径', href: '/graph/propagation' },
      { name: '周期分析', href: '/graph/cycles' },
      { name: '图谱编辑', href: '/graph/edit' },
      { name: '变更历史', href: '/graph/changelog' },
    ],
  },
  {
    name: 'AI分析',
    href: '/analysis',
    icon: Brain,
    children: [
      { name: '个股分析', href: '/analysis/stock' },
      { name: '板块分析', href: '/analysis/sector' },
      { name: '综合报告', href: '/analysis/report' },
    ],
  },
  {
    name: '投资组合',
    href: '/portfolio',
    icon: Briefcase,
    children: [
      { name: '持仓总览', href: '/portfolio/overview' },
      { name: '组合优化', href: '/portfolio/optimize' },
      { name: '风险分析', href: '/portfolio/risk' },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <div className="flex h-full w-64 flex-col border-r bg-card">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <TrendingUp className="h-6 w-6 text-primary" />
        <span className="text-lg font-semibold">AI投资分析</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-4">
        <ul className="space-y-1">
          {navigation.map((item) => (
            <li key={item.name}>
              <Link
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground',
                  pathname === item.href || pathname.startsWith(item.href + '/')
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground'
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.name}
              </Link>
              {item.children && (
                <ul className="ml-6 mt-1 space-y-1">
                  {item.children.map((child) => (
                    <li key={child.name}>
                      <Link
                        href={child.href}
                        className={cn(
                          'block rounded-lg px-3 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
                          pathname === child.href
                            ? 'bg-accent text-accent-foreground font-medium'
                            : 'text-muted-foreground'
                        )}
                      >
                        {child.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer */}
      <div className="border-t p-4">
        <Link
          href="/settings"
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground',
            pathname === '/settings'
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground'
          )}
        >
          <Settings className="h-4 w-4" />
          设置
        </Link>
      </div>
    </div>
  )
}
