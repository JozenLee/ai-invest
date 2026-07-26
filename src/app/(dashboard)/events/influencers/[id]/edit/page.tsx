'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, Save, Loader2, ExternalLink, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { ScheduleConfigPanel } from '@/components/influencers/ScheduleConfigPanel';

interface Influencer {
  id: string;
  name: string;
  platform: string;
  accountId: string;
  profileUrl: string | null;
  avatarUrl: string | null;
  category: string | null;
  tags: string[] | null;
  priority: string;
  isActive: boolean;
  scheduleType: 'polling' | 'daily';
  fetchInterval: number;
  dailyFetchTimes: string[] | null;
  dataRetentionDays: number;
  createdAt: string;
}

export default function EditInfluencerPage() {
  const params = useParams();
  const router = useRouter();
  const influencerId = params.id as string;

  // 状态管理
  const [influencer, setInfluencer] = useState<Influencer | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // 表单状态
  const [formData, setFormData] = useState({
    tags: '',
    priority: 'medium',
    isActive: true,
    scheduleType: 'polling' as 'polling' | 'daily',
    fetchInterval: 30,
    dailyFetchTimes: ['12:00', '14:00'],
    dataRetentionDays: 30,
  });

  // 获取influencer数据
  useEffect(() => {
    const fetchInfluencer = async () => {
      try {
        const response = await fetch(`http://localhost:8000/api/influencers/${influencerId}`);
        if (!response.ok) {
          throw new Error('加载失败');
        }
        const data = await response.json();
        setInfluencer(data);

        // 初始化表单数据
        setFormData({
          tags: data.tags ? data.tags.join(', ') : '',
          priority: data.priority,
          isActive: data.isActive,
          scheduleType: data.scheduleType,
          fetchInterval: data.fetchInterval,
          dailyFetchTimes: data.dailyFetchTimes || ['12:00', '14:00'],
          dataRetentionDays: data.dataRetentionDays,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载失败');
      } finally {
        setLoading(false);
      }
    };

    fetchInfluencer();
  }, [influencerId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!influencer) return;

    setSaving(true);

    try {
      const tags = formData.tags
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0);

      const payload = {
        // 保持只读字段不变（后端会验证）
        name: influencer.name,
        platform: influencer.platform,
        accountId: influencer.accountId,
        profileUrl: influencer.profileUrl,
        avatarUrl: influencer.avatarUrl,
        category: influencer.category,

        // 可编辑字段
        tags: tags,
        priority: formData.priority,
        isActive: formData.isActive,
        scheduleType: formData.scheduleType,
        fetchInterval: formData.fetchInterval,
        dailyFetchTimes: formData.scheduleType === 'daily' ? formData.dailyFetchTimes : null,
        dataRetentionDays: formData.dataRetentionDays,
      };

      const response = await fetch(`http://localhost:8000/api/influencers/${influencerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || '更新失败');
      }

      toast.success('更新成功');
      router.push(`/events/influencers/${influencerId}`);
    } catch (error) {
      console.error('更新失败:', error);
      toast.error('更新失败', {
        description: error instanceof Error ? error.message : '未知错误',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6 max-w-3xl space-y-6">
        <div className="h-10 w-64 bg-muted animate-pulse rounded" />
        <div className="h-[400px] bg-muted animate-pulse rounded" />
      </div>
    );
  }

  if (error || !influencer) {
    return (
      <div className="container mx-auto p-6 max-w-3xl">
        <Alert variant="destructive">
          <AlertDescription>
            加载失败: {error || '未知错误'}
          </AlertDescription>
        </Alert>
        <Button onClick={() => router.back()} className="mt-4">
          返回
        </Button>
      </div>
    );
  }

  const getPlatformLabel = (platform: string) => {
    const labels: Record<string, string> = {
      bilibili: 'B站',
      weibo: '微博',
      xiaohongshu: '小红书',
      zhihu: '知乎',
      douyin: '抖音',
      alipay: '支付宝',
    };
    return labels[platform] || platform;
  };

  return (
    <div className="container mx-auto p-6 max-w-3xl">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => router.push(`/events/influencers/${influencerId}`)}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          返回详情
        </Button>
        <h1 className="text-3xl font-bold">编辑大V</h1>
        <p className="text-muted-foreground mt-1">
          修改监控配置和自定义信息
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 平台信息（只读） */}
        <Card className="bg-muted/30 border-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              平台信息
              <div className="flex items-center gap-2 text-sm font-normal text-muted-foreground">
                <Lock className="h-4 w-4" />
                自动同步，不可编辑
              </div>
            </CardTitle>
            <CardDescription>
              此信息由平台自动同步，每次抓取时更新
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-4">
              {influencer.avatarUrl && (
                <img
                  src={influencer.avatarUrl}
                  alt={influencer.name}
                  className="w-16 h-16 rounded-full"
                />
              )}
              <div className="flex-1 grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm text-muted-foreground">名称</span>
                  <p className="font-medium">{influencer.name}</p>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">平台</span>
                  <p>{getPlatformLabel(influencer.platform)}</p>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">账号ID</span>
                  <p className="font-mono text-sm">{influencer.accountId}</p>
                </div>
                {influencer.category && (
                  <div>
                    <span className="text-sm text-muted-foreground">领域</span>
                    <p>{influencer.category}</p>
                  </div>
                )}
                {influencer.profileUrl && (
                  <div className="col-span-2">
                    <span className="text-sm text-muted-foreground">主页</span>
                    <a
                      href={influencer.profileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-1 mt-1"
                    >
                      访问主页 <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 自定义配置（可编辑） */}
        <Card>
          <CardHeader>
            <CardTitle>自定义配置</CardTitle>
            <CardDescription>
              您可以修改标签、优先级和调度策略
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="tags">标签</Label>
              <Textarea
                id="tags"
                placeholder="用逗号分隔多个标签"
                value={formData.tags}
                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">优先级</Label>
              <select
                id="priority"
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2"
              >
                <option value="high">高</option>
                <option value="medium">中</option>
                <option value="low">低</option>
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="isActive"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                className="rounded"
              />
              <Label htmlFor="isActive" className="cursor-pointer">
                启用监控
              </Label>
            </div>

            <ScheduleConfigPanel
              scheduleType={formData.scheduleType}
              onScheduleTypeChange={(type) => setFormData({ ...formData, scheduleType: type })}
              fetchInterval={formData.fetchInterval}
              onFetchIntervalChange={(interval) => setFormData({ ...formData, fetchInterval: interval })}
              dailyFetchTimes={formData.dailyFetchTimes}
              onDailyFetchTimesChange={(times) => setFormData({ ...formData, dailyFetchTimes: times })}
            />

            <div className="space-y-2">
              <Label htmlFor="dataRetentionDays">数据保留天数</Label>
              <Input
                id="dataRetentionDays"
                type="number"
                min="1"
                max="365"
                value={formData.dataRetentionDays}
                onChange={(e) => setFormData({ ...formData, dataRetentionDays: parseInt(e.target.value) || 30 })}
                className="w-32"
              />
              <p className="text-xs text-muted-foreground">
                超过此天数的动态将被自动清理
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-4">
          <Button
            type="submit"
            disabled={saving}
            className="flex-1"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                保存中...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                保存修改
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/events/influencers/${influencerId}`)}
            disabled={saving}
          >
            取消
          </Button>
        </div>
      </form>
    </div>
  );
}
