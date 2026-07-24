# 领域趋势页面重构设计

## 设计日期
2026-07-25

## 背景
当前领域趋势页面只支持单领域查看，缺少AI深度分析。需要重构为支持概览模式和深度模式的混合架构，根据可配置的新闻数量生成投资参考趋势。

## 核心需求

### 用户需求
1. **概览模式**：一次查看所有领域的趋势对比
2. **深度模式**：单领域的详细AI分析
3. **可配置新闻数量**：用户选择分析最近N条新闻（20/50/100/200）
4. **混合刷新策略**：默认显示缓存，支持手动刷新
5. **分析透明度**：显示用于分析的具体新闻列表
6. **跨领域关联**：展示领域间的关联关系

### 技术需求
1. 轻量级概览（不调用AI）+ 完整深度分析（调用AI）
2. 分级缓存（概览30分钟，深度60分钟）
3. 基于Domain.keywords的新闻筛选
4. 独立路由设计

## 系统架构

### 路由设计

```
前端：
  /events/trends - 概览页（所有领域卡片）
  /events/trends/[domain] - 深度分析页（单领域详情）

Next.js API：
  GET /api/events/trends/summary?newsCount={n} - 所有领域轻量级摘要
  GET /api/events/trends/analysis?domain={code}&newsCount={n} - 单领域完整分析
  POST /api/events/trends/refresh?domain={code} - 手动刷新缓存

Python API：
  GET /api/trends/summary?newsCount={n} - 后端摘要服务
  GET /api/trends/analysis?domain={code}&newsCount={n} - 后端详细分析服务
```

### 数据流

**概览模式**：
```
用户访问 /events/trends
  ↓
前端调用 /api/events/trends/summary?newsCount=50
  ↓
Next.js检查缓存（30min TTL）
  ↓ 缓存未命中
调用Python /api/trends/summary
  ↓
TrendAnalysisService.analyze_all_domains_lightweight()
  - 获取所有活跃Domain及其keywords
  - 筛选最近N条新闻
  - 按Domain.keywords分组新闻
  - 统计情绪分布（基于关键词）
  - TF-IDF提取关键主题
  - 生成模板化文本
  ↓
返回并缓存结果
  ↓
前端渲染领域卡片网格
```

**深度模式**：
```
用户点击领域卡片
  ↓
路由跳转到 /events/trends/[domain]
  ↓
前端调用 /api/events/trends/analysis?domain=半导体&newsCount=50
  ↓
Next.js检查缓存（60min TTL）
  ↓ 缓存未命中
调用Python /api/trends/analysis
  ↓
TrendAnalysisService.analyze_domain_detailed()
  - 筛选领域相关新闻（基于keywords）
  - 调用Claude API生成完整趋势分析
  - 查询GraphEdge获取关联领域
  - 调用Claude生成关联说明
  - 返回新闻列表
  ↓
返回并缓存结果
  ↓
前端渲染深度分析页面
```

## 功能设计

### 1. 概览模式

#### 页面布局
- 顶部：新闻数量选择器（20/50/100/200） + 刷新按钮
- 网格：领域趋势卡片（3列响应式布局）

#### 领域卡片内容

```
┌─────────────────────────────────┐
│ 半导体                          │
│ ─────────────────────────────  │
│ 趋势：↗ 看涨  置信度：75%      │
│                                 │
│ 📊 情绪分布                     │
│ 看涨: 12 | 中性: 5 | 看跌: 3   │
│                                 │
│ 相关新闻：20条                  │
│                                 │
│ ✓ 关键驱动：                   │
│   • AI芯片需求增长             │
│   • 国产替代加速               │
│                                 │
│ ⚠ 关键风险：                   │
│   • 出口管制政策               │
│   • 产能过剩风险               │
│                                 │
│ 短期展望：                      │
│ 市场情绪偏向乐观，关注政策...  │
│                                 │
│ [查看详情 →]                   │
└─────────────────────────────────┘
```

#### 数据生成逻辑（轻量级）

1. **情绪分布统计**：
   - 正面关键词：上涨、利好、突破、增长、扩产
   - 负面关键词：下跌、利空、风险、限制、下滑
   - 计算正负面新闻占比

2. **关键驱动/风险提取**：
   - 使用TF-IDF提取高频主题词
   - 正面新闻中的高频词→关键驱动
   - 负面新闻中的高频词→关键风险
   - 取Top 2

