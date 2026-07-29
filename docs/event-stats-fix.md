# 资讯流页面统计数据修正

## 问题描述

资讯流页面（`/events/feed`）存在以下问题：
1. **今日新闻数量不准确**：统计的是筛选后的新闻数量，而不是今日全部新闻
2. **利好/利空事件数量不准确**：同样基于筛选后的数据计算
3. **平均情感分组件**：需要移除

## 根本原因

原有实现中，统计数据的计算基于 `news` 状态变量，该变量存储的是**经过筛选后的新闻列表**。当用户选择分类、领域、情感等筛选条件时，`news` 数组会变化，导致统计数据也随之变化。

```typescript
// ❌ 错误的实现
const getTodayNews = () => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return news.filter(article => {
    const publishDate = new Date(article.publishTime)
    return publishDate >= today
  }).length
}
```

## 解决方案

### 1. 添加独立的统计数据状态

创建一个独立的 `todayStats` 状态，存储今日全部新闻的统计数据：

```typescript
const [todayStats, setTodayStats] = useState({
  total: 0,
  bullish: 0,
  bearish: 0,
})
```

### 2. 创建独立的统计数据获取函数

添加 `fetchTodayStats` 函数，获取今日全部新闻（不受筛选条件影响）：

```typescript
const fetchTodayStats = async () => {
  try {
    // 获取大量新闻（假设今天不会超过1000条）
    const response = await fetch('/api/events/feed?limit=1000&sortBy=publishTime')
    if (response.ok) {
      const data = await response.json()
      if (data.success && data.data?.items) {
        // 在客户端过滤出今天的新闻
        const today = new Date()
        today.setHours(0, 0, 0, 0)

        const todayNews = data.data.items.filter((article: NewsArticle) => {
          const publishDate = new Date(article.publishTime)
          return publishDate >= today
        })

        const bullish = todayNews.filter((article: NewsArticle) =>
          article.sentiment && article.sentiment > 0.2
        ).length

        const bearish = todayNews.filter((article: NewsArticle) =>
          article.sentiment && article.sentiment < -0.2
        ).length

        setTodayStats({
          total: todayNews.length,
          bullish,
          bearish,
        })
      }
    }
  } catch (error) {
    console.error('获取今日统计失败:', error)
  }
}
```

### 3. 在组件加载时获取统计数据

```typescript
useEffect(() => {
  fetchCategories()
  fetchDomains()
  fetchDataSources()
  fetchTodayStats() // 新增
}, [])
```

### 4. 在SSE更新时刷新统计数据

```typescript
const { isConnected, lastEvent } = useNewsStream({
  onUpdate: useCallback((data: any) => {
    console.log('收到SSE更新:', data)
    setUpdateCount(prev => prev + 1)
    if (data.type === 'batch_completed' || data.type === 'news_updated') {
      setTimeout(() => {
        fetchNews()
        fetchTodayStats() // 新增
      }, 500)
    }
  }, [])
})
```

### 5. 移除旧的统计计算函数

删除以下函数：
- `getTodayNews()`
- `getBullishEvents()`
- `getBearishEvents()`
- `getAvgSentiment()`

### 6. 更新StatCard组件

```typescript
{/* 统计卡片 */}
<StatCardGrid>
  <StatCard
    icon={Newspaper}
    label={EVENTS_TEXT.feed.stats.todayNews}
    value={todayStats.total}
    variant="default"
  />
  <StatCard
    icon={TrendingUp}
    label={EVENTS_TEXT.feed.stats.bullishEvents}
    value={todayStats.bullish}
    variant="success"
  />
  <StatCard
    icon={TrendingDown}
    label={EVENTS_TEXT.feed.stats.bearishEvents}
    value={todayStats.bearish}
    variant="danger"
  />
  {/* 移除了平均情感分的 StatCard */}
</StatCardGrid>
```

## 技术细节

### 为什么使用客户端过滤？

由于当前 `/api/events/feed` 接口不支持 `startDate` 参数，我们选择：
1. 获取大量新闻（limit=1000）
2. 在客户端通过 JavaScript 过滤出今日新闻
3. 计算统计数据

这种方式的优点：
- 无需修改后端API
- 实现简单快速
- 1000条记录的客户端过滤性能可接受

### 情感判断标准

- **利好**：`sentiment > 0.2`
- **利空**：`sentiment < -0.2`
- **中性**：`-0.2 <= sentiment <= 0.2`

## 修改文件

- `src/app/(dashboard)/events/feed/page.tsx` - 主要修改文件

## 测试方法

1. 启动开发服务器：
```bash
npm run dev
```

2. 访问资讯流页面：
```
http://localhost:3000/events/feed
```

3. 验证要点：
   - 统计卡片只显示3个（今日新闻、利好、利空）
   - 今日新闻数量应该是今天全部新闻，不受筛选条件影响
   - 选择不同的筛选条件时，统计数字保持不变
   - 新闻列表会根据筛选条件变化

4. 运行测试脚本：
```bash
bash scripts/test-event-stats.sh
```

## 预期效果

✅ 今日新闻数量显示正确（基于全部数据）
✅ 利好事件数量显示正确（基于全部数据）
✅ 利空事件数量显示正确（基于全部数据）
✅ 平均情感分组件已移除
✅ 统计数据不受筛选条件影响
✅ 统计数据在SSE更新时自动刷新

## 后续优化建议

如果性能成为问题，可以考虑：
1. 在后端API添加 `startDate` 和 `endDate` 参数
2. 创建专门的统计API端点：`GET /api/events/stats/today`
3. 使用数据库聚合查询直接返回统计数据

## 完成时间

2026-07-30
