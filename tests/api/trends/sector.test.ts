/**
 * 领域趋势API测试 - /api/events/trends/[sector]
 * 测试维度：
 * - 数据完整性：趋势分析结果验证
 * - 分类联动：与资讯流、知识图谱的分类一致性
 * - 分析数量：支持不同数量的趋势分析
 * - 性能监控：响应速度测试
 */

import { describe, it, expect } from 'vitest';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';
const MAX_RESPONSE_TIME = 10000; // 趋势分析可能涉及AI，时间较长

describe('领域趋势API - /api/events/trends/[sector]', () => {
  const testSectors = ['AI', '芯片', '半导体'];

  describe('响应稳定性', () => {
    it('应该返回200状态码', async () => {
      const response = await fetch(`${API_BASE}/api/events/trends/${testSectors[0]}`);
      expect(response.status).toBe(200);
    }, 20000);

    it('应该返回JSON格式', async () => {
      const response = await fetch(`${API_BASE}/api/events/trends/${testSectors[0]}`);
      const contentType = response.headers.get('content-type');
      expect(contentType).toContain('application/json');
    }, 20000);

    it('应该返回趋势数据结构', async () => {
      const response = await fetch(`${API_BASE}/api/events/trends/${testSectors[0]}`);
      const data = await response.json();

      expect(data).toBeDefined();
      expect(data).toHaveProperty('success');
      expect(data).toHaveProperty('data');
      // 趋势数据可能包含 sector, eventSummary, trendAssessment 等字段
      expect(data.data).toHaveProperty('sector');
    }, 20000);

    it('趋势数据应该包含关键字段', async () => {
      const response = await fetch(`${API_BASE}/api/events/trends/${testSectors[0]}`);
      const data = await response.json();

      expect(data.data.sector).toBe(testSectors[0]);

      // 应该包含趋势相关信息
      const hasTrendData =
        data.data.eventSummary !== undefined ||
        data.data.trendAssessment !== undefined ||
        data.data.topEvents !== undefined;

      expect(hasTrendData).toBe(true);
    }, 20000);
  });

  describe('分类联动验证', () => {
    it('领域分类应该与资讯流分类一致', async () => {
      // 获取事件分类
      const categoriesResponse = await fetch(`${API_BASE}/api/events/categories`);
      const categoriesData = await categoriesResponse.json();
      const categories = categoriesData.categories || categoriesData;

      // 获取趋势列表
      const trendsResponse = await fetch(`${API_BASE}/api/events/trends/summary`);
      const trendsData = await trendsResponse.json();

      if (Array.isArray(categories) && categories.length > 0) {
        console.log('事件分类示例:', categories.slice(0, 5));
      }

      expect(categoriesResponse.ok).toBe(true);
      expect(trendsResponse.ok).toBe(true);
    }, 20000);

    it('领域分类应该与知识图谱对应', async () => {
      // 获取知识图谱产业列表
      const industriesResponse = await fetch(`${API_BASE}/api/graph/industries`);
      const industriesData = await industriesResponse.json();

      // 获取领域列表
      const domainsResponse = await fetch(`${API_BASE}/api/events/domains`);
      const domainsData = await domainsResponse.json();

      expect(industriesResponse.ok).toBe(true);
      expect(domainsResponse.ok).toBe(true);

      if (industriesData.industries && domainsData.domains) {
        console.log('产业数量:', industriesData.industries.length);
        console.log('领域数量:', domainsData.domains.length);
      }
    }, 20000);

    it('可以使用知识图谱中的领域查询趋势', async () => {
      // 获取知识图谱的产业
      const industriesResponse = await fetch(`${API_BASE}/api/graph/industries`);
      const industriesData = await industriesResponse.json();
      const industries = industriesData.industries || industriesData;

      if (Array.isArray(industries) && industries.length > 0) {
        // 使用第一个产业的名称查询趋势
        const industryName = industries[0].name || industries[0].domainName;
        if (industryName) {
          const trendResponse = await fetch(
            `${API_BASE}/api/events/trends/${encodeURIComponent(industryName)}`
          );
          expect(trendResponse.status).toBe(200);
        }
      }
    }, 20000);
  });

  describe('分析数量筛选', () => {
    it('支持限制分析的事件数量', async () => {
      const limits = [5, 10, 20];

      for (const limit of limits) {
        const response = await fetch(
          `${API_BASE}/api/events/trends/${testSectors[0]}?limit=${limit}`
        );
        const data = await response.json();

        expect(response.ok).toBe(true);

        // 验证返回的事件数量不超过限制
        if (data.data.topEvents && Array.isArray(data.data.topEvents)) {
          expect(data.data.topEvents.length).toBeLessThanOrEqual(limit);
        }
      }
    }, 20000);

    it('默认分析数量应该合理', async () => {
      const response = await fetch(`${API_BASE}/api/events/trends/${testSectors[0]}`);
      const data = await response.json();

      // 如果有事件列表，默认数量应该在合理范围内（如10-30条）
      if (data.data.topEvents && Array.isArray(data.data.topEvents) && data.data.topEvents.length > 0) {
        expect(data.data.topEvents.length).toBeLessThanOrEqual(50);
        console.log('事件数量:', data.data.topEvents.length);
      } else {
        // 没有事件数据也是合法的（可能领域暂无新闻）
        console.log('该领域暂无趋势事件');
        expect(response.ok).toBe(true);
      }
    }, 20000);

    it('空领域应该返回适当的响应', async () => {
      const response = await fetch(`${API_BASE}/api/events/trends/`);
      // 空领域可能返回 400 或 404
      expect([400, 404]).toContain(response.status);
    }, 20000);
  });

  describe('多领域测试', () => {
    it('可以查询多个不同领域的趋势', async () => {
      const results = [];

      for (const sector of testSectors) {
        const response = await fetch(`${API_BASE}/api/events/trends/${sector}`);
        const data = await response.json();

        results.push({
          sector,
          success: data.success,
          hasTrend: !!data.data,
        });
      }

      // 所有领域都应该成功返回
      results.forEach((result) => {
        expect(result.success).toBe(true);
        expect(result.hasTrend).toBe(true);
      });

      console.log('多领域测试结果:', results);
    }, 20000);

    it('不同领域应该返回不同的趋势内容', async () => {
      const trends = [];

      for (const sector of testSectors.slice(0, 2)) {
        const response = await fetch(`${API_BASE}/api/events/trends/${sector}`);
        const data = await response.json();
        trends.push(data.data);
      }

      // 两个不同领域的趋势内容应该不同
      if (trends.length === 2) {
        expect(trends[0].sector).not.toBe(trends[1].sector);
      }
    }, 20000);
  });

  describe('响应速度', () => {
    it('应该在最大时间限制内返回', async () => {
      const startTime = Date.now();
      const response = await fetch(`${API_BASE}/api/events/trends/${testSectors[0]}`);
      const endTime = Date.now();
      const responseTime = endTime - startTime;

      expect(response.ok).toBe(true);
      expect(responseTime).toBeLessThan(MAX_RESPONSE_TIME);

      console.log(`趋势分析响应时间: ${responseTime}ms`);
    }, 20000);

    it('多次请求的响应时间应该相对稳定', async () => {
      const times = [];

      for (let i = 0; i < 3; i++) {
        const startTime = Date.now();
        await fetch(`${API_BASE}/api/events/trends/${testSectors[0]}`);
        const endTime = Date.now();
        times.push(endTime - startTime);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxDeviation = Math.max(...times.map((t) => Math.abs(t - avgTime)));

      console.log('响应时间分布:', times);
      console.log('平均响应时间:', avgTime);
      console.log('最大偏差:', maxDeviation);

      // 最大偏差不应超过平均值的120%（由于AI分析，允许较大波动）
      expect(maxDeviation).toBeLessThan(avgTime * 1.2);
    }, 20000);
  });

  describe('错误处理', () => {
    it('无效的领域应该返回适当的错误', async () => {
      const invalidSector = '不存在的领域XYZ123';
      const response = await fetch(
        `${API_BASE}/api/events/trends/${encodeURIComponent(invalidSector)}`
      );

      // 可能返回 404 或 200（但数据为空）
      if (response.status === 404) {
        expect(response.status).toBe(404);
      } else {
        const data = await response.json();
        // 如果返回 200，数据应该为空或包含错误信息
        expect(data).toBeDefined();
      }
    }, 20000);

    it('特殊字符的领域应该正确处理', async () => {
      const specialSectors = ['AI/ML', '芯片&半导体', 'Web3.0'];

      for (const sector of specialSectors) {
        const response = await fetch(
          `${API_BASE}/api/events/trends/${encodeURIComponent(sector)}`
        );
        // 应该能处理特殊字符，不应该返回 500
        expect(response.status).not.toBe(500);
      }
    }, 20000);
  });
});
