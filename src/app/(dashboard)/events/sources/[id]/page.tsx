'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { LogViewer } from '@/components/datasources/LogViewer';
import { HealthMonitor } from '@/components/datasources/HealthMonitor';
import {
  ArrowLeft,
  Edit,
  Play,
  Pause,
  Trash2,
  ExternalLink,
  Calendar,
  Clock,
  Activity,
  FileText,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { formatBeijingTime } from '@/lib/time-utils';

interface DataSource {
  id: string;
  name: string;
  provider: string;
  config: any;
  isActive: boolean;
  lastFetchAt?: string;
  lastFetchStatus?: string;
  fetchCount: number;
  articleCount: number;
  createdAt: string;
  updatedAt: string;
}

export default function DataSourceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const sourceId = params.id as string;

  // 查询数据源详情
  const { data, isLoading, error } = useQuery<{ success: boolean; data: DataSource }>({
    queryKey: ['datasource', sourceId],
    queryFn: async () => {
      const response = await fetch(`/api/datasources/${sourceId}`);
      if (!response.ok) throw new Error('Failed to fetch data source');
      return response.json();
    },
  });

  const handleBack = () => {
    router.push('/events/sources');
  };

  const handleEdit = () => {
    router.push(`/events/sources/${sourceId}/edit`);
  };

  const handleToggleActive = async () => {
    try {
      const response = await fetch(`/api/datasources/${sourceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isActive: !data?.data.isActive,
        }),
      });

      if (!response.ok) throw new Error('Failed to update data source');

      // 刷新数据
      window.location.reload();
    } catch (error) {
      console.error('Error toggling data source:', error);
      alert('操作失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  const handleDelete = async () => {
    if (!confirm('确定要删除此数据源吗？此操作不可撤销。')) return;

    try {
      const response = await fetch(`/api/datasources/${sourceId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete data source');

      alert('数据源已删除');
      router.push('/events/sources');
    } catch (error) {
      console.error('Error deleting data source:', error);
      alert('删除失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  const handleManualFetch = async () => {
    try {
      const response = await fetch(`/api/datasources/${sourceId}/fetch`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Failed to trigger fetch');

      alert('采集任务已触发，请稍后查看日志');
    } catch (error) {
      console.error('Error triggering fetch:', error);
      alert('触发失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[400px]" />
        <Skeleton className="h-[300px]" />
      </div>
    );
  }

  if (error || !data?.success) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <p className="text-red-500 mb-4">
            加载失败: {error instanceof Error ? error.message : '未知错误'}
          </p>
          <Button onClick={handleBack}>返回列表</Button>
        </div>
      </div>
    );
  }

  const source = data.data;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* 页面头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">{source.name}</h1>
              <Badge variant={source.isActive ? 'default' : 'secondary'}>
                {source.isActive ? '运行中' : '已停止'}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1">
              Provider: {source.provider} | 创建于{' '}
              {formatBeijingTime(source.createdAt, 'full')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleManualFetch}>
            <Play className="h-4 w-4 mr-2" />
            手动采集
          </Button>
          <Button variant="outline" size="sm" onClick={handleEdit}>
            <Edit className="h-4 w-4 mr-2" />
            编辑
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleToggleActive}
          >
            {source.isActive ? (
              <>
                <Pause className="h-4 w-4 mr-2" />
                停止
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                启动
              </>
            )}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            删除
          </Button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              采集次数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{source.fetchCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              文章总数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{source.articleCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              最后采集
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm">
              {source.lastFetchAt
                ? formatDistanceToNow(new Date(source.lastFetchAt), {
                    locale: zhCN,
                    addSuffix: true,
                  })
                : '从未'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              最后状态
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge
              variant={
                source.lastFetchStatus === 'success'
                  ? 'default'
                  : source.lastFetchStatus === 'failed'
                  ? 'destructive'
                  : 'secondary'
              }
            >
              {source.lastFetchStatus === 'success'
                ? '成功'
                : source.lastFetchStatus === 'failed'
                ? '失败'
                : '未知'}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* 配置信息 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            配置信息
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-sm font-medium text-muted-foreground">Provider:</span>
                <p className="mt-1">{source.provider}</p>
              </div>
              <div>
                <span className="text-sm font-medium text-muted-foreground">状态:</span>
                <p className="mt-1">{source.isActive ? '启用' : '禁用'}</p>
              </div>
            </div>

            {/* 配置详情 */}
            <div>
              <span className="text-sm font-medium text-muted-foreground">配置参数:</span>
              <pre className="mt-2 p-3 bg-muted rounded-lg text-xs overflow-x-auto">
                {JSON.stringify(source.config, null, 2)}
              </pre>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 健康度监控 */}
      <HealthMonitor sourceId={sourceId} sourceName={source.name} />

      {/* 采集日志 */}
      <LogViewer sourceId={sourceId} />
    </div>
  );
}
