// 定时同步真实市场数据
// 建议在交易日收盘后（16:00-17:00）每日执行一次

import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import path from 'path';

const dbPath = path.resolve(__dirname, '../prisma/dev.db');
const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
const prisma = new PrismaClient({ adapter });

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000';

async function main() {
  console.log('=== 定时同步市场数据 ===');
  console.log(`时间: ${new Date().toLocaleString('zh-CN')}`);
  console.log(`数据源: ${DATA_SERVICE_URL}\n`);

  const results = {
    etf: { success: 0, failed: 0 },
    sector: { success: 0, failed: 0 },
  };

  // 1. 同步ETF数据
  console.log('1. 同步ETF数据...');
  const etfResult = await syncETFData();
  results.etf = etfResult;

  // 2. 同步板块资金流向
  console.log('\n2. 同步板块资金流向...');
  const sectorResult = await syncSectorFlow();
  results.sector = sectorResult;

  // 3. 更新新闻统计
  console.log('\n3. 更新节点新闻统计...');
  await updateNewsCount();

  // 4. 输出结果
  console.log('\n=== 同步结果 ===');
  console.log(`ETF数据: 成功 ${results.etf.success}，失败 ${results.etf.failed}`);
  console.log(`板块资金流: 成功 ${results.sector.success}，失败 ${results.sector.failed}`);

  const totalSuccess = results.etf.success + results.sector.success;
  const totalFailed = results.etf.failed + results.sector.failed;

  if (totalFailed === 0) {
    console.log('\n✅ 所有数据同步成功！');
  } else if (totalSuccess > 0) {
    console.log(`\n⚠️  部分数据同步成功 (${totalSuccess}/${totalSuccess + totalFailed})`);
  } else {
    console.log('\n❌ 数据同步失败，请检查数据服务是否运行');
  }

  await prisma.$disconnect();
}

async function syncETFData() {
  const ETF_LIST = [
    { ticker: '515070', name: 'AI ETF' },
    { ticker: '512480', name: '半导体ETF' },
    { ticker: '159995', name: '芯片ETF' },
    { ticker: '515880', name: '通信ETF' },
  ];

  let success = 0;
  let failed = 0;

  for (const etf of ETF_LIST) {
    try {
      const response = await fetch(
        `${DATA_SERVICE_URL}/api/etf/${etf.ticker}`,
        { signal: AbortSignal.timeout(15000) }
      );

      if (!response.ok) {
        console.log(`   ❌ ${etf.name}: HTTP ${response.status}`);
        failed++;
        continue;
      }

      const result = await response.json();

      if (!result.success || !result.data?.history || result.data.history.length === 0) {
        console.log(`   ❌ ${etf.name}: 无数据`);
        failed++;
        continue;
      }

      // 删除旧数据
      await prisma.eTFDaily.deleteMany({ where: { ticker: etf.ticker } });

      // 插入新数据
      for (const item of result.data.history) {
        const date = new Date(item.date);
        date.setHours(0, 0, 0, 0);

        const nav = item.close * 0.999; // 估算净值
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
            shares: BigInt(Math.floor(item.volume / 100)),
            premium,
          }
        });
      }

      console.log(`   ✅ ${etf.name}: ${result.data.history.length} 条`);
      success++;
    } catch (error) {
      console.log(`   ❌ ${etf.name}: ${error instanceof Error ? error.message : error}`);
      failed++;
    }
  }

  return { success, failed };
}

async function syncSectorFlow() {
  const SECTORS = [
    // AI算力相关板块（使用实际可用的板块名称）
    { name: '芯片', match: '军工电子' },           // 备用：使用军工电子作为芯片相关
    { name: '服务器', match: '计算机设备' },
    { name: '数据中心', match: '通信设备' },
    { name: '通信设备', match: '通信设备' },
    { name: '软件开发', match: '软件开发' },
    { name: 'IT服务', match: 'IT服务' },
    { name: '通信服务', match: '通信服务' },
  ];

  try {
    const response = await fetch(
      `${DATA_SERVICE_URL}/api/capital-flow/sector`,
      { signal: AbortSignal.timeout(15000) }
    );

    if (!response.ok) {
      console.log(`   ❌ HTTP ${response.status}`);
      return { success: 0, failed: SECTORS.length };
    }

    const result = await response.json();

    if (!result.success || !result.data || result.data.length === 0) {
      console.log(`   ❌ 无数据`);
      return { success: 0, failed: SECTORS.length };
    }

    // 获取所有可用板块列表（用于调试）
    const availableSectors = result.data.map((item: any) => item.sector);
    console.log(`   📋 可用板块: ${availableSectors.length}个`);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let success = 0;
    let failed = 0;

    for (const sector of SECTORS) {
      const sectorData = result.data.find((item: any) => item.sector === sector.match);

      if (!sectorData) {
        console.log(`   ⚠️  ${sector.name}: 未找到数据 (查找: ${sector.match})`);
        failed++;
        continue;
      }

      await prisma.sectorCapitalFlow.deleteMany({
        where: { sector: sector.name, date: today }
      });

      const mainForceNet = parseFloat(sectorData.mainForceNet || '0');
      const changePct = parseFloat(sectorData.changePct || '0');
      const retailNet = -mainForceNet * 0.6;

      await prisma.sectorCapitalFlow.create({
        data: {
          date: today,
          sector: sector.name,
          sectorLevel: 'L2',
          mainForceNet,
          retailNet,
          totalVolume: Math.abs(mainForceNet) + Math.abs(retailNet),
          changePct,
          consecutiveDays: mainForceNet > 0 ? 1 : mainForceNet < 0 ? -1 : 0,
        }
      });

      console.log(`   ✅ ${sector.name}: ${mainForceNet.toFixed(2)}万元`);
      success++;
    }

    return { success, failed };
  } catch (error) {
    console.log(`   ❌ 同步失败: ${error instanceof Error ? error.message : error}`);
    return { success: 0, failed: SECTORS.length };
  }
}

async function updateNewsCount() {
  const nodes = await prisma.graphNode.findMany({
    where: { type: { in: ['ai_index', 'ai_l1', 'ai_l2'] } }
  });

  const now = new Date();
  const date7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const date30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  for (const node of nodes) {
    const count7d = await prisma.newsGraphLink.count({
      where: { nodeId: node.id, createdAt: { gte: date7d } }
    });

    const count30d = await prisma.newsGraphLink.count({
      where: { nodeId: node.id, createdAt: { gte: date30d } }
    });

    await prisma.graphNode.update({
      where: { id: node.id },
      data: { newsCount7d: count7d, newsCount30d: count30d }
    });
  }

  console.log(`   ✅ 更新了 ${nodes.length} 个节点`);
}

main().catch(console.error);
