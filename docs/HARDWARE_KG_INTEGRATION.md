# AI算力硬件知识图谱集成方案

## 一、集成策略

将独立的 `ai-hardware-kg` 项目集成到 `ai-invest` 项目中，作为一个新的知识图谱子领域。

### 集成原则
1. **复用基础设施**：使用 ai-invest 的 Prisma + SQLite 存储，不引入 Neo4j
2. **统一架构**：遵循 ai-invest 的 Next.js + FastAPI 双层架构
3. **扩展现有模块**：在现有知识图谱基础上添加硬件领域节点类型
4. **共享服务**：复用已有的 AI 分析、数据采集、调度等服务

## 二、架构设计

```
ai-invest/
├── src/                          # Next.js 前端
│   ├── app/(dashboard)/graph/
│   │   ├── hardware/            # 新增：硬件图谱页面
│   │   │   ├── page.tsx
│   │   │   └── components/
│   ├── lib/services/
│   │   ├── hardware-kg/         # 新增：硬件图谱服务
│   │   │   ├── collector.service.ts
│   │   │   └── analyzer.service.ts
│   └── types/
│       └── hardware-graph.ts    # 新增：硬件图谱类型
│
├── data-service/                # Python 后端
│   ├── routers/
│   │   └── hardware_kg.py      # 新增：硬件图谱路由
│   ├── services/
│   │   ├── hardware_collector.py    # 新增：硬件数据采集
│   │   ├── hardware_analyzer.py     # 新增：硬件知识抽取
│   │   └── openbb_service.py        # 新增：OpenBB 集成
│   └── providers/
│       └── hardware_sources.py      # 新增：硬件数据源
│
└── prisma/
    └── schema.prisma            # 扩展：添加硬件节点类型
```

## 三、数据模型扩展

### 3.1 扩展 GraphNode 的 type 字段

在现有的知识图谱基础上，添加硬件相关的节点类型：

```prisma
// prisma/schema.prisma 中的 GraphNode 已支持灵活的 type 字段
// 新增硬件领域的节点类型（通过 TypeScript enum 管理）

// 硬件节点类型：
// - hardware_company      (硬件公司，如NVIDIA、AMD)
// - hardware_product      (硬件产品，如H100、MI300X)
// - hardware_technology   (技术，如CUDA、ROCm)
// - hardware_application  (应用场景，如AI训练、推理)
// - hardware_supplier     (供应商，如台积电、三星)
```

### 3.2 添加硬件特定属性表

```prisma
// 硬件产品属性表
model HardwareProduct {
  id                String   @id @default(cuid())
  nodeId            String   @unique
  
  // 基本信息
  model             String              // 型号，如 H100
  manufacturer      String              // 制造商
  productType       String              // GPU/TPU/NPU/ASIC
  
  // 技术规格
  launchDate        DateTime?           // 发布日期
  processNode       String?             // 制程，如 4nm
  memory            Int?                // 显存 GB
  memoryBandwidth   Float?              // 显存带宽 GB/s
  computeFP32       Float?              // FP32算力 TFLOPS
  computeFP16       Float?              // FP16算力 TFLOPS
  computeINT8       Float?              // INT8算力 TOPS
  tdp               Int?                // 功耗 W
  transistorCount   Float?              // 晶体管数量(亿)
  dieSize           Float?              // 芯片面积 mm²
  
  // 市场信息
  price             Float?              // 价格 USD
  availability      String?             // 供货状态
  
  // 元数据
  dataSource        String              // 数据来源
  dataQuality       String   @default("estimated")
  lastVerified      DateTime?
  
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  
  node              GraphNode @relation(fields: [nodeId], references: [id], onDelete: Cascade)
  
  @@index([manufacturer])
  @@index([productType])
  @@index([launchDate])
}

// 硬件公司属性表
model HardwareCompany {
  id                String   @id @default(cuid())
  nodeId            String   @unique
  
  ticker            String?             // 股票代码
  market            String?             // 市场（US/A/HK）
  country           String?             // 国家
  foundedYear       Int?                // 成立年份
  marketCap         Float?              // 市值
  revenue           Float?              // 年收入
  employeeCount     Int?                // 员工数
  website           String?             // 官网
  
  // OpenBB 数据集成
  openbbLastSync    DateTime?
  openbbData        String?             // JSON存储
  
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  
  node              GraphNode @relation(fields: [nodeId], references: [id], onDelete: Cascade)
  
  @@index([ticker])
}

// 性能基准测试
model HardwareBenchmark {
  id                String   @id @default(cuid())
  nodeId            String                // 关联硬件产品节点
  
  benchmarkName     String              // MLPerf, SPECfp等
  benchmarkType     String              // Training/Inference
  value             Float               // 分数
  unit              String?             // 单位
  testDate          DateTime
  testConfig        String?             // 测试配置
  sourceUrl         String?             // 来源链接
  
  createdAt         DateTime @default(now())
  
  node              GraphNode @relation(fields: [nodeId], references: [id], onDelete: Cascade)
  
  @@index([nodeId, benchmarkName])
}

// 新闻事件与硬件节点关联
model HardwareNewsLink {
  id                String   @id @default(cuid())
  newsId            String              // 关联 NewsItem
  nodeId            String              // 关联 GraphNode
  relevance         Float               // 相关性评分 0-1
  sentiment         String?             // positive/neutral/negative
  extractedFacts    String?             // JSON: 提取的事实
  
  createdAt         DateTime @default(now())
  
  news              NewsItem  @relation(fields: [newsId], references: [id], onDelete: Cascade)
  node              GraphNode @relation(fields: [nodeId], references: [id], onDelete: Cascade)
  
  @@unique([newsId, nodeId])
  @@index([nodeId])
}
```

