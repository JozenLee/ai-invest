/**
 * ETF持仓数据种子脚本
 * 为3个AI硬件产业链ETF生成模拟持仓数据
 */

import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || 'file:./prisma/dev.db',
});

const prisma = new PrismaClient({ adapter });

// 股票池 (来自 Task 9)
const stockPool = [
  // AI芯片
  { code: '688256', name: '寒武纪' },
  { code: '688041', name: '海光信息' },

  // 晶圆代工
  { code: '688981', name: '中芯国际' },

  // 封装测试
  { code: '600584', name: '长电科技' },
  { code: '002185', name: '华天科技' },
  { code: '002156', name: '通富微电' },

  // 设备
  { code: '688012', name: '北方华创' },
  { code: '688012', name: '中微公司' },
  { code: '688072', name: '拓荆科技' },

  // 材料
  { code: '688126', name: '沪硅产业' },
  { code: '300236', name: '上海新阳' },

  // 服务器
  { code: '000977', name: '浪潮信息' },
  { code: '603019', name: '中科曙光' },

  // 光模块
  { code: '300308', name: '中际旭创' },
  { code: '300502', name: '新易盛' },
  { code: '300394', name: '天孚通信' },

  // 数据中心
  { code: '603881', name: '数据港' },

  // AI应用
  { code: '002230', name: '科大讯飞' },
  { code: '688111', name: '金山办公' },
];

// 生成权重分布 (Top 1: 8-10%, Top 2-3: 6-8%, Top 4-10: 3-6%)
function generateWeights(count: number): number[] {
  const weights: number[] = [];

  if (count >= 1) {
    weights.push(8 + Math.random() * 2); // 8-10%
  }
  if (count >= 2) {
    weights.push(6 + Math.random() * 2); // 6-8%
  }
  if (count >= 3) {
    weights.push(6 + Math.random() * 2); // 6-8%
  }
  for (let i = 3; i < count; i++) {
    weights.push(3 + Math.random() * 3); // 3-6%
  }

  // 归一化到总权重 60-70%
  const currentTotal = weights.reduce((sum, w) => sum + w, 0);
  const targetTotal = 60 + Math.random() * 10; // 60-70%
  const scale = targetTotal / currentTotal;

  return weights.map(w => parseFloat((w * scale).toFixed(2)));
}

// ETF配置
const etfConfigs = [
  {
    code: '512480',
    name: '半导体ETF',
    // 偏重设备、材料、代工
    preferredTypes: ['设备', '材料', '晶圆代工', '封装测试', 'AI芯片'],
  },
  {
    code: '515070',
    name: 'AI ETF',
    // 偏重AI芯片、服务器、AI应用
    preferredTypes: ['AI芯片', '服务器', 'AI应用', '光模块', '数据中心'],
  },
  {
    code: '159995',
    name: '芯片ETF',
    // 偏重芯片全产业链
    preferredTypes: ['AI芯片', '晶圆代工', '封装测试', '设备', '材料'],
  },
];

// 根据ETF类型选择合适的股票
function selectStocksForETF(etfCode: string): typeof stockPool {
  const config = etfConfigs.find(e => e.code === etfCode);
  if (!config) return [];

  // 随机打乱股票池
  const shuffled = [...stockPool].sort(() => Math.random() - 0.5);

  // 根据ETF类型筛选，这里简化为随机选择10只
  // 实际应该根据 preferredTypes 进行加权选择
  return shuffled.slice(0, 10);
}

async function seedETFHoldings() {
  console.log('开始生成ETF持仓数据...\n');

  // 清空现有数据
  await prisma.eTFHolding.deleteMany({});
  console.log('已清空现有持仓数据');

  for (const etfConfig of etfConfigs) {
    console.log(`\n生成 ${etfConfig.name} (${etfConfig.code}) 持仓...`);

    const selectedStocks = selectStocksForETF(etfConfig.code);
    const weights = generateWeights(selectedStocks.length);

    let totalWeight = 0;

    for (let i = 0; i < selectedStocks.length; i++) {
      const stock = selectedStocks[i];
      const weight = weights[i];
      totalWeight += weight;

      await prisma.eTFHolding.create({
        data: {
          etfCode: etfConfig.code,
          stockCode: stock.code,
          stockName: stock.name,
          weight: weight,
          // shares 和 marketValue 可选，这里不填
        },
      });

      console.log(`  ${i + 1}. ${stock.name} (${stock.code}): ${weight.toFixed(2)}%`);
    }

    console.log(`  总权重: ${totalWeight.toFixed(2)}%`);
  }

  console.log('\n✓ ETF持仓数据生成完成');
}

async function main() {
  try {
    await seedETFHoldings();
  } catch (error) {
    console.error('生成持仓数据失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();
