'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Loader2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

export default function NewInfluencerPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    platform: 'weibo',
    accountId: '',
    profileUrl: '',
    avatarUrl: '',
    category: '',
    tags: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 处理tags：从逗号分隔的字符串转为数组
      const tags = formData.tags
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0);

      const payload = {
        name: formData.name,
        platform: formData.platform,
        account_id: formData.accountId,
        profile_url: formData.profileUrl || null,
        avatar_url: formData.avatarUrl || null,
        category: formData.category || null,
        tags: tags.length > 0 ? tags : [],
      };

      const response = await fetch('/api/influencers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '添加失败');
      }

      const data = await response.json();

      toast.success('添加成功', {
        description: `已成功添加大V: ${formData.name}`,
      });

      // 跳转到大V详情页
      router.push(`/events/influencers/${data.id}`);
    } catch (error) {
      console.error('添加大V失败:', error);
      toast.error('添加失败', {
        description: error instanceof Error ? error.message : '未知错误',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => router.back()}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          返回
        </Button>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <UserPlus className="h-8 w-8" />
          添加大V
        </h1>
        <p className="text-muted-foreground mt-1">
          添加新的行业大V进行观点监控
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>基本信息</CardTitle>
          <CardDescription>
            填写大V的基本信息，标记*的为必填项
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">
                大V名称 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                placeholder="例如: 半导体行业观察"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="platform">
                平台 <span className="text-red-500">*</span>
              </Label>
              <Select
                value={formData.platform}
                onValueChange={(value) => setFormData({ ...formData, platform: value || 'weibo' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weibo">微博</SelectItem>
                  <SelectItem value="bilibili">B站</SelectItem>
                  <SelectItem value="xiaohongshu">小红书</SelectItem>
                  <SelectItem value="zhihu">知乎</SelectItem>
                  <SelectItem value="douyin">抖音</SelectItem>
                  <SelectItem value="alipay">支付宝</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="accountId">
                账号ID <span className="text-red-500">*</span>
              </Label>
              <Input
                id="accountId"
                placeholder="例如: 1234567890"
                value={formData.accountId}
                onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
                required
              />
              <p className="text-xs text-muted-foreground">
                {formData.platform === 'weibo' && '微博UID，可从个人主页URL获取'}
                {formData.platform === 'bilibili' && 'B站用户ID，可从空间页URL获取'}
                {formData.platform === 'xiaohongshu' && '小红书用户ID'}
                {formData.platform === 'zhihu' && '知乎用户ID或URL token'}
                {formData.platform === 'douyin' && '抖音用户ID'}
                {formData.platform === 'alipay' && '支付宝生活号ID'}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="profileUrl">主页链接</Label>
              <Input
                id="profileUrl"
                type="url"
                placeholder="例如: https://weibo.com/1234567890"
                value={formData.profileUrl}
                onChange={(e) => setFormData({ ...formData, profileUrl: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="avatarUrl">头像链接</Label>
              <Input
                id="avatarUrl"
                type="url"
                placeholder="头像图片URL（可选）"
                value={formData.avatarUrl}
                onChange={(e) => setFormData({ ...formData, avatarUrl: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">领域分类</Label>
              <Input
                id="category"
                placeholder="例如: 半导体、AI、消费电子"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">标签</Label>
              <Textarea
                id="tags"
                placeholder="用逗号分隔多个标签，例如: 半导体, 芯片, AI硬件"
                value={formData.tags}
                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                标签用于分类和筛选，多个标签用逗号分隔
              </p>
            </div>

            <div className="flex gap-4 pt-4">
              <Button
                type="submit"
                disabled={loading || !formData.name || !formData.accountId}
                className="flex-1"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    添加中...
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 mr-2" />
                    添加大V
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
                disabled={loading}
              >
                取消
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
