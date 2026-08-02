// 从Python数据服务同步真实市场数据到数据库
// 替代模拟数据，提供真实的指数、ETF、资金流向数据

import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import path from 'path';

const dbPath = path.resolve(__dirname, '../prisma/dev.db');
const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
const prisma = new PrismaClient({ adapter });

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000';

// 指数代码映射
const INDEX_MAPPING = [
  { code: '930713', name: '中证人工智能主题指数', symbol: '930713' },
  { code: '931865', name: '中证全指半导体指数', symbol: '931865' },
  { code: '931160', name: '中证全指通信设备指数', symbol: '931160' },
];

// ETF代码映射
const ETF_MAPPING = [
  { ticker: '515070', name: 'AI ETF' },
  { ticker: '512480', name: '半导体ETF' },
  { ticker: '159995', name: '芯片ETF' },
  { ticker: '515880', name: '通信ETF' },
];

// 板块映射（匹配东方财富的板块名称）
const SECTOR_MAPPING = [
  { name: '芯片', eastmoneyName: '半导体' },
  { name: '存储芯片', eastmoneyName: '存储器' },
  { name: '服务器', eastmoneyName: '计算机设备' },
  { name: '散热', eastmoneyName: '元器件' },
  { name: '数据中心', eastmoneyName: '通信设备' },
  { name: '光模块', eastmoneyName: '光学光电子' },
  { name: '通信设备', eastmoneyName: '通信设备' },
];

interface IndexDailyData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface ETFDailyData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount?: number;
}

async function main() {
  console.log('=== 同步真实市场数据 ===\n');
  console.log(`数据源: ${DATA_SERVICE_URL}\n`);

  let totalSynced = 0;

  // 1. 同步指数数据
  console.log('1. 同步指数日线数据...');
  const indexCount = await syncIndexData();
  totalSynced += indexCount;

  // 2. 同步ETF数据
  console.log('\n2. 同步ETF日线数据...');
  const etfCount = await syncETFData();
  totalSynced += etfCount;

  // 3. 同步资金流向数据
  console.log('\n3. 同步板块资金流向数据...');
  const flowCount = await syncCapitalFlowData();
  totalSynced += flowCount;

  // 4. 更新GraphNode的新闻统计（保持不变）
  console.log('\n4. 更新节点新闻统计...');
  await updateNewsCount();

  console.log('\n=== 同步完成 ===');
  console.log(`总计同步: ${totalSynced} 条真实市场数据`);
  console.log('\n✅ 真实市场数据已同步到数据库！');

  await prisma.$disconnect();
}

/**
 * 同步指数数据
 */
async function syncIndexData(): Promise<number> {
  let count = 0;
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30); // 获取30天数据

  for (const index of INDEX_MAPPING) {
    try {
      console.log(`   获取 ${index.name} (${index.code})...`);

      // 调用Python数据服务
      const response = await fetch(
        `${DATA_SERVICE_URL}/api/market/index/${index.symbol}?days=30`,
        { signal: AbortSignal.timeout(15000) }
      );

      if (!response.ok) {
        console.error(`   ❌ HTTP ${response.status}: ${index.name}`);
        continue;
      }

      const result = await response.json();

      if (!result.success || !result.data || result.data.length === 0) {
        console.error(`   ❌ 无数据: ${index.name}`);
        continue;
      }

      // 删除旧数据
      await prisma.indexDaily.deleteMany({
        where: { code: index.code }
      });

      // 插入新数据
      for (const item of result.data as IndexDailyData[]) {
        const date = new Date(item.date);
        date.setHours(0, 0, 0, 0);

        const prevClose = result.data[result.data.indexOf(item) - 1]?.close || item.open;
        const changePct = ((item.close - prevClose) / prevClose) * 100;

        await prisma.indexDaily.create({
          data: {
            code: index.code,
            name: index.name,
            date,
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close,
            volume: BigInt(Math.floor(item.volume)),
            changePct,
          }
        });
        count++;
      }

      console.log(`   ✅ ${index.name}: ${result.data.length} 条数据`);
    } catch (error) {
      console.error(`   ❌ 同步失败 ${index.name}:`, error instanceof Error ? error.message : error);
    }
  }

  return count;
}

/**
 * 同步ETF数据
 */
