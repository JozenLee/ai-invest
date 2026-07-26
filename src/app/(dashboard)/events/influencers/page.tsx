'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Plus, Search, Users, Loader2, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';

interface Influencer {
  id: string;
  name: string;
  platform: string;
  accountId: string;
  profileUrl: string | null;
  avatarUrl: string | null;
  category: string | null;
  isActive: boolean;
  lastFetchAt: string | null;
  lastFetchStatus: string | null;
  createdAt: string;
}

interface InfluencerListResponse {
  items: Influencer[];
  total: number;
  page: number;
  pageSize: number;
}

export default function InfluencersPage() {
  const router = useRouter();
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading, error, refetch } = useQuery<InfluencerListResponse>({
    queryKey: ['influencers', platformFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
      });
      if (platformFilter !== 'all') {
        params.set('platform', platformFilter);
      }

      const response = await fetch(`/api/influencers?${params}`);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`加载失败 (${response.status}): ${errorText}`);
      }
      const data = await response.json();

      // 验证响应格式
      if (!data || typeof data !== 'object') {
        throw new Error('API响应格式错误');
      }

      // 如果没有items字段，可能是旧格式，需要适配
      if (!data.items) {
        console.warn('API返回旧格式，正在适配...');
        return {
          items: Array.isArray(data) ? data : [],
          total: Array.isArray(data) ? data.length : 0,
          page: 1,
          pageSize: 20
        };
      }

      return data;
    },
  });

  const getPlatformIcon = (platform: string) => {
    // Using simple colored circles as platform icons
    const config: Record<string, { color: string; label: string }> = {
      bilibili: { color: 'bg-pink-500', label: 'B站' },
      weibo: { color: 'bg-orange-500', label: '微博' },
      xiaohongshu: { color: 'bg-red-500', label: '小红书' },
      zhihu: { color: 'bg-blue-500', label: '知乎' },
      douyin: { color: 'bg-black', label: '抖音' },
      alipay: { color: 'bg-blue-600', label: '支付宝' },
    };
    const cfg = config[platform] || { color: 'bg-gray-500', label: platform };
    return (
      <div className={`w-12 h-12 rounded-full ${cfg.color} flex items-center justify-center text-white font-bold text-xs`}>
        {cfg.label}
      </div>
    );
  };

  const getPlatformLabel = (platform: string) => {
    const labels: Record<string, string> = {
      all: '全部平台',
      bilibili: 'B站',
      weibo: '微博',
      xiaohongshu: '小红书',
      zhihu: '知乎',
      douyin: '抖音',
      alipay: '支付宝',
    };
    return labels[platform] || platform;
  };

  const getPlatformBadge = (platform: string) => {
    const config: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
      bilibili: { label: 'B站', variant: 'default' },
      weibo: { label: '微博', variant: 'secondary' },
      xiaohongshu: { label: '小红书', variant: 'outline' },
      zhihu: { label: '知乎', variant: 'default' },
      douyin: { label: '抖音', variant: 'secondary' },
      alipay: { label: '支付宝', variant: 'outline' },
    };
    const cfg = config[platform] || { label: platform, variant: 'outline' };
    return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
  };

  const getStatusBadge = (status: string | null) => {
    if (!status) return <Badge variant="outline" className="text-xs">待抓取</Badge>;

    const config: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
      success: { label: '成功', variant: 'default' },
      pending: { label: '进行中', variant: 'secondary' },
      error: { label: '失败', variant: 'destructive' },
      failed: { label: '失败', variant: 'destructive' },
    };
    const cfg = config[status] || { label: status, variant: 'outline' };
    return <Badge variant={cfg.variant} className="text-xs">{cfg.label}</Badge>;
  };

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return '未抓取';
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return '刚刚';
      if (diffMins < 60) return `${diffMins}分钟前`;
      if (diffHours < 24) return `${diffHours}小时前`;
      if (diffDays < 7) return `${diffDays}天前`;
      return date.toLocaleDateString('zh-CN');
    } catch {
      return dateStr;
    }
  };

  const filteredInfluencers = (data?.items || []).filter(inf => {
    if (!searchQuery) return true;
    return inf.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
           inf.accountId.includes(searchQuery);
  });

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 0;
  const hasNextPage = data ? page < totalPages : false;
  const hasPrevPage = page > 1;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Users className="h-8 w-8" />
            大V监控
          </h1>
          <p className="text-muted-foreground mt-1">
            关注行业大V，实时追踪观点动态
          </p>
        </div>
        <Button onClick={() => router.push('/events/influencers/new')}>
          <Plus className="h-4 w-4 mr-2" />
          添加大V
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="搜索大V名称或账号..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={platformFilter} onValueChange={(value) => {
              setPlatformFilter(value || 'all');
              setPage(1); // Reset to first page when filter changes
            }}>
              <SelectTrigger className="w-[140px]">
                <SelectValue>{getPlatformLabel(platformFilter)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部平台</SelectItem>
                <SelectItem value="weibo">微博</SelectItem>
                <SelectItem value="bilibili">B站</SelectItem>
                <SelectItem value="xiaohongshu">小红书</SelectItem>
                <SelectItem value="zhihu">知乎</SelectItem>
                <SelectItem value="douyin">抖音</SelectItem>
                <SelectItem value="alipay">支付宝</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-2" />
          <p className="text-muted-foreground">加载中...</p>
        </div>
      )}

      {error && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4 py-4">
              <AlertCircle className="h-12 w-12 text-red-500" />
              <div className="text-center">
                <p className="text-red-500 font-medium mb-1">
                  加载失败
                </p>
                <p className="text-sm text-muted-foreground">
                  {error instanceof Error ? error.message : '未知错误'}
                </p>
              </div>
              <Button onClick={() => refetch()} variant="outline">
                重试
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && filteredInfluencers.length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground py-8">
              {searchQuery ? '没有找到匹配的大V' : '暂无大V监控，点击右上角添加'}
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && filteredInfluencers.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">
              共 {data?.total || 0} 个大V
              {searchQuery && ` (筛选后: ${filteredInfluencers.length})`}
            </p>
            {!searchQuery && totalPages > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={!hasPrevPage}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  上一页
                </Button>
                <span className="text-sm text-muted-foreground px-2">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => p + 1)}
                  disabled={!hasNextPage}
                >
                  下一页
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredInfluencers.map(influencer => (
              <Card
                key={influencer.id}
                className="hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => router.push(`/events/influencers/${influencer.id}`)}
              >
                <CardHeader>
                  <div className="flex items-start gap-3">
                    {influencer.avatarUrl ? (
                      <img
                        src={influencer.avatarUrl}
                        alt={influencer.name}
                        className="w-12 h-12 rounded-full"
                      />
                    ) : (
                      getPlatformIcon(influencer.platform)
                    )}
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg truncate">{influencer.name}</CardTitle>
                      <CardDescription className="flex items-center gap-2 mt-1">
                        {getPlatformBadge(influencer.platform)}
                        {!influencer.isActive && (
                          <Badge variant="outline" className="text-xs">已停用</Badge>
                        )}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-sm">
                    <span className="text-muted-foreground">账号: </span>
                    <span className="font-mono text-xs">{influencer.accountId}</span>
                  </div>
                  {influencer.category && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">领域: </span>
                      <span>{influencer.category}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm pt-2 border-t">
                    <div>
                      <span className="text-muted-foreground">最后抓取: </span>
                      <span>{formatTime(influencer.lastFetchAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">状态:</span>
                    {getStatusBadge(influencer.lastFetchStatus)}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
