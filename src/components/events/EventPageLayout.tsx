import { ReactNode } from 'react'

interface EventPageLayoutProps {
  children: ReactNode
}

/**
 * 事件页面统一布局容器
 * 提供一致的页面结构：标题区 + 内容区
 */
export function EventPageLayout({ children }: EventPageLayoutProps) {
  return (
    <div className="space-y-6 p-6">
      {children}
    </div>
  )
}
