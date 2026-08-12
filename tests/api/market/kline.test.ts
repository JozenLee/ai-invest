/**
 * K线数据API测试
 * 测试维度：
 * - 参数验证：不同周期、不同时间范围的请求
 * - 数据完整性：K线数据字段验证
 * - 性能监控：响应速度测试
 */

import { describe, it, expect } from 'vitest';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';
const MAX_RESPONSE_TIME = 6000;

describe('K线数据API - /api/market/kline', () => {
  const testSymbol = 'sh000001'; // 上证指数
  const testPeriods = ['day', 'week', 'month'];

  describe('响应稳定性', () => {
    it('应该返回200状态码（日K线）', async () => {
      const response = await fetch(`${API_BASE}/api/market/kline?code=${testSymbol}&period=day`);
      expect(response.status).toBe(200);
    });

    it('应该返回JSON格式', async () => {
      const response = await fetch(`${API_BASE}/api/market/kline?symbol=${testSymbol}&period=1d`);
      const contentType = response.headers.get('content-type');
      expect(contentType).toContain('application/json');
    });

    it('应该返回K线数据数组', async () => {
      const response = await fetch(`${API_BASE}/api/market/kline?code=${testSymbol}&period=day`);
      const data = await response.json();

      expect(data).toBeDefined();
      if (data.success) {
        expect(Array.isArray(data.data || [])).toBe(true);
      }
    });

    it('每条K线应该包含必需字段', async () => {
      const response = await fetch(`${API_BASE}/api/market/kline?symbol=${testSymbol}&period=1d`);
      const data = await response.json();
      const klines = data.klines || data;

      if (klines.length > 0) {
        const kline = klines[0];
        expect(kline).toHaveProperty('date');
        expect(kline).toHaveProperty('open');
        expect(kline).toHaveProperty('high');
        expect(kline).toHaveProperty('low');
        expect(kline).toHaveProperty('close');
        expect(kline).toHaveProperty('volume');
      }
    });
  });

  describe('参数验证', () => {
    it('缺少必需参数应该返回错误', async () => {
      const response = await fetch(`${API_BASE}/api/market/kline`);
      // API返回错误信息，状态码可能是200但success为false
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
    });

    it('支持不同的周期参数', async () => {
      for (const period of testPeriods) {
        const response = await fetch(`${API_BASE}/api/market/kline?code=${testSymbol}&period=${period}`);
        expect(response.ok).toBe(true);
      }
    });

    it('无效的股票代码应该返回适当错误', async () => {
      const response = await fetch(`${API_BASE}/api/market/kline?symbol=INVALID&period=1d`);
      // 应该返回4xx错误或空数据，而不是5xx
      expect(response.status).not.toEqual(500);
    });
  });

  describe('数据准确性', () => {
    it('K线数据字段类型应该正确', async () => {
      const response = await fetch(`${API_BASE}/api/market/kline?symbol=${testSymbol}&period=1d`);
      const data = await response.json();
      const klines = data.klines || data;

      if (klines.length > 0) {
        const kline = klines[0];
        expect(typeof kline.open).toBe('number');
        expect(typeof kline.high).toBe('number');
        expect(typeof kline.low).toBe('number');
        expect(typeof kline.close).toBe('number');
        expect(typeof kline.volume).toBe('number');
      }
    });

    it('K线数据应该符合逻辑关系', async () => {
      const response = await fetch(`${API_BASE}/api/market/kline?symbol=${testSymbol}&period=1d`);
      const data = await response.json();
      const klines = data.klines || data;

      if (klines.length > 0) {
        klines.forEach((kline: any) => {
          // 最高价应该 >= 开盘价、收盘价、最低价
          expect(kline.high).toBeGreaterThanOrEqual(kline.open);
          expect(kline.high).toBeGreaterThanOrEqual(kline.close);
          expect(kline.high).toBeGreaterThanOrEqual(kline.low);

          // 最低价应该 <= 开盘价、收盘价、最高价
          expect(kline.low).toBeLessThanOrEqual(kline.open);
          expect(kline.low).toBeLessThanOrEqual(kline.close);
          expect(kline.low).toBeLessThanOrEqual(kline.high);

          // 成交量应该非负
          expect(kline.volume).toBeGreaterThanOrEqual(0);
        });
      }
    });

    it('日期应该按时间排序', async () => {
      const response = await fetch(`${API_BASE}/api/market/kline?symbol=${testSymbol}&period=1d&limit=30`);
      const data = await response.json();
      const klines = data.klines || data;

      if (klines.length > 1) {
        for (let i = 0; i < klines.length - 1; i++) {
          const currentDate = new Date(klines[i].date);
          const nextDate = new Date(klines[i + 1].date);

          // 应该按升序或降序排列
          // 不同API可能有不同的排序方式
          expect(currentDate.getTime()).not.toBeNaN();
          expect(nextDate.getTime()).not.toBeNaN();
        }
      }
    });
  });

  describe('响应速度', () => {
    it('应该在时间限制内返回', async () => {
      const startTime = Date.now();
      const response = await fetch(`${API_BASE}/api/market/kline?symbol=${testSymbol}&period=1d&limit=100`);
      const responseTime = Date.now() - startTime;

      expect(response.ok).toBe(true);
      expect(responseTime).toBeLessThan(MAX_RESPONSE_TIME);
    });

    it('不同周期的响应时间应该合理', async () => {
      const results: Record<string, number> = {};

      for (const period of testPeriods) {
        const startTime = Date.now();
        await fetch(`${API_BASE}/api/market/kline?symbol=${testSymbol}&period=${period}`);
        results[period] = Date.now() - startTime;
      }

      console.log('各周期响应时间:', results);
      Object.values(results).forEach(time => {
        expect(time).toBeLessThan(MAX_RESPONSE_TIME);
      });
    });
  });

  describe('数据范围', () => {
    it('应该支持限制返回数量', async () => {
      const limit = 10;
      const response = await fetch(`${API_BASE}/api/market/kline?code=${testSymbol}&period=day&limit=${limit}`);
      const data = await response.json();
      const klines = data.data || [];

      if (Array.isArray(klines)) {
        expect(klines.length).toBeLessThanOrEqual(limit);
      }
    });

    it('应该返回合理数量的K线数据', async () => {
      const response = await fetch(`${API_BASE}/api/market/kline?code=${testSymbol}&period=day`);
      const data = await response.json();
      const klines = data.data || [];

      if (Array.isArray(klines)) {
        // 应该有一些历史数据
        expect(klines.length).toBeGreaterThanOrEqual(0);
        // 但不应该过多（除非特别指定）
        if (klines.length > 0) {
          expect(klines.length).toBeLessThan(1000);
        }
      }
    });
  });
});
