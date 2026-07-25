# 新闻数据处理管道优化设计

**日期**: 2026-07-25  
**版本**: v1.0  
**状态**: 设计完成，待评审

## 目录
- [背景](#背景)
- [现状分析](#现状分析)
- [优化目标](#优化目标)
- [架构设计](#架构设计)
- [详细设计](#详细设计)
- [部署方案](#部署方案)
- [监控指标](#监控指标)

---

## 背景

当前系统存在以下问题：
1. **缺少AI分析环节** - 虽然有 `ai-analysis.service.ts`，但未集成到采集链路中
2. **数据质量不足** - 分类、情感、影响力等字段由简单规则生成
3. **同步阻塞** - 采集和存储是串行同步的，没有队列缓冲
4. **前端更新延迟** - 用户需要手动刷新才能看到新数据

## 现状分析

### 当前数据流

```
外部API → Python Service → Next.js API → SQLite → 前端轮询
         (NewsNow)         (/api/events/cron)
```

### 问题点

| 环节 | 问题 | 影响 |
|------|------|------|
| 数据采集 | 无AI分析 | 数据价值低 |
| 存储逻辑 | 同步阻塞 | 响应慢，易超时 |
| 前端更新 | 手动刷新 | 用户体验差 |
| 错误处理 | 缺少重试 | 数据丢失风险 |

---

## 优化目标

### 功能目标
1. ✅ 集成AI分析到采集链路（Claude API）
2. ✅ 实现异步队列处理（协程池 + 独立写入线程）
3. ✅ 前端实时更新（SSE推送）
4. ✅ 完善错误处理和重试机制

### 性能目标
| 指标 | 当前值 | 目标值 |
|------|--------|--------|
| 采集延迟 | ~5秒 | < 5秒 |
| AI分析率 | 0% | > 95% |
| 批量处理 | N/A | < 90秒 |
| 前端更新延迟 | 手动刷新 | < 2秒（SSE） |

---

## 架构设计

### 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                   新闻数据处理管道                            │
└─────────────────────────────────────────────────────────────┘

外部API (NewsNow)
    ↓
[1] 数据采集层 (Python FastAPI)
    ├─ NewsNowProvider
    ├─ 获取50条新闻
    └─ 提取发布时间 (30s超时)
    ↓
[2] AI分析层 (asyncio协程池)
    ├─ 5个并发协程
    ├─ Claude API调用
    ├─ 单条超时: 15秒
    ├─ 批量超时: 90秒
    └─ 失败 → Redis队列(可选)
    ↓
[3] 存储层 (独立线程池)
    ├─ 2个写入线程
    ├─ 批量写入: 10条/批
    ├─ 失败重试: 3次
    └─ 更新: aiProcessed=True
    ↓
[4] 推送层 (SSE)
    ├─ Python → Next.js
    ├─ Next.js → 前端
    └─ 事件: news_updated
    ↓
前端 (EventSource实时更新)
```

### 技术选型

| 层级 | 技术栈 | 理由 |
|------|--------|------|
| 数据采集 | Python FastAPI + NewsNowProvider | 已有实现，稳定 |
| AI分析 | asyncio + Claude API | 轻量级协程，无需额外依赖 |
| 队列缓冲 | asyncio.Queue + Redis(可选) | MVP用Queue，生产可升级Redis |
| 数据存储 | threading.Thread + Prisma | 独立线程避免阻塞 |
| 实时推送 | SSE (Server-Sent Events) | 单向推送，简单高效 |
| 前端连接 | EventSource API | 浏览器原生支持，自动重连 |

---

## 详细设计

### 1. 数据采集层

**文件**: `data-service/services/news_pipeline.py`

```python
class NewsPipeline:
    """新闻处理管道统筹"""
    
    def __init__(self):
        self.provider = NewsNowProvider()
        self.analyzer = AIAnalyzer(concurrency=5)
        self.writer = DatabaseWriter(workers=2)
        self.sse_manager = SSEManager()
    
    async def run(self) -> PipelineResult:
        """执行完整管道"""
        # 1. 采集
        raw_articles = await self.fetch_from_sources()
        
        # 2. AI分析（异步）
        analyzed = await self.analyzer.analyze_batch(raw_articles)
        
        # 3. 存储（后台线程）
        self.writer.enqueue(analyzed)
        
        # 4. 推送更新
        await self.sse_manager.notify_update(len(analyzed))
        
        return PipelineResult(
            fetched=len(raw_articles),
            analyzed=len(analyzed),
            timestamp=datetime.now()
        )
```

### 2. AI分析层

**文件**: `data-service/workers/ai_analyzer.py`

```python
class AIAnalyzer:
    """AI分析协程池"""
    
    def __init__(self, concurrency: int = 5):
        self.concurrency = concurrency
        self.claude_client = AnthropicClient()
        self.redis_client = None  # 可选Redis
    
    async def analyze_batch(self, articles: List[RawArticle]) -> List[AnalyzedArticle]:
        """批量分析（并发控制）"""
        semaphore = asyncio.Semaphore(self.concurrency)
        
        tasks = [
            self._analyze_with_semaphore(article, semaphore)
            for article in articles
        ]
        
        try:
            # 整批超时90秒
            results = await asyncio.wait_for(
                asyncio.gather(*tasks, return_exceptions=True),
                timeout=90.0
            )
        except asyncio.TimeoutError:
            logger.error("批量分析超时")
            results = []
        
        # 分离成功/失败
        succeeded = [r for r in results if isinstance(r, AnalyzedArticle)]
        failed = [r for r in results if isinstance(r, Exception)]
        
        # 失败的写入延迟队列
        if failed and self.redis_client:
            await self._enqueue_retry(failed)
        
        return succeeded
    
    async def _analyze_with_semaphore(self, article: RawArticle, semaphore):
        """带信号量的分析"""
        async with semaphore:
            return await self._analyze_single(article)
    
    async def _analyze_single(self, article: RawArticle) -> AnalyzedArticle:
        """单条分析（15秒超时）"""
        try:
            analysis = await asyncio.wait_for(
                self.claude_client.analyze_event({
                    'title': article.title,
                    'content': article.content,
                    'source': article.source,
                    'publishTime': article.publishTime
                }),
                timeout=15.0
            )
            
            return AnalyzedArticle(
                **article.dict(),
                categoryId=await self._map_category(analysis.category),
                domainIds=await self._map_domains(analysis.keywords),
                sentiment=analysis.sentiment.score,
                sentimentLabel=analysis.sentiment.label,
                sentimentConfidence=analysis.sentiment.confidence,
                impact=analysis.impact.magnitude,
                keywords=json.dumps(analysis.keywords),
                aiProcessed=True,
                aiProcessedAt=datetime.now()
            )
            
        except asyncio.TimeoutError:
            logger.warning(f"AI分析超时: {article.title[:50]}")
            return AnalyzedArticle(**article.dict(), aiProcessed=False)
        except Exception as e:
            logger.error(f"AI分析失败: {e}")
            return AnalyzedArticle(**article.dict(), aiProcessed=False, aiError=str(e))
    
    async def _map_category(self, ai_category: str) -> Optional[str]:
        """映射AI分类到数据库categoryId"""
        # 调用eventService.mapAICategoryToDatabase()
        pass
    
    async def _map_domains(self, keywords: List[str]) -> List[str]:
        """映射关键词到领域IDs"""
        # 调用eventService.mapAIKeywordsToDomains()
        pass
```

### 3. 存储层

**文件**: `data-service/workers/db_writer.py`

```python
class DatabaseWriter:
    """数据库写入线程池"""
    
    def __init__(self, workers: int = 2):
        self.queue = Queue()
        self.batch_size = 10
        self.retry_limit = 3
        self.threads = []
        
        # 启动工作线程
        for i in range(workers):
            t = Thread(target=self._worker, name=f"DBWriter-{i}", daemon=True)
            t.start()
            self.threads.append(t)
    
    def enqueue(self, articles: List[AnalyzedArticle]):
        """将分析完的数据加入队列"""
        for article in articles:
            self.queue.put(article)
    
    def _worker(self):
        """工作线程主循环"""
        batch = []
        
        while True:
            try:
                # 2秒超时等待
                article = self.queue.get(timeout=2.0)
                batch.append(article)
                
                # 达到批量大小时写入
                if len(batch) >= self.batch_size:
                    self._batch_write(batch)
                    batch = []
                    
            except Empty:
                # 超时但有数据，写入
                if batch:
                    self._batch_write(batch)
                    batch = []
    
    def _batch_write(self, articles: List[AnalyzedArticle]):
        """批量写入数据库（带重试）"""
        for attempt in range(self.retry_limit):
            try:
                # 使用Prisma批量upsert
                self._prisma_batch_upsert(articles)
                logger.info(f"成功写入 {len(articles)} 条记录")
                return
                
            except Exception as e:
                wait_time = 2 ** attempt  # 指数退避
                logger.warning(f"写入失败 (尝试 {attempt+1}/{self.retry_limit}): {e}")
                time.sleep(wait_time)
        
        # 重试失败，写入错误日志
        self._log_failed_writes(articles)
    
    def _prisma_batch_upsert(self, articles: List[AnalyzedArticle]):
        """Prisma批量操作"""
        # 通过Next.js API或直接SQL
        pass
    
    def _log_failed_writes(self, articles: List[AnalyzedArticle]):
        """记录写入失败的数据"""
        pass
```

### 4. SSE推送层

**文件**: `data-service/services/sse_manager.py`

```python
from sse_starlette.sse import EventSourceResponse

class SSEManager:
    """SSE推送管理器"""
    
    def __init__(self):
        self.clients = []  # 连接的客户端列表
    
    async def notify_update(self, count: int):
        """通知所有客户端数据更新"""
        event = {
            "type": "news_updated",
            "count": count,
            "timestamp": datetime.now().isoformat()
        }
        
        # 推送给所有连接的客户端
        for client_queue in self.clients:
            await client_queue.put(event)
```

**API端点**: `data-service/routers/news.py`

```python
@router.get("/stream")
async def stream_updates(request: Request):
    """SSE流端点"""
    async def event_generator():
        client_queue = asyncio.Queue()
        sse_manager.clients.append(client_queue)
        
        try:
            while True:
                # 等待事件
                event = await client_queue.get()
                yield {
                    "event": event["type"],
                    "data": json.dumps(event)
                }
                
        finally:
            sse_manager.clients.remove(client_queue)
    
    return EventSourceResponse(event_generator())
```

### 5. Next.js SSE代理

**文件**: `src/app/api/events/stream/route.ts`

```typescript
export async function GET(request: NextRequest) {
  const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'
  
  try {
    // 连接到Python SSE流
    const response = await fetch(`${DATA_SERVICE_URL}/api/news/stream`, {
      headers: {
        'Accept': 'text/event-stream',
      },
    })
    
    if (!response.ok || !response.body) {
      throw new Error('Failed to connect to SSE stream')
    }
    
    // 代理流到前端
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
    
  } catch (error) {
    console.error('SSE stream error:', error)
    return new Response('SSE stream unavailable', { status: 503 })
  }
}
```

### 6. 前端实时更新

**文件**: `src/hooks/useNewsStream.ts`

```typescript
export function useNewsStream(onUpdate: (data: any) => void) {
  const [isConnected, setIsConnected] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)
  
  useEffect(() => {
    const connectSSE = () => {
      const eventSource = new EventSource('/api/events/stream')
      eventSourceRef.current = eventSource
      
      eventSource.onopen = () => {
        console.log('SSE connected')
        setIsConnected(true)
      }
      
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data)
        if (data.type === 'news_updated') {
          onUpdate(data)
        }
      }
      
      eventSource.onerror = (error) => {
        console.error('SSE error:', error)
        setIsConnected(false)
        eventSource.close()
        
        // 5秒后重连
        setTimeout(connectSSE, 5000)
      }
    }
    
    connectSSE()
    
    return () => {
      eventSourceRef.current?.close()
    }
  }, [onUpdate])
  
  return { isConnected }
}
```

**使用示例**: `src/app/(dashboard)/events/page.tsx`

```typescript
export default function EventsPage() {
  const [news, setNews] = useState<NewsArticle[]>([])
  const { isConnected } = useNewsStream((data) => {
    // 收到更新事件，重新获取数据
    fetchLatestNews().then(setNews)
  })
  
  return (
    <div>
      {isConnected && <div className="text-green-500">● 实时连接</div>}
      {/* 新闻列表 */}
    </div>
  )
}
```

---

## 部署方案

### 开发环境

```bash
# Python服务
cd data-service
pip install -r requirements.txt
python main.py  # 端口8000

# Next.js服务
npm run dev  # 端口3000

# 环境变量
ANTHROPIC_API_KEY=sk-xxx
DATA_SERVICE_URL=http://localhost:8000
```

### 生产环境

#### 方案A：传统部署（推荐）

```
VPS / Docker
├─ Python服务 (端口8000)
│  ├─ Gunicorn + Uvicorn workers
│  └─ 支持SSE长连接
├─ Next.js服务 (端口3000)
│  └─ Node.js standalone
└─ Nginx反向代理
```

**优点**: 完全支持SSE，性能最优

#### 方案B：混合部署

```
Vercel (Next.js)
    ↓ 代理
VPS (Python服务)
    ↓
SQLite / PostgreSQL
```

**优点**: Next.js享受Vercel CDN，Python独立管理  
**注意**: Vercel有10秒函数超时，需配置降级逻辑

#### 方案C：Serverless降级

如果必须用Serverless，降级方案：

```typescript
// 检测SSE是否可用
const SSE_AVAILABLE = process.env.VERCEL ? false : true

if (SSE_AVAILABLE) {
  // 使用SSE
} else {
  // 降级到30秒轮询
  setInterval(fetchNews, 30000)
}
```

---

## 监控指标

### 核心指标

| 指标 | 数据源 | 告警阈值 |
|------|--------|----------|
| 采集成功率 | DataSourceLog | < 90% |
| AI分析成功率 | aiProcessed字段 | < 95% |
| AI平均耗时 | Claude API响应时间 | > 12秒 |
| 批量处理时长 | Pipeline执行时间 | > 100秒 |
| 数据库写入延迟 | Queue等待时间 | > 5秒 |
| SSE连接数 | SSEManager.clients | 监控 |
| 错误重试次数 | 日志统计 | > 10/小时 |

### 监控实现

**文件**: `data-service/services/metrics.py`

```python
class MetricsCollector:
    """指标收集器"""
    
    def __init__(self):
        self.metrics = {
            'pipeline_runs': 0,
            'articles_fetched': 0,
            'articles_analyzed': 0,
            'ai_timeouts': 0,
            'db_write_failures': 0,
        }
    
    def record_pipeline_run(self, result: PipelineResult):
        self.metrics['pipeline_runs'] += 1
        self.metrics['articles_fetched'] += result.fetched
        self.metrics['articles_analyzed'] += result.analyzed
    
    def get_metrics(self) -> dict:
        return {
            **self.metrics,
            'ai_success_rate': self._calc_ai_success_rate(),
            'timestamp': datetime.now().isoformat()
        }
```

**监控端点**: `/api/metrics`

```python
@router.get("/metrics")
async def get_metrics():
    return metrics_collector.get_metrics()
```

---

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Claude API限流 | AI分析失败 | 1. 控制并发数(5) <br> 2. 失败入Redis重试队列 |
| SSE连接断开 | 前端无法实时更新 | 1. 自动重连机制 <br> 2. 降级到轮询 |
| 数据库写入阻塞 | 数据积压 | 1. 独立线程池 <br> 2. 批量操作 |
| 内存溢出 | 服务崩溃 | 1. 限制队列大小 <br> 2. 批量处理分页 |
| Vercel超时 | Serverless部署受限 | 1. Python独立部署 <br> 2. Next.js降级轮询 |

---

## 实施计划

### Phase 1: Python服务改造（核心）
- [ ] 实现 `NewsPipeline` 统筹类
- [ ] 实现 `AIAnalyzer` 协程池
- [ ] 实现 `DatabaseWriter` 线程池
- [ ] 实现 `SSEManager` 推送管理
- [ ] 添加 `/api/news/refresh` 触发端点
- [ ] 添加 `/api/news/stream` SSE端点

### Phase 2: Next.js集成
- [ ] 实现 `/api/events/stream` SSE代理
- [ ] 改造 `/api/events/cron` 为触发器
- [ ] 实现 `useNewsStream` Hook
- [ ] 前端页面集成实时更新

### Phase 3: 测试与优化
- [ ] 单元测试（AI分析、队列、存储）
- [ ] 集成测试（端到端流程）
- [ ] 性能测试（并发、超时、重试）
- [ ] 监控指标验证

### Phase 4: 部署上线
- [ ] Docker镜像构建
- [ ] 生产环境配置
- [ ] 灰度发布
- [ ] 监控告警配置

---

## 总结

本设计通过以下核心改进优化新闻数据处理管道：

1. **AI分析集成** - 使用Claude API进行智能分类、情感分析、影响力评估
2. **异步队列处理** - 协程池并发分析，独立线程批量存储，避免阻塞
3. **实时推送** - SSE机制实现前端实时更新，提升用户体验
4. **容错机制** - 超时降级、重试队列、错误日志，保证系统稳定性

**预期收益**:
- 数据质量提升：AI分析覆盖率 > 95%
- 性能优化：批量处理 < 90秒
- 用户体验：实时更新延迟 < 2秒
- 系统稳定性：完善的错误处理和监控

---

**文档状态**: ✅ 设计完成，待用户评审
