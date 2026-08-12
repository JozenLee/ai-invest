'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Clock, Calendar } from 'lucide-react'

interface ScheduleConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  industryName?: string
  industryId?: string
}

export function ScheduleConfigDialog({
  open,
  onOpenChange,
  industryName,
  industryId,
}: ScheduleConfigDialogProps) {
  const [enabled, setEnabled] = useState(false)
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>('weekly')
  const [dayOfWeek, setDayOfWeek] = useState('monday')
  const [time, setTime] = useState('09:00')

  const handleSave = () => {
    // TODO: 实现定时配置保存逻辑
    console.log('保存定时配置:', {
      industryId,
      enabled,
      frequency,
      dayOfWeek,
      time,
    })
    alert('定时更新配置功能即将推出\n当前配置已保存到控制台')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>定时更新配置</DialogTitle>
          <DialogDescription>
            {industryName ? (
              <>为 <span className="font-medium text-foreground">{industryName}</span> 配置自动更新计划</>
            ) : (
              '配置全局自动更新计划'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* 功能提示 */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950 p-3">
            <div className="flex items-start gap-2">
              <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5" />
              <div className="text-sm text-blue-800 dark:text-blue-200">
                <p className="font-medium mb-1">功能开发中</p>
                <p className="text-xs">定时更新功能将在后续版本中实现，敬请期待</p>
              </div>
            </div>
          </div>

          {/* 启用开关 */}
          <div className="flex items-center justify-between">
            <Label htmlFor="schedule-enabled" className="flex items-center gap-2">
              启用定时更新
              <Badge variant="secondary" className="text-xs">即将推出</Badge>
            </Label>
            <Switch
              id="schedule-enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
              disabled
            />
          </div>

          {/* 更新频率 */}
          <div className="space-y-2">
            <Label htmlFor="frequency">更新频率</Label>
            <Select value={frequency} onValueChange={(v) => setFrequency(v as any)} disabled>
              <SelectTrigger id="frequency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">每日</SelectItem>
                <SelectItem value="weekly">每周</SelectItem>
                <SelectItem value="monthly">每月</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 星期选择（仅在每周时显示） */}
          {frequency === 'weekly' && (
            <div className="space-y-2">
              <Label htmlFor="dayOfWeek">星期</Label>
              <Select value={dayOfWeek} onValueChange={(v) => setDayOfWeek(v || 'monday')} disabled>
                <SelectTrigger id="dayOfWeek">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monday">星期一</SelectItem>
                  <SelectItem value="tuesday">星期二</SelectItem>
                  <SelectItem value="wednesday">星期三</SelectItem>
                  <SelectItem value="thursday">星期四</SelectItem>
                  <SelectItem value="friday">星期五</SelectItem>
                  <SelectItem value="saturday">星期六</SelectItem>
                  <SelectItem value="sunday">星期日</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* 时间选择 */}
          <div className="space-y-2">
            <Label htmlFor="time">更新时间</Label>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <input
                id="time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                disabled
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>

          {/* 配置预览 */}
          {enabled && (
            <div className="rounded-lg border bg-muted p-3 text-sm">
              <p className="text-muted-foreground">
                将在每{frequency === 'daily' ? '天' : frequency === 'weekly' ? '周' : '月'}
                {frequency === 'weekly' && ` ${dayOfWeek}`} {time} 自动更新产业图谱
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSave} disabled>
            保存配置
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
