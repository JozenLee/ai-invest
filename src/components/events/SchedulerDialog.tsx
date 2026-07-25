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
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  Save,
  Activity,
  Settings,
  History,
  Filter,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatBeijingTime } from '@/lib/time-utils';

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

interface Domain {
  id: string;
  name: string;
  code: string;
  description?: string;
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
  const [updateFrequency, setUpdateFrequency] = useState<number>(60);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [executionLogs, setExecutionLogs] = useState<ExecutionLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  // 领域筛选状态
  const [domains, setDomains] = useState<Domain[]>([]);
  const [isLoadingDomains, setIsLoadingDomains] = useState(false);
  const [domainFilterEnabled, setDomainFilterEnabled] = useState(false);
  const [selectedDomainIds, setSelectedDomainIds] = useState<string[]>([]);
  const [filterMode, setFilterMode] = useState<'include' | 'exclude'>('include');

  // 加载领域列表
  const loadDomains = async () => {
    setIsLoadingDomains(true);
    try {
      const response = await fetch('/api/domains');
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          setDomains(data.data);
        }
      }
    } catch (err) {
      console.error('加载领域列表失败:', err);
    } finally {
      setIsLoadingDomains(false);
    }
  };

  // 初始化表单数据
  useEffect(() => {
    if (open && dataSource) {
      if (dataSource.scheduler) {
        const config = dataSource.scheduler.scheduleConfig;

        // 设置更新频率
        if (config.intervalMinutes) {
          setUpdateFrequency(config.intervalMinutes);
        } else {
          setUpdateFrequency(dataSource.updateFrequency);
        }

        // 设置领域筛选
        if (config.domainFilter) {
          setDomainFilterEnabled(config.domainFilter.enabled || false);
          setSelectedDomainIds(config.domainFilter.domainIds || []);
          setFilterMode(config.domainFilter.mode || 'include');
        } else {
          setDomainFilterEnabled(false);
          setSelectedDomainIds([]);
          setFilterMode('include');
        }
      } else {
        setUpdateFrequency(dataSource.updateFrequency);
        setDomainFilterEnabled(false);
        setSelectedDomainIds([]);
        setFilterMode('include');
      }

      loadExecutionLogs();
      loadDomains();
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
      const scheduleConfig: any = {
        intervalMinutes: updateFrequency,
      };

      // 添加领域筛选配置
      if (domainFilterEnabled && selectedDomainIds.length > 0) {
        scheduleConfig.domainFilter = {
          enabled: true,
          domainIds: selectedDomainIds,
          mode: filterMode,
        };
      }

      const payload = {
        updateFrequency,
        scheduleType: 'interval',
        scheduleConfig: JSON.stringify(scheduleConfig),
      };

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
                        <p className="text-sm">定时轮询</p>
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
                  <Clock className="h-4 w-4" />
                  调度配置
                </h3>

                {/* 定时轮询配置 */}
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
              </div>

              <Separator />

              {/* 领域筛选配置 */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  领域筛选
                </h3>

                {/* 启用领域筛选开关 */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="domain-filter-switch">启用领域筛选</Label>
                    <p className="text-xs text-muted-foreground">
                      仅采集指定领域的资讯内容
                    </p>
                  </div>
                  <Switch
                    id="domain-filter-switch"
                    checked={domainFilterEnabled}
                    onCheckedChange={setDomainFilterEnabled}
                  />
                </div>

                {/* 筛选配置区域 */}
                {domainFilterEnabled && (
                  <div className="space-y-4 p-4 rounded-lg border bg-muted/20">
                    {/* 筛选模式 */}
                    <div className="space-y-2">
                      <Label>筛选模式</Label>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="filterMode"
                            value="include"
                            checked={filterMode === 'include'}
                            onChange={(e) => setFilterMode(e.target.value as 'include' | 'exclude')}
                            className="w-4 h-4"
                          />
                          <span className="text-sm">包含（仅采集选中领域）</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="filterMode"
                            value="exclude"
                            checked={filterMode === 'exclude'}
                            onChange={(e) => setFilterMode(e.target.value as 'include' | 'exclude')}
                            className="w-4 h-4"
                          />
                          <span className="text-sm">排除（不采集选中领域）</span>
                        </label>
                      </div>
                    </div>

                    {/* 领域选择 */}
                    <div className="space-y-2">
                      <Label>选择领域</Label>
                      {isLoadingDomains ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      ) : domains.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4 text-center">
                          暂无可用领域
                        </p>
                      ) : (
                        <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
                          {domains.map((domain) => (
                            <div key={domain.id} className="flex items-center gap-2">
                              <Checkbox
                                id={`domain-${domain.id}`}
                                checked={selectedDomainIds.includes(domain.id)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedDomainIds([...selectedDomainIds, domain.id]);
                                  } else {
                                    setSelectedDomainIds(selectedDomainIds.filter(id => id !== domain.id));
                                  }
                                }}
                              />
                              <Label
                                htmlFor={`domain-${domain.id}`}
                                className="text-sm font-normal cursor-pointer flex-1"
                              >
                                {domain.name}
                                {domain.description && (
                                  <span className="text-xs text-muted-foreground ml-2">
                                    ({domain.description})
                                  </span>
                                )}
                              </Label>
                            </div>
                          ))}
                        </div>
                      )}
                      {selectedDomainIds.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          已选择 {selectedDomainIds.length} 个领域
                        </p>
                      )}
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
