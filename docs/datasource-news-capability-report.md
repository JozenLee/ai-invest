# 数据源新闻采集能力完整报告

**生成时间**: 2026-07-21  
**目标**: 评估所有数据源的新闻/资讯采集能力，建立配置→采集→资讯流展示的完整流程

---

## 一、数据源能力总表

| 数据源 | 状态 | API可用性 | 是否需要登录 | 数据质量 | 采集方式 | 建议 |
|--------|------|----------|-------------|---------|---------|------|
| **AKShare** | ✅ 可用 | ✅ 真实API | ❌ 否 | ⭐⭐⭐⭐ | `get_news(keyword, limit)` | **推荐使用** |
| **雪球** | ⚠️ 受限 | ⚠️ API受限，降级到示例数据 | ✅ 需要Cookie | ⭐⭐ | `get_news(keyword, limit)` | 有条件使用 |
| **新浪** | ❌ 不支持 | ❌ 未实现 | - | - | - | 不支持新闻采集 |
| **Tushare** | ❌ 不支持 | ❌ 未实现 | ✅ 需要Token | - | - | 不支持新闻采集 |
| **微博** | ⚠️ 特殊 | ✅ 用户动态API | ✅ 需要登录 | ⭐⭐⭐ | `fetch_user_posts(uid, limit)` | 需要配置大V |
| **B站** | ⚠️ 特殊 | ✅ 视频/动态API | ❌ 否 | ⭐⭐⭐ | `fetch_user_videos(uid, limit)` | 需要配置UP主 |
| **小红书** | ❌ 不可用 | ❌ 无公开API | ✅ 需要登录 | - | - | 需要爬虫或官方合作 |

---

## 二、可用数据源详细分析

### 2.1 AKShare（推荐）✅

**API接口**: `ak.stock_news_em(symbol=keyword)`

**优势**:
- ✅ 真实财经新闻数据（东方财富）
- ✅ 无需登录认证
- ✅ 数据格式标准（DataFrame）
- ✅ 已验证可用（获取10条真实数据）

**数据字段**:
```python
{
    "新闻标题": "...",
    "新闻内容": "...",  
    "新闻链接": "...",
    "发布时间": "2024-07-21 10:00:00",
    # 注意: 缺少"来源"字段，需要补充为"东方财富"
}
```

**配置示例**:
```json
{
  "id": "akshare_cailian",
  "name": "财联社-AKShare",
  "provider": "akshare",
  "driverType": "api",
  "keywords": ["财联社", "AI"],
  "limit": 50,
  "schedule": "0 */1 * * *"
}
```

**采集流程**: ✅ 完整可用
1. 配置 → 数据源表（DataSource）
2. 定时任务触发 → `fetch_service.execute_fetch_task()`
3. 调用 → `AKShareProvider.get_news(keyword="AI", limit=50)`
4. AI处理 → 情感分析、分类、实体识别
5. 存储 → NewsArticle表
6. 展示 → `/api/events/feed` → 前端资讯流

---

### 2.2 雪球 ⚠️

**API接口**: 
- `https://xueqiu.com/statuses/hot/listV2.json` （热门动态）
- `https://xueqiu.com/statuses/stock_timeline.json` （7x24快讯）

**优势**:
- ✅ 实时性强（股市讨论）
- ✅ 已实现get_news接口

**限制**:
- ⚠️ 需要有效Cookie（需要访问xueqiu.com获取）
- ⚠️ API可能返回400/403（反爬虫）
- ⚠️ 当前降级到示例数据（获取3条模拟数据）

**数据字段**:
```python
{
    "新闻标题": "...",
    "新闻内容": "...",
    "新闻链接": "https://xueqiu.com/...",
    "发布时间": "2024-07-21 10:00:00",
    "来源": "雪球"
}
```

**配置示例**:
```json
{
  "id": "xueqiu_ai",
  "name": "雪球-AI资讯",
  "provider": "xueqiu",
  "driverType": "api",
  "keywords": ["AI", "GPU"],
  "limit": 50,
  "schedule": "0 */2 * * *"
}
```

**采集流程**: ⚠️ 需要解决Cookie问题
1. 配置 → 数据源表
2. 定时任务触发 → `fetch_service.execute_fetch_task()`
3. 调用 → `XueqiuProvider.get_news(keyword="AI", limit=50)`
4. **问题**: 当前API受限，返回示例数据
5. **解决方案**: 
   - 配置有效Cookie（从浏览器获取）
   - 或使用示例数据进行开发测试

---

### 2.3 微博（特殊场景）⚠️

**API接口**: `https://m.weibo.cn/api/container/getIndex`

**特点**:
- ✅ 不是通用新闻接口，是用户动态接口
- ✅ 需要配置大V账号UID列表
- ✅ 适合监控特定KOL的观点

**使用方式**:
```python
# 不使用get_news()，而是:
provider = WeiboProvider()
posts = await provider.fetch_user_posts(uid="1234567890", limit=20)
```

**数据字段**:
```python
{
    "id": "微博ID",
    "content": "微博正文",
    "url": "https://weibo.com/...",
    "publish_time": "2024-07-21T10:00:00",
    "author": "作者昵称",
    "likes": 1000,
    "comments": 100,
    "reposts": 50
}
```

