# 事件驱动框架架构设计

## 文档信息
- **创建日期**: 2026-07-19
- **版本**: v1.0
- **状态**: 设计中

## 1. 架构概览

事件驱动框架采用五层架构设计，每层职责清晰、可独立演进：

```
┌─────────────────────────────────────────────────────────────┐
│                     Layer 5: UI 交互层                       │
│  数据源管理 | 调度配置 | 清洗规则 | 存储策略 | 事件展示      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                Layer 4: 数据库管理层                          │
│     统一存储接口 | 生命周期管理 | 自动清理 | 归档策略         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                 Layer 3: AI 数据清洗层                        │
│  情感分析 | 自动分类 | 实体识别 | 领域匹配 | 筛选规则配置     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                  Layer 2: 事件输入层                          │
│   调度器 | 采集任务 | 队列管理 | 重试机制 | 并行处理          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                  Layer 1: 数据源层                            │
│   驱动抽象 | API驱动 | 爬虫驱动 | RSS驱动 | 数据源注册表      │
└─────────────────────────────────────────────────────────────┘
```

## 2. Layer 1: 数据源层 (Data Source Layer)

### 2.1 设计目标
- 支持用户自定义数据源
- 统一的驱动接口，可插拔实现
- 数据源生命周期管理
- 配置持久化和热更新

### 2.2 核心组件

#### 2.2.1 数据源驱动抽象
```python
# data-service/drivers/base_driver.py
class BaseDataDriver(ABC):
    """数据源驱动基类"""
    
    @abstractmethod
    async def fetch(self, config: Dict) -> List[RawEvent]:
        """采集原始数据"""
        pass
    
    @abstractmethod
    async def validate_config(self, config: Dict) -> bool:
        """验证配置有效性"""
        pass
    
    @abstractmethod
    def get_config_schema(self) -> Dict:
        """返回配置Schema（用于UI生成）"""
        pass
```

#### 2.2.2 驱动实现
- **API驱动** (`api_driver.py`): HTTP/REST API采集
- **爬虫驱动** (`crawler_driver.py`): 网页爬取（基于BeautifulSoup/Scrapy）
- **RSS驱动** (`rss_driver.py`): RSS/Atom订阅源
- **社交驱动** (`social_driver.py`): 社交媒体API（微博、X等）

#### 2.2.3 数据源注册表
```python
# data-service/registry/source_registry.py
class DataSourceRegistry:
    """数据源注册和管理"""
    
    def register_driver(self, driver_type: str, driver_class: Type[BaseDataDriver]):
        """注册驱动"""
        
    def get_driver(self, driver_type: str) -> BaseDataDriver:
        """获取驱动实例"""
        
    def list_available_drivers(self) -> List[DriverInfo]:
        """列出所有可用驱动"""
```

### 2.3 数据库Schema变更
```prisma
model DataSource {
  id              String   @id @default(cuid())
  name            String   // 数据源名称
  type            String   // financial/social/video/custom
  driverType      String   // api/crawler/rss/social (新增)
  provider        String   // 提供商标识
  config          String   // JSON: 驱动配置（URL、headers、selectors等）
  configSchema    String?  // JSON: 配置Schema（用于UI验证）
  updateFrequency Int      @default(60)
  isActive        Boolean  @default(true)
  lastFetchAt     DateTime?
  lastFetchStatus String?  // success/failed/running (新增)
  errorMessage    String?  // 最后错误信息 (新增)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  articles        NewsArticle[]
  logs            DataSourceLog[]
  schedulerJobs   SchedulerJob[] // 关联调度任务 (新增)
}
```

## 3. Layer 2: 事件输入层 (Event Input Layer)

### 3.1 设计目标
- 灵活的调度配置（Cron/Interval/Webhook）
- 多数据源并行采集
- 任务队列和重试机制
- 实时监控和日志

### 3.2 核心组件

#### 3.2.1 增强的调度器服务
```python
# data-service/services/scheduler_service.py (增强)
class SchedulerService:
    """增强的调度器服务"""
    
    async def add_datasource_job(
        self,
        source_id: str,
        schedule_type: str,  # cron/interval/webhook
        schedule_config: Dict
    ):
        """为数据源添加采集任务"""
        
    async def trigger_manual_fetch(self, source_id: str):
        """手动触发采集"""
        
    async def get_job_history(self, source_id: str, limit: int = 50):
        """获取任务历史"""
```

