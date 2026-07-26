'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft,
  Edit,
  Trash2,
  RefreshCw,
  ExternalLink,
  Users,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface Influencer {
  id: string;
  name: string;
  platform: string;
  accountId: string;
  profileUrl: string | null;
  avatarUrl: string | null;
  category: string | null;
  tags: string[] | null;
  isActive: boolean;
  postCount: number;
  createdAt: string;
}

interface Post {
  id: string;
  influencerId: string;
  content: string;
  url: string;
  publishTime: string;
  sentiment: number | null;
  extractedTopics: string[] | null;
  relatedDomains: string[] | null;
  createdAt: string;
}

export default function InfluencerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const influencerId = params.id as string;

  const { data: influencerData, isLoading: loadingInfluencer, error: influencerError } = useQuery<Influencer>({
    queryKey: ['influencer', influencerId],
    queryFn: async () => {
      const response = await fetch(`/api/influencers/${influencerId}`);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`加载失败 (${response.status}): ${errorText}`);
      }
      return response.json();
    },
  });

  const { data: postsData, isLoading: loadingPosts } = useQuery<{
    items: Post[];
    total: number;
  }>({
    queryKey: ['influencer-posts', influencerId],
    queryFn: async () => {
      const response = await fetch(`/api/influencers/${influencerId}/posts?limit=20`);
      if (!response.ok) {
        console.warn('Failed to fetch posts, returning empty array');
        return { items: [], total: 0 };
      }
      const data = await response.json();

      // 适配不同的返回格式
      if (data.success && data.data) {
        return data.data;
      }
      if (data.items) {
        return data;
      }
      return { items: [], total: 0 };
    },
  });

  const handleBack = () => {
    router.push('/events/influencers');
  };

  const handleFetch = async () => {
    try {
      const response = await fetch(`/api/influencers/${influencerId}/fetch`, {
        method: 'POST',
      });
      const result = await response.json();
      
      if (result.success) {
        alert('采集任务已触发！');
      } else {
        alert(`采集失败: ${result.message || result.error}`);
      }
    } catch (error) {
      console.error('Error triggering fetch:', error);
      alert('触发采集失败');
    }
  };

  const handleEdit = () => {
    router.push(`/events/influencers/${influencerId}/edit`);
  };

  const handleDelete = async () => {
    if (!confirm('确定要删除此大V监控吗？')) return;

    try {
      const response = await fetch(`/api/influencers/${influencerId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        alert('已删除');
        router.push('/events/influencers');
      } else {
        alert('删除失败');
      }
    } catch (error) {
      console.error('Error deleting influencer:', error);
      alert('删除失败');
    }
  };

  const getPlatformName = (platform: string) => {
    const map: Record<string, string> = {
      bilibili: 'B站',
      weibo: '微博',
      xiaohongshu: '小红书',
    };
    return map[platform] || platform;
  };

  const getSentimentColor = (sentiment: number | null) => {
    if (sentiment === null) return 'text-gray-500';
    if (sentiment > 0.3) return 'text-green-500';
    if (sentiment < -0.3) return 'text-red-500';
    return 'text-yellow-500';
  };

  if (loadingInfluencer) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[300px]" />
      </div>
    );
  }

  if (influencerError || !influencerData) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <p className="text-red-500 mb-4">
            加载失败: {influencerError instanceof Error ? influencerError.message : '未知错误'}
          </p>
          <Button onClick={handleBack}>返回列表</Button>
        </div>
      </div>
    );
  }

  const influencer = influencerData;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回
          </Button>
          <div className="flex items-center gap-3">
            {influencer.avatarUrl ? (
              <img
                src={influencer.avatarUrl}
                alt={influencer.name}
                className="w-16 h-16 rounded-full"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <Users className="h-8 w-8 text-muted-foreground" />
              </div>
            )}
            <div>
              <h1 className="text-3xl font-bold">{influencer.name}</h1>
              <p className="text-muted-foreground">
                {getPlatformName(influencer.platform)} | {influencer.accountId}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleFetch}>
            <RefreshCw className="h-4 w-4 mr-2" />
            手动采集
          </Button>
          <Button variant="outline" size="sm" onClick={handleEdit}>
            <Edit className="h-4 w-4 mr-2" />
            编辑
          </Button>
          <Button variant="destructive" size="sm" onClick={handleDelete}>
            <Trash2 className="h-4 w-4 mr-2" />
            删除
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              动态数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{influencer.postCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              状态
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={influencer.isActive ? 'default' : 'secondary'}>
              {influencer.isActive ? '运行中' : '已停用'}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              添加时间
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm">
              {formatDistanceToNow(new Date(influencer.createdAt), {
                locale: zhCN,
                addSuffix: true,
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>基本信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-sm font-medium text-muted-foreground">平台:</span>
              <p className="mt-1">{getPlatformName(influencer.platform)}</p>
            </div>
            <div>
              <span className="text-sm font-medium text-muted-foreground">账号ID:</span>
              <p className="mt-1">{influencer.accountId}</p>
            </div>
            {influencer.category && (
              <div>
                <span className="text-sm font-medium text-muted-foreground">领域:</span>
                <p className="mt-1">{influencer.category}</p>
              </div>
            )}
            {influencer.profileUrl && (
              <div>
                <span className="text-sm font-medium text-muted-foreground">主页:</span>
                <a
                  href={influencer.profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 text-primary hover:underline flex items-center gap-1"
                >
                  访问主页 <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </div>
          {influencer.tags && influencer.tags.length > 0 && (
            <div>
              <span className="text-sm font-medium text-muted-foreground">标签:</span>
              <div className="flex flex-wrap gap-2 mt-2">
                {influencer.tags.map((tag, idx) => (
                  <Badge key={idx} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>最近动态</CardTitle>
          <p className="text-sm text-muted-foreground">
            共 {postsData?.total || 0} 条动态
          </p>
        </CardHeader>
        <CardContent>
          {loadingPosts && <p className="text-center py-4">加载中...</p>}
          
          {!loadingPosts && postsData?.items.length === 0 && (
            <p className="text-center py-8 text-muted-foreground">暂无动态</p>
          )}

          {!loadingPosts && postsData && postsData.items.length > 0 && (
            <div className="space-y-4">
              {postsData.items.map(post => (
                <div key={post.id} className="border rounded-lg p-4 hover:bg-accent/50 transition-colors">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="flex-1">
                      <p className="text-sm line-clamp-3">{post.content}</p>
                    </div>
                    {post.sentiment !== null && (
                      <div className={`text-sm font-medium ${getSentimentColor(post.sentiment)}`}>
                        {post.sentiment > 0 ? '↗' : post.sentiment < 0 ? '↘' : '→'}
                        {(post.sentiment * 100).toFixed(0)}%
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {formatDistanceToNow(new Date(post.publishTime), {
                        locale: zhCN,
                        addSuffix: true,
                      })}
                    </span>
                    {post.url && (
                      <a
                        href={post.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline flex items-center gap-1"
                      >
                        查看原文 <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>

                  {post.extractedTopics && post.extractedTopics.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {post.extractedTopics.map((topic, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {topic}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
