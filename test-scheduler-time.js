#!/usr/bin/env node

/**
 * 端到端时间显示验证脚本
 * 模拟前端时间格式化逻辑，验证调度器时间显示
 */

// 模拟 formatBeijingTime 函数
function formatBeijingTime(dateString, format = 'full') {
  const date = new Date(dateString);

  const options = {
    timeZone: 'Asia/Shanghai',
  };

  switch (format) {
    case 'full':
      return date.toLocaleString('zh-CN', {
        ...options,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });

    case 'short':
      return date.toLocaleString('zh-CN', {
        ...options,
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

    default:
      return date.toLocaleString('zh-CN', options);
  }
}

const https = require('http');

// 获取数据源列表
https.get('http://localhost:3000/api/datasources', (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      const sources = json.data || [];

      console.log('=== 调度器时间显示验证（端到端） ===\n');

      // 测试几个关键数据源
      const testSources = ['ds_newsnow_wallstreet', 'ds_xueqiu', 'ds_newsnow_36kr'];

      testSources.forEach(sourceId => {
        const source = sources.find(s => s.id === sourceId);
        if (!source) {
          console.log(`⚠️  未找到数据源: ${sourceId}\n`);
          return;
        }

        console.log(`📊 ${source.name}`);

        if (source.scheduler) {
          const scheduler = source.scheduler;

          if (scheduler.lastRunAt) {
            const formatted = formatBeijingTime(scheduler.lastRunAt, 'full');
            console.log(`   上次运行: ${formatted}`);
          }

          if (scheduler.nextRunAt) {
            const formatted = formatBeijingTime(scheduler.nextRunAt, 'full');
            console.log(`   下次运行: ${formatted}`);
          }

          // 验证时间间隔是否合理
          if (scheduler.lastRunAt && scheduler.nextRunAt) {
            const lastRun = new Date(scheduler.lastRunAt);
            const nextRun = new Date(scheduler.nextRunAt);
            const intervalMinutes = (nextRun - lastRun) / 1000 / 60;

            const expectedInterval = scheduler.scheduleConfig?.intervalMinutes || 30;
            const isCorrect = Math.abs(intervalMinutes - expectedInterval) < 1;

            console.log(`   间隔: ${intervalMinutes.toFixed(0)}分钟 ${isCorrect ? '✅' : '❌ (预期: ' + expectedInterval + '分钟)'}`);
          }
        } else {
          console.log('   ⚠️  未配置调度器');
        }

        console.log();
      });

      console.log('✅ 验证完成！');
      console.log('\n💡 说明：');
      console.log('  - 时间应该以北京时间显示（CST = UTC+8）');
      console.log('  - 上次运行和下次运行的时间间隔应该等于调度间隔');
      console.log('  - 所有时间应该是合理的当前时间范围内');

    } catch (error) {
      console.error('❌ 解析失败:', error.message);
    }
  });

}).on('error', (err) => {
  console.error('❌ 请求失败:', err.message);
});
