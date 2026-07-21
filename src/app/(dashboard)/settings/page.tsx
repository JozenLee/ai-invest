'use client'

import { usePreferences } from '@/hooks/usePreferences'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'

export default function SettingsPage() {
  const { preferences, updatePreferences, isLoading } = usePreferences()

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">设置</h1>
          <p className="text-muted-foreground mt-2">系统设置与个人偏好配置</p>
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-64 mt-2" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">设置</h1>
        <p className="text-muted-foreground mt-2">系统设置与个人偏好配置</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>数据显示偏好</CardTitle>
          <CardDescription>控制数据质量和显示方式</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>显示估算数据</Label>
              <p className="text-sm text-muted-foreground">
                当真实数据不可用时，是否显示基于行业汇总的估算值
              </p>
            </div>
            <Switch
              checked={preferences.showEstimatedData}
              onCheckedChange={(checked) =>
                updatePreferences({ showEstimatedData: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>显示数据质量标识</Label>
              <p className="text-sm text-muted-foreground">
                显示"真实数据"、"估算数据"等质量标识
              </p>
            </div>
            <Switch
              checked={preferences.showDataQualityBadge}
              onCheckedChange={(checked) =>
                updatePreferences({ showDataQualityBadge: checked })
              }
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
