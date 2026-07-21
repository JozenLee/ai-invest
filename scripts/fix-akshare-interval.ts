import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || 'file:./prisma/dev.db',
});

const prisma = new PrismaClient({ adapter });

/**
 * 修复"东方财富"数据源的调度器配置
 * 将45分钟间隔统一调整为60分钟
 */
async function fixAkshareInterval() {
  console.log('开始修复AKShare数据源调度器配置...\n');

  // 查找"东方财富"数据源
  const dataSource = await prisma.dataSource.findFirst({
    where: {
      name: '东方财富',
      provider: 'akshare'
    },
    include: {
      schedulerJobs: true
    }
  });

  if (!dataSource) {
    console.log('❌ 未找到"东方财富"数据源');
    return;
  }

  console.log(`📋 找到数据源: ${dataSource.name}`);
  console.log(`   ID: ${dataSource.id}`);
  console.log(`   Provider: ${dataSource.provider}`);

  if (dataSource.schedulerJobs.length === 0) {
    console.log('❌ 该数据源没有关联的调度器任务');
    return;
  }

  const job = dataSource.schedulerJobs[0];
  const currentConfig = JSON.parse(job.scheduleConfig);

  console.log(`\n当前配置:`);
  console.log(`   间隔: ${currentConfig.intervalMinutes} 分钟`);
  console.log(`   启用: ${job.isEnabled}`);

  if (currentConfig.intervalMinutes === 60) {
    console.log('\n✅ 配置已经正确，无需修改');
    return;
  }

  // 更新配置
  const newConfig = {
    ...currentConfig,
    intervalMinutes: 60
  };

  await prisma.schedulerJob.update({
    where: { id: job.id },
    data: {
      scheduleConfig: JSON.stringify(newConfig)
    }
  });

  console.log(`\n✅ 已更新配置:`);
  console.log(`   间隔: 45分钟 → 60分钟`);
  console.log(`\n修复完成！`);

  await prisma.$disconnect();
}

fixAkshareInterval()
  .catch((e) => {
    console.error('❌ 修复失败:', e);
    process.exit(1);
  });
