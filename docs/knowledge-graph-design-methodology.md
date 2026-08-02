# 知识图谱设计方法论
# 市场数据驱动的领域知识图谱构建指南

## 一、设计原则

### 1.1 核心原则
- **市场可投资性**：每个节点必须能映射到可交易的市场数据（指数/ETF/板块）
- **层级合理性**：遵循"指数→板块→细分→个股"的层级逻辑
- **数据可得性**：节点对应的市场数据必须可以从数据源获取
- **认知一致性**：图谱结构应与市场主流认知和研报框架一致

### 1.2 设计约束
- 最多4层：L0(指数) → L1(一级板块) → L2(细分领域) → L3(个股/技术)
- 每个节点必须有明确的投资标的（指数代码或ETF代码）
- 避免过度细分导致市场数据缺失

## 二、构建流程

### 2.1 第一步：确定可用市场数据

```sql
-- 查询当前可用的指数数据
SELECT DISTINCT code, name FROM IndexDaily;

-- 查询当前可用的ETF数据
SELECT DISTINCT ticker, name FROM ETFDaily;

-- 查询当前可用的板块资金流向
SELECT DISTINCT sector FROM SectorCapitalFlow;
```

**输出清单**：
- 中证人工智能主题指数 (930713)
- 中证全指半导体指数 (931865)
- 中证全指通信设备指数 (931160)
- AI ETF (515070)
- 半导体ETF (512480)
- 通信ETF (515880)

### 2.2 第二步：研究行业框架

参考来源：
1. **券商研报**：查看头部券商对该领域的分类框架
2. **行业协会**：行业标准分类
3. **指数公司**：中证指数、Wind行业分类
4. **ETF招募说明书**：了解ETF覆盖范围

**AI算力硬件领域示例**：
- 参考中信证券《AI算力产业链深度报告》
- 参考中证指数公司AI主题指数编制方案
- 参考515070 AI ETF的持仓结构

### 2.3 第三步：构建图谱骨架

#### L0 层（指数层）
```typescript
{
  name: "AI算力硬件",
  type: "domain_index",
  level: 0,
  metadata: {
    relatedIndex: "930713",  // 中证人工智能主题指数
    trackingETFs: [
      { ticker: "515070", name: "AI ETF" },
      { ticker: "512480", name: "半导体ETF" }
    ],
    industryChain: "full",
    investmentTheme: "AI基础设施建设"
  }
}
```

#### L1 层（一级板块）
基于产业链位置划分：
- **上游**：芯片设计与制造
- **中游**：算力基础设施
- **下游**：网络互联

每个L1节点必须映射到指数或ETF：
```typescript
{
  name: "芯片设计",
  type: "sector_l1",
  level: 1,
  parentId: "ai_hardware_root",
  metadata: {
    relatedIndex: "931865",  // 半导体指数
    trackingETFs: [
      { ticker: "512480", name: "半导体ETF" },
      { ticker: "159995", name: "芯片ETF" }
    ],
    industryChain: "upstream",
    capitalFlowSector: "芯片"  // 映射到资金流向表
  }
}
```

#### L2 层（细分领域）
基于技术路线或应用场景细分：

```typescript
// 芯片设计 → GPU/AI芯片
{
  name: "GPU/AI芯片",
  type: "subsector_l2",
  level: 2,
  parentId: "chip_design",
  metadata: {
    relatedIndex: "931865",  // 继承父节点
    trackingETFs: [{ ticker: "512480", name: "半导体ETF" }],
    keyDrivers: ["AI训练需求", "推理加速", "GPU供应"],
    keyPlayers: ["NVIDIA", "AMD", "华为", "寒武纪"],
    technologyNode: "先进制程",
    investmentLogic: "AI算力需求爆发，GPU供不应求"
  }
}

// 芯片设计 → HBM高带宽内存
{
  name: "HBM高带宽内存",
  type: "subsector_l2",
  level: 2,
  parentId: "chip_design",
  metadata: {
    relatedIndex: "931865",
    trackingETFs: [{ ticker: "512480", name: "半导体ETF" }],
    keyDrivers: ["GPU带宽瓶颈", "HBM3放量", "供应紧张"],
    keyPlayers: ["SK海力士", "美光", "三星"],
    supplyTightness: "tight",
    investmentLogic: "GPU性能提升依赖HBM，供应链卡脖子"
  }
}
```

