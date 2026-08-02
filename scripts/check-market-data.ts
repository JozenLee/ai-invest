// 检查数据库中的市场数据
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import path from 'path';

const dbPath = path.resolve(__dirname, '../prisma/dev.db');
const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('=== 检查市场数据表 ===\n');

  // 1. 检查IndexDaily
  const indexCount = await prisma.indexDaily.count();
  console.log(`IndexDaily 表: ${indexCount} 条记录`);
  if (indexCount > 0) {
    const sample = await prisma.indexDaily.findFirst({
      orderBy: { date: 'desc' }
    });
    console.log(`  最新记录: ${sample?.name} - ${sample?.date}`);
  }

  // 2. 检查ETFDaily
  const etfCount = await prisma.eTFDaily.count();
  console.log(`\nETFDaily 表: ${etfCount} 条记录`);
  if (etfCount > 0) {
    const sample = await prisma.eTFDaily.findFirst({
      orderBy: { date: 'desc' }
    });
    console.log(`  最新记录: ${sample?.name} - ${sample?.date}`);
  }

  // 3. 检查SectorCapitalFlow
  const flowCount = await prisma.sectorCapitalFlow.count();
  console.log(`\nSectorCapitalFlow 表: ${flowCount} 条记录`);
  if (flowCount > 0) {
    const sample = await prisma.sectorCapitalFlow.findFirst({
      orderBy: { date: 'desc' }
    });
    console.log(`  最新记录: ${sample?.sector} - ${sample?.date}`);
  }

  // 4. 检查NewsGraphLink
  const newsLinkCount = await prisma.newsGraphLink.count();
  console.log(`\nNewsGraphLink 表: ${newsLinkCount} 条记录`);
  if (newsLinkCount > 0) {
    const sample = await prisma.newsGraphLink.findFirst({
      include: { node: true, news: true }
    });
    console.log(`  示例: 新闻"${sample?.news.title.substring(0, 30)}..." 关联到节点 "${sample?.node.name}"`);
  }

  // 5. 检查GraphNode的newsCount字段
  const nodesWithNews = await prisma.graphNode.findMany({
    where: {
      OR: [
        { newsCount7d: { gt: 0 } },
        { newsCount30d: { gt: 0 } }
      ]
    },
    select: { name: true, newsCount7d: true, newsCount30d: true }
  });
  console.log(`\n有新闻统计的节点: ${nodesWithNews.length} 个`);
  if (nodesWithNews.length > 0) {
    nodesWithNews.slice(0, 3).forEach(n => {
      console.log(`  - ${n.name}: 7日=${n.newsCount7d}, 30日=${n.newsCount30d}`);
    });
  }

  console.log('\n=== 结论 ===\n');
  if (indexCount === 0 && etfCount === 0 && flowCount === 0) {
    console.log('❌ 问题：数据库中没有市场数据！');
    console.log('\n原因：市场数据增强服务依赖这些表的数据：');
    console.log('   1. IndexDaily - 指数日线数据（用于行业指数表现）');
    console.log('   2. ETFDaily - ETF日线数据（用于ETF跟踪）');
    console.log('   3. SectorCapitalFlow - 板块资金流向（用于资金流向分析）');
    console.log('   4. NewsGraphLink - 新闻节点关联（用于新闻热度）');
    console.log('\n解决方案：');
    console.log('   选项1: 导入真实的市场数据（需要数据源）');
    console.log('   选项2: 生成模拟数据用于演示');
  } else {
    console.log('✅ 数据库有部分市场数据');
    console.log('   但可能不够完整或不够新');
  }

  await prisma.$disconnect();
}

main();
