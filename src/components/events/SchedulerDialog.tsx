'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Clock,
  Calendar,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  Save,
  Activity,
  Settings,
  History,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SchedulerDialogProps {
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
 * 调度器设置对话框组件
 * 匹配网站整体设计风格，固定高度避免切换时跳动
 */
export function SchedulerDialog({
  open,
  onOpenChange,
  dataSource,
  onUpdate,
}: SchedulerDialogProps) {
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
      if (dataSource.scheduler) {
        setScheduleType(dataSource.scheduler.scheduleType);

        if (dataSource.scheduler.scheduleType === 'cron' && dataSource.scheduler.scheduleConfig.cronExpression) {
          setCronExpression(dataSource.scheduler.scheduleConfig.cronExpression);
        } else if (dataSource.scheduler.scheduleType === 'interval' && dataSource.scheduler.scheduleConfig.intervalMinutes) {
          setUpdateFrequency(dataSource.scheduler.scheduleConfig.intervalMinutes);
        } else if (dataSource.scheduler.scheduleType === 'webhook') {
          setUpdateFrequency(dataSource.updateFrequency);
        } else {
          setUpdateFrequency(dataSource.updateFrequency);
        }
      } else {
        setScheduleType('interval');
        setUpdateFrequency(dataSource.updateFrequency);
      }

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

  // 去重逻辑：基于 id 和 createdAt 的组合键去重
  const uniqueExecutionLogs = useMemo(() => {
    const seen = new Set<string>();
    return executionLogs.filter(log => {
      const key = `${log.id}-${log.createdAt}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }, [executionLogs]);

  // 保存配置
  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const payload: any = {
        updateFrequency,
        scheduleType,
      };

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

      onUpdate?.();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存配置失败');
    } finally {
      setIsSaving(false);
    }
  };

  // 格式化时间
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
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
  const getStatusBadgeVariant = (status: string): 'default' | 'destructive' | 'secondary' | 'outline' => {
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            调度器设置
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            {dataSource.name}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="config" className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="config" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              配置管理
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="h-4 w-4" />
              运行历史
            </TabsTrigger>
          </TabsList>

          {/* 固定高度容器，防止切换时跳动 */}
          <div className="min-h-[500px]">
            {/* 配置管理标签页 */}
            <TabsContent value="config" className="space-y-4 mt-4">
              {/* 基本信息 */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  基本信息
                </h3>
                <div className="grid grid-cols-2 gap-3 p-4 rounded-lg bg-muted/50">
                  {dataSource.scheduler && (
                    <>
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">调度状态</span>
                        <div>
                          <Badge variant={dataSource.scheduler.isEnabled ? 'default' : 'outline'} className="text-xs">
                            {dataSource.scheduler.isEnabled ? '已启用' : '已暂停'}
                          </Badge>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">调度类型</span>
                        <p className="text-sm">
                          {scheduleType === 'interval' && '定时轮询'}
                          {scheduleType === 'cron' && 'Cron表达式'}
                          {scheduleType === 'webhook' && 'Webhook触发'}
                        </p>
                      </div>
                      {dataSource.scheduler.lastRunAt && (
                        <div className="space-y-1">
                          <span className="text-xs text-muted-foreground">上次运行</span>
                          <p className="text-sm">{formatTime(dataSource.scheduler.lastRunAt)}</p>
                        </div>
                      )}
                      {dataSource.scheduler.nextRunAt && (
                        <div className="space-y-1">
                          <span className="text-xs text-muted-foreground">下次运行</span>
                          <p className="text-sm">{formatTime(dataSource.scheduler.nextRunAt)}</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              <Separator />

              {/* 调度配置 */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  调度配置
                </h3>

                {/* 调度类型 */}
                <div className="space-y-2">
                  <Label htmlFor="scheduleType">调度类型</Label>
                  <Select value={scheduleType} onValueChange={(value) => setScheduleType(value || 'interval')}>
                    <SelectTrigger id="scheduleType" className="w-full">
                      <SelectValue>
                        {scheduleType === 'interval' && '定时轮询'}
                        {scheduleType === 'cron' && 'Cron表达式'}
                        {scheduleType === 'webhook' && 'Webhook触发'}
                      </SelectValue>
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
                    <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                      <p className="text-xs font-medium">常用示例：</p>
                      <ul className="text-xs text-muted-foreground space-y-0.5">
                        <li>• <code>0 * * * *</code> - 每小时执行一次</li>
                        <li>• <code>*/30 * * * *</code> - 每30分钟执行一次</li>
                        <li>• <code>0 9 * * *</code> - 每天上午9点执行</li>
                        <li>• <code>0 9,15 * * *</code> - 每天上午9点和下午3点执行</li>
                      </ul>
                    </div>
                  </div>
                )}

                {/* Webhook配置提示 */}
                {scheduleType === 'webhook' && (
                  <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Webhook触发模式下，数据采集将通过外部系统触发。
                    </p>
                    <div className="flex items-start gap-2">
                      <span className="text-sm font-medium">Webhook地址：</span>
                      <code className="text-xs bg-background px-2 py-1 rounded border flex-1 break-all">
                        /api/datasources/{dataSource.id}/trigger
                      </code>
                    </div>
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
            </TabsContent>

            {/* 运行历史标签页 */}
            <TabsContent value="history" className="space-y-3 mt-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  最近 10 次运行记录
                </p>
                {isLoadingLogs && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>

              {uniqueExecutionLogs.length === 0 ? (
                <div className="p-12 text-center text-sm text-muted-foreground border rounded-lg bg-muted/20">
                  暂无运行记录
                </div>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                  {uniqueExecutionLogs.map((log) => (
                    <div
                      key={`${log.id}-${log.createdAt}`}
                      className="p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(log.status)}
                          <Badge variant={getStatusBadgeVariant(log.status)} className="text-xs">
                            {getStatusLabel(log.status)}
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatTime(log.createdAt)}
                        </span>
                      </div>

                      <div className="grid grid-cols-4 gap-3">
                        <div className="space-y-1">
                          <span className="text-xs text-muted-foreground block">采集</span>
                          <span className="text-sm font-semibold">{log.fetchedCount}</span>
                        </div>
                        <div className="space-y-1">
                          <span className="text-xs text-muted-foreground block">处理</span>
                          <span className="text-sm font-semibold">{log.processedCount}</span>
                        </div>
                        <div className="space-y-1">
                          <span className="text-xs text-muted-foreground block">失败</span>
                          <span className={cn(
                            "text-sm font-semibold",
                            log.failedCount > 0 && "text-destructive"
                          )}>
                            {log.failedCount}
                          </span>
                        </div>
                        <div className="space-y-1">
                          <span className="text-xs text-muted-foreground block">耗时</span>
                          <span className="text-sm font-semibold">{formatDuration(log.duration)}</span>
                        </div>
                      </div>

                      {log.message && (
                        <p className="mt-3 text-xs text-muted-foreground line-clamp-2 pt-3 border-t">
                          {log.message}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            取消
          </Button>
          <Button
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