### 2.4 第四步：验证市场数据覆盖

运行验证脚本：
```bash
npx tsx scripts/validate-graph-market-data.ts
```

检查清单：
- [ ] 每个L0节点有relatedIndex
- [ ] 每个L1节点有relatedIndex或trackingETFs
- [ ] 每个L2节点继承父节点的市场数据映射
- [ ] capitalFlowSector映射到SectorCapitalFlow表
- [ ] 所有指数代码在IndexDaily表中有数据
- [ ] 所有ETF代码在ETFDaily表中有数据

### 2.5 第五步：添加投资逻辑元数据

每个节点应包含：
```typescript
metadata: {
  // 市场数据映射
  relatedIndex: string,
  trackingETFs: Array<{ticker, name}>,
  capitalFlowSector?: string,
  
  // 投资逻辑
  keyDrivers: string[],        // 核心驱动因素
  keyPlayers: string[],         // 主要玩家
  investmentLogic: string,      // 投资逻辑
  riskFactors: string[],        // 风险因素
  
  // 产业链定位
  industryChain: "upstream" | "midstream" | "downstream" | "supporting",
  
  // 市场特征
  cyclicality?: "high" | "medium" | "low",  // 周期性
  volatility?: "high" | "medium" | "low",   // 波动性
  
  // 技术特征（可选）
  technologyNode?: string,
  emergingTech?: string,
  supplyTightness?: "tight" | "normal" | "loose"
}
```

## 三、AI算力硬件领域重构方案

### 3.1 当前问题诊断

当前图谱存在的问题：
1. ❌ 层级过深（L0→L1→L2→L3），部分节点无市场数据
2. ❌ 分类维度不统一（产业链 vs 技术路线混用）
3. ❌ 部分节点缺少指数/ETF映射
4. ❌ 与主流研报框架不一致

### 3.2 重构后的结构

```
AI算力硬件 (L0) [930713 中证AI指数]
├─ 芯片设计 (L1) [931865 半导体指数]
│  ├─ GPU/AI芯片 (L2)
│  ├─ HBM高带宽内存 (L2)
│  ├─ 专用AI芯片(ASIC) (L2)
│  └─ 先进封装 (L2)
│
├─ 算力基础设施 (L1) [930713 AI指数]
│  ├─ AI服务器 (L2)
│  ├─ 液冷散热 (L2)
│  ├─ 服务器电源 (L2)
│  └─ 数据中心 (L2)
│
└─ 网络互联 (L1) [931160 通信设备指数]
   ├─ 光模块 (L2)
   ├─ CPO共封装光学 (L2)
   ├─ 高速PCB (L2)
   └─ 交换机/路由器 (L2)
```

### 3.3 节点定义（完整版）

#### L0: AI算力硬件
```typescript
{
  id: "ai_compute_hardware",
  name: "AI算力硬件",
  type: "domain_index",
  level: 0,
  description: "AI算力基础设施产业链，从芯片到服务器到网络的完整硬件生态",
  metadata: {
    relatedIndex: "930713",
    indexName: "中证人工智能主题指数",
    trackingETFs: [
      { ticker: "515070", name: "AI ETF", assets: 50 },
      { ticker: "512480", name: "半导体ETF", assets: 300 }
    ],
    industryChain: "full",
    investmentTheme: "AI基础设施建设周期",
    marketCap: "超万亿",
    growthRate: "30-50% CAGR",
    peakYear: "2025-2027"
  }
}
```