3. **趋势方向**：
   - 看涨：bullish > 50%
   - 中性：abs(bullish - bearish) < 20%
   - 看跌：bearish > 50%

4. **置信度**：
   - confidence = newsCount / 50 * 0.5 + sentimentClarity * 0.5
   - sentimentClarity = max(bullish, neutral, bearish) / total

### 2. 深度模式

#### 页面布局
```
┌─────────────────────────────────────────┐
│ [← 返回] 半导体领域深度分析              │
│ 基于最近50条新闻 | 最后更新：10分钟前    │
│ [🔄 刷新分析]                            │
├─────────────────────────────────────────┤
│ 📊 趋势概览                              │
│   看涨 ↗ 置信度75%                       │
│   情绪分布图表                           │
├─────────────────────────────────────────┤
│ 🤖 AI趋势分析                            │
│   当前状态：xxx                          │
│   短期展望：xxx                          │
│   中期展望：xxx                          │
│   关键驱动因素：[详细列表]              │
│   关键风险点：[详细列表]                │
├─────────────────────────────────────────┤
│ 🔗 跨领域关联                            │
│   强相关领域：                           │
│   • PCB板块 (正相关 0.85)               │
│   • 封测板块 (正相关 0.72)              │
│                                          │
│   AI分析：半导体领域上涨通常会...       │
├─────────────────────────────────────────┤
│ 📰 相关新闻列表 (50条)                   │
│   [新闻1标题] - 2小时前                  │
│   [新闻2标题] - 3小时前                  │
│   ...                                    │
├─────────────────────────────────────────┤
│ 🌐 传导路径可视化                        │
│   [复用现有PropagationPath组件]         │
└─────────────────────────────────────────┘
```

#### AI生成内容（Claude API）

**提示词结构**：
```
角色：你是一位专业的A股投资分析师，专注于AI硬件产业链。

任务：基于以下{newsCount}条关于{domainName}领域的最新新闻，生成投资趋势分析。

新闻列表：
{news_list}

请按以下格式输出JSON：
{
  "currentStatus": "当前状态描述（50字内）",
  "shortTermOutlook": "短期展望（1-2周，100字内）",
  "mediumTermOutlook": "中期展望（1-3月，100字内）",
  "keyDrivers": ["驱动因素1", "驱动因素2", ...],
  "keyRisks": ["风险点1", "风险点2", ...],
  "confidenceLevel": 0.75
}
```

#### 跨领域关联分析

1. **查询关联领域**：
   ```sql
   SELECT DISTINCT d2.*
   FROM Domain d1
   JOIN GraphNode gn1 ON d1.graphNodes LIKE '%' || gn1.id || '%'
   JOIN GraphEdge ge ON gn1.id = ge.sourceId OR gn1.id = ge.targetId
   JOIN GraphNode gn2 ON ge.sourceId = gn2.id OR ge.targetId = gn2.id
   JOIN Domain d2 ON d2.graphNodes LIKE '%' || gn2.id || '%'
   WHERE d1.code = 'target_domain' AND d2.id != d1.id
   ```

2. **计算关联强度**：
   - 共享GraphEdge的weight平均值

3. **AI生成关联说明**：
   ```
   角色：产业链分析师

   任务：用一句话描述{domain1}与{domain2}的关联关系
   
   上下文：
   - 关联强度：{strength}
   - 方向：{direction}
   - 产业链位置：{domain1_position} → {domain2_position}
   
   输出示例："半导体领域上涨通常会带动PCB板块，因为芯片生产需要高端PCB基板，滞后期约1-2周"
   ```

### 3. 新闻筛选逻辑

```python
def filter_news_by_domain(news_list: List[Dict], domain: Domain) -> List[Dict]:
    """根据Domain.keywords筛选相关新闻"""
    keywords = domain.keywords  # ['半导体', '芯片', 'GPU', ...]
    
    filtered = []
    for news in news_list:
        title = news['title'].lower()
        content = news.get('content', '').lower()
        
        # 标题匹配权重更高
        title_match = any(kw.lower() in title for kw in keywords)
        content_match = any(kw.lower() in content for kw in keywords)
        
        if title_match or content_match:
            news['relevance_score'] = (
                (1.0 if title_match else 0.0) * 0.7 +
                (1.0 if content_match else 0.0) * 0.3
            )
            filtered.append(news)
    
    # 按相关性和时间排序
    filtered.sort(key=lambda x: (x['relevance_score'], x['publishTime']), reverse=True)
    return filtered
```

