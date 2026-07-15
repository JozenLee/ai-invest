import { Card, CardContent } from '@/components/ui/card'
import { Construction } from 'lucide-react'

interface UnderDevelopmentProps {
  title: string
  description?: string
}

export function UnderDevelopment({ title, description }: UnderDevelopmentProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        {description && (
          <p className="text-muted-foreground mt-1">{description}</p>
        )}
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Construction className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">功能开发中</h2>
          <p className="text-muted-foreground text-center max-w-md">
            该功能正在紧张开发中，敬请期待。如有需求或建议，请联系开发团队。
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