#### L1: 芯片设计
```typescript
{
  id: "chip_design",
  name: "芯片设计",
  type: "sector_l1",
  level: 1,
  parentId: "ai_compute_hardware",
  description: "AI芯片设计与制造，包括GPU、HBM、ASIC等",
  metadata: {
    relatedIndex: "931865",
    indexName: "中证全指半导体指数",
    trackingETFs: [
      { ticker: "512480", name: "半导体ETF", assets: 300 },
      { ticker: "159995", name: "芯片ETF", assets: 250 }
    ],
    capitalFlowSector: "芯片",
    industryChain: "upstream",
    keyDrivers: [
      "AI训练需求爆发",
      "先进制程迭代",
      "国产替代加速"
    ],
    investmentLogic: "AI算力需求推动芯片设计与制造量价齐升，先进制程和HBM供应紧张推高盈利能力",
    riskFactors: [
      "GPU出口管制",
      "先进制程依赖台积电",
      "需求周期波动"
    ],
    cyclicality: "high",
    volatility: "high"
  }
}
```

#### L2: GPU/AI芯片
```typescript
{
  id: "gpu_ai_chip",
  name: "GPU/AI芯片",
  type: "subsector_l2",
  level: 2,
  parentId: "chip_design",
  description: "AI训练和推理专用的高性能计算芯片",
  metadata: {
    relatedIndex: "931865",
    trackingETFs: [{ ticker: "512480", name: "半导体ETF" }],
    keyDrivers: [
      "大模型训练需求",
      "AI推理加速",
      "云厂商资本开支"
    ],
    keyPlayers: [
      { name: "NVIDIA", share: "80%", region: "美国" },
      { name: "AMD", share: "10%", region: "美国" },
      { name: "华为", share: "5%", region: "中国" },
      { name: "寒武纪", share: "2%", region: "中国" }
    ],
    investmentLogic: "NVIDIA H100/H200供不应求，国产GPU在出口管制下迎来替代机遇",
    supplyStatus: "tight",
    leadTime: "6-12个月",
    priceTrend: "持续涨价",
    technologyNode: "5nm/3nm",
    emergingTech: "Chiplet架构",
    riskFactors: [
      "出口管制升级",
      "需求见顶风险",
      "技术代差"
    ]
  }
}
```

#### L2: HBM高带宽内存
```typescript
{
  id: "hbm_memory",
  name: "HBM高带宽内存",
  type: "subsector_l2",
  level: 2,
  parentId: "chip_design",
  description: "GPU/AI芯片配套的高带宽内存",
  metadata: {
    relatedIndex: "931865",
    trackingETFs: [{ ticker: "512480", name: "半导体ETF" }],
    keyDrivers: [
      "GPU性能瓶颈在内存带宽",
      "HBM3代替HBM2e",
      "单卡HBM用量提升"
    ],
    keyPlayers: [
      { name: "SK海力士", share: "50%", region: "韩国" },
      { name: "美光", share: "30%", region: "美国" },
      { name: "三星", share: "20%", region: "韩国" }
    ],
    investmentLogic: "HBM是GPU算力提升的关键，供应紧张+ASP提升，存储芯片厂盈利显著改善",
    supplyStatus: "tight",
    supplyTightnessDuration: "2024-2026",
    pricePremium: "HBM价格是DDR5的5-8倍",
    technologyNode: "HBM3/HBM3E",
    capacityRoadmap: "24GB → 36GB → 48GB per stack",
    riskFactors: [
      "产能释放导致供需逆转",
      "AI需求不及预期",
      "技术路线变化"
    ]
  }
}
```

### 3.4 完整节点清单

**L1节点（3个）**：
1. 芯片设计 [931865]
2. 算力基础设施 [930713]
3. 网络互联 [931160]

**L2节点（12个）**：

芯片设计（4个）：
- GPU/AI芯片
- HBM高带宽内存
- 专用AI芯片(ASIC)
- 先进封装