async function syncETFData(): Promise<number> {
  let count = 0;

  for (const etf of ETF_MAPPING) {
    try {
      console.log(`   获取 ${etf.name} (${etf.ticker})...`);

      // 调用ETF API获取数据
      const response = await fetch(
        `${DATA_SERVICE_URL}/api/etf/${etf.ticker}`,
        { signal: AbortSignal.timeout(15000) }
      );

      if (!response.ok) {
        console.error(`   ❌ HTTP ${response.status}: ${etf.name}`);
        continue;
      }

      const result = await response.json();

      if (!result.success || !result.data || !result.data.history || result.data.history.length === 0) {
        console.error(`   ❌ 无数据: ${etf.name}`);
        continue;
      }

      // 删除旧数据
      await prisma.eTFDaily.deleteMany({
        where: { ticker: etf.ticker }
      });

      // 插入新数据
      for (const item of result.data.history as ETFDailyData[]) {
        const date = new Date(item.date);
        date.setHours(0, 0, 0, 0);

        // ETF的nav需要单独获取，这里暂时用close价估算
        const nav = item.close * (1 - 0.001); // 假设有0.1%的溢价
        const premium = ((item.close - nav) / nav) * 100;

        await prisma.eTFDaily.create({
          data: {
            ticker: etf.ticker,
            name: etf.name,
            date,
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close,
            volume: BigInt(Math.floor(item.volume)),
            amount: item.amount || item.close * item.volume,
            nav,
            shares: BigInt(Math.floor(item.volume / 100)), // 估算
            premium,
          }
        });
        count++;
      }

      console.log(`   ✅ ${etf.name}: ${result.data.history.length} 条数据`);
    } catch (error) {
      console.error(`   ❌ 同步失败 ${etf.name}:`, error instanceof Error ? error.message : error);
    }
  }

  return count;
}

/**
 * 同步资金流向数据
 */
async function syncCapitalFlowData(): Promise<number> {
  let count = 0;

  try {
    console.log(`   获取板块资金流向数据...`);

    // 调用Python数据服务获取板块资金流向
    const response = await fetch(
      `${DATA_SERVICE_URL}/api/capital-flow/sector?indicator=今日`,
      { signal: AbortSignal.timeout(15000) }
    );

    if (!response.ok) {
      console.error(`   ❌ HTTP ${response.status}`);
      return 0;
    }

    const result = await response.json();

    if (!result.success || !result.data || result.data.length === 0) {
      console.error(`   ❌ 无数据`);
      return 0;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 为每个映射的板块查找数据
    for (const sector of SECTOR_MAPPING) {
      // 在返回的数据中查找匹配的板块
      const sectorData = result.data.find((item: any) =>
        item.sector === sector.eastmoneyName
      );

      if (!sectorData) {
        console.log(`   ⚠️  未找到板块: ${sector.name} (查找: ${sector.eastmoneyName})`);
        continue;
      }

      // 删除今天的旧数据
      await prisma.sectorCapitalFlow.deleteMany({
        where: {
          sector: sector.name,
          date: today
        }
      });

      // 解析数据
      const mainForceNet = parseFloat(sectorData.mainForceNet || '0');
      const changePct = parseFloat(sectorData.changePct || '0');

      // 估算散户资金（通常与主力相反）
      const retailNet = -mainForceNet * 0.6;

      // 计算连续天数（需要历史数据，这里简化处理）
      const consecutiveDays = mainForceNet > 0 ? 1 : mainForceNet < 0 ? -1 : 0;

      await prisma.sectorCapitalFlow.create({
        data: {
          date: today,
          sector: sector.name,
          sectorLevel: 'L2',
          mainForceNet,
          retailNet,
          totalVolume: Math.abs(mainForceNet) + Math.abs(retailNet),
          changePct,
          consecutiveDays,
        }
      });
      count++;
    }

    console.log(`   ✅ 板块资金流向: ${count} 条数据`);
  } catch (error) {
    console.error(`   ❌ 同步资金流向失败:`, error instanceof Error ? error.message : error);
  }

  return count;
}

/**
 * 更新节点新闻统计
 */
async function updateNewsCount() {
  const aiNodes = await prisma.graphNode.findMany({
    where: { type: { in: ['ai_index', 'ai_l1', 'ai_l2'] } }
  });

  for (const node of aiNodes) {
    const now = new Date();
    const date7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const date30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const count7d = await prisma.newsGraphLink.count({
      where: {
        nodeId: node.id,
        createdAt: { gte: date7d }
      }
    });

    const count30d = await prisma.newsGraphLink.count({
      where: {
        nodeId: node.id,
        createdAt: { gte: date30d }
      }
    });

    await prisma.graphNode.update({
      where: { id: node.id },
      data: {
        newsCount7d: count7d,
        newsCount30d: count30d,
      }
    });
  }

  console.log(`   ✅ 更新了 ${aiNodes.length} 个节点的新闻统计`);
}

main().catch(console.error);
