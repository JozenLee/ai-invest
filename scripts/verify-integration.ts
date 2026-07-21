import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || 'file:./prisma/dev.db',
});

const prisma = new PrismaClient({ adapter });

async function verify() {
  console.log('\n=== 完整验证报告 ===\n');

  // 1. 验证数据源和调度器关联
  const dataSources = await prisma.dataSource.findMany({
    include: {
      schedulerJobs: true,
      _count: {
        select: { articles: true }
      }
    },
    orderBy: { provider: 'asc' }
  });

  console.log('1. 数据源与调度器关联检查');
  console.log('━'.repeat(80));

  const grouped: Record<string, typeof dataSources> = {};
  dataSources.forEach(ds => {
    if (!grouped[ds.provider]) grouped[ds.provider] = [];
    grouped[ds.provider].push(ds);
  });

  Object.entries(grouped).forEach(([provider, sources]) => {
    console.log(`\n📦 Provider: ${provider.toUpperCase()}`);
    sources.forEach(ds => {
      const hasScheduler = ds.schedulerJobs.length > 0;
      const icon = hasScheduler ? '✅' : '❌';
      let info = `  ${icon} ${ds.name}`;

      if (hasScheduler) {
        const job = ds.schedulerJobs[0];
        const config = JSON.parse(job.scheduleConfig);
        info += ` → ${config.intervalMinutes}分钟`;

        // 检查领域筛选配置
        if (config.domainFilter) {
          info += ` [领域筛选: ${config.domainFilter.enabled ? '启用' : '禁用'}]`;
        }
      }

      info += ` (文章数: ${ds._count.articles})`;
      console.log(info);
    });
  });

  // 2. 验证Domain表
  const domains = await prisma.domain.findMany();
  console.log(`\n\n2. 领域配置检查`);
  console.log('━'.repeat(80));
  console.log(`总计: ${domains.length} 个领域\n`);
  domains.forEach(d => {
    console.log(`  • ${d.name} (code: ${d.code})`);
    console.log(`    ${d.description}`);
  });

  // 3. 验证调度器配置格式
  console.log(`\n\n3. 调度器配置格式验证`);
  console.log('━'.repeat(80));

  const schedulers = await prisma.schedulerJob.findMany({
    include: { source: true }
  });

  let validCount = 0;
  let invalidCount = 0;
  const providerStats: Record<string, { count: number; intervals: number[] }> = {};

  schedulers.forEach(job => {
    try {
      const config = JSON.parse(job.scheduleConfig);
      const provider = job.source.provider;

      if (!providerStats[provider]) {
        providerStats[provider] = { count: 0, intervals: [] };
      }

      providerStats[provider].count++;
      if (config.intervalMinutes) {
        providerStats[provider].intervals.push(config.intervalMinutes);
      }

      if (config.intervalMinutes && typeof config.intervalMinutes === 'number') {
        validCount++;
      } else {
        invalidCount++;
        console.log(`  ⚠️  ${job.source.name}: 配置格式异常`);
      }
    } catch (e) {
      invalidCount++;
      console.log(`  ❌ ${job.source.name}: JSON解析失败`);
    }
  });

  console.log(`\n配置有效性:`);
  console.log(`  ✅ 有效: ${validCount}`);
  console.log(`  ❌ 无效: ${invalidCount}`);

  console.log(`\n按Provider统计:`);
  Object.entries(providerStats).forEach(([provider, stats]) => {
    const avgInterval = stats.intervals.length > 0
      ? Math.round(stats.intervals.reduce((a, b) => a + b, 0) / stats.intervals.length)
      : 0;
    console.log(`  • ${provider}: ${stats.count}个调度器, 平均间隔 ${avgInterval}分钟`);
  });

  // 4. 验证关键字段
  console.log(`\n\n4. SchedulerJob 关键字段检查`);
  console.log('━'.repeat(80));

  const fieldStats = {
    hasSourceId: 0,
    hasScheduleType: 0,
    hasScheduleConfig: 0,
    isEnabled: 0,
    hasLastRunAt: 0,
    hasNextRunAt: 0
  };

  schedulers.forEach(job => {
    if (job.sourceId) fieldStats.hasSourceId++;
    if (job.scheduleType) fieldStats.hasScheduleType++;
    if (job.scheduleConfig) fieldStats.hasScheduleConfig++;
    if (job.isEnabled) fieldStats.isEnabled++;
    if (job.lastRunAt) fieldStats.hasLastRunAt++;
    if (job.nextRunAt) fieldStats.hasNextRunAt++;
  });

  console.log(`总调度器数: ${schedulers.length}\n`);
  console.log(`  sourceId:       ${fieldStats.hasSourceId}/${schedulers.length}`);
  console.log(`  scheduleType:   ${fieldStats.hasScheduleType}/${schedulers.length}`);
  console.log(`  scheduleConfig: ${fieldStats.hasScheduleConfig}/${schedulers.length}`);
  console.log(`  isEnabled:      ${fieldStats.isEnabled}/${schedulers.length}`);
  console.log(`  lastRunAt:      ${fieldStats.hasLastRunAt}/${schedulers.length} (已执行过)`);
  console.log(`  nextRunAt:      ${fieldStats.hasNextRunAt}/${schedulers.length} (已调度)`);

  // 5. 检查配置符合性
  console.log(`\n\n5. Provider配置符合性检查`);
  console.log('━'.repeat(80));

  const newsNowSchedulers = schedulers.filter(j => j.source.provider === 'newsnow');
  const akshareSchedulers = schedulers.filter(j => j.source.provider === 'akshare');

  let newsNowCompliant = 0;
  newsNowSchedulers.forEach(job => {
    const config = JSON.parse(job.scheduleConfig);
    if (config.intervalMinutes === 30) {
      newsNowCompliant++;
    }
  });

  let akshareCompliant = 0;
  akshareSchedulers.forEach(job => {
    const config = JSON.parse(job.scheduleConfig);
    if (config.intervalMinutes === 60) {
      akshareCompliant++;
    }
  });

  console.log(`\nNewsNow数据源: ${newsNowCompliant}/${newsNowSchedulers.length} 符合30分钟标准`);
  console.log(`AKShare数据源: ${akshareCompliant}/${akshareSchedulers.length} 符合60分钟标准`);

  if (newsNowCompliant === newsNowSchedulers.length && akshareCompliant === akshareSchedulers.length) {
    console.log('\n✅ 所有配置符合要求！');
  } else {
    console.log('\n⚠️  部分配置不符合标准');
  }

  await prisma.$disconnect();
}

verify()
  .catch((e) => {
    console.error('验证失败:', e);
    process.exit(1);
  });
