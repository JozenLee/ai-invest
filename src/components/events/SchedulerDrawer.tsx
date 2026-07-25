'use client';

import { useState, useEffect } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Clock,
  Calendar,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  Save,
} from 'lucide-react';
import { formatBeijingTime } from '@/lib/time-utils';
import { cn } from '@/lib/utils';

interface SchedulerDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dataSource: {
    id: string;
    name: string;
    updateFrequency: number;
    scheduler?: {
      id: string;
      scheduleType: string;
      scheduleTypeLabel: string;
      scheduleConfig: Record<string, any>;
      isEnabled: boolean;
      lastRunAt?: string;
      nextRunAt?: string;
    } | null;
  };
  onUpdate?: () => void;
}

interface ExecutionLog {
  id: string;
  status: string;
  message?: string;
  fetchedCount: number;
  processedCount: number;
  failedCount: number;
  duration?: number;
  createdAt: string;
}

/**
 * 调度器设置抽屉组件
 * 用于查看和编辑数据源的调度配置，以及查看运行历史
 */
export function SchedulerDrawer({
  open,
  onOpenChange,
  dataSource,
  onUpdate,
}: SchedulerDrawerProps) {
  const [scheduleType, setScheduleType] = useState<string>('interval');
  const [updateFrequency, setUpdateFrequency] = useState<number>(60);
  const [cronExpression, setCronExpression] = useState<string>('0 * * * *');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [executionLogs, setExecutionLogs] = useState<ExecutionLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  // 初始化表单数据
  useEffect(() => {
    if (open && dataSource) {
      setUpdateFrequency(dataSource.updateFrequency);

      if (dataSource.scheduler) {
        setScheduleType(dataSource.scheduler.scheduleType);

        if (dataSource.scheduler.scheduleType === 'cron' && dataSource.scheduler.scheduleConfig.cronExpression) {
          setCronExpression(dataSource.scheduler.scheduleConfig.cronExpression);
        } else if (dataSource.scheduler.scheduleType === 'interval' && dataSource.scheduler.scheduleConfig.intervalMinutes) {
          setUpdateFrequency(dataSource.scheduler.scheduleConfig.intervalMinutes);
        }
      }

      // 加载运行历史
      loadExecutionLogs();
    }
  }, [open, dataSource]);

  // 加载执行历史
  const loadExecutionLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const response = await fetch(`/api/datasources/logs?sourceId=${dataSource.id}&limit=10`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data && data.data.items) {
          setExecutionLogs(data.data.items);
        }
      }
    } catch (err) {
      console.error('加载执行历史失败:', err);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  // 保存配置
  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const payload: any = {
        updateFrequency,
        scheduleType,
      };

      // 根据调度类型设置配置
      if (scheduleType === 'interval') {
        payload.scheduleConfig = JSON.stringify({
          intervalMinutes: updateFrequency,
        });
      } else if (scheduleType === 'cron') {
        payload.scheduleConfig = JSON.stringify({
          cronExpression,
        });
      }

      const response = await fetch(`/api/datasources/${dataSource.id}/schedule`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || '保存失败');
      }

      // 通知父组件更新
      onUpdate?.();

      // 关闭抽屉
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存配置失败');
    } finally {
      setIsSaving(false);
    }
  };

  // 格式化时间 - 使用北京时间
  const formatTime = (dateString: string) => {
    return formatBeijingTime(dateString, 'full');
  };

  // 格式化持续时间
  const formatDuration = (ms?: number) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  // 获取状态图标
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'running':
        return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-400" />;
    }
  };

  // 获取状态标签
  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'success':
        return '成功';
      case 'failed':
        return '失败';
      case 'running':
        return '运行中';
      default:
        return '未知';
    }
  };

  // 获取状态样式
  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>调度器设置</SheetTitle>
          <SheetDescription>{dataSource.name}</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-6">
          {/* 基本信息 */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium">基本信息</h3>
            <div className="space-y-2 p-3 rounded-lg bg-muted/50">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">数据源ID</span>
                <span className="font-mono text-xs">{dataSource.id}</span>
              </div>
              {dataSource.scheduler && (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">调度状态</span>
                    <Badge variant={dataSource.scheduler.isEnabled ? 'default' : 'outline'}>
                      {dataSource.scheduler.isEnabled ? '已启用' : '已暂停'}
                    </Badge>
                  </div>
                  {dataSource.scheduler.lastRunAt && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">上次运行</span>
                      <span>{formatTime(dataSource.scheduler.lastRunAt)}</span>
                    </div>
                  )}
                  {dataSource.scheduler.nextRunAt && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">下次运行</span>
                      <span>{formatTime(dataSource.scheduler.nextRunAt)}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* 调度配置 */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium">调度配置</h3>

            {/* 调度类型 */}
            <div className="space-y-2">
              <Label htmlFor="scheduleType">调度类型</Label>
              <Select value={scheduleType} onValueChange={(value) => setScheduleType(value || 'interval')}>
                <SelectTrigger id="scheduleType" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="interval">定时轮询</SelectItem>
                  <SelectItem value="cron">Cron表达式</SelectItem>
                  <SelectItem value="webhook">Webhook触发</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 定时轮询配置 */}
            {scheduleType === 'interval' && (
              <div className="space-y-2">
                <Label htmlFor="updateFrequency">更新频率（分钟）</Label>
                <Input
                  id="updateFrequency"
                  type="number"
                  min="1"
                  value={updateFrequency}
                  onChange={(e) => setUpdateFrequency(parseInt(e.target.value) || 1)}
                />
                <p className="text-xs text-muted-foreground">
                  每 {updateFrequency} 分钟自动执行一次数据采集
                </p>
              </div>
            )}

            {/* Cron表达式配置 */}
            {scheduleType === 'cron' && (
              <div className="space-y-2">
                <Label htmlFor="cronExpression">Cron表达式</Label>
                <Input
                  id="cronExpression"
                  type="text"
                  value={cronExpression}
                  onChange={(e) => setCronExpression(e.target.value)}
                  placeholder="0 * * * *"
                />
                <p className="text-xs text-muted-foreground">
                  支持标准Cron表达式格式（分 时 日 月 周）
                </p>
              </div>
            )}

            {/* Webhook配置提示 */}
            {scheduleType === 'webhook' && (
              <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                <p>Webhook触发模式下，数据采集将通过外部系统触发。</p>
                <p className="mt-2">
                  Webhook地址：<code className="text-xs">/api/datasources/{dataSource.id}/trigger</code>
                </p>
              </div>
            )}
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 运行历史 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">运行历史</h3>
              {isLoadingLogs && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>

            {executionLogs.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                暂无运行记录
              </div>
            ) : (
              <div className="space-y-2">
                {executionLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(log.status)}
                        <Badge variant={getStatusBadgeVariant(log.status)} className="text-xs">
                          {getStatusLabel(log.status)}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatTime(log.createdAt)}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">采集</span>
                        <span className="ml-1 font-medium">{log.fetchedCount}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">处理</span>
                        <span className="ml-1 font-medium">{log.processedCount}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">耗时</span>
                        <span className="ml-1 font-medium">{formatDuration(log.duration)}</span>
                      </div>
                    </div>

                    {log.message && (
                      <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
                        {log.message}
                      </p>
                    )}

                    {log.failedCount > 0 && (
                      <p className="mt-2 text-xs text-destructive">
                        失败: {log.failedCount} 条
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 底部操作按钮 */}
        <div className="sticky bottom-0 bg-background pt-4 pb-2 border-t -mx-6 px-6 flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            取消
          </Button>
          <Button
            className="flex-1"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                保存中...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                保存配置
              </>
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