## 技术实现

### 前端组件

#### 新增组件
```typescript
// src/app/(dashboard)/events/trends/page.tsx - 概览页
TrendsOverviewPage
├─ NewsCountSelector  // 新闻数量选择器
├─ DomainCardGrid     // 领域卡片网格
│  └─ DomainTrendCard // 单个领域卡片
└─ RefreshButton

// src/app/(dashboard)/events/trends/[domain]/page.tsx - 深度页
TrendDetailPage
├─ TrendHeader         // 页头（返回按钮、刷新）
├─ TrendOverviewSection // 趋势概览
├─ AIInsightSection    // AI分析
├─ RelatedDomainsSection // 跨领域关联
├─ RelatedNewsSection  // 相关新闻列表
└─ PropagationPathSection // 传导路径（复用）
```

#### 类型定义
```typescript
// src/types/trend.ts

export interface DomainTrendSummary {
  domainCode: string
  domainName: string
  trendDirection: 'bullish' | 'neutral' | 'bearish'
  confidenceScore: number
  sentimentDistribution: {
    bullish: number
    neutral: number
    bearish: number
  }
  relatedNewsCount: number
  keyDrivers: string[]  // Top 2
  keyRisks: string[]    // Top 2
  shortTermOutlook: string
}

export interface DomainTrendDetail extends DomainTrendSummary {
  currentStatus: string
  mediumTermOutlook: string
  allKeyDrivers: string[]
  allKeyRisks: string[]
  relatedDomains: RelatedDomain[]
  relatedNews: NewsArticle[]
  aiInsight: string
  lastUpdated: string
}

export interface RelatedDomain {
  code: string
  name: string
  correlation: number  // 0-1
  direction: 'positive' | 'negative'
  explanation: string
}
```

### 后端服务

#### Python服务结构
```python
# data-service/services/trend_analysis_service.py

class TrendAnalysisService:
    def __init__(self, data_service, db_session):
        self.data_service = data_service
        self.db = db_session
        self.claude_client = anthropic.Anthropic()
    
    async def analyze_all_domains_lightweight(
        self, news_count: int = 50
    ) -> List[DomainTrendSummary]:
        """轻量级分析所有领域（不调用AI）"""
        pass
    
    async def analyze_domain_detailed(
        self, domain_code: str, news_count: int = 50
    ) -> DomainTrendDetail:
        """完整分析单个领域（调用AI）"""
        pass
    
    def filter_news_by_keywords(
        self, news_list: List[Dict], keywords: List[str]
    ) -> List[Dict]:
        """根据关键词筛选新闻"""
        pass
    
    def calculate_sentiment_distribution(
        self, news_list: List[Dict]
    ) -> Dict[str, int]:
        """统计情绪分布"""
        pass
    
    def extract_key_topics_tfidf(
        self, news_list: List[Dict], top_n: int = 5
    ) -> List[str]:
        """TF-IDF提取关键主题"""
        pass
    
    async def generate_ai_insight(
        self, domain_name: str, news_list: List[Dict]
    ) -> Dict:
        """调用Claude生成深度分析"""
        pass
    
    async def find_related_domains(
        self, domain: Domain
    ) -> List[RelatedDomain]:
        """查询关联领域"""
        pass
    
    async def generate_domain_relation_explanation(
        self, domain1: str, domain2: str, correlation: float
    ) -> str:
        """AI生成关联说明"""
        pass
```

#### API路由
```python
# data-service/routers/trends.py

@router.get("/summary")
async def get_all_domains_summary(
    newsCount: int = Query(default=50, ge=10, le=200)
):
    """获取所有领域的轻量级摘要"""
    service = TrendAnalysisService(data_service, db)
    summaries = await service.analyze_all_domains_lightweight(newsCount)
    return {"success": True, "data": summaries}

@router.get("/analysis")
async def get_domain_detailed_analysis(
    domain: str = Query(...),
    newsCount: int = Query(default=50, ge=10, le=200)
):
    """获取单领域的完整AI分析"""
    service = TrendAnalysisService(data_service, db)
    analysis = await service.analyze_domain_detailed(domain, newsCount)
    return {"success": True, "data": analysis}
```

### Next.js API层

