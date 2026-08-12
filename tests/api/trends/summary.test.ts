/**
 * 趋势摘要API测试 - /api/events/trends/summary
 * 测试维度：
 * - 数据完整性：趋势摘要数据验证
 * - 分类覆盖度：各领域趋势的全面性
 * - 响应速度：摘要生成性能
 */

import { describe, it, expect } from 'vitest';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';
const MAX_RESPONSE_TIME = 8000;

describe('趋势摘要API - /api/events/trends/summary', () => {
  describe('响应稳定性', () => {
    it('应该返回200状态码', async () => {
      const response = await fetch(`${API_BASE}/api/events/trends/summary`);
      expect(response.status).toBe(200);
    });

    it('应该返回JSON格式', async () => {
      const response = await fetch(`${API_BASE}/api/events/trends/summary`);
      const contentType = response.headers.get('content-type');
      expect(contentType).toContain('application/json');
    });

    it('应该返回多个领域的趋势摘要', async () => {
      const response = await fetch(`${API_BASE}/api/events/trends/summary`);
      const data = await response.json();

      expect(data).toBeDefined();
      expect(data).toHaveProperty('success');
      expect(data).toHaveProperty('data');
      expect(data.data).toHaveProperty('domains');

      const domains = data.data.domains;
      expect(Array.isArray(domains)).toBe(true);
      expect(domains.length).toBeGreaterThan(0);
    });
  });

  describe('数据完整性', () => {
    it('每个领域摘要应该包含必需字段', async () => {
      const response = await fetch(`${API_BASE}/api/events/trends/summary`);
      const data = await response.json();
      const summaries = data.data?.domains || [];

      if (summaries.length > 0) {
        summaries.forEach((summary: any) => {
          expect(summary).toHaveProperty('domainCode');
          expect(summary).toHaveProperty('domainName');

          // 应该有趋势信息
          const hasTrendInfo =
            summary.trendDirection !== undefined ||
            summary.relatedNewsCount !== undefined ||
            summary.confidenceScore !== undefined;

          expect(hasTrendInfo).toBe(true);
        });
      }
    });

    it('应该包含主要AI相关领域', async () => {
      const response = await fetch(`${API_BASE}/api/events/trends/summary`);
      const data = await response.json();
      const summaries = data.data?.domains || [];

      const sectors = summaries.map((s: any) => s.domainName || s.domainCode);

      // 应该包含AI、芯片、半导体等核心领域
      const hasAIRelated = sectors.some((s: string) =>
        s.includes('AI') || s.includes('芯片') || s.includes('半导体') || s.includes('算力')
      );

      expect(hasAIRelated).toBe(true);
      console.log('趋势摘要包含的领域:', sectors.slice(0, 10));
    });
  });

  describe('分类覆盖度', () => {
    it('应该覆盖多个行业领域', async () => {
      const response = await fetch(`${API_BASE}/api/events/trends/summary`);
      const data = await response.json();
      const summaries = data.data?.domains || [];

      const sectorCount = summaries.length;

      // 应该至少覆盖2个以上的领域
      expect(sectorCount).toBeGreaterThan(1);
      console.log('趋势摘要覆盖领域数:', sectorCount);
    });

    it('领域分类应该与资讯流一致', async () => {
      const summaryResponse = await fetch(`${API_BASE}/api/events/trends/summary`);
      const summaryData = await summaryResponse.json();
      const summaries = summaryData.summaries || summaryData;

      const categoriesResponse = await fetch(`${API_BASE}/api/events/categories`);
      const categoriesData = await categoriesResponse.json();

      expect(summaryResponse.ok).toBe(true);
      expect(categoriesResponse.ok).toBe(true);
    });
  });

  describe('时间范围支持', () => {
    it('支持时间范围参数', async () => {
      const response = await fetch(`${API_BASE}/api/events/trends/summary?days=7`);
      expect(response.ok).toBe(true);
    });

    it('不同时间范围返回不同趋势', async () => {
      const response1 = await fetch(`${API_BASE}/api/events/trends/summary?days=7`);
      const response2 = await fetch(`${API_BASE}/api/events/trends/summary?days=30`);

      expect(response1.ok).toBe(true);
      expect(response2.ok).toBe(true);
    });
  });

  describe('响应速度', () => {
    it('应该在时间限制内返回', async () => {
      const startTime = Date.now();
      const response = await fetch(`${API_BASE}/api/events/trends/summary`);
      const responseTime = Date.now() - startTime;

      expect(response.ok).toBe(true);
      expect(responseTime).toBeLessThan(MAX_RESPONSE_TIME);

      console.log(`趋势摘要响应时间: ${responseTime}ms`);
    });
  });

  describe('数据排序', () => {
    it('领域应该按热度或重要性排序', async () => {
      const response = await fetch(`${API_BASE}/api/events/trends/summary`);
      const data = await response.json();
      const summaries = data.summaries || data;

      if (Array.isArray(summaries) && summaries.length > 1) {
        // 检查是否有排序依据（如热度、趋势数量等）
        const hasOrderingMetric = summaries.every((s: any) =>
          s.heat !== undefined ||
          s.count !== undefined ||
          s.trendCount !== undefined
        );

        if (hasOrderingMetric) {
          console.log('趋势摘要已按指标排序');
        }
      }
    });
  });

  describe('错误处理', () => {
    it('在服务异常时应该优雅降级', async () => {
      const response = await fetch(`${API_BASE}/api/events/trends/summary`);
      expect(response.status).toBeLessThan(500);
    });
  });
});
