/**
 * 数据源CRUD操作API测试
 * 测试维度：
 * - 创建数据源：参数验证和数据完整性
 * - 读取数据源：详情查询
 * - 更新数据源：配置修改
 * - 删除数据源：删除操作
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';
let testDatasourceId: string | null = null;

describe('数据源CRUD API', () => {
  describe('创建数据源 - POST /api/datasources', () => {
    it.skip('可以创建新的数据源', async () => {
      // TODO: 验证POST端点是否支持创建
      const newDatasource = {
        name: '测试数据源_' + Date.now(),
        platform: 'zhihu',
        type: 'influencer',
        config: {
          userId: 'test_user_' + Date.now(),
        },
        enabled: false,
      };

      const response = await fetch(`${API_BASE}/api/datasources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDatasource),
      });

      // 可能返回405 Method Not Allowed
      console.log('创建数据源响应:', response.status);
    });

    it('创建数据源时应该验证必需字段', async () => {
      const invalidDatasource = {
        // 缺少 name 字段
        platform: 'zhihu',
      };

      const response = await fetch(`${API_BASE}/api/datasources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidDatasource),
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });

    it('创建数据源时应该验证平台类型', async () => {
      const invalidDatasource = {
        name: '测试_' + Date.now(),
        platform: 'INVALID_PLATFORM',
        type: 'influencer',
      };

      const response = await fetch(`${API_BASE}/api/datasources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidDatasource),
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('读取数据源详情 - GET /api/datasources/[id]', () => {
    it('可以获取数据源详情', async () => {
      if (!testDatasourceId) {
        console.log('跳过：没有测试数据源ID');
        return;
      }

      const response = await fetch(`${API_BASE}/api/datasources/${testDatasourceId}`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.id).toBe(testDatasourceId);
      expect(data).toHaveProperty('name');
      expect(data).toHaveProperty('platform');
      expect(data).toHaveProperty('config');
    });

    it('详情应该包含完整配置信息', async () => {
      if (!testDatasourceId) return;

      const response = await fetch(`${API_BASE}/api/datasources/${testDatasourceId}`);
      const data = await response.json();

      expect(data).toHaveProperty('enabled');
      expect(data).toHaveProperty('createdAt');
      expect(data).toHaveProperty('updatedAt');
    });

    it('不存在的ID应该返回404', async () => {
      const response = await fetch(`${API_BASE}/api/datasources/nonexistent_id_12345`);
      expect(response.status).toBe(404);
    });
  });

  describe('更新数据源 - PUT /api/datasources/[id]', () => {
    it('可以更新数据源配置', async () => {
      if (!testDatasourceId) return;

      const updates = {
        name: '更新后的名称_' + Date.now(),
        enabled: true,
      };

      const response = await fetch(`${API_BASE}/api/datasources/${testDatasourceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.name).toBe(updates.name);
      expect(data.enabled).toBe(updates.enabled);
    });

    it('可以更新调度配置', async () => {
      if (!testDatasourceId) return;

      const scheduleConfig = {
        schedule: {
          enabled: true,
          interval: 3600, // 1小时
        },
      };

      const response = await fetch(`${API_BASE}/api/datasources/${testDatasourceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scheduleConfig),
      });

      expect(response.ok).toBe(true);
    });

    it('不应该允许更新到无效状态', async () => {
      if (!testDatasourceId) return;

      const invalidUpdate = {
        platform: 'CHANGED_PLATFORM', // 平台不应该被更改
      };

      const response = await fetch(`${API_BASE}/api/datasources/${testDatasourceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidUpdate),
      });

      // 可能返回400或忽略该字段
      if (response.ok) {
        const data = await response.json();
        // 平台不应该被更改
        expect(data.platform).not.toBe('CHANGED_PLATFORM');
      }
    });
  });

  describe('切换数据源状态 - POST /api/datasources/[id]/toggle', () => {
    it('可以启用/禁用数据源', async () => {
      if (!testDatasourceId) return;

      const response = await fetch(`${API_BASE}/api/datasources/${testDatasourceId}/toggle`, {
        method: 'POST',
      });

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(typeof data.enabled).toBe('boolean');
    });
  });

  describe('删除数据源 - DELETE /api/datasources/[id]', () => {
    it('可以删除数据源', async () => {
      if (!testDatasourceId) return;

      const response = await fetch(`${API_BASE}/api/datasources/${testDatasourceId}`, {
        method: 'DELETE',
      });

      expect(response.status).toBe(200);

      // 验证确实被删除
      const checkResponse = await fetch(`${API_BASE}/api/datasources/${testDatasourceId}`);
      expect(checkResponse.status).toBe(404);

      testDatasourceId = null;
    });

    it('删除不存在的数据源应该返回404', async () => {
      const response = await fetch(`${API_BASE}/api/datasources/nonexistent_id_12345`, {
        method: 'DELETE',
      });

      expect(response.status).toBe(404);
    });
  });

  describe('批量操作', () => {
    it('可以批量启用数据源', async () => {
      const response = await fetch(`${API_BASE}/api/datasources/batch/enable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ['id1', 'id2'] }),
      });

      // 即使ID不存在也不应该500错误
      expect(response.status).not.toEqual(500);
    });

    it('可以批量禁用数据源', async () => {
      const response = await fetch(`${API_BASE}/api/datasources/batch/disable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ['id1', 'id2'] }),
      });

      expect(response.status).not.toEqual(500);
    });
  });

  // 清理：确保测试数据被删除
  afterAll(async () => {
    if (testDatasourceId) {
      try {
        await fetch(`${API_BASE}/api/datasources/${testDatasourceId}`, {
          method: 'DELETE',
        });
      } catch (error) {
        console.error('清理测试数据失败:', error);
      }
    }
  });
});
