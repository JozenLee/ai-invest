# AI驱动的产业链知识图谱系统 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建AI自动生成的产业链知识图谱系统，替换现有手动图谱，支持两轮AI探索、泳道式可视化、Git-like审核和定时更新。

**Architecture:** 
- 后端：FastAPI数据服务 + Neo4j图数据库 + SQLite审核记录
- AI引擎：Claude API + Tavily Search进行两轮探索（结构→企业填充）
- 前端：Next.js泳道图组件 + Diff审核界面
- 调度：APScheduler定时更新

**Tech Stack:**
- Backend: Python 3.11+, FastAPI 0.110+, neo4j-driver 5.x, tavily-python
- Frontend: Next.js 16, React 19, TypeScript, D3.js 7.x, shadcn/ui
- Database: Neo4j 5.x, SQLite + Prisma 7
- AI: Claude 3.5 Sonnet, Tavily Search API

## Global Constraints

- Python版本: >= 3.11
- Node.js版本: >= 20.x
- Neo4j版本: 5.15+
- 所有Python异步函数使用async/await
- 前端组件使用TypeScript strict mode
- API响应时间 < 500ms（探索任务除外）
- Neo4j查询优化，使用索引
- 所有用户可见文本使用中文
- 遵循项目现有代码风格（参考CLAUDE.md）
- 每个任务结束时提交代码，commit message格式：`feat: 功能描述`

---

## 文件结构规划

### 后端文件（data-service/）
```
data-service/
├── services/
│   ├── neo4j_service.py          # Neo4j连接和基础操作
│   ├── industry_explorer.py      # AI探索引擎（两轮）
│   ├── graph_diff_service.py     # 版本对比引擎
│   └── industry_scheduler.py     # 定时更新调度
├── routers/
│   └── industry_graph.py         # FastAPI路由
├── models/
│   ├── industry_models.py        # Pydantic数据模型
│   └── diff_models.py            # Diff相关模型
└── config/
    └── neo4j_indexes.cypher      # Neo4j索引脚本
```

### 前端文件（src/）
```
src/
├── app/(dashboard)/graph/
│   ├── page.tsx                  # 产业列表页
│   ├── create/page.tsx           # 创建产业页
│   ├── [industryId]/page.tsx    # 泳道图页面
│   └── reviews/
│       ├── page.tsx              # 待审核列表
│       └── [id]/page.tsx         # Diff审核详情
├── components/graph/
│   ├── SwimLaneGraph.tsx         # 泳道图主组件
│   ├── SwimLaneStage.tsx         # 阶段组件
│   ├── SegmentColumn.tsx         # 环节列
│   ├── CompanyCard.tsx           # 企业卡片
│   ├── DiffReviewPanel.tsx       # 审核面板
│   └── ChangeCard.tsx            # 变更卡片
├── lib/services/
│   └── industry-graph.service.ts # API封装
└── types/
    ├── industry-graph.ts         # 类型定义
    └── graph-diff.ts             # Diff类型
```

### 数据库（prisma/）
```
prisma/
└── schema.prisma                 # 新增审核表
```

### 配置和脚本
```
docker-compose.neo4j.yml          # Neo4j部署
scripts/
├── setup-neo4j.sh                # Neo4j初始化脚本
└── test-industry-explorer.ts     # 测试脚本
```

---

## Task 1: Neo4j基础设施搭建

**Files:**
- Create: `docker-compose.neo4j.yml`
- Create: `data-service/config/neo4j_indexes.cypher`
- Create: `scripts/setup-neo4j.sh`
- Create: `.env.example` (追加Neo4j配置)
- Modify: `.env` (添加Neo4j配置)

**Interfaces:**
- Produces: Neo4j容器运行在bolt://localhost:7687
- Produces: 数据库索引和约束已创建

- [ ] **Step 1: 创建Neo4j Docker配置**

```yaml
# docker-compose.neo4j.yml
version: '3.8'

services:
  neo4j:
    image: neo4j:5.15-community
    container_name: ai-invest-neo4j
    ports:
      - "7474:7474"  # HTTP
      - "7687:7687"  # Bolt
    environment:
      - NEO4J_AUTH=neo4j/ai-invest-neo4j-2024
      - NEO4J_PLUGINS=["apoc"]
      - NEO4J_dbms_memory_heap_initial__size=512m
      - NEO4J_dbms_memory_heap_max__size=2G
      - NEO4J_dbms_memory_pagecache_size=1G
      - NEO4J_dbms_security_procedures_unrestricted=apoc.*
    volumes:
      - neo4j_data:/data
      - neo4j_logs:/logs
      - neo4j_import:/var/lib/neo4j/import
      - ./data-service/config:/config
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "cypher-shell", "-u", "neo4j", "-p", "ai-invest-neo4j-2024", "RETURN 1"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  neo4j_data:
  neo4j_logs:
  neo4j_import:
```

- [ ] **Step 2: 创建Neo4j索引脚本**

```cypher
// data-service/config/neo4j_indexes.cypher

// 创建索引
CREATE INDEX industry_code IF NOT EXISTS FOR (i:Industry) ON (i.code);
CREATE INDEX industry_id IF NOT EXISTS FOR (i:Industry) ON (i.id);
CREATE INDEX stage_code IF NOT EXISTS FOR (s:Stage) ON (s.code);
CREATE INDEX segment_code IF NOT EXISTS FOR (seg:Segment) ON (seg.code);
CREATE INDEX company_ticker IF NOT EXISTS FOR (c:Company) ON (c.ticker);
CREATE INDEX company_name IF NOT EXISTS FOR (c:Company) ON (c.name);

// 创建唯一约束
CREATE CONSTRAINT industry_id_unique IF NOT EXISTS FOR (i:Industry) REQUIRE i.id IS UNIQUE;
CREATE CONSTRAINT company_id_unique IF NOT EXISTS FOR (c:Company) REQUIRE c.id IS UNIQUE;
CREATE CONSTRAINT stage_id_unique IF NOT EXISTS FOR (s:Stage) REQUIRE s.id IS UNIQUE;
CREATE CONSTRAINT segment_id_unique IF NOT EXISTS FOR (seg:Segment) REQUIRE seg.id IS UNIQUE;
```

- [ ] **Step 3: 创建初始化脚本**

```bash
#!/bin/bash
# scripts/setup-neo4j.sh

echo "🚀 启动Neo4j容器..."
docker-compose -f docker-compose.neo4j.yml up -d

echo "⏳ 等待Neo4j启动..."
sleep 20

echo "📊 创建索引和约束..."
docker exec -i ai-invest-neo4j cypher-shell -u neo4j -p ai-invest-neo4j-2024 < data-service/config/neo4j_indexes.cypher

echo "✅ Neo4j设置完成！"
echo "🌐 访问 http://localhost:7474 查看Neo4j Browser"
echo "📝 用户名: neo4j"
echo "🔑 密码: ai-invest-neo4j-2024"
```

- [ ] **Step 4: 更新环境变量配置**

在`.env.example`末尾追加：
```env
# Neo4j Configuration
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=ai-invest-neo4j-2024
NEO4J_DATABASE=neo4j

# Tavily Search API
TAVILY_API_KEY=your-tavily-api-key-here
```

