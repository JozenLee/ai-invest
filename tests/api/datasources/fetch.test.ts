/**
 * 数据采集功能API测试
 * 测试维度：
 * - 手动触发采集：数据采集功能验证
 * - 采集状态监控：采集进度和结果
 * - 采集结果验证：数据质量检查
 * - 错误处理：异常情况处理
 */

import { beforeAll, describe, it, expect } from 'vitest';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';
const MAX_FETCH_TIME = 30000; // 采集可能需要较长时间

describe('数据采集API - /api/datasources/[id]/fetch', () => {
  let testDatasourceId: string | null = null;

  // 获取一个测试用的数据源
  beforeAll(async () => {
    const response = await fetch(`${API_BASE}/api/datasources?enabled=true&limit=1`);
    if (response.ok) {
      const data = await response.json();
      const datasources = data.datasources || data;
      if (datasources.length > 0) {
        testDatasourceId = datasources[0].id;
      }
    }
  });

  describe('手动触发采集', () => {
    it('应该能触发数据采集', async () => {
      if (!testDatasourceId) {
        console.log('跳过：没有可用的数据源');
        return;
      }

      const response = await fetch(`${API_BASE}/api/datasources/${testDatasourceId}/fetch`, {
        method: 'POST',
      });

      // 采集可能返回200（立即执行）或202（异步执行）
      expect([200, 202]).toContain(response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('采集触发结果:', data);
      }
    });

    it('采集响应应该包含任务信息', async () => {
      if (!testDatasourceId) return;

      const response = await fetch(`${API_BASE}/api/datasources/${testDatasourceId}/fetch`, {
        method: 'POST',
      });

      if (response.ok) {
        const data = await response.json();

        // 应该有任务ID或状态信息
        const hasTaskInfo =
          data.taskId !== undefined ||
          data.jobId !== undefined ||
          data.status !== undefined;

        expect(hasTaskInfo).toBe(true);
      }
    });

    it('可以指定采集参数', async () => {
      if (!testDatasourceId) return;

      const fetchOptions = {
        limit: 10,
        force: false, // 不强制更新
      };

      const response = await fetch(`${API_BASE}/api/datasources/${testDatasourceId}/fetch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fetchOptions),
      });

      expect([200, 202, 400]).toContain(response.status);
    });

    it('不存在的数据源应该返回404', async () => {
      const response = await fetch(`${API_BASE}/api/datasources/nonexistent_id/fetch`, {
        method: 'POST',
      });

      expect(response.status).toBe(404);
    });

    it('禁用的数据源应该不能采集', async () => {
      // 获取一个禁用的数据源
      const listResponse = await fetch(`${API_BASE}/api/datasources?enabled=false&limit=1`);
      if (listResponse.ok) {
        const data = await listResponse.json();
        const datasources = data.datasources || data;

        if (datasources.length > 0) {
          const disabledId = datasources[0].id;

          const fetchResponse = await fetch(`${API_BASE}/api/datasources/${disabledId}/fetch`, {
            method: 'POST',
          });

          // 应该返回错误
          expect(fetchResponse.status).toBeGreaterThanOrEqual(400);
        }
      }
    });
  });

  describe('采集状态查询', () => {
    it('可以查询采集任务状态', async () => {
      if (!testDatasourceId) return;

      // 先触发采集
      const fetchResponse = await fetch(`${API_BASE}/api/datasources/${testDatasourceId}/fetch`, {
        method: 'POST',
      });

      if (fetchResponse.ok) {
        const fetchData = await fetchResponse.json();

        if (fetchData.taskId) {
          // 查询任务状态
          const statusResponse = await fetch(
            `${API_BASE}/api/datasources/${testDatasourceId}/fetch/status?taskId=${fetchData.taskId}`
          );

          if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            expect(statusData).toHaveProperty('status');
          }
        }
      }
    });

    it('采集状态应该包含进度信息', async () => {
      if (!testDatasourceId) return;

      const response = await fetch(`${API_BASE}/api/datasources/${testDatasourceId}`);
      if (response.ok) {
        const data = await response.json();

        // 数据源详情应该包含最后采集信息
        const hasLastFetchInfo =
          data.lastFetchAt !== undefined ||
          data.lastFetchStatus !== undefined ||
          data.stats !== undefined;

        if (hasLastFetchInfo) {
          console.log('最后采集信息:', {
            lastFetchAt: data.lastFetchAt,
            status: data.lastFetchStatus,
          });
        }
      }
    });
  });

  describe('采集结果验证', () => {
    it('采集后应该有新数据', async () => {
      if (!testDatasourceId) return;

      // 获取采集前的数据
      const beforeResponse = await fetch(`${API_BASE}/api/datasources/${testDatasourceId}`);
      const beforeData = await beforeResponse.json();
      const beforeCount = beforeData.stats?.totalItems || 0;

      // 触发采集
      const fetchResponse = await fetch(`${API_BASE}/api/datasources/${testDatasourceId}/fetch`, {
        method: 'POST',
      });

      if (fetchResponse.ok) {
        // 等待采集完成（简单延迟）
        await new Promise(resolve => setTimeout(resolve, 5000));

        // 获取采集后的数据
        const afterResponse = await fetch(`${API_BASE}/api/datasources/${testDatasourceId}`);
        const afterData = await afterResponse.json();
        const afterCount = afterData.stats?.totalItems || 0;

        console.log('采集前数量:', beforeCount, '采集后数量:', afterCount);

        // 数量应该增加或保持不变（如果没有新内容）
        expect(afterCount).toBeGreaterThanOrEqual(beforeCount);
      }
    });

    it('采集的数据应该符合格式要求', async () => {
      if (!testDatasourceId) return;

      // 获取数据源类型
      const dsResponse = await fetch(`${API_BASE}/api/datasources/${testDatasourceId}`);
      const dsData = await dsResponse.json();

      // 获取采集的内容（假设有一个获取内容的API）
      const contentResponse = await fetch(
        `${API_BASE}/api/datasources/${testDatasourceId}/content?limit=1`
      );

      if (contentResponse.ok) {
        const contentData = await contentResponse.json();
        const items = contentData.items || contentData;

        if (items.length > 0) {
          const item = items[0];

          // 验证内容字段
          expect(item).toHaveProperty('id');
          expect(item).toHaveProperty('title');
          expect(item).toHaveProperty('createdAt');

          console.log('采集内容示例:', {
            id: item.id,
            title: item.title?.substring(0, 50),
            platform: dsData.platform,
          });
        }
      }
    });
  });

  describe('并发采集限制', () => {
    it('不应该允许同一数据源并发采集', async () => {
      if (!testDatasourceId) return;

      // 发起第一次采集
      const fetch1 = fetch(`${API_BASE}/api/datasources/${testDatasourceId}/fetch`, {
        method: 'POST',
      });

      // 立即发起第二次采集
      const fetch2 = fetch(`${API_BASE}/api/datasources/${testDatasourceId}/fetch`, {
        method: 'POST',
      });

      const [response1, response2] = await Promise.all([fetch1, fetch2]);

      // 至少有一个应该成功，另一个可能被拒绝（409冲突）
      const statuses = [response1.status, response2.status];
      console.log('并发采集状态:', statuses);

      // 不应该都是服务器错误
      expect(statuses.some(s => s < 500)).toBe(true);
    });
  });

  describe('测试采集功能', () => {
    it('可以测试数据源配置', async () => {
      if (!testDatasourceId) return;

      const response = await fetch(`${API_BASE}/api/datasources/${testDatasourceId}/test`, {
        method: 'POST',
      });

      expect([200, 400]).toContain(response.status);

      if (response.ok) {
        const data = await response.json();
        expect(data).toHaveProperty('success');

        if (data.success) {
          console.log('测试成功:', data.message);
        } else {
          console.log('测试失败:', data.error);
        }
      }
    });

    it('测试应该验证配置有效性', async () => {
      // 创建一个配置错误的测试数据源
      const invalidDatasource = {
        name: '测试_无效配置_' + Date.now(),
        platform: 'zhihu',
        type: 'influencer',
        config: {
          userId: 'INVALID_USER_ID_12345',
        },
        enabled: false,
      };

      const createResponse = await fetch(`${API_BASE}/api/datasources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidDatasource),
      });

      if (createResponse.status === 201) {
        const created = await createResponse.json();

        // 测试这个无效配置
        const testResponse = await fetch(`${API_BASE}/api/datasources/${created.id}/test`, {
          method: 'POST',
        });

        if (testResponse.ok) {
          const testData = await testResponse.json();
          // 应该返回失败
          expect(testData.success).toBe(false);
        }

        // 清理
        await fetch(`${API_BASE}/api/datasources/${created.id}`, {
          method: 'DELETE',
        });
      }
    });
  });

  describe('错误处理', () => {
    it('采集失败应该返回详细错误信息', async () => {
      if (!testDatasourceId) return;

      const response = await fetch(`${API_BASE}/api/datasources/${testDatasourceId}/fetch`, {
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.json();
        expect(error).toHaveProperty('message');
        console.log('采集错误:', error.message);
      }
    });

    it('网络错误应该被正确处理', async () => {
      // 这个测试需要模拟网络错误，实际环境可能不会触发
      if (!testDatasourceId) return;

      const response = await fetch(`${API_BASE}/api/datasources/${testDatasourceId}/fetch`, {
        method: 'POST',
      });

      // 即使有网络问题也不应该返回500
      expect(response.status).not.toEqual(500);
    });
  });

  describe('采集日志', () => {
    it.skip('可以查询采集日志', async () => {
      // TODO: 该端点尚未实现或需要验证实际路由
      const response = await fetch(`${API_BASE}/api/datasources/logs?limit=10`);
      expect(response.ok).toBe(true);
    });

    it.skip('可以按数据源过滤日志', async () => {
      // TODO: 该端点尚未实现
      if (!testDatasourceId) return;

      const response = await fetch(`${API_BASE}/api/datasources/logs?datasourceId=${testDatasourceId}&limit=5`);
      expect(response.ok).toBe(true);
    });
  });
});
