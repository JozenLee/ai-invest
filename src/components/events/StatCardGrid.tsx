import { ReactNode } from 'react'

interface StatCardGridProps {
  children: ReactNode
}

/**
 * 数据概览卡片网格容器
 * 响应式布局：移动端 2 列，桌面 4 列
 */
export function StatCardGrid({ children }: StatCardGridProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {children}
    </div>
  )
}