## 四、前端集成

### 4.1 新增硬件图谱页面

```typescript
// src/app/(dashboard)/graph/hardware/page.tsx
import { HardwareKnowledgeGraph } from '@/components/graph/hardware-knowledge-graph'

export default function HardwareGraphPage() {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">AI算力硬件知识图谱</h1>
        <p className="text-muted-foreground mt-2">
          追踪AI芯片厂商、硬件产品、供应链关系和技术演进
        </p>
      </div>
      
      <HardwareKnowledgeGraph />
    </div>
  )
}
```

### 4.2 扩展类型定义

```typescript
// src/types/hardware-graph.ts
export type HardwareNodeType =
  | 'hardware_company'
  | 'hardware_product'
  | 'hardware_technology'
  | 'hardware_application'
  | 'hardware_supplier'

export type HardwareRelationType =
  | 'manufactures'        // 公司 -> 产品
  | 'supplies'            // 供应商 -> 公司
  | 'competes_with'       // 产品 <-> 产品
  | 'uses_technology'     // 产品 -> 技术
  | 'optimized_for'       // 产品 -> 应用
  | 'supply_chain'        // 供应链关系
  | 'invests_in'          // 投资关系

export interface HardwareProduct extends GraphNode {
  type: 'hardware_product'
  hardware?: {
    model: string
    manufacturer: string
    productType: 'GPU' | 'TPU' | 'NPU' | 'ASIC'
    launchDate?: string
    processNode?: string
    memory?: number
    computeFP16?: number
    tdp?: number
    price?: number
    // ... 其他规格
  }
}

export interface HardwareCompany extends GraphNode {
  type: 'hardware_company'
  company?: {
    ticker?: string
    market?: string
    country?: string
    marketCap?: number
    revenue?: number
  }
}
```

### 4.3 复用现有组件

```typescript
// 复用 ai-invest 现有的图谱可视化组件
import { KnowledgeGraphVisualization } from '@/components/graph/visualization'
import { GraphNodeEditor } from '@/components/graph/node-editor'
import { GraphRelationEditor } from '@/components/graph/relation-editor'

// 只需扩展节点渲染逻辑以支持硬件节点类型
```

## 五、后端集成

### 5.1 硬件数据采集服务

```python
# data-service/services/hardware_collector.py
import akshare as ak
from typing import List, Dict
import httpx
from bs4 import BeautifulSoup
import feedparser

class HardwareDataCollector:
    """硬件数据采集服务"""
    
    def __init__(self):
        self.session = httpx.AsyncClient()
        
    async def collect_openbb_data(self, ticker: str) -> Dict:
        """通过OpenBB采集公司财务数据"""
        # 调用 ai-invest 已有的市场数据服务
        from services.data_service import DataService
        
        data_service = DataService()
        stock_data = await data_service.get_stock_realtime(ticker, "US")
        
        return {
            "ticker": ticker,
            "price": stock_data.get("price"),
            "market_cap": stock_data.get("market_cap"),
            # ...
        }
    
    async def scrape_gpu_specs(self, model: str) -> Dict:
        """爬取GPU规格（TechPowerUp等）"""
        # 实现GPU规格爬取
        pass
    
    async def fetch_news_rss(self, keywords: List[str]) -> List[Dict]:
        """采集硬件新闻（RSS）"""
        feeds = [
            "https://www.anandtech.com/rss/",
            "https://www.tomshardware.com/feeds/all"
        ]
        
        articles = []
        for feed_url in feeds:
            feed = feedparser.parse(feed_url)
            for entry in feed.entries:
                # 关键词过滤
                if any(kw.lower() in entry.title.lower() for kw in keywords):
                    articles.append({
                        "title": entry.title,
                        "link": entry.link,
                        "published": entry.published,
                        "summary": entry.summary
                    })
        
        return articles
```