- [ ] **Step 5: 启动Neo4j并验证**

```bash
chmod +x scripts/setup-neo4j.sh
./scripts/setup-neo4j.sh

# 验证连接
docker exec -i ai-invest-neo4j cypher-shell -u neo4j -p ai-invest-neo4j-2024 "SHOW INDEXES;"
```

Expected: 索引列表正常显示

- [ ] **Step 6: 提交代码**

```bash
git add docker-compose.neo4j.yml data-service/config/neo4j_indexes.cypher scripts/setup-neo4j.sh .env.example
git commit -m "feat: 添加Neo4j基础设施配置"
```

---

## Task 2: Neo4j服务层

**Files:**
- Create: `data-service/services/neo4j_service.py`
- Create: `data-service/requirements.txt` (追加依赖)

**Interfaces:**
- Consumes: Neo4j连接配置（NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD）
- Produces: `Neo4jService` 类
  - `async connect() -> None`
  - `async close() -> None`
  - `async create_industry(data: dict) -> str` (返回industry_id)
  - `async create_node(label: str, properties: dict) -> str` (返回node_id)
  - `async create_relationship(from_id: str, to_id: str, rel_type: str, properties: dict) -> None`
  - `async get_industry_graph(industry_id: str) -> dict`

- [ ] **Step 1: 添加Python依赖**

在`data-service/requirements.txt`末尾追加：
```
neo4j>=5.15.0
tavily-python>=0.3.0
pyyaml>=6.0
```

- [ ] **Step 2: 安装依赖**

```bash
cd data-service
pip install -r requirements.txt
```

Expected: 依赖安装成功

- [ ] **Step 3: 编写Neo4j服务测试**

```python
# data-service/tests/test_neo4j_service.py
import pytest
from services.neo4j_service import Neo4jService
import os

@pytest.mark.asyncio
async def test_neo4j_connection():
    """测试Neo4j连接"""
    service = Neo4jService()
    await service.connect()
    
    # 测试简单查询
    result = await service.execute_query("RETURN 1 as num")
    assert result[0]["num"] == 1
    
    await service.close()

@pytest.mark.asyncio
async def test_create_industry():
    """测试创建产业节点"""
    service = Neo4jService()
    await service.connect()
    
    industry_id = await service.create_industry({
        "name": "测试产业",
        "code": "test_industry",
        "version": "1.0"
    })
    
    assert industry_id is not None
    assert len(industry_id) > 0
    
    # 清理测试数据
    await service.execute_query(
        "MATCH (i:Industry {id: $id}) DELETE i",
        {"id": industry_id}
    )
    
    await service.close()
```

- [ ] **Step 4: 运行测试确认失败**

```bash
cd data-service
pytest tests/test_neo4j_service.py -v
```

Expected: FAIL - 模块不存在

- [ ] **Step 5: 实现Neo4jService**

```python
# data-service/services/neo4j_service.py
from neo4j import AsyncGraphDatabase, AsyncDriver
from typing import Optional, Dict, List, Any
import os
import uuid
from datetime import datetime

class Neo4jService:
    """Neo4j数据库服务封装"""
    
    def __init__(self):
        self.uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
        self.user = os.getenv("NEO4J_USER", "neo4j")
        self.password = os.getenv("NEO4J_PASSWORD")
        self.database = os.getenv("NEO4J_DATABASE", "neo4j")
        self.driver: Optional[AsyncDriver] = None
    
    async def connect(self) -> None:
        """建立Neo4j连接"""
        if not self.driver:
            self.driver = AsyncGraphDatabase.driver(
                self.uri,
                auth=(self.user, self.password)
            )
            # 验证连接
            await self.driver.verify_connectivity()
    
    async def close(self) -> None:
        """关闭连接"""
        if self.driver:
            await self.driver.close()
            self.driver = None
    
    async def execute_query(
        self,
        query: str,
        parameters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """执行Cypher查询"""
        if not self.driver:
            await self.connect()
        
        async with self.driver.session(database=self.database) as session:
            result = await session.run(query, parameters or {})
            records = await result.data()
            return records
    
    async def create_industry(self, data: Dict[str, Any]) -> str:
        """
        创建产业根节点
        
        Args:
            data: {
                "name": "产业名称",
                "code": "industry_code",
                "version": "1.0",
                "description": "可选描述"
            }
        
        Returns:
            产业ID (UUID)
        """
        industry_id = str(uuid.uuid4())
        
        query = """
        CREATE (i:Industry {
            id: $id,
            name: $name,
            code: $code,
            version: $version,
            description: $description,
            created_at: datetime(),
            updated_at: datetime(),
            created_by: 'ai_auto',
            is_active: true
        })
        RETURN i.id as id
        """
        
        params = {
            "id": industry_id,
            "name": data["name"],
            "code": data["code"],
            "version": data.get("version", "1.0"),
            "description": data.get("description", "")
        }
        
        result = await self.execute_query(query, params)
        return result[0]["id"]
    
    async def create_node(
        self,
        label: str,
        properties: Dict[str, Any]
    ) -> str:
        """
        创建通用节点
        
        Args:
            label: 节点标签（Stage, Segment, Company等）
            properties: 节点属性字典
        
        Returns:
            节点ID
        """
        node_id = properties.get("id", str(uuid.uuid4()))
        properties["id"] = node_id
        properties["created_at"] = datetime.now().isoformat()
        properties["updated_at"] = datetime.now().isoformat()
        
        # 构建属性字符串
        props_str = ", ".join([f"{k}: ${k}" for k in properties.keys()])
        
        query = f"""
        CREATE (n:{label} {{{props_str}}})
        RETURN n.id as id
        """
        
        result = await self.execute_query(query, properties)
        return result[0]["id"]
    
    async def create_relationship(
        self,
        from_id: str,
        to_id: str,
        rel_type: str,
        properties: Optional[Dict[str, Any]] = None
    ) -> None:
        """
        创建节点间关系
        
        Args:
            from_id: 源节点ID
            to_id: 目标节点ID
            rel_type: 关系类型（HAS_STAGE, HAS_SEGMENT, SUPPLIES等）
            properties: 关系属性（可选）
        """
        props = properties or {}
        props["created_at"] = datetime.now().isoformat()
        
        props_str = ", ".join([f"{k}: ${k}" for k in props.keys()])
        props_clause = f"{{{props_str}}}" if props else ""
        
        query = f"""
        MATCH (a {{id: $from_id}}), (b {{id: $to_id}})
        CREATE (a)-[r:{rel_type} {props_clause}]->(b)
        """
        
        params = {"from_id": from_id, "to_id": to_id, **props}
        await self.execute_query(query, params)
    
    async def get_industry_graph(self, industry_id: str) -> Dict[str, Any]:
        """
        获取产业完整图谱数据
        
        Returns:
            {
                "industry": {...},
                "stages": [...]
            }
        """
        # 获取产业信息
        industry_query = """
        MATCH (i:Industry {id: $industry_id})
        RETURN i
        """
        industry_result = await self.execute_query(
            industry_query,
            {"industry_id": industry_id}
        )
        
        if not industry_result:
            return {"industry": None, "stages": []}
        
        industry = industry_result[0]["i"]
        
        # 获取完整层级结构
        graph_query = """
        MATCH (i:Industry {id: $industry_id})-[:HAS_STAGE]->(stage:Stage)
        OPTIONAL MATCH (stage)-[:HAS_SEGMENT]->(segment:Segment)
        OPTIONAL MATCH (segment)-[:CONTAINS]->(company:Company)
        RETURN stage, segment, company
        ORDER BY stage.order, segment.order
        """
        
        graph_result = await self.execute_query(
            graph_query,
            {"industry_id": industry_id}
        )
        
        # 组织数据结构
        stages_dict = {}
        for record in graph_result:
            stage = record["stage"]
            segment = record.get("segment")
            company = record.get("company")
            
            stage_id = stage["id"]
            if stage_id not in stages_dict:
                stages_dict[stage_id] = {
                    **stage,
                    "segments": {}
                }
            
            if segment:
                segment_id = segment["id"]
                if segment_id not in stages_dict[stage_id]["segments"]:
                    stages_dict[stage_id]["segments"][segment_id] = {
                        **segment,
                        "companies": []
                    }
                
                if company:
                    stages_dict[stage_id]["segments"][segment_id]["companies"].append(company)
        
        # 转换为列表
        stages = []
        for stage_data in stages_dict.values():
            stage_data["segments"] = list(stage_data["segments"].values())
            stages.append(stage_data)
        
        return {
            "industry": industry,
            "stages": stages
        }

# 全局实例
_neo4j_service: Optional[Neo4jService] = None

def get_neo4j_service() -> Neo4jService:
    """获取Neo4j服务单例"""
    global _neo4j_service
    if _neo4j_service is None:
        _neo4j_service = Neo4jService()
    return _neo4j_service
```