#### 3.2.2 采集任务管理
```python
# data-service/services/fetch_service.py (新增)
class FetchService:
    """采集任务管理"""
    
    async def execute_fetch_task(self, source_id: str) -> FetchResult:
        """执行采集任务"""
        # 1. 获取数据源配置
        # 2. 实例化对应驱动
        # 3. 执行采集
        # 4. 记录日志
        # 5. 返回结果
        
    async def batch_fetch(self, source_ids: List[str]):
        """批量并行采集"""
```

### 3.3 数据库Schema变更
```prisma
model SchedulerJob {
  id            String   @id @default(cuid())
  sourceId      String   // 关联数据源
  scheduleType  String   // cron/interval/webhook
  scheduleConfig String  // JSON: 调度配置
  isEnabled     Boolean  @default(true)
  lastRunAt     DateTime?
  nextRunAt     DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  source        DataSource @relation(fields: [sourceId], references: [id])
  
  @@index([sourceId])
  @@index([isEnabled, nextRunAt])
}

model DataSourceLog {
  id           String   @id @default(cuid())
  sourceId     String
  jobId        String?  // 关联调度任务 (新增)
  status       String   // success/failed/running
  message      String?
  fetchedCount Int      @default(0)
  processedCount Int    @default(0)  // 处理成功数量 (新增)
  failedCount  Int      @default(0)  // 处理失败数量 (新增)
  duration     Int?     // 耗时（毫秒）
  errorDetail  String?  // 错误详情 (新增)
  createdAt    DateTime @default(now())
  
  source DataSource @relation(fields: [sourceId], references: [id])
  
  @@index([sourceId])
  @@index([createdAt])
  @@index([status])
}
```

## 4. Layer 3: AI 数据清洗层 (AI Cleaning Layer)

### 4.1 设计目标
- Claude API集成进行情感分析
- 自动分类到多级分类体系
- 实体识别和关键词提取
- 领域智能匹配
- 可配置的筛选规则

### 4.2 核心组件

#### 4.2.1 AI分析服务
```python
# data-service/services/ai_analyzer.py (新增)
class AIAnalyzer:
    """AI数据清洗和分析"""
    
    async def analyze_event(self, raw_event: RawEvent) -> AnalyzedEvent:
        """综合分析事件"""
        # 1. 情感分析
        # 2. 分类预测
        # 3. 实体识别
        # 4. 领域匹配
        # 5. 影响力评分
        
    async def sentiment_analysis(self, text: str) -> SentimentResult:
        """情感分析 (Claude API)"""
        # 返回: bullish/neutral/bearish + 置信度
        
    async def categorize(self, title: str, content: str) -> CategoryPrediction:
        """智能分类"""
        # 返回: 分类ID + 置信度
        
    async def extract_entities(self, text: str) -> List[Entity]:
        """实体识别"""
        # 返回: 公司、产品、技术、人物等实体
        
    async def match_domains(self, event: AnalyzedEvent) -> List[str]:
        """领域匹配"""
        # 基于关键词和实体匹配到Domain
```

#### 4.2.2 筛选规则引擎
```python
# data-service/services/filter_engine.py (新增)
class FilterEngine:
    """事件筛选规则引擎"""
    
    async def apply_filters(
        self,
        events: List[AnalyzedEvent],
        filters: FilterConfig
    ) -> List[AnalyzedEvent]:
        """应用筛选规则"""
        
    async def validate_filter_config(self, config: FilterConfig) -> bool:
        """验证筛选配置"""
```

