# 事件驱动系统完整重构设计文档

**生成日期**: 2026-07-19  
**项目**: AI投资分析系统 (ai-invest)  
**版本**: v2.0  
**作者**: Claude Opus 4.8

---

## 目录

1. [项目概述](#项目概述)
2. [设计目标](#设计目标)
3. [Phase 1 完成情况评估](#phase-1-完成情况评估)
4. [系统架构设计](#系统架构设计)
5. [数据库设计](#数据库设计)
6. [Python 后端服务设计](#python-后端服务设计)
7. [Next.js API 路由设计](#nextjs-api-路由设计)
8. [UI 层设计](#ui-层设计)
9. [Phase 2 实施计划](#phase-2-实施计划)
10. [Phase 3 实施计划](#phase-3-实施计划)
11. [Phase 4 实施计划](#phase-4-实施计划)
12. [实施时间表](#实施时间表)
13. [风险评估](#风险评估)
14. [验收标准](#验收标准)

---

## 项目概述

本设计文档旨在完成 AI 投资分析系统的事件驱动框架重构，涵盖 Phase 1 收尾、Phase 2（管理增强）、Phase 3（功能扩展）和 Phase 4（架构优化）的完整实施。

### 核心需求

根据用户需求，事件驱动框架需要实现以下五层架构：

1. **数据源层**: 用户可自定义数据源，支持 API/爬虫驱动
2. **事件输入层**: 调度器定时/触发式捕获事件信息
3. **AI 数据清洗层**: 进行情感、关键词等分类，并有完整筛选逻辑
4. **数据库管理层**: 统一管理事件，支持可配置的存储时间（默认7天）
5. **UI 层**: 基于1-4层实现完整的交互设计和配置界面

### 技术方案选择

- **架构方案**: 渐进式增强 + 轻量级插件化
- **Python 数据库**: 直接使用 SQLite（aiosqlite）
- **UI 实现**: 完整实现 R5-R7 所有功能
- **大V监控**: B站用现成库，微博/小红书用简化方案
- **存储配置**: 全局配置方案
- **开发范围**: 完整实施 Phase 1-4

---

## 设计目标

### Phase 1 收尾目标

- ✅ 补全 Python SQLite 数据库集成（db.py）
- ✅ 确保自动化采集任务正常运行
- ✅ 验证 AI 清洗流程集成
- ✅ 测试数据持久化功能

### Phase 2 目标（管理增强）

- 📋 数据源动态管理 UI（新增/编辑/删除）
- 📋 采集日志和监控面板
- 📋 分类体系与 AI 清洗集成
- 📋 存储配置管理页面

### Phase 3 目标（功能扩展）

- 📋 大V监控功能完善（B站、微博、小红书）
- 📋 轻量级数据源插件机制（配置驱动）
- 📋 大V动态 UI 页面

### Phase 4 目标（架构优化）

- 📋 前后端 AI 逻辑统一
- 📋 全文搜索（SQLite FTS5）
- 📋 性能优化（查询、缓存、虚拟滚动）

---

## Phase 1 完成情况评估

根据代码审查，Phase 1 的完成情况如下：

### R1: 自动化采集任务 - ✅ 80% 完成

**已完成**：
- ✅ 调度器已启动并注册财联社新闻采集任务（每60分钟）
- ✅ `fetch_service.py` 实现完整采集流程
- ✅ 采集日志（DataSourceLog）已集成

**待补充**：
- ⚠️ Python 端缺少实际的数据库写入实现（db.py 不存在）

### R2: AI 清洗流程集成 - ✅ 90% 完成

**已完成**：
- ✅ `content_analyzer.py` 实现完整批量分析功能
- ✅ 已集成到采集流程（情感、分类、关键词、实体）
- ✅ 支持 AI 降级到简单规则

**运行正常**：AI 清洗逻辑已嵌入采集流程

### R3: 数据持久化 - ⚠️ 70% 完成

**已完成**：
- ✅ `fetch_service.py` 已实现数据库写入逻辑框架
- ✅ 前端 `event.service.ts` 已实现本地优先读取

**待补充**：
- ❌ Python 端缺少 `db.py` 实现（需创建）
- ❌ 需要测试端到端数据流

### R4: 数据源动态管理 API - ✅ 100% 完成

**已完成**：
- ✅ CRUD API 完整实现（GET/POST/PUT/DELETE）
- ✅ 支持数据源配置的增删改查
- ✅ 数据源详情、日志查询 API

**无需补充**：功能完整

---

## 系统架构设计

### 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                           UI 层 (Next.js)                        │
├─────────────────────────────────────────────────────────────────┤
│  数据源管理页    资讯流页    趋势分析页    大V监控页    存储配置页 │
│  /sources      /feed       /trends      /influencers  /settings │
└─────────────────────────────────────────────────────────────────┘
                              ↓ ↑ (HTTP/REST)
┌─────────────────────────────────────────────────────────────────┐
│                      API 路由层 (Next.js)                        │
├─────────────────────────────────────────────────────────────────┤
│  /api/datasources   /api/events   /api/storage   /api/stats     │
│  - CRUD             - Feed         - Config       - Dashboard    │
│  - Logs             - Categories   - Cleanup                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓ ↑
┌─────────────────────────────────────────────────────────────────┐
│                    数据库层 (SQLite + Prisma)                    │
├─────────────────────────────────────────────────────────────────┤
│  DataSource  NewsArticle  NewsCategory  Domain  Influencer       │
│  StorageConfig  DataSourceLog  SchedulerJob  FilterRule         │
└─────────────────────────────────────────────────────────────────┘
                              ↑ (写入)
┌─────────────────────────────────────────────────────────────────┐
│                   Python 数据服务 (FastAPI)                      │
├─────────────────────────────────────────────────────────────────┤
│  调度器服务      采集服务        AI清洗服务      存储服务        │
│  SchedulerSvc   FetchService   ContentAnalyzer  SQLiteWriter    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    数据源提供者层 (Python)                       │
├─────────────────────────────────────────────────────────────────┤
│  AKShare    Sina    Xueqiu    Bilibili    RSS    Weibo    XHS   │
│  (财经)     (财经)   (社交)    (视频)     (通用)  (模拟)  (模拟) │
└─────────────────────────────────────────────────────────────────┘
```

### 数据流设计

**采集流程**：
```
1. 调度器触发 → 2. 读取数据源配置 → 3. 执行 Provider 采集
   ↓
4. AI 批量清洗 → 5. 写入 SQLite → 6. 记录采集日志
   ↓
7. 更新数据源状态 → 8. UI 实时刷新
```

**查询流程**：
```
1. UI 请求 → 2. Next.js API → 3. Prisma 查询 SQLite
   ↓
4. 数据聚合/过滤 → 5. 返回前端 → 6. UI 渲染
```

### 核心技术栈

**前端**：
- Next.js 16 + React 19 + TypeScript
- shadcn/ui + Tailwind CSS v4
- TanStack Query（数据获取）
- Recharts（数据可视化）

**后端**：
- FastAPI (Python 数据服务)
- aiosqlite (Python SQLite 驱动)
- APScheduler (定时任务)
- Anthropic SDK (AI 分析)
- bilibili-api-python (B站数据)

**数据库**：
- SQLite 3
- Prisma ORM v7 (Next.js 侧)
- 直接 SQL (Python 侧)

---

## 数据库设计

### Schema 变更

#### 新增表：FilterRule

```prisma
model FilterRule {
  id          String   @id @default(cuid())
  name        String   // 规则名称
  description String?  // 规则描述
  type        String   // category/sentiment/keyword/domain
  config      String   // JSON: 具体规则配置
  isActive    Boolean  @default(true)
  priority    Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

#### 确保 StorageConfig 表存在

```prisma
model StorageConfig {
  id               String    @id @default(cuid())
  retentionDays    Int       @default(7)
  maxArticles      Int       @default(10000)
  archiveEnabled   Boolean   @default(false)
  archiveAfterDays Int       @default(30)
  cleanupSchedule  String    @default("0 2 * * *")
  lastCleanupAt    DateTime?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
}
```

#### NewsArticle 表字段确认

确保以下字段存在：
- `categoryId`, `categoryConfidence`
- `domainId`, `domainIds`
- `sourceId`
- `keywords` (JSON)
- `aiProcessed`, `aiProcessedAt`, `aiError`
- `expiresAt`

#### 索引优化

```prisma
model NewsArticle {
  // ... 字段定义
  
  @@index([aiProcessed])
  @@index([expiresAt])
  @@index([sentimentLabel])
  @@index([categoryId])
  @@index([domainId])
  @@index([sourceId])
}
```

### 全文搜索设计（FTS5）

#### FTS5 虚拟表

```sql
-- 创建 FTS5 虚拟表
CREATE VIRTUAL TABLE NewsArticle_fts USING fts5(
    title,
    content,
    summary,
    keywords,
    content=NewsArticle,
    content_rowid=rowid,
    tokenize='unicode61 remove_diacritics 2'
);

-- 初始化数据
INSERT INTO NewsArticle_fts(rowid, title, content, summary, keywords)
SELECT rowid, title, content, summary, keywords
FROM NewsArticle;
```

#### 触发器保持同步

```sql
-- 插入触发器
CREATE TRIGGER NewsArticle_ai AFTER INSERT ON NewsArticle BEGIN
    INSERT INTO NewsArticle_fts(rowid, title, content, summary, keywords)
    VALUES (new.rowid, new.title, new.content, new.summary, new.keywords);
END;

-- 更新触发器
CREATE TRIGGER NewsArticle_au AFTER UPDATE ON NewsArticle BEGIN
    UPDATE NewsArticle_fts
    SET title = new.title,
        content = new.content,
        summary = new.summary,
        keywords = new.keywords
    WHERE rowid = old.rowid;
END;

-- 删除触发器
CREATE TRIGGER NewsArticle_ad AFTER DELETE ON NewsArticle BEGIN
    DELETE FROM NewsArticle_fts WHERE rowid = old.rowid;
END;
```

---

## Python 后端服务设计

### 核心服务模块

#### 1. db.py - SQLite 数据库访问层

**位置**: `data-service/db.py`

**功能**：
- 提供异步数据库连接管理
- 封装常用数据库操作（CRUD）
- 与 Prisma Schema 保持一致
- 使用 aiosqlite 驱动

**核心方法**：
```python
class Database:
    async def insert_news_article(article: Dict) -> str
    async def check_article_exists(url: str) -> bool
    async def delete_expired_articles(before_date: str) -> int
    async def create_datasource_log(log: Dict) -> str
    async def update_datasource_log(log_id: str, updates: Dict)
    async def get_datasource(source_id: str) -> Dict
    async def get_active_datasources() -> List[Dict]
    async def update_datasource_status(source_id, status, ...)
    async def get_storage_config() -> Dict
    async def update_storage_config(config: Dict)
    async def insert_influencer_post(post: Dict) -> str
    async def get_influencers_by_platform(platform: str) -> List[Dict]
```

**连接管理**：
```python
@asynccontextmanager
async def get_connection(self):
    """获取数据库连接（上下文管理器）"""
    conn = await aiosqlite.connect(self.db_path)
    conn.row_factory = aiosqlite.Row
    try:
        yield conn
        await conn.commit()
    except Exception as e:
        await conn.rollback()
        raise e
    finally:
        await conn.close()
```

#### 2. fetch_service.py - 采集任务管理（已存在，需修改）

**修改点**：
- 将 `get_db()` 改为 `from db import db`
- 所有数据库操作调用 `db.xxx()` 方法
- 生成文章 ID（使用 cuid 或时间戳）

**关键流程**：
```python
async def execute_fetch_task(source_id: str, config: Dict) -> Dict:
    # 1. 创建采集日志
    log_id = await db.create_datasource_log(...)
    
    # 2. 执行数据采集
    raw_data = await self._fetch_data(provider, config)
    
    # 3. AI 数据清洗
    processed_data = await self._process_with_ai(raw_data, source_id)
    
    # 4. 持久化到数据库
    stored_count = await self._store_to_database(processed_data, source_id)
    
    # 5. 更新采集日志
    await db.update_datasource_log(log_id, {...})
    
    # 6. 更新数据源状态
    await db.update_datasource_status(source_id, ...)
    
    return result
```

#### 3. content_analyzer.py - AI 清洗服务（已完成）

**功能**：
- 情感分析（-1 到 +1）
- 新闻分类（policy/earnings/product/partnership/supply/tech/regulation/market）
- 关键词提取
- 实体识别
- 领域匹配
- 批量处理优化

**无需修改**：已集成到采集流程

#### 4. providers/ - 数据源提供者

##### 4.1 BilibiliProvider（新建）

**文件**: `data-service/providers/bilibili_provider.py`

**功能**：
- 使用 `bilibili-api-python` 库
- 采集用户视频列表
- 采集用户动态
- 获取用户基本信息

**核心方法**：
```python
async def fetch_user_videos(uid: int, limit: int) -> List[Dict]
async def fetch_user_dynamics(uid: int, limit: int) -> List[Dict]
async def get_user_info(uid: int) -> Dict
```

##### 4.2 WeiboProvider（新建 - 简化版）

**文件**: `data-service/providers/weibo_provider.py`

**功能**：
- 当前使用模拟数据
- 预留实际爬虫接口

**核心方法**：
```python
async def fetch_user_posts(uid: str, limit: int) -> List[Dict]
def _generate_mock_posts(uid: str, limit: int) -> List[Dict]
async def get_user_info(uid: str) -> Dict
```

##### 4.3 XiaohongshuProvider（新建 - 简化版）

**文件**: `data-service/providers/xiaohongshu_provider.py`

**功能**：
- 当前使用模拟数据
- 预留实际爬虫接口

**核心方法**：
```python
async def fetch_user_notes(user_id: str, limit: int) -> List[Dict]
def _generate_mock_notes(user_id: str, limit: int) -> List[Dict]
async def get_user_info(user_id: str) -> Dict
```

##### 4.4 Provider 配置 Schema（新建）

**文件**: `data-service/providers/schemas.py`

**功能**：
- 定义每个 Provider 的配置 Schema（JSON Schema）
- 用于前端动态生成表单
- 支持验证配置参数

**Schema 结构**：
```python
PROVIDER_SCHEMAS = {
    'akshare': {
        'displayName': 'AKShare财经数据',
        'description': '...',
        'configSchema': { ... }  # JSON Schema
    },
    'bilibili': { ... },
    'weibo': { ... },
    # ...
}
```

##### 4.5 Provider 加载器（新建）

**文件**: `data-service/providers/loader.py`

**功能**：
- 动态加载 Provider 实例
- 根据配置实例化对应的 Provider
- 支持插件式扩展

**核心方法**：
```python
class ProviderLoader:
    def load_provider(provider_name: str, config: Dict) -> Provider
    def list_providers() -> List[str]
```

### 路由模块

#### 1. routers/ai.py（新建）

**端点**：
- `POST /api/ai/analyze` - 分析单篇文章
- `POST /api/ai/analyze-batch` - 批量分析
- `POST /api/ai/investment-ideas` - 提取投资理念
- `GET /api/ai/health` - AI 服务健康检查

#### 2. routers/providers.py（新建）

**端点**：
- `GET /api/providers/list` - 列出所有可用 Provider
- `GET /api/providers/{name}/schema` - 获取 Provider 配置 Schema

#### 3. routers/storage.py（新建）

**端点**：
- `POST /api/storage/cleanup` - 触发数据清理
- `GET /api/storage/database-size` - 获取数据库大小

#### 4. routers/influencers.py（增强）

**新增端点**：
- `POST /api/influencers/{id}/fetch` - 采集大V动态
- `GET /api/influencers/platforms` - 列出支持的平台

### 依赖安装

**requirements.txt 新增**：
```
aiosqlite>=0.19.0
bilibili-api-python>=16.0.0
feedparser>=6.0.10
```


---

## Next.js API 路由设计

### 存储管理 API

#### GET /api/storage/config
获取存储配置

**响应**：
```json
{
  "success": true,
  "data": {
    "retentionDays": 7,
    "maxArticles": 10000,
    "archiveEnabled": false,
    "cleanupSchedule": "0 2 * * *",
    "lastCleanupAt": "2026-07-19T02:00:00Z"
  }
}
```

#### PUT /api/storage/config
更新存储配置

**请求体**：
```json
{
  "retentionDays": 7,
  "maxArticles": 10000,
  "archiveEnabled": false,
  "cleanupSchedule": "0 2 * * *"
}
```

#### GET /api/storage/stats
获取存储统计

**响应**：
```json
{
  "success": true,
  "data": {
    "totalArticles": 5432,
    "oldestDate": "2026-07-12T10:00:00Z",
    "newestDate": "2026-07-19T18:00:00Z",
    "retentionDays": 7,
    "estimatedSize": "25.6 MB",
    "bySource": [
      { "source": "财联社", "count": 2100 },
      { "source": "东方财富", "count": 1800 }
    ]
  }
}
```

#### POST /api/storage/cleanup
手动触发清理

**请求体**：
```json
{
  "retentionDays": 7,  // 可选
  "dryRun": false      // 预览模式
}
```

**响应**：
```json
{
  "success": true,
  "data": {
    "deleted": 123,
    "dryRun": false
  }
}
```

### 采集日志 API

#### GET /api/datasources/logs
获取采集日志列表

**Query 参数**：
- `sourceId`: 数据源ID过滤
- `status`: 状态过滤（success/failed/running）
- `limit`: 限制数量（默认50）
- `offset`: 偏移量

**响应**：
```json
{
  "success": true,
  "data": {
    "total": 234,
    "items": [
      {
        "id": "log_123",
        "sourceId": "src_001",
        "sourceName": "财联社",
        "status": "success",
        "message": "成功采集50条",
        "fetchedCount": 50,
        "processedCount": 48,
        "failedCount": 2,
        "duration": 5230,
        "createdAt": "2026-07-19T18:00:00Z"
      }
    ]
  }
}
```

### 统计仪表盘 API

#### GET /api/stats/dashboard
获取仪表盘统计

**响应**：
```json
{
  "success": true,
  "data": {
    "dataSources": {
      "total": 8,
      "active": 6,
      "lastFetch": "2026-07-19T18:00:00Z"
    },
    "articles": {
      "total": 5432,
      "today": 234,
      "aiProcessed": 5100,
      "bySource": [...]
    },
    "sentiment": {
      "bullish": 1234,
      "neutral": 3456,
      "bearish": 742
    },
    "fetchSuccessRate": 95.6
  }
}
```

### 大V监控 API

#### GET /api/influencers
获取大V列表

**Query 参数**：
- `platform`: weibo/bilibili/xiaohongshu
- `category`: 领域分类
- `isActive`: 是否激活

#### POST /api/influencers
添加大V监控

**请求体**：
```json
{
  "name": "某科技大V",
  "platform": "bilibili",
  "accountId": "123456",
  "profileUrl": "https://...",
  "category": "tech",
  "tags": ["AI", "芯片", "半导体"]
}
```

#### GET /api/influencers/[id]/posts
获取大V动态列表

**响应**：
```json
{
  "success": true,
  "data": {
    "total": 45,
    "items": [
      {
        "id": "post_001",
        "content": "...",
        "publishTime": "2026-07-19T15:00:00Z",
        "sentiment": 0.6,
        "extractedTopics": ["AI芯片", "算力"],
        "relatedDomains": ["ai", "semiconductor"]
      }
    ]
  }
}
```

#### POST /api/influencers/[id]/fetch
手动触发大V动态采集

### 全文搜索 API

#### GET /api/search
全文搜索

**Query 参数**：
- `q`: 搜索关键词（必填）
- `categoryIds`: 分类ID列表
- `domainIds`: 领域ID列表
- `sentiment`: 情感过滤
- `dateFrom`, `dateTo`: 时间范围
- `limit`, `offset`: 分页

**响应**：
```json
{
  "success": true,
  "data": {
    "total": 89,
    "items": [
      {
        "id": "article_001",
        "title": "...",
        "snippet": "...AI<mark>芯片</mark>需求...",
        "rank": -1.234,
        "publishTime": "..."
      }
    ]
  }
}
```

#### GET /api/search/suggestions
搜索建议（自动完成）

**Query 参数**：
- `q`: 搜索前缀
- `limit`: 限制数量（默认10）

**响应**：
```json
{
  "success": true,
  "data": {
    "suggestions": ["AI芯片", "AI算力", "AI应用"]
  }
}
```

### AI 分析 API（前端调用后端）

#### POST /api/ai/analyze
分析单篇文章（代理到 Python 服务）

**请求体**：
```json
{
  "title": "...",
  "content": "...",
  "source": "财联社"
}
```

**响应**：
```json
{
  "success": true,
  "result": {
    "sentiment": 0.6,
    "sentimentLabel": "bullish",
    "category": "tech",
    "keywords": ["AI", "芯片"],
    "entities": [{"type": "company", "name": "英伟达"}],
    "domains": ["ai", "semiconductor"]
  }
}
```

---

## UI 层设计

### 页面结构

```
src/app/(dashboard)/events/
├── sources/
│   ├── page.tsx                    # 数据源管理主页（增强）
│   ├── new/
│   │   └── page.tsx                # 新增数据源表单页
│   └── [id]/
│       ├── page.tsx                # 数据源详情页
│       └── edit/
│           └── page.tsx            # 编辑数据源页
├── feed/
│   └── page.tsx                    # 资讯流页（增强筛选）
├── trends/
│   └── page.tsx                    # 趋势分析页
├── influencers/
│   ├── page.tsx                    # 大V监控主页（新建）
│   └── [id]/
│       └── page.tsx                # 大V详情页（新建）
└── settings/
    └── storage/
        └── page.tsx                # 存储配置页（新建）
```

### 核心组件

#### 1. 数据源管理组件

**DataSourceForm**（`src/components/datasources/DataSourceForm.tsx`）
- 新增/编辑数据源表单
- 根据 Provider Schema 动态生成配置表单
- 字段验证
- 支持预览配置

**DataSourceCard**（`src/components/datasources/DataSourceCard.tsx`）
- 数据源信息卡片
- 状态指示器（运行中/停止/错误）
- 统计数据（文章数、日志数）
- 操作按钮（编辑/删除/手动采集/启用禁用）

**LogViewer**（`src/components/datasources/LogViewer.tsx`）
- 采集日志查看器
- 状态过滤
- 详情展开
- 实时刷新

**HealthMonitor**（`src/components/datasources/HealthMonitor.tsx`）
- 数据源健康度监控
- 成功率统计
- 错误趋势图表

#### 2. 资讯流增强组件

**AdvancedFilter**（`src/components/events/AdvancedFilter.tsx`）
- 高级筛选面板
- 分类树形选择器
- 领域标签多选
- 情感滑块（置信度）
- 时间范围选择器
- 关键词搜索（支持 AND/OR）
- AI处理状态筛选

**NewsCard**（`src/components/events/NewsCard.tsx` - 增强版）
- 显示分类标签（带置信度）
- 领域标签组
- 情感指示器（颜色+图标+分数）
- 关键词标签云
- 实体高亮显示
- 数据源标识
- AI处理状态标记

**SentimentChart**（`src/components/events/SentimentChart.tsx`）
- 情感分布可视化
- 支持饼图/柱状图/环形图
- 使用 Recharts

**SearchBar**（`src/components/events/SearchBar.tsx`）
- 全文搜索输入框
- 自动完成建议
- 搜索历史
- 高亮搜索结果

#### 3. 大V监控组件

**InfluencerList**（`src/components/influencers/InfluencerList.tsx`）
- 大V列表
- 平台过滤（微博/B站/小红书）
- 头像、昵称、粉丝数
- 发文频率指示器
- 关注/取消关注按钮

**InfluencerTimeline**（`src/components/influencers/InfluencerTimeline.tsx`）
- 动态时间线布局
- 动态内容预览
- 发布时间（相对时间）
- 情感分析结果
- 提取的观点/主题
- 关联领域标签
- 查看原文链接

**InvestmentIdeasCard**（`src/components/influencers/InvestmentIdeasCard.tsx`）
- 投资理念展示卡片
- 四个区块：观点/逻辑/建议/风险
- 颜色区分
- 复制功能

**PlatformBadge**（`src/components/influencers/PlatformBadge.tsx`）
- 平台标识徽章
- 不同平台不同图标和颜色

#### 4. 存储配置组件

**StorageConfigForm**（`src/components/settings/StorageConfigForm.tsx`）
- 存储配置表单
- retentionDays 滑块（1-30天）
- maxArticles 输入框
- archiveEnabled 开关
- cleanupSchedule Cron选择器
- 保存/重置按钮

**StorageStats**（`src/components/settings/StorageStats.tsx`）
- 存储统计展示
- 总文章数（进度条）
- 数据时间范围
- 预估数据库大小
- 按数据源统计
- 手动清理按钮

**CleanupPreview**（`src/components/settings/CleanupPreview.tsx`）
- 清理预览对话框
- 显示将被删除的数据量
- 确认/取消操作

#### 5. 通用组件

**StatCard**（`src/components/common/StatCard.tsx`）
- 统计卡片
- 图标+标签+数值
- 支持变体（success/warning/error）

**StatusBadge**（`src/components/common/StatusBadge.tsx`）
- 状态徽章
- 不同状态不同颜色

**ConfirmDialog**（`src/components/common/ConfirmDialog.tsx`）
- 确认对话框
- 删除/清理等操作确认

### 状态管理

使用 TanStack Query (React Query)：

**自定义 Hooks**：
```typescript
// src/hooks/useDataSources.ts
export function useDataSources()
export function useCreateDataSource()
export function useUpdateDataSource()
export function useDeleteDataSource()

// src/hooks/useNewsFeed.ts
export function useNewsFeed(filters: FilterConfig)
export function useInfiniteNewsFeed(filters: FilterConfig)

// src/hooks/useStorageConfig.ts
export function useStorageConfig()
export function useUpdateStorageConfig()
export function useStorageStats()
export function useTriggerCleanup()

// src/hooks/useInfluencers.ts
export function useInfluencers(platform?: string)
export function useInfluencerPosts(influencerId: string)
export function useTriggerInfluencerFetch()

// src/hooks/useSearch.ts
export function useSearch(query: string, filters: FilterConfig)
export function useSearchSuggestions(prefix: string)
```

### 性能优化

**1. 虚拟滚动**
- 使用 `@tanstack/react-virtual`
- 适用于长列表（资讯流、日志列表）

**2. 无限滚动**
- 使用 `useInfiniteQuery`
- 自动加载更多

**3. 防抖/节流**
- 搜索输入防抖（300ms）
- 滚动事件节流

**4. 缓存策略**
- 查询结果缓存5分钟
- 后台自动刷新


---

## Phase 2 实施计划

### R5: 采集日志和监控

**优先级**: P1（高）  
**预计工作量**: 2-3天

#### 任务清单

1. **数据源详情页增强**（1天）
   - [ ] 创建 `src/app/(dashboard)/events/sources/[id]/page.tsx`
   - [ ] 显示数据源完整信息
   - [ ] 集成 LogViewer 组件
   - [ ] 显示采集统计图表
   - [ ] 健康度评分展示

2. **LogViewer 组件**（0.5天）
   - [ ] 创建 `src/components/datasources/LogViewer.tsx`
   - [ ] 日志列表展示
   - [ ] 状态过滤器
   - [ ] 详情展开面板
   - [ ] 实时刷新功能

3. **数据源健康监控**（0.5天）
   - [ ] 创建 `src/components/datasources/HealthMonitor.tsx`
   - [ ] 计算成功率
   - [ ] 错误趋势图表（最近24小时）
   - [ ] 健康度评分算法

4. **统计仪表盘 API**（1天）
   - [ ] 实现 `GET /api/stats/dashboard`
   - [ ] 实现 `GET /api/stats/timeline`
   - [ ] 数据聚合逻辑
   - [ ] 缓存优化

#### 验收标准

- ✅ 数据源详情页可查看最近50条采集日志
- ✅ 日志显示状态、耗时、统计数据
- ✅ 健康度评分准确反映采集状况
- ✅ 统计图表正确展示时间线数据

---

### R6: 分类体系与 AI 清洗集成

**优先级**: P1（高）  
**预计工作量**: 2天

#### 任务清单

1. **NewsCategory 管理 API**（0.5天）
   - [ ] 实现 `GET /api/events/categories` - 获取分类树
   - [ ] 实现 `GET /api/events/categories/tree` - 树形结构
   - [ ] 支持多级分类查询

2. **Domain 管理 API**（0.5天）
   - [ ] 实现 `GET /api/events/domains` - 获取领域列表
   - [ ] 领域关键词匹配优化

3. **分类树形选择器组件**（0.5天）
   - [ ] 创建 `src/components/events/CategoryTreeSelect.tsx`
   - [ ] 支持多选
   - [ ] 显示分类层级

4. **AI 分类结果映射**（0.5天）
   - [ ] 将 AI 分类结果映射到 NewsCategory
   - [ ] 分类置信度显示
   - [ ] 人工修正接口（可选）

#### 验收标准

- ✅ 分类树正确展示层级关系
- ✅ AI 分类结果准确映射到数据库分类
- ✅ 筛选器支持多级分类选择
- ✅ 显示分类置信度

---

### R7: 大V监控功能完善

**优先级**: P1（高）  
**预计工作量**: 3-4天

#### 任务清单

1. **B站 Provider 实现**（1天）
   - [ ] 创建 `data-service/providers/bilibili_provider.py`
   - [ ] 实现视频采集
   - [ ] 实现动态采集
   - [ ] 用户信息获取
   - [ ] 安装 bilibili-api-python

2. **微博/小红书 Provider（模拟）**（0.5天）
   - [ ] 创建 `data-service/providers/weibo_provider.py`
   - [ ] 创建 `data-service/providers/xiaohongshu_provider.py`
   - [ ] 实现模拟数据生成
   - [ ] 预留实际爬虫接口

3. **大V采集任务集成**（0.5天）
   - [ ] 在 `fetch_service.py` 中增加大V采集逻辑
   - [ ] 调度器注册大V采集任务
   - [ ] 大V动态持久化

4. **大V监控 UI**（2天）
   - [ ] 创建 `src/app/(dashboard)/events/influencers/page.tsx`
   - [ ] 创建 `src/app/(dashboard)/events/influencers/[id]/page.tsx`
   - [ ] InfluencerList 组件
   - [ ] InfluencerTimeline 组件
   - [ ] InvestmentIdeasCard 组件
   - [ ] 添加/编辑大V功能

5. **大V相关 API**（0.5天）
   - [ ] 实现 `GET /api/influencers`
   - [ ] 实现 `POST /api/influencers`
   - [ ] 实现 `GET /api/influencers/[id]/posts`
   - [ ] 实现 `POST /api/influencers/[id]/fetch`

#### 验收标准

- ✅ B站大V动态可正常采集（至少一个测试账号）
- ✅ 微博/小红书显示模拟数据
- ✅ 大V列表展示正常
- ✅ 动态时间线正确显示
- ✅ 投资理念提取功能可用
- ✅ 手动触发采集功能正常

---

## Phase 3 实施计划

### 数据源插件化架构（轻量级）

**优先级**: P2（中）  
**预计工作量**: 2天

#### 任务清单

1. **Provider Schema 定义**（0.5天）
   - [ ] 创建 `data-service/providers/schemas.py`
   - [ ] 定义所有 Provider 的 JSON Schema
   - [ ] 包含字段验证规则

2. **Provider 动态加载器**（0.5天）
   - [ ] 创建 `data-service/providers/loader.py`
   - [ ] 实现动态加载逻辑
   - [ ] Provider 注册表

3. **Provider 管理 API**（0.5天）
   - [ ] 创建 `data-service/routers/providers.py`
   - [ ] 实现 `GET /api/providers/list`
   - [ ] 实现 `GET /api/providers/{name}/schema`

4. **前端动态表单生成**（0.5天）
   - [ ] 创建 `src/components/datasources/DynamicConfigForm.tsx`
   - [ ] 根据 JSON Schema 生成表单字段
   - [ ] 字段验证

#### 验收标准

- ✅ 前端可获取所有可用 Provider 列表
- ✅ 根据 Provider 自动生成配置表单
- ✅ 新增数据源时可选择 Provider 类型
- ✅ 配置参数验证正确

---

## Phase 4 实施计划

### 前后端 AI 逻辑统一

**优先级**: P2（中）  
**预计工作量**: 1.5天

#### 任务清单

1. **Python AI 统一入口**（0.5天）
   - [ ] 创建 `data-service/routers/ai.py`
   - [ ] 实现所有 AI 分析端点
   - [ ] 统一错误处理

2. **Next.js AI 服务封装**（0.5天）
   - [ ] 创建 `src/lib/services/ai-analysis.service.ts`
   - [ ] 封装所有 AI 调用
   - [ ] 替代原有 claude.ts

3. **前端迁移**（0.5天）
   - [ ] 更新所有调用 AI 的地方
   - [ ] 删除前端 Anthropic SDK 依赖
   - [ ] 测试所有 AI 功能

#### 验收标准

- ✅ 前端不再直接调用 Claude API
- ✅ 所有 AI 分析通过后端统一处理
- ✅ 分析结果一致性提升
- ✅ API 调用成本降低

---

### 全文搜索实现

**优先级**: P2（中）  
**预计工作量**: 2天

#### 任务清单

1. **FTS5 数据库迁移**（0.5天）
   - [ ] 创建 FTS5 虚拟表
   - [ ] 创建同步触发器
   - [ ] 初始化现有数据

2. **搜索服务实现**（0.5天）
   - [ ] 创建 `src/lib/services/search.service.ts`
   - [ ] 实现全文搜索逻辑
   - [ ] FTS5 查询构建
   - [ ] 搜索建议功能

3. **搜索 API**（0.5天）
   - [ ] 实现 `GET /api/search`
   - [ ] 实现 `GET /api/search/suggestions`
   - [ ] 结果高亮处理

4. **搜索 UI 组件**（0.5天）
   - [ ] 创建 `src/components/events/SearchBar.tsx`
   - [ ] 自动完成下拉框
   - [ ] 搜索历史
   - [ ] 搜索结果页面增强

#### 验收标准

- ✅ 支持中文全文搜索
- ✅ 搜索结果正确高亮关键词
- ✅ 搜索建议功能可用
- ✅ 搜索性能良好（<200ms）

---

### 性能优化

**优先级**: P2（中）  
**预计工作量**: 2天

#### 任务清单

1. **数据库查询优化**（0.5天）
   - [ ] 使用 select 减少数据传输
   - [ ] 批量查询减少 N+1 问题
   - [ ] 索引优化

2. **缓存策略**（0.5天）
   - [ ] 实现内存缓存层
   - [ ] API 响应缓存（5分钟）
   - [ ] 缓存失效策略

3. **Python 后端优化**（0.5天）
   - [ ] 批量插入优化（executemany）
   - [ ] 数据库连接池
   - [ ] 异步并发优化

4. **前端性能优化**（0.5天）
   - [ ] 实现虚拟滚动（长列表）
   - [ ] 无限滚动（分页加载）
   - [ ] 防抖节流优化

#### 验收标准

- ✅ 资讯流加载时间 < 1秒
- ✅ 长列表（>1000条）滚动流畅
- ✅ API 响应时间 < 500ms
- ✅ 内存占用合理

---

## 实施时间表

### 总体时间线

**Phase 1 收尾**: 1天  
**Phase 2**: 7-9天  
**Phase 3**: 2天  
**Phase 4**: 5.5天  

**总计**: 15.5-17.5天（约3-4周）

### 详细排期

#### Week 1: Phase 1 收尾 + Phase 2 启动

**Day 1-2**: Phase 1 收尾
- 创建 db.py
- 修改 fetch_service.py
- 端到端测试

**Day 3-4**: R5 采集日志和监控
- LogViewer 组件
- 数据源详情页
- 统计 API

**Day 5**: R6 分类体系集成（Part 1）
- NewsCategory API
- Domain API

#### Week 2: Phase 2 继续

**Day 6**: R6 分类体系集成（Part 2）
- 分类树形选择器
- AI 映射逻辑

**Day 7-9**: R7 大V监控（Part 1）
- B站 Provider
- 微博/小红书 Provider（模拟）
- 采集任务集成

**Day 10**: R7 大V监控（Part 2）
- 大V相关 API

#### Week 3: Phase 2 完成 + Phase 3

**Day 11-12**: R7 大V监控（Part 3）
- InfluencerList 组件
- InfluencerTimeline 组件
- 大V监控 UI 完整实现

**Day 13-14**: Phase 3 数据源插件化
- Provider Schema
- 动态加载器
- 动态表单生成

#### Week 4: Phase 4

**Day 15-16**: AI 逻辑统一 + 全文搜索
- AI 统一入口
- FTS5 实现
- 搜索 UI

**Day 17**: 性能优化
- 数据库优化
- 缓存策略
- 前端优化

**Day 18**: 集成测试和文档
- 端到端测试
- 性能测试
- 文档更新

---

## 风险评估

### 技术风险

#### 高风险

1. **SQLite 并发写入问题**
   - **风险**: Python 和 Next.js 同时写入可能冲突
   - **缓解**: 
     - 只允许 Python 写入，Next.js 只读
     - 使用 WAL 模式提升并发性
     - 添加写入队列

2. **B站 API 稳定性**
   - **风险**: bilibili-api-python 可能失效或被限流
   - **缓解**:
     - 添加重试机制
     - 降级到模拟数据
     - 限制请求频率

#### 中风险

3. **FTS5 中文分词效果**
   - **风险**: unicode61 分词可能不够精确
   - **缓解**:
     - 使用关键词字段辅助搜索
     - 考虑集成 jieba 分词（Phase 4+）

4. **大数据量性能**
   - **风险**: 数据量增长后性能下降
   - **缓解**:
     - 严格执行数据清理策略
     - 定期 VACUUM 优化
     - 考虑归档方案

#### 低风险

5. **前端状态管理复杂度**
   - **风险**: TanStack Query 使用不当
   - **缓解**:
     - 参考最佳实践
     - 统一封装 hooks
     - 代码审查

### 进度风险

1. **UI 开发工作量**
   - **风险**: UI 组件开发可能超出预期
   - **缓解**: 
     - 优先完成核心功能
     - 复用 shadcn/ui 组件
     - 必要时简化交互

2. **测试时间不足**
   - **风险**: 集成测试发现问题需要返工
   - **缓解**:
     - 每个 Phase 完成后立即测试
     - 设置缓冲时间（预留1-2天）

---

## 验收标准

### Phase 1 验收

- [ ] Python 服务可正常写入 SQLite 数据库
- [ ] 调度器自动采集任务正常运行
- [ ] 采集的文章包含完整的 AI 分析结果
- [ ] 前端可读取本地数据库数据
- [ ] 数据库滚动刷新正常（7天保留）

### Phase 2 验收

#### R5: 采集日志和监控

- [ ] 数据源详情页显示最近50条日志
- [ ] 日志包含状态、耗时、统计信息
- [ ] 健康度评分准确（基于成功率和错误率）
- [ ] 统计仪表盘显示完整数据

#### R6: 分类体系集成

- [ ] 分类树正确展示多级结构
- [ ] AI 分类结果映射到 NewsCategory
- [ ] 筛选器支持分类树选择
- [ ] 显示分类置信度

#### R7: 大V监控

- [ ] B站大V可正常采集（至少1个账号）
- [ ] 微博/小红书显示模拟数据
- [ ] 大V列表页面正常
- [ ] 动态时间线展示完整
- [ ] 投资理念提取功能可用
- [ ] 手动触发采集正常

### Phase 3 验收

- [ ] 前端可获取 Provider 列表及 Schema
- [ ] 新增数据源时动态生成配置表单
- [ ] 配置参数验证正确
- [ ] 至少支持5种 Provider 类型

### Phase 4 验收

#### AI 逻辑统一

- [ ] 前端不直接调用 Claude API
- [ ] 所有 AI 功能通过后端
- [ ] 分析结果一致

#### 全文搜索

- [ ] 支持中文全文搜索
- [ ] 搜索结果高亮正确
- [ ] 搜索建议功能正常
- [ ] 搜索性能 < 200ms

#### 性能优化

- [ ] 资讯流加载 < 1秒
- [ ] 长列表滚动流畅（虚拟滚动）
- [ ] API 响应 < 500ms
- [ ] 内存占用合理

### 端到端验收

- [ ] 新增数据源 → 自动采集 → AI 清洗 → 存储 → UI 展示（完整流程）
- [ ] 大V监控 → 动态采集 → 投资理念提取 → UI 展示
- [ ] 全文搜索 → 结果展示 → 筛选 → 详情查看
- [ ] 存储配置 → 自动清理 → 验证数据保留期
- [ ] 性能测试：1000+ 文章加载流畅

---

## 附录

### 依赖安装

**Python 依赖**（`data-service/requirements.txt`）：
```
aiosqlite>=0.19.0
bilibili-api-python>=16.0.0
feedparser>=6.0.10
```

**Node.js 依赖**（`package.json`）：
```json
{
  "dependencies": {
    "@tanstack/react-query": "^5.0.0",
    "@tanstack/react-virtual": "^3.0.0",
    "recharts": "^2.10.0"
  }
}
```

### 数据库路径

- **开发环境**: `prisma/dev.db`
- **Python 访问**: `../prisma/dev.db`（相对于 data-service 目录）

### 环境变量

```bash
# .env.local
DATA_SERVICE_URL=http://localhost:8000
ANTHROPIC_API_KEY=sk-ant-xxx
```

```bash
# data-service/.env
ANTHROPIC_API_KEY=sk-ant-xxx
DATABASE_PATH=../prisma/dev.db
```

### 关键文件清单

**新建文件**：
```
data-service/
├── db.py                                    # ⭐ SQLite 访问层
├── providers/
│   ├── bilibili_provider.py                # ⭐ B站 Provider
│   ├── weibo_provider.py                   # ⭐ 微博 Provider
│   ├── xiaohongshu_provider.py             # ⭐ 小红书 Provider
│   ├── schemas.py                          # ⭐ Provider Schema
│   └── loader.py                           # ⭐ Provider 加载器
├── routers/
│   ├── ai.py                               # ⭐ AI 统一入口
│   ├── providers.py                        # ⭐ Provider 管理
│   └── storage.py                          # ⭐ 存储管理

src/
├── app/(dashboard)/events/
│   ├── sources/new/page.tsx                # ⭐ 新增数据源
│   ├── sources/[id]/page.tsx               # ⭐ 数据源详情
│   ├── sources/[id]/edit/page.tsx          # ⭐ 编辑数据源
│   ├── influencers/page.tsx                # ⭐ 大V监控主页
│   ├── influencers/[id]/page.tsx           # ⭐ 大V详情页
│   └── settings/storage/page.tsx           # ⭐ 存储配置
├── app/api/
│   ├── storage/config/route.ts             # ⭐ 存储配置 API
│   ├── storage/stats/route.ts              # ⭐ 存储统计 API
│   ├── storage/cleanup/route.ts            # ⭐ 清理 API
│   ├── datasources/logs/route.ts           # ⭐ 日志 API
│   ├── stats/dashboard/route.ts            # ⭐ 仪表盘 API
│   ├── search/route.ts                     # ⭐ 搜索 API
│   └── search/suggestions/route.ts         # ⭐ 搜索建议 API
├── components/
│   ├── datasources/
│   │   ├── DataSourceForm.tsx              # ⭐ 数据源表单
│   │   ├── LogViewer.tsx                   # ⭐ 日志查看器
│   │   ├── HealthMonitor.tsx               # ⭐ 健康监控
│   │   └── DynamicConfigForm.tsx           # ⭐ 动态配置表单
│   ├── influencers/
│   │   ├── InfluencerList.tsx              # ⭐ 大V列表
│   │   ├── InfluencerTimeline.tsx          # ⭐ 动态时间线
│   │   ├── InvestmentIdeasCard.tsx         # ⭐ 投资理念卡片
│   │   └── PlatformBadge.tsx               # ⭐ 平台徽章
│   ├── events/
│   │   ├── AdvancedFilter.tsx              # ⭐ 高级筛选器
│   │   ├── SearchBar.tsx                   # ⭐ 搜索栏
│   │   ├── CategoryTreeSelect.tsx          # ⭐ 分类树选择器
│   │   └── SentimentChart.tsx              # ⭐ 情感图表
│   └── settings/
│       ├── StorageConfigForm.tsx           # ⭐ 存储配置表单
│       ├── StorageStats.tsx                # ⭐ 存储统计
│       └── CleanupPreview.tsx              # ⭐ 清理预览
├── lib/services/
│   ├── ai-analysis.service.ts              # ⭐ AI 分析服务
│   └── search.service.ts                   # ⭐ 搜索服务
└── hooks/
    ├── useStorageConfig.ts                 # ⭐ 存储配置 Hook
    ├── useInfluencers.ts                   # ⭐ 大V监控 Hook
    └── useSearch.ts                        # ⭐ 搜索 Hook
```

**修改文件**：
```
data-service/
├── main.py                                  # 注册新路由
├── services/fetch_service.py                # 使用 db.py
└── requirements.txt                         # 添加新依赖

prisma/
└── schema.prisma                            # 添加 FilterRule、确保 StorageConfig

src/
├── app/(dashboard)/events/
│   ├── sources/page.tsx                     # 增强功能
│   └── feed/page.tsx                        # 增强筛选
└── package.json                             # 添加新依赖
```

---

## 总结

本设计文档完整规划了事件驱动系统的重构方案，涵盖：

1. **Phase 1 收尾**: Python SQLite 集成
2. **Phase 2**: 数据源管理、采集监控、分类体系、大V监控
3. **Phase 3**: 数据源插件化架构
4. **Phase 4**: AI 逻辑统一、全文搜索、性能优化

**核心亮点**：
- ✅ 渐进式增强，风险可控
- ✅ 完整的五层架构实现
- ✅ 轻量级插件化机制
- ✅ 全面的 UI 交互设计
- ✅ 清晰的实施时间表

**预计交付**：3-4周完成所有功能

**下一步**: 开始实施 Phase 1 收尾，创建 db.py 文件。

---

**文档版本**: v2.0  
**最后更新**: 2026-07-19  
**作者**: Claude Opus 4.8

