'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, ChevronDown, ChevronUp, Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface LogViewerProps {
  sourceId?: string;
  defaultLimit?: number;
}

interface DataSourceLog {
  id: string;
  sourceId: string;
  sourceName: string;
  status: 'success' | 'failed' | 'running';
  message: string;
  fetchedCount: number;
  processedCount: number;
  failedCount: number;
  duration: number;
  error?: string;
  createdAt: string;
}

interface LogsResponse {
  success: boolean;
  data: {
    total: number;
    items: DataSourceLog[];
    limit: number;
    offset: number;
  };
}

export function LogViewer({ sourceId, defaultLimit = 50 }: LogViewerProps) {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

  // 查询日志数据
  const { data, isLoading, error, refetch } = useQuery<LogsResponse>({
    queryKey: ['datasource-logs', sourceId, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: defaultLimit.toString(),
        offset: '0',
      });
      if (sourceId) params.set('sourceId', sourceId);
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const response = await fetch(`/api/datasources/logs?${params}`);
      if (!response.ok) throw new Error('Failed to fetch logs');
      return response.json();
    },
    refetchInterval: 30000, // 每30秒自动刷新
  });

  const toggleExpanded = (logId: string) => {
    setExpandedLogs(prev => {
      const next = new Set(prev);
      if (next.has(logId)) {
        next.delete(logId);
      } else {
        next.add(logId);
      }
      return next;
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'running':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      success: 'default',
      failed: 'destructive',
      running: 'secondary',
    };
    const labels: Record<string, string> = {
      success: '成功',
      failed: '失败',
      running: '运行中',
    };
    return (
      <Badge variant={variants[status] || 'outline'}>
        {labels[status] || status}
      </Badge>
    );
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}min`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>采集日志</CardTitle>
            <CardDescription>
              查看数据源采集历史记录和执行状态
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value || 'all')}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="success">成功</SelectItem>
                <SelectItem value="failed">失败</SelectItem>
                <SelectItem value="running">运行中</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="text-center py-8 text-red-500">
            加载日志失败: {error instanceof Error ? error.message : '未知错误'}
          </div>
        )}

        {data && data.data.items.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            暂无日志记录
          </div>
        )}

        {data && data.data.items.length > 0 && (
          <div className="space-y-3">
            {data.data.items.map(log => (
              <div
                key={log.id}
                className="border rounded-lg p-4 hover:bg-accent/50 transition-colors"
              >
                {/* 日志头部 */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="mt-1">{getStatusIcon(log.status)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {!sourceId && (
                          <span className="font-medium text-sm">{log.sourceName}</span>
                        )}
                        {getStatusBadge(log.status)}
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(log.createdAt), {
                            locale: zhCN,
                            addSuffix: true,
                          })}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{log.message}</p>

                      {/* 统计信息 */}
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span>
                          采集: <span className="font-medium text-foreground">{log.fetchedCount}</span>
                        </span>
                        <span>
                          处理: <span className="font-medium text-foreground">{log.processedCount}</span>
                        </span>
                        {log.failedCount > 0 && (
                          <span>
                            失败: <span className="font-medium text-red-500">{log.failedCount}</span>
                          </span>
                        )}
                        <span>
                          耗时: <span className="font-medium text-foreground">{formatDuration(log.duration)}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 展开按钮 */}
                  {log.error && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleExpanded(log.id)}
                    >
                      {expandedLogs.has(log.id) ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                </div>

                {/* 展开详情（错误信息） */}
                {expandedLogs.has(log.id) && log.error && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-xs font-medium text-muted-foreground mb-1">错误详情:</p>
                    <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                      {log.error}
                    </pre>
                  </div>
                )}
              </div>
            ))}

            {/* 分页信息 */}
            <div className="text-center text-sm text-muted-foreground pt-2">
              显示 {data.data.items.length} / {data.data.total} 条记录
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
