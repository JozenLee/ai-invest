/**
 * 资讯流与趋势API数据一致性测试
 *
 * 背景：用户报告资讯流筛选AI算力硬件只有2条，但趋势页面显示7条，数据不一致
 *
 * 测试目标：
 * 1. 验证资讯流API和趋势API返回的数据数量是否一致
 * 2. 分析不一致的原因（筛选逻辑、数据源、时间范围等）
 * 3. 提供详细的调试信息帮助定位问题
 */

import { describe, it, expect } from 'vitest';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';
const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000';

// 允许的偏差百分比（20%以内认为合理）
const TOLERANCE_PERCENTAGE = 0.20;

interface NewsItem {
  id: string;
  title: string;
  publishTime: string;
  domainIds?: string[];
  segmentCodes?: string[];
  category?: string;
  source?: string;
}

interface FeedResponse {
  success: boolean;
  data: {
    items: NewsItem[];
    total: number;
    source?: string;
  };
}

interface TrendsResponse {
  success: boolean;
  data: {
    sector: string;
    topEvents?: NewsItem[];
    relatedNews?: NewsItem[];
    eventSummary?: {
      totalEvents: number;
    };
  };
}

/**
 * 计算两个数字的偏差百分比
 */
function calculateDeviation(a: number, b: number): number {
  if (a === 0 && b === 0) return 0;
  const max = Math.max(a, b);
  const diff = Math.abs(a - b);
  return diff / max;
}

/**
 * 提取新闻ID列表
 */
function extractNewsIds(news: NewsItem[]): string[] {
  return news.map(n => n.id).sort();
}

/**
 * 比较两个新闻列表的差异
 */
function compareNewsLists(list1: NewsItem[], list2: NewsItem[], label1: string, label2: string) {
  const ids1 = new Set(list1.map(n => n.id));
  const ids2 = new Set(list2.map(n => n.id));

  const onlyIn1 = list1.filter(n => !ids2.has(n.id));
  const onlyIn2 = list2.filter(n => !ids1.has(n.id));
  const common = list1.filter(n => ids2.has(n.id));

  return {
    total1: list1.length,
    total2: list2.length,
    common: common.length,
    onlyIn1: {
      count: onlyIn1.length,
      items: onlyIn1
    },
    onlyIn2: {
      count: onlyIn2.length,
      items: onlyIn2
    },
    label1,
    label2
  };
}

