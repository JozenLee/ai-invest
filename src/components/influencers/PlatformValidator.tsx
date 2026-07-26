'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';

interface ValidatedInfo {
  name: string;
  avatarUrl: string;
  profileUrl: string;
  category: string;
  verified: boolean;
  followersCount: number;
}

interface PlatformValidatorProps {
  onValidated: (platform: string, accountId: string, info: ValidatedInfo | null) => void;
}

export function PlatformValidator({ onValidated }: PlatformValidatorProps) {
  const [platform, setPlatform] = useState('bilibili');
  const [accountId, setAccountId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleValidate = async () => {
    setError('');
    setSuccess(false);
    setLoading(true);

    try {
      const response = await fetch('http://localhost:8000/api/influencers/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, accountId }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.detail?.includes('暂不支持自动获取')) {
          // 平台不支持自动获取，回退到手动模式
          onValidated(platform, accountId, null);
        } else {
          throw new Error(data.detail || '验证失败');
        }
      } else {
        // 验证成功
        setSuccess(true);
        onValidated(platform, accountId, data.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '验证失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="platform">
          平台 <span className="text-red-500">*</span>
        </Label>
        <Select value={platform} onValueChange={(value) => setPlatform(value || 'bilibili')}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="bilibili">B站</SelectItem>
            <SelectItem value="weibo">微博</SelectItem>
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
          placeholder={
            platform === 'bilibili' ? '例如: 123456 (B站UID)' :
            platform === 'weibo' ? '例如: 1234567890 (微博UID)' :
            '输入账号ID'
          }
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          {platform === 'bilibili' && 'B站用户ID，可从空间页URL获取'}
          {platform === 'weibo' && '微博UID，可从个人主页URL获取'}
          {platform === 'xiaohongshu' && '小红书用户ID'}
          {platform === 'zhihu' && '知乎用户ID或URL token'}
          {platform === 'douyin' && '抖音用户ID'}
          {platform === 'alipay' && '支付宝生活号ID'}
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>验证成功！已自动获取账号信息</AlertDescription>
        </Alert>
      )}

      <Button
        onClick={handleValidate}
        disabled={!accountId || loading}
        className="w-full"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            验证中...
          </>
        ) : (
          '验证并获取信息'
        )}
      </Button>
    </div>
  );
}
