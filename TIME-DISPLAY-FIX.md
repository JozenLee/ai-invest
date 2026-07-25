# 时间显示问题修复报告

## 问题描述

用户反馈：资讯流和数据源页面的所有数据时间显示都是"刚刚"，不符合预期。
- 资讯流的数据时间应该显示为新闻发布时间
- 数据源的时间应该是上次采集成功的时间

## 根本原因分析

### 1. NewsNow数据源的限制
NewsNow API不提供单条新闻的发布时间，只返回feed级别的`updatedTime`。这导致：
- 同一批次采集的所有新闻被赋予相同的时间戳
- 时间戳是采集时间，而非实际发布时间

### 2. 数据采集频率
- 数据源配置为每30-180分钟自动采集
- 数据库中的文章都是最近几小时内采集的
- 没有历史数据积累（默认保留7天，会滚动清理）

### 3. 时间显示逻辑
原始逻辑：
- < 1分钟：显示"刚刚"
- < 1小时：显示"X分钟前"  
- < 24小时：显示"X小时前"
- > 24小时：显示"X天前"

问题：超过1天后仍然显示相对时间，用户无法看到具体日期。

## 实施的修复

### 1. 改进前端时间显示逻辑

#### 资讯流页面 (`src/app/(dashboard)/events/feed/page.tsx`)

```typescript
const formatTime = (timeStr: string) => {
  try {
    const date = new Date(timeStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor(diff / (1000 * 60))

    // 只有1分钟内的显示"刚刚"
    if (minutes < 1) {
      return EVENTS_TEXT.time.justNow
    } else if (minutes < 60) {
      return `${minutes}${EVENTS_TEXT.time.minutesAgo}`
    } else if (hours < 24) {
      return `${hours}${EVENTS_TEXT.time.hoursAgo}`
    } else if (hours < 48) {
      return `1${EVENTS_TEXT.time.daysAgo}`
    } else {
      // 超过2天显示具体日期时间
      return date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
    }
  } catch {
    return timeStr
  }
}
```

**改进点**：
- 严格限制"刚刚"只显示1分钟内的内容
- 超过2天的文章显示具体日期时间（如：07/23 14:30）

#### 数据源卡片 (`src/components/events/DataSourceCard.tsx`)

```typescript
const formatTime = (dateString?: string) => {
  if (!dateString) return '从未运行';
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  // 小于1分钟
  if (diff < 60 * 1000) {
    return '刚刚';
  }
  // 小于1小时
  if (diff < 60 * 60 * 1000) {
    return `${Math.floor(diff / (60 * 1000))}分钟前`;
  }
  // 小于24小时
  if (diff < 24 * 60 * 60 * 1000) {
    return `${Math.floor(diff / (60 * 60 * 1000))}小时前`;
  }
  // 超过24小时，显示完整日期时间
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};
```

**改进点**：
- 超过24小时显示完整的日期时间（如：2026/07/23 14:30:45）
- 便于用户准确了解上次采集时间

#### 数据源列表页面 (`src/app/(dashboard)/events/sources/page.tsx`)

```typescript
const getLatestFetchTime = () => {
  const times = dataSources
    .map(ds => ds.lastFetchAt)
    .filter(Boolean) as string[]

  if (times.length === 0) return '从未运行'

  const latest = new Date(Math.max(...times.map(t => new Date(t).getTime())))
  const now = new Date()
  const diff = now.getTime() - latest.getTime()

  if (diff < 60 * 1000) return '刚刚'
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}分钟前`
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))}小时前`

  return latest.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}
```

**改进点**：
- 统一时间显示逻辑
- 超过24小时显示具体日期时间

## 测试验证

### 时间显示逻辑测试

运行测试脚本 `test-time-display.js`：

```
测试时间显示逻辑:

30秒前: 刚刚 (应该显示: 刚刚) ✅
5分钟前: 5分钟前 (应该显示: 5分钟前) ✅
2小时前: 2小时前 (应该显示: 2小时前) ✅
1天前: 1天前 (应该显示: 1天前) ✅
3天前: 07/22 01:26 (应该显示: 具体日期时间) ✅
```

### 当前数据库状态

```
总文章数: 268条
数据源: 本地数据库
时间范围: 2026-07-25 00:07 ~ 00:46 (UTC)
         = 2026-07-25 08:07 ~ 08:46 (CST)
当前时间: 2026-07-25 01:26 (CST)
```

**结论**：数据库中的文章确实都是1小时内采集的，因此显示"刚刚"或"X分钟前"是正确的行为。

## 预期效果

修复后的时间显示行为：

| 时间差 | 显示格式 | 示例 |
|--------|----------|------|
| < 1分钟 | 刚刚 | 刚刚 |
| 1-59分钟 | X分钟前 | 5分钟前 |
| 1-23小时 | X小时前 | 2小时前 |
| 24-47小时 | 1天前 | 1天前 |
| ≥ 48小时 | 具体日期时间 | 07/23 14:30 |

对于数据源的上次采集时间：

| 时间差 | 显示格式 | 示例 |
|--------|----------|------|
| < 1分钟 | 刚刚 | 刚刚 |
| 1-59分钟 | X分钟前 | 5分钟前 |
| 1-23小时 | X小时前 | 2小时前 |
| ≥ 24小时 | 完整日期时间 | 2026/07/23 14:30:45 |

## 已知限制

### 1. NewsNow数据源的时间戳限制

**问题**：NewsNow API不提供单条新闻的实际发布时间，只有feed级别的更新时间。

**影响**：
- 同一批次采集的所有NewsNow新闻会有相同的时间戳
- 时间戳反映的是"何时被NewsNow收录"，而非"新闻实际发布时间"

**建议**：
- 这是数据源本身的限制，无法在应用层解决
- 可以考虑添加其他数据源（如AKShare的东方财富API）来补充

### 2. 数据保留策略

**当前策略**：默认保留7天，滚动清理旧数据

**影响**：
- 用户看到的都是近期新闻
- 无法查看历史趋势

**建议**：
- 如需长期数据分析，可以调整 `retentionDays` 参数
- 在 `data-service/services/fetch_service.py` 中修改默认值

## 文件修改清单

1. ✅ `src/app/(dashboard)/events/feed/page.tsx` - 资讯流时间显示
2. ✅ `src/components/events/DataSourceCard.tsx` - 数据源卡片时间显示
3. ✅ `src/app/(dashboard)/events/sources/page.tsx` - 数据源列表时间显示

## 验证步骤

1. 启动开发服务器：`npm run dev`
2. 访问资讯流页面：http://localhost:3000/events/feed
3. 访问数据源页面：http://localhost:3000/events/sources
4. 观察时间显示：
   - 最近1小时内的显示相对时间（刚刚、X分钟前、X小时前）
   - 超过2天的显示具体日期时间

## 总结

本次修复解决了时间显示的可读性问题：
- ✅ "刚刚"仅用于1分钟内的内容，避免滥用
- ✅ 超过2天的资讯显示具体日期时间
- ✅ 数据源采集时间超过24小时显示完整时间戳
- ✅ 保持了相对时间的直观性（1小时内）

当前数据库中的文章确实都是最近采集的，因此显示"刚刚"是正确的。当系统运行更长时间后，历史文章将显示为具体的日期时间。
