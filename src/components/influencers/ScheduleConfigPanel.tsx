'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { TimePickerList } from './TimePickerList';

interface ScheduleConfigPanelProps {
  scheduleType: 'polling' | 'daily';
  onScheduleTypeChange: (type: 'polling' | 'daily') => void;
  fetchInterval: number;
  onFetchIntervalChange: (interval: number) => void;
  dailyFetchTimes: string[];
  onDailyFetchTimesChange: (times: string[]) => void;
}

export function ScheduleConfigPanel({
  scheduleType,
  onScheduleTypeChange,
  fetchInterval,
  onFetchIntervalChange,
  dailyFetchTimes,
  onDailyFetchTimesChange,
}: ScheduleConfigPanelProps) {
  return (
    <div className="space-y-4">
      <Label className="text-base font-semibold">调度策略</Label>

      <RadioGroup value={scheduleType} onValueChange={(value) => onScheduleTypeChange(value as 'polling' | 'daily')}>
        <div className="space-y-4">
          {/* 轮询模式 */}
          <div className="flex items-start space-x-3">
            <RadioGroupItem value="polling" id="polling" className="mt-1" />
            <div className="flex-1 space-y-2">
              <Label htmlFor="polling" className="font-medium cursor-pointer">
                轮询模式
              </Label>
              <p className="text-sm text-muted-foreground">
                按固定时间间隔自动抓取动态
              </p>

              {scheduleType === 'polling' && (
                <div className="pt-2 space-y-2">
                  <Label htmlFor="fetchInterval" className="text-sm">
                    更新周期（分钟）
                  </Label>
                  <Input
                    id="fetchInterval"
                    type="number"
                    min="10"
                    max="1440"
                    value={fetchInterval}
                    onChange={(e) => onFetchIntervalChange(parseInt(e.target.value) || 30)}
                    className="w-32"
                  />
                  <p className="text-xs text-muted-foreground">
                    建议：30-120分钟，避免请求过于频繁
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* 定时模式 */}
          <div className="flex items-start space-x-3">
            <RadioGroupItem value="daily" id="daily" className="mt-1" />
            <div className="flex-1 space-y-2">
              <Label htmlFor="daily" className="font-medium cursor-pointer">
                定时模式
              </Label>
              <p className="text-sm text-muted-foreground">
                每天在指定时间点执行抓取
              </p>

              {scheduleType === 'daily' && (
                <div className="pt-2 space-y-2">
                  <Label className="text-sm">每日执行时间</Label>
                  <TimePickerList
                    times={dailyFetchTimes}
                    onChange={onDailyFetchTimesChange}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </RadioGroup>
    </div>
  );
}
