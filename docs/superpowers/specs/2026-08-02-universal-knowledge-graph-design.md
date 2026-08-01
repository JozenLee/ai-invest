# 通用知识图谱系统设计文档

**版本**: 1.0  
**日期**: 2026-08-02  
**项目**: ai-invest  
**作者**: AI Assistant  

---

## 1. 项目概述

### 1.1 目标

构建一个**通用的多领域知识图谱系统**，支持不同垂直领域（AI算力硬件、新能源、医药等）的自动化知识采集、抽取、更新和可视化展示。系统深度集成到 ai-invest 项目中，复用现有基础设施，作为核心分析能力。

### 1.2 核心特性

- **多领域支持**：通过配置驱动快速接入新领域，支持领域特定的实体类型和关系
- **自动更新**：定时增量更新 + 事件驱动 + 手动触发，保持数据新鲜度
- **智能抽取**：基于 LLM 的知识抽取，借鉴 GraphRAG 的 prompt 工程
- **深度集成**：与 ai-invest 共享调度器、AI 服务、新闻管道
- **可视化**：力导向图展示，支持节点详情、关系探索、新闻关联

### 1.3 MVP 范围

- **首个领域**：AI算力硬件（公司、产品、技术、供应链）
- **数据源**：OpenBB API + RSS 新闻 + 手动输入
- **前端视图**：领域列表 + 领域图谱 + 节点详情
- **更新频率**：每日定时 + 新闻实时触发

---

## 2. 系统架构

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                     前端层 (Next.js)                         │
│  /graph              /graph/ai-hardware    /graph/new-energy │
│  领域列表            AI算力图谱             新能源图谱        │
└─────────────────────────────────────────────────────────────┘
                              ↓ HTTP/REST
