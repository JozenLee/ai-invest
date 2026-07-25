# 时间显示问题 - 完整诊断报告

## 执行总结

### ✅ 已完成的工作

1. **前端时间显示优化**
   - 资讯流页面：超过2天显示具体日期时间（如：07/23 14:30）
   - 数据源页面：超过24小时显示完整时间戳
   - 避免所有内容都显示"刚刚"

2. **数据源验证**
   - ✅ 确认AKShare能获取真实发布时间（2026-07-23 19:32:00）
   - ✅ 确认NewsNow只能获取采集时间
   - ✅ 系统中已有5个AKShare数据源配置

3. **问题定位**
   - ✅ 找到根本原因：数据采集后在处理环节被完全过滤
   - ✅ 采集流程：获取5条 → 处理0条 → 存储0条

### ❌ 未解决的核心问题

**数据被过滤的原因**：
- 采集到的数据经过AI分析后，没有任何数据通过领域筛选
- 即使禁用AI分析（`ENABLE_AI_ANALYSIS=false`），数据仍然被过滤
- 可能原因：
  1. 简单规则处理后的分类/情感数据不符合存储要求
  2. 领域匹配逻辑过于严格，导致所有数据被过滤
  3. 数据验证环节有未知的限制条件

## 当前状态

### 数据库状态
```
总文章数: 268条
数据源分布:
  - 华尔街见闻-NewsNow: 大部分
  - 澎湃财经-NewsNow: 少量
  - AKShare数据: 0条 ❌

时间范围:
  - 所有文章都在今天凌晨00:04-00:46之间
  - 时间跨度仅0.7小时
```

### 用户体验
- ✅ 前端已优化，能正确显示历史时间
- ❌ 但数据库中没有历史数据，所以都显示"刚刚"或"X分钟前"
- ❌ 用户看不到新闻的真实发布时间

## 推荐解决方案

由于深入修复数据采集流程需要：
1. 详细分析AI处理和领域筛选逻辑
2. 修改数据验证和过滤规则
3. 可能涉及数据库Schema调整

**我建议采用以下务实方案：**

### 方案A：使用NewsNow但说明时间含义（最快）⭐️

**优点**：
- 无需修改后端代码
- 立即可用
- 数据稳定可靠

**实施**：在前端添加时间说明

```typescript
// src/app/(dashboard)/events/feed/page.tsx

<div className="flex items-center gap-4 text-xs text-muted-foreground">
  <span>{formatTime(article.publishTime)}</span>
  {article.source.includes('NewsNow') && (
    <span className="text-xs text-muted-foreground">
      (NewsNow收录时间)
    </span>
  )}
  {article.sentiment !== undefined && (
    <span>情感: {(article.sentiment * 100).toFixed(0)}%</span>
  )}
</div>
```

### 方案B：绕过AI处理直接存储（需要代码修改）

修改 `data-service/services/fetch_service.py`，在数据采集后直接存储，跳过所有处理环节：

```python
# 在 _store_to_database 方法中
# 为AKShare数据源添加特殊处理，直接存储原始数据
if source_config.get('provider') == 'akshare':
    # 跳过AI处理和领域筛选，直接存储
    for item in raw_data:
        article_data = {
            "title": item.get("title"),
            "content": item.get("content"),  
            "publishTime": item.get("publishTime"),  # 使用原始时间
            "source": item.get("source"),
            "url": item.get("url"),
            "category": "market",  # 默认分类
            "sentiment": 0.0,  # 默认情感
            # ... 其他字段
        }
        await db.insert_news_article(article_data)
```

### 方案C：修复领域匹配逻辑（最彻底但最复杂）

需要深入调试：
1. 为什么简单规则处理后的数据被过滤？
2. 领域匹配的具体逻辑是什么？
3. 数据验证有哪些隐藏条件？

这需要逐行调试 `fetch_service.py` 和相关的数据库操作。

## 前端已优化的代码

### 1. 资讯流页面时间显示

文件：`src/app/(dashboard)/events/feed/page.tsx:257-277`

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

### 2. 数据源卡片时间显示

文件：`src/components/events/DataSourceCard.tsx:74-100`

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

## 技术发现

### NewsNow的局限性
- API不提供单条新闻的真实发布时间
- 网站使用客户端渲染，无法通过简单爬取获取时间
- 所有新闻共享同一个`updatedTime`（feed更新时间）

### AKShare的优势
- 提供真实的`发布时间`字段（精确到秒）
- 数据来自东方财富等主流财经API
- **但数据在采集流程中被完全过滤，无法入库**

### 数据采集流程问题
```
获取原始数据 ✅ (5条)
    ↓
AI分析/简单规则处理 ⚠️ (返回数据)
    ↓
领域筛选/数据验证 ❌ (全部过滤)
    ↓
存入数据库 ❌ (0条)
```

## 建议下一步行动

### 立即可做（前端方案）

在资讯流页面添加时间说明，让用户理解NewsNow的时间含义：

```bash
# 编辑 src/app/(dashboard)/events/feed/page.tsx
# 在时间显示旁边添加说明
```

### 需要进一步调试（后端方案）

1. 在`data-service/services/fetch_service.py`中添加详细日志
2. 跟踪数据在处理流程中的变化
3. 找出具体的过滤条件
4. 修改或移除过滤逻辑

### 长期优化

1. 重新设计数据采集流程，使其更加灵活
2. 将AI分析设为可选功能，而不是必需流程
3. 添加数据质量监控和告警机制

## 总结

✅ **前端已优化**：当有历史数据时，能正确显示具体日期
❌ **后端问题**：AKShare采集的带真实时间的数据被过滤，无法入库  
⚠️ **当前状态**：只有NewsNow数据（采集时间），所以都显示"刚刚"
🔧 **推荐方案**：在前端添加说明，或修改后端绕过过滤逻辑

**注意**：这是一个数据流水线问题，不是简单的配置问题。需要深入调试后端代码才能彻底解决。
