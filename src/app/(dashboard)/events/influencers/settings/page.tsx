'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Settings,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Save,
  TestTube,
  Trash2,
  Plus,
  RefreshCw
} from 'lucide-react';

interface PlatformConfig {
  id: string;
  platform: string;
  displayName: string;
  configData: {
    cookie_str?: string;
    retry_delay?: number;
    max_retries?: number;
    [key: string]: any;
  };
  isActive: boolean;
  lastUpdatedAt: string;
  expiresAt?: string;
  autoRefresh: boolean;
  createdAt: string;
  updatedAt: string;
}

const PLATFORM_OPTIONS = [
  { value: 'bilibili', label: 'Bilibili（B站）', description: '视频弹幕网站' },
  { value: 'weibo', label: '微博', description: '社交媒体平台' },
  { value: 'douyin', label: '抖音', description: '短视频平台' },
  { value: 'xiaohongshu', label: '小红书', description: '生活方式分享平台' },
];

export default function PlatformConfigPage() {
  const [configs, setConfigs] = useState<PlatformConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 编辑状态
  const [editingPlatform, setEditingPlatform] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    platform: '',
    displayName: '',
    cookieStr: '',
    retryDelay: 2,
    maxRetries: 3,
    autoRefresh: false,
  });

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    try {
      setLoading(true);
      const res = await fetch('http://localhost:8000/api/platform-configs/');
      if (res.ok) {
        const data = await res.json();
        setConfigs(data);
      }
    } catch (error) {
      console.error('Failed to load configs:', error);
      showMessage('error', '加载配置失败');
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleEdit = (config: PlatformConfig) => {
    setEditingPlatform(config.platform);
    setFormData({
      platform: config.platform,
      displayName: config.displayName,
      cookieStr: config.configData.cookie_str || '',
      retryDelay: config.configData.retry_delay || 2,
      maxRetries: config.configData.max_retries || 3,
      autoRefresh: config.autoRefresh,
    });
  };

  const handleCreate = (platform: string) => {
    const platformOption = PLATFORM_OPTIONS.find(p => p.value === platform);
    setEditingPlatform('new');
    setFormData({
      platform: platform,
      displayName: platformOption?.label || platform,
      cookieStr: '',
      retryDelay: 2,
      maxRetries: 3,
      autoRefresh: false,
    });
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      const configData = {
        cookie_str: formData.cookieStr,
        retry_delay: formData.retryDelay,
        max_retries: formData.maxRetries,
      };

      const payload = {
        platform: formData.platform,
        displayName: formData.displayName,
        configData,
        autoRefresh: formData.autoRefresh,
      };

      const existingConfig = configs.find(c => c.platform === formData.platform);
      const url = existingConfig
        ? `http://localhost:8000/api/platform-configs/${formData.platform}`
        : 'http://localhost:8000/api/platform-configs/';

      const method = existingConfig ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        showMessage('success', existingConfig ? '配置已更新' : '配置已创建');
        setEditingPlatform(null);
        loadConfigs();
      } else {
        const error = await res.json();
        showMessage('error', error.detail || '保存失败');
      }
    } catch (error) {
      console.error('Failed to save config:', error);
      showMessage('error', '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (platform: string) => {
    try {
      setTesting(platform);
      const res = await fetch(`http://localhost:8000/api/platform-configs/${platform}/test`, {
        method: 'POST',
      });
      const result = await res.json();

      if (result.success) {
        showMessage('success', `测试成功: ${result.testResult?.userName || '配置有效'}`);
      } else {
        showMessage('error', `测试失败: ${result.error || result.message}`);
      }
    } catch (error) {
      console.error('Failed to test config:', error);
      showMessage('error', '测试失败');
    } finally {
      setTesting(null);
    }
  };

  const handleDelete = async (platform: string) => {
    if (!confirm(`确定要删除 ${platform} 的配置吗？`)) return;

    try {
      const res = await fetch(`http://localhost:8000/api/platform-configs/${platform}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        showMessage('success', '配置已删除');
        loadConfigs();
      } else {
        showMessage('error', '删除失败');
      }
    } catch (error) {
      console.error('Failed to delete config:', error);
      showMessage('error', '删除失败');
    }
  };

  const parseCookieString = (cookieStr: string) => {
    const cookies = cookieStr.split(';').map(c => c.trim());
    const important = ['SESSDATA', 'bili_jct', 'DedeUserID'];
    const found = cookies.filter(c => important.some(key => c.startsWith(key)));
    return found.length > 0 ? `包含 ${found.length} 个关键Cookie` : '未检测到关键Cookie';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">平台配置管理</h1>
          <p className="text-muted-foreground mt-1">
            配置不同平台的认证信息（Cookie等），用于大V数据采集
          </p>
        </div>
      </div>

      {message && (
        <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
          {message.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="configs" className="w-full">
        <TabsList>
          <TabsTrigger value="configs">已配置平台</TabsTrigger>
          <TabsTrigger value="add">添加新平台</TabsTrigger>
        </TabsList>

        <TabsContent value="configs" className="space-y-4">
          {configs.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center text-muted-foreground py-8">
                  <Settings className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>暂无配置，请添加平台配置</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            configs.map((config) => (
              <Card key={config.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CardTitle>{config.displayName}</CardTitle>
                      {config.isActive ? (
                        <Badge variant="default" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          已启用
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1">
                          <XCircle className="h-3 w-3" />
                          已禁用
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTest(config.platform)}
                        disabled={testing === config.platform}
                      >
                        {testing === config.platform ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <TestTube className="h-4 w-4" />
                        )}
                        <span className="ml-1">测试</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(config)}
                      >
                        <Settings className="h-4 w-4" />
                        <span className="ml-1">编辑</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(config.platform)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <CardDescription>
                    平台: {config.platform} •
                    最后更新: {new Date(config.lastUpdatedAt).toLocaleString('zh-CN')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Cookie状态:</span>
                      <span>{parseCookieString(config.configData.cookie_str || '')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">重试配置:</span>
                      <span>
                        延迟 {config.configData.retry_delay || 2}秒 •
                        最多 {config.configData.max_retries || 3}次
                      </span>
                    </div>
                    {config.expiresAt && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">过期时间:</span>
                        <span>{new Date(config.expiresAt).toLocaleString('zh-CN')}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="add" className="space-y-4">
          {editingPlatform ? (
            <Card>
              <CardHeader>
                <CardTitle>
                  {editingPlatform === 'new' ? '添加' : '编辑'}平台配置
                </CardTitle>
                <CardDescription>
                  配置平台的认证信息和采集参数
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="platform">平台</Label>
                  <Input
                    id="platform"
                    value={formData.platform}
                    disabled={editingPlatform !== 'new'}
                    readOnly
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="displayName">显示名称</Label>
                  <Input
                    id="displayName"
                    value={formData.displayName}
                    onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                    placeholder="例如: Bilibili（B站）"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cookieStr">Cookie 字符串</Label>
                  <Textarea
                    id="cookieStr"
                    value={formData.cookieStr}
                    onChange={(e) => setFormData({ ...formData, cookieStr: e.target.value })}
                    placeholder="粘贴完整的Cookie字符串，格式: key1=value1; key2=value2; ..."
                    rows={4}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    从浏览器开发者工具的网络请求中复制完整的 Cookie 字符串
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="retryDelay">重试延迟（秒）</Label>
                    <Input
                      id="retryDelay"
                      type="number"
                      value={formData.retryDelay}
                      onChange={(e) => setFormData({ ...formData, retryDelay: parseInt(e.target.value) })}
                      min={1}
                      max={60}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="maxRetries">最大重试次数</Label>
                    <Input
                      id="maxRetries"
                      type="number"
                      value={formData.maxRetries}
                      onChange={(e) => setFormData({ ...formData, maxRetries: parseInt(e.target.value) })}
                      min={1}
                      max={10}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="autoRefresh">自动刷新</Label>
                    <p className="text-xs text-muted-foreground">
                      启用后将尝试自动刷新过期的Cookie（需要平台支持）
                    </p>
                  </div>
                  <Switch
                    id="autoRefresh"
                    checked={formData.autoRefresh}
                    onCheckedChange={(checked) => setFormData({ ...formData, autoRefresh: checked })}
                  />
                </div>

                <div className="flex gap-2 pt-4">
                  <Button
                    onClick={handleSave}
                    disabled={saving || !formData.cookieStr}
                  >
                    {saving ? (
                      <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    保存配置
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setEditingPlatform(null)}
                  >
                    取消
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {PLATFORM_OPTIONS.map((platform) => {
                const existing = configs.find(c => c.platform === platform.value);
                return (
                  <Card
                    key={platform.value}
                    className="cursor-pointer hover:border-primary transition-colors"
                    onClick={() => existing ? handleEdit(existing) : handleCreate(platform.value)}
                  >
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        {platform.label}
                        {existing ? (
                          <Badge variant="secondary">已配置</Badge>
                        ) : (
                          <Plus className="h-5 w-5 text-muted-foreground" />
                        )}
                      </CardTitle>
                      <CardDescription>{platform.description}</CardDescription>
                    </CardHeader>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
