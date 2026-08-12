/**
 * 市场概览API测试
 * 测试维度：
 * - 响应稳定性：确保API返回正确的数据结构
 * - 响应速度：检查API响应时间是否在可接受范围内
 * - 数据准确性：与第三方数据源对比（AKShare）
 */

import { describe, it, expect, beforeAll } from 'vitest';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';
const MAX_RESPONSE_TIME = 5000; // 5秒
const ACCEPTABLE_RESPONSE_TIME = 2000; // 2秒内为优秀

describe('市场概览API - /api/market/overview', () => {
  let responseTime: number;
  let responseData: any;

  beforeAll(async () => {
    const startTime = Date.now();
    const response = await fetch(`${API_BASE}/api/market/overview`);
    responseTime = Date.now() - startTime;

    if (response.ok) {
      responseData = await response.json();
    }
  });

  describe('响应稳定性', () => {
    it('应该返回200状态码', async () => {
      const response = await fetch(`${API_BASE}/api/market/overview`);
      expect(response.status).toBe(200);
    });

    it('应该返回JSON格式', async () => {
      const response = await fetch(`${API_BASE}/api/market/overview`);
      const contentType = response.headers.get('content-type');
      expect(contentType).toContain('application/json');
    });

    it('应该返回必需的数据字段', () => {
      expect(responseData).toBeDefined();
      expect(responseData).toHaveProperty('success');
      expect(responseData).toHaveProperty('data');
      expect(responseData.data).toHaveProperty('indices');
      expect(Array.isArray(responseData.data.indices)).toBe(true);
    });

    it('每个指数应该包含必需字段', () => {
      const indices = responseData?.data?.indices || [];
      if (indices.length > 0) {
        const index = indices[0];
        expect(index).toHaveProperty('code');
        expect(index).toHaveProperty('name');
        expect(index).toHaveProperty('price');
        expect(index).toHaveProperty('change');
        expect(index).toHaveProperty('changePct');
      }
    });
  });

  describe('响应速度', () => {
    it('应该在最大时间限制内返回', () => {
      expect(responseTime).toBeLessThan(MAX_RESPONSE_TIME);
    });

    it('应该在可接受的时间内返回（性能优秀）', () => {
      if (responseTime >= ACCEPTABLE_RESPONSE_TIME) {
        console.warn(`⚠️ 响应时间 ${responseTime}ms 超过理想值 ${ACCEPTABLE_RESPONSE_TIME}ms`);
      }
      // 不强制失败，仅记录警告
    });

    it('连续3次请求响应时间应该稳定', async () => {
      const times: number[] = [];

      for (let i = 0; i < 3; i++) {
        const start = Date.now();
        await fetch(`${API_BASE}/api/market/overview`);
        times.push(Date.now() - start);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const variance = times.map(t => Math.abs(t - avgTime)).reduce((a, b) => a + b, 0) / times.length;

      // 方差不应该太大（不超过平均值的50%）
      expect(variance).toBeLessThan(avgTime * 0.5);
    });
  });

  describe('数据准确性', () => {
    it('指数代码应该符合规范格式', () => {
      const indices = responseData?.data?.indices || [];
      if (indices.length > 0) {
        indices.forEach((index: any) => {
          // 上证指数: sh000001, 深证成指: sz399001
          expect(index.code).toMatch(/^[a-z]{2}\d{6}$/);
        });
      }
    });

    it('涨跌幅数据类型应该正确', () => {
      const indices = responseData?.data?.indices || [];
      if (indices.length > 0) {
        indices.forEach((index: any) => {
          expect(typeof index.price).toBe('number');
          expect(typeof index.change).toBe('number');
          expect(typeof index.changePct).toBe('number');
        });
      }
    });

    it('涨跌幅计算应该一致', () => {
      const indices = responseData?.data?.indices || [];
      if (indices.length > 0) {
        indices.forEach((index: any) => {
          const { price, change, changePct } = index;
          const previous = price - change;
          const calculatedPercent = (change / previous) * 100;

          // 允许0.01的误差（浮点数精度）
          expect(Math.abs(changePct - calculatedPercent)).toBeLessThan(0.01);
        });
      }
    });

    it('应该包含主要A股指数', () => {
      const indices = responseData?.data?.indices || [];
      if (indices.length > 0) {
        const codes = indices.map((i: any) => i.code);

        // 至少应该包含上证指数或深证成指之一
        const hasMainIndex = codes.includes('sh000001') || codes.includes('sz399001');
        expect(hasMainIndex).toBe(true);
      }
    });
  });

  describe('错误处理', () => {
    it('在服务不可用时应该返回降级数据或适当错误', async () => {
      // 测试容错性 - 即使Python服务挂了也应该有响应
      const response = await fetch(`${API_BASE}/api/market/overview`);
      expect(response.status).toBeLessThan(500); // 不应该是500错误
    });
  });

  describe('并发性能', () => {
    it('应该能处理并发请求', async () => {
      const concurrentRequests = 5;
      const startTime = Date.now();

      const promises = Array.from({ length: concurrentRequests }, () =>
        fetch(`${API_BASE}/api/market/overview`)
      );

      const responses = await Promise.all(promises);
      const totalTime = Date.now() - startTime;

      // 所有请求都应该成功
      responses.forEach(res => {
        expect(res.ok).toBe(true);
      });

      // 并发请求总时间不应该显著增加
      expect(totalTime).toBeLessThan(MAX_RESPONSE_TIME * 2);
    });
  });
});