- [ ] **Step 6: 运行测试验证实现**

```bash
pytest tests/test_neo4j_service.py -v
```

Expected: PASS - 所有测试通过

- [ ] **Step 7: 提交代码**

```bash
git add data-service/services/neo4j_service.py data-service/requirements.txt data-service/tests/test_neo4j_service.py
git commit -m "feat: 实现Neo4j服务层"
```

---

## Task 3: Prisma审核表Schema

**Files:**
- Modify: `prisma/schema.prisma` (追加审核表)
- Create: `prisma/migrations/YYYYMMDDHHMMSS_add_graph_review_tables/migration.sql`

**Interfaces:**
- Produces: `GraphUpdateReview` 模型
- Produces: `GraphChangeApproval` 模型

- [ ] **Step 1: 在schema.prisma末尾追加审核表定义**

```prisma
// ==================== AI知识图谱审核 ====================

model GraphUpdateReview {
  id            String   @id @default(cuid())
  industryId    String   // Neo4j中的Industry节点ID
  industryName  String
  oldVersion    String
  newVersion    String
  changesJson   String   // JSON: 完整的diff数据
  status        String   @default("pending") // pending, approved, rejected, partial
  createdAt     DateTime @default(now())
  reviewedAt    DateTime?
  reviewedBy    String?
  reviewNotes   String?
  
  approvals GraphChangeApproval[]
  
  @@index([status, createdAt])
  @@index([industryId])
  @@map("graph_update_reviews")
}

model GraphChangeApproval {
  id         String   @id @default(cuid())
  reviewId   String
  changeId   String   // Change.id from diff
  changeType String   // node_added, node_removed, etc.
  status     String   @default("pending") // approved, rejected, pending
  reason     String?
  createdAt  DateTime @default(now())
  
  review GraphUpdateReview @relation(fields: [reviewId], references: [id], onDelete: Cascade)
  
  @@index([reviewId])
  @@index([changeId])
  @@map("graph_change_approvals")
}
```

- [ ] **Step 2: 创建并应用迁移**

```bash
npm run db:migrate -- --name add_graph_review_tables
```

Expected: 迁移文件创建成功

- [ ] **Step 3: 生成Prisma Client**

```bash
npx prisma generate
```

Expected: Client生成成功

- [ ] **Step 4: 验证表创建**

```bash
sqlite3 prisma/dev.db "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'graph_%';"
```

Expected: 显示 graph_update_reviews 和 graph_change_approvals

- [ ] **Step 5: 提交代码**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: 添加图谱审核表Schema"
```

---

由于实施计划非常长，我将继续创建剩余的任务...


## Task 4: AI探索引擎 - 数据模型

**Files:**
- Create: `data-service/models/industry_models.py`

**Interfaces:**
- Produces: `IndustryStructure` Pydantic模型（骨架YAML的Python表示）
- Produces: `CompanyInfo` Pydantic模型
- Produces: `RelationshipInfo` Pydantic模型
- Produces: `ExplorationResult` Pydantic模型

- [ ] **Step 1: 编写模型测试**

```python
# data-service/tests/test_industry_models.py
import pytest
from models.industry_models import IndustryStructure, CompanyInfo
import yaml

def test_industry_structure_from_yaml():
    """测试从YAML加载产业结构"""
    yaml_str = """
    industry:
      name: AI算力硬件
      code: ai_hardware
    structure:
      - stage: 上游
        stage_code: upstream
        segments:
          - name: 芯片设计
            code: chip_design
    """
    
    data = yaml.safe_load(yaml_str)
    structure = IndustryStructure(**data)
    
    assert structure.industry.name == "AI算力硬件"
    assert len(structure.structure) == 1
    assert structure.structure[0].stage == "上游"

def test_company_info_validation():
    """测试企业信息验证"""
    company = CompanyInfo(
        name="NVIDIA",
        name_en="NVIDIA Corporation",
        ticker="NVDA",
        exchange="NASDAQ",
        country="美国",
        market_position="leader"
    )
    
    assert company.ticker == "NVDA"
    assert company.market_position == "leader"
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd data-service
pytest tests/test_industry_models.py -v
```

Expected: FAIL - 模块不存在

- [ ] **Step 3: 实现数据模型**

```python
# data-service/models/industry_models.py
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime

class IndustryInfo(BaseModel):
    """产业基本信息"""
    name: str = Field(..., description="产业名称")
    code: str = Field(..., description="产业代码（英文）")
    description: Optional[str] = Field(None, description="产业描述")

class SegmentInfo(BaseModel):
    """环节信息"""
    name: str = Field(..., description="环节名称")
    code: str = Field(..., description="环节代码")
    description: str = Field(..., description="环节功能描述")
    key_categories: List[str] = Field(default_factory=list, description="核心类别")

class StageInfo(BaseModel):
    """阶段信息"""
    stage: str = Field(..., description="阶段名称（上游/中游/下游）")
    stage_code: str = Field(..., description="阶段代码")
    description: str = Field(..., description="阶段描述")
    segments: List[SegmentInfo] = Field(default_factory=list, description="环节列表")

class IndustryStructure(BaseModel):
    """产业链结构（第一轮探索结果）"""
    industry: IndustryInfo
    structure: List[StageInfo] = Field(default_factory=list, description="产业链阶段")