┌─────────────────────────────────────────────────────────────┐
│               数据服务层 (FastAPI - data-service)            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ KG Router    │  │ Collector    │  │ Extractor    │      │
│  │ /kg/*        │  │ Service      │  │ Service      │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         ↓                  ↓                  ↓              │
│  ┌──────────────────────────────────────────────────┐       │
│  │         Domain Manager (领域配置管理)             │       │
│  └──────────────────────────────────────────────────┘       │
│         ↓                                    ↓               │
│  ┌──────────────┐                    ┌──────────────┐       │
│  │ Neo4j        │                    │ Scheduler    │       │
│  │ Service      │                    │ (复用现有)    │       │
│  └──────────────┘                    └──────────────┘       │
└─────────────────────────────────────────────────────────────┘
         ↓                                      ↓
┌─────────────────┐                    ┌──────────────┐
│   Neo4j         │                    │  SQLite      │
│ (知识图谱存储)   │                    │ (业务数据)    │
└─────────────────┘                    └──────────────┘
         ↑
         │ 数据采集
┌─────────────────────────────────────────────────────────────┐
│              外部数据源                                       │
│  OpenBB API │ RSS Feed │ Web Scraper │ Claude API           │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 架构决策

**方案选择：深度集成架构（方案 B）**

- **Neo4j 独立存储**：知识图谱使用专业图数据库，发挥原生图查询能力
- **统一服务层**：通过 data-service 统一管理 Neo4j 和 SQLite
- **共享基础设施**：复用 ai-invest 的调度器、AI 分析器、新闻管道
- **轻量级关联**：SQLite 中的 `KGNewsLink` 表连接新闻和图谱节点

**关键优势**：
1. 充分复用现有能力，开发效率高
2. 数据联动紧密（新闻自动关联到图谱）
3. 统一的监控、日志、错误处理
4. 复杂度可控，易于维护

### 2.3 核心模块

| 模块 | 职责 | 技术栈 |
|------|------|--------|
| **Domain Manager** | 加载领域配置、验证 Schema、生成抽取 Prompt | Python + YAML |
| **Neo4j Service** | Neo4j 驱动封装、Cypher 查询、事务管理 | neo4j-driver |
| **Collector Service** | 数据采集调度、多源数据获取、去重入队 | httpx + feedparser |
| **Extractor Service** | LLM 知识抽取、实体对齐、关系识别 | Claude API |
| **KG Router** | RESTful API、查询接口、更新触发 | FastAPI |
| **Scheduler** | 定时任务、事件监听、手动触发 | 复用 scheduler_service.py |

---

## 3. 领域配置与数据模型

### 3.1 领域配置文件

**位置**：`data-service/config/domains/<domain-code>.yaml`

**示例**：`ai-hardware.yaml`

```yaml
domain:
  code: ai-hardware
  name: AI算力硬件
  description: AI芯片、GPU、加速器及供应链
  version: "1.0"
  
entities:
  - type: hardware_company
    label: 硬件公司
    description: AI芯片和硬件制造商
    properties:
      - name: name
        type: string
        required: true
      - name: ticker
        type: string
        description: 股票代码
      - name: country
        type: string
      - name: market_cap
        type: float
        unit: USD
      - name: founded_year
        type: integer
    
  - type: hardware_product
    label: 硬件产品
    properties:
      - name: model
        type: string
        required: true
      - name: product_type
        type: enum
        values: [GPU, TPU, NPU, ASIC, FPGA]
        required: true
      - name: launch_date
        type: date
      - name: process_node
        type: string
      - name: memory_gb
        type: integer
      - name: compute_fp16_tflops
        type: float
      - name: tdp_watts
        type: integer
      - name: price_usd
        type: float

  - type: hardware_technology
    label: 技术栈
    properties:
      - name: name
        type: string
        required: true
      - name: category
        type: enum
        values: [architecture, software_stack, interconnect, compiler]

relationships:
  - type: MANUFACTURES
    label: 生产
    from: hardware_company
    to: hardware_product
    properties:
      - name: start_date
        type: date
      - name: production_status
        type: enum
        values: [announced, mass_production, discontinued]
  
  - type: COMPETES_WITH
    label: 竞争
    from: hardware_product
    to: hardware_product
    bidirectional: true
    properties:
      - name: market_segment
        type: string
      - name: confidence
        type: float
        range: [0, 1]
  
  - type: SUPPLIES
    label: 供应
    from: hardware_company
    to: hardware_company
    properties:
      - name: supply_type
        type: string

data_sources:
  - name: openbb
    type: api
    enabled: true
    schedule: "0 2 * * *"  # 每天凌晨2点
    config:
      companies:
        - ticker: NVDA
          name: NVIDIA
        - ticker: AMD
          name: AMD
        - ticker: INTC
          name: Intel
  
  - name: tech_news_rss
    type: rss
    enabled: true
    schedule: "0 * * * *"  # 每小时
    config:
      feeds:
        - url: https://www.anandtech.com/rss/
          keywords: [GPU, AI accelerator, data center]
        - url: https://www.tomshardware.com/feeds/all
          keywords: [GPU, graphics card, AI chip]

extraction_config:
  llm_model: claude-3-5-sonnet-20241022
  batch_size: 10
  extraction_prompt_template: |
    从以下文本中提取 {domain_name} 领域的实体和关系...
```

### 3.2 Neo4j 数据模型

**节点设计**：

```cypher
// 通用基础节点
(:KGNode {
  id: string,              // UUID
  domain: string,          // 领域代码
  type: string,            // 实体类型
  name: string,            // 名称
  created_at: datetime,
  updated_at: datetime,
  data_quality: string,    // high/medium/low
  source: string,          // 数据来源
  news_count_7d: int,      // 7天内相关新闻数
  news_count_30d: int      // 30天内相关新闻数
})

// 具体节点继承通用属性并添加特定标签
(:KGNode:HardwareCompany {
  ticker: string,
  country: string,
  market_cap: float,
  founded_year: int,
  website: string
})

(:KGNode:HardwareProduct {
  model: string,
  product_type: string,
  launch_date: date,
  process_node: string,
  memory_gb: int,
  compute_fp16_tflops: float,
  tdp_watts: int,
  price_usd: float
})
```

**关系设计**：

```cypher
-[:REL_TYPE {
  domain: string,          // 领域代码
  confidence: float,       // 置信度 0-1
  source: string,          // 来源
  created_at: datetime,
  updated_at: datetime,
  metadata: string         // JSON存储额外信息
}]->

// 示例
(:HardwareCompany {name: "NVIDIA"})
  -[:MANUFACTURES {
    domain: "ai-hardware",
    start_date: "2022-09-20",
    production_status: "mass_production",
    confidence: 1.0,
    source: "official_announcement"
  }]->
(:HardwareProduct {model: "H100"})
```

### 3.3 SQLite 关联表

在 `prisma/schema.prisma` 中添加：

```prisma
model KGDomain {
  id          String   @id @default(cuid())
  code        String   @unique  // ai-hardware
  name        String
  description String?
  configPath  String   // config/domains/ai-hardware.yaml
  isActive    Boolean  @default(true)
  nodeCount   Int      @default(0)
  edgeCount   Int      @default(0)
  lastSyncAt  DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  newsLinks   KGNewsLink[]
}

model KGNewsLink {
  id          String   @id @default(cuid())
  newsId      String   // 关联 NewsArticle.id
  domainCode  String
  nodeId      String   // Neo4j节点ID
  nodeName    String   // 节点名称（冗余，便于查询）
  nodeType    String   // 节点类型
  relevance   Float    // 相关性 0-1
  extractedAt DateTime
  
  news        NewsArticle @relation(fields: [newsId], references: [id], onDelete: Cascade)
  domain      KGDomain    @relation(fields: [domainCode], references: [code])
  
  @@unique([newsId, nodeId])
  @@index([nodeId])
  @@index([domainCode])
}
```

---

## 4. 数据流与更新机制

### 4.1 采集流程

```
1. Scheduler 触发（定时/事件/手动）
   ↓
2. Collector Service 采集原始数据
   - OpenBB: 公司财务数据
   - RSS: 新闻文章
   - Scraper: 网页内容
   ↓
3. 数据入队（按类型分类）
   ↓
4. Extractor Service 批量处理
   - 生成领域特定 Prompt
   - 调用 Claude API 抽取实体和关系
   - 实体对齐和消歧
   ↓
5. Neo4j Service 写入图谱
   - 节点：MERGE（存在则更新）
   - 关系：CREATE 或更新置信度
   ↓
6. 更新 SQLite 关联表
   - KGNewsLink: 新闻关联
   - KGDomain: 统计信息
   ↓
7. 触发前端缓存更新
```

### 4.2 三种更新方式

#### 1. 定时增量更新

```python
# 调度配置（来自 YAML）
schedule: "0 2 * * *"  # 每天凌晨2点

# 任务逻辑
async def daily_kg_update(domain_code: str):
    # 1. 采集新数据（只获取增量）
    collector = KGCollectorService()
    new_data = await collector.collect_domain_data(
        domain_code,
        since=datetime.now() - timedelta(days=1)
    )
    
    # 2. 批量知识抽取
    extractor = KGExtractorService()
    for batch in chunk(new_data, batch_size=10):
        await extractor.process_batch(domain_code, batch)
    
    # 3. 更新统计信息
    await update_domain_stats(domain_code)
```

#### 2. 事件驱动更新

```python
# 在 news_pipeline.py 中集成
async def process_news(article: NewsArticle):
    # 现有新闻处理...
    
    # 触发知识图谱关联
    domain_code = detect_domain(article)
    if domain_code:
        await link_to_knowledge_graph(article, domain_code)

async def link_to_knowledge_graph(article, domain_code):
    # 1. 从新闻中抽取实体
    extractor = KGExtractorService()
    result = await extractor.extract_knowledge(
        domain_code,
        f"{article.title}\n{article.content}",
        f"news_{article.id}"
    )
    
    # 2. 查找图谱中匹配的节点
    neo4j = Neo4jService()
    for entity in result["entities"]:
        node_id = neo4j.find_node_by_name(
            domain_code,
            entity["canonical_name"]
        )
        
        if node_id:
            # 创建 SQLite 关联
            await create_news_link(article.id, node_id, entity)
            
            # 更新 Neo4j 节点的新闻计数
            neo4j.increment_news_count(node_id)
```

#### 3. 手动触发更新

```python
# API 端点
@router.post("/domains/{domain_code}/collect")
async def trigger_manual_update(domain_code: str):
    # 后台任务执行
    background_tasks.add_task(
        collect_and_extract,
        domain_code
    )
    
    return {"status": "started"}
```

### 4.3 知识抽取（借鉴 GraphRAG）

```python
class KGExtractorService:
    async def extract_knowledge(self, domain_code: str, text: str):
        # 1. 生成领域特定 Prompt（类似 GraphRAG）
        domain = domain_manager.get_domain(domain_code)
        
        prompt = f"""
你是知识图谱构建助手，专注于 {domain.name} 领域。

**实体类型：**
{format_entity_types(domain.entities)}

**关系类型：**
{format_relationship_types(domain.relationships)}

**文本：**
{text}

**要求：**
1. 只提取上述定义的实体类型
2. 提取实体的所有可用属性
3. 识别实体间的关系，标注置信度
4. 对于同一实体的不同表述，识别为同一实体

返回JSON格式：
{{
  "entities": [...],
  "relationships": [...]
}}
"""
        
        # 2. 调用 Claude API
        response = await content_analyzer.analyze_with_claude(
            prompt,
            response_format="json"
        )
        
        # 3. 实体对齐（GraphRAG 的 entity resolution）
        result = json.loads(response)
        aligned_entities = await self.align_entities(
            domain_code,
            result["entities"]
        )
        
        return {
            "entities": aligned_entities,
            "relationships": result["relationships"]
        }
    
    async def align_entities(self, domain_code, entities):
        """实体消歧和对齐"""
        neo4j = Neo4jService()
        
        aligned = []
        for entity in entities:
            # 在已有图谱中查找匹配节点
            existing_node = neo4j.fuzzy_match_node(
                domain_code,
                entity["name"],
                entity.get("mentions", [])
            )
            
            entity["canonical_name"] = (
                existing_node["name"] if existing_node
                else entity["name"]
            )
            entity["existing_node_id"] = (
                existing_node["id"] if existing_node
                else None
            )
            
            aligned.append(entity)
        
        return aligned
```

---

## 5. API 设计

### 5.1 领域管理

```
GET  /kg/domains                    # 获取所有领域列表
GET  /kg/domains/{code}             # 获取领域详情
GET  /kg/domains/{code}/schema      # 获取领域Schema
```

### 5.2 图谱查询

```
GET  /kg/domains/{code}/nodes                        # 查询节点列表
GET  /kg/domains/{code}/nodes/{id}                   # 获取节点详情
GET  /kg/domains/{code}/graph                        # 获取图谱数据（可视化）
GET  /kg/domains/{code}/graph?center={id}&depth=2   # 子图查询
```

### 5.3 数据更新

```
POST /kg/domains/{code}/collect     # 触发数据采集
POST /kg/domains/{code}/extract     # 手动触发知识抽取
```

### 5.4 统计分析

```
GET  /kg/domains/{code}/stats       # 获取领域统计
```

---

## 6. 前端实现

### 6.1 页面结构

```
/graph                          # 领域列表页
/graph/ai-hardware              # AI算力硬件图谱页
/graph/ai-hardware?node={id}    # 节点详情（侧边栏）
```

### 6.2 核心组件

**GraphCanvas** - 图谱可视化画布
- 基于 `react-force-graph-2d`
- 力导向布局
- 节点颜色按类型区分
- 支持缩放、拖拽、搜索

**NodeDetailPanel** - 节点详情侧边栏
- 节点基本信息和属性
- 关系列表（上游/下游）
- 相关新闻列表（从 SQLite 查询）

**GraphControls** - 控制面板
- 搜索节点
- 筛选节点类型
- 手动触发更新

**DomainCard** - 领域卡片
- 领域名称、描述
- 节点数、关系数
- 最后更新时间

### 6.3 交互流程

```
用户访问 /graph
  ↓
展示所有领域卡片
  ↓
点击某个领域
  ↓
跳转到 /graph/{domain}
  ↓
加载图谱数据（GET /kg/domains/{domain}/graph）
  ↓
渲染力导向图
  ↓
点击节点
  ↓
右侧弹出详情面板（GET /kg/domains/{domain}/nodes/{id}）
  ↓
显示节点属性、关系、相关新闻
```

---

## 7. 技术栈总结

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| 前端框架 | Next.js 16 + React 19 | 复用 ai-invest |
| 图谱可视化 | react-force-graph-2d | 力导向图 |
| 后端框架 | FastAPI | 复用 data-service |
| 图数据库 | Neo4j 5.x | 原生图查询 |
| 关系数据库 | SQLite + Prisma | 业务数据和关联 |
| LLM | Claude API | 知识抽取 |
| 调度 | APScheduler | 复用现有调度器 |
| 配置 | YAML | 领域配置 |

---

## 8. MVP 实施计划

### Week 1: 基础设施

- [ ] 部署 Neo4j（Docker）
- [ ] 创建 `config/domains/ai-hardware.yaml`
- [ ] 实现 `DomainManager` 加载配置
- [ ] 实现 `Neo4jService` 基础操作
- [ ] 添加 SQLite 表（KGDomain, KGNewsLink）

### Week 2: 数据采集与抽取

- [ ] 实现 `KGCollectorService`（OpenBB + RSS）
- [ ] 实现 `KGExtractorService`（Claude API）
- [ ] 编写知识抽取 Prompt 模板
- [ ] 测试采集和抽取流程

### Week 3: API 与调度

- [ ] 实现 `/kg/*` REST API
- [ ] 集成到调度器（定时任务）
- [ ] 实现事件驱动（新闻触发）
- [ ] 手动触发接口

### Week 4: 前端展示

- [ ] 领域列表页（`/graph`）
- [ ] 领域图谱页（`/graph/ai-hardware`）
- [ ] 图谱可视化组件
- [ ] 节点详情面板

### Week 5: 测试与优化

- [ ] 端到端测试
- [ ] 性能优化（查询缓存）
- [ ] 错误处理完善
- [ ] 文档编写

---

## 9. 风险与应对

| 风险 | 影响 | 应对措施 |
|------|------|---------|
| Neo4j 运维复杂 | 中 | Docker 部署，自动备份，监控告警 |
| LLM 调用成本高 | 中 | 批量处理，缓存结果，分级策略 |
| 实体对齐困难 | 高 | 人工标注种子数据，逐步优化算法 |
| 数据源反爬 | 中 | 使用官方 API，降低频率，备用源 |
| 知识冲突 | 低 | 置信度机制，来源追溯，人工审核 |

---

## 10. 后续扩展

### Phase 2: 新增领域

- 新能源领域（电池、光伏、风电）
- 医药领域（药物、临床试验、审批）
- 半导体领域（芯片设计、晶圆、封装）

### Phase 3: 高级功能

- 图算法（社区检测、中心性分析）
- 时间线视图（实体演进历史）
- 对比分析（多节点对比）
- RAG 查询（基于图谱的问答）

### Phase 4: 平台化

- 领域配置管理界面
- 数据质量评分和审核
- 知识融合和冲突解决
- API 开放给第三方

---

## 附录

### A. 关键文件路径

```
ai-invest/
├── data-service/
│   ├── config/
│   │   └── domains/
│   │       └── ai-hardware.yaml
│   ├── services/
│   │   └── kg/
│   │       ├── domain_manager.py
│   │       ├── neo4j_service.py
│   │       ├── collector_service.py
│   │       └── extractor_service.py
│   └── routers/
│       └── kg.py
├── src/
│   └── app/
│       └── (dashboard)/
│           └── graph/
│               ├── page.tsx
│               └── [domain]/
│                   └── page.tsx
└── prisma/
    └── schema.prisma
```

### B. 环境变量

```env
# Neo4j
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-password

# Claude API（复用现有）
ANTHROPIC_API_KEY=your-key

# OpenBB API（复用现有）
OPENBB_API_KEY=your-key
```

### C. 依赖包

```txt
# Python (data-service/requirements.txt)
neo4j>=5.0.0
pyyaml>=6.0
```

```json
// TypeScript (package.json)
{
  "dependencies": {
    "react-force-graph-2d": "^1.25.0"
  }
}
```

---

**设计完成，等待审阅和实施。**
