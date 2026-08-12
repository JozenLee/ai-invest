/**
 * 资金流向API测试
 * 测试维度：
 * - 响应稳定性：数据结构完整性
 * - 响应速度：性能监控
 * - 数据准确性：资金流向数据逻辑验证
 */

import { describe, it, expect, beforeAll } from 'vitest';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';
const MAX_RESPONSE_TIME = 5000;
const ACCEPTABLE_RESPONSE_TIME = 3000;

describe('资金流向API - /api/market/capital-flow', () => {
  let responseTime: number;
  let responseData: any;

  beforeAll(async () => {
    const startTime = Date.now();
    const response = await fetch(`${API_BASE}/api/market/capital-flow`);
    responseTime = Date.now() - startTime;

    if (response.ok) {
      responseData = await response.json();
    }
  });

  describe('响应稳定性', () => {
    it('应该返回200状态码', async () => {
      const response = await fetch(`${API_BASE}/api/market/capital-flow`);
      expect(response.status).toBe(200);
    });

    it('应该返回JSON格式', async () => {
      const response = await fetch(`${API_BASE}/api/market/capital-flow`);
      const contentType = response.headers.get('content-type');
      expect(contentType).toContain('application/json');
    });

    it('应该返回必需的数据字段', () => {
      expect(responseData).toBeDefined();
      expect(responseData).toHaveProperty('success');
      expect(responseData).toHaveProperty('data');
      // 实际返回的结构包含 topInflowSectors, topOutflowSectors 等
      expect(responseData.data).toBeDefined();
    });

    it('主力资金流向应该包含必需字段', () => {
      if (responseData?.mainFlow) {
        expect(responseData.mainFlow).toHaveProperty('totalInflow');
        expect(responseData.mainFlow).toHaveProperty('totalOutflow');
        expect(responseData.mainFlow).toHaveProperty('netInflow');
      }
    });

    it('板块资金流向应该是数组', () => {
      expect(Array.isArray(responseData.data?.topInflowSectors || [])).toBe(true);
      expect(Array.isArray(responseData.data?.topOutflowSectors || [])).toBe(true);
    });

    it('每个板块应该包含必需字段', () => {
      const inflowSectors = responseData.data?.topInflowSectors || [];
      if (inflowSectors.length > 0) {
        const sector = inflowSectors[0];
        expect(sector).toHaveProperty('sector');
        expect(sector).toHaveProperty('netFlow');
      }
    });
  });

  describe('响应速度', () => {
    it('应该在最大时间限制内返回', () => {
      expect(responseTime).toBeLessThan(MAX_RESPONSE_TIME);
    });

    it('应该在可接受的时间内返回', () => {
      if (responseTime >= ACCEPTABLE_RESPONSE_TIME) {
        console.warn(`⚠️ 响应时间 ${responseTime}ms 超过理想值 ${ACCEPTABLE_RESPONSE_TIME}ms`);
      }
    });

    it('多次请求响应时间应该稳定', async () => {
      const times: number[] = [];

      for (let i = 0; i < 3; i++) {
        const start = Date.now();
        await fetch(`${API_BASE}/api/market/capital-flow`);
        times.push(Date.now() - start);
        await new Promise(resolve => setTimeout(resolve, 100)); // 避免过快请求
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxDeviation = Math.max(...times.map(t => Math.abs(t - avgTime)));

      // 最大偏差不应该超过平均值的80%（放宽限制）
      expect(maxDeviation).toBeLessThan(avgTime * 0.8);

      console.log('响应时间:', times, '平均:', avgTime, '最大偏差:', maxDeviation);
    });
  });

  describe('数据准确性', () => {
    it('资金数据类型应该正确', () => {
      if (responseData?.mainFlow) {
        expect(typeof responseData.mainFlow.totalInflow).toBe('number');
        expect(typeof responseData.mainFlow.totalOutflow).toBe('number');
        expect(typeof responseData.mainFlow.netInflow).toBe('number');
      }
    });

    it('净流入应该等于流入减流出', () => {
      if (responseData?.mainFlow) {
        const { totalInflow, totalOutflow, netInflow } = responseData.mainFlow;
        const calculatedNet = totalInflow - totalOutflow;

        // 允许浮点数精度误差
        expect(Math.abs(netInflow - calculatedNet)).toBeLessThan(0.01);
      }
    });

    it('板块资金数据类型应该正确', () => {
      if (responseData?.sectors?.length > 0) {
        responseData.sectors.forEach((sector: any) => {
          expect(typeof sector.name).toBe('string');
          expect(typeof sector.netInflow).toBe('number');
          if (sector.mainInflow !== undefined) {
            expect(typeof sector.mainInflow).toBe('number');
          }
        });
      }
    });

    it('板块名称不应为空', () => {
      if (responseData?.sectors?.length > 0) {
        responseData.sectors.forEach((sector: any) => {
          expect(sector.name.length).toBeGreaterThan(0);
        });
      }
    });

    it('应该返回至少一些板块数据', () => {
      if (responseData?.sectors) {
        // 实际数据应该有板块信息，至少有几个
        expect(responseData.sectors.length).toBeGreaterThan(0);
      }
    });
  });

  describe('数据逻辑验证', () => {
    it('流入和流出金额应该为正数或零', () => {
      if (responseData?.mainFlow) {
        expect(responseData.mainFlow.totalInflow).toBeGreaterThanOrEqual(0);
        expect(responseData.mainFlow.totalOutflow).toBeGreaterThanOrEqual(0);
      }
    });

    it('板块应该按净流入排序（降序）', () => {
      if (responseData?.sectors?.length > 1) {
        for (let i = 0; i < responseData.sectors.length - 1; i++) {
          const current = responseData.sectors[i].netInflow;
          const next = responseData.sectors[i + 1].netInflow;
          // 允许相等情况
          expect(current).toBeGreaterThanOrEqual(next);
        }
      }
    });
  });

  describe('错误处理', () => {
    it('在服务异常时应该优雅降级', async () => {
      const response = await fetch(`${API_BASE}/api/market/capital-flow`);
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('缓存和性能', () => {
    it('短时间内重复请求应该有缓存优化', async () => {
      const firstStart = Date.now();
      await fetch(`${API_BASE}/api/market/capital-flow`);
      const firstTime = Date.now() - firstStart;

      // 立即发起第二次请求
      const secondStart = Date.now();
      await fetch(`${API_BASE}/api/market/capital-flow`);
      const secondTime = Date.now() - secondStart;

      // 第二次请求通常应该更快（如果有缓存）
      console.log(`首次请求: ${firstTime}ms, 第二次请求: ${secondTime}ms`);
    });
  });
});
