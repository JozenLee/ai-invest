import { MainLayout } from '@/components/layout/main-layout'
import { MarketProvider } from '@/contexts/MarketContext'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <MarketProvider>
      <MainLayout>{children}</MainLayout>
    </MarketProvider>
  )
}