class CompanyInfo(BaseModel):
    """企业信息"""
    name: str = Field(..., description="企业中文名称")
    name_en: Optional[str] = Field(None, description="企业英文名称")
    ticker: Optional[str] = Field(None, description="股票代码")
    exchange: Optional[str] = Field(None, description="交易所")
    country: str = Field(..., description="国家")
    market_position: str = Field(..., description="市场地位: leader/major/emerging")
    key_products: List[str] = Field(default_factory=list, description="主要产品")
    description: Optional[str] = Field(None, description="企业描述")
    segment_code: Optional[str] = Field(None, description="所属环节代码")
    stage_code: Optional[str] = Field(None, description="所属阶段代码")

class RelationshipInfo(BaseModel):
    """关系信息"""
    type: str = Field(..., description="关系类型: SUPPLIES/COMPETES_WITH")
    from_company: str = Field(..., alias="from", description="源企业名称")
    to_company: str = Field(..., alias="to", description="目标企业名称")
    description: Optional[str] = Field(None, description="关系描述")
    confidence: float = Field(0.8, description="置信度 0-1")
    
    class Config:
        populate_by_name = True

class SegmentDetail(BaseModel):
    """环节详细信息（第二轮填充结果）"""
    companies: List[CompanyInfo] = Field(default_factory=list)
    relationships: List[RelationshipInfo] = Field(default_factory=list)

class ExplorationResult(BaseModel):
    """完整探索结果"""
    structure: IndustryStructure
    details: Dict[str, SegmentDetail] = Field(
        default_factory=dict,
        description="key=segment_code, value=SegmentDetail"
    )
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.now)

class ExplorationTask(BaseModel):
    """探索任务状态"""
    task_id: str
    industry_name: str
    status: str = Field(
        "pending",
        description="pending/exploring_structure/structure_ready/exploring_details/completed/failed"
    )
    progress: int = Field(0, ge=0, le=100)
    current_step: Optional[str] = None
    structure: Optional[IndustryStructure] = None
    result: Optional[ExplorationResult] = None
    error: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
```

- [ ] **Step 4: 运行测试验证实现**

```bash
pytest tests/test_industry_models.py -v
```

Expected: PASS

- [ ] **Step 5: 提交代码**

```bash
git add data-service/models/industry_models.py data-service/tests/test_industry_models.py
git commit -m "feat: 添加AI探索引擎数据模型"
```

---

## Task 5: AI探索引擎 - 第一轮结构探索

**Files:**
- Create: `data-service/services/industry_explorer.py`
- Modify: `data-service/requirements.txt` (确保有tavily-python)

**Interfaces:**
- Consumes: `IndustryStructure` 模型（从Task 4）
- Consumes: Claude API配置（ANTHROPIC_API_KEY）
- Consumes: Tavily API配置（TAVILY_API_KEY）
- Produces: `IndustryExplorerService` 类
  - `async explore_structure(industry_name: str) -> IndustryStructure`

- [ ] **Step 1: 编写第一轮探索测试**

```python
# data-service/tests/test_industry_explorer.py
import pytest
from services.industry_explorer import IndustryExplorerService
from models.industry_models import IndustryStructure
import os

@pytest.mark.skipif(
    not os.getenv("ANTHROPIC_API_KEY"),
    reason="需要ANTHROPIC_API_KEY"
)
@pytest.mark.asyncio
async def test_explore_structure():
    """测试产业链结构探索"""
    explorer = IndustryExplorerService()
    
    structure = await explorer.explore_structure("AI算力硬件")
    
    assert structure.industry.name == "AI算力硬件"
    assert len(structure.structure) >= 2  # 至少有上游和下游
    
    # 验证有环节
    has_segments = any(len(stage.segments) > 0 for stage in structure.structure)
    assert has_segments
    
    print(f"探索到 {len(structure.structure)} 个阶段")
    for stage in structure.structure:
        print(f"  {stage.stage}: {len(stage.segments)} 个环节")
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd data-service
pytest tests/test_industry_explorer.py -v -s
```

Expected: FAIL - 模块不存在

- [ ] **Step 3: 实现第一轮探索引擎（Part 1 - 基础框架）**

```python
# data-service/services/industry_explorer.py
import os
import yaml
import json
import asyncio
from typing import Dict, List, Optional
from anthropic import AsyncAnthropic
from tavily import TavilyClient
from models.industry_models import (
    IndustryStructure,
    IndustryInfo,
    StageInfo,
    SegmentInfo
)

class IndustryExplorerService:
    """AI驱动的产业链探索引擎"""
    
    def __init__(self):
        self.anthropic = AsyncAnthropic(
            api_key=os.getenv("ANTHROPIC_API_KEY")
        )
        self.tavily = TavilyClient(
            api_key=os.getenv("TAVILY_API_KEY")
        )
        self.model = "claude-3-5-sonnet-20241022"
    
    async def explore_structure(self, industry_name: str) -> IndustryStructure:
        """
        第一轮：探索产业链结构
        
        Args:
            industry_name: 产业名称，如"AI算力硬件"
        
        Returns:
            IndustryStructure: 产业链骨架
        """
        # 1. 搜索产业研究资料
        search_context = await self._search_industry_info(industry_name)
        
        # 2. 生成结构化Prompt
        prompt = self._build_structure_prompt(industry_name, search_context)
        
        # 3. 调用Claude分析
        response = await self._call_claude_for_structure(prompt)
        
        # 4. 解析YAML响应
        structure = self._parse_structure_response(response, industry_name)
        
        return structure
    
    async def _search_industry_info(self, industry_name: str) -> str:
        """搜索产业链相关信息"""
        query = f"{industry_name} 产业链 上中下游 研究报告 结构分析"
        
        try:
            result = self.tavily.search(
                query=query,
                search_depth="advanced",
                max_results=8,
                include_answer=True
            )
            
            # 提取关键内容
            context_parts = []
            
            if result.get("answer"):
                context_parts.append(f"综述：{result['answer']}")
            
            for item in result.get("results", [])[:5]:
                context_parts.append(
                    f"来源：{item.get('title', '')}\n"
                    f"内容：{item.get('content', '')[:500]}"
                )
            
            return "\n\n".join(context_parts)
            
        except Exception as e:
            print(f"搜索失败: {e}")
            return ""
    
    def _build_structure_prompt(self, industry_name: str, context: str) -> str:
        """构建第一轮探索Prompt"""
        code = self._generate_industry_code(industry_name)
        
        prompt = f"""你是一位专业的产业分析师。请分析「{industry_name}」产业链结构。

**参考资料：**
{context}

**任务：**
1. 识别产业链的上游、中游、下游阶段
2. 列出每个阶段包含的关键环节（segment）
3. 每个环节需包含：名称、功能描述、核心技术/产品类别

**输出格式（YAML）：**
```yaml
industry:
  name: {industry_name}
  code: {code}
  description: 一句话描述这个产业
  
structure:
  - stage: 上游
    stage_code: upstream
    description: 产业链上游的核心功能（一句话）
    segments:
      - name: 环节名称（如：芯片设计）
        code: segment_code（英文下划线）
        description: 该环节的功能和价值
        key_categories: [类别1, 类别2]
        
  - stage: 中游
    stage_code: midstream
    description: 产业链中游的核心功能
    segments:
      - name: 环节名称
        code: segment_code
        description: 功能描述
        key_categories: []
    
  - stage: 下游
    stage_code: downstream
    description: 产业链下游的核心功能
    segments:
      - name: 环节名称
        code: segment_code
        description: 功能描述
        key_categories: []
```

**要求：**
- 基于最新产业研究和市场报告
- 聚焦A股/港股/美股上市公司相关领域
- 环节划分要清晰，避免重叠
- 每个阶段2-4个环节为宜
- code使用英文小写下划线格式
- 只输出YAML，不要其他解释

请输出符合格式的YAML：
"""
        return prompt
    
    def _generate_industry_code(self, industry_name: str) -> str:
        """生成产业代码"""
        # 简单映射，实际可用AI生成
        mapping = {
            "AI算力硬件": "ai_hardware",
            "新能源汽车": "new_energy_vehicle",
            "创新药": "innovative_drug",
            "半导体": "semiconductor"
        }
        return mapping.get(industry_name, "industry_" + str(hash(industry_name))[:8])
    
    async def _call_claude_for_structure(self, prompt: str) -> str:
        """调用Claude API进行结构分析"""
        message = await self.anthropic.messages.create(
            model=self.model,
            max_tokens=4096,
            temperature=0.3,  # 较低温度保证稳定性
            messages=[{
                "role": "user",
                "content": prompt
            }]
        )
        
        response_text = message.content[0].text
        
        # 提取YAML（去除可能的markdown标记）
        if "```yaml" in response_text:
            yaml_start = response_text.find("```yaml") + 7
            yaml_end = response_text.find("```", yaml_start)
            response_text = response_text[yaml_start:yaml_end].strip()
        elif "```" in response_text:
            yaml_start = response_text.find("```") + 3
            yaml_end = response_text.find("```", yaml_start)
            response_text = response_text[yaml_start:yaml_end].strip()
        
        return response_text
    
    def _parse_structure_response(
        self,
        yaml_text: str,
        industry_name: str
    ) -> IndustryStructure:
        """解析YAML响应为IndustryStructure"""
        try:
            data = yaml.safe_load(yaml_text)
            
            # 验证必需字段
            if "industry" not in data or "structure" not in data:
                raise ValueError("YAML缺少必需字段")
            
            # 使用Pydantic解析和验证
            structure = IndustryStructure(**data)
            
            return structure
            
        except Exception as e:
            print(f"YAML解析失败: {e}")
            print(f"原始内容: {yaml_text}")
            
            # 返回基本结构作为后备
            return IndustryStructure(
                industry=IndustryInfo(
                    name=industry_name,
                    code=self._generate_industry_code(industry_name),
                    description="解析失败，使用默认结构"
                ),
                structure=[]
            )

