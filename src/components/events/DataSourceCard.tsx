'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Database,
  Power,
  PowerOff,
  RefreshCw,
  Settings,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Calendar
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRelativeTime, formatFutureTime } from '@/lib/time-utils';

interface DataSourceScheduler {
  id: string;
  scheduleType: string;
  scheduleTypeLabel: string;
  scheduleConfig: Record<string, any>;
  isEnabled: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
}

interface DataSourceCardProps {
  dataSource: {
    id: string;
    name: string;
    type: string;
    typeLabel: string;
    driverType: string;
    driverTypeLabel: string;
    isActive: boolean;
    statusLabel: string;
    updateFrequency: number;
    lastFetchAt?: string;
    lastFetchStatus?: string;
    lastFetchStatusLabel?: string;
    scheduler?: DataSourceScheduler | null;
  };
  onToggle?: (id: string, isActive: boolean) => void;
  onFetch?: (id: string) => void;
  onSettings?: (id: string) => void;
}

/**
 * 数据源卡片组件
 * 显示数据源信息、调度状态和操作按钮
 */
export function DataSourceCard({
  dataSource,
  onToggle,
  onFetch,
  onSettings
}: DataSourceCardProps) {
  const {
    id,
    name,
    typeLabel,
    driverTypeLabel,
    isActive,
    statusLabel,
    lastFetchAt,
    lastFetchStatus,
    lastFetchStatusLabel,
    scheduler
  } = dataSource;

  // 使用状态来存储格式化后的时间，以便定时更新
  const [formattedTime, setFormattedTime] = useState<string>('');
  const [formattedNextRun, setFormattedNextRun] = useState<string>('');

  // 初始化和定时更新时间显示
  useEffect(() => {
    // 立即计算一次
    setFormattedTime(formatRelativeTime(lastFetchAt));
    if (scheduler?.nextRunAt) {
      setFormattedNextRun(formatFutureTime(scheduler.nextRunAt));
    }

    // 每30秒更新一次时间显示
    const timer = setInterval(() => {
      setFormattedTime(formatRelativeTime(lastFetchAt));
      if (scheduler?.nextRunAt) {
        setFormattedNextRun(formatFutureTime(scheduler.nextRunAt));
      }
    }, 30000);

    return () => clearInterval(timer);
  }, [lastFetchAt, scheduler?.nextRunAt]);

  // 获取采集状态图标和样式
  const getFetchStatusIcon = () => {
    switch (lastFetchStatus) {
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'running':
        return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  // 获取采集状态样式
  const getFetchStatusBadgeVariant = () => {
    switch (lastFetchStatus) {
      case 'success':
        return 'default';
      case 'failed':
        return 'destructive';
      case 'running':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  return (
    <Card className={cn(
      "rounded-xl shadow-sm transition-all hover:shadow-md",
      !isActive && "opacity-60"
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1">
            <div className={cn(
              "p-2 rounded-lg",
              isActive ? "bg-primary/10" : "bg-gray-100 dark:bg-gray-800"
            )}>
              <Database className={cn(
                "h-5 w-5",
                isActive ? "text-primary" : "text-gray-400"
              )} />
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-base">{name}</h3>
                <Badge variant={isActive ? "default" : "outline"}>
                  {statusLabel}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{typeLabel}</span>
                <span>•</span>
                <span>{driverTypeLabel}</span>
              </div>
            </div>
          </div>

          {/* 启用/禁用开关 */}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onToggle?.(id, !isActive)}
            title={isActive ? "禁用数据源" : "启用数据源"}
          >
            {isActive ? (
              <Power className="h-4 w-4 text-green-600" />
            ) : (
              <PowerOff className="h-4 w-4 text-gray-400" />
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* 调度信息 */}
        {scheduler && (
          <div className="space-y-2 p-3 rounded-lg bg-muted/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">调度设置</span>
              </div>
              <Badge variant={scheduler.isEnabled ? "secondary" : "outline"} className="text-xs">
                {scheduler.isEnabled ? "已启用" : "已暂停"}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">调度类型</div>
                <div className="font-medium">{scheduler.scheduleTypeLabel}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">下次运行</div>
                <div className="font-medium">
                  {scheduler.isEnabled ? formattedNextRun : '已暂停'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 采集信息 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              {getFetchStatusIcon()}
              <span className="text-muted-foreground">上次采集</span>
            </div>
            <Badge variant={getFetchStatusBadgeVariant()} className="text-xs">
              {lastFetchStatusLabel || '未运行'}
            </Badge>
          </div>

          <div className="text-sm text-muted-foreground">
            {formattedTime}
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => onFetch?.(id)}
            disabled={!isActive}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            立即采集
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSettings?.(id)}
          >
            <Settings className="h-3.5 w-3.5 mr-1.5" />
            设置
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