**配置示例**:
```json
{
  "id": "weibo_kol_ai",
  "name": "微博-AI大V动态",
  "provider": "weibo",
  "driverType": "social",
  "accounts": [
    {"uid": "1234567890", "name": "AI科技评论"},
    {"uid": "0987654321", "name": "芯片观察"}
  ],
  "limit": 20,
  "schedule": "0 */3 * * *"
}
```

**采集流程**: ⚠️ 需要单独处理
- **不能直接用** `fetch_service.execute_fetch_task()`
- **需要实现** 专门的社交媒体采集逻辑
- **或者**: 为WeiboProvider实现统一的`get_news()`接口

---

### 2.4 B站（特殊场景）⚠️

**API接口**: 
- `https://api.bilibili.com/x/space/arc/search` （用户视频）
- `https://api.bilibili.com/x/web-interface/search/all/v2` （搜索）

**特点**:
- ✅ 公开API，无需登录
- ✅ 适合获取科技UP主的视频内容
- ⚠️ 视频内容不是传统"新闻"

**使用方式**:
```python
provider = BilibiliProvider()
videos = await provider.fetch_user_videos(uid=123456, limit=20)
# 或搜索（但当前未实现get_news）
```

**配置建议**: 
- 配置知名科技UP主（如：硬核拆解、科技美学等）
- 需要单独的视频内容采集逻辑

---

### 2.5 小红书 ❌

**状态**: 不可用

**原因**:
- ❌ 无公开API
- ❌ 需要登录认证
- ❌ 反爬虫机制强

**建议**: 暂不集成，或等待官方API合作

---

## 三、完整采集流程（以雪球为参考）

### 3.1 配置阶段

**数据库配置**（Prisma Schema）:
```prisma
model DataSource {
  id          String   @id @default(cuid())
  name        String   // "雪球-AI资讯"
  provider    String   // "xueqiu"
  driverType  String   // "api"
  config      Json     // {"keywords": ["AI"], "limit": 50}
  status      String   @default("active")
  schedule    String?  // "0 */1 * * *"
  
  logs        DataSourceLog[]
  articles    NewsArticle[]
}
```

**插入配置**:
```typescript
await prisma.dataSource.create({
  data: {
    id: "xueqiu_ai",
    name: "雪球-AI资讯",
    provider: "xueqiu",
    driverType: "api",
    config: {
      keywords: ["AI", "GPU", "算力"],
      limit: 50
    },
    schedule: "0 */1 * * *",
    status: "active"
  }
});
```

---

### 3.2 采集阶段

**触发方式**:
1. **定时任务**: 每小时自动触发（由scheduler_service管理）
2. **手动触发**: UI点击"立即采集"按钮

**执行流程**（`fetch_service.py`）:
```python
# 1. 获取数据源配置
source_config = {
    "provider": "xueqiu",
    "driverType": "api",
    "keywords": ["AI"],
    "limit": 50
}

# 2. 根据provider获取对应的Provider实例
provider = XueqiuProvider()

# 3. 调用get_news采集数据
raw_data = await provider.get_news(keyword="AI", limit=50)
# 返回: DataFrame with ["新闻标题", "新闻内容", "新闻链接", "发布时间", "来源"]

# 4. 转换为字典列表
news_list = []
for idx, row in raw_data.iterrows():
    news_list.append({
        "title": row["新闻标题"],
        "content": row["新闻内容"],
        "url": row["新闻链接"],
        "publishTime": row["发布时间"],
        "source": row["来源"]
    })

# 5. AI处理（情感分析、分类、实体识别）
processed_data = await content_analyzer.analyze_news_batch(news_list)

# 6. 存储到NewsArticle表
for item in processed_data:
    await db.insert_news_article({
        "id": hashlib.md5(item["url"].encode()).hexdigest(),
        "title": item["title"],
        "content": item["content"],
        "url": item["url"],
        "publishTime": item["publishTime"],
        "source": item["source"],
        "sourceId": "xueqiu_ai",
        "category": item["category"],
        "sentiment": item["sentiment"],
        "keywords": json.dumps(item["keywords"]),
        "entities": json.dumps(item["entities"])
    })

# 7. 更新采集日志
await db.create_datasource_log({
    "sourceId": "xueqiu_ai",
    "status": "success",
    "fetchedCount": 50,
    "processedCount": 45,
    "failedCount": 5
})
```

---

### 3.3 展示阶段

**API接口**: `GET /api/events/feed`

**查询逻辑**:
```typescript
// src/app/api/events/feed/route.ts
const articles = await prisma.newsArticle.findMany({
  where: {
    sourceId: filters.source || undefined,  // 可按数据源筛选
    category: filters.category || undefined,
    publishTime: {
      gte: startDate,
      lte: endDate
    }
  },
  orderBy: { publishTime: 'desc' },
  take: 50
});
```

