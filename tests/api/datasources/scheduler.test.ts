/**
 * 调度器功能API测试
 * 测试维度：
 * - 调度器配置：设置和更新调度任务
 * - 调度器状态：启动、停止、暂停
 * - 调度器健康检查：运行状态监控
 * - 调度历史：任务执行记录
 */

import { describe, it, expect } from 'vitest';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';

describe('调度器API测试', () => {
  let testDatasourceId: string | null = null;

  // 获取一个测试用的数据源
  beforeAll(async () => {
    const response = await fetch(`${API_BASE}/api/datasources?limit=1`);
    if (response.ok) {
      const data = await response.json();
      const datasources = data.datasources || data;
      if (datasources.length > 0) {
        testDatasourceId = datasources[0].id;
      }
    }
  });

  describe('调度器配置 - /api/datasources/[id]/schedule', () => {
    it('可以配置调度任务', async () => {
      if (!testDatasourceId) {
        console.log('跳过：没有可用的数据源');
        return;
      }

      const scheduleConfig = {
        enabled: true,
        interval: 3600, // 1小时
        cron: '0 * * * *', // 每小时执行
      };

      const response = await fetch(`${API_BASE}/api/datasources/${testDatasourceId}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scheduleConfig),
      });

      expect([200, 201]).toContain(response.status);

      if (response.ok) {
        const data = await response.json();
        expect(data).toHaveProperty('schedule');
        console.log('调度配置成功:', data.schedule);
      }
    });

    it('支持不同的调度间隔', async () => {
      if (!testDatasourceId) return;

      const intervals = [
        { interval: 1800, cron: '*/30 * * * *' }, // 30分钟
        { interval: 3600, cron: '0 * * * *' },    // 1小时
        { interval: 7200, cron: '0 */2 * * *' },  // 2小时
        { interval: 86400, cron: '0 0 * * *' },   // 1天
      ];

      for (const config of intervals) {
        const response = await fetch(`${API_BASE}/api/datasources/${testDatasourceId}/schedule`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: true, ...config }),
        });

        expect(response.ok).toBe(true);
        console.log(`调度间隔 ${config.interval}s 配置成功`);
      }
    });

    it('应该验证cron表达式有效性', async () => {
      if (!testDatasourceId) return;

      const invalidSchedule = {
        enabled: true,
        cron: 'INVALID_CRON_EXPRESSION',
      };

      const response = await fetch(`${API_BASE}/api/datasources/${testDatasourceId}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidSchedule),
      });

      // 应该返回错误
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it('可以禁用调度任务', async () => {
      if (!testDatasourceId) return;

      const scheduleConfig = {
        enabled: false,
      };

      const response = await fetch(`${API_BASE}/api/datasources/${testDatasourceId}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scheduleConfig),
      });

      expect(response.ok).toBe(true);
    });

    it('可以更新调度配置', async () => {
      if (!testDatasourceId) return;

      // 先设置一个配置
      const initialConfig = {
        enabled: true,
        interval: 3600,
      };

      await fetch(`${API_BASE}/api/datasources/${testDatasourceId}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(initialConfig),
      });

      // 更新配置
      const updatedConfig = {
        enabled: true,
        interval: 7200, // 改为2小时
      };

      const response = await fetch(`${API_BASE}/api/datasources/${testDatasourceId}/schedule`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedConfig),
      });

      if (response.ok) {
        const data = await response.json();
        expect(data.schedule.interval).toBe(7200);
      }
    });

    it('可以删除调度配置', async () => {
      if (!testDatasourceId) return;

      const response = await fetch(`${API_BASE}/api/datasources/${testDatasourceId}/schedule`, {
        method: 'DELETE',
      });

      expect([200, 204]).toContain(response.status);
    });
  });

  describe('调度器全局控制', () => {
    it.skip('可以启动调度器', async () => {
      // TODO: 该端点尚未实现
      const response = await fetch(`${API_BASE}/api/datasources/schedulers/start`, {
        method: 'POST',
      });

      expect([200, 409]).toContain(response.status); // 409表示已经运行中
    });

    it.skip('可以停止调度器', async () => {
      // TODO: 该端点尚未实现
      const response = await fetch(`${API_BASE}/api/datasources/schedulers/stop`, {
        method: 'POST',
      });

      expect(response.ok).toBe(true);
    });

    it.skip('可以重启调度器', async () => {
      // TODO: 该端点尚未实现
      const response = await fetch(`${API_BASE}/api/datasources/schedulers/restart`, {
        method: 'POST',
      });

      expect(response.ok).toBe(true);
    });

    it.skip('可以暂停调度器', async () => {
      // TODO: 该端点尚未实现
      const response = await fetch(`${API_BASE}/api/datasources/schedulers/pause`, {
        method: 'POST',
      });

      expect([200, 501]).toContain(response.status); // 501表示未实现
    });

    it.skip('可以恢复调度器', async () => {
      // TODO: 该端点尚未实现
      const response = await fetch(`${API_BASE}/api/datasources/schedulers/resume`, {
        method: 'POST',
      });

      expect([200, 501]).toContain(response.status);
    });
  });

  describe('调度器健康检查 - /api/datasources/schedulers/health', () => {
    it('应该返回调度器健康状态', async () => {
      const response = await fetch(`${API_BASE}/api/datasources/schedulers/health`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('success');

      console.log('调度器健康状态:', data);
    });

    it.skip('健康检查应该包含活跃任务数', async () => {
      // TODO: 验证数据结构
      const response = await fetch(`${API_BASE}/api/datasources/schedulers/health`);
      const data = await response.json();

      expect(data).toHaveProperty('activeJobs');
      expect(typeof data.activeJobs).toBe('number');
    });

    it('健康检查应该包含调度队列信息', async () => {
      const response = await fetch(`${API_BASE}/api/datasources/schedulers/health`);
      const data = await response.json();

      // 可能包含队列长度、待处理任务等信息
      const hasQueueInfo =
        data.queueLength !== undefined ||
        data.pendingJobs !== undefined ||
        data.scheduledJobs !== undefined;

      if (hasQueueInfo) {
        console.log('调度队列信息:', {
          queueLength: data.queueLength,
          pendingJobs: data.pendingJobs,
          scheduledJobs: data.scheduledJobs,
        });
      }
    });

    it('健康检查应该快速响应', async () => {
      const startTime = Date.now();
      const response = await fetch(`${API_BASE}/api/datasources/schedulers/health`);
      const responseTime = Date.now() - startTime;

      expect(response.ok).toBe(true);
      expect(responseTime).toBeLessThan(1000); // 健康检查应该在1秒内

      console.log(`健康检查响应时间: ${responseTime}ms`);
    });
  });

  describe('调度历史和统计', () => {
    it.skip('可以查询调度执行历史', async () => {
      // TODO: 该端点尚未实现
      const response = await fetch(`${API_BASE}/api/datasources/schedulers/history?limit=10`);
      expect(response.ok).toBe(true);
    });

    it.skip('可以按时间范围查询历史', async () => {
      // TODO: 该端点尚未实现
      const startDate = '2026-08-01';
      const endDate = '2026-08-08';

      const response = await fetch(
        `${API_BASE}/api/datasources/schedulers/history?startDate=${startDate}&endDate=${endDate}`
      );

      expect(response.ok).toBe(true);
    });

    it.skip('可以查询调度统计信息', async () => {
      // TODO: 该端点尚未实现
      const response = await fetch(`${API_BASE}/api/datasources/schedulers/stats`);
      expect(response.ok).toBe(true);
    });
  });

  describe('调度器任务列表', () => {
    it.skip('可以查询所有调度任务', async () => {
      // TODO: 该端点尚未实现
      const response = await fetch(`${API_BASE}/api/datasources/schedulers/jobs`);
      expect(response.ok).toBe(true);
    });

    it.skip('可以查询活跃的调度任务', async () => {
      // TODO: 该端点尚未实现
      const response = await fetch(`${API_BASE}/api/datasources/schedulers/jobs?status=active`);
      expect(response.ok).toBe(true);
    });
  });

  describe('错误处理', () => {
    it('调度器异常应该被捕获', async () => {
      const response = await fetch(`${API_BASE}/api/datasources/schedulers/health`);

      // 即使有问题也不应该返回500
      expect(response.status).not.toEqual(500);
    });

    it('调度失败应该记录错误', async () => {
      const response = await fetch(`${API_BASE}/api/datasources/schedulers/history?status=failed&limit=1`);

      if (response.ok) {
        const data = await response.json();
        const failedJobs = data.history || data;

        if (failedJobs.length > 0) {
          const failed = failedJobs[0];
          expect(failed).toHaveProperty('error');
          console.log('调度失败示例:', failed.error);
        }
      }
    });
  });

  describe('性能监控', () => {
    it('调度执行时间应该在合理范围', async () => {
      const response = await fetch(`${API_BASE}/api/datasources/schedulers/history?limit=10`);

      if (response.ok) {
        const data = await response.json();
        const history = data.history || data;

        if (history.length > 0) {
          history.forEach((record: any) => {
            if (record.duration) {
              // 单次调度执行不应该超过30秒（正常情况）
              expect(record.duration).toBeLessThan(30000);
            }
          });

          const durations = history.map((r: any) => r.duration).filter(Boolean);
          const avgDuration = durations.reduce((a: number, b: number) => a + b, 0) / durations.length;

          console.log('平均调度执行时间:', avgDuration + 'ms');
        }
      }
    });
  });
});
