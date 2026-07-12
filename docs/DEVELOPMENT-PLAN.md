# AI投资分析系统 — 开发路线图与技术指南

> 版本：v1.0 | 基于 PRD v1.1 MVP
> 创建日期：2026-07-12
> 定位：开发团队的技术实施指南

---

## 目录

1. [开发路线总览](#1-开发路线总览)
2. [里程碑与交付物](#2-里程碑与交付物)
3. [项目架构设计](#3-项目架构设计)
4. [模块详细设计](#4-模块详细设计)
5. [开发规范与约定](#5-开发规范与约定)
6. [扩展性设计](#6-扩展性设计)
7. [风险与应对](#7-风险与应对)

---

## 1. 开发路线总览

### 1.1 整体时间线

```
Week 1-2     Week 3-4     Week 5-6     Week 7-8     Week 9-10    Week 11-12
┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐
│ Phase 1  │  │ Phase 2  │  │ Phase 3  │  │ Phase 4  │  │ Phase 5  │  │ Phase 6  │
│ 基础框架 │→│ 基础数据 │→│ 事件驱动 │→│ 知识图谱 │→│ 决策层   │→│ 集成优化 │
│ 搭建     │  │ 层       │  │ 层       │  │ 层       │  │          │  │ 上线     │
└─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘
     │             │             │             │             │             │
     ▼             ▼             ▼             ▼             ▼             ▼
  项目骨架      数据管道      NLP管线      图谱引擎      AI决策       生产部署
  认证系统      指标计算      事件聚合      可视化        评分系统     性能优化
```

### 1.2 开发原则

| 原则 | 说明 |
|------|------|
| **分层解耦** | 四层架构独立开发，通过接口契约通信 |
| **数据先行** | 先确保数据采集稳定，再构建上层分析 |
| **MVP聚焦** | 严格控制MVP范围，P2功能留至后续迭代 |
| **可扩展性** | 接口设计预留扩展点，避免后期大规模重构 |
| **渐进增强** | 每个Phase都有可演示的交付物 |

### 1.3 技术栈确认

| 层面 | 技术选型 | 版本 | 说明 |
|------|---------|------|------|
| 前端框架 | Next.js (App Router) | 14.x | SSR/SSG，服务端组件 |
| UI组件库 | shadcn/ui | latest | 基于Radix UI，可定制 |
| 样式方案 | Tailwind CSS | 3.x | 原子化CSS |
| 图表库 | ECharts | 5.x | 丰富的金融图表类型 |
| 图谱可视化 | D3.js + react-force-graph | 7.x | 交互式力导向图 |
| 后端运行时 | Node.js | 20 LTS | Next.js API Routes |
| 数据库 | SQLite + Prisma ORM | 5.x | MVP阶段，后续可迁移 |
| 金融数据 | AKShare (Python) | latest | A股数据覆盖 |
| 海外数据 | Yahoo Finance (node-yahoo-finance2) | 2.x | 美股/港股 |
| AI服务 | Claude API (Anthropic) | latest | 大模型分析 |
| 认证 | NextAuth.js | v5 | 用户系统 |
| 定时任务 | node-cron | 3.x | 数据定时采集 |
| Python框架 | FastAPI | 0.100+ | 数据微服务 |
| 部署 | Docker + Vercel | - | 灵活部署 |

---

## 2. 里程碑与交付物

### Phase 1：基础框架搭建 (Week 1-2)

**目标**：建立项目骨架，完成基础设施搭建

#### 里程碑 M1.1：项目初始化 (Day 1-3)

| 任务 | 交付物 | 验收标准 |
|------|--------|---------|
| Next.js 项目初始化 | 可运行的项目骨架 | `npm run dev` 成功启动 |
| Prisma Schema 定义 | `prisma/schema.prisma` | 数据库迁移成功 |
| Tailwind + shadcn/ui 配置 | 基础主题配置 | 组件库可正常使用 |
| 目录结构规划 | 标准化目录结构 | 符合架构设计规范 |
| 环境变量配置 | `.env.example` | 包含所有必要配置项 |

#### 里程碑 M1.2：认证系统 (Day 4-7)

| 任务 | 交付物 | 验收标准 |
|------|--------|---------|
| NextAuth.js 集成 | 认证模块 | 注册/登录/登出流程完整 |
| 用户模型设计 | User + UserSetting | 支持用户偏好设置 |
| 会话管理 | JWT + Session | 登录状态持久化 |
| 基础API中间件 | 认证中间件 | 受保护路由正常拦截 |

#### 里程碑 M1.3：基础UI框架 (Day 8-14)

| 任务 | 交付物 | 验收标准 |
|------|--------|---------|
| 主布局组件 | Sidebar + Header + Content | 响应式布局正常 |
| 导航系统 | 路由配置 + 面包屑 | 所有页面可导航 |
| 主题系统 | Dark/Light Mode | 主题切换流畅 |
| 基础页面骨架 | 各模块空白页面 | 路由可达 |
| Python数据服务骨架 | FastAPI项目 | 服务可启动，健康检查通过 |

**Phase 1 交付物清单**：
- [ ] 可运行的Next.js项目
- [ ] 完整的数据库Schema
- [ ] 用户认证系统
- [ ] 基础UI框架和导航
- [ ] Python数据服务骨架

---

### Phase 2：基础数据层 (Week 3-4)

**目标**：构建完整的数据采集和计算管道

#### 里程碑 M2.1：数据采集服务 (Day 1-5)

| 任务 | 交付物 | 验收标准 |
|------|--------|---------|
| AKShare集成 | `data-service/market.py` | A股主要指数数据正常采集 |
| 行情数据采集 | StockDaily/IndexDaily写入 | 沪深300、科创50等数据完整 |
| ETF数据采集 | `data-service/etf.py` | 净值/份额/溢折价数据正常 |
| 宏观资金流采集 | `data-service/macro_flow.py` | 主力/北向/融资数据完整 |
| 板块资金流采集 | 板块资金流向数据 | 行业板块资金排名正常 |
| 定时任务配置 | node-cron任务 | 数据每日自动更新 |

#### 里程碑 M2.2：技术指标计算引擎 (Day 6-10)

| 任务 | 交付物 | 验收标准 |
|------|--------|---------|
| 趋势指标计算 | MA/MACD/DMI/SAR | 计算结果与行情软件一致 |
| 动量指标计算 | RSI/KDJ/CCI/WR | 计算结果准确 |
| 成交量指标 | OBV/VWAP/量比/换手率 | 计算结果准确 |
| 资金信号融合 | 多因子信号模型 | SignalOutput结构完整 |
| 指标缓存机制 | 技术指标缓存 | 避免重复计算 |

#### 里程碑 M2.3：数据API层 (Day 11-14)

| 任务 | 交付物 | 验收标准 |
|------|--------|---------|
| 市场概览API | `/api/market/overview` | 返回指数+板块数据 |
| 个股行情API | `/api/market/stock/:ticker` | 包含技术指标 |
| 资金流向API | `/api/market/capital-flow` | 主力/北向数据 |
| 宏观资金API | `/api/market/macro-capital` | 大盘/板块/机构数据 |
| ETF数据API | `/api/market/etf/:ticker` | 净值/份额/溢折价 |
| 板块资金排名API | `/api/market/sector-flow` | 板块资金排名 |

#### 里程碑 M2.4：仪表盘页面 (Day 12-14)

| 任务 | 交付物 | 验收标准 |
|------|--------|---------|
| 市场概览卡片 | 指数行情展示 | 实时数据展示正常 |
| AI硬件板块信号 | 信号仪表盘 | 多维度信号可视化 |
| 资金流向图表 | ECharts图表 | 趋势图/排名图正常 |
| ETF数据展示 | ETF卡片组件 | 关键指标展示完整 |

**Phase 2 交付物清单**：
- [ ] Python数据采集服务（AKShare集成）
- [ ] 技术指标计算引擎
- [ ] 资金流向数据管道
- [ ] 完整的数据API层
- [ ] 仪表盘页面（市场概览+资金流向）

---

### Phase 3：事件驱动层 (Week 5-6)

**目标**：构建新闻采集和NLP分析管道

#### 里程碑 M3.1：新闻采集服务 (Day 1-4)

| 任务 | 交付物 | 验收标准 |
|------|--------|---------|
| 新闻源适配器 | 可扩展的采集框架 | 支持多源接入 |
| AKShare新闻接口 | 行业新闻采集 | 财联社等源数据正常 |
| 新闻去重机制 | URL+标题去重 | 无重复入库 |
| 新闻存储 | NewsArticle模型 | 结构化存储完整 |

#### 里程碑 M3.2：NLP处理管线 (Day 5-10)

| 任务 | 交付物 | 验收标准 |
|------|--------|---------|
| Claude API集成 | AI服务封装 | API调用稳定 |
| 事件分类 | 8类事件分类 | 分类准确率>80% |
| 实体识别 | 公司/行业/产品/人物 | 识别准确 |
| 情感分析 | -1~+1评分 | 分析结果合理 |
| 影响力评估 | 1-5级影响力 | 评估逻辑清晰 |
| 摘要生成 | 一句话摘要 | 信息完整 |

#### 里程碑 M3.3：趋势聚合与展示 (Day 11-14)

| 任务 | 交付物 | 验收标准 |
|------|--------|---------|
| 领域趋势聚合 | SectorTrend计算 | 按板块聚合事件 |
| 事件流页面 | 资讯列表+筛选 | 分页/分类筛选正常 |
| 事件详情页 | AI分析结果展示 | 分析结果完整展示 |
| 趋势报告页 | 领域趋势报告 | 报告内容完整 |

**Phase 3 交付物清单**：
- [ ] 新闻采集服务
- [ ] NLP处理管线（Claude API）
- [ ] 事件分类与情感分析
- [ ] 领域趋势聚合
- [ ] 事件资讯页面

---

### Phase 4：知识图谱层 (Week 7-8)

**目标**：构建AI硬件产业链知识图谱

#### 里程碑 M4.1：图谱数据构建 (Day 1-4)

| 任务 | 交付物 | 验收标准 |
|------|--------|---------|
| 节点数据初始化 | GraphNode种子数据 | AI硬件产业链节点完整 |
| 指数层级结构 | INDEX→L1→L2→SUB→STOCK | 层级关系正确 |
| 产业链关系 | GraphEdge种子数据 | 传导关系完整 |
| ETF映射关系 | 节点-ETF关联 | 映射关系正确 |
| 个股关联数据 | GraphStock数据 | 龙头股关联完整 |

#### 里程碑 M4.2：图谱可视化 (Day 5-8)

| 任务 | 交付物 | 验收标准 |
|------|--------|---------|
| 层级树形视图 | D3树形图组件 | 层级展开/收起正常 |
| 网状力导向图 | react-force-graph | 节点/边交互正常 |
| 视图切换 | 层级↔网状切换 | 切换流畅 |
| 节点详情面板 | 右侧详情组件 | 信息展示完整 |
| 搜索与筛选 | 节点搜索+类型筛选 | 功能正常 |

#### 里程碑 M4.3：传导路径分析 (Day 9-11)

| 任务 | 交付物 | 验收标准 |
|------|--------|---------|
| 路径搜索算法 | BFS/DFS路径发现 | 能找到有效路径 |
| 传导逻辑生成 | AI生成传导说明 | 说明清晰合理 |
| 路径可视化 | 路径高亮展示 | 路径清晰可见 |
| 传导分析页面 | 触发事件→路径展示 | 交互流程完整 |

#### 里程碑 M4.4：图谱编辑功能 (Day 12-14)

| 任务 | 交付物 | 验收标准 |
|------|--------|---------|
| 节点CRUD | 增删改节点 | 操作正常，有确认 |
| 关系CRUD | 增删改关系 | 操作正常 |
| 变更日志 | GraphChangeLog记录 | 所有变更可追溯 |
| 编辑页面 | 图谱编辑UI | 编辑体验流畅 |
| 变更历史页面 | 日志列表+筛选 | 历史可查看 |

**Phase 4 交付物清单**：
- [ ] AI硬件产业链图谱数据
- [ ] 指数层级图谱结构
- [ ] 交互式图谱可视化（双视图）
- [ ] 传导路径分析引擎
- [ ] 图谱编辑功能
- [ ] 变更历史日志

---

### Phase 5：决策层 (Week 9-10)

**目标**：构建AI分析和评分系统

#### 里程碑 M5.1：ETF评分系统 (Day 1-5)

| 任务 | 交付物 | 验收标准 |
|------|--------|---------|
| 评分维度定义 | 7维度评分体系 | 维度权重合理 |
| 技术面评分 | 基于技术指标 | 评分逻辑清晰 |
| 资金面评分 | 基于资金流向 | 评分逻辑清晰 |
| 事件面评分 | 基于事件分析 | 评分逻辑清晰 |
| 产业链评分 | 基于图谱位置 | 评分逻辑清晰 |
| 综合评分 | 加权综合 | InvestmentScore完整 |

#### 里程碑 M5.2：AI分析报告 (Day 6-10)

| 任务 | 交付物 | 验收标准 |
|------|--------|---------|
| Prompt工程 | System Prompt模板 | 分析框架清晰 |
| Context注入 | 多层数据整合 | 数据完整注入 |
| ETF分析报告 | AIAnalysisResponse | 报告内容完整 |
| 个股参考分析 | 参考信息生成 | 仅作参考，非建议 |
| 报告缓存 | 分析结果缓存 | 避免重复调用 |

#### 里程碑 M5.3：投资组合管理 (Day 11-14)

| 任务 | 交付物 | 验收标准 |
|------|--------|---------|
| 组合CRUD | Portfolio/Holding管理 | 增删改查正常 |
| 持仓分析 | 盈亏/仓位计算 | 计算准确 |
| AI配置建议 | 基于持仓的建议 | 建议合理 |
| 分析报告页面 | 综合报告展示 | 信息展示完整 |
| 投资组合页面 | 持仓管理界面 | 操作流畅 |

**Phase 5 交付物清单**：
- [ ] ETF多因子综合评分系统
- [ ] AI ETF分析报告生成
- [ ] ETF投资组合管理
- [ ] AI分析报告页面
- [ ] 投资组合页面

---

### Phase 6：集成优化与上线 (Week 11-12)

**目标**：端到端联调、性能优化、部署上线

#### 里程碑 M6.1：集成测试 (Day 1-4)

| 任务 | 交付物 | 验收标准 |
|------|--------|---------|
| 端到端流程测试 | 测试用例 | 核心流程通过 |
| 数据一致性检查 | 数据校验报告 | 数据准确 |
| 边界场景测试 | 异常处理 | 优雅降级 |
| API集成测试 | Postman集合 | 接口正常 |

#### 里程碑 M6.2：性能优化 (Day 5-8)

| 任务 | 交付物 | 验收标准 |
|------|--------|---------|
| 数据库查询优化 | 索引优化 | 查询<200ms |
| API响应优化 | 缓存策略 | 热点数据缓存 |
| 前端性能优化 | 代码分割 | 首屏<3s |
| 图谱渲染优化 | 大数据量优化 | 100+节点流畅 |

#### 里程碑 M6.3：UI/UX打磨 (Day 9-11)

| 任务 | 交付物 | 验收标准 |
|------|--------|---------|
| 响应式适配 | 移动端布局 | 主流设备正常 |
| 错误处理 | 错误提示优化 | 用户友好 |
| 加载状态 | Loading/Skeleton | 体验流畅 |
| 数据空状态 | 空状态提示 | 引导清晰 |

#### 里程碑 M6.4：部署上线 (Day 12-14)

| 任务 | 交付物 | 验收标准 |
|------|--------|---------|
| Docker配置 | Dockerfile + compose | 容器可运行 |
| 环境配置 | 生产环境变量 | 配置完整 |
| 数据库迁移 | 生产数据库 | 数据完整 |
| 监控配置 | 基础监控 | 异常告警 |
| 文档完善 | 用户文档 | 使用说明完整 |

**Phase 6 交付物清单**：
- [ ] 集成测试通过
- [ ] 性能优化完成
- [ ] UI/UX打磨完成
- [ ] 生产环境部署
- [ ] 用户文档

---

## 3. 项目架构设计

### 3.1 目录结构

```
ai-invest/
├── src/                            # Next.js 主应用
│   ├── app/                        # App Router
│   │   ├── (auth)/                 # 认证相关路由组
│   │   │   ├── login/
│   │   │   │   └── page.tsx
│   │   │   └── register/
│   │   │       └── page.tsx
│   │   ├── (dashboard)/            # 主应用路由组
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx
│   │   │   ├── market/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── overview/
│   │   │   │   ├── sectors/
│   │   │   │   └── capital/
│   │   │   ├── events/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── feed/
│   │   │   │   ├── analysis/
│   │   │   │   └── trends/
│   │   │   ├── graph/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── explore/
│   │   │   │   ├── propagation/
│   │   │   │   ├── cycles/
│   │   │   │   ├── edit/
│   │   │   │   └── changelog/
│   │   │   ├── analysis/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── stock/
│   │   │   │   ├── sector/
│   │   │   │   └── report/
│   │   │   ├── portfolio/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── overview/
│   │   │   │   ├── optimize/
│   │   │   │   └── risk/
│   │   │   └── settings/
│   │   │       └── page.tsx
│   │   ├── api/                    # API Routes
│   │   │   ├── auth/
│   │   │   ├── market/
│   │   │   ├── events/
│   │   │   ├── graph/
│   │   │   ├── analysis/
│   │   │   └── portfolio/
│   │   ├── layout.tsx              # 根布局
│   │   └── page.tsx                # 首页重定向
│   │
│   ├── components/                 # 组件库
│   │   ├── ui/                     # shadcn/ui 基础组件
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── input.tsx
│   │   │   └── ...
│   │   ├── layout/                 # 布局组件
│   │   │   ├── sidebar.tsx
│   │   │   ├── header.tsx
│   │   │   ├── main-layout.tsx
│   │   │   └── breadcrumb.tsx
│   │   ├── market/                 # 市场数据组件
│   │   │   ├── index-card.tsx
│   │   │   ├── stock-chart.tsx
│   │   │   ├── capital-flow-chart.tsx
│   │   │   ├── sector-ranking.tsx
│   │   │   └── etf-card.tsx
│   │   ├── events/                 # 事件组件
│   │   │   ├── news-feed.tsx
│   │   │   ├── event-card.tsx
│   │   │   ├── sentiment-badge.tsx
│   │   │   └── trend-report.tsx
│   │   ├── graph/                  # 知识图谱组件
│   │   │   ├── tree-view.tsx       # 层级树形视图
│   │   │   ├── network-view.tsx    # 网状力导向图
│   │   │   ├── node-detail.tsx     # 节点详情面板
│   │   │   ├── path-display.tsx    # 传导路径展示
│   │   │   ├── graph-editor.tsx    # 图谱编辑器
│   │   │   └── changelog.tsx       # 变更历史
│   │   ├── analysis/               # 分析组件
│   │   │   ├── score-radar.tsx     # 评分雷达图
│   │   │   ├── etf-recommendation.tsx
│   │   │   ├── ai-report.tsx
│   │   │   └── risk-metrics.tsx
│   │   └── portfolio/              # 组合组件
│   │       ├── holding-table.tsx
│   │       ├── allocation-chart.tsx
│   │       └── performance-chart.tsx
│   │
│   ├── lib/                        # 核心库
│   │   ├── services/               # 业务服务层
│   │   │   ├── market.service.ts
│   │   │   ├── event.service.ts
│   │   │   ├── graph.service.ts
│   │   │   ├── analysis.service.ts
│   │   │   ├── portfolio.service.ts
│   │   │   └── score.service.ts
│   │   ├── models/                 # 数据模型层
│   │   │   ├── market.model.ts
│   │   │   ├── event.model.ts
│   │   │   ├── graph.model.ts
│   │   │   └── portfolio.model.ts
│   │   ├── indicators/             # 技术指标计算
│   │   │   ├── trend.ts            # MA/MACD/DMI/SAR
│   │   │   ├── momentum.ts         # RSI/KDJ/CCI/WR
│   │   │   ├── volume.ts           # OBV/VWAP/量比
│   │   │   ├── capital.ts          # 资金流向指标
│   │   │   └── index.ts            # 统一导出
│   │   ├── ai/                     # AI服务封装
│   │   │   ├── claude.ts           # Claude API客户端
│   │   │   ├── prompts/            # Prompt模板
│   │   │   │   ├── event-analysis.ts
│   │   │   │   ├── etf-report.ts
│   │   │   │   └── graph-suggest.ts
│   │   │   └── parser.ts           # 响应解析
│   │   ├── graph/                  # 图谱算法
│   │   │   ├── traversal.ts        # 图遍历算法
│   │   │   ├── propagation.ts      # 传导路径分析
│   │   │   ├── cycle.ts            # 周期分析
│   │   │   └── scoring.ts          # 图谱评分
│   │   ├── data-clients/           # 数据源客户端
│   │   │   ├── akshare.ts          # AKShare HTTP客户端
│   │   │   ├── yahoo.ts            # Yahoo Finance客户端
│   │   │   └── cache.ts            # 数据缓存层
│   │   ├── db/                     # 数据库工具
│   │   │   ├── prisma.ts           # Prisma客户端单例
│   │   │   └── migrations/         # 迁移文件
│   │   └── utils/                  # 工具函数
│   │       ├── date.ts
│   │       ├── number.ts
│   │       ├── format.ts
│   │       └── validation.ts
│   │
│   ├── hooks/                      # React Hooks
│   │   ├── useMarketData.ts
│   │   ├── useGraphData.ts
│   │   ├── useAnalysis.ts
│   │   └── usePortfolio.ts
│   │
│   ├── types/                      # TypeScript类型定义
│   │   ├── market.ts
│   │   ├── event.ts
│   │   ├── graph.ts
│   │   ├── analysis.ts
│   │   ├── portfolio.ts
│   │   └── common.ts
│   │
│   └── config/                     # 配置文件
│       ├── constants.ts            # 常量定义
│       ├── etf-pool.ts             # ETF池配置
│       ├── stock-pool.ts           # 股票池配置
│       └── sectors.ts              # 板块定义
│
├── data-service/                   # Python 数据微服务
│   ├── main.py                     # FastAPI入口
│   ├── routers/                    # 路由模块
│   │   ├── market.py
│   │   ├── financial.py
│   │   ├── capital_flow.py
│   │   ├── etf.py
│   │   └── macro_flow.py
│   ├── services/                   # 业务逻辑
│   │   ├── akshare_client.py
│   │   ├── data_processor.py
│   │   └── scheduler.py
│   ├── models/                     # 数据模型
│   │   └── schemas.py
│   ├── utils/                      # 工具函数
│   │   ├── logger.py
│   │   └── cache.py
│   └── requirements.txt
│
├── prisma/
│   ├── schema.prisma               # 数据库Schema
│   ├── seed.ts                     # 种子数据
│   └── migrations/                 # 迁移文件
│
├── scripts/                        # 脚本工具
│   ├── seed-graph.ts               # 图谱数据初始化
│   ├── sync-data.ts                # 数据同步脚本
│   └── build-indicators.ts         # 指标批量计算
│
├── docs/                           # 文档
│   ├── PRD-AI投资分析系统.md
│   ├── DEVELOPMENT-PLAN.md         # 本文档
│   └── API.md                      # API文档
│
├── docker/                         # Docker配置
│   ├── Dockerfile
│   ├── Dockerfile.python
│   └── docker-compose.yml
│
├── .env.example                    # 环境变量示例
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.ts
└── README.md
```

### 3.2 分层架构详解

```
┌─────────────────────────────────────────────────────────────────┐
│                        表现层 (Presentation)                      │
│   React Components + Pages + Hooks                               │
├─────────────────────────────────────────────────────────────────┤
│                        接口层 (API Layer)                         │
│   Next.js API Routes + Middleware                                │
├─────────────────────────────────────────────────────────────────┤
│                        服务层 (Service Layer)                     │
│   MarketService | EventService | GraphService | AnalysisService  │
│   PortfolioService | AIService | ScoreService                    │
├─────────────────────────────────────────────────────────────────┤
│                        领域层 (Domain Layer)                      │
│   Indicators | Graph Algorithms | Scoring Models | Prompts       │
├─────────────────────────────────────────────────────────────────┤
│                        数据层 (Data Layer)                        │
│   Prisma ORM | Data Clients | Cache Layer                        │
├─────────────────────────────────────────────────────────────────┤
│                        基础设施 (Infrastructure)                   │
│   SQLite | Python Data Service | Claude API | External APIs      │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 数据流架构

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  External    │     │  Python      │     │  Next.js     │
│  Data Sources│────▶│  Data Service│────▶│  API Routes  │
│  (AKShare等) │     │  (FastAPI)   │     │              │
└──────────────┘     └──────┬───────┘     └──────┬───────┘
                            │                     │
                            ▼                     ▼
                     ┌──────────────┐     ┌──────────────┐
                     │  SQLite      │◀───▶│  Service     │
                     │  (Prisma)    │     │  Layer       │
                     └──────────────┘     └──────┬───────┘
                                                 │
                                                 ▼
                                          ┌──────────────┐
                                          │  Claude API  │
                                          │  (NLP/AI)    │
                                          └──────┬───────┘
                                                 │
                                                 ▼
                                          ┌──────────────┐
                                          │  React       │
                                          │  Components  │
                                          └──────────────┘
```

### 3.4 服务间通信

```typescript
// Python数据服务 → Next.js (HTTP)
// Next.js通过HTTP调用Python服务获取原始数据

interface DataServiceClient {
  // 行情数据
  getStockDaily(ticker: string, start: string, end: string): Promise<StockDailyData[]>;
  getIndexDaily(code: string, start: string, end: string): Promise<IndexDailyData[]>;
  
  // ETF数据
  getETFDaily(ticker: string, start: string, end: string): Promise<ETFDailyData[]>;
  getETFProfile(ticker: string): Promise<ETFProfileData>;
  
  // 资金流向
  getMarketCapitalFlow(date: string): Promise<MarketCapitalFlowData>;
  getSectorCapitalFlow(date: string): Promise<SectorCapitalFlowData[]>;
  getNorthboundFlow(date: string): Promise<NorthboundFlowData>;
  
  // 财务数据
  getFinancialData(ticker: string): Promise<FinancialData>;
  getValuationMetrics(ticker: string): Promise<ValuationData>;
}
```

---

## 4. 模块详细设计

### 4.1 数据采集模块

#### 4.1.1 采集调度策略

```typescript
// src/config/scheduler.ts
export const SCHEDULE_CONFIG = {
  // 实时数据（交易时段）
  realtime: {
    interval: '*/5 * * * *',  // 每5分钟
    sources: ['stock_quote', 'index_quote'],
    tradingHours: { start: '09:30', end: '15:00' },
  },
  
  // 日级数据（收盘后）
  daily: {
    interval: '0 16 * * 1-5',  // 工作日16:00
    sources: ['stock_daily', 'etf_daily', 'capital_flow', 'northbound'],
  },
  
  // 周级数据
  weekly: {
    interval: '0 18 * * 5',  // 周五18:00
    sources: ['financial_data', 'etf_holding'],
  },
  
  // 月级数据
  monthly: {
    interval: '0 20 1 * *',  // 每月1日20:00
    sources: ['macro_data', 'industry_data'],
  },
  
  // 新闻采集（高频）
  news: {
    interval: '*/30 * * * *',  // 每30分钟
    sources: ['financial_news', 'company_announcement'],
  },
};
```

#### 4.1.2 数据采集抽象层

```typescript
// src/lib/data-clients/base.client.ts
export abstract class BaseDataClient<T> {
  protected cache: Map<string, { data: T; expiry: number }> = new Map();
  protected retryConfig = { maxRetries: 3, backoffMs: 1000 };
  
  abstract fetch(params: any): Promise<T>;
  
  async getWithCache(key: string, fetcher: () => Promise<T>, ttlMs: number): Promise<T> {
    const cached = this.cache.get(key);
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }
    
    const data = await this.withRetry(fetcher);
    this.cache.set(key, { data, expiry: Date.now() + ttlMs });
    return data;
  }
  
  protected async withRetry(fn: () => Promise<T>): Promise<T> {
    for (let i = 0; i < this.retryConfig.maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === this.retryConfig.maxRetries - 1) throw error;
        await this.sleep(this.retryConfig.backoffMs * Math.pow(2, i));
      }
    }
    throw new Error('Max retries exceeded');
  }
  
  private sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### 4.2 技术指标计算模块

#### 4.2.1 指标计算引擎

```typescript
// src/lib/indicators/engine.ts
export class IndicatorEngine {
  /**
   * 计算单个标的的所有技术指标
   */
  static calculateAll(dailyData: DailyData[]): IndicatorResult {
    const closes = dailyData.map(d => d.close);
    const highs = dailyData.map(d => d.high);
    const lows = dailyData.map(d => d.low);
    const volumes = dailyData.map(d => d.volume);
    
    return {
      trend: {
        ma: this.calculateMA(closes, [5, 10, 20, 60, 120, 250]),
        macd: this.calculateMACD(closes),
        dmi: this.calculateDMI(highs, lows, closes),
        sar: this.calculateSAR(highs, lows),
      },
      momentum: {
        rsi: this.calculateRSI(closes, [6, 12, 24]),
        kdj: this.calculateKDJ(highs, lows, closes),
        cci: this.calculateCCI(highs, lows, closes),
        wr: this.calculateWR(highs, lows, closes),
      },
      volume: {
        obv: this.calculateOBV(closes, volumes),
        vwap: this.calculateVWAP(highs, lows, closes, volumes),
        volumeRatio: this.calculateVolumeRatio(volumes),
        turnoverRate: 0, // 需要流通股本数据
      },
    };
  }
  
  /**
   * 生成多维度信号
   */
  static generateSignals(indicators: IndicatorResult, capitalFlow?: CapitalFlowData): SignalOutput {
    const trendSignal = this.evaluateTrend(indicators.trend);
    const momentumSignal = this.evaluateMomentum(indicators.momentum);
    const volumeSignal = this.evaluateVolume(indicators.volume);
    const capitalSignal = capitalFlow ? this.evaluateCapital(capitalFlow) : null;
    
    return {
      trend: trendSignal,
      momentum: momentumSignal,
      volume: volumeSignal,
      capital: capitalSignal,
      compositeScore: this.calculateCompositeScore([
        { score: trendSignal.score, weight: 0.3 },
        { score: momentumSignal.score, weight: 0.25 },
        { score: volumeSignal.score, weight: 0.2 },
        { score: capitalSignal?.score || 0, weight: 0.25 },
      ]),
    };
  }
}
```

#### 4.2.2 信号评分规则

```typescript
// src/lib/indicators/signals.ts
export const SIGNAL_RULES = {
  trend: {
    bullish: [
      { condition: 'MACD金叉', score: 15 },
      { condition: 'MA多头排列(5>10>20>60)', score: 20 },
      { condition: 'ADX>25且+DI>-DI', score: 15 },
      { condition: '价格站上SAR', score: 10 },
    ],
    bearish: [
      { condition: 'MACD死叉', score: -15 },
      { condition: 'MA空头排列', score: -20 },
      { condition: 'ADX>25且+DI<-DI', score: -15 },
      { condition: '价格跌破SAR', score: -10 },
    ],
  },
  momentum: {
    bullish: [
      { condition: 'RSI<30(超卖)', score: 15 },
      { condition: 'KDJ金叉且<20', score: 15 },
      { condition: 'RSI底背离', score: 20 },
    ],
    bearish: [
      { condition: 'RSI>70(超买)', score: -15 },
      { condition: 'KDJ死叉且>80', score: -15 },
      { condition: 'RSI顶背离', score: -20 },
    ],
  },
  volume: {
    bullish: [
      { condition: '放量上涨(量比>1.5)', score: 15 },
      { condition: 'OBV创新高', score: 10 },
    ],
    bearish: [
      { condition: '放量下跌', score: -15 },
      { condition: '缩量反弹', score: -10 },
    ],
  },
};
```

### 4.3 知识图谱模块

#### 4.3.1 图谱数据结构

```typescript
// src/lib/graph/types.ts
export interface GraphStore {
  nodes: Map<string, GraphNode>;
  edges: Map<string, GraphEdge>;
  
  // 索引
  nodesByType: Map<NodeType, Set<string>>;
  nodesByLevel: Map<number, Set<string>>;
  edgesBySource: Map<string, Set<string>>;
  edgesByTarget: Map<string, Set<string>>;
}

export interface GraphOperations {
  // 查询
  getNode(id: string): GraphNode | null;
  getChildren(nodeId: string): GraphNode[];
  getParent(nodeId: string): GraphNode | null;
  getNeighbors(nodeId: string): GraphNode[];
  getEdges(nodeId: string): GraphEdge[];
  
  // 路径
  findPaths(sourceId: string, targetId: string, maxDepth?: number): Path[];
  findPropagationPaths(triggerNodeId: string): PropagationPath[];
  
  // 遍历
  traverseTree(rootId: string, callback: (node: GraphNode) => void): void;
  traverseGraph(startId: string, depth: number, callback: (node: GraphNode) => void): void;
}
```

#### 4.3.2 传导路径算法

```typescript
// src/lib/graph/propagation.ts
export class PropagationAnalyzer {
  /**
   * 分析传导路径
   * 使用BFS + 剪枝策略
   */
  static analyze(
    graph: GraphStore,
    triggerEvent: EventAnalysis,
    maxDepth: number = 4,
    maxPaths: number = 10
  ): PropagationPath[] {
    // 1. 根据事件确定触发节点
    const triggerNodes = this.identifyTriggerNodes(graph, triggerEvent);
    
    // 2. BFS搜索传导路径
    const allPaths: Path[] = [];
    for (const triggerNode of triggerNodes) {
      const paths = this.bfsPaths(graph, triggerNode, maxDepth);
      allPaths.push(...paths);
    }
    
    // 3. 路径评分与排序
    const scoredPaths = allPaths.map(path => ({
      path,
      score: this.scorePath(path, triggerEvent),
    }));
    
    // 4. 返回Top-N路径
    return scoredPaths
      .sort((a, b) => b.score - a.score)
      .slice(0, maxPaths)
      .map(({ path, score }) => this.buildPropagationPath(path, triggerEvent, score));
  }
  
  /**
   * BFS路径搜索
   */
  private static bfsPaths(graph: GraphStore, startId: string, maxDepth: number): Path[] {
    const paths: Path[] = [];
    const queue: { nodeId: string; path: string[]; edges: GraphEdge[] }[] = [
      { nodeId: startId, path: [startId], edges: [] }
    ];
    
    while (queue.length > 0) {
      const { nodeId, path, edges } = queue.shift()!;
      
      if (path.length > maxDepth) continue;
      
      const outEdges = graph.edgesBySource.get(nodeId) || new Set();
      for (const edgeId of outEdges) {
        const edge = graph.edges.get(edgeId)!;
        const nextNode = edge.targetId;
        
        if (path.includes(nextNode)) continue; // 避免环
        
        const newPath = [...path, nextNode];
        const newEdges = [...edges, edge];
        
        paths.push({ nodes: newPath, edges: newEdges });
        
        queue.push({ nodeId: nextNode, path: newPath, edges: newEdges });
      }
    }
    
    return paths;
  }
  
  /**
   * 路径评分
   */
  private static scorePath(path: Path, event: EventAnalysis): number {
    let score = 0;
    
    // 边的置信度累积
    const avgConfidence = path.edges.reduce((sum, e) => sum + e.confidence, 0) / path.edges.length;
    score += avgConfidence * 30;
    
    // 路径长度惩罚（越短越好）
    score += Math.max(0, (5 - path.nodes.length)) * 10;
    
    // 关系权重累积
    const totalWeight = path.edges.reduce((sum, e) => sum + e.weight, 0);
    score += totalWeight * 20;
    
    // 事件相关性
    const eventRelevance = this.calculateEventRelevance(path, event);
    score += eventRelevance * 40;
    
    return score;
  }
}
```

#### 4.3.3 图谱可视化配置

```typescript
// src/components/graph/config.ts
export const GRAPH_VISUAL_CONFIG = {
  // 节点样式
  nodeStyles: {
    [NodeType.INDEX]: { size: 40, color: '#3b82f6', shape: 'diamond' },
    [NodeType.INDUSTRY_L1]: { size: 30, color: '#10b981', shape: 'circle' },
    [NodeType.INDUSTRY_L2]: { size: 25, color: '#f59e0b', shape: 'circle' },
    [NodeType.SUB_SECTOR]: { size: 20, color: '#8b5cf6', shape: 'circle' },
    [NodeType.STOCK]: { size: 15, color: '#6b7280', shape: 'circle' },
    // 产业链节点
    [NodeType.CHIP_DESIGN]: { size: 22, color: '#ef4444', shape: 'hexagon' },
    [NodeType.SERVER]: { size: 22, color: '#06b6d4', shape: 'hexagon' },
    [NodeType.OPTICAL_COMM]: { size: 22, color: '#ec4899', shape: 'hexagon' },
    // ...
  },
  
  // 边样式
  edgeStyles: {
    [RelationType.SUPPLY_CHAIN]: { color: '#94a3b8', width: 2, dash: false },
    [RelationType.DEMAND_DRIVER]: { color: '#22c55e', width: 2, dash: false },
    [RelationType.COMPETITION]: { color: '#ef4444', width: 1, dash: true },
    [RelationType.POLICY_IMPACT]: { color: '#f59e0b', width: 1, dash: true },
    // ...
  },
  
  // 力导向图参数
  forceConfig: {
    charge: { strength: -300, distanceMax: 300 },
    link: { distance: 100, strength: 0.3 },
    center: { strength: 0.05 },
    collision: { radius: 20 },
  },
};
```

### 4.4 AI分析模块

#### 4.4.1 Prompt工程框架

```typescript
// src/lib/ai/prompts/etf-report.ts
export const ETF_ANALYSIS_PROMPTS = {
  system: `你是一位资深科技行业投资分析师，专注于AI硬件产业链ETF配置分析。

## 分析框架
请基于以下维度进行综合分析：
1. 技术面分析：基于MA/MACD/RSI等技术指标判断趋势和买卖点
2. 资金面分析：主力资金/北向资金/融资融券等资金流向
3. 事件驱动分析：近期重要事件对板块的影响
4. 产业链传导分析：基于知识图谱的因果传导逻辑
5. 估值分析：PE/PB历史百分位，估值合理性
6. ETF质量：跟踪误差、流动性、规模

## 输出要求
- 分析逻辑清晰，有理有据
- 明确指出关键驱动因素和风险点
- 给出具体的操作建议（买入/持有/卖出）和仓位建议
- 所有建议附带置信度评估

## 风险提示
- 始终提醒用户投资风险
- 不做绝对性承诺
- 明确说明分析的局限性`,

  buildContext: (params: ETFAnalysisParams) => `
## 分析目标
ETF: ${params.ticker} (${params.name})
跟踪指数: ${params.trackingIndex}
当前价格: ${params.currentPrice}
用户问题: ${params.userQuestion || '请给出综合分析和操作建议'}

## 技术面数据
${formatTechnicalData(params.signals)}

## 资金面数据
${formatCapitalFlow(params.capitalFlow)}

## 近期重要事件
${formatRecentEvents(params.recentEvents)}

## 产业链传导路径
${formatPropagationPaths(params.graphPaths)}

## 用户持仓情况
${formatUserPortfolio(params.userContext)}
`,
};
```

#### 4.4.2 分析服务

```typescript
// src/lib/services/analysis.service.ts
export class AnalysisService {
  constructor(
    private marketService: MarketService,
    private eventService: EventService,
    private graphService: GraphService,
    private aiClient: ClaudeClient,
  ) {}
  
  /**
   * ETF综合分析
   */
  async analyzeETF(ticker: string, userId: string, question?: string): Promise<ETFAnalysisResult> {
    // 1. 获取ETF基础数据
    const etfData = await this.marketService.getETFData(ticker);
    
    // 2. 计算技术指标和信号
    const signals = await this.marketService.calculateSignals(ticker);
    
    // 3. 获取资金流向数据
    const capitalFlow = await this.marketService.getCapitalFlow(ticker);
    const macroCapital = await this.marketService.getMacroCapitalFlow();
    
    // 4. 获取相关事件
    const relatedEvents = await this.eventService.getRelatedEvents(ticker, 7);
    
    // 5. 获取产业链传导路径
    const graphPaths = await this.graphService.getPropagationPaths(ticker);
    
    // 6. 计算综合评分
    const score = await this.calculateScore({
      ticker,
      signals,
      capitalFlow,
      macroCapital,
      relatedEvents,
      graphPaths,
      etfData,
    });
    
    // 7. 生成AI分析报告
    const userContext = await this.getUserContext(userId);
    const aiReport = await this.aiClient.analyzeETF({
      ticker,
      name: etfData.name,
      trackingIndex: etfData.trackingIndex,
      currentPrice: etfData.close,
      signals,
      capitalFlow: { ...capitalFlow, macro: macroCapital },
      recentEvents: relatedEvents,
      graphPaths,
      userContext,
      userQuestion: question,
    });
    
    // 8. 保存分析记录
    await this.saveAnalysis(userId, 'etf', ticker, { score, aiReport });
    
    return { score, aiReport, graphPaths, recentEvents: relatedEvents };
  }
  
  /**
   * 计算综合评分
   */
  private async calculateScore(params: ScoreParams): Promise<InvestmentScore> {
    const dimensions = {
      technical: {
        score: this.scoreTechnical(params.signals),
        weight: 0.15,
      },
      capitalFlow: {
        score: this.scoreCapitalFlow(params.capitalFlow, params.macroCapital),
        weight: 0.20,
      },
      sentiment: {
        score: this.scoreSentiment(params.relatedEvents),
        weight: 0.10,
      },
      event: {
        score: this.scoreEvents(params.relatedEvents),
        weight: 0.15,
      },
      graph: {
        score: this.scoreGraph(params.graphPaths),
        weight: 0.15,
      },
      etfQuality: {
        score: this.scoreETFQuality(params.etfData),
        weight: 0.15,
      },
      valuation: {
        score: this.scoreValuation(params.ticker),
        weight: 0.10,
      },
    };
    
    const compositeScore = Object.values(dimensions).reduce(
      (sum, dim) => sum + dim.score * dim.weight,
      0
    );
    
    return {
      ticker: params.ticker,
      name: params.etfData.name,
      trackingIndex: params.etfData.trackingIndex,
      dimensions,
      compositeScore,
      rating: this.scoreToRating(compositeScore),
      confidence: this.calculateConfidence(dimensions),
    };
  }
}
```

### 4.5 Python数据服务

#### 4.5.1 服务结构

```python
# data-service/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from routers import market, financial, capital_flow, etf, macro_flow
from services.scheduler import DataScheduler

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时初始化调度器
    scheduler = DataScheduler()
    scheduler.start()
    yield
    # 关闭时停止调度器
    scheduler.stop()

app = FastAPI(
    title="AI投资分析系统 - 数据服务",
    version="1.0.0",
    lifespan=lifespan
)

# CORS配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(market.router, prefix="/api/market", tags=["market"])
app.include_router(financial.router, prefix="/api/financial", tags=["financial"])
app.include_router(capital_flow.router, prefix="/api/capital-flow", tags=["capital-flow"])
app.include_router(etf.router, prefix="/api/etf", tags=["etf"])
app.include_router(macro_flow.router, prefix="/api/macro-flow", tags=["macro-flow"])

@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}
```

#### 4.5.2 AKShare客户端封装

```python
# data-service/services/akshare_client.py
import akshare as ak
import pandas as pd
from functools import lru_cache
from datetime import datetime, timedelta
from typing import Optional, List, Dict

class AKShareClient:
    """AKShare数据客户端，封装常用数据接口"""
    
    def __init__(self):
        self._cache = {}
        self._cache_ttl = {}
    
    # ==================== 行情数据 ====================
    
    def get_stock_daily(
        self, 
        ticker: str, 
        start_date: str, 
        end_date: str,
        adjust: str = "qfq"
    ) -> pd.DataFrame:
        """获取个股日K数据"""
        cache_key = f"stock_daily_{ticker}_{start_date}_{end_date}"
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached
        
        df = ak.stock_zh_a_hist(
            symbol=ticker,
            period="daily",
            start_date=start_date,
            end_date=end_date,
            adjust=adjust
        )
        
        self._set_cache(cache_key, df, ttl=3600)  # 缓存1小时
        return df
    
    def get_index_daily(
        self, 
        code: str, 
        start_date: str, 
        end_date: str
    ) -> pd.DataFrame:
        """获取指数日K数据"""
        df = ak.stock_zh_index_daily(symbol=code)
        df = df[(df['date'] >= start_date) & (df['date'] <= end_date)]
        return df
    
    # ==================== ETF数据 ====================
    
    def get_etf_daily(self, ticker: str, start_date: str, end_date: str) -> pd.DataFrame:
        """获取ETF日K数据"""
        df = ak.fund_etf_hist_sina(symbol=ticker)
        df = df[(df['date'] >= start_date) & (df['date'] <= end_date)]
        return df
    
    def get_etf_nav(self, ticker: str) -> Dict:
        """获取ETF净值和份额"""
        df = ak.fund_etf_fund_info_em(fund=ticker)
        return df.to_dict('records')[0] if not df.empty else {}
    
    # ==================== 资金流向 ====================
    
    def get_market_capital_flow(self, date: str) -> Dict:
        """获取大盘资金流向"""
        df = ak.stock_market_fund_flow()
        return df.to_dict('records')[0] if not df.empty else {}
    
    def get_sector_capital_flow(self, date: str) -> List[Dict]:
        """获取板块资金流向"""
        df = ak.stock_sector_fund_flow_rank(indicator="今日")
        return df.to_dict('records')
    
    def get_northbound_flow(self, date: str) -> Dict:
        """获取北向资金流向"""
        df = ak.stock_hsgt_north_net_flow_in_em(symbol="北上")
        return df.to_dict('records')[0] if not df.empty else {}
    
    # ==================== 财务数据 ====================
    
    def get_financial_data(self, ticker: str) -> Dict:
        """获取财务数据"""
        # 资产负债表
        balance = ak.stock_financial_abstract_ths(symbol=ticker, indicator="按报告期")
        # 利润表
        profit = ak.stock_financial_analysis_indicator(symbol=ticker)
        
        return {
            "balance": balance.to_dict('records') if not balance.empty else [],
            "profit": profit.to_dict('records') if not profit.empty else [],
        }
    
    # ==================== 缓存管理 ====================
    
    def _get_cache(self, key: str) -> Optional[pd.DataFrame]:
        if key in self._cache:
            if datetime.now() < self._cache_ttl.get(key, datetime.min):
                return self._cache[key]
            else:
                del self._cache[key]
                del self._cache_ttl[key]
        return None
    
    def _set_cache(self, key: str, data: pd.DataFrame, ttl: int):
        self._cache[key] = data
        self._cache_ttl[key] = datetime.now() + timedelta(seconds=ttl)

# 全局单例
client = AKShareClient()
```

---

## 5. 开发规范与约定

### 5.1 代码规范

#### TypeScript规范

```typescript
// 1. 使用TypeScript严格模式
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}

// 2. 命名规范
// - 接口/类型：PascalCase
interface MarketOverview { }
type SignalDirection = 'bullish' | 'bearish' | 'neutral';

// - 变量/函数：camelCase
const stockPrice = 100;
function calculateMA() { }

// - 常量：UPPER_SNAKE_CASE
const MAX_RETRY_COUNT = 3;

// - 文件名：kebab-case
// market.service.ts
// capital-flow-chart.tsx

// 3. 导出规范
// 使用命名导出，避免默认导出
export class MarketService { }
export function calculateRSI() { }
export type { MarketData, StockDaily };

// 4. 错误处理
// 使用自定义错误类
export class DataServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'DataServiceError';
  }
}
```

#### React组件规范

```tsx
// 1. 组件定义
// 使用函数组件 + TypeScript
interface StockCardProps {
  ticker: string;
  name: string;
  price: number;
  change: number;
  onSelect?: (ticker: string) => void;
}

export function StockCard({ ticker, name, price, change, onSelect }: StockCardProps) {
  // Hooks在最前面
  const [isLoading, setIsLoading] = useState(false);
  
  // 事件处理
  const handleClick = useCallback(() => {
    onSelect?.(ticker);
  }, [ticker, onSelect]);
  
  // 渲染
  return (
    <Card onClick={handleClick}>
      {/* ... */}
    </Card>
  );
}

// 2. 组件导出
// 与文件名一致的命名导出
export { StockCard, StockCardProps };

// 3. Hook规范
// 自定义Hook以use开头
export function useMarketData(ticker: string) {
  const [data, setData] = useState<MarketData | null>(null);
  const [error, setError] = useState<Error | null>(null);
  
  useEffect(() => {
    // ...
  }, [ticker]);
  
  return { data, error, isLoading };
}
```

### 5.2 API规范

```typescript
// 1. 统一响应格式
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    page?: number;
    pageSize?: number;
    total?: number;
  };
}

// 2. API路由命名
// RESTful风格
GET    /api/market/stock/:ticker     # 获取单个
GET    /api/market/stocks            # 获取列表
POST   /api/market/stocks            # 创建
PUT    /api/market/stocks/:id        # 更新
DELETE /api/market/stocks/:id        # 删除

// 3. 错误码定义
export enum ErrorCode {
  // 认证相关
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  
  // 数据相关
  NOT_FOUND = 'NOT_FOUND',
  DATA_FETCH_ERROR = 'DATA_FETCH_ERROR',
  DATA_PARSE_ERROR = 'DATA_PARSE_ERROR',
  
  // 业务相关
  INVALID_TICKER = 'INVALID_TICKER',
  INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
  
  // AI相关
  AI_SERVICE_ERROR = 'AI_SERVICE_ERROR',
  AI_RATE_LIMIT = 'AI_RATE_LIMIT',
}
```

### 5.3 数据库规范

```prisma
// 1. 命名规范
// - 表名：PascalCase，复数形式
// - 字段名：camelCase
// - 索引：@@index([字段名])
// - 唯一约束：@@unique([字段1, 字段2])

// 2. 必备字段
model Example {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

// 3. 软删除（可选）
model SoftDeleteExample {
  id        String    @id @default(cuid())
  deletedAt DateTime?
  // 查询时添加 where: { deletedAt: null }
}
```

### 5.4 Git规范

```bash
# 提交信息格式
<type>(<scope>): <subject>

# type类型
feat:     新功能
fix:      Bug修复
docs:     文档
style:    代码格式
refactor: 重构
test:     测试
chore:    构建/工具

# 示例
feat(market): 添加ETF资金流向API
fix(graph): 修复传导路径计算错误
docs(api): 更新API文档
```

---

## 6. 扩展性设计

### 6.1 数据源扩展

```typescript
// 抽象数据源接口，便于后续接入更多数据源
export interface DataSource {
  name: string;
  type: 'domestic' | 'international';
  
  // 行情数据
  getStockQuote(ticker: string): Promise<StockQuote>;
  getStockDaily(ticker: string, range: DateRange): Promise<DailyData[]>;
  
  // 财务数据
  getFinancials(ticker: string): Promise<FinancialData>;
  
  // 资金流向
  getCapitalFlow(ticker: string): Promise<CapitalFlow>;
}

// 数据源注册表
export class DataSourceRegistry {
  private sources: Map<string, DataSource> = new Map();
  
  register(source: DataSource) {
    this.sources.set(source.name, source);
  }
  
  get(name: string): DataSource | undefined {
    return this.sources.get(name);
  }
  
  getByType(type: 'domestic' | 'international'): DataSource[] {
    return Array.from(this.sources.values()).filter(s => s.type === type);
  }
}

// 后续扩展示例：
// - 接入Wind数据源
// - 接入Bloomberg数据源
// - 接入东方财富Choice数据源
```

### 6.2 AI模型扩展

```typescript
// AI服务抽象层，便于后续切换或接入多个AI模型
export interface AIModelClient {
  name: string;
  
  // 文本分析
  analyzeText(prompt: string, context: string): Promise<string>;
  
  // 结构化输出
  analyzeStructured<T>(prompt: string, context: string, schema: ZodSchema<T>): Promise<T>;
  
  // 流式输出
  streamAnalysis(prompt: string, context: string): AsyncIterable<string>;
}

// AI服务工厂
export class AIServiceFactory {
  private static clients: Map<string, AIModelClient> = new Map();
  
  static register(client: AIModelClient) {
    this.clients.set(client.name, client);
  }
  
  static get(name: string): AIModelClient {
    const client = this.clients.get(name);
    if (!client) throw new Error(`AI client not found: ${name}`);
    return client;
  }
  
  // 后续扩展：
  // - 接入GPT-4
  // - 接入本地部署的开源模型
  // - 多模型投票机制
}
```

### 6.3 知识图谱扩展

```typescript
// 图谱领域扩展接口
export interface GraphDomain {
  name: string;  // 如 'ai_hardware', 'biotech', 'new_energy'
  
  // 节点类型定义
  nodeTypes: NodeTypeDefinition[];
  
  // 关系类型定义
  relationTypes: RelationTypeDefinition[];
  
  // 初始数据
  seedData: {
    nodes: GraphNode[];
    edges: GraphEdge[];
  };
  
  // 领域特定的传导规则
  propagationRules: PropagationRule[];
}

// 图谱领域注册
export class GraphDomainRegistry {
  private domains: Map<string, GraphDomain> = new Map();
  
  register(domain: GraphDomain) {
    this.domains.set(domain.name, domain);
  }
  
  get(name: string): GraphDomain | undefined {
    return this.domains.get(name);
  }
  
  // 后续扩展：
  // - 生物医药产业链
  // - 新能源产业链
  // - 消费电子产业链
}
```

### 6.4 评分模型扩展

```typescript
// 评分维度可配置
export interface ScoreDimension {
  name: string;
  weight: number;
  calculate: (data: any) => number;
  details: (data: any) => string[];
}

// 评分模型注册
export class ScoreModelRegistry {
  private dimensions: ScoreDimension[] = [];
  
  register(dimension: ScoreDimension) {
    this.dimensions.push(dimension);
  }
  
  calculate(data: any): InvestmentScore {
    const dimensionScores = this.dimensions.map(dim => ({
      name: dim.name,
      score: dim.calculate(data),
      weight: dim.weight,
      details: dim.details(data),
    }));
    
    const compositeScore = dimensionScores.reduce(
      (sum, dim) => sum + dim.score * dim.weight,
      0
    );
    
    return { dimensions: dimensionScores, compositeScore };
  }
  
  // 后续扩展：
  // - 添加宏观因子维度
  // - 添加ESG因子维度
  // - 自定义权重配置
}
```

### 6.5 功能扩展路线图

```
MVP完成后（Phase 7+）：

Phase 7: AI辅助图谱建议 (Week 13-14)
├── AI根据新事件建议图谱变更
├── 变更审核流程
└── 自动化程度提升

Phase 8: 数据驱动自动更新 (Week 15-16)
├── 基于数据变化自动调整节点状态
├── 关系权重自动校准
└── 周期位置自动判断

Phase 9: 风险量化模型 (Week 17-18)
├── VaR/CVaR计算
├── 压力测试场景
├── Monte Carlo模拟
└── 风险报告生成

Phase 10: 组合优化 (Week 19-20)
├── MPT有效前沿计算
├── Black-Litterman模型
├── 动态再平衡建议
└── 回测系统

Phase 11: 多市场扩展 (Week 21-24)
├── 美股行情数据接入
├── 港股行情数据接入
├── 跨市场ETF分析
└── 全球产业链图谱

Phase 12: 高级功能 (Week 25+)
├── 实时WebSocket推送
├── 移动端App
├── 社交功能（分享/讨论）
├── 付费订阅模式
└── 机构版定制
```

---

## 7. 风险与应对

### 7.1 技术风险

| 风险 | 影响 | 概率 | 应对措施 |
|------|------|------|---------|
| AKShare接口不稳定 | 数据采集中断 | 中 | 多数据源备份；重试机制；降级策略 |
| Claude API限流 | AI分析延迟 | 中 | 请求队列；结果缓存；本地模型备选 |
| 图谱渲染性能 | 大数据量卡顿 | 中 | 虚拟化渲染；按需加载；WebWorker计算 |
| SQLite并发限制 | 写入冲突 | 低 | 连接池；WAL模式；后续迁移PostgreSQL |
| 数据准确性 | 分析结果偏差 | 中 | 多源校验；人工抽查；异常检测 |

### 7.2 业务风险

| 风险 | 影响 | 概率 | 应对措施 |
|------|------|------|---------|
| 数据源变更 | 接口失效 | 中 | 抽象层隔离；快速适配 |
| 政策合规 | 法律风险 | 低 | 免责声明；不做投资建议 |
| 用户预期管理 | 使用体验 | 中 | 明确说明局限性；引导正确使用 |

### 7.3 应急预案

```typescript
// 数据源降级策略
export class DataFallbackStrategy {
  // 主数据源失败时的降级路径
  private static fallbackPaths: Record<string, string[]> = {
    'akshare': ['eastmoney', 'sina'],  // AKShare → 东方财富 → 新浪
    'yahoo': ['google', 'manual'],     // Yahoo → Google → 手动
    'claude': ['openai', 'local'],     // Claude → OpenAI → 本地模型
  };
  
  static async executeWithFallback<T>(
    primarySource: string,
    fetcher: (source: string) => Promise<T>
  ): Promise<T> {
    try {
      return await fetcher(primarySource);
    } catch (error) {
      const fallbacks = this.fallbackPaths[primarySource] || [];
      
      for (const fallback of fallbacks) {
        try {
          return await fetcher(fallback);
        } catch {
          continue;
        }
      }
      
      throw new Error(`All data sources failed for ${primarySource}`);
    }
  }
}
```

---

## 附录

### A. 环境变量配置

```bash
# .env.example

# 数据库
DATABASE_URL="file:./dev.db"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-here"

# Claude API
ANTHROPIC_API_KEY="your-api-key"
CLAUDE_MODEL="claude-sonnet-4-20250514"

# Python数据服务
DATA_SERVICE_URL="http://localhost:8000"

# Yahoo Finance
YAHOO_FINANCE_API_KEY="optional"

# 应用配置
APP_NAME="AI投资分析系统"
APP_URL="http://localhost:3000"
```

### B. 常用命令

```bash
# 开发
npm run dev              # 启动开发服务器
npm run dev:python       # 启动Python数据服务
npm run dev:all          # 同时启动两者

# 数据库
npx prisma migrate dev   # 运行迁移
npx prisma db seed       # 填充种子数据
npx prisma studio        # 打开数据库管理界面

# 构建
npm run build            # 构建生产版本
npm run start            # 启动生产服务器

# 测试
npm run test             # 运行测试
npm run test:watch       # 监视模式
npm run test:coverage    # 覆盖率报告

# 代码质量
npm run lint             # ESLint检查
npm run format           # Prettier格式化
npm run typecheck        # TypeScript类型检查
```

### C. 参考资源

| 资源 | 链接 | 说明 |
|------|------|------|
| Next.js文档 | https://nextjs.org/docs | 框架文档 |
| Prisma文档 | https://www.prisma.io/docs | ORM文档 |
| shadcn/ui | https://ui.shadcn.com | 组件库 |
| ECharts | https://echarts.apache.org/ | 图表库 |
| D3.js | https://d3js.org | 可视化库 |
| AKShare | https://akshare.akfamily.xyz | A股数据 |
| Claude API | https://docs.anthropic.com | AI服务 |

---

> **文档维护**：本文档应随项目演进持续更新，确保与实际实现保持一致。
