# AI投资分析系统 — 产品需求文档 (PRD)

> 版本：v1.1 MVP | 聚焦领域：AI硬件产业链 | 投资标的：指数ETF
> 作者：AI Investment System | 日期：2026-07-12
> 定位：面向个人投资者的智能投研分析平台

---

## 目录

1. [系统总览](#1-系统总览)
2. [第一层：基础数据层](#2-第一层基础数据层)
3. [第二层：事件驱动层](#3-第二层事件驱动层)
4. [第三层：知识图谱层](#4-第三层知识图谱层)
5. [第四层：决策层](#5-第四层决策层)
6. [Web UI 设计](#6-web-ui-设计)
7. [MVP 范围定义](#7-mvp-范围定义)
8. [技术架构](#8-技术架构)
9. [数据模型](#9-数据模型)
10. [API 设计](#10-api-设计)
11. [里程碑规划](#11-里程碑规划)

---

## 1. 系统总览

### 1.1 核心理念

传统投研依赖分析师人工阅读财报、跟踪新闻、梳理产业链关系，效率低且容易遗漏关键信号。本系统将这一过程**结构化、自动化、可量化**，通过四层架构实现从"数据→信息→知识→决策"的完整投研闭环。

```
┌─────────────────────────────────────────────────────────┐
│                      决策层 (Decision)                    │
│   经典金融模型 + AI大模型 + 用户画像 → ETF配置建议          │
├─────────────────────────────────────────────────────────┤
│                   知识图谱层 (Knowledge Graph)             │
│   产业链关联 + 因果逻辑 + 传导路径 → 结构化认知             │
├─────────────────────────────────────────────────────────┤
│                   事件驱动层 (Event-Driven)                │
│   多源资讯采集 + NLP摘要 + 情感分析 → 领域趋势              │
├─────────────────────────────────────────────────────────┤
│                   基础数据层 (Base Data)                   │
│   行情数据 + 财务数据 + 技术指标 + 资金流向 → 量化信号       │
└─────────────────────────────────────────────────────────┘
```

### 1.2 目标用户

| 用户类型 | 需求 | 核心场景 |
|---------|------|---------|
| 个人投资者 | 快速了解AI硬件产业链全貌 | ETF配置、择时、仓位调整 |
| 研究爱好者 | 深入理解细分领域逻辑 | 产业链研究、趋势预判 |
| 交易者 | 获取实时信号和事件驱动 | ETF轮动、资金跟踪 |

### 1.3 MVP 聚焦

MVP 阶段以 **AI硬件产业链** 作为知识图谱的构建对象，覆盖：
- 上游：芯片设计（GPU/ASIC/存储芯片）、半导体设备、EDA工具
- 中游：服务器/交换机制造、散热/电源模组、PCB/封装、光通信/光模块/CPO
- 下游：云计算/AI推理部署、数据中心运营、终端AI设备
- 横向：AI软件生态、资本支出周期、政策/关税影响

**MVP 投资决策范围**：投资建议**仅针对指数 ETF 基金**，不直接推荐个股。个股分析（尤其是行业龙头）作为产业链研究和传导路径分析的参考依据，最终的买入/卖出/持有建议输出到 ETF 维度。这样做的目的是：
- 降低个股风险，适合个人投资者的风险承受能力
- 利用知识图谱的传导分析来指导板块/行业轮动配置
- 通过 ETF 分散化来捕捉产业链趋势性机会

---

## 2. 第一层：基础数据层

> **目标**：用成熟的金融量化方法，从历史和实时数据中识别资金流向、估值水平和趋势信号。

### 2.1 数据源

| 数据类型 | 覆盖范围 | 更新频率 | 数据源 |
|---------|---------|---------|-------|
| **行情数据** | A股/港股/美股个股、指数、ETF | 实时/日K | Yahoo Finance API / AKShare |
| **财务数据** | 资产负债表、利润表、现金流量表 | 季报 | AKShare / 东方财富数据 |
| **资金流向** | 主力资金、北向资金、融资融券 | 日级 | AKShare |
| **指数数据** | 沪深300、科创50、纳斯达克、费城半导体 | 日级 | Yahoo Finance |
| **宏观数据** | CPI、PMI、利率、汇率、社融 | 月级 | FRED / 国家统计局 |
| **行业数据** | 半体销售、晶圆出货、AI芯片出货量 | 月/季级 | WSTS / 各公司财报 |
| **大盘资金流** | 沪深两市主力/散户资金净流入、板块资金流向排名 | 日级 | AKShare |
| **ETF 数据** | 跟踪指数的 ETF 净值、份额变化、溢折价、持仓 | 日级 | AKShare / Yahoo Finance |
| **指数成分股** | 主要指数成分股及权重 | 季/月级 | AKShare / 中证指数公司 |
| **融资融券明细** | 个股及 ETF 两融数据 | 日级 | AKShare |
| **大宗交易** | ETF 及个股大宗交易记录 | 日级 | AKShare |

### 2.2 技术分析指标体系

从资深分析师角度，技术分析不是简单的画线，而是**多维度信号融合**。系统需实现以下指标体系：

#### 趋势类指标
| 指标 | 计算方式 | 分析用途 |
|------|---------|---------|
| MA (5/10/20/60/120/250日) | 简单/指数移动平均 | 多头/空头排列判断、支撑压力位 |
| MACD (12,26,9) | 指数平滑异同移动平均 | 趋势方向与动能，金叉/死叉信号 |
| DMI (14,14) | 趋向指标 | 趋势强度，ADX>25为强趋势 |
| SAR (0.02,0.2) | 抛物线转向 | 止损/反转点位 |

#### 动量类指标
| 指标 | 计算方式 | 分析用途 |
|------|---------|---------|
| RSI (6/12/24) | 相对强弱指数 | 超买(>70)超卖(<30)判断 |
| KDJ (9,3,3) | 随机指标 | 短期超买超卖，适合震荡市 |
| CCI (14) | 商品通道指数 | 价格偏离程度，极端值反转信号 |
| Williams %R (14) | 威廉指标 | 超买超卖辅助确认 |

#### 成交量类指标
| 指标 | 计算方式 | 分析用途 |
|------|---------|---------|
| OBV | 能量潮 | 量价配合，确认趋势可靠性 |
| VWAP | 成交量加权平均价 | 机构成本线，日内支撑压力 |
| 量比 | 当日成交量/过去N日均量 | 异常放量/缩量判断 |
| 换手率 | 成交量/流通股本 | 活跃度、筹码松动信号 |

#### 资金流向分析
| 维度 | 分析方法 | 核心逻辑 |
|------|---------|---------|
| 主力资金净流入 | 大单(>50万)买卖差额 | 主力动向是趋势延续的关键 |
| 北向资金 | 沪深港通每日净买入 | 外资偏好代表"聪明钱"方向 |
| 融资融券余额 | 两融数据变化趋势 | 杠杆资金方向，融资增=看多 |
| 行业资金轮动 | 各行业板块资金流入排名 | 资金从高位板块流向低位板块 |
| 大宗交易 | 折/溢价率、频率 | 机构调仓信号 |

### 2.3 基本面分析框架

#### 估值指标体系
```
相对估值法：
├── PE (TTM/动态/静态) — 适合盈利稳定的公司
├── PB — 适合重资产行业（半导体制造）
├── PS — 适合高增长但未盈利公司（AI芯片设计）
├── EV/EBITDA — 剔除资本结构差异，适合跨国比较
├── PEG — PE/盈利增速，<1为低估
└── 前瞻PE — 基于分析师一致预期

绝对估值法：
├── DCF (自由现金流折现) — 理论最优，但假设敏感
├── DDM (股利折现) — 适合高分红蓝筹
└── Residual Income — 适合ROE波动大的公司
```

#### 财务健康度评估
```
盈利能力：ROE、ROA、毛利率、净利率、ROIC
成长能力：营收增速、净利润增速、研发投入增速
运营效率：存货周转、应收账款周转、总资产周转
偿债能力：资产负债率、流动比率、利息覆盖倍数
现金流质量：经营现金流/净利润、自由现金流、资本开支比
```

#### 行业特定指标（AI硬件产业链）
```
芯片设计：ASP(平均售价)、出货量、市占率、研发投入/营收
晶圆代工：产能利用率、先进制程占比、资本开支/营收
服务器：出货量同比、ASP趋势、AI服务器占比
数据中心：机柜数量、PUE、上架率、单机柜营收
散热/电源：液冷渗透率、功率密度提升趋势
```

### 2.4 量化信号系统

将上述指标综合为**多因子信号模型**：

```typescript
interface SignalOutput {
  ticker: string;
  timestamp: string;
  signals: {
    trend: {       // 趋势信号
      score: number;     // -100 ~ +100
      direction: 'bullish' | 'bearish' | 'neutral';
      strength: number;  // 0~1, ADX归一化
      details: string;   // "MACD金叉，MA多头排列，ADX=32"
    };
    momentum: {    // 动量信号
      score: number;
      overbought: boolean;
      oversold: boolean;
      divergence: 'bullish' | 'bearish' | 'none'; // RSI背离
    };
    volume: {      // 量能信号
      score: number;
      abnormal: boolean;  // 量比>2 或 <0.5
      trend_confirm: boolean; // 放量上涨/缩量下跌确认
    };
    capital: {     // 资金信号
      mainForce: number;     // 主力净流入(万元)
      northbound: number;    // 北向净买入(万元)
      marginBalance: number; // 融资余额变化
      sectorRotation: string; // 资金轮动方向
    };
    valuation: {   // 估值信号
      pePercentile: number;  // PE在历史中的百分位
      pbPercentile: number;
      rating: 'undervalued' | 'fair' | 'overvalued';
    };
  };
  compositeScore: number; // 综合评分 -100 ~ +100
}
```

### 2.5 宏观资金流动监控体系

> **目标**：系统性监控大盘及各领域资金流动，为 ETF 配置决策提供资金面依据。

#### 2.5.1 监控维度

| 维度 | 监控内容 | 核心逻辑 |
|------|---------|---------|
| **大盘主力资金** | 沪深两市每日主力资金（大单>50万）净流入/流出 | 主力资金方向是市场趋势延续的关键信号 |
| **散户资金** | 散户资金净流入，与主力资金的背离 | 散户与主力背离时往往预示反转 |
| **板块资金轮动** | 一级/二级行业板块资金流入排名及持续天数 | 资金从高位板块流向低位板块，预示轮动方向 |
| **ETF 资金流向** | 各宽基/行业 ETF 份额变化、净申购/赎回、溢折价 | ETF 资金流向反映机构配置意愿 |
| **北向资金** | 沪深港通每日净买入，按行业/个股拆分 | 外资偏好代表"聪明钱"方向 |
| **融资融券** | 两融余额变化趋势 | 杠杆资金方向，融资增=看多 |
| **大宗交易** | 折/溢价率、频率、买卖方向 | 机构调仓信号 |

#### 2.5.2 数据结构

```typescript
interface MacroCapitalFlow {
  date: string;
  market: {
    totalMainNet: number;        // 沪深两市主力净流入（亿元）
    retailNet: number;           // 散户净流入（亿元）
    sentiment: number;           // 资金情绪指数 -100~+100
    turnoverRate: number;        // 全市场换手率
  };
  sectorRanking: {
    sector: string;              // 板块名称
    level: 'L1' | 'L2' | 'sub'; // 行业层级
    mainForceNet: number;        // 主力净流入（万元）
    retailNet: number;           // 散户净流入
    days: number;                // 连续流入/流出天数
    trend: 'inflow' | 'outflow' | 'neutral';
    changePct: number;           // 板块涨跌幅
  }[];
  etfFlow: {
    ticker: string;              // ETF 代码
    name: string;                // ETF 名称
    trackingIndex: string;       // 跟踪指数
    netSubscription: number;     // 净申购份额（万份）
    premiumDiscount: number;     // 溢折价率（%）
    totalAssets: number;         // 总规模（亿元）
    volume: number;              // 成交额（亿元）
    changePct: number;           // 涨跌幅
  }[];
  institutional: {
    northboundNet: number;       // 北向净买入（亿元）
    northboundSectors: { sector: string; net: number }[]; // 北向按行业拆分
    marginBalance: number;       // 融资余额（亿元）
    marginChange: number;        // 融资余额变化（亿元）
    blockTradeCount: number;     // 大宗交易笔数
    blockTradePremium: number;   // 平均溢折价率
  };
}
```

#### 2.5.3 资金信号融合

将宏观资金数据与 §2.4 的技术信号融合，形成**资金面综合判断**：

```
资金面综合评分 = Σ(维度评分 × 权重)

权重分配：
├── 主力资金流向    30%  — 核心驱动力
├── ETF 资金流向    25%  — 机构配置意愿
├── 北向资金        20%  — 外资风向标
├── 融资融券变化    15%  — 杠杆情绪
└── 板块轮动信号    10%  — 结构性机会
```

---

## 3. 第二层：事件驱动层

> **目标**：系统性地采集、解析、归纳各领域最新资讯，将非结构化信息转化为结构化的领域趋势判断。

### 3.1 信息采集体系

#### 信息源矩阵

| 类别 | 信息源 | 内容类型 | 采集频率 |
|------|--------|---------|---------|
| **权威媒体** | 财联社、第一财经、证券时报 | 政策解读、行业动态 | 实时 |
| **国际媒体** | Reuters、Bloomberg、TechCrunch | 全球科技产业动态 | 每小时 |
| **行业研究** | 各券商研报、Gartner、IDC | 深度分析、行业数据 | 日级 |
| **公司公告** | 巨潮资讯、SEC Filing、港交所 | 财报、重大事项 | 实时 |
| **社交舆情** | 雪球、东方财富股吧、Twitter/X | 市场情绪、散户观点 | 每小时 |
| **政策法规** | 国务院、工信部、商务部、BIS | 政策发布、出口管制 | 实时 |
| **技术社区** | Arxiv、GitHub Trending、HackerNews | 前沿技术突破 | 日级 |

#### AI硬件领域重点关注主题
```
芯片与半导体：
├── NVIDIA/AMD/Intel 新品发布与业绩
├── 国产替代进展（华为昇腾、寒武纪、海光信息）
├── 先进制程（台积电 2nm/3nm 产能）
├── HBM（高带宽内存）供需与价格
├── 出口管制与制裁政策变化
└── 半导体设备国产化率

服务器与算力：
├── AI服务器出货量与订单数据
├── 液冷技术渗透率
├── 国内智算中心建设进度
├── 算力租赁市场价格变化
└── 边缘AI部署趋势

光通信与CPO：
├── 光模块速率升级（800G→1.6T→3.2T）
├── CPO（光电共封装）技术进展
├── 硅光技术突破
├── 光芯片/激光器供需
└── 数据中心光互连带宽需求

下游应用：
├── 大模型训练/推理需求变化
├── 自动驾驶芯片需求
├── AI PC / AI手机渗透率
├── 机器人与具身智能
└── AI+医疗/金融/教育落地
```

### 3.2 NLP 处理管线

每条资讯需经过以下处理：

```
原始文本 → 分类 → 实体识别 → 情感分析 → 影响评估 → 摘要生成
```

#### 3.2.1 事件分类
```typescript
enum EventCategory {
  POLICY = 'policy',           // 政策法规
  EARNINGS = 'earnings',       // 财报业绩
  PRODUCT = 'product',         // 产品发布
  PARTNERSHIP = 'partnership', // 合作/并购
  SUPPLY_CHAIN = 'supply',     // 供应链变动
  TECHNOLOGY = 'tech',         // 技术突破
  MARKET = 'market',           // 市场动态
  REGULATION = 'regulation',   // 监管/制裁
}
```

#### 3.2.2 情感分析与影响力评估
```typescript
interface EventAnalysis {
  id: string;
  title: string;
  source: string;
  publishTime: string;
  category: EventCategory;

  // NLP分析结果
  entities: {
    companies: string[];     // 涉及公司
    sectors: string[];       // 涉及行业
    products: string[];      // 涉及产品
    people: string[];        // 关键人物
  };

  sentiment: {
    score: number;           // -1(极度利空) ~ +1(极度利好)
    confidence: number;      // 0~1, 模型置信度
    label: 'very_bullish' | 'bullish' | 'neutral' | 'bearish' | 'very_bearish';
  };

  impact: {
    timeHorizon: 'short' | 'medium' | 'long';  // 影响时间跨度
    magnitude: number;       // 1~5, 影响力度
    affectedSectors: { sector: string; direction: 'positive' | 'negative'; weight: number }[];
    reasoning: string;       // AI推理过程
  };

  summary: string;           // 一句话摘要
  fullAnalysis: string;      // 完整分析
}
```

#### 3.2.3 领域趋势聚合

将同类事件聚合为**领域趋势报告**：

```typescript
interface SectorTrend {
  sector: string;            // 如 "AI芯片"
  period: string;            // "近7天" / "近30天"

  eventSummary: {
    totalEvents: number;
    byCategory: Record<EventCategory, number>;
    sentimentDistribution: { bullish: number; neutral: number; bearish: number };
  };

  trendAssessment: {
    currentStatus: string;   // "当前处于行业上升周期"
    shortTermOutlook: string;// "1-3个月内，受XX因素影响..."
    mediumTermOutlook: string;// "3-12个月内，需关注XX变量..."
    keyDrivers: string[];    // 核心驱动因素
    keyRisks: string[];      // 主要风险因素
    confidenceLevel: number; // 0~1
  };

  topEvents: EventAnalysis[]; // 最具影响力的事件
}
```

---

## 4. 第三层：知识图谱层

> **目标**：构建AI硬件产业链的结构化知识图谱，揭示细分领域之间的因果传导关系，为投资决策提供"第二层思维"。

### 4.1 知识图谱设计理念

作为投资分析师，我们不只是要画一张"谁供应谁"的产业链图，而是要建立一套**双层结构化知识体系**：

**第一层：层级树形结构** — 表达"包含"关系
```
沪深300 → 信息技术(一级行业) → 半导体(二级行业) → 封测(细分领域) → 长电科技(个股)
                ↘ 通信设备(二级行业) → 光通信(细分领域) → 中际旭创(个股)
科创50 → 信息技术(一级行业) → ...
```

**第二层：扁平网状关联** — 表达"传导"关系
```
AI大模型训练需求↑ → GPU订单↑ → 台积电先进制程产能紧张
    → HBM供不应求 → 存储芯片涨价 → 三星/SK海力士利润↑
    → 散热需求升级 → 液冷渗透率↑ → 英维克/申菱环境受益
    → 数据中心能耗↑ → 电源模组功率密度要求↑
```

**双层融合**：层级结构提供指数→行业→个股的配置路径，网状关联提供跨领域的因果传导逻辑。两者结合支撑 ETF 配置决策：
- 层级结构决定"买哪个 ETF"（跟踪哪个指数/板块）
- 网状关联决定"什么时候买"（传导路径上的时序判断）

**持续迭代**：图谱不是静态的。随着新事件、新数据、新理解的出现，节点和关系需要持续更新。MVP 阶段支持手动编辑，框架预留 AI 辅助和数据驱动的自动更新能力。

### 4.2 节点类型定义

```typescript
interface GraphNode {
  id: string;
  type: NodeType;
  name: string;
  description: string;

  // 层级关系（树形结构）
  parentId?: string;              // 父节点ID
  level: number;                  // 层级深度: 0=指数, 1=L1行业, 2=L2行业, 3=细分, 4=个股
  children?: string[];            // 子节点ID列表

  // ETF 关联（指数节点专用）
  trackingETFs?: {
    ticker: string;               // ETF代码，如 "510300"
    name: string;                 // ETF名称
    totalAssets: number;          // 规模（亿元）
    trackingError: number;        // 跟踪误差（%）
  }[];

  // 关联的上市公司（用于传导分析参考）
  relatedStocks: {
    ticker: string;
    market: 'A' | 'HK' | 'US';
    relevance: number;    // 0~1, 与该节点的关联度
    role: 'direct' | 'indirect' | 'beneficiary' | 'victim';
  }[];

  // 当前状态评估
  status: {
    cyclePosition: 'upturn' | 'peak' | 'downturn' | 'trough';
    momentum: number;     // -100 ~ +100
    lastUpdated: string;
  };

  // 迭代元数据
  metadata: {
    createdAt: string;
    updatedAt: string;
    source: 'manual' | 'ai_suggested' | 'data_driven';
    confidence: number;   // 0~1
    notes?: string;       // 人工备注
  };
}

enum NodeType {
  // === 层级节点（树形结构，用于指数→行业→个股的配置路径）===
  INDEX = 'index',                     // 指数节点（沪深300、科创50等）
  INDUSTRY_L1 = 'industry_l1',         // 一级行业（信息技术、医药生物等）
  INDUSTRY_L2 = 'industry_l2',         // 二级行业（半导体、通信设备等）
  SUB_SECTOR = 'sub_sector',           // 细分领域（封测、光模块、CPO等）
  STOCK = 'stock',                     // 个股节点

  // === 产业链节点（网状关联，用于因果传导分析）===
  CHIP_DESIGN = 'chip_design',         // 芯片设计
  WAFER_FOUNDRY = 'wafer_foundry',     // 晶圆代工
  PACKAGING = 'packaging',             // 封装测试
  EQUIPMENT = 'equipment',             // 半导体设备
  MATERIAL = 'material',               // 半导体材料
  EDA = 'eda',                         // EDA工具
  MEMORY = 'memory',                   // 存储芯片
  SERVER = 'server',                   // 服务器制造
  COOLING = 'cooling',                 // 散热方案
  POWER = 'power',                     // 电源模组
  PCB = 'pcb',                         // PCB/基板
  NETWORKING = 'networking',           // 网络设备
  DATA_CENTER = 'data_center',         // 数据中心
  CLOUD = 'cloud',                     // 云计算平台
  AI_APPLICATION = 'ai_application',   // AI应用
  TERMINAL_DEVICE = 'terminal_device', // 终端设备
  OPTICAL_COMM = 'optical_comm',       // 光通信
  CPO = 'cpo',                         // 光电共封装
  OPTICAL_MODULE = 'optical_module',   // 光模块

  // === 外部驱动节点 ===
  POLICY = 'policy',                   // 政策因素
  MACRO = 'macro',                     // 宏观因素
  TECHNOLOGY = 'technology',           // 技术趋势
  DEMAND = 'demand',                   // 需求驱动
}
```

### 4.3 边（关系）类型定义

```typescript
interface GraphEdge {
  id: string;
  source: string;        // 源节点ID
  target: string;        // 目标节点ID
  relation: RelationType;
  weight: number;        // 关联强度 0~1
  direction: 'positive' | 'negative'; // 正向/负向影响
  lag: string;           // 传导滞后 "即时" / "1-3月" / "3-6月"
  confidence: number;    // 置信度 0~1
  evidence: string[];    // 支撑证据（事件/数据引用）
  description: string;   // 传导逻辑说明
}

enum RelationType {
  SUPPLY_CHAIN = 'supply_chain',     // 供应链关系
  DEMAND_DRIVER = 'demand_driver',   // 需求驱动
  COMPETITION = 'competition',       // 竞争关系
  COMPLEMENT = 'complement',         // 互补关系
  POLICY_IMPACT = 'policy_impact',   // 政策影响
  TECH_ENABLE = 'tech_enable',       // 技术赋能
  COST_PRESSURE = 'cost_pressure',   // 成本传导
  SUBSTITUTION = 'substitution',     // 替代关系
  CAPITAL_CYCLE = 'capital_cycle',   // 资本开支周期
}
```

### 4.4 AI硬件产业链核心图谱（MVP）

#### 4.4.1 上游：芯片与核心器件

```
                    ┌──────────────────┐
                    │   AI大模型训练    │
                    │   /推理需求↑     │
                    └────────┬─────────┘
                             │ 需求驱动
                    ┌────────▼─────────┐
              ┌─────│    GPU/AI芯片     │─────┐
              │     │ (NVIDIA/AMD/华为) │     │
              │     └────────┬─────────┘     │
              │              │               │
      ┌───────▼──────┐ ┌────▼─────┐  ┌──────▼───────┐
      │  HBM高带宽内存│ │先进封装  │  │ 半导体设备    │
      │ (SK海力士/三星│ │CoWoS/SoIC│  │ (ASML/北方华创│
      │  /美光)       │ │          │  │  /中微公司)   │
      └───────┬──────┘ └────┬─────┘  └──────┬───────┘
              │              │               │
      ┌───────▼──────┐ ┌────▼─────┐  ┌──────▼───────┐
      │  存储芯片涨价 │ │封测需求↑ │  │ 设备国产化率  │
      │  三星/海力士  │ │长电科技  │  │ 提升          │
      │  利润↑        │ │通富微电  │  │               │
      └──────────────┘ └──────────┘  └──────────────┘
```

#### 4.4.2 中游：算力基础设施

```
      ┌──────────────────────────────────────────┐
      │           AI芯片/GPU 供货量↑               │
      └──────────────┬───────────────────────────┘
                     │
      ┌──────────────▼───────────────────────────┐
      │         AI服务器组装与出货                   │
      │    (浪潮信息/工业富联/超微电脑)              │
      └──┬───────────┬──────────┬────────────────┘
         │           │          │
  ┌──────▼────┐ ┌────▼────┐ ┌──▼──────────┐
  │ 液冷散热   │ │ 电源模组 │ │ PCB/基板    │
  │ 英维克     │ │ 麦格米特 │ │ 深南电路    │
  │ 申菱环境   │ │          │ │ 沪电股份    │
  └───────────┘ └─────────┘ └─────────────┘
```

#### 4.4.3 下游：算力部署与应用

```
      ┌──────────────────────────────────────────┐
      │           云计算厂商资本开支↑               │
      │   (阿里云/腾讯云/AWS/Azure/Google)        │
      └──────────────┬───────────────────────────┘
                     │
      ┌──────────────▼───────────────────────────┐
      │           数据中心建设与运营                 │
      │    (万国数据/世纪互联/Equinix)              │
      └──┬───────────┬──────────┬────────────────┘
         │           │          │
  ┌──────▼────┐ ┌────▼────┐ ┌──▼──────────┐
  │ 智算中心   │ │ IDC运营 │ │ 算力租赁     │
  │ 建设       │ │ 上架率↑ │ │ 价格变化     │
  └───────────┘ └─────────┘ └─────────────┘
         │
  ┌──────▼──────────────────────────────────┐
  │           AI应用落地                      │
  │  大模型服务/自动驾驶/AI PC/具身智能        │
  └─────────────────────────────────────────┘
```

#### 4.4.4 横向影响因子

```
政策与地缘：                    资本周期：
├── 美国对华芯片出口管制         ├── 全球云计算厂商资本开支
├── 中国半导体自主可控政策        ├── AI投资周期 vs 回报周期
├── 欧盟AI Act监管              └── 利率环境对科技估值影响
└── 日韩半导体产业政策

技术迭代：
├── GPU架构迭代 (Hopper→Blackwell→Rubin)
├── 制程节点演进 (3nm→2nm→A16)
├── Chiplet/先进封装技术成熟度
├── 光互连/CPO技术进展
└── 新型存储技术 (HBM4/CXL)
```

#### 4.4.5 光通信与CPO产业链

```
      ┌──────────────────────────────────────────┐
      │          AI算力需求↑ → 数据中心扩容        │
      └──────────────┬───────────────────────────┘
                     │
      ┌──────────────▼───────────────────────────┐
      │           光互连带宽需求升级                 │
      │    (800G→1.6T→3.2T 光模块迭代)             │
      └──┬───────────┬──────────┬────────────────┘
         │           │          │
  ┌──────▼────┐ ┌────▼────┐ ┌──▼──────────┐
  │  光模块    │ │ 光芯片   │ │  CPO        │
  │ 中际旭创   │ │源杰科技  │ │ (光电共封装) │
  │ 新易盛     │ │长光华芯  │ │ 尚处于早期   │
  │ 天孚通信   │ │          │ │              │
  └─────┬─────┘ └────┬────┘ └──────┬───────┘
        │            │              │
  ┌─────▼─────┐ ┌────▼────┐  ┌────▼────────┐
  │ 硅光技术   │ │激光器/   │  │ 芯片间光互连 │
  │ 集成       │ │探测器    │  │ 替代铜互连   │
  └───────────┘ └─────────┘  └─────────────┘

关键传导逻辑：
├── AI训练集群规模↑ → 服务器间互连带宽↑ → 高速光模块需求↑
├── 光模块速率升级(800G→1.6T) → 光芯片ASP↑ → 源杰科技/长光华芯受益
├── CPO技术成熟 → 光引擎与芯片封装一体化 → 降低功耗/延迟
└── 硅光技术突破 → 光模块成本↓ → 数据中心渗透率↑
```

### 4.5 指数层级图谱结构

#### 4.5.1 层级定义

| 层级 | 节点类型 | 示例 | 说明 |
|------|---------|------|------|
| L0 | INDEX | 沪深300、科创50、创业板指 | 宽基/行业指数 |
| L1 | INDUSTRY_L1 | 信息技术、医药生物、新能源 | 一级行业分类 |
| L2 | INDUSTRY_L2 | 半导体、通信设备、计算机 | 二级行业分类 |
| L3 | SUB_SECTOR | 封测、光模块、CPO、液冷散热 | 细分领域 |
| L4 | STOCK | 长电科技、中际旭创、英维克 | 个股（仅作参考） |

#### 4.5.2 层级图谱示例

```
[沪深300] ──包含──→ [信息技术(L1)] ──包含──→ [半导体(L2)]
    │                      │                       │
    │                      │                  ┌────┼────┐
    │                      │                  │    │    │
    │                      │              [封测] [设备] [材料]
    │                      │              (L3)   (L3)   (L3)
    │                      │                  │    │    │
    │                      │              [长电] [北方] [沪硅]
    │                      │              (L4)   华创   (L4)
    │                      │                     (L4)
    │
    └──包含──→ [医药生物(L1)] ──包含──→ [创新药(L2)] ──→ ...

[科创50] ──包含──→ [信息技术(L1)] ──包含──→ [半导体(L2)] ──→ ...
```

#### 4.5.3 双层融合：层级 × 网状

```
层级路径（配置决策）：
  沪深300 → 信息技术 → 半导体 → 封测 → [对应ETF: 半导体ETF 512480]

网状关联（传导分析）：
  半导体(L2) ──需求驱动──→ 光通信(L3)
  封测(L3) ──供应链──→ 先进封装(产业链节点)
  GPU芯片(产业链) ──需求驱动──→ HBM(产业链)

融合输出：
  "半导体ETF受AI芯片需求驱动(网状)，同时处于信息技术一级行业下(层级)，
   当光通信板块传导利好时，可考虑通信ETF作为补充配置"
```

#### 4.5.4 节点关联 ETF 映射

每个层级节点可关联跟踪该板块的 ETF，用于最终的投资建议输出：

| 层级节点 | 关联 ETF | 代码 |
|---------|---------|------|
| 沪深300 | 沪深300ETF | 510300 |
| 科创50 | 科创50ETF | 588000 |
| 创业板指 | 创业板ETF | 159915 |
| 半导体(L2) | 半导体ETF | 512480 |
| 半导体(L2) | 芯片ETF | 159995 |
| 通信设备(L2) | 通信ETF | 515880 |
| 光通信(L3) | 光通信ETF | 159853 |
| AI应用(L2) | AI ETF | 515070 |

### 4.6 知识图谱迭代机制

#### 4.6.1 迭代框架设计

知识图谱需要支持持续演进。框架设计三层迭代能力，MVP 阶段实现第一层：

```
迭代能力层级：
├── L1: 手动编辑（MVP 实现）
│   └── 用户通过 UI 增/删/改节点和关系，所有变更记录日志
├── L2: AI 辅助建议（MVP 展示，后续实现）
│   └── AI 根据新事件建议新增/修改节点和关系，用户审核后生效
└── L3: 数据驱动自动更新（框架预留，后续实现）
    └── 基于数据变化自动调整节点状态、关系权重
```

#### 4.6.2 变更操作定义

```typescript
interface GraphMutation {
  id: string;
  type: 'add_node' | 'remove_node' | 'update_node'
      | 'add_edge' | 'remove_edge' | 'update_edge';
  targetId: string;              // 节点/边ID
  before?: Partial<GraphNode | GraphEdge>;  // 变更前（快照）
  after: Partial<GraphNode | GraphEdge>;    // 变更后
  reason: string;                // 变更原因
  source: 'manual' | 'ai_suggested' | 'data_driven';
  approved: boolean;             // 是否已审核
  approvedBy?: string;
  createdAt: string;
}
```

#### 4.6.3 迭代 API

```typescript
interface GraphIterationAPI {
  // === 手动编辑（MVP 核心）===
  addNode(node: Omit<GraphNode, 'id' | 'metadata'>): Promise<GraphNode>;
  updateNode(id: string, patch: Partial<GraphNode>): Promise<GraphNode>;
  deleteNode(id: string): Promise<void>;
  addEdge(edge: Omit<GraphEdge, 'id'>): Promise<GraphEdge>;
  updateEdge(id: string, patch: Partial<GraphEdge>): Promise<GraphEdge>;
  deleteEdge(id: string): Promise<void>;

  // === 变更日志 ===
  getChangelog(filter?: { nodeId?: string; source?: string }): Promise<GraphMutation[]>;
  revertChange(mutationId: string): Promise<void>;

  // === AI 建议（MVP 展示入口，后续实现）===
  suggestMutation(event: EventAnalysis): Promise<GraphMutation[]>;
  reviewMutation(mutationId: string, approved: boolean): Promise<void>;

  // === 数据驱动（框架预留，后续实现）===
  autoUpdateNodeStatus(): Promise<GraphMutation[]>;
  autoUpdateEdgeWeights(): Promise<GraphMutation[]>;
}
```

### 4.7 传导路径分析引擎

知识图谱的核心价值在于**自动发现传导路径**：

```typescript
interface PropagationPath {
  trigger: {
    event: string;           // 触发事件
    sourceNode: string;      // 起始节点
  };
  paths: {
    nodes: string[];         // 路径上的节点
    edges: GraphEdge[];      // 路径上的关系
    totalLag: string;        // 总传导滞后
    finalImpact: {
      node: string;          // 最终受影响节点
      direction: 'positive' | 'negative';
      magnitude: number;     // 1~5
      confidence: number;    // 0~1
    };
    explanation: string;     // 完整传导逻辑说明
  }[];
  affectedStocks: {
    ticker: string;
    name: string;
    impactDirection: 'positive' | 'negative';
    impactReasoning: string;
    timeHorizon: string;
  }[];
}
```

**示例**：当检测到"NVIDIA发布Blackwell Ultra GPU"事件时，系统自动推导：
1. GPU性能提升 → AI训练效率提高 → 云计算厂商加大采购 → 工业富联(服务器)受益
2. Blackwell功耗增加 → 液冷需求从可选变必须 → 英维克/申菱环境受益
3. 需要更多HBM → SK海力士/三星产能紧张 → 存储芯片涨价
4. 需要更大PCB面积 → 深南电路/沪电股份订单增加

---

## 5. 第四层：决策层

> **目标**：融合前三层的数据和分析，结合经典金融决策模型和AI大模型，为用户提供个性化的投资分析建议。

### 5.1 经典金融决策模型集成

#### 5.1.1 现代投资组合理论 (MPT - Markowitz)
```
用途：资产配置优化
输入：各资产预期收益率、波动率、相关性矩阵
输出：有效前沿、最优权重

应用场景：
- 用户已有持仓时，评估当前组合的风险收益比
- 推荐调整仓位以接近最优组合
- 计算组合的夏普比率、最大回撤、VaR
```

#### 5.1.2 CAPM 资本资产定价模型
```
用途：个股预期收益率估算
公式：E(Ri) = Rf + βi × (E(Rm) - Rf)
输入：无风险利率、个股Beta、市场预期收益
输出：个股合理预期收益率

应用场景：
- 判断个股当前价格是否反映其系统性风险
- 对比实际收益率与理论收益率，发现定价偏差
```

#### 5.1.3 Fama-French 五因子模型
```
用途：解释股票收益来源
因子：市场因子、规模因子、价值因子、盈利因子、投资因子
输出：Alpha（超额收益）分解

应用场景：
- 识别AI硬件板块的收益是来自Beta(行业普涨)还是Alpha(个股能力)
- 量化"选赛道" vs "选个股"的贡献
```

#### 5.1.4 Black-Litterman 模型
```
用途：融合市场均衡与主观观点的资产配置
输入：市场均衡收益 + 用户/分析师的主观观点
输出：后验预期收益与最优配置

应用场景：
- 将知识图谱的传导分析作为"观点"输入
- 平衡客观数据与AI分析的主观判断
```

#### 5.1.5 风险管理模型
```
VaR (Value at Risk):
├── 历史模拟法：基于历史收益分布
├── 参数法：假设正态分布
└── Monte Carlo：随机模拟
用途：量化最大可能亏损

CVaR / Expected Shortfall:
用途：尾部风险度量（极端亏损的期望）

最大回撤分析：
用途：评估历史最坏情况

压力测试：
├── 中美科技脱钩场景
├── 全球半导体下行周期
├── AI泡沫破裂场景
└── 利率大幅上行场景
```

### 5.2 AI大模型决策引擎

#### 5.2.1 多维度综合分析

AI大模型作为"首席分析师"，综合所有层的信息：

```typescript
interface AIAnalysisRequest {
  // 用户上下文
  userContext: {
    portfolio: PortfolioHolding[];  // 当前持仓（ETF为主）
    totalAssets: number;            // 总资产
    riskProfile: 'conservative' | 'moderate' | 'aggressive';
    investmentHorizon: 'short' | 'medium' | 'long';
    cashRatio: number;              // 现金比例
  };

  // 第一层数据
  marketData: {
    signals: SignalOutput[];        // 技术信号
    macroCapitalFlow: MacroCapitalFlow; // 宏观资金流向（§2.5）
    valuationMetrics: ValuationData[];
  };

  // 第二层数据
  eventData: {
    recentEvents: EventAnalysis[];
    sectorTrends: SectorTrend[];
  };

  // 第三层数据
  graphData: {
    relevantPaths: PropagationPath[];
    cyclePositions: CycleData[];
    sectorCorrelations: CorrelationData[];
  };

  // 用户关注点
  focusAreas: string[];  // 如 ["GPU", "HBM", "液冷", "光通信"]
  specificQuestions?: string;
}

interface AIAnalysisResponse {
  // 市场总览
  marketOverview: {
    overallSentiment: string;       // 整体市场情绪判断
    keyObservations: string[];      // 关键观察点
    riskLevel: 'low' | 'medium' | 'high' | 'very_high';
    capitalFlowSummary: string;     // 资金面概况
  };

  // 板块分析
  sectorAnalysis: {
    sector: string;
    outlook: 'bullish' | 'neutral' | 'bearish';
    reasoning: string;
    keyDrivers: string[];
    keyRisks: string[];
    recommendedExposure: 'overweight' | 'market_weight' | 'underweight';
  }[];

  // ETF 投资建议（MVP 核心输出）
  etfRecommendations: {
    ticker: string;           // ETF 代码，如 "510300"
    name: string;             // 如 "沪深300ETF"
    trackingIndex: string;    // 跟踪指数
    action: 'buy' | 'hold' | 'sell';
    conviction: number;       // 信心度 1~5
    positionSize: string;     // "建议仓位10-15%"
    reasoning: string;        // 综合分析逻辑
    catalysts: string[];      // 潜在催化剂
    risks: string[];          // 主要风险
    timeHorizon: string;
    referenceStocks: {        // 关联的龙头个股（仅分析参考，非投资建议）
      ticker: string;
      name: string;
      role: string;           // 在产业链中的角色
      trend: string;          // 个股趋势描述
    }[];
  }[];

  // 个股参考信息（可选，仅分析参考，不作为投资建议）
  stockReference?: {
    ticker: string;
    name: string;
    sector: string;
    analysisSummary: string;  // 分析摘要
    role: string;             // 在产业链传导中的角色
  }[];

  // 组合建议
  portfolioAdvice: {
    currentAssessment: string;       // 当前组合评估
    suggestedChanges: {
      action: 'add' | 'reduce' | 'exit' | 'hold';
      ticker: string;                // ETF 代码
      amount?: number;
      reason: string;
    }[];
    riskMetrics: {
      concentrationRisk: string;     // 集中度风险
      sectorExposure: string;        // 行业敞口
      hedgingSuggestion?: string;    // 对冲建议
    };
  };

  // 综合报告
  fullReport: string;                // Markdown格式的完整分析报告
}
```

#### 5.2.2 Prompt 工程框架

```
System Prompt 结构：
├── 角色定义："你是一位资深科技行业投资分析师，专注于AI硬件产业链ETF配置..."
├── 分析框架："请基于以下框架进行分析：1)宏观资金面 2)行业趋势 3)ETF标的质量 4)产业链传导..."
├── 输出格式："请按以下格式输出：..."
├── 风险提示："始终提醒用户投资风险，不做绝对性承诺..."
└── 用户画像："该用户风险偏好为XX，当前持仓为XX..."

Context 注入：
├── 基础数据层信号 → 技术面/估值面判断依据
├── 事件驱动层摘要 → 近期重要事件和趋势
├── 知识图谱路径 → 产业链传导逻辑
└── 用户持仓数据 → 个性化建议基础
```

### 5.3 综合评分系统

```typescript
interface InvestmentScore {
  ticker: string;              // ETF 代码
  name: string;                // ETF 名称
  trackingIndex: string;       // 跟踪指数
  timestamp: string;

  dimensions: {
    technical: { score: number; weight: 0.15; details: string[]; };   // 技术面
    capitalFlow: { score: number; weight: 0.20; details: string[]; }; // 资金面（宏观+板块）
    sentiment: { score: number; weight: 0.10; details: string[]; };   // 情绪面
    event: { score: number; weight: 0.15; details: string[]; };       // 事件驱动
    graph: { score: number; weight: 0.15; details: string[]; };       // 产业链传导位置
    etfQuality: { score: number; weight: 0.15; details: string[]; };  // ETF质量（跟踪误差/流动性/规模）
    valuation: { score: number; weight: 0.10; details: string[]; };   // 估值合理性
  };

  compositeScore: number;      // 加权综合评分 0~100
  rating: 'strong_buy' | 'buy' | 'hold' | 'reduce' | 'sell';
  confidence: number;          // 分析置信度 0~1
}
```

---

## 6. Web UI 设计

### 6.1 页面结构

```
/                           → 仪表盘总览
├── /dashboard              → 市场概览 + 持仓概况
├── /market                 → 大盘/指数/板块数据
│   ├── /market/overview    → 市场全景
│   ├── /market/sectors     → 板块轮动
│   └── /market/capital     → 资金流向
├── /events                 → 事件驱动中心
│   ├── /events/feed        → 资讯流
│   ├── /events/analysis    → 事件分析
│   └── /events/trends      → 领域趋势
├── /graph                  → 知识图谱
│   ├── /graph/explore      → 图谱探索(交互式)
│   ├── /graph/propagation  → 传导路径分析
│   ├── /graph/cycles       → 周期分析
│   ├── /graph/edit         → 图谱编辑(手动增删改节点/关系)
│   └── /graph/changelog    → 变更历史
├── /analysis               → AI分析中心
│   ├── /analysis/stock     → 个股分析
│   ├── /analysis/sector    → 板块分析
│   └── /analysis/report    → 综合报告
├── /portfolio              → 投资组合
│   ├── /portfolio/overview → 持仓总览
│   ├── /portfolio/optimize → 组合优化
│   └── /portfolio/risk     → 风险分析
└── /settings               → 个人设置
```

### 6.2 核心页面设计

#### 6.2.1 仪表盘 (Dashboard)

```
┌─────────────────────────────────────────────────────────┐
│  AI投资分析系统                    [用户头像] [设置]       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─ 市场概览 ──────────────────────────────────────────┐ │
│  │ 上证 3,xxx ▲0.5%  深证 xx,xxx ▲0.8%               │ │
│  │ 创业板 2,xxx ▲1.2%  科创50 1,xxx ▲1.5%            │ │
│  │ NASDAQ xx,xxx ▲0.3%  费半 5,xxx ▲0.7%             │ │
│  │ 市场情绪：偏多 | 北向资金：净买入 xx亿 | 主力净流入 xx亿│ │
│  └──────────────────────────────────────────────────────┘ │
│                                                         │
│  ┌─ AI硬件板块信号 ────────┐  ┌─ 今日重要事件 ────────┐ │
│  │ GPU芯片    ████████░░ 78│  │ 🔴 NVIDIA Q2指引超预期│ │
│  │ HBM存储    █████████░ 85│  │ 🟢 国产算力政策加码    │ │
│  │ AI服务器   ███████░░░ 72│  │ 🟡 台积电产能分配变化  │ │
│  │ 液冷散热   █████████░ 82│  │ 🔴 出口管制新规草案    │ │
│  │ PCB基板    ██████░░░░ 65│  │ 🟢 AI手机出货量创新高  │ │
│  └──────────────────────────┘  └────────────────────────┘ │
│                                                         │
│  ┌─ 我的ETF持仓 ────────────────────────────────────────┐ │
│  │ 总资产：¥xxx,xxx  今日盈亏：+¥x,xxx (+0.x%)        │ │
│  │                                                     │ │
│  │ 沪深300ETF  +0.8% ███████░░  仓位:20%  AI建议:持有  │ │
│  │ 半导体ETF   +1.5% ██████░░░  仓位:15%  AI建议:加仓  │ │
│  │ 科创50ETF   +1.2% █████░░░░  仓位:10%  AI建议:持有  │ │
│  │ 通信ETF     +0.6% ████░░░░░  仓位:8%   AI建议:观望  │ │
│  │ ...                                                 │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                         │
│  ┌─ AI ETF配置建议 ────────────────────────────────────┐ │
│  │ 基于当前市场环境和您的持仓，AI建议：                   │ │
│  │ 1. 半导体ETF：AI芯片需求持续，建议维持偏配            │ │
│  │ 2. 光通信ETF：CPO技术进展利好，可适当增配             │ │
│  │ 3. 组合偏进攻型，建议增配沪深300ETF平衡风险           │ │
│  │                                    [查看完整建议 →]   │ │
│  └──────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

#### 6.2.2 知识图谱页面 (Interactive Graph)

```
┌─────────────────────────────────────────────────────────┐
│  知识图谱  AI硬件产业链        [搜索] [筛选] [全屏]       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─ 图谱视图 ──────────────────────┐ ┌─ 详情面板 ─────┐ │
│  │  [层级] [网状] 视图切换          │ │                 │ │
│  │                                  │ │ 选中：半导体ETF │ │
│  │  ▼ 沪深300                       │ │ 跟踪：中证半导体│ │
│  │    ▼ 信息技术(L1)                │ │                 │ │
│  │      ▼ 半导体(L2)               │ │ 状态：上升周期   │ │
│  │        ○ 封测(L3) ←→ 设备(L3)  │ │ 动量：+75       │ │
│  │        ○ 设备(L3) → 光通信(L3)  │ │                 │ │
│  │      ▼ 通信设备(L2)             │ │ 关联ETF：       │ │
│  │        ○ 光通信(L3)             │ │ 512480 半导体ETF│ │
│  │                                  │ │ 159995 芯片ETF  │ │
│  │  [切换为网状视图查看传导关系]     │ │                 │ │
│  │                                  │ │ 传导路径：       │ │
│  │                                  │ │ GPU→封测→半导体ETF│
│  │                                  │ │ GPU→服务器→液冷  │ │
│  └──────────────────────────────────┘ └─────────────────┘ │
│                                                         │
│  ┌─ 传导路径分析 ──────────────────────────────────────┐ │
│  │ 触发事件：[选择事件或自定义输入]                      │ │
│  │                                                     │ │
│  │ 路径1: NVIDIA发布新GPU → 液冷需求↑ → 英维克受益      │ │
│  │ 路径2: NVIDIA发布新GPU → HBM需求↑ → 存储芯片涨价    │ │
│  │ 路径3: AI训练效率↑ → 云厂商扩大采购 → 服务器出货↑    │ │
│  └──────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

#### 6.2.3 宏观资金监控页面

```
┌─────────────────────────────────────────────────────────┐
│  宏观资金流向                    [今日] [本周] [本月]      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─ 大盘资金概况 ──────────────────────────────────────┐ │
│  │ 主力净流入：+52.3亿   散户净流出：-18.7亿            │ │
│  │ 资金情绪指数：+35 (偏多)   全市场换手率：1.2%        │ │
│  │ 北向净买入：+28.6亿   融资余额变化：+12.4亿          │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                         │
│  ┌─ 板块资金轮动 ──────────────┐ ┌─ ETF资金流向 ──────┐ │
│  │ 🔴 半导体    +12.3亿  ▲3日  │ │ 科创50ETF  +5.2亿份│ │
│  │ 🔴 光通信    +8.7亿   ▲5日  │ │ 半导体ETF  +3.8亿份│ │
│  │ 🟡 服务器    +3.2亿   ▲1日  │ │ 沪深300ETF +2.1亿份│ │
│  │ 🟢 新能源    -5.6亿   ▼3日  │ │ 通信ETF    +1.5亿份│ │
│  │ 🔴 医药      -8.1亿   ▼5日  │ │ 创业板ETF  -0.8亿份│ │
│  └──────────────────────────────┘ └────────────────────┘ │
│                                                         │
│  ┌─ 资金流向趋势图（近30日）───────────────────────────┐ │
│  │ [ECharts 折线图：主力资金/北向资金/融资余额趋势]       │ │
│  └──────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

#### 6.2.4 知识图谱编辑页面

```
┌─────────────────────────────────────────────────────────┐
│  图谱编辑  知识图谱管理            [新增节点] [新增关系]   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─ 图谱视图 ──────────────────────┐ ┌─ 编辑面板 ──────┐ │
│  │                                  │ │                 │ │
│  │  [层级树形视图]                  │ │ 节点类型：       │ │
│  │  ▼ 沪深300                       │ │ [下拉选择]      │ │
│  │    ▼ 信息技术(L1)                │ │                 │ │
│  │      ▼ 半导体(L2)               │ │ 名称：          │ │
│  │        ○ 封测(L3)               │ │ [输入框]        │ │
│  │        ○ 设备(L3)               │ │                 │ │
│  │      ▼ 通信设备(L2)             │ │ 父节点：        │ │
│  │        ○ 光通信(L3)             │ │ [下拉选择]      │ │
│  │                                  │ │                 │ │
│  │  [切换为网状视图]                │ │ 关联ETF：       │ │
│  │                                  │ │ [多选]          │ │
│  │                                  │ │                 │ │
│  │                                  │ │ 描述：          │ │
│  │                                  │ │ [文本框]        │ │
│  │                                  │ │                 │ │
│  │                                  │ │ [保存] [删除]   │ │
│  └──────────────────────────────────┘ └─────────────────┘ │
│                                                         │
│  ┌─ 变更历史 ──────────────────────────────────────────┐ │
│  │ 2026-07-12 14:30  手动  新增节点"CPO" (细分领域)     │ │
│  │ 2026-07-12 10:15  手动  修改"光通信"关联ETF          │ │
│  │ 2026-07-11 16:00  AI建议  新增关系"光通信→数据中心"   │ │
│  │                                    [查看全部 →]      │ │
│  └──────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

#### 6.2.5 AI分析报告页面

```
┌─────────────────────────────────────────────────────────┐
│  AI ETF分析报告  半导体ETF (512480)     [刷新] [导出PDF]  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─ 综合评分 ──────────────────────────────────────────┐ │
│  │         82 / 100   ★★★★☆                          │ │
│  │         评级：买入 (Buy)  置信度：78%                │ │
│  │         跟踪指数：中证全指半导体                      │ │
│  │                                                     │ │
│  │  技术面  ████████░░ 80    资金面  █████████░ 88     │ │
│  │  情绪面  ███████░░░ 70    事件面  ████████░░ 75     │ │
│  │  产业链  █████████░ 85    ETF质量 ████████░░ 80     │ │
│  │  估值面  ██████░░░░ 65                               │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                         │
│  ┌─ AI分析报告 ────────────────────────────────────────┐ │
│  │ ## 市场环境                                         │ │
│  │ 当前AI硬件板块处于上升周期中段，云计算厂商资本开支     │ │
│  │ 持续增长，主力资金持续流入半导体板块...                │ │
│  │                                                     │ │
│  │ ## 资金面分析                                       │ │
│  │ 半导体ETF近5日净申购xx亿份，北向资金持续加仓...       │ │
│  │                                                     │ │
│  │ ## 产业链传导分析                                    │ │
│  │ GPU芯片需求↑ → 封测/设备订单↑ → 半导体ETF受益       │ │
│  │ 关联龙头：北方华创(设备)、长电科技(封测)              │ │
│  │                                                     │ │
│  │ ## 风险提示                                         │ │
│  │ 1. 出口管制政策不确定性                               │ │
│  │ 2. 板块估值已处历史高位                              │ │
│  │ 3. 全球半导体周期可能见顶                            │ │
│  │                                                     │ │
│  │ ## 投资建议                                         │ │
│  │ 建议仓位：10-15% | 持有周期：3-6个月                 │ │
│  └──────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## 7. MVP 范围定义

### 7.1 MVP 功能清单

| 模块 | 功能 | 优先级 | MVP包含 |
|------|------|--------|---------|
| **基础数据层** | A股主要指数行情展示 | P0 | ✅ |
| | AI硬件板块个股行情 | P0 | ✅ |
| | 技术指标计算(MA/MACD/RSI/成交量) | P0 | ✅ |
| | 宏观资金流动监控(主力/散户/板块轮动) | P0 | ✅ |
| | ETF数据与分析(净值/份额/溢折价) | P0 | ✅ |
| | 资金流向(主力/北向) | P0 | ✅ |
| | 基本面财务数据 | P1 | ✅ |
| | 估值分析(PE/PB历史百分位) | P1 | ✅ |
| | 美股/港股行情 | P2 | ❌ 后续 |
| | 宏观经济数据(CPI/PMI/利率) | P1 | ✅ |
| **事件驱动层** | 新闻资讯采集(AKShare) | P0 | ✅ |
| | AI事件分类与情感分析 | P0 | ✅ |
| | 领域趋势聚合报告 | P1 | ✅ |
| | 多源实时资讯流 | P2 | ❌ 后续 |
| **知识图谱层** | AI硬件产业链图谱数据 | P0 | ✅ |
| | 交互式图谱可视化(层级树形+网状) | P0 | ✅ |
| | 传导路径分析 | P1 | ✅ |
| | 周期位置标注 | P1 | ✅ |
| | 图谱手动编辑(增删改节点/关系) | P1 | ✅ |
| | 变更历史日志 | P1 | ✅ |
| | 光通信/CPO节点图谱 | P1 | ✅ |
| | AI辅助图谱建议 | P2 | ❌ 后续 |
| | 数据驱动自动更新 | P2 | ❌ 后续 |
| **决策层** | ETF多因子综合评分 | P0 | ✅ |
| | AI大模型ETF分析报告 | P0 | ✅ |
| | ETF持仓管理与分析 | P1 | ✅ |
| | ETF配置优化建议 | P2 | ❌ 后续 |
| | 风险量化(VaR/CVaR) | P2 | ❌ 后续 |
| **Web UI** | 仪表盘总览 | P0 | ✅ |
| | 知识图谱交互页面 | P0 | ✅ |
| | AI分析报告页面 | P0 | ✅ |
| | 事件资讯页面 | P1 | ✅ |
| | 投资组合页面 | P1 | ✅ |

### 7.2 MVP 数据覆盖范围

```
ETF 池（MVP 核心，投资建议输出对象）：
├── 宽基 ETF
│   ├── 沪深300 ETF（510300 / 159919）
│   ├── 中证500 ETF（510500）
│   ├── 科创50 ETF（588000）
│   └── 创业板 ETF（159915）
├── 行业 ETF（AI硬件相关）
│   ├── 半导体 ETF（512480）
│   ├── 芯片 ETF（159995）
│   ├── AI ETF（515070）
│   ├── 通信 ETF（515880）
│   └── 光通信 ETF（159853）
└── 主题 ETF
    ├── 算力 ETF（159888）
    └── 数据中心 ETF（待确认）

股票池（MVP 参考，用于传导分析，不直接输出投资建议）：
├── A股 AI硬件相关约 50-80 只核心标的
│   ├── GPU/AI芯片：寒武纪、海光信息、景嘉微
│   ├── 服务器：浪潮信息、中科曙光
│   ├── 光模块/光通信：中际旭创、新易盛、天孚通信
│   ├── PCB：深南电路、沪电股份
│   ├── 散热：英维克、高澜股份
│   ├── 封测：长电科技、通富微电
│   ├── 设备：北方华创、中微公司
│   └── 光芯片：源杰科技、长光华芯
├── 美股 AI硬件相关约 20 只
│   ├── NVIDIA、AMD、Intel、Broadcom
│   ├── Micron、SK海力士(ADR)
│   ├── ASML、台积电(ADR)
│   └── 超微电脑、Vertiv
└── 港股 AI硬件相关约 10 只
    ├── 中芯国际、华虹半导体
    └── 联想集团等
```

---

## 8. 技术架构

### 8.1 系统架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户浏览器                                 │
│                   Next.js 14 + React 19                          │
│         Tailwind CSS + shadcn/ui + D3.js(图谱) + ECharts(图表)   │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP / WebSocket
┌──────────────────────────▼──────────────────────────────────────┐
│                    Next.js API Routes                            │
│  /api/market/*  /api/events/*  /api/graph/*  /api/analysis/*    │
│  /api/portfolio/*  /api/auth/*                                   │
├─────────────────────────────────────────────────────────────────┤
│                    服务层 (Services)                              │
│  MarketService  EventService  GraphService  AnalysisService      │
│  PortfolioService  AIService  ScoreService                       │
├─────────────────────────────────────────────────────────────────┤
│                    数据层                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ AKShare  │  │ Yahoo    │  │ Claude   │  │ SQLite   │        │
│  │ (A股数据) │  │ Finance  │  │ API      │  │ (Prisma) │        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 技术栈

| 层面 | 技术选型 | 说明 |
|------|---------|------|
| 前端框架 | Next.js 14 (App Router) | SSR/SSG，SEO友好 |
| UI组件库 | shadcn/ui + Tailwind CSS | 美观、可定制 |
| 图表库 | ECharts | 丰富的金融图表 |
| 图谱可视化 | D3.js + Force Graph | 交互式知识图谱 |
| 后端运行时 | Node.js (Next.js API Routes) | 统一技术栈 |
| 数据库 | SQLite + Prisma ORM | MVP够用，后续可迁移PostgreSQL |
| 金融数据 | AKShare (Python) + Yahoo Finance | A股 + 美股覆盖 |
| AI服务 | Claude API (Anthropic) | 大模型分析 |
| 认证 | NextAuth.js v5 | 用户系统 |
| 定时任务 | node-cron | 数据定时采集 |
| 部署 | Vercel / Docker | 灵活部署 |

### 8.3 Python 数据服务

由于 AKShare 是 Python 库，需要一个 Python 微服务：

```
ai-invest/
├── src/                    # Next.js 主应用
│   ├── app/
│   ├── components/
│   ├── lib/
│   │   ├── services/       # 业务逻辑
│   │   ├── models/         # 数据模型
│   │   └── utils/
│   └── ...
├── data-service/           # Python 数据服务
│   ├── main.py             # FastAPI 服务
│   ├── market.py           # 行情数据
│   ├── financial.py        # 财务数据
│   ├── capital_flow.py     # 资金流向
│   ├── etf.py              # ETF数据（净值/份额/溢折价）
│   ├── macro_flow.py       # 宏观资金流动（大盘/板块/机构）
│   └── requirements.txt
├── prisma/
│   └── schema.prisma
└── docs/
    └── PRD.md              # 本文档
```

---

## 9. 数据模型

### 9.1 Prisma Schema

```prisma
// 用户系统
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  avatar    String?
  password  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  portfolios Portfolio[]
  watchlists Watchlist[]
  analyses   Analysis[]
  settings   UserSetting?
}

model UserSetting {
  id            String @id @default(cuid())
  userId        String @unique
  riskProfile   String @default("moderate")    // conservative/moderate/aggressive
  investHorizon String @default("medium")      // short/medium/long
  totalAssets   Float  @default(0)
  cashRatio     Float  @default(0.2)
  user          User   @relation(fields: [userId], references: [id])
}

// 投资组合
model Portfolio {
  id        String    @id @default(cuid())
  userId    String
  name      String
  isDefault Boolean   @default(false)
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  user     User      @relation(fields: [userId], references: [id])
  holdings Holding[]
}

model Holding {
  id          String   @id @default(cuid())
  portfolioId String
  ticker      String   // ETF代码
  market      String   // A（MVP仅支持A股ETF）
  name        String   // ETF名称
  quantity    Int      // 持有份额
  avgCost     Float    // 平均成本
  currentPrice Float?  // 当前价格(缓存)
  updatedAt   DateTime @updatedAt

  portfolio Portfolio @relation(fields: [portfolioId], references: [id])
}

// 市场数据缓存
model StockDaily {
  id        String   @id @default(cuid())
  ticker    String
  market    String
  date      DateTime
  open      Float
  high      Float
  low       Float
  close     Float
  volume    BigInt
  amount    Float?   // 成交额

  @@unique([ticker, date])
  @@index([ticker, date])
}

model IndexDaily {
  id        String   @id @default(cuid())
  code      String   // 指数代码
  name      String
  date      DateTime
  open      Float
  high      Float
  low       Float
  close     Float
  volume    BigInt
  changePct Float?   // 涨跌幅

  @@unique([code, date])
}

// ETF 数据
model ETFDaily {
  id         String   @id @default(cuid())
  ticker     String   // ETF代码
  name       String
  date       DateTime
  open       Float
  high       Float
  low        Float
  close      Float
  volume     BigInt
  amount     Float?   // 成交额
  nav        Float?   // 净值
  shares     BigInt?  // 份额（万份）
  premium    Float?   // 溢折价率（%）

  @@unique([ticker, date])
  @@index([ticker, date])
}

// 板块资金流向
model SectorCapitalFlow {
  id             String   @id @default(cuid())
  date           DateTime
  sector         String   // 板块名称
  sectorLevel    String   // L1/L2/sub
  mainForceNet   Float    // 主力净流入（万元）
  retailNet      Float    // 散户净流入（万元）
  totalVolume    Float    // 总成交额
  changePct      Float?   // 涨跌幅
  consecutiveDays Int?    // 连续流入/流出天数

  @@unique([date, sector])
  @@index([date])
}

// 大盘宏观资金流向
model MarketCapitalFlow {
  id              String   @id @default(cuid())
  date            DateTime @unique
  totalMainNet    Float    // 沪深两市主力净流入（亿元）
  retailNet       Float    // 散户净流入（亿元）
  sentiment       Float    // 资金情绪指数 -100~+100
  turnoverRate    Float?   // 全市场换手率
  northboundNet   Float    // 北向净买入（亿元）
  marginBalance   Float    // 融资余额（亿元）
  marginChange    Float    // 融资余额变化（亿元）
  blockTradeCount Int      // 大宗交易笔数
}

// 事件与资讯
model NewsArticle {
  id          String   @id @default(cuid())
  title       String
  content     String
  summary     String?  // AI生成摘要
  source      String
  url         String?  @unique
  publishTime DateTime
  category    String   // policy/earnings/product/...
  sentiment   Float?   // -1 ~ +1
  impact      Int?     // 1~5
  entities    String?  // JSON: 关联实体
  sectors     String?  // JSON: 关联板块
  createdAt   DateTime @default(now())

  @@index([publishTime])
  @@index([category])
}

// 知识图谱
model GraphNode {
  id          String   @id @default(cuid())
  type        String   // index/industry_l1/industry_l2/sub_sector/stock/chip_design/...
  name        String
  description String?
  parentId    String?  // 父节点ID（层级树形关系）
  level       Int      @default(0)  // 层级深度: 0=指数, 1=L1, 2=L2, 3=细分, 4=个股
  cyclePos    String?  // upturn/peak/downturn/trough
  momentum    Float?   // -100 ~ +100
  metadata    String?  // JSON: 扩展数据（含trackingETFs、迭代元数据）
  updatedAt   DateTime @updatedAt
  createdAt   DateTime @default(now())

  parent      GraphNode?  @relation("TreeNode", fields: [parentId], references: [id])
  children    GraphNode[] @relation("TreeNode")
  sourceEdges GraphEdge[] @relation("SourceNode")
  targetEdges GraphEdge[] @relation("TargetNode")
  stocks      GraphStock[]
  changeLogs  GraphChangeLog[]

  @@index([type])
  @@index([parentId])
  @@index([level])
}

// 图谱变更日志
model GraphChangeLog {
  id          String   @id @default(cuid())
  nodeId      String?
  edgeId      String?
  action      String   // add_node/update_node/delete_node/add_edge/update_edge/delete_edge
  before      String?  // JSON: 变更前数据快照
  after       String?  // JSON: 变更后数据
  reason      String?  // 变更原因
  source      String   // manual/ai_suggested/data_driven
  approved    Boolean  @default(true)  // 手动编辑默认已审核
  approvedBy  String?
  createdAt   DateTime @default(now())

  node GraphNode? @relation(fields: [nodeId], references: [id])

  @@index([nodeId])
  @@index([createdAt])
}

model GraphEdge {
  id          String   @id @default(cuid())
  sourceId    String
  targetId    String
  relation    String   // supply_chain/demand_driver/...
  weight      Float    // 0~1
  direction   String   // positive/negative
  lag         String?  // 传导滞后
  confidence  Float    // 0~1
  evidence    String?  // JSON: 支撑证据
  description String?

  source GraphNode @relation("SourceNode", fields: [sourceId], references: [id])
  target GraphNode @relation("TargetNode", fields: [targetId], references: [id])

  @@index([sourceId])
  @@index([targetId])
}

model GraphStock {
  id         String   @id @default(cuid())
  nodeId     String
  ticker     String
  market     String
  name       String
  relevance  Float    // 0~1
  role       String   // direct/indirect/beneficiary/victim

  node GraphNode @relation(fields: [nodeId], references: [id])

  @@index([ticker])
}

// AI分析记录
model Analysis {
  id          String   @id @default(cuid())
  userId      String
  type        String   // stock/sector/portfolio
  target      String   // 分析目标(ticker/sector名)
  input       String?  // JSON: 输入参数
  result      String   // JSON: 分析结果
  score       Float?   // 综合评分
  rating      String?  // 评级
  createdAt   DateTime @default(now())

  user User @relation(fields: [userId], references: [id])

  @@index([userId, type])
}

// 关注列表
model Watchlist {
  id        String   @id @default(cuid())
  userId    String
  ticker    String
  market    String
  name      String
  addedAt   DateTime @default(now())
  notes     String?

  user User @relation(fields: [userId], references: [id])

  @@unique([userId, ticker])
}
```

---

## 10. API 设计

### 10.1 API 路由总览

```
/api/auth/*
├── POST   /api/auth/register        # 用户注册
├── POST   /api/auth/login           # 用户登录
└── POST   /api/auth/logout          # 用户登出

/api/market/*
├── GET    /api/market/overview      # 市场概览(指数+板块)
├── GET    /api/market/stock/:ticker # 个股行情+技术指标
├── GET    /api/market/sector/:name  # 板块行情
├── GET    /api/market/capital-flow  # 资金流向
├── GET    /api/market/macro-capital # 宏观资金流向(大盘/板块/机构)
├── GET    /api/market/etf/:ticker   # ETF行情+资金流+溢折价
├── GET    /api/market/etf-flow      # 全市场ETF资金流向排名
├── GET    /api/market/sector-flow   # 板块资金流向排名
└── GET    /api/market/valuation/:ticker # 估值数据

/api/events/*
├── GET    /api/events/feed          # 资讯列表(分页+筛选)
├── GET    /api/events/:id           # 单条事件详情+AI分析
├── GET    /api/events/trends/:sector # 领域趋势聚合
└── POST   /api/events/analyze       # 自定义事件分析

/api/graph/*
├── GET    /api/graph/nodes              # 图谱节点列表（支持按type/level筛选）
├── GET    /api/graph/nodes/:id          # 单节点详情（含子节点、关联边）
├── POST   /api/graph/nodes              # 新增节点（手动编辑）
├── PUT    /api/graph/nodes/:id          # 更新节点
├── DELETE /api/graph/nodes/:id          # 删除节点
├── GET    /api/graph/edges              # 图谱关系列表
├── POST   /api/graph/edges              # 新增关系
├── PUT    /api/graph/edges/:id          # 更新关系
├── DELETE /api/graph/edges/:id          # 删除关系
├── GET    /api/graph/tree               # 获取层级树形结构
├── GET    /api/graph/tree/:nodeId       # 获取指定节点的子树
├── GET    /api/graph/full               # 完整图谱数据（树形+网状）
├── GET    /api/graph/changelog          # 变更历史日志
├── POST   /api/graph/propagation        # 传导路径分析
└── GET    /api/graph/stock/:ticker      # 个股在图谱中的位置

/api/analysis/*
├── POST   /api/analysis/etf         # ETF AI分析（MVP核心）
├── POST   /api/analysis/stock       # 个股AI分析（仅参考）
├── POST   /api/analysis/sector      # 板块AI分析
├── GET    /api/analysis/score/:ticker # 综合评分
└── GET    /api/analysis/history     # 历史分析记录

/api/portfolio/*
├── GET    /api/portfolio            # 用户投资组合
├── POST   /api/portfolio            # 创建组合
├── PUT    /api/portfolio/:id        # 更新组合
├── POST   /api/portfolio/:id/holdings  # 添加持仓
├── PUT    /api/portfolio/:id/holdings/:hid # 更新持仓
├── DELETE /api/portfolio/:id/holdings/:hid # 删除持仓
└── GET    /api/portfolio/:id/risk   # 组合风险分析
```

### 10.2 关键 API 示例

#### ETF AI 分析（MVP 核心）
```
POST /api/analysis/etf
Body: {
  "ticker": "512480",
  "includeGraph": true,
  "includeEvents": true,
  "userQuestion": "当前是否适合加仓半导体ETF？"
}

Response: {
  "ticker": "512480",
  "name": "半导体ETF",
  "trackingIndex": "中证全指半导体",
  "score": {
    "composite": 82,
    "rating": "buy",
    "dimensions": {
      "technical": { "score": 80, "details": [...] },
      "capitalFlow": { "score": 88, "details": [...] },
      "etfQuality": { "score": 80, "details": [...] },
      ...
    }
  },
  "analysis": {
    "marketOverview": "...",
    "capitalFlowSummary": "半导体板块近5日主力净流入12.3亿...",
    "reasoning": "...",
    "recommendation": {
      "action": "buy",
      "positionSize": "10-15%",
      "timeHorizon": "3-6个月"
    },
    "risks": [...],
    "catalysts": [...],
    "referenceStocks": [
      { "ticker": "002371", "name": "北方华创", "role": "半导体设备龙头" },
      { "ticker": "600584", "name": "长电科技", "role": "封测龙头" }
    ]
  },
  "graphPaths": [...],
  "recentEvents": [...]
}
```

---

## 11. 里程碑规划

### Phase 1：基础框架 (Week 1-2)
- [x] 项目初始化 (Next.js + Prisma + Tailwind)
- [ ] 数据库 Schema 设计与迁移
- [ ] 基础 UI 框架（导航、布局、主题）
- [ ] 用户认证系统
- [ ] Python 数据服务搭建

### Phase 2：基础数据层 (Week 3-4)
- [ ] AKShare 集成：A股行情数据采集
- [ ] Yahoo Finance 集成：美股行情
- [ ] 技术指标计算引擎
- [ ] 资金流向数据采集（主力/北向/板块轮动）
- [ ] ETF 数据采集（净值/份额/溢折价）
- [ ] 宏观资金流动监控（大盘主力/散户/机构）
- [ ] 基本面财务数据
- [ ] 仪表盘页面：市场概览 + 资金流向

### Phase 3：事件驱动层 (Week 5-6)
- [ ] 新闻采集服务
- [ ] Claude API 集成：事件分类与情感分析
- [ ] 领域趋势聚合
- [ ] 事件资讯页面

### Phase 4：知识图谱层 (Week 7-8)
- [ ] AI硬件产业链图谱数据构建（含光通信/CPO节点）
- [ ] 指数层级图谱结构（INDEX→L1→L2→SUB→STOCK）
- [ ] 图谱可视化组件 (D3.js，层级树形+网状双视图)
- [ ] 传导路径分析引擎
- [ ] 图谱手动编辑功能（增删改节点/关系）
- [ ] 变更历史日志
- [ ] 知识图谱交互页面 + 编辑页面

### Phase 5：决策层 (Week 9-10)
- [ ] ETF多因子综合评分系统
- [ ] AI ETF分析报告生成（含个股参考）
- [ ] ETF投资组合管理
- [ ] AI分析报告页面

### Phase 6：集成优化 (Week 11-12)
- [ ] 端到端联调
- [ ] 性能优化
- [ ] UI/UX 打磨
- [ ] 部署上线

---

## 附录 A：免责声明

本系统仅供投资研究参考，所有分析结果不构成投资建议。投资有风险，入市需谨慎。AI分析存在固有局限性，用户应结合自身判断做出投资决策。

## 附录 B：术语表

| 术语 | 说明 |
|------|------|
| MACD | 指数平滑异同移动平均线 |
| RSI | 相对强弱指数 |
| PE(TTM) | 滚动市盈率 |
| PB | 市净率 |
| VaR | 在险价值 |
| HBM | 高带宽内存 |
| CoWoS | 台积电先进封装技术 |
| CPO | 光电共封装（Co-Packaged Optics） |
| ETF | 交易所交易基金，跟踪特定指数/板块 |
| 溢折价率 | ETF市场价格与净值的偏差，正值为溢价，负值为折价 |
| 北向资金 | 通过沪深港通流入A股的境外资金 |
| 主力资金 | 大单(>50万)资金流向 |
| 资金情绪指数 | 综合主力/散户/杠杆资金方向的市场情绪指标 |
