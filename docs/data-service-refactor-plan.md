# 数据服务分层与定频更新开发计划

## 目标

将当前“页面请求触发外部数据源”的模式，改造成“后台定频采集、数据落盘、上层只读本地快照”的模式。第一阶段以 ETF 为主线，打通 ETF 注册、派生数据集、频率配置、本地优先读取和运行记录；后续扩展到指数、成分股、财报、公告和资讯。

## 当前基线

- Next.js 综合分析包含新版 13 步工作流和旧版模块化流水线。
- FastAPI 路由通过 `DataService`、`ProviderRegistry`、`ETFProvider`、`StockProvider` 直接访问 AKShare、Tushare、东方财富、NewsNow 等 Provider。
- 当前缓存主要是进程内内存、JSON 文件和可选 Redis，不是统一的业务数据资产层。
- Prisma 已有 `ETFDaily`、`ETFHolding`、`StockDaily`、`IndexDaily`、`NewsArticle`，但综合分析仍以请求时抓取为主。
- `DataSource`/`SchedulerJob` 主要面向新闻和社交数据源，不适合表达“一个 ETF 派生多个数据集任务”。

## 目标架构

```text
外部 Provider
  -> 采集编排器（订阅展开、交易时段、限流、重试、幂等写入）
  -> SQLite 数据资产（规范化表、原始响应、运行记录、质量/新鲜度）
  -> 本地查询服务（统一 freshness/source/quality）
  -> 市场页、综合分析页、图谱页
```

页面查询不直接等待外部 Provider。外部采集失败时返回最近快照，并显式标记 `freshness=stale|expired|unavailable`。

## 数据模型路线

### 第一阶段（本分支实现）

- `Instrument`：ETF/股票/指数统一标的主数据。
- `DataSubscription`：注册一个标的及其订阅配置。
- `SubscriptionDataset`：一个订阅下的具体数据集和交易/非交易时段频率。
- `DataFetchRun`：采集运行记录，记录状态、来源、条数、耗时和错误。

第一阶段先关联已有 `ETFDaily`、`ETFHolding`，不破坏旧表；财报、公告和原始响应表在后续迁移中加入。

### 后续阶段

- `StockFinancialReport`、`StockAnnouncement`、`RawPayload`。
- ETF/股票/指数分钟快照表。
- 数据质量、来源更新时间、采集时间和内容哈希字段。

## API 设计

### 订阅管理

- `GET /api/data-subscriptions`：查询订阅和数据集状态。
- `POST /api/data-subscriptions`：注册 ETF，并按默认模板创建行情、持仓、成分股行情、财报、公告数据集。
- `PATCH /api/data-subscriptions/{id}`：启停订阅或更新配置。
- `DELETE /api/data-subscriptions/{id}`：删除订阅及其数据集配置，不删除历史行情。
- `POST /api/data-subscriptions/{id}/refresh`：触发后台刷新请求并记录运行状态。

### 本地查询

- `GET /api/data/local/etfs/{code}`：本地 ETF 最新行情和历史。
- `GET /api/data/local/etfs/{code}/holdings`：本地 ETF 持仓。
- 后续增加股票、指数、财报、公告和资讯查询。

## 调度策略

| 数据集 | 交易时段 | 非交易时段 |
|---|---:|---:|
| ETF 实时行情 | 1–3 分钟 | 30–60 分钟 |
| ETF 日线 | 收盘后一次 | 每日一次 |
| ETF 持仓 | 每日一次 | 每日一次 |
| 成分股行情 | 3–5 分钟 | 60 分钟或停采 |
| 财报 | 每日一次 | 每日一次 |
| 公告 | 10–15 分钟 | 30–60 分钟 |

频率由 `SubscriptionDataset` 保存。调度器根据交易日历选择 `tradingIntervalSeconds` 或 `closedIntervalSeconds`，并在重启时从数据库恢复任务。

## 实施阶段

1. **契约与模型**：统一代码、时间和 freshness 协议；加入订阅、数据集、运行记录模型。
2. **ETF 垂直切片**：新增注册 API/UI；本地读取 ETF 日线和持仓；综合分析改为本地优先。
3. **采集编排器**：实现订阅展开、去重锁、限流、重试、WAL 和幂等写入。
4. **指数和市场数据**：迁移市场概览、资金流、指数历史到本地查询。
5. **企业数据资产**：落盘成分股行情、财报、公告及原始响应。
6. **资讯资产**：统一产业资讯本地查询和标签更新。
7. **灰度切换**：旧接口保留兼容层，按 ETF 行情→持仓→企业→资讯→综合分析顺序切换。

## 本阶段验收标准

- 可以在 UI 注册 ETF，并看到自动创建的数据集和不同频率配置。
- 订阅和数据集状态落盘，重启后可恢复。
- 综合分析 ETF 行情、持仓优先查询本地 SQLite。
- 本地无数据时保持现有 Provider 兜底行为。
- API 返回 `source`、`fetchedAt`、`freshness` 元数据。
- `npm run typecheck` 和相关 API 测试通过。

## 风险与约束

- 不重置当前工作树已有改动。
- 不在本阶段一次性迁移所有 Provider，避免影响现有新闻和社交采集。
- 财报、公告需要单独的规范化模型和内容哈希，不能继续塞入工作流临时产物。
- SQLite 写入必须串行化或使用 WAL，避免调度任务并发锁库。
