# 市场页面样式对齐更新

## 更新时间
2026-07-28

## 更新内容

### 1. 市场概览页面 (`/market/overview`)

**移除的组件：**
- ❌ 市场情绪卡片（Gauge指标）
- ❌ 北向资金卡片
- ❌ 市场资金流向概览卡片

**保留的核心功能：**
- ✅ 主要指数行情展示（5个宽基指数）
- ✅ 实时/收盘状态标识
- ✅ 数据来源与更新时间
- ✅ 错误提示与服务状态检查

**样式改进：**
- 统一使用 `space-y-8` 间距
- 对齐仪表盘的标题样式（emoji + 标题）
- 统一格式化函数（`formatNumber`, `getChangeColor`, `getChangeSymbol`）
- 改进响应式布局（`grid-cols-2 md:grid-cols-3 lg:grid-cols-5`）
- 添加收盘数据标注

---

### 2. 资金流向页面 (`/market/capital`)

**移除的标签页：**
- ❌ 板块轮动分析（rotation）
- ❌ ETF资金流向（etf）

**保留的核心功能：**
- ✅ 资金流向概览（4个关键指标卡片）
  - 机构净流入
  - 散户净流入
  - 大盘总净流入
  - 北向净流入
- ✅ 板块排名（综合排名）
- ✅ Top10 资金流入板块
- ✅ Top10 资金流出板块

**样式改进：**
- 统一使用 `space-y-8` 间距
- 对齐仪表盘的标题样式
- 统一格式化函数
- 简化标签页结构（3个核心标签）
- 改进卡片布局和hover效果
- 添加数据质量提示（估算数据、缓存数据）

**移除的依赖：**
- 删除额外的数据获取逻辑（`fetchExtraData`）
- 移除 `useState` 和 `useEffect` hooks
- 简化数据结构，仅使用 MarketContext 提供的数据

---

## 设计原则

1. **一致性优先**：三个页面（仪表盘、市场概览、资金流向）使用统一的：
   - 格式化函数命名
   - 颜色方案（红涨绿跌）
   - 卡片样式和间距
   - Badge 和状态标识

2. **简洁聚焦**：
   - 移除冗余或参考价值低的组件
   - 每个页面聚焦核心功能
   - 避免重复展示相同数据

3. **响应式设计**：
   - 移动端 2 列
   - 平板 3-4 列
   - 桌面 5 列

4. **状态透明**：
   - 清晰标识实时/收盘状态
   - 显示数据来源和更新时间
   - 数据质量警告（估算、缓存）

---

## 页面功能对比

| 功能 | 仪表盘 | 市场概览 | 资金流向 |
|------|--------|----------|----------|
| 主要指数 | ✅ | ✅ | ❌ |
| 资金流向卡片 | ✅ | ❌ | ✅ |
| 板块Top10流入 | ✅ | ❌ | ✅ |
| 板块Top10流出 | ✅ | ❌ | ✅ |
| 板块综合排名 | ❌ | ❌ | ✅ |
| 高级指标 | ✅ | ❌ | ❌ |

---

## 技术细节

**统一的格式化函数：**
```typescript
const formatNumber = (num: number | undefined | null, decimals = 2) => {
  if (num === undefined || num === null || isNaN(num)) return '0.00'
  return num.toFixed(decimals)
}

const getChangeColor = (change: number | undefined | null) => {
  if (change === undefined || change === null) return 'text-gray-500'
  return change >= 0 ? 'text-red-500' : 'text-green-500'
}

const getChangeSymbol = (change: number | undefined | null) => {
  if (change === undefined || change === null) return ''
  return change >= 0 ? '▲' : '▼'
}
```

**统一的标题样式：**
```tsx
<h2 className="text-lg font-semibold">📊 标题</h2>
```

**统一的间距：**
```tsx
<div className="space-y-8">
  {/* 页面内容 */}
</div>
```

---

## 验证

✅ TypeScript 类型检查通过
✅ 保留所有核心功能
✅ 移除冗余组件
✅ 样式完全对齐
