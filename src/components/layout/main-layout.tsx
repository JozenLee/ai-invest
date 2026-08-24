'use client'

import { useState } from 'react'
import { Sidebar } from './sidebar'
import { Header } from './header'

interface MainLayoutProps {
  children: React.ReactNode
}

export function MainLayout({ children }: MainLayoutProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
    <div className="flex min-h-dvh overflow-hidden bg-background">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        跳转到主要内容
      </a>

      <Sidebar mobileOpen={mobileNavOpen} onMobileOpenChange={setMobileNavOpen} />

      {/* 主内容区 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* 顶部导航 */}
        <Header onMenuOpen={() => setMobileNavOpen(true)} />

        {/* 页面内容 */}
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto px-4 py-5 md:px-6 md:py-7 xl:px-8">
          <div className="mx-auto w-full max-w-[1800px]">
          {children}
          </div>
        </main>
      </div>
    </div>
  )
}