```typescript
// src/app/api/events/trends/summary/route.ts
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const newsCount = parseInt(searchParams.get('newsCount') || '50')
  
  // 检查缓存
  const cacheKey = `trends:summary:${newsCount}`
  const cached = await cache.get(cacheKey)
  if (cached) return NextResponse.json(cached)
  
  // 调用Python服务
  const response = await fetch(
    `${DATA_SERVICE_URL}/api/trends/summary?newsCount=${newsCount}`
  )
  const data = await response.json()
  
  // 缓存30分钟
  await cache.set(cacheKey, data, 30 * 60)
  return NextResponse.json(data)
}

// src/app/api/events/trends/analysis/route.ts
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const domain = searchParams.get('domain')
  const newsCount = parseInt(searchParams.get('newsCount') || '50')
  
  // 检查缓存
  const cacheKey = `trends:analysis:${domain}:${newsCount}`
  const cached = await cache.get(cacheKey)
  if (cached) return NextResponse.json(cached)
  
  // 调用Python服务
  const response = await fetch(
    `${DATA_SERVICE_URL}/api/trends/analysis?domain=${domain}&newsCount=${newsCount}`
  )
  const data = await response.json()
  
  // 缓存60分钟
  await cache.set(cacheKey, data, 60 * 60)
  return NextResponse.json(data)
}

// src/app/api/events/trends/refresh/route.ts
export async function POST(request: NextRequest) {
  const { domain } = await request.json()
  
  // 清除缓存
  if (domain) {
    await cache.delete(`trends:analysis:${domain}:*`)
  } else {
    await cache.delete('trends:summary:*')
  }
  
  return NextResponse.json({ success: true })
}
```

## 缓存策略

### 缓存层级
1. **Next.js内存缓存**：快速访问，进程内共享
2. **持久化存储**（可选）：Redis或数据库，跨实例共享

### TTL配置
- 概览摘要：30分钟
- 深度分析：60分钟
- 手动刷新：立即失效

### 缓存键设计
```
trends:summary:{newsCount}
trends:analysis:{domainCode}:{newsCount}
```

## 性能优化

### 1. 前端优化
- 概览页面：虚拟滚动（如果领域>20个）
- 深度页面：新闻列表分页加载
- 骨架屏：加载时显示占位符
- 乐观更新：手动刷新时先显示旧数据

### 2. 后端优化
- 批量查询：一次获取所有Domain数据
- 并行处理：多领域分析并发执行
- 数据库索引：Domain.code, GraphNode.id, GraphEdge索引
- AI调用限流：防止短时间大量请求

### 3. 成本控制
- 概览模式不调用AI（估算节省80%成本）
- 深度模式按需调用
- 缓存减少重复分析

## 数据库变更

无需新建表，使用现有表：
- Domain：领域及关键词
- GraphNode：图谱节点
- GraphEdge：节点关系
- NewsArticle：新闻数据（通过Python服务获取）

## 测试计划

### 单元测试
- TrendAnalysisService各方法
- 新闻筛选逻辑
- 情绪统计算法
- TF-IDF提取

### 集成测试
- API端到端测试
- 缓存读写验证
- AI调用模拟

### UI测试
- 概览页加载
- 深度页跳转
- 刷新交互
- 响应式布局

## 上线计划

### Phase 1：后端服务
1. 实现TrendAnalysisService
2. 实现Python API路由
3. 单元测试

### Phase 2：Next.js API
1. 实现API路由
2. 配置缓存
3. 集成测试

### Phase 3：前端UI
1. 概览页组件
2. 深度页组件
3. UI测试

### Phase 4：集成优化
1. 端到端测试
2. 性能优化
3. 上线部署

## 风险与缓解

### 风险1：AI成本过高
**缓解**：
- 概览模式不调用AI
- 缓存时间足够长（60分钟）
- 监控API调用量

### 风险2：新闻筛选不准确
**缓解**：
- 持续优化Domain.keywords
- 支持相关性评分
- 提供用户反馈机制

### 风险3：性能问题
**缓解**：
- 多级缓存
- 异步处理
- 限流保护

## 后续优化方向

1. **历史趋势对比**：存储历史分析结果，展示趋势变化曲线
2. **自定义关键词**：用户自定义关注的关键词
3. **趋势预警**：重大变化时推送通知
4. **导出报告**：生成PDF投资分析报告

## 参考资料

- 现有代码：src/app/(dashboard)/events/trends/page.tsx
- 类型定义：src/types/event.ts
- 数据服务：data-service/routers/news.py
- 缓存实现：src/lib/cache.ts

---

**设计完成，待审核后进入实现阶段。**