### 4.3 数据库Schema变更
```prisma
model NewsArticle {
  id              String   @id @default(cuid())
  title           String
  content         String
  summary         String?
  source          String
  url             String?  @unique
  publishTime     DateTime
  
  // 分类
  category        String   // 保留兼容
  categoryId      String?
  categoryConfidence Float? @default(0)  // 分类置信度 (新增)
  
  // 领域
  domainId        String?
  domainIds       String?  // JSON: 多领域支持 (新增)
  
  // 数据源
  sourceId        String?
  
  // AI分析结果
  sentiment       Float?   // -1 ~ +1
  sentimentLabel  String?  // bullish/neutral/bearish (新增)
  sentimentConfidence Float? @default(0)  // 情感置信度 (新增)
  impact          Int?     // 1~5
  
  // 实体和关键词
  entities        String?  // JSON: 识别的实体
  keywords        String?  // JSON: 提取的关键词 (新增)
  sectors         String?  // JSON: 关联板块
  
  // AI处理状态
  aiProcessed     Boolean  @default(false)  // 是否已AI处理 (新增)
  aiProcessedAt   DateTime?  // AI处理时间 (新增)
  aiError         String?  // AI处理错误 (新增)
  
  createdAt       DateTime @default(now())
  expiresAt       DateTime?  // 过期时间 (新增)
  
  categoryRef NewsCategory? @relation(fields: [categoryId], references: [id])
  domain      Domain?       @relation(fields: [domainId], references: [id])
  sourceRef   DataSource?   @relation(fields: [sourceId], references: [id])
  
  @@index([publishTime])
  @@index([categoryId])
  @@index([domainId])
  @@index([sourceId])
  @@index([aiProcessed])
  @@index([expiresAt])
  @@index([sentimentLabel])
}

model FilterRule {
  id          String   @id @default(cuid())
  name        String   // 规则名称
  description String?
  config      String   // JSON: 筛选配置
  isActive    Boolean  @default(true)
  priority    Int      @default(0)  // 优先级
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

## 5. Layer 4: 数据库管理层 (Storage Management Layer)

### 5.1 设计目标
- 统一的存储接口
- 自动化生命周期管理
- 定期清理过期数据
- 数据归档策略

### 5.2 核心组件

#### 5.2.1 存储管理服务
```python
# data-service/services/storage_manager.py (新增)
class StorageManager:
    """数据存储和生命周期管理"""
    
    async def store_events(self, events: List[AnalyzedEvent]):
        """批量存储事件"""
        
    async def cleanup_expired_events(self):
        """清理过期事件"""
        
    async def archive_old_events(self, before_date: datetime):
        """归档旧事件"""
        
    async def get_storage_stats(self) -> StorageStats:
        """获取存储统计"""
```

#### 5.2.2 配置管理
```typescript
// src/lib/config/storage-config.ts (新增)
export interface StorageConfig {
  defaultRetentionDays: number  // 默认保留天数
  maxArticles: number           // 最大文章数
  archiveEnabled: boolean       // 是否启用归档
  archiveAfterDays: number      // 归档天数
  cleanupSchedule: string       // 清理调度（Cron）
}
```

### 5.3 数据库Schema变更
```prisma
model StorageConfig {
  id                  String   @id @default(cuid())
  retentionDays       Int      @default(7)    // 数据保留天数
  maxArticles         Int      @default(10000) // 最大文章数
  archiveEnabled      Boolean  @default(false)
  archiveAfterDays    Int      @default(30)
  cleanupSchedule     String   @default("0 2 * * *")  // 每天凌晨2点
  lastCleanupAt       DateTime?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
}
```

## 6. Layer 5: UI 交互层 (UI Layer)

### 6.1 设计目标
- 完整的数据源管理界面
- 调度器配置和监控
- AI清洗规则配置
- 存储策略管理
- 优化的事件筛选和展示

### 6.2 页面规划

#### 6.2.1 数据源管理页面增强
`src/app/(dashboard)/events/sources/page.tsx`

新增功能：
- 数据源创建向导（选择驱动类型 → 配置参数 → 测试连接）
- 驱动配置表单（基于config schema动态生成）
- 实时状态监控
- 采集日志查看

#### 6.2.2 调度器配置页面
`src/app/(dashboard)/events/scheduler/page.tsx` (新增)

功能：
- 调度任务列表和状态
- 创建/编辑调度任务
- 手动触发采集
- 任务执行历史

#### 6.2.3 AI清洗规则页面
`src/app/(dashboard)/events/ai-rules/page.tsx` (新增)

功能：
- 筛选规则配置
- 情感分析阈值设置
- 分类映射管理
- 领域关键词配置

#### 6.2.4 存储策略页面
`src/app/(dashboard)/events/storage/page.tsx` (新增)

功能：
- 存储配置管理
- 数据统计展示
- 手动清理操作
- 归档管理

#### 6.2.5 事件流页面优化
`src/app/(dashboard)/events/feed/page.tsx` (优化)

优化点：
- 增强筛选器（支持多条件组合）
- 实时更新（WebSocket推送）
- 高级搜索（全文检索）
- 批量操作（标记、删除）

### 6.3 API路由规划

```typescript
// 数据源管理
GET    /api/datasources              // 列表
POST   /api/datasources              // 创建
PUT    /api/datasources/:id          // 更新
DELETE /api/datasources/:id          // 删除
POST   /api/datasources/:id/test     // 测试连接
GET    /api/datasources/drivers      // 可用驱动列表