# 全局实例
_explorer_service: Optional[IndustryExplorerService] = None

def get_explorer_service() -> IndustryExplorerService:
    """获取探索服务单例"""
    global _explorer_service
    if _explorer_service is None:
        _explorer_service = IndustryExplorerService()
    return _explorer_service
```

- [ ] **Step 4: 运行测试验证实现**

```bash
pytest tests/test_industry_explorer.py::test_explore_structure -v -s
```

Expected: PASS（需要API密钥）

- [ ] **Step 5: 提交代码**

```bash
git add data-service/services/industry_explorer.py data-service/tests/test_industry_explorer.py
git commit -m "feat: 实现AI产业链结构探索（第一轮）"
```

---

## Task 6: 类型定义和API Service（前端）

**Files:**
- Create: `src/types/industry-graph.ts`
- Create: `src/types/graph-diff.ts`
- Create: `src/lib/services/industry-graph.service.ts`

**Interfaces:**
- Produces: TypeScript类型定义
- Produces: `industryGraphService` 对象
  - `createIndustry(name: string): Promise<{taskId: string}>`
  - `getTaskStatus(taskId: string): Promise<TaskStatus>`
  - `getIndustry(id: string): Promise<Industry>`

- [ ] **Step 1: 创建类型定义**

```typescript
// src/types/industry-graph.ts

export interface Industry {
  id: string
  name: string
  code: string
  version: string
  nodeCount: number
  edgeCount: number
  createdAt: string
  updatedAt: string
}

export interface Stage {
  id: string
  name: string
  code: string
  order: number
  description?: string
  segments: Segment[]
}

export interface Segment {
  id: string
  name: string
  code: string
  order: number
  description?: string
  keyCategories?: string[]
  companies: Company[]
}

export interface Company {
  id: string
  name: string
  nameEn?: string
  ticker?: string
  exchange?: string
  country: string
  marketPosition: 'leader' | 'major' | 'emerging'
  keyProducts?: string[]
  description?: string
}

export interface SwimLaneData {
  industry: Industry
  stages: Stage[]
}

export interface ExplorationTask {
  taskId: string
  industryName: string
  status: 'pending' | 'exploring_structure' | 'structure_ready' | 'exploring_details' | 'completed' | 'failed'
  progress: number
  currentStep?: string
  structureYaml?: any
  error?: string
}
```

```typescript
// src/types/graph-diff.ts

export interface GraphDiff {
  summary: DiffSummary
  changes: Change[]
}

export interface DiffSummary {
  totalChanges: number
  addedNodes: number
  removedNodes: number
  modifiedNodes: number
  addedEdges: number
  removedEdges: number
}

export interface Change {
  id: string
  type: 'node_added' | 'node_removed' | 'node_modified' | 'edge_added' | 'edge_removed'
  category: string
  path: string
  description: string
  data?: any
  propertyDiffs?: PropertyDiff[]
  confidence?: number
}

export interface PropertyDiff {
  property: string
  oldValue: any
  newValue: any
}

export interface GraphUpdateReview {
  id: string
  industryId: string
  industryName: string
  oldVersion: string
  newVersion: string
  summary: DiffSummary
  changes: Change[]
  status: 'pending' | 'approved' | 'rejected' | 'partial'
  createdAt: string
  reviewedAt?: string
}
```

- [ ] **Step 2: 创建API Service**

```typescript
// src/lib/services/industry-graph.service.ts

import type {
  Industry,
  SwimLaneData,
  ExplorationTask
} from '@/types/industry-graph'
import type {
  GraphUpdateReview,
  Change
} from '@/types/graph-diff'

class IndustryGraphService {
  private baseUrl = '/api/graph/industries'

