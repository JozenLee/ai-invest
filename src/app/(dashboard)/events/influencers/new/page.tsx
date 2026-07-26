'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, Loader2, UserPlus, AlertTriangle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { PlatformValidator } from '@/components/influencers/PlatformValidator';
import { ScheduleConfigPanel } from '@/components/influencers/ScheduleConfigPanel';

interface ValidatedInfo {
  name: string;
  avatarUrl: string;
  profileUrl: string;
  category: string;
  verified: boolean;
  followersCount: number;
}

export default function NewInfluencerPage() {
  const router = useRouter();

  // Step 1: 验证状态
  const [step, setStep] = useState<'validate' | 'configure'>('validate');
  const [platform, setPlatform] = useState('');
  const [accountId, setAccountId] = useState('');
  const [validatedInfo, setValidatedInfo] = useState<ValidatedInfo | null>(null);
  const [manualMode, setManualMode] = useState(false);

  // Step 2: 配置状态
  const [formData, setFormData] = useState({
    name: '',
    profileUrl: '',
    avatarUrl: '',
    category: '',
    tags: '',
    priority: 'medium',
    scheduleType: 'polling' as 'polling' | 'daily',
    fetchInterval: 30,
    dailyFetchTimes: ['12:00', '14:00'],
    dataRetentionDays: 30,
  });

  const [loading, setLoading] = useState(false);

  const handleValidated = (
    validatedPlatform: string,
    validatedAccountId: string,
    info: ValidatedInfo | null
  ) => {
    setPlatform(validatedPlatform);
    setAccountId(validatedAccountId);

    if (info) {
      // 自动获取成功
      setValidatedInfo(info);
      setFormData(prev => ({
        ...prev,
        name: info.name,
        avatarUrl: info.avatarUrl,
        profileUrl: info.profileUrl,
        category: info.category,
      }));
      setManualMode(false);
    } else {
      // 平台不支持，进入手动模式
      setManualMode(true);
    }

    setStep('configure');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const tags = formData.tags
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0);

      const payload = {
        name: formData.name,
        platform: platform,
        accountId: accountId,
        profileUrl: formData.profileUrl || null,
        avatarUrl: formData.avatarUrl || null,
        category: formData.category || null,
        tags: tags.length > 0 ? tags : [],
        priority: formData.priority,
        scheduleType: formData.scheduleType,
        fetchInterval: formData.fetchInterval,
        dailyFetchTimes: formData.scheduleType === 'daily' ? formData.dailyFetchTimes : null,
        dataRetentionDays: formData.dataRetentionDays,
      };

      const response = await fetch('http://localhost:8000/api/influencers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || '添加失败');
      }

      const data = await response.json();

      toast.success('添加成功', {
        description: `已成功添加大V: ${formData.name}`,
      });

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
    <div className="container mx-auto p-6 max-w-3xl">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => step === 'validate' ? router.back() : setStep('validate')}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {step === 'validate' ? '返回' : '上一步'}
        </Button>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <UserPlus className="h-8 w-8" />
          添加大V
        </h1>
        <p className="text-muted-foreground mt-1">
          {step === 'validate' ? '第1步：验证账号信息' : '第2步：配置监控参数'}
        </p>
      </div>

      {step === 'validate' && (
        <Card>
          <CardHeader>
            <CardTitle>账号验证</CardTitle>
            <CardDescription>
              输入平台和账号ID，系统将自动获取账号信息
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PlatformValidator onValidated={handleValidated} />
          </CardContent>
        </Card>
      )}

      {step === 'configure' && (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 平台信息预览（自动获取模式） */}
          {!manualMode && validatedInfo && (
            <Card className="bg-muted/50">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  平台信息
                  <span className="text-sm font-normal text-muted-foreground">
                    自动同步，不可编辑
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-start gap-4">
                  {validatedInfo.avatarUrl && (
                    <img
                      src={validatedInfo.avatarUrl}
                      alt={validatedInfo.name}
                      className="w-16 h-16 rounded-full"
                    />
                  )}
                  <div className="flex-1 space-y-2">
                    <div>
                      <span className="text-sm text-muted-foreground">名称：</span>
                      <span className="font-medium">{validatedInfo.name}</span>
                      {validatedInfo.verified && (
                        <span className="ml-2 text-xs text-blue-600">已认证</span>
                      )}
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">领域：</span>
                      <span>{validatedInfo.category}</span>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">粉丝数：</span>
                      <span>{validatedInfo.followersCount.toLocaleString()}</span>
                    </div>
                    {validatedInfo.profileUrl && (
                      <a
                        href={validatedInfo.profileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                      >
                        访问主页 <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 手动填写模式提示 */}
          {manualMode && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                该平台暂不支持自动获取，请手动填写账号信息
              </AlertDescription>
            </Alert>
          )}

          {/* 手动填写字段（仅手动模式） */}
          {manualMode && (
            <Card>
              <CardHeader>
                <CardTitle>账号信息</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">
                    大V名称 <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="profileUrl">主页链接</Label>
                  <Input
                    id="profileUrl"
                    type="url"
                    value={formData.profileUrl}
                    onChange={(e) => setFormData({ ...formData, profileUrl: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="avatarUrl">头像链接</Label>
                  <Input
                    id="avatarUrl"
                    type="url"
                    value={formData.avatarUrl}
                    onChange={(e) => setFormData({ ...formData, avatarUrl: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category">领域分类</Label>
                  <Input
                    id="category"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* 自定义配置（两种模式都需要） */}
          <Card>
            <CardHeader>
              <CardTitle>监控配置</CardTitle>
              <CardDescription>
                配置标签、优先级和调度策略
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="tags">标签</Label>
                <Textarea
                  id="tags"
                  placeholder="用逗号分隔多个标签，例如: 半导体, 芯片, AI硬件"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  rows={2}
                />
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
              disabled={loading || (manualMode && !formData.name)}
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
      )}
    </div>
  );
}