// 调度器
GET    /api/scheduler/jobs           // 任务列表
POST   /api/scheduler/jobs           // 创建任务
PUT    /api/scheduler/jobs/:id       // 更新任务
DELETE /api/scheduler/jobs/:id       // 删除任务
POST   /api/scheduler/jobs/:id/run   // 手动执行
GET    /api/scheduler/jobs/:id/logs  // 任务日志

// AI清洗
GET    /api/ai-rules                 // 规则列表
POST   /api/ai-rules                 // 创建规则
PUT    /api/ai-rules/:id             // 更新规则
DELETE /api/ai-rules/:id             // 删除规则
POST   /api/ai-rules/test            // 测试规则

// 存储管理
GET    /api/storage/config           // 获取配置
PUT    /api/storage/config           // 更新配置
GET    /api/storage/stats            // 存储统计
POST   /api/storage/cleanup          // 手动清理
POST   /api/storage/archive          // 手动归档
```

## 7. 技术实现细节

### 7.1 技术栈
- **Backend**: FastAPI (Python 3.10+) + Prisma Client (via prisma-client-py)
- **Frontend**: Next.js 16 + React 19 + TypeScript 5
- **Database**: SQLite + Prisma ORM v7
- **AI**: Claude API (Anthropic SDK)
- **Scheduler**: APScheduler 3.10+
- **爬虫**: BeautifulSoup4 + httpx

### 7.2 关键技术决策

#### 7.2.1 驱动插件化
使用工厂模式 + 注册表模式实现驱动的热插拔

#### 7.2.2 异步任务处理
所有采集和AI处理使用异步模式，提高并发性能

#### 7.2.3 配置Schema驱动UI
驱动配置通过JSON Schema定义，前端动态生成表单

#### 7.2.4 数据生命周期
使用定时任务 + 数据库索引优化过期数据清理

### 7.3 性能考虑
- 批量处理：采集和AI分析支持批量操作
- 缓存策略：频繁访问的配置数据使用内存缓存
- 数据库索引：关键查询字段添加复合索引
- 连接池：数据库和HTTP连接使用连接池

## 8. 数据流转

```
用户配置数据源 (UI)
    ↓
保存到DataSource表 (Layer 4)
    ↓
创建调度任务 (Layer 2)
    ↓
定时触发采集 (Layer 2)
    ↓
驱动执行采集 (Layer 1)
    ↓
原始数据返回 (Layer 2)
    ↓
AI分析处理 (Layer 3)
    ↓
存储到NewsArticle表 (Layer 4)
    ↓
应用筛选规则 (Layer 3)
    ↓
展示到UI (Layer 5)
    ↓
定期清理过期数据 (Layer 4)
```

## 9. 扩展性设计

### 9.1 新增驱动
1. 继承 `BaseDataDriver`
2. 实现 `fetch()` 和 `validate_config()`
3. 注册到 `DataSourceRegistry`
4. UI自动识别并生成配置表单

### 9.2 新增AI分析能力
1. 扩展 `AIAnalyzer` 类
2. 添加新的分析方法
3. 更新 `AnalyzedEvent` 数据结构
4. 前端展示新字段

### 9.3 新增筛选维度
1. 扩展 `FilterConfig`
2. 更新 `FilterEngine.apply_filters()`
3. UI添加新筛选器组件

## 10. 安全考虑

### 10.1 数据源配置安全
- 敏感配置（API Key）加密存储
- 配置访问权限控制
- 定期轮换凭证

### 10.2 爬虫限制
- 尊重 robots.txt
- 请求频率限制
- User-Agent识别

### 10.3 API安全
- 所有API endpoint添加认证
- 敏感操作（删除、清理）需二次确认
- 操作日志审计

## 11. 监控和告警

### 11.1 监控指标
- 数据源采集成功率
- AI处理延迟
- 存储空间使用率
- 调度任务执行状态

### 11.2 告警规则
- 数据源连续失败 > 3次
- AI处理失败率 > 10%
- 存储空间使用率 > 80%
- 调度任务积压 > 10个

## 12. 下一步

本设计文档将作为实施方案的基础，后续需要：
1. 详细的实施计划（分阶段）
2. 数据库迁移脚本
3. API接口文档
4. 组件设计规范
5. 测试用例设计
