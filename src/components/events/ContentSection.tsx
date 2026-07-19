import { ReactNode } from 'react'
import { Card } from '@/components/ui/card'

interface ContentSectionProps {
  title?: string
  description?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}

/**
 * 内容区块组件
 * 带可选标题、描述和操作按钮的内容容器
 */
export function ContentSection({
  title,
  description,
  actions,
  children,
  className
}: ContentSectionProps) {
  return (
    <Card className={`rounded-xl shadow-sm ${className || ''}`}>
      {(title || description || actions) && (
        <div className="border-b p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              {title && (
                <h2 className="text-lg font-semibold">{title}</h2>
              )}
              {description && (
                <p className="text-sm text-muted-foreground">{description}</p>
              )}
            </div>
            {actions && (
              <div className="flex items-center gap-2">
                {actions}
              </div>
            )}
          </div>
        </div>
      )}
      <div className="p-6">
        {children}
      </div>
    </Card>
  )
}