  async createIndustry(name: string, description?: string): Promise<{ taskId: string; industryId: string }> {
    const response = await fetch(`${this.baseUrl}/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description })
    })

    if (!response.ok) {
      throw new Error('创建产业失败')
    }

    const data = await response.json()
    return data.data
  }

  async getTaskStatus(taskId: string): Promise<ExplorationTask> {
    const response = await fetch(`${this.baseUrl}/tasks/${taskId}`)

    if (!response.ok) {
      throw new Error('获取任务状态失败')
    }

    const data = await response.json()
    return data.data
  }

  async approveStructure(taskId: string, modifiedStructure?: any): Promise<void> {
    const response = await fetch(`${this.baseUrl}/tasks/${taskId}/approve-structure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        approved: true,
        modifiedStructure
      })
    })

    if (!response.ok) {
      throw new Error('批准骨架失败')
    }
  }

  async getIndustry(id: string): Promise<{ industry: Industry; stages: any[] }> {
    const response = await fetch(`${this.baseUrl}/${id}`)

    if (!response.ok) {
      throw new Error('获取产业失败')
    }

    const data = await response.json()
    return data.data
  }

  async getSwimLaneData(id: string): Promise<SwimLaneData> {
    const response = await fetch(`${this.baseUrl}/${id}/swimlane`)

    if (!response.ok) {
      throw new Error('获取泳道数据失败')
    }

    const data = await response.json()
    return data.data
  }

  async triggerUpdate(id: string): Promise<{ taskId: string }> {
    const response = await fetch(`${this.baseUrl}/${id}/update`, {
      method: 'POST'
    })

    if (!response.ok) {
      throw new Error('触发更新失败')
    }

    const data = await response.json()
    return data.data
  }

  async getPendingReviews(): Promise<GraphUpdateReview[]> {
    const response = await fetch('/api/graph/reviews?status=pending')

    if (!response.ok) {
      throw new Error('获取待审核列表失败')
    }

    const data = await response.json()
    return data.data.reviews
  }

  async getReview(reviewId: string): Promise<GraphUpdateReview> {
    const response = await fetch(`/api/graph/reviews/${reviewId}`)

    if (!response.ok) {
      throw new Error('获取审核详情失败')
    }

    const data = await response.json()
    return data.data
  }

  async approveAllChanges(reviewId: string): Promise<void> {
    const response = await fetch(`/api/graph/reviews/${reviewId}/approve-all`, {
      method: 'POST'
    })

    if (!response.ok) {
      throw new Error('批准失败')
    }
  }

  async rejectAllChanges(reviewId: string, reason?: string): Promise<void> {
    const response = await fetch(`/api/graph/reviews/${reviewId}/reject-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    })

    if (!response.ok) {
      throw new Error('拒绝失败')
    }
  }

  async reviewChange(
    reviewId: string,
    changeId: string,
    action: 'approved' | 'rejected',
    reason?: string
  ): Promise<void> {
    const response = await fetch(
      `/api/graph/reviews/${reviewId}/changes/${changeId}/review`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason })
      }
    )

    if (!response.ok) {
      throw new Error('审核变更失败')
    }
  }
}

export const industryGraphService = new IndustryGraphService()
```

- [ ] **Step 3: 提交代码**

```bash
git add src/types/industry-graph.ts src/types/graph-diff.ts src/lib/services/industry-graph.service.ts
git commit -m "feat: 添加前端类型定义和API Service"
```

---

由于计划文件很长，让我用bash继续追加剩余任务...


## Task 7: Next.js API路由 - 产业创建和任务管理

**Files:**
- Create: `src/app/api/graph/industries/create/route.ts`
- Create: `src/app/api/graph/industries/tasks/[taskId]/route.ts`
- Create: `src/app/api/graph/industries/tasks/[taskId]/approve-structure/route.ts`

**Interfaces:**
- Consumes: `IndustryExplorerService` (from Task 5)
- Produces: POST /api/graph/industries/create
- Produces: GET /api/graph/industries/tasks/{taskId}
- Produces: POST /api/graph/industries/tasks/{taskId}/approve-structure

- [ ] **Step 1: 创建产业API**

```typescript
// src/app/api/graph/industries/create/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const createIndustrySchema = z.object({
  name: z.string().min(2).max(50),
  description: z.string().optional()
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, description } = createIndustrySchema.parse(body)

    // 调用Python数据服务
    const dataServiceUrl = process.env.DATA_SERVICE_URL || 'http://localhost:8000'
    const response = await fetch(`${dataServiceUrl}/api/v1/industry-graph/explore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description })
    })

    if (!response.ok) {
      throw new Error('数据服务调用失败')
    }

    const data = await response.json()

    return NextResponse.json({
      success: true,
      data: {
        taskId: data.task_id,
        industryId: data.industry_id || '',
        status: 'exploring_structure',
        message: 'AI正在探索产业链结构...'
      }
    })
  } catch (error) {
    console.error('创建产业失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '创建产业失败'
      },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 2: 任务状态查询API**

```typescript
// src/app/api/graph/industries/tasks/[taskId]/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    const { taskId } = params

    // 调用Python数据服务
    const dataServiceUrl = process.env.DATA_SERVICE_URL || 'http://localhost:8000'
    const response = await fetch(`${dataServiceUrl}/api/v1/industry-graph/tasks/${taskId}`)

    if (!response.ok) {
      throw new Error('获取任务状态失败')
    }

    const data = await response.json()

    return NextResponse.json({
      success: true,
      data: {
        taskId: data.task_id,
        status: data.status,
        progress: data.progress,
        currentStep: data.current_step,
        structureYaml: data.structure,
        error: data.error
      }
    })
  } catch (error) {
    console.error('获取任务状态失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '获取任务状态失败'
      },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 3: 骨架审核API**

```typescript
// src/app/api/graph/industries/tasks/[taskId]/approve-structure/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const approveSchema = z.object({
  approved: z.boolean(),
  modifiedStructure: z.any().optional()
})

