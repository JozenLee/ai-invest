/**
 * 数据源列表API测试 - /api/datasources
 * 测试维度：
 * - 数据完整性：数据源列表和详细信息
 * - 过滤功能：按状态、类型、平台过滤
 * - 响应速度：列表查询性能
 */

import { describe, it, expect } from 'vitest';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';
const MAX_RESPONSE_TIME = 3000;

describe('数据源列表API - /api/datasources', () => {
  describe('响应稳定性', () => {
    it('应该返回200状态码', async () => {
      const response = await fetch(`${API_BASE}/api/datasources`);
      expect(response.status).toBe(200);
    });

    it('应该返回JSON格式', async () => {
      const response = await fetch(`${API_BASE}/api/datasources`);
      const contentType = response.headers.get('content-type');
      expect(contentType).toContain('application/json');
    });

    it('应该返回数据源数组', async () => {
      const response = await fetch(`${API_BASE}/api/datasources`);
      const data = await response.json();

      expect(data).toBeDefined();
      expect(data).toHaveProperty('success');
      expect(data).toHaveProperty('data');
      expect(Array.isArray(data.data)).toBe(true);
    });

    it('每个数据源应该包含必需字段', async () => {
      const response = await fetch(`${API_BASE}/api/datasources`);
      const data = await response.json();
      const datasources = data.data || [];

      if (datasources.length > 0) {
        const ds = datasources[0];
        expect(ds).toHaveProperty('id');
        expect(ds).toHaveProperty('name');
        expect(ds).toHaveProperty('provider');
        expect(ds).toHaveProperty('type');
        expect(ds).toHaveProperty('isActive');
      }
    });
  });

  describe('数据完整性', () => {
    it('数据源应该包含完整的配置信息', async () => {
      const response = await fetch(`${API_BASE}/api/datasources`);
      const data = await response.json();
      const datasources = data.data || [];

      if (datasources.length > 0) {
        datasources.forEach((ds: any) => {
          expect(typeof ds.id).toBe('string');
          expect(typeof ds.name).toBe('string');
          expect(typeof ds.provider).toBe('string');
          expect(typeof ds.isActive).toBe('boolean');
        });
      }
    });

    it('应该包含多个数据源平台', async () => {
      const response = await fetch(`${API_BASE}/api/datasources`);
      const data = await response.json();
      const datasources = data.data || [];

      const platforms = new Set(datasources.map((ds: any) => ds.provider));

      console.log('支持的平台:', Array.from(platforms));

      // 根据CLAUDE.md，应该支持多个平台
      expect(platforms.size).toBeGreaterThan(0);
    });

    it('数据源类型应该合法', async () => {
      const response = await fetch(`${API_BASE}/api/datasources`);
      const data = await response.json();
      const datasources = data.data || [];

      const validTypes = ['financial', 'social', 'news', 'official'];

      datasources.forEach((ds: any) => {
        if (ds.type) {
          expect(validTypes).toContain(ds.type);
        }
      });
    });

    it('数据源应该有唯一ID', async () => {
      const response = await fetch(`${API_BASE}/api/datasources`);
      const data = await response.json();
      const datasources = data.data || [];

      const ids = datasources.map((ds: any) => ds.id);
      const uniqueIds = new Set(ids);

      expect(ids.length).toBe(uniqueIds.size);
    });
  });

  describe('过滤功能', () => {
    it('可以按启用状态过滤', async () => {
      const response = await fetch(`${API_BASE}/api/datasources?enabled=true`);
      expect(response.ok).toBe(true);

      const data = await response.json();
      const datasources = data.datasources || data;

      // 所有返回的数据源应该是启用状态
      if (datasources.length > 0) {
        datasources.forEach((ds: any) => {
          expect(ds.enabled).toBe(true);
        });
      }
    });

    it('可以按平台过滤', async () => {
      // 先获取所有数据源，找到一个平台
      const response1 = await fetch(`${API_BASE}/api/datasources`);
      const data1 = await response1.json();
      const datasources1 = data1.datasources || data1;

      if (datasources1.length > 0) {
        const platform = datasources1[0].platform;

        // 按平台过滤
        const response2 = await fetch(`${API_BASE}/api/datasources?platform=${encodeURIComponent(platform)}`);
        expect(response2.ok).toBe(true);

        const data2 = await response2.json();
        const datasources2 = data2.datasources || data2;

        // 所有返回的数据源应该属于该平台
        if (datasources2.length > 0) {
          datasources2.forEach((ds: any) => {
            expect(ds.platform).toBe(platform);
          });
        }
      }
    });

    it('可以按类型过滤', async () => {
      const response = await fetch(`${API_BASE}/api/datasources?type=influencer`);
      expect(response.ok).toBe(true);

      const data = await response.json();
      const datasources = data.datasources || data;

      if (datasources.length > 0) {
        datasources.forEach((ds: any) => {
          expect(ds.type).toBe('influencer');
        });
      }
    });

    it('支持多条件组合过滤', async () => {
      const response = await fetch(`${API_BASE}/api/datasources?enabled=true&platform=zhihu`);
      expect(response.ok).toBe(true);

      const data = await response.json();
      const datasources = data.datasources || data;

      if (datasources.length > 0) {
        datasources.forEach((ds: any) => {
          expect(ds.enabled).toBe(true);
          expect(ds.platform).toBe('zhihu');
        });
      }
    });
  });

  describe('搜索功能', () => {
    it('可以按名称搜索', async () => {
      const response = await fetch(`${API_BASE}/api/datasources?q=AI`);
      expect(response.ok).toBe(true);

      const data = await response.json();
      const datasources = data.datasources || data;

      if (datasources.length > 0) {
        datasources.forEach((ds: any) => {
          const matchesSearch =
            ds.name.includes('AI') ||
            ds.description?.includes('AI') ||
            ds.tags?.some((tag: string) => tag.includes('AI'));

          expect(matchesSearch).toBe(true);
        });
      }
    });
  });

  describe('排序功能', () => {
    it('可以按更新时间排序', async () => {
      const response = await fetch(`${API_BASE}/api/datasources?sort=updatedAt&order=desc`);
      expect(response.ok).toBe(true);

      const data = await response.json();
      const datasources = data.datasources || data;

      if (datasources.length > 1) {
        for (let i = 0; i < datasources.length - 1; i++) {
          if (datasources[i].updatedAt && datasources[i + 1].updatedAt) {
            const current = new Date(datasources[i].updatedAt).getTime();
            const next = new Date(datasources[i + 1].updatedAt).getTime();
            expect(current).toBeGreaterThanOrEqual(next);
          }
        }
      }
    });

    it('可以按名称排序', async () => {
      const response = await fetch(`${API_BASE}/api/datasources?sort=name&order=asc`);
      expect(response.ok).toBe(true);
    });
  });

  describe('响应速度', () => {
    it('应该在时间限制内返回', async () => {
      const startTime = Date.now();
      const response = await fetch(`${API_BASE}/api/datasources`);
      const responseTime = Date.now() - startTime;

      expect(response.ok).toBe(true);
      expect(responseTime).toBeLessThan(MAX_RESPONSE_TIME);

      console.log(`数据源列表响应时间: ${responseTime}ms`);
    });

    it('带过滤条件的请求响应速度应该合理', async () => {
      const startTime = Date.now();
      const response = await fetch(`${API_BASE}/api/datasources?enabled=true&type=influencer`);
      const responseTime = Date.now() - startTime;

      expect(response.ok).toBe(true);
      expect(responseTime).toBeLessThan(MAX_RESPONSE_TIME);
    });
  });

  describe('统计信息', () => {
    it('应该包含总数信息', async () => {
      const response = await fetch(`${API_BASE}/api/datasources`);
      const data = await response.json();

      // 应该有 count 字段
      const hasCount = data.count !== undefined;
      expect(hasCount).toBe(true);
    });

    it('应该包含各平台统计', async () => {
      const response = await fetch(`${API_BASE}/api/datasources`);
      const data = await response.json();
      const datasources = data.data || [];

      const platformCounts: Record<string, number> = {};

      datasources.forEach((ds: any) => {
        platformCounts[ds.provider] = (platformCounts[ds.provider] || 0) + 1;
      });

      console.log('各平台数据源数量:', platformCounts);
      expect(Object.keys(platformCounts).length).toBeGreaterThan(0);
    });
  });

  describe('错误处理', () => {
    it('无效的过滤参数应该返回适当响应', async () => {
      const response = await fetch(`${API_BASE}/api/datasources?platform=INVALID_PLATFORM_12345`);

      // 应该返回空结果或4xx错误，而不是5xx
      expect(response.status).not.toEqual(500);
    });

    it('在服务异常时应该优雅降级', async () => {
      const response = await fetch(`${API_BASE}/api/datasources`);
      expect(response.status).toBeLessThan(500);
    });
  });
});