### 5.2 硬件知识抽取服务

```python
# data-service/services/hardware_analyzer.py
from services.content_analyzer import ContentAnalyzer

class HardwareKnowledgeAnalyzer:
    """硬件知识抽取服务（复用ai-invest的AI能力）"""
    
    def __init__(self):
        # 复用现有的 ContentAnalyzer
        self.content_analyzer = ContentAnalyzer()
    
    async def extract_hardware_entities(self, text: str) -> Dict:
        """从文本中提取硬件实体和关系"""
        
        prompt = f"""
        从以下文本中提取AI算力硬件相关的实体和关系：
        
        文本：{text}
        
        请识别：
        1. 硬件公司（如NVIDIA、AMD、Intel）
        2. 硬件产品（如H100、MI300X）及其技术规格
        3. 技术（如CUDA、ROCm）
        4. 它们之间的关系（制造、竞争、供应等）
        
        以JSON格式返回。
        """
        
        # 调用 ai-invest 已有的 Claude API
        result = await self.content_analyzer.analyze_with_claude(prompt)
        
        return self._parse_extraction_result(result)
```

### 5.3 API路由

```python
# data-service/routers/hardware_kg.py
from fastapi import APIRouter, Depends
from typing import List
from services.hardware_collector import HardwareDataCollector
from services.hardware_analyzer import HardwareKnowledgeAnalyzer

router = APIRouter(prefix="/hardware-kg", tags=["Hardware KG"])

@router.get("/companies")
async def get_hardware_companies():
    """获取硬件公司列表"""
    # 从数据库查询
    pass

@router.get("/products")
async def get_hardware_products(
    company: str = None,
    product_type: str = None
):
    """获取硬件产品列表"""
    pass

@router.post("/collect/openbb")
async def collect_openbb_data(ticker: str):
    """采集OpenBB数据"""
    collector = HardwareDataCollector()
    data = await collector.collect_openbb_data(ticker)
    
    # 保存到数据库
    # ...
    
    return {"status": "success", "data": data}

@router.post("/collect/news")
async def collect_hardware_news():
    """采集硬件新闻"""
    collector = HardwareDataCollector()
    articles = await collector.fetch_news_rss(
        keywords=["GPU", "AI chip", "NVIDIA", "AMD", "data center"]
    )
    
    return {"count": len(articles), "articles": articles}

@router.post("/extract")
async def extract_hardware_knowledge(text: str):
    """从文本提取硬件知识"""
    analyzer = HardwareKnowledgeAnalyzer()
    result = await analyzer.extract_hardware_entities(text)
    
    return result

@router.get("/graph/stats")
async def get_hardware_graph_stats():
    """获取硬件图谱统计信息"""
    # 节点数、关系数、最近更新等
    pass
```

### 5.4 集成到主路由

```python
# data-service/main.py
from routers import hardware_kg

# 添加硬件KG路由
app.include_router(hardware_kg.router)
```

## 六、调度任务集成

### 6.1 复用现有调度器

```python
# data-service/services/scheduler_service.py 中添加硬件数据采集任务

class SchedulerService:
    # ... 现有代码 ...
    
    def _schedule_hardware_data_collection(self):
        """调度硬件数据采集任务"""
        
        # 每日凌晨2点采集OpenBB数据
        self.scheduler.add_job(
            self._collect_hardware_openbb,
            'cron',
            hour=2,
            minute=0,
            id='hardware_openbb_daily'
        )
        
        # 每小时采集硬件新闻
        self.scheduler.add_job(
            self._collect_hardware_news,
            'interval',
            hours=1,
            id='hardware_news_hourly'
        )
    
    async def _collect_hardware_openbb(self):
        """采集硬件公司OpenBB数据"""
        from services.hardware_collector import HardwareDataCollector
        
        collector = HardwareDataCollector()
        
        # 目标公司列表
        companies = ["NVDA", "AMD", "INTC", "GOOGL", "MSFT"]
        
        for ticker in companies:
            try:
                data = await collector.collect_openbb_data(ticker)
                # 保存到数据库
                logger.info(f"Collected OpenBB data for {ticker}")
            except Exception as e:
                logger.error(f"Failed to collect {ticker}: {e}")
    
    async def _collect_hardware_news(self):
        """采集硬件新闻"""
        from services.hardware_collector import HardwareDataCollector
        
        collector = HardwareDataCollector()
        articles = await collector.fetch_news_rss(
            keywords=["GPU", "AI accelerator", "NVIDIA", "AMD"]
        )
        
        # 保存到 NewsItem 表
        logger.info(f"Collected {len(articles)} hardware news articles")
```