export async function POST(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    const { taskId } = params
    const body = await request.json()
    const { approved, modifiedStructure } = approveSchema.parse(body)

    // 调用Python数据服务
    const dataServiceUrl = process.env.DATA_SERVICE_URL || 'http://localhost:8000'
    const response = await fetch(
      `${dataServiceUrl}/api/v1/industry-graph/tasks/${taskId}/approve-structure`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved, modified_structure: modifiedStructure })
      }
    )

    if (!response.ok) {
      throw new Error('审核骨架失败')
    }

    return NextResponse.json({
      success: true,
      message: '骨架已确认，开始填充企业信息...'
    })
  } catch (error) {
    console.error('审核骨架失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '审核骨架失败'
      },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 4: 添加DATA_SERVICE_URL到环境变量**

在`.env.example`追加：
```env
# Data Service URL
DATA_SERVICE_URL=http://localhost:8000
```

- [ ] **Step 5: 测试API路由**

```bash
# 启动Next.js
npm run dev

# 测试创建产业
curl -X POST http://localhost:3000/api/graph/industries/create \
  -H "Content-Type: application/json" \
  -d '{"name":"AI算力硬件"}'
```

Expected: 返回taskId

- [ ] **Step 6: 提交代码**

```bash
git add src/app/api/graph/industries/ .env.example
git commit -m "feat: 添加产业创建和任务管理API路由"
```

---

## Task 8: FastAPI路由和任务管理

**Files:**
- Create: `data-service/routers/industry_graph.py`
- Create: `data-service/services/task_manager.py`
- Modify: `data-service/main.py` (注册路由)

**Interfaces:**
- Consumes: `IndustryExplorerService` (from Task 5)
- Produces: FastAPI路由
  - POST /api/v1/industry-graph/explore
  - GET /api/v1/industry-graph/tasks/{task_id}

- [ ] **Step 1: 创建任务管理器**

```python
# data-service/services/task_manager.py
from typing import Dict, Optional
from models.industry_models import ExplorationTask
import asyncio

class TaskManager:
    """后台任务管理器"""
    
    def __init__(self):
        self._tasks: Dict[str, ExplorationTask] = {}
    
    def create_task(self, task_id: str, industry_name: str) -> ExplorationTask:
        """创建新任务"""
        task = ExplorationTask(
            task_id=task_id,
            industry_name=industry_name,
            status="pending",
            progress=0
        )
        self._tasks[task_id] = task
        return task
    
    def get_task(self, task_id: str) -> Optional[ExplorationTask]:
        """获取任务"""
        return self._tasks.get(task_id)
    
    def update_task(
        self,
        task_id: str,
        status: Optional[str] = None,
        progress: Optional[int] = None,
        current_step: Optional[str] = None,
        structure: Optional[any] = None,
        result: Optional[any] = None,
        error: Optional[str] = None
    ) -> None:
        """更新任务状态"""
        task = self._tasks.get(task_id)
        if not task:
            return
        
        if status:
            task.status = status
        if progress is not None:
            task.progress = progress
        if current_step:
            task.current_step = current_step
        if structure:
            task.structure = structure
        if result:
            task.result = result
        if error:
            task.error = error
    
    def delete_task(self, task_id: str) -> None:
        """删除任务"""
        self._tasks.pop(task_id, None)

# 全局实例
task_manager = TaskManager()
```

- [ ] **Step 2: 创建FastAPI路由**

```python
# data-service/routers/industry_graph.py
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
from typing import Optional
import uuid

from services.industry_explorer import get_explorer_service
from services.neo4j_service import get_neo4j_service
from services.task_manager import task_manager

router = APIRouter(prefix="/api/v1/industry-graph", tags=["industry-graph"])

class ExploreRequest(BaseModel):
    name: str
    description: Optional[str] = None

class ApproveStructureRequest(BaseModel):
    approved: bool
    modified_structure: Optional[dict] = None

@router.post("/explore")
async def explore_industry(
    request: ExploreRequest,
    background_tasks: BackgroundTasks
):
    """启动产业链探索任务"""
    task_id = str(uuid.uuid4())
    
    # 创建任务
    task_manager.create_task(task_id, request.name)
    
    # 后台执行探索
    background_tasks.add_task(
        run_exploration_task,
        task_id=task_id,
        industry_name=request.name,
        description=request.description
    )
    
    return {
        "task_id": task_id,
        "status": "started",
        "message": "探索任务已启动"
    }

@router.get("/tasks/{task_id}")
async def get_task_status(task_id: str):
    """获取任务状态"""
    task = task_manager.get_task(task_id)
    
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    return {
        "task_id": task.task_id,
        "status": task.status,
        "progress": task.progress,
        "current_step": task.current_step,
        "structure": task.structure.dict() if task.structure else None,
        "error": task.error
    }

@router.post("/tasks/{task_id}/approve-structure")
async def approve_structure(
    task_id: str,
    request: ApproveStructureRequest,
    background_tasks: BackgroundTasks
):
    """审核并批准产业链骨架"""
    task = task_manager.get_task(task_id)
    
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    if task.status != "structure_ready":
        raise HTTPException(status_code=400, detail="任务状态不正确")
    
    if not request.approved:
        task_manager.update_task(task_id, status="rejected")
        return {"message": "骨架已拒绝"}
    
    # 使用修改后的骨架（如果有）
    structure = request.modified_structure or task.structure
    
    # 后台执行第二轮填充
    background_tasks.add_task(
        run_filling_task,
        task_id=task_id,
        structure=structure
    )
    
    task_manager.update_task(
        task_id,
        status="exploring_details",
        progress=50,
        current_step="正在填充企业信息..."
    )
    
    return {"message": "骨架已确认，开始填充企业信息"}

async def run_exploration_task(
    task_id: str,
    industry_name: str,
    description: Optional[str] = None
):
    """后台任务：第一轮探索"""
    try:
        task_manager.update_task(
            task_id,
            status="exploring_structure",
            progress=10,
            current_step="正在搜索产业资料..."
        )
        
        # 执行第一轮探索
        explorer = get_explorer_service()
        structure = await explorer.explore_structure(industry_name)
        
        task_manager.update_task(
            task_id,
            status="structure_ready",
            progress=40,
            current_step="产业链结构已生成，等待审核",
            structure=structure
        )
        
    except Exception as e:
        task_manager.update_task(
            task_id,
            status="failed",
            error=str(e)
        )

async def run_filling_task(task_id: str, structure: any):
    """后台任务：第二轮填充"""
    try:
        task_manager.update_task(
            task_id,
            status="exploring_details",
            progress=60,
            current_step="正在并行填充各环节企业..."
        )
        
        # TODO: 实现第二轮填充（Task 9）
        # explorer = get_explorer_service()
        # result = await explorer.fill_companies(structure)
        
        # 暂时标记为完成
        task_manager.update_task(
            task_id,
            status="completed",
            progress=100,
            current_step="探索完成"
        )
        
    except Exception as e:
        task_manager.update_task(
            task_id,
            status="failed",
            error=str(e)
        )
```

- [ ] **Step 3: 注册路由到main.py**

在`data-service/main.py`中添加：
```python
from routers import industry_graph

app.include_router(industry_graph.router)
```

- [ ] **Step 4: 测试FastAPI路由**

```bash
# 启动FastAPI（如果未启动）
cd data-service
python main.py

# 测试探索接口
curl -X POST http://localhost:8000/api/v1/industry-graph/explore \
  -H "Content-Type: application/json" \
  -d '{"name":"AI算力硬件"}'

# 获取任务状态（使用返回的task_id）
curl http://localhost:8000/api/v1/industry-graph/tasks/{task_id}
```

Expected: 任务正常创建和查询

- [ ] **Step 5: 提交代码**

```bash
git add data-service/routers/industry_graph.py data-service/services/task_manager.py data-service/main.py
git commit -m "feat: 添加FastAPI路由和任务管理"
```

---

## Task 9: AI探索引擎 - 第二轮企业填充

**Files:**
- Modify: `data-service/services/industry_explorer.py` (添加fill_companies方法)

**Interfaces:**
- Consumes: `IndustryStructure` (from Task 5)
- Produces: `async fill_companies(structure: IndustryStructure) -> ExplorationResult`

- [ ] **Step 1: 在industry_explorer.py末尾添加第二轮填充方法**

```python
# 添加到 IndustryExplorerService 类中

async def fill_companies(self, structure: IndustryStructure) -> ExplorationResult:
    """
    第二轮：填充企业和关系
    
    Args:
        structure: 第一轮探索的产业链骨架
    
    Returns:
        ExplorationResult: 完整探索结果
    """
    details = {}
    
    # 为每个segment并行填充
    tasks = []
    for stage in structure.structure:
        for segment in stage.segments:
            task = self._fill_segment(
                industry_name=structure.industry.name,
                stage_name=stage.stage,
                segment=segment
            )
            tasks.append((segment.code, task))
    
    # 并行执行
    results = await asyncio.gather(*[task for _, task in tasks], return_exceptions=True)
    
    # 组织结果
    for (segment_code, _), result in zip(tasks, results):
        if isinstance(result, Exception):
            print(f"填充 {segment_code} 失败: {result}")
            details[segment_code] = SegmentDetail(companies=[], relationships=[])
        else:
            details[segment_code] = result
    
    return ExplorationResult(
        structure=structure,
        details=details,
        metadata={
            "total_companies": sum(len(d.companies) for d in details.values()),
            "total_relationships": sum(len(d.relationships) for d in details.values())
        }
    )

async def _fill_segment(
    self,
    industry_name: str,
    stage_name: str,
    segment: SegmentInfo
) -> SegmentDetail:
    """填充单个segment的企业信息"""
    
    # 1. 搜索该segment的关键企业
    search_query = f"{segment.name} 上市公司 龙头企业 股票代码 {industry_name}"
    search_context = await self._search_segment_companies(search_query)
    
    # 2. 生成填充Prompt
    prompt = self._build_company_prompt(
        industry_name=industry_name,
        stage_name=stage_name,
        segment=segment,
        context=search_context
    )
    
    # 3. 调用Claude提取
    response = await self._call_claude_for_companies(prompt)
    
    # 4. 解析响应
    detail = self._parse_company_response(response, segment.code)
    
    return detail

async def _search_segment_companies(self, query: str) -> str:
    """搜索环节企业信息"""
    try:
        result = self.tavily.search(
            query=query,
            search_depth="basic",
            max_results=5
        )
        
        context_parts = []
        for item in result.get("results", []):
            context_parts.append(
                f"{item.get('title', '')}\n{item.get('content', '')[:400]}"
            )
        
        return "\n\n".join(context_parts)
    except Exception as e:
        print(f"搜索企业失败: {e}")
        return ""

def _build_company_prompt(
    self,
    industry_name: str,
    stage_name: str,
    segment: SegmentInfo,
    context: str
) -> str:
    """构建企业填充Prompt"""
    prompt = f"""你是一位专业的产业研究员。请为「{segment.name}」环节填充详细信息。

**背景：**
- 产业：{industry_name}
- 阶段：{stage_name}
- 环节：{segment.name}
- 功能：{segment.description}
- 核心类别：{', '.join(segment.key_categories)}

**参考资料：**
{context}

**任务：**
1. 识别该环节的全球和中国关键企业（上市公司优先）
2. 提取企业基本信息
3. 识别企业间的供应/竞争关系

**输出格式（JSON）：**
```json
{{
  "companies": [
    {{
      "name": "企业中文名称",
      "name_en": "English Name",
      "ticker": "股票代码（如：NVDA, 000001.SZ）",
      "exchange": "交易所（NASDAQ/NYSE/SSE/SZSE/HKEX）",
      "country": "国家",
      "market_position": "leader/major/emerging",
      "key_products": ["产品1", "产品2"],
      "description": "一句话描述企业"
    }}
  ],
  "relationships": [
    {{
      "type": "SUPPLIES",
      "from": "企业A名称",
      "to": "企业B名称",
      "description": "供应关系描述",
      "confidence": 0.9
    }},
    {{
      "type": "COMPETES_WITH",
      "from": "企业C名称",
      "to": "企业D名称",
      "description": "竞争描述",
      "confidence": 0.85
    }}
  ]
}}
```

**要求：**
- 企业信息要准确（股票代码、交易所）
- 优先选择市值较大、影响力强的企业（5-10家）
- 关系要有明确依据
- 置信度基于信息来源可靠性
- 只输出JSON，不要其他解释

请输出JSON：
"""
    return prompt

async def _call_claude_for_companies(self, prompt: str) -> str:
    """调用Claude API提取企业信息"""
    message = await self.anthropic.messages.create(
        model=self.model,
        max_tokens=4096,
        temperature=0.3,
        messages=[{
            "role": "user",
            "content": prompt
        }]
    )
    
    response_text = message.content[0].text
    
    # 提取JSON
    if "```json" in response_text:
        json_start = response_text.find("```json") + 7
        json_end = response_text.find("```", json_start)
        response_text = response_text[json_start:json_end].strip()
    elif "```" in response_text:
        json_start = response_text.find("```") + 3
        json_end = response_text.find("```", json_start)
        response_text = response_text[json_start:json_end].strip()
    
    return response_text

def _parse_company_response(self, json_text: str, segment_code: str) -> SegmentDetail:
    """解析JSON响应"""
    try:
        data = json.loads(json_text)
        
        # 补充segment_code
        for company in data.get("companies", []):
            company["segment_code"] = segment_code
        
        # 使用Pydantic验证
        companies = [CompanyInfo(**c) for c in data.get("companies", [])]
        relationships = [RelationshipInfo(**r) for r in data.get("relationships", [])]
        
        return SegmentDetail(
            companies=companies,
            relationships=relationships
        )
    except Exception as e:
        print(f"解析企业JSON失败: {e}")
        print(f"原始内容: {json_text}")
        return SegmentDetail(companies=[], relationships=[])
```

- [ ] **Step 2: 更新run_filling_task实现**

修改`data-service/routers/industry_graph.py`中的`run_filling_task`:

```python
async def run_filling_task(task_id: str, structure: any):
    """后台任务：第二轮填充"""
    try:
        task_manager.update_task(
            task_id,
            status="exploring_details",
            progress=60,
            current_step="正在并行填充各环节企业..."
        )
        
        # 执行第二轮填充
        explorer = get_explorer_service()
        result = await explorer.fill_companies(structure)
        
        # 写入Neo4j
        neo4j = get_neo4j_service()
        await neo4j.connect()
        
        # 创建产业节点
        industry_id = await neo4j.create_industry({
            "name": structure.industry.name,
            "code": structure.industry.code,
            "version": "1.0",
            "description": structure.industry.description or ""
        })
        
        # 创建阶段和环节
        # TODO: 详细实现在Task 10
        
        task_manager.update_task(
            task_id,
            status="completed",
            progress=100,
            current_step="探索完成",
            result=result
        )
        
    except Exception as e:
        task_manager.update_task(
            task_id,
            status="failed",
            error=str(e)
        )
```

- [ ] **Step 3: 测试第二轮填充**

```bash
cd data-service
pytest tests/test_industry_explorer.py -v -s -k fill
```

Expected: 企业填充测试通过

- [ ] **Step 4: 提交代码**

```bash
git add data-service/services/industry_explorer.py data-service/routers/industry_graph.py
git commit -m "feat: 实现AI企业信息填充（第二轮探索）"
```

---

## 自我审查检查清单

**1. Spec覆盖度检查：**
- [x] Neo4j基础设施 - Task 1, 2
- [x] AI探索引擎（两轮）- Task 4, 5, 9
- [x] 数据模型 - Task 3, 4, 6
- [x] API路由 - Task 7, 8
- [ ] 前端泳道图组件 - 待添加
- [ ] Diff引擎 - 待添加
- [ ] 审核界面 - 待添加
- [ ] 定时更新 - 待添加

**2. 占位符扫描：**
- [x] 无TBD/TODO占位符（除标记未来任务的注释）
- [x] 所有代码块完整
- [x] 所有测试包含实际断言

**3. 类型一致性：**
- [x] Python模型与TypeScript类型对应
- [x] API接口命名一致
- [x] 函数签名在任务间匹配

**剩余任务摘要（将继续添加）：**
- Task 10-15: 写入Neo4j完整图谱数据
- Task 16-20: 前端泳道图组件
- Task 21-25: Diff引擎和审核界面
- Task 26-30: 定时更新和集成测试

---

