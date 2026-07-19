'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus, Activity, AlertCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface HealthMonitorProps {
  sourceId: string;
  sourceName?: string;
}

interface HealthData {
  overallHealth: number;
  successRate: number;
  recentLogs: {
    total: number;
    success: number;
    failed: number;
    running: number;
  };
  trend: Array<{
    time: string;
    successRate: number;
  }>;
  lastSuccess?: string;
  lastFailed?: string;
}

export function HealthMonitor({ sourceId, sourceName }: HealthMonitorProps) {
  // 查询健康度数据
  const { data, isLoading, error } = useQuery<HealthData>({
    queryKey: ['datasource-health', sourceId],
    queryFn: async () => {
      // 获取最近24小时的日志
      const logsResponse = await fetch(
        `/api/datasources/logs?sourceId=${sourceId}&limit=100`
      );
      if (!logsResponse.ok) throw new Error('Failed to fetch logs');
      const logsData = await logsResponse.json();

      const logs = logsData.data.items;
      const now = new Date();
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // 过滤最近24小时的日志
      const recentLogs = logs.filter(
        (log: any) => new Date(log.createdAt) >= last24h
      );

      // 统计
      const total = recentLogs.length;
      const success = recentLogs.filter((log: any) => log.status === 'success').length;
      const failed = recentLogs.filter((log: any) => log.status === 'failed').length;
      const running = recentLogs.filter((log: any) => log.status === 'running').length;

      // 成功率
      const successRate = total > 0 ? (success / total) * 100 : 0;

      // 计算健康度评分（0-100）
      let overallHealth = 0;
      if (total === 0) {
        overallHealth = 50; // 无数据时中等
      } else {
        // 基础分：成功率 * 70%
        overallHealth = successRate * 0.7;

        // 奖励分：有成功记录 +15
        if (success > 0) overallHealth += 15;

        // 奖励分：失败率低 +15
        if (failed === 0) {
          overallHealth += 15;
        } else if (failed / total < 0.1) {
          overallHealth += 10;
        } else if (failed / total < 0.3) {
          overallHealth += 5;
        }

        overallHealth = Math.min(100, Math.max(0, overallHealth));
      }

      // 计算趋势（每2小时一个点）
      const trend = [];
      for (let i = 11; i >= 0; i--) {
        const periodEnd = new Date(now.getTime() - i * 2 * 60 * 60 * 1000);
        const periodStart = new Date(periodEnd.getTime() - 2 * 60 * 60 * 1000);

        const periodLogs = recentLogs.filter((log: any) => {
          const logTime = new Date(log.createdAt);
          return logTime >= periodStart && logTime < periodEnd;
        });

        const periodSuccess = periodLogs.filter(
          (log: any) => log.status === 'success'
        ).length;
        const periodTotal = periodLogs.length;
        const rate = periodTotal > 0 ? (periodSuccess / periodTotal) * 100 : 0;

        trend.push({
          time: periodEnd.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
          successRate: Math.round(rate),
        });
      }

      // 最后成功/失败时间
      const lastSuccess = recentLogs.find((log: any) => log.status === 'success')?.createdAt;
      const lastFailed = recentLogs.find((log: any) => log.status === 'failed')?.createdAt;

      return {
        overallHealth: Math.round(overallHealth),
        successRate: Math.round(successRate),
        recentLogs: { total, success, failed, running },
        trend,
        lastSuccess,
        lastFailed,
      };
    },
    refetchInterval: 60000, // 每分钟刷新
  });

  const getHealthStatus = (health: number) => {
    if (health >= 80) return { label: '健康', color: 'text-green-500', variant: 'default' as const };
    if (health >= 60) return { label: '良好', color: 'text-blue-500', variant: 'secondary' as const };
    if (health >= 40) return { label: '警告', color: 'text-yellow-500', variant: 'outline' as const };
    return { label: '异常', color: 'text-red-500', variant: 'destructive' as const };
  };

  const getTrendIcon = (trend: number) => {
    if (trend > 0) return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (trend < 0) return <TrendingDown className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-gray-500" />;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            健康度监控
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">加载中...</div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            健康度监控
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-red-500">
            加载失败: {error instanceof Error ? error.message : '未知错误'}
          </div>
        </CardContent>
      </Card>
    );
  }

  const healthStatus = getHealthStatus(data.overallHealth);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          健康度监控
        </CardTitle>
        <CardDescription>
          {sourceName || '数据源'}的运行状态和健康评分
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 总体健康度 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">总体健康度</span>
            <Badge variant={healthStatus.variant}>{healthStatus.label}</Badge>
          </div>
          <div className="flex items-center gap-3">
            <Progress value={data.overallHealth} className="flex-1" />
            <span className={`text-2xl font-bold ${healthStatus.color}`}>
              {data.overallHealth}
            </span>
          </div>
        </div>

        {/* 成功率 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">采集成功率（24小时）</span>
            <span className="text-sm font-medium">{data.successRate}%</span>
          </div>
          <Progress value={data.successRate} className="h-2" />
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-2 gap-4">
          <div className="border rounded-lg p-3">
            <div className="text-xs text-muted-foreground mb-1">总执行次数</div>
            <div className="text-2xl font-bold">{data.recentLogs.total}</div>
          </div>
          <div className="border rounded-lg p-3">
            <div className="text-xs text-muted-foreground mb-1">成功次数</div>
            <div className="text-2xl font-bold text-green-500">{data.recentLogs.success}</div>
          </div>
          <div className="border rounded-lg p-3">
            <div className="text-xs text-muted-foreground mb-1">失败次数</div>
            <div className="text-2xl font-bold text-red-500">{data.recentLogs.failed}</div>
          </div>
          <div className="border rounded-lg p-3">
            <div className="text-xs text-muted-foreground mb-1">运行中</div>
            <div className="text-2xl font-bold text-blue-500">{data.recentLogs.running}</div>
          </div>
        </div>

        {/* 成功率趋势图 */}
        {data.trend.length > 0 && (
          <div>
            <div className="text-sm font-medium mb-3">成功率趋势（24小时）</div>
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={data.trend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 10 }}
                  className="text-muted-foreground"
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 10 }}
                  className="text-muted-foreground"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px',
                  }}
                  formatter={(value) => [`${value}%`, '成功率']}
                />
                <Line
                  type="monotone"
                  dataKey="successRate"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* 警告信息 */}
        {data.recentLogs.failed > 0 && (
          <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-500 mt-0.5" />
            <div className="flex-1 text-sm">
              <p className="font-medium text-yellow-800 dark:text-yellow-300">
                检测到 {data.recentLogs.failed} 次采集失败
              </p>
              {data.lastFailed && (
                <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-1">
                  最后失败时间: {new Date(data.lastFailed).toLocaleString('zh-CN')}
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
