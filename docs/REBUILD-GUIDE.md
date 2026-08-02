# 九个领域知识图谱重构 - 快速执行指南

## 📋 概述

基于`knowledge-graph-design-methodology.md`方法论，已完成9个领域的知识图谱重构定义。

## 🎯 重构的九个领域

1. ✅ **新能源车** - 整车、电池、智能驾驶 (15个节点)
2. ✅ **电池储能** - 储能系统、电池、变流器 (13个节点)
3. ✅ **光伏产业** - 上游材料、中游制造、下游应用 (14个节点)
4. ✅ **创新药** - 药物研发、生产制造、CXO服务 (13个节点)
5. ✅ **医疗器械** - 医疗设备、高值耗材、体外诊断 (13个节点)
6. ✅ **机器人** - 工业、服务、核心零部件 (13个节点)
7. ✅ **消费电子** - 手机、可穿戴、核心元器件 (13个节点)
8. ✅ **数字经济** - 云计算、企业软件、网络安全 (13个节点)
9. ✅ **先进材料** - 电子材料、能源材料、结构材料 (13个节点)

**总计**: 9个L0根节点 + 27个L1板块 + 84个L2细分 = **120个节点**

## 🚀 执行步骤

### 方法一：分批执行（推荐）

```bash
cd /Users/jozen.lee/ai-softwares/ai-invest

# 步骤1: 执行前6个领域
npx tsx scripts/rebuild-all-domains-graph.ts

# 步骤2: 执行后3个领域
npx tsx scripts/rebuild-remaining-domains.ts

# 步骤3: 验证数据
npx tsx scripts/test-graph-market-data.ts
```

### 方法二：全部一起执行

需要先修改`rebuild-all-domains-graph.ts`，导入后三个领域。

## 📁 文件结构

```
scripts/
├── rebuild-all-domains-graph.ts        # 前6个领域重构脚本
├── rebuild-remaining-domains.ts        # 后3个领域重构脚本
├── domains/
│   ├── consumer-electronics.ts         # 消费电子定义
│   ├── digital-economy.ts              # 数字经济定义
│   └── advanced-materials.ts           # 先进材料定义
└── test-graph-market-data.ts           # 市场数据验证

docs/
└── nine-domains-rebuild-summary.md     # 详细总结文档
```

## ✨ 设计亮点

### 1. 严格遵循方法论
- ✅ 每个节点都有市场数据映射（指数/ETF）
- ✅ 层级结构清晰（L0→L1→L2，最多3层）
- ✅ 投资逻辑完整（keyDrivers + investmentLogic + riskFactors）

### 2. 元数据丰富
每个节点包含：
- `relatedIndex`: 对应指数代码
- `trackingETFs`: 跟踪ETF列表
- `capitalFlowSector`: 资金流向板块映射
- `industryChain`: 产业链定位
- `keyDrivers`: 核心驱动因素
- `investmentLogic`: 投资逻辑
- `riskFactors`: 风险因素
- `keyPlayers`: 主要玩家（部分L2节点）

### 3. 产业链视角
每个领域按产业链划分：
- **upstream**: 上游（原材料、核心技术）
- **midstream**: 中游（制造、加工）
- **downstream**: 下游（应用、终端）
- **supporting**: 支撑环节（服务、配套）

## 🔍 示例：新能源车领域

```typescript
{
  root: {
    id: 'new_energy_vehicle',
    name: '新能源车',
    metadata: {
      relatedIndex: '399976',  // 中证新能源汽车指数
      trackingETFs: [
        { ticker: '515030', name: '新能源车ETF' }
      ],
      investmentTheme: '电动化+智能化双重驱动'
    }
  },
  l1: [
    {
      id: 'nev_vehicle',
      name: '整车制造',
      metadata: {
        industryChain: 'downstream',
        keyDrivers: ['政策补贴退坡后市场化', '智能化差异化竞争', '出口增长']
      }
    },
    // ... 更多L1节点
  ],
  l2: [
    {
      id: 'nev_bev',
      name: '纯电动车',
      metadata: {
        keyPlayers: [
          { name: '比亚迪', share: '35%' },
          { name: '特斯拉', share: '20%' }
        ],
        investmentLogic: 'BEV是主流技术路线，头部车企份额集中'
      }
    },
    // ... 更多L2节点
  ]
}
```

## ⚠️ 注意事项

1. **执行前备份数据库**
   ```bash
   cp prisma/dev.db prisma/dev.db.backup
   ```

2. **检查是否已存在**
   - 脚本会自动检查节点是否存在
   - 已存在的节点会跳过，不会重复创建

3. **数据库连接**
   - 确保`prisma/dev.db`可访问
   - 确保数据库schema已更新

4. **指数/ETF数据**
   - 部分指数代码可能需要在IndexDaily表中补充数据
   - 验证脚本会检查数据覆盖情况

## 📊 预期结果

执行成功后：
- ✅ 数据库中新增120个GraphNode记录
- ✅ 每个节点的metadata字段包含完整投资信息
- ✅ 节点之间的父子关系正确建立
- ✅ 前端图谱页面可以正常展示

## 🔧 验证命令

```bash
# 查看创建的节点数量
npx tsx -e "
import prisma from './src/lib/db/prisma';
const domains = ['new_energy_vehicle', 'battery_storage', 'photovoltaic', 
                 'innovative_drug', 'medical_device', 'robotics',
                 'consumer_electronics', 'digital_economy', 'advanced_materials'];
for (const d of domains) {
  const count = await prisma.graphNode.count({ where: { id: { startsWith: d } } });
  console.log(\`\${d}: \${count} 个节点\`);
}
await prisma.\$disconnect();
"

# 启动开发服务器查看效果
npm run dev
# 访问 http://localhost:3000/graph/explore
```

## 📚 参考资料

- 方法论文档: `docs/knowledge-graph-design-methodology.md`
- AI算力重构示例: `scripts/rebuild-ai-compute-graph.ts`
- 详细总结: `docs/nine-domains-rebuild-summary.md`
- ETF领域配置: `src/config/etf-domains.ts`

## 🎉 下一步

1. ✅ 执行脚本创建节点
2. 🔄 运行验证脚本检查数据
3. 🔗 添加节点之间的关系边
4. 📈 关联代表性个股
5. 🎨 前端页面优化展示

---

**创建时间**: 2026-08-01  
**状态**: ✅ 定义完成，可立即执行