算力基础设施（4个）：
- AI服务器
- 液冷散热
- 服务器电源
- 数据中心

网络互联（4个）：
- 光模块
- CPO共封装光学
- 高速PCB
- 交换机/路由器

## 四、方法论总结

### 4.1 设计检查清单

**市场数据覆盖**：
- [ ] L0节点有明确的指数映射
- [ ] L1节点有指数或ETF映射
- [ ] L2节点继承父节点映射或有独立映射
- [ ] 板块节点映射到资金流向数据

**结构合理性**：
- [ ] 层级不超过4层
- [ ] 每层节点数量合理（L1: 3-5个，L2: 每个L1下3-6个）
- [ ] 分类维度一致（产业链/技术路线/应用场景选一个）
- [ ] 节点命名与市场认知一致

**投资可行性**：
- [ ] 每个节点有清晰的投资逻辑
- [ ] 关键驱动因素明确
- [ ] 风险因素识别
- [ ] 有代表性公司或标的

**数据可维护性**：
- [ ] 市场数据可以定期更新
- [ ] 新闻可以自动关联到节点
- [ ] 节点评分可以计算
- [ ] 传导路径可以分析

### 4.2 复制到其他领域的步骤

1. **选择领域** → 确定投资主题（如：新能源车、创新药、消费电子）

2. **收集数据** → 查询可用指数、ETF、板块资金流向

3. **研究框架** → 阅读3-5篇头部券商深度报告，提取分类框架

4. **绘制产业链** → 明确上中下游及支撑环节

5. **构建骨架** → L0(主题指数) → L1(产业链环节) → L2(细分领域)

6. **映射数据** → 为每个节点分配relatedIndex和trackingETFs

7. **验证覆盖** → 运行验证脚本，确保市场数据完整

8. **补充元数据** → 添加keyDrivers、investmentLogic、riskFactors

9. **测试增强** → 验证市场数据增强服务正常工作

10. **持续优化** → 根据市场变化和新闻热点调整结构

### 4.3 工具脚本

#### 生成图谱骨架脚本
```typescript
// scripts/generate-graph-skeleton.ts
// 根据领域和指数数据自动生成图谱骨架
```

#### 验证市场数据覆盖脚本
```typescript
// scripts/validate-graph-market-data.ts
// 检查每个节点的市场数据映射是否有效
```

#### 批量更新节点元数据脚本
```typescript
// scripts/batch-update-node-metadata.ts
// 批量更新节点的投资逻辑和关键驱动因素
```

## 五、实施计划

### 5.1 重构AI算力硬件图谱

**Phase 1: 清理现有节点**（1小时）
- 删除过时或无市场数据的节点
- 保留有价值的元数据

**Phase 2: 创建新图谱结构**（2小时）
- 按照方法论创建L0/L1/L2节点
- 填充metadata和投资逻辑

**Phase 3: 验证和测试**（1小时）
- 运行验证脚本
- 测试市场数据增强
- 测试前端展示

**Phase 4: 文档和培训**（1小时）
- 更新图谱设计文档
- 编写使用指南

### 5.2 扩展到其他领域

优先级排序：
1. **新能源汽车**（有成熟的指数和ETF）
2. **创新药/医疗器械**（医药指数体系完善）
3. **消费电子**（苹果产业链、华为产业链）
4. **光伏/风电**（清洁能源指数）

每个领域预计2-3小时完成图谱构建。

## 六、预期效果

采用此方法论后：

✅ **投资决策价值提升**
- 每个节点都有可交易标的
- 市场数据实时更新
- 投资信号更明确

✅ **图谱可维护性增强**
- 结构清晰易理解
- 市场数据自动关联
- 新闻热点快速定位

✅ **用户体验改善**
- 点击节点看到完整市场数据
- 投资逻辑清晰
- 风险因素明确

✅ **可扩展性强**
- 方法论可复制到任何领域
- 工具脚本自动化构建
- 持续优化迭代

