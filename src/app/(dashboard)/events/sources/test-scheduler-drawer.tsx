'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SchedulerDrawer } from '@/components/events/SchedulerDrawer';

/**
 * 测试页面 - 验证 SchedulerDrawer 组件
 *
 * 使用方式：
 * 1. 在浏览器访问 /events/sources
 * 2. 点击任意数据源的"设置"按钮
 * 3. 验证抽屉打开、表单显示、配置保存功能
 */
export default function TestSchedulerDrawer() {
  const [open, setOpen] = useState(false);

  // 模拟数据源数据
  const mockDataSource = {
    id: 'test-source-id',
    name: '测试数据源',
    updateFrequency: 60,
    scheduler: {
      id: 'test-scheduler-id',
      scheduleType: 'interval',
      scheduleTypeLabel: '定时轮询',
      scheduleConfig: {
        intervalMinutes: 60,
      },
      isEnabled: true,
      lastRunAt: new Date(Date.now() - 3600000).toISOString(),
      nextRunAt: new Date(Date.now() + 1800000).toISOString(),
    },
  };

  return (
    <div className="container py-8">
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">SchedulerDrawer 组件测试</h1>

        <div className="space-y-2">
          <h2 className="text-lg font-semibold">测试步骤：</h2>
          <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
            <li>点击"打开调度器设置"按钮</li>
            <li>验证抽屉从右侧滑入</li>
            <li>验证基本信息显示正确</li>
            <li>验证调度配置表单可编辑</li>
            <li>修改更新频率，点击"保存配置"</li>
            <li>验证API调用（查看Network）</li>
            <li>验证运行历史列表显示</li>
          </ol>
        </div>

        <Button onClick={() => setOpen(true)}>
          打开调度器设置
        </Button>

        <SchedulerDrawer
          open={open}
          onOpenChange={setOpen}
          dataSource={mockDataSource}
          onUpdate={() => {
            console.log('配置已更新');
          }}
        />
      </div>
    </div>
  );
}
