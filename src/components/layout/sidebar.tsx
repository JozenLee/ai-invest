'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  BarChart3,
  Newspaper,
  GitBranch,
  Briefcase,
  TrendingUp,
  ChevronRight,
  Send,
  Lightbulb,
  Database,
} from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

const navigation = [
  {
    name: '市场数据',
    href: '/market',
    icon: BarChart3,
  },
  {
    name: '事件驱动',
    href: '/events',
    icon: Newspaper,
    children: [
      { name: '资讯流', href: '/events/feed' },
      { name: '领域趋势', href: '/events/trends' },
      { name: '数据源', href: '/events/sources' },
    ],
  },
  {
    name: '知识图谱',
    href: '/graph',
    icon: GitBranch,
  },
  {
    name: '领域分析',
    href: '/industry-analysis',
    icon: TrendingUp,
  },
  {
    name: '综合分析',
    href: '/comprehensive-analysis',
    icon: Lightbulb,
  },
  {
    name: '数据订阅',
    href: '/data-center/subscriptions',
    icon: Database,
  },
  {
    name: '持仓总览',
    href: '/portfolio/overview',
    icon: Briefcase,
  },
  {
    name: '数据发布',
    href: '/publish',
    icon: Send,
  },
]

interface SidebarProps {
  mobileOpen?: boolean
  onMobileOpenChange?: (open: boolean) => void
}

function NavigationContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()

  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4">
      <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/75">
        工作台
      </p>
      <ul className="space-y-1">
        {navigation.slice(0, 1).map((item) => (
          <NavigationItem key={item.name} item={item} pathname={pathname} onNavigate={onNavigate} />
        ))}
      </ul>

      <p className="mb-2 mt-7 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/75">
        分析与研究
      </p>
      <ul className="space-y-1">
        {navigation.slice(1).map((item) => (
          <NavigationItem key={item.name} item={item} pathname={pathname} onNavigate={onNavigate} />
        ))}
      </ul>
    </nav>
  )
}

function NavigationItem({
  item,
  pathname,
  onNavigate,
}: {
  item: (typeof navigation)[number]
  pathname: string
  onNavigate?: () => void
}) {
  const isActive = pathname === item.href || pathname.startsWith(item.href + '/')

  return (
    <li>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'group flex min-h-11 items-center gap-3 rounded-lg border border-transparent px-3 text-sm font-medium transition-colors duration-200 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isActive
            ? 'border-primary/10 bg-primary/10 text-primary shadow-sm dark:bg-primary/15'
            : 'text-muted-foreground'
        )}
      >
        <item.icon className={cn('h-[18px] w-[18px] transition-transform duration-200 group-hover:scale-105', isActive && 'text-primary')} />
        <span className="flex-1">{item.name}</span>
        {item.children && (
          <ChevronRight className={cn('h-4 w-4 text-muted-foreground transition-transform', isActive && 'rotate-90 text-primary')} />
        )}
      </Link>
      {item.children && isActive && (
        <ul className="ml-5 mt-1 space-y-0.5 border-l border-border pl-3">
          {item.children.map((child) => {
            const childActive = pathname === child.href
            return (
              <li key={child.name}>
                <Link
                  href={child.href}
                  onClick={onNavigate}
                  aria-current={childActive ? 'page' : undefined}
                  className={cn(
                    'flex min-h-10 items-center rounded-md px-3 text-sm transition-colors duration-200 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    childActive ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground'
                  )}
                >
                  {child.name}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </li>
  )
}

export function Sidebar({ mobileOpen = false, onMobileOpenChange }: SidebarProps) {
  const sidebarBody = (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-[72px] items-center gap-3 border-b border-sidebar-border px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <TrendingUp className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight">AI投资分析</p>
          <p className="truncate text-[11px] text-muted-foreground">Research workspace</p>
        </div>
      </div>
      <NavigationContent onNavigate={() => onMobileOpenChange?.(false)} />
      <div className="border-t border-sidebar-border p-4">
        <div className="rounded-lg bg-muted/60 px-3 py-2.5 dark:bg-muted/40">
          <p className="text-xs font-medium">研究提示</p>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">数据仅供研究参考，投资决策请结合自身判断。</p>
        </div>
      </div>
    </div>
  )

  return (
    <>
      <aside className="hidden h-full w-[264px] shrink-0 border-r border-sidebar-border bg-sidebar lg:flex">
        {sidebarBody}
      </aside>
      <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent side="left" showCloseButton className="w-[min(86vw,320px)] border-sidebar-border bg-sidebar p-0 text-sidebar-foreground">
          <SheetHeader className="sr-only">
            <SheetTitle>主导航</SheetTitle>
          </SheetHeader>
          {sidebarBody}
        </SheetContent>
      </Sheet>
    </>
  )
}
