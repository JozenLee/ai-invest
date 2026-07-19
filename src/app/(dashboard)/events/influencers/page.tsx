'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Plus, Search, Users } from 'lucide-react';

interface Influencer {
  id: string;
  name: string;
  platform: string;
  accountId: string;
  profileUrl: string | null;
  avatarUrl: string | null;
  category: string | null;
  tags: string[];
  isActive: boolean;
  postCount: number;
  createdAt: string;
}

export default function InfluencersPage() {
  const router = useRouter();
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const { data, isLoading, error } = useQuery<{ success: boolean; data: Influencer[] }>({
    queryKey: ['influencers', platformFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (platformFilter !== 'all') {
        params.set('platform', platformFilter);
      }

      const response = await fetch(`/api/influencers?${params}`);
      if (!response.ok) throw new Error('Failed to fetch influencers');
      return response.json();
    },
  });

  const getPlatformBadge = (platform: string) => {
    const config: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
      bilibili: { label: 'B站', variant: 'default' },
      weibo: { label: '微博', variant: 'secondary' },
      xiaohongshu: { label: '小红书', variant: 'outline' },
    };
    const cfg = config[platform] || { label: platform, variant: 'outline' };
    return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
  };

  const filteredInfluencers = data?.data.filter(inf => {
    if (!searchQuery) return true;
    return inf.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
           inf.accountId.includes(searchQuery);
  }) || [];

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
            <Select value={platformFilter} onValueChange={(value) => setPlatformFilter(value || 'all')}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部平台</SelectItem>
                <SelectItem value="bilibili">B站</SelectItem>
                <SelectItem value="weibo">微博</SelectItem>
                <SelectItem value="xiaohongshu">小红书</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">加载中...</p>
        </div>
      )}

      {error && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-red-500">
              加载失败: {error instanceof Error ? error.message : '未知错误'}
            </p>
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

      {!isLoading && filteredInfluencers.length > 0 && (
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
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                      <Users className="h-6 w-6 text-muted-foreground" />
                    </div>
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
                {influencer.category && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">领域: </span>
                    <span>{influencer.category}</span>
                  </div>
                )}
                {influencer.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {influencer.tags.slice(0, 3).map((tag, idx) => (
                      <Badge key={idx} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                    {influencer.tags.length > 3 && (
                      <Badge variant="secondary" className="text-xs">
                        +{influencer.tags.length - 3}
                      </Badge>
                    )}
                  </div>
                )}
                <div className="flex items-center justify-between text-sm text-muted-foreground pt-2 border-t">
                  <span>动态: {influencer.postCount}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