**前端展示**:
```tsx
// src/app/(dashboard)/events/feed/page.tsx
{articles.map((article) => (
  <Card key={article.id}>
    <h3>{article.title}</h3>
    <p>{article.content}</p>
    <div>
      <Badge>{article.source}</Badge>
      <Badge>{article.category}</Badge>
      <SentimentBadge sentiment={article.sentiment} />
    </div>
    <time>{article.publishTime}</time>
  </Card>
))}
```

---

## 四、问题与解决方案

### 4.1 雪球API访问受限 ⚠️

**问题**: 当前返回空响应或403错误

**原因**:
- Cookie失效或缺失
- IP被限流
- User-Agent检测

**解决方案**:
1. **手动获取Cookie**:
   ```bash
   # 浏览器访问 xueqiu.com
   # 开发者工具 → Network → 找到API请求 → 复制Cookie
   # 配置到环境变量或数据库
   ```

2. **使用代理**（如果需要）

3. **降级策略**:
   - 当前已实现：API失败 → 返回示例数据
   - 示例数据仅用于开发测试，不应用于生产

### 4.2 社交媒体数据源未统一 ⚠️

**问题**: 微博/B站/小红书没有实现统一的`get_news()`接口

**解决方案**:

**方案A: 适配器模式**（推荐）
```python
# 为每个社交媒体Provider实现get_news()适配器
class WeiboProvider(DataProvider):
    async def get_news(self, keyword: str = "", limit: int = 50) -> pd.DataFrame:
        """适配器：将fetch_user_posts转换为get_news格式"""
        # 1. 获取配置的大V账号列表
        accounts = self.config.get("accounts", [])
        
        # 2. 并发采集所有账号
        all_posts = []
        for account in accounts:
            posts = await self.fetch_user_posts(account["uid"], limit)
            all_posts.extend(posts)
        
        # 3. 转换为标准DataFrame格式
        records = []
        for post in all_posts:
            records.append({
                "新闻标题": post["content"][:50] + "...",
                "新闻内容": post["content"],
                "新闻链接": post["url"],
                "发布时间": post["publish_time"],
                "来源": "微博"
            })
        
        return pd.DataFrame(records)
```

**方案B: 独立采集服务**
- 保持社交媒体Provider独立
- 创建专门的`social_fetch_service.py`
- 不使用统一的`fetch_service`

---

## 五、最终建议

### 5.1 立即可用的数据源 ✅

| 数据源 | 优先级 | 配置难度 | 数据质量 | 建议 |
|--------|-------|---------|---------|------|
| **AKShare** | ⭐⭐⭐⭐⭐ | 低 | 高 | **立即集成，作为主力数据源** |
| **雪球** | ⭐⭐⭐ | 中 | 中 | 解决Cookie问题后使用 |

### 5.2 需要额外开发的数据源 ⚠️

| 数据源 | 需要工作 | 预计工时 |
|--------|---------|---------|
| 微博 | 实现get_news适配器 + 配置大V列表 | 2小时 |
| B站 | 实现get_news适配器 + 配置UP主列表 | 2小时 |
| 小红书 | 获取API权限或实现爬虫 | 1周+ |

### 5.3 推荐的数据源配置方案

**Phase 1: MVP（当前）**
- ✅ AKShare（财联社新闻）
- ⚠️ 雪球（解决Cookie后启用）

**Phase 2: 增强（1周内）**
- ✅ 微博大V监控（实现适配器）
- ✅ B站UP主视频（实现适配器）

**Phase 3: 完善（后续）**
- 小红书（需要官方合作）
- 其他财经媒体RSS

---

## 六、验证清单

### 6.1 AKShare数据源验证 ✅

- [x] Provider实现get_news接口
- [x] API调用成功返回真实数据
- [x] 数据格式符合标准
- [x] 可通过fetch_service执行采集
- [x] AI处理流程正常
- [x] 存储到数据库成功
- [x] 前端资讯流正常显示

### 6.2 雪球数据源验证 ⚠️

- [x] Provider实现get_news接口
- [ ] API调用成功（当前受限）
- [x] 数据格式符合标准
- [x] 降级到示例数据可用
- [ ] 需要解决Cookie问题

### 6.3 社交媒体数据源验证 ⏳

- [ ] 实现统一的get_news适配器
- [ ] 配置大V/UP主账号列表
- [ ] 测试采集流程
- [ ] 集成到前端展示

---

## 七、总结

### ✅ 可直接使用（无需修改）
- **AKShare**: 已验证可用，推荐作为主力数据源

### ⚠️ 需要配置（可快速启用）
- **雪球**: 需要解决Cookie问题，或使用示例数据测试

### ⏳ 需要开发（2-4小时工作量）
- **微博**: 实现get_news适配器
- **B站**: 实现get_news适配器

### ❌ 暂不建议
- **新浪**: 未实现新闻接口
- **Tushare**: 未实现新闻接口
- **小红书**: 无公开API

---

**完整流程已验证**: 配置（DataSource表）→ 采集（FetchService）→ AI处理（ContentAnalyzer）→ 存储（NewsArticle表）→ 展示（/api/events/feed）

**推荐优先级**: AKShare > 雪球（解决Cookie后） > 微博/B站（实现适配器后）