describe('资讯流与趋势API数据一致性测试', () => {

  describe('AI算力硬件数据一致性', () => {
    it('应该验证资讯流和趋势页面的数据基本一致', async () => {
      // 1. 调用资讯流API - 筛选AI算力硬件产业
      const feedResponse = await fetch(
        `${API_BASE}/api/events/feed?industryId=ai_hardware&limit=100`
      );
      expect(feedResponse.ok).toBe(true);

      const feedData: FeedResponse = await feedResponse.json();
      expect(feedData.success).toBe(true);

      const feedItems = feedData.data?.items || [];
      console.log(`📰 资讯流API返回: ${feedItems.length} 条新闻`);

      // 2. 调用趋势API - AI算力硬件
      const trendsResponse = await fetch(
        `${API_BASE}/api/events/trends/AI算力硬件?days=7`
      );
      expect(trendsResponse.ok).toBe(true);

      const trendsData: TrendsResponse = await trendsResponse.json();
      expect(trendsData.success).toBe(true);

      // 趋势API可能返回 topEvents 或 relatedNews
      const trendsItems = trendsData.data?.topEvents || trendsData.data?.relatedNews || [];
      const totalEvents = trendsData.data?.eventSummary?.totalEvents;

      console.log(`📊 趋势API返回: ${trendsItems.length} 条新闻（事件总数: ${totalEvents || 'N/A'}）`);

      // 3. 计算偏差
      const deviation = calculateDeviation(feedItems.length, trendsItems.length);
      console.log(`📐 数据偏差: ${(deviation * 100).toFixed(1)}%`);

      // 4. 如果偏差超过阈值，输出详细分析
      if (deviation > TOLERANCE_PERCENTAGE) {
        console.log('\n⚠️  检测到数据不一致！');
        console.log('='.repeat(60));

        // 比较新闻列表
        const comparison = compareNewsLists(
          feedItems,
          trendsItems,
          '资讯流API',
          '趋势API'
        );

        console.log(`\n📊 数据对比:`);
        console.log(`  ${comparison.label1}: ${comparison.total1} 条`);
        console.log(`  ${comparison.label2}: ${comparison.total2} 条`);
        console.log(`  共同新闻: ${comparison.common} 条`);
        console.log(`  仅在${comparison.label1}: ${comparison.onlyIn1.count} 条`);
        console.log(`  仅在${comparison.label2}: ${comparison.onlyIn2.count} 条`);

        // 输出仅在资讯流的新闻
        if (comparison.onlyIn1.count > 0) {
          console.log(`\n📝 仅在${comparison.label1}的新闻 (前5条):`);
          comparison.onlyIn1.items.slice(0, 5).forEach((item, idx) => {
            console.log(`  ${idx + 1}. ${item.title}`);
            console.log(`     - ID: ${item.id}`);
            console.log(`     - 时间: ${item.publishTime}`);
            console.log(`     - domainIds: ${JSON.stringify(item.domainIds || [])}`);
            console.log(`     - segmentCodes: ${JSON.stringify(item.segmentCodes || [])}`);
          });
        }

        // 输出仅在趋势API的新闻
        if (comparison.onlyIn2.count > 0) {
          console.log(`\n📝 仅在${comparison.label2}的新闻 (前5条):`);
          comparison.onlyIn2.items.slice(0, 5).forEach((item, idx) => {
            console.log(`  ${idx + 1}. ${item.title}`);
            console.log(`     - ID: ${item.id}`);
            console.log(`     - 时间: ${item.publishTime}`);
            console.log(`     - domainIds: ${JSON.stringify(item.domainIds || [])}`);
            console.log(`     - segmentCodes: ${JSON.stringify(item.segmentCodes || [])}`);
          });
        }

        console.log('='.repeat(60));
      } else {
        console.log('✅ 数据一致性良好，偏差在可接受范围内');
      }

      // 5. 断言：允许一定偏差
      expect(deviation).toBeLessThan(0.50); // 允许最多50%偏差（宽松检查）
    }, 30000);

    it('应该分析资讯流API的筛选逻辑', async () => {
      console.log('\n🔍 分析资讯流API筛选逻辑...');

      // 1. 获取AI算力硬件产业的Segment信息
      const segmentsResponse = await fetch(
        `${DATA_SERVICE_URL}/api/v1/industry-graph/ai_hardware/segments`
      );

      if (segmentsResponse.ok) {
        const segmentsData = await segmentsResponse.json();
        if (segmentsData.success && segmentsData.data?.segments) {
          const segments = segmentsData.data.segments;
          console.log(`\n📋 AI算力硬件产业包含 ${segments.length} 个Segment:`);
          segments.forEach((seg: any, idx: number) => {
            console.log(`  ${idx + 1}. ${seg.segment_name} (${seg.segment_code})`);
          });

          // 2. 获取带有这些segment的新闻
          const segmentCodes = segments.map((s: any) => s.segment_code);
          console.log(`\n🔎 筛选条件: segmentCodes = ${JSON.stringify(segmentCodes)}`);

          // 3. 调用资讯流API
          const feedResponse = await fetch(
            `${API_BASE}/api/events/feed?industryId=ai_hardware&limit=100`
          );
          const feedData: FeedResponse = await feedResponse.json();

          console.log(`\n📰 资讯流返回: ${feedData.data?.items?.length || 0} 条`);

          // 4. 分析每条新闻的segmentCodes
          if (feedData.data?.items && feedData.data.items.length > 0) {
            console.log(`\n📊 新闻的Segment分布 (前10条):`);
            feedData.data.items.slice(0, 10).forEach((item, idx) => {
              const itemSegments = item.segmentCodes || [];
              console.log(`  ${idx + 1}. ${item.title.substring(0, 40)}...`);
              console.log(`     segmentCodes: ${JSON.stringify(itemSegments)}`);
            });
          }
        }
      } else {
        console.log('⚠️  无法获取Segment信息，可能知识图谱服务未启动');
      }
    }, 30000);

    it('应该分析趋势API的数据来源', async () => {
      console.log('\n🔍 分析趋势API数据来源...');

      // 趋势API调用的是Python服务: /api/news/trends/AI算力硬件
      const pythonTrendsResponse = await fetch(
        `${DATA_SERVICE_URL}/api/news/trends/AI算力硬件?days=7`
      );

      if (pythonTrendsResponse.ok) {
        const pythonData = await pythonTrendsResponse.json();
        console.log(`\n📊 Python趋势服务返回状态: ${pythonData.success}`);

        if (pythonData.data) {
          const topEvents = pythonData.data.topEvents || pythonData.data.relatedNews || [];
          console.log(`  新闻数量: ${topEvents.length}`);
          console.log(`  总事件数: ${pythonData.data.eventSummary?.totalEvents || 'N/A'}`);

          if (topEvents.length > 0) {
            console.log(`\n📝 趋势API返回的新闻 (前5条):`);
            topEvents.slice(0, 5).forEach((item: any, idx: number) => {
              console.log(`  ${idx + 1}. ${item.title}`);
              console.log(`     - sectors: ${JSON.stringify(item.sectors || [])}`);
              console.log(`     - category: ${item.category || 'N/A'}`);
            });
          }
        }
      } else {
        console.log('⚠️  无法连接Python趋势服务');
      }
    }, 30000);
  });

  describe('其他产业数据一致性', () => {
    const testIndustries = [
      { id: 'innovative_drug', name: '创新药', displayName: '创新药' },
      { id: 'new_energy_vehicle', name: '新能源汽车', displayName: '新能源汽车' }
    ];

    testIndustries.forEach(({ id, name, displayName }) => {
      it(`应该验证${displayName}产业的数据一致性`, async () => {
        // 1. 资讯流API
        const feedResponse = await fetch(
          `${API_BASE}/api/events/feed?industryId=${id}&limit=100`
        );

        if (!feedResponse.ok) {
          console.log(`⚠️  资讯流API返回错误: ${feedResponse.status}`);
          return;
        }

        const feedData: FeedResponse = await feedResponse.json();
        const feedItems = feedData.data?.items || [];

        // 2. 趋势API
        const trendsResponse = await fetch(
          `${API_BASE}/api/events/trends/${encodeURIComponent(displayName)}?days=7`
        );

        if (!trendsResponse.ok) {
          console.log(`⚠️  趋势API返回错误: ${trendsResponse.status}`);
          return;
        }

        const trendsData: TrendsResponse = await trendsResponse.json();
        const trendsItems = trendsData.data?.topEvents || trendsData.data?.relatedNews || [];

        console.log(`\n${displayName}:`);
        console.log(`  资讯流API: ${feedItems.length} 条`);
        console.log(`  趋势API: ${trendsItems.length} 条`);

        const deviation = calculateDeviation(feedItems.length, trendsItems.length);
        console.log(`  偏差: ${(deviation * 100).toFixed(1)}%`);

        if (deviation > TOLERANCE_PERCENTAGE) {
          console.log(`  ⚠️  偏差超过阈值 ${TOLERANCE_PERCENTAGE * 100}%`);

          const comparison = compareNewsLists(
            feedItems,
            trendsItems,
            '资讯流',
            '趋势'
          );
          console.log(`  共同: ${comparison.common}, 仅资讯流: ${comparison.onlyIn1.count}, 仅趋势: ${comparison.onlyIn2.count}`);
        } else {
          console.log(`  ✅ 数据一致性良好`);
        }

        // 允许较大偏差，因为不同产业可能有不同的筛选逻辑
        expect(deviation).toBeLessThan(0.80);
      }, 30000);
    });
  });

  describe('数据源差异分析', () => {
    it('应该对比直接查询数据库和API返回的结果', async () => {
      console.log('\n🔍 对比数据源差异...');

      // 1. 资讯流API（Next.js，从SQLite读取）
      const feedResponse = await fetch(
        `${API_BASE}/api/events/feed?industryId=ai_hardware&limit=100`
      );
      const feedData: FeedResponse = await feedResponse.json();
      const feedSource = feedData.data?.source || 'unknown';

      console.log(`\n📊 资讯流数据源: ${feedSource}`);
      console.log(`   数量: ${feedData.data?.items?.length || 0}`);
      console.log(`   总数: ${feedData.data?.total || 0}`);

      // 2. Python服务的新闻列表
      const pythonFeedResponse = await fetch(
        `${DATA_SERVICE_URL}/api/news/feed?limit=100`
      );

      if (pythonFeedResponse.ok) {
        const pythonFeedData = await pythonFeedResponse.json();
        const pythonItems = pythonFeedData.data?.items || [];

        console.log(`\n📊 Python服务新闻数量: ${pythonItems.length}`);

        // 对比前10条新闻的ID
        const feedIds = feedData.data?.items?.slice(0, 10).map(n => n.id) || [];
        const pythonIds = pythonItems.slice(0, 10).map((n: any) => n.id) || [];

        console.log(`\n🔍 前10条新闻ID对比:`);
        console.log(`   资讯流: ${JSON.stringify(feedIds.slice(0, 3))}...`);
        console.log(`   Python: ${JSON.stringify(pythonIds.slice(0, 3))}...`);

        const commonIds = feedIds.filter(id => pythonIds.includes(id));
        console.log(`   共同ID数量: ${commonIds.length}/10`);
      }
    }, 30000);

    it('应该检查时间范围的影响', async () => {
      console.log('\n🔍 检查时间范围影响...');

      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // 1. 不带时间筛选
      const feed1 = await fetch(
        `${API_BASE}/api/events/feed?industryId=ai_hardware&limit=100`
      );
      const data1: FeedResponse = await feed1.json();

      // 2. 带7天时间筛选
      const feed2 = await fetch(
        `${API_BASE}/api/events/feed?industryId=ai_hardware&limit=100&startDate=${sevenDaysAgo.toISOString().split('T')[0]}`
      );
      const data2: FeedResponse = await feed2.json();

      console.log(`\n📊 时间范围对比:`);
      console.log(`   不限时间: ${data1.data?.items?.length || 0} 条`);
      console.log(`   近7天: ${data2.data?.items?.length || 0} 条`);

      // 趋势API默认是7天
      console.log(`\n💡 提示: 趋势API默认查询近7天数据 (days=7)`);
      console.log(`   如果资讯流不限时间，可能包含更多历史数据`);
    }, 30000);
  });

  describe('根因分析建议', () => {
    it('应该输出不一致问题的可能原因', async () => {
      console.log('\n📋 数据不一致的可能原因:');
      console.log('='.repeat(60));
      console.log('1. 筛选逻辑差异:');
      console.log('   - 资讯流: 通过 industryId -> segments -> tags 关联筛选');
      console.log('   - 趋势API: 通过 sectors 字段筛选');
      console.log('   建议: 确保两个API使用相同的筛选字段');
      console.log('');
      console.log('2. 数据来源不同:');
      console.log('   - 资讯流: 从SQLite本地数据库读取（优先）');
      console.log('   - 趋势API: 调用Python服务 /api/news/trends/{sector}');
      console.log('   建议: 检查Python服务的数据是否与SQLite同步');
      console.log('');
      console.log('3. 时间范围不一致:');
      console.log('   - 资讯流: 默认不限时间，返回所有数据');
      console.log('   - 趋势API: 默认查询近7天 (days=7)');
      console.log('   建议: 在资讯流也添加时间范围限制');
      console.log('');
      console.log('4. 字段映射问题:');
      console.log('   - segmentCodes vs domainIds vs sectors');
      console.log('   - "AI算力硬件" 产业ID vs 显示名称');
      console.log('   建议: 统一使用知识图谱的segment_code作为筛选依据');
      console.log('');
      console.log('5. 数据更新延迟:');
      console.log('   - 本地数据库可能未同步最新新闻');
      console.log('   - Python服务可能有缓存');
      console.log('   建议: 检查数据采集任务是否正常运行');
      console.log('='.repeat(60));
    }, 5000);
  });
});
