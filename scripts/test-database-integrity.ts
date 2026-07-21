import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || 'file:./prisma/dev.db',
});

const prisma = new PrismaClient({ adapter });

async function runTests() {
  console.log('3. 数据库完整性检查');
  console.log('━'.repeat(80));

  let passed = 0;
  let failed = 0;

  // Test 1: All datasources have schedulers
  try {
    const sources = await prisma.dataSource.findMany({
      include: { schedulerJobs: true }
    });
    const withoutScheduler = sources.filter(s => s.schedulerJobs.length === 0);

    if (withoutScheduler.length === 0) {
      console.log('Testing: 所有数据源有调度器... ✅ PASSED');
      passed++;
    } else {
      console.log(`Testing: 所有数据源有调度器... ❌ FAILED (${withoutScheduler.length}个数据源缺少调度器)`);
      failed++;
    }
  } catch (e) {
    console.log('Testing: 所有数据源有调度器... ❌ FAILED (异常)');
    failed++;
  }

  // Test 2: NewsNow configuration
  try {
    const jobs = await prisma.schedulerJob.findMany({
      include: { source: true }
    });
    const newsNow = jobs.filter(j => j.source.provider === 'newsnow');
    const correct = newsNow.filter(j => {
      const config = JSON.parse(j.scheduleConfig);
      return config.intervalMinutes === 30;
    });

    if (correct.length === newsNow.length && newsNow.length > 0) {
      console.log('Testing: NewsNow配置正确(30分钟)... ✅ PASSED');
      passed++;
    } else {
      console.log(`Testing: NewsNow配置正确(30分钟)... ❌ FAILED (${correct.length}/${newsNow.length})`);
      failed++;
    }
  } catch (e) {
    console.log('Testing: NewsNow配置正确(30分钟)... ❌ FAILED (异常)');
    failed++;
  }

  // Test 3: AKShare configuration
  try {
    const jobs = await prisma.schedulerJob.findMany({
      include: { source: true }
    });
    const akshare = jobs.filter(j => j.source.provider === 'akshare');
    const correct = akshare.filter(j => {
      const config = JSON.parse(j.scheduleConfig);
      return config.intervalMinutes === 60;
    });

    if (correct.length === akshare.length && akshare.length > 0) {
      console.log('Testing: AKShare配置正确(60分钟)... ✅ PASSED');
      passed++;
    } else {
      console.log(`Testing: AKShare配置正确(60分钟)... ❌ FAILED (${correct.length}/${akshare.length})`);
      failed++;
    }
  } catch (e) {
    console.log('Testing: AKShare配置正确(60分钟)... ❌ FAILED (异常)');
    failed++;
  }

  // Test 4: Domain configuration
  try {
    const domains = await prisma.domain.findMany();

    if (domains.length === 6) {
      console.log('Testing: 领域配置存在(6个)... ✅ PASSED');
      passed++;
    } else {
      console.log(`Testing: 领域配置存在(6个)... ❌ FAILED (实际${domains.length}个)`);
      failed++;
    }
  } catch (e) {
    console.log('Testing: 领域配置存在(6个)... ❌ FAILED (异常)');
    failed++;
  }

  console.log('');
  console.log('测试汇总');
  console.log('━'.repeat(80));
  console.log(`✅ 通过: ${passed}`);
  console.log(`❌ 失败: ${failed}`);
  console.log(`总计: ${passed + failed}`);

  await prisma.$disconnect();

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => {
  console.error('测试执行失败:', e);
  process.exit(1);
});