## 七、数据源配置

### 7.1 配置文件

```yaml
# data-service/config/hardware_sources.yaml
data_sources:
  openbb:
    enabled: true
    companies:
      - ticker: NVDA
        name: NVIDIA
      - ticker: AMD
        name: AMD
      - ticker: INTC
        name: Intel
      - ticker: GOOGL
        name: Google
      - ticker: MSFT
        name: Microsoft
    
  rss_feeds:
    - name: AnandTech
      url: https://www.anandtech.com/rss/
      keywords: [GPU, AI accelerator, data center]
    
    - name: Tom's Hardware
      url: https://www.tomshardware.com/feeds/all
      keywords: [GPU, graphics card, AI chip]
  
  scraping:
    - name: TechPowerUp GPU Database
      base_url: https://www.techpowerup.com/gpu-specs/
      enabled: false  # MVP阶段可选
```

## 八、实施步骤

### Phase 1: 基础集成 (Week 1)

1. **数据模型扩展**
   ```bash
   # 1. 编辑 prisma/schema.prisma
   # 2. 添加 HardwareProduct, HardwareCompany 等模型
   # 3. 运行迁移
   npm run db:migrate
   ```

2. **类型定义**
   - 创建 `src/types/hardware-graph.ts`
   - 扩展现有的 `NodeType` 和 `RelationType`

3. **后端服务骨架**
   - `data-service/services/hardware_collector.py`
   - `data-service/services/hardware_analyzer.py`
   - `data-service/routers/hardware_kg.py`

### Phase 2: 数据采集 (Week 2)

1. **OpenBB集成**
   - 实现 `collect_openbb_data()`
   - 采集5家目标公司的基本数据

2. **RSS新闻采集**
   - 实现 `fetch_news_rss()`
   - 集成到现有的 NewsItem 表

3. **调度任务**
   - 添加每日/每小时采集任务
   - 测试自动运行

### Phase 3: 知识抽取 (Week 3)

1. **AI分析集成**
   - 复用 `ContentAnalyzer` 进行实体抽取
   - 实现硬件特定的提示词模板

2. **图谱构建**
   - 将提取的实体保存为 GraphNode
   - 创建关系 GraphEdge
   - 实现去重和对齐逻辑

### Phase 4: 前端展示 (Week 4)

1. **硬件图谱页面**
   - 创建 `/graph/hardware` 路由
   - 复用现有的图谱可视化组件
   - 添加硬件特定的节点样式

2. **数据面板**
   - 公司列表视图
   - 产品对比视图
   - 供应链视图

### Phase 5: 优化迭代 (Week 5)

1. **数据质量**
   - 添加数据验证规则
   - 实现数据质量评分

2. **性能优化**
   - 缓存热点数据
   - 优化查询性能

## 九、优势总结

### 相比独立项目的优势

1. **无需额外基础设施**
   - 不需要 Neo4j、Qdrant、Airflow
   - 复用 SQLite + Prisma（已验证稳定）
   - 降低运维复杂度

2. **统一技术栈**
   - 前端：Next.js + TypeScript（一致）
   - 后端：FastAPI + Python（一致）
   - 数据库：Prisma ORM（一致）

3. **共享核心能力**
   - AI分析：复用 Claude API 调用
   - 数据采集：复用调度器和爬虫框架
   - 新闻处理：集成到现有的新闻流
   - 图谱可视化：复用已有组件

4. **统一维护**
   - 单一代码仓库
   - 统一部署流程
   - 共享配置和密钥管理

5. **数据联动**
   - 硬件新闻可以关联到 ai-invest 的新闻系统
   - 硬件公司股票可以关联到市场数据
   - 硬件产品可以影响相关ETF的分析

## 十、下一步行动

### 立即开始

1. **创建集成分支**
   ```bash
   cd /Users/jozen.lee/ai-softwares/ai-invest
   git checkout -b feature/hardware-kg-integration
   ```

2. **扩展数据模型**
   ```bash
   # 编辑 prisma/schema.prisma
   # 添加上述的新模型
   
   npm run db:migrate
   ```

3. **创建目录结构**
   ```bash
   mkdir -p data-service/services/hardware
   mkdir -p data-service/routers/hardware
   mkdir -p src/app/\(dashboard\)/graph/hardware
   ```

4. **实现第一个功能**
   - 先实现 OpenBB 数据采集
   - 创建 5 个硬件公司节点
   - 在前端展示

需要我开始实施集成吗？我可以先帮你：
1. 扩展 Prisma schema
2. 创建后端服务代码
3. 实现前端页面
4. 配置调度任务
