# 事件驱动UI页面优化设计

## 概述

对事件驱动系统下的四个 UI 页面（事件资讯、数据源管理、大V监控、领域趋势）进行统一重构，解决以下问题：

1. `fetchSchedulerStatus` 运行时错误（客户端直连 localhost:8000）
2. shadcn/ui 组件及部分标签的英文文本改为中文
3. 领域趋势页加载缓慢（前后端同时优化）
4. 页面布局重新设计为现代 dashboard 风格

## 方案选择

采用**统一重构**方案：先建立公共组件体系，再统一改造所有事件页面。

## 公共组件体系

### 布局组件

| 组件 | 职责 |
|------|------|
| `EventPageLayout` | 页面容器，标题区 + 内容区 |
| `PageHeader` | 页面标题 + 描述 + 操作按钮区 |
| `StatCardGrid` | 数据概览卡片网格（响应式 2-4 列） |
| `StatCard` | 单个指标卡片（图标 + 数值 + 趋势 + 标签） |
| `ContentSection` | 带标题的内容区块 |

### 功能组件

| 组件 | 职责 |
|------|------|
| `FilterBar` | 搜索框 + 筛选标签 + 排序选择 |
| `StatusBadge` | 状态标签（运行中/已停止/离线） |
| `SentimentTag` | 情感标签（利好/利空/中性） |
| `LoadingSkeleton` | 页面级骨架屏 |
| `EmptyState` | 空状态提示 |
| `ErrorState` | 错误/离线降级展示 |

### 文件结构

```
src/components/events/
├── EventPageLayout.tsx
├── PageHeader.tsx
├── StatCard.tsx
├── StatCardGrid.tsx
├── FilterBar.tsx
├── StatusBadge.tsx
├── SentimentTag.tsx
├── LoadingSkeleton.tsx
├── EmptyState.tsx
└── ErrorState.tsx
```

### 统一页面结构（三段式）

```
┌─────────────────────────────────────────┐
│  PageHeader（标题 + 描述 + 操作按钮）      │
├─────────────────────────────────────────┤
│  StatCardGrid（2-4个关键指标卡片）         │
├─────────────────────────────────────────┤
│  FilterBar（搜索 + 筛选 + 排序）          │
├─────────────────────────────────────────┤
│  主内容区（列表/图表/卡片网格）            │
└─────────────────────────────────────────┘
```

## 各页面设计

### 事件资讯（Feed）

- 顶部统计：今日新闻数、利好/利空事件数、平均情感分
- 筛选栏：搜索 + 情感筛选（全部|利好|利空|中性）+ 排序
- 主内容：新闻卡片列表（标题+摘要+来源+时间+情感标签）

### 数据源管理（Sources）

- 顶部统计：数据源总数、运行中、已停止、上次采集时间
- 调度器状态区：在线时显示状态卡片，离线时显示 ErrorState 降级
- 主内容：数据源分类卡片网格

### 大V监控（Influencers）

- 顶部统计：关注大V数、今日动态数、平台覆盖数、最新采集时间
- 筛选栏：搜索 + 平台筛选 + 领域筛选
- 主内容：大V卡片网格

### 领域趋势（Trends）

- 顶部统计：监控领域数、利好信号数、风险信号数、趋势评分
- 领域选择标签栏
- 主内容分两列：左侧驱动/风险因素列表，右侧传导路径图 + 领域概览

## Bug 修复：fetchSchedulerStatus

### API 代理路由

新建 `src/app/api/events/scheduler/status/route.ts`：
- 服务端调用 `${DATA_SERVICE_URL}/api/scheduler/status`
- 5 秒超时 + AbortSignal
- 错误时返回 `{ status: 'offline', message: '调度服务暂时不可用' }`

### 客户端改造

`sources/page.tsx` 中三处 `localhost:8000` 调用全部改为 Next.js API 路由：
- `fetchSchedulerStatus` → `GET /api/events/scheduler/status` → 代理 `GET ${DATA_SERVICE_URL}/api/scheduler/status`
- `handleManualFetch` → `POST /api/events/scheduler/fetch` → 代理 `POST ${DATA_SERVICE_URL}/api/scheduler/fetch`
- `handleToggleScheduler` → `POST /api/events/scheduler/toggle` → 代理 `POST ${DATA_SERVICE_URL}/api/scheduler/toggle`

所有新路由统一使用 5 秒超时 + AbortSignal。请求失败时设置 `{ status: 'offline' }`，UI 展示 ErrorState。

## 中文化方案

### 常量文件

创建 `src/constants/events-text.ts`：

```typescript
export const EVENTS_TEXT = {
  common: {
    loading: '加载中...',
    noResults: '暂无数据',
    search: '搜索...',
    refresh: '刷新',
    all: '全部',
    confirm: '确认',
    cancel: '取消',
  },
  feed: {
    title: '事件资讯',
    description: '实时追踪市场动态',
    // ...
  },
  sources: {
    title: '数据源管理',
    description: '管理采集源与调度任务',
    // ...
  },
  influencers: {
    title: '大V监控',
    description: '跟踪意见领袖动态',
    // ...
  },
  trends: {
    title: '领域趋势',
    description: '洞察行业发展方向',
    // ...
  },
}
```

### shadcn/ui 组件覆盖

通过 props 传入中文文本：
- `Select` placeholder → "请选择..."
- `Command` emptyMessage → "暂无结果"
- `Input` placeholder → 具体搜索提示文本
- 其他组件默认英文全部显式覆盖

## 领域趋势性能优化

### 前端优化

- 使用 `useRef` 缓存已请求过的领域数据
- 切换领域：有缓存立即展示（后台静默刷新），无缓存显示骨架屏
- 趋势数据和传导路径独立加载，互不阻塞
- 骨架屏替代空白转圈

### 后端优化（propagation route）

- 移除 keyword `contains` 文本全表搜索 fallback
- domain 无 graphNodeIds 时直接返回空结果 + `{ nodes: [], edges: [], message: '暂无传导路径数据' }`
- 有数据时用 `where: { id: { in: ids } }` 精确查询

## 样式规范

| 属性 | 值 |
|------|-----|
| 卡片圆角 | `rounded-xl` |
| 卡片阴影 | `shadow-sm` |
| 指标数字 | `text-2xl font-bold` |
| Section 间距 | `space-y-6` |
| 卡片内边距 | `p-6` |
| StatCardGrid 响应式 | 移动端 2 列，桌面 4 列 |
| 利好颜色 | 绿色（green） |
| 利空颜色 | 红色（red） |
| 中性颜色 | 灰色（gray） |

复用项目现有的 oklch CSS 自定义属性和 shadcn/ui 主题变量。
