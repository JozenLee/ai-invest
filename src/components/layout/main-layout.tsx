'use client'

import { Sidebar } from './sidebar'
import { Header } from './header'

interface MainLayoutProps {
  children: React.ReactNode
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* 侧边栏 */}
      <Sidebar />

      {/* 主内容区 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* 顶部导航 */}
        <Header />

        {/* 页面内容 */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
