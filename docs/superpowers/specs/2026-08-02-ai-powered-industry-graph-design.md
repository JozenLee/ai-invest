# AI驱动的产业链知识图谱系统设计文档

**版本**: 1.0  
**日期**: 2026-08-02  
**项目**: ai-invest  
**状态**: 设计阶段

---

## 1. 项目概述

### 1.1 背景

当前知识图谱系统采用手动创建方式，维护成本高、更新不及时。本设计提出基于AI自动探索和生成的新一代知识图谱系统，能够：

- 自动分析产业链上中下游结构
- 自动发现关键企业和产品
- 自动识别供应链关系
- 定期更新并生成变更报告供人工审核

### 1.2 设计目标

1. **完全替换**现有手动图谱系统
2. **泳道式可视化**：参考AI算力硬件产业链图谱的展示方式
3. **AI自动生成**：仅需输入产业名称，AI自动探索完整产业链
4. **Git-like审核**：变更以diff形式展示，支持批量和逐条审核
5. **定时更新**：每周自动更新，有变更时通知人工审核

### 1.3 参考设计

基于项目文档：
- `docs/ai-compute-graph-rebuild-summary.md` - 泳道式产业链图谱
- `docs/superpowers/specs/2026-08-02-universal-knowledge-graph-design.md` - Neo4j架构

参考图片：
- `docs/ChatGPT Image 2026年8月2日 02_17_00.png` - AI算力硬件产业链映射图

---

## 2. 系统架构

### 2.1 整体架构图


```
┌─────────────────────────────────────────────────────────────────┐
│                        前端层 (Next.js)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ 产业列表页    │  │ 泳道图页面    │  │ Diff审核页   │          │
│  │ /graph       │  │ /graph/[id]  │  │ /graph/review│          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                              ↓ REST API
┌─────────────────────────────────────────────────────────────────┐
│                   API路由层 (Next.js API)                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  /api/graph/industries/*                                │    │
│  │  - POST /create          创建产业图谱                    │    │
│  │  - GET  /{id}            获取产业图谱数据                │    │
│  │  - GET  /{id}/swimlane   获取泳道布局数据                │    │
│  │  - GET  /pending-reviews 获取待审核变更                  │    │
│  │  - POST /reviews/{id}/approve 批准变更                   │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                 数据服务层 (FastAPI - data-service)              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ AI探索引擎    │  │ Neo4j服务    │  │ Diff引擎     │          │
│  │ Explorer     │  │ GraphDB      │  │ Comparator   │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│         ↓                  ↓                  ↓                  │
│  ┌──────────────────────────────────────────────────┐           │
│  │         定时调度器 (APScheduler)                  │           │
│  │         - 每周日凌晨2点触发更新任务                │           │
│  └──────────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────┘
         ↓                    ↓                     ↓
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ Claude API   │    │   Neo4j      │    │   SQLite     │
│ + Tavily     │    │ (图谱数据)    │    │ (审核记录)    │
└──────────────┘    └──────────────┘    └──────────────┘
```

### 2.2 核心模块职责

| 模块 | 职责 | 技术栈 |
|------|------|--------|
| **AI探索引擎** | 两轮探索：结构分析 + 细节填充 | Claude API + Tavily Search |
| **Neo4j服务** | 图谱数据存储、查询、版本管理 | neo4j-driver, Cypher |
| **Diff引擎** | 版本对比、生成变更报告 | Python + Neo4j查询 |
| **泳道图组件** | 产业链可视化展示 | React + D3.js |
| **审核界面** | Git-like变更审核 | Next.js + shadcn/ui |
| **调度器** | 定时更新任务 | APScheduler |

---

## 3. AI探索引擎设计

### 3.1 两轮探索流程

```
用户输入："AI算力硬件"
    ↓
┌─────────────────────────────────────┐
│ 第一轮：产业链结构探索               │
│                                     │
│ Prompt:                             │
│ "分析AI算力硬件产业链，识别：        │
│  1. 上游/中游/下游划分               │
│  2. 每个阶段的关键环节               │
│  3. 各环节的主要功能                │
│                                     │
│ 输出格式：YAML结构                   │
└─────────────────────────────────────┘
    ↓
生成骨架YAML (保存到临时存储)
    ↓
用户审核骨架 (可编辑) ✅
    ↓
┌─────────────────────────────────────┐
│ 第二轮：企业和关系填充               │
│                                     │
│ 对每个环节：                         │
│ 1. 搜索关键企业和产品                │
│ 2. 提取企业基本信息                  │
│ 3. 识别供应链关系                    │
│ 4. 识别竞争关系                      │
│                                     │
│ 并行处理多个环节                     │
└─────────────────────────────────────┘
    ↓
生成完整图谱数据 (写入Neo4j)
    ↓
创建版本记录 (version: 1.0)
```

### 3.2 第一轮：结构探索Prompt

```python
STRUCTURE_EXPLORATION_PROMPT = """
你是一位专业的产业分析师。请分析「{industry_name}」产业链结构。

任务：
1. 识别产业链的上游、中游、下游阶段
2. 列出每个阶段包含的关键环节（segment）
3. 每个环节需包含：名称、功能描述、核心技术/产品类别

输出格式（YAML）：
```yaml
industry:
  name: {industry_name}
  code: {auto_generated_code}
  
structure:
  - stage: 上游
    stage_code: upstream
    description: 产业链上游的核心功能
    segments:
      - name: 环节名称
        code: segment_code
        description: 该环节的功能和价值
        key_categories: [类别1, 类别2]
        
  - stage: 中游
    stage_code: midstream
    ...
    
  - stage: 下游
    stage_code: downstream
    ...
```

要求：
- 基于最新产业研究和市场报告
- 聚焦A股/港股/美股上市公司相关领域
- 环节划分要清晰，避免重叠
- 每个阶段2-4个环节为宜
"""
```

### 3.3 第二轮：企业填充Prompt

```python
COMPANY_FILLING_PROMPT = """
你是一位专业的产业研究员。请为「{segment_name}」环节填充详细信息。

背景：
- 产业：{industry_name}
- 阶段：{stage_name}
- 环节：{segment_name}
- 功能：{segment_description}

任务：
1. 识别该环节的全球和中国关键企业（上市公司优先）
2. 提取企业基本信息
3. 识别企业间的供应/竞争关系

输出格式（JSON）：
```json
{
  "companies": [
    {
      "name": "企业名称",
      "name_en": "English Name",
      "ticker": "股票代码",
      "exchange": "交易所代码",
      "country": "国家",
      "market_position": "龙头/主要/新兴",
      "key_products": ["产品1", "产品2"],
      "description": "简短描述"
    }
  ],
  "relationships": [
    {
      "type": "SUPPLIES",
      "from": "企业A",
      "to": "企业B",
      "description": "供应关系描述",
      "confidence": 0.9
    },
    {
      "type": "COMPETES_WITH",
      "from": "企业C",
      "to": "企业D",
      "description": "竞争关系描述",
      "confidence": 0.85
    }
  ]
}
```

要求：
- 企业信息要准确（股票代码、交易所）
- 优先选择市值较大、影响力强的企业
- 关系要有明确依据
- 置信度基于信息来源可靠性
"""
```


### 3.4 AI探索引擎实现

```python
# data-service/services/industry_explorer.py

class IndustryExplorerService:
    """AI驱动的产业链探索引擎"""
    
    def __init__(self):
        self.claude_client = ClaudeClient()
        self.tavily_client = TavilyClient()
        
    async def explore_industry(self, industry_name: str) -> dict:
        """
        完整的两轮探索流程
        
        Returns:
            {
                "structure": {...},  # 骨架YAML
                "graph_data": {...}, # 完整图谱数据
                "metadata": {...}    # 探索元数据
            }
        """
        # 第一轮：结构探索
        structure = await self.explore_structure(industry_name)
        
        # 等待用户审核...
        # (前端会调用单独的API来确认)
        
        # 第二轮：企业填充
        graph_data = await self.fill_companies(structure)
        
        return {
            "structure": structure,
            "graph_data": graph_data,
            "metadata": self._generate_metadata()
        }
    
    async def explore_structure(self, industry_name: str) -> dict:
        """第一轮：产业链结构探索"""
        
        # 1. 网络搜索：收集产业研究报告
        search_results = await self.tavily_client.search(
            query=f"{industry_name} 产业链 上中下游 研究报告",
            search_depth="advanced",
            max_results=10
        )
        
        # 2. 调用Claude分析结构
        prompt = STRUCTURE_EXPLORATION_PROMPT.format(
            industry_name=industry_name,
            auto_generated_code=self._generate_code(industry_name)
        )
        
        context = self._format_search_results(search_results)
        
        response = await self.claude_client.analyze(
            prompt=prompt,
            context=context,
            response_format="yaml"
        )
        
        # 3. 解析和验证YAML
        structure = yaml.safe_load(response)
        self._validate_structure(structure)
        
        return structure
    
    async def fill_companies(self, structure: dict) -> dict:
        """第二轮：企业和关系填充"""
        
        graph_data = {
            "nodes": [],
            "edges": []
        }
        
        # 为每个segment并行填充
        tasks = []
        for stage in structure["structure"]:
            for segment in stage["segments"]:
                task = self._fill_segment(
                    industry_name=structure["industry"]["name"],
                    stage=stage,
                    segment=segment
                )
                tasks.append(task)
        
        results = await asyncio.gather(*tasks)
        
        # 合并结果
        for result in results:
            graph_data["nodes"].extend(result["companies"])
            graph_data["edges"].extend(result["relationships"])
        
        # 去重和清洗
        graph_data = self._deduplicate_and_clean(graph_data)
        
        return graph_data
    
    async def _fill_segment(self, industry_name: str, stage: dict, segment: dict) -> dict:
        """填充单个segment的企业信息"""
        
        # 1. 搜索该segment的关键企业
        search_query = f"{segment['name']} 上市公司 龙头企业 股票代码"
        search_results = await self.tavily_client.search(
            query=search_query,
            search_depth="basic",
            max_results=5
        )
        
        # 2. 调用Claude提取结构化信息
        prompt = COMPANY_FILLING_PROMPT.format(
            industry_name=industry_name,
            stage_name=stage["stage"],
            segment_name=segment["name"],
            segment_description=segment["description"]
        )
        
        context = self._format_search_results(search_results)
        
        response = await self.claude_client.analyze(
            prompt=prompt,
            context=context,
            response_format="json"
        )
        
        result = json.loads(response)
        
        # 3. 增强企业信息（添加segment归属）
        for company in result["companies"]:
            company["segment_code"] = segment["code"]
            company["stage_code"] = stage["stage_code"]
        
        return result
    
    def _validate_structure(self, structure: dict):
        """验证结构的完整性和合理性"""
        assert "industry" in structure
        assert "structure" in structure
        assert len(structure["structure"]) >= 2  # 至少有2个阶段
        
        for stage in structure["structure"]:
            assert "stage" in stage
            assert "segments" in stage
            assert len(stage["segments"]) >= 1
```

---

## 4. Neo4j数据模型

### 4.1 节点类型设计

**Industry（产业根节点）**
```cypher
(:Industry {
  id: string,              // UUID
  name: string,            // "AI算力硬件"
  code: string,            // "ai_hardware"
  description: string,
  version: string,         // "1.0", "1.1"...
  created_at: datetime,
  updated_at: datetime,
  created_by: string,      // "ai_auto" | "manual"
  is_active: boolean
})
```

**Stage（产业链阶段）**
```cypher
(:Stage {
  id: string,
  code: string,            // "upstream", "midstream", "downstream"
  name: string,            // "上游", "中游", "下游"
  description: string,
  order: int,              // 1, 2, 3
  industry_id: string
})
```

**Segment（细分环节）**
```cypher
(:Segment {
  id: string,
  code: string,            // "chip_design", "foundry"
  name: string,            // "芯片设计", "晶圆代工"
  description: string,
  key_categories: [string], // ["GPU", "CPU", "AI ASIC"]
  stage_id: string,
  order: int
})
```

**Company（企业）**
```cypher
(:Company {
  id: string,
  name: string,            // "NVIDIA"
  name_en: string,
  ticker: string,          // "NVDA"
  exchange: string,        // "NASDAQ"
  country: string,         // "美国"
  market_position: string, // "龙头", "主要", "新兴"
  market_cap: float,       // 市值（亿元）
  key_products: [string],
  description: string,
  segment_id: string,
  data_quality: float,     // 0-1，数据完整度
  created_at: datetime,
  updated_at: datetime
})
```

**Product（产品）** - 可选，后续扩展
```cypher
(:Product {
  id: string,
  name: string,            // "H100"
  model: string,
  category: string,        // "GPU"
  company_id: string,
  launch_date: date,
  description: string
})
```

### 4.2 关系类型设计

**产业链层级关系**
```cypher
(:Industry)-[:HAS_STAGE {order: int}]->(:Stage)
(:Stage)-[:HAS_SEGMENT {order: int}]->(:Segment)
(:Segment)-[:CONTAINS]->(:Company)
```

**供应链关系**
```cypher
(:Company)-[:SUPPLIES {
  description: string,
  confidence: float,       // 0-1
  source: string,          // "ai_discovery", "manual"
  verified: boolean,
  created_at: datetime
}]->(:Company)
```

**竞争关系**
```cypher
(:Company)-[:COMPETES_WITH {
  market_segment: string,  // 竞争的细分市场
  confidence: float,
  description: string,
  created_at: datetime
}]->(:Company)
```

**产品关系** - 可选
```cypher
(:Company)-[:PRODUCES]->(:Product)
(:Product)-[:COMPETES_WITH]->(:Product)
```

### 4.3 版本管理

**GraphVersion（图谱版本记录）** - 存储在SQLite
```prisma
model GraphVersion {
  id          String   @id @default(cuid())
  industryId  String   // Neo4j中的Industry节点ID
  version     String   // "1.0", "1.1"
  createdAt   DateTime
  createdBy   String   // "ai_auto" | "user_id"
  nodeCount   Int
  edgeCount   Int
  changeLog   String   // JSON: 变更摘要
  status      String   // "draft", "active", "archived"
}
```

---

## 5. Diff引擎设计

### 5.1 变更检测流程

```python
# data-service/services/graph_diff_service.py

class GraphDiffService:
    """图谱版本对比引擎"""
    
    async def compare_versions(
        self,
        industry_id: str,
        old_version: str,
        new_version: str
    ) -> dict:
        """
        对比两个版本的图谱
        
        Returns:
            {
                "summary": {...},      # 变更统计
                "changes": [...]       # 详细变更列表
            }
        """
        
        # 1. 从Neo4j加载两个版本的图谱快照
        old_graph = await self.neo4j.get_graph_snapshot(industry_id, old_version)
        new_graph = await self.neo4j.get_graph_snapshot(industry_id, new_version)
        
        # 2. 对比节点
        node_changes = self._compare_nodes(old_graph["nodes"], new_graph["nodes"])
        
        # 3. 对比关系
        edge_changes = self._compare_edges(old_graph["edges"], new_graph["edges"])
        
        # 4. 生成变更报告
        changes = node_changes + edge_changes
        summary = self._generate_summary(changes)
        
        return {
            "summary": summary,
            "changes": changes
        }
    
    def _compare_nodes(self, old_nodes: list, new_nodes: list) -> list:
        """对比节点变更"""
        changes = []
        
        old_by_id = {n["id"]: n for n in old_nodes}
        new_by_id = {n["id"]: n for n in new_nodes}
        
        old_ids = set(old_by_id.keys())
        new_ids = set(new_by_id.keys())
        
        # 新增节点
        for node_id in new_ids - old_ids:
            node = new_by_id[node_id]
            changes.append({
                "type": "node_added",
                "category": self._get_node_category(node),
                "path": self._get_node_path(node),
                "data": node,
                "description": f"新增{node['type']}: {node['name']}"
            })
        
        # 删除节点
        for node_id in old_ids - new_ids:
            node = old_by_id[node_id]
            changes.append({
                "type": "node_removed",
                "category": self._get_node_category(node),
                "path": self._get_node_path(node),
                "data": node,
                "description": f"删除{node['type']}: {node['name']}"
            })
        
        # 修改节点
        for node_id in old_ids & new_ids:
            old_node = old_by_id[node_id]
            new_node = new_by_id[node_id]
            
            diffs = self._diff_node_properties(old_node, new_node)
            if diffs:
                changes.append({
                    "type": "node_modified",
                    "category": self._get_node_category(new_node),
                    "path": self._get_node_path(new_node),
                    "node_id": node_id,
                    "node_name": new_node["name"],
                    "property_diffs": diffs,
                    "description": f"修改{new_node['type']}: {new_node['name']}"
                })
        
        return changes
    
    def _diff_node_properties(self, old: dict, new: dict) -> list:
        """对比节点属性差异"""
        diffs = []
        
        all_keys = set(old.keys()) | set(new.keys())
        ignore_keys = {"id", "created_at", "updated_at"}
        
        for key in all_keys - ignore_keys:
            old_val = old.get(key)
            new_val = new.get(key)
            
            if old_val != new_val:
                diffs.append({
                    "property": key,
                    "old_value": old_val,
                    "new_value": new_val
                })
        
        return diffs
    
    def _get_node_category(self, node: dict) -> str:
        """获取节点分类（用于分组展示）"""
        type_mapping = {
            "Stage": "产业链阶段",
            "Segment": "细分环节",
            "Company": "企业"
        }
        return type_mapping.get(node.get("type"), "其他")
    
    def _get_node_path(self, node: dict) -> str:
        """获取节点路径（用于展示层级）"""
        # 例如：上游 > 芯片设计 > NVIDIA
        # 需要从Neo4j查询节点的完整路径
        return node.get("path", node.get("name"))
```


### 5.2 变更数据结构

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
  modifiedEdges: number
}

export interface Change {
  id: string
  type: 'node_added' | 'node_removed' | 'node_modified' | 
        'edge_added' | 'edge_removed' | 'edge_modified'
  category: string        // "产业链阶段" | "细分环节" | "企业" | "关系"
  path: string           // "上游 > 芯片设计 > NVIDIA"
  description: string    // "新增企业: NVIDIA"
  data?: any            // 节点/边的完整数据
  propertyDiffs?: PropertyDiff[]  // 属性变更详情
  confidence?: number   // AI生成的置信度
}

export interface PropertyDiff {
  property: string
  oldValue: any
  newValue: any
}
```

### 5.3 SQLite审核记录表

```prisma
// prisma/schema.prisma

model GraphUpdateReview {
  id            String   @id @default(cuid())
  industryId    String
  industryName  String
  oldVersion    String
  newVersion    String
  changesJson   String   // JSON: 完整的diff数据
  status        String   // "pending", "approved", "rejected"
  createdAt     DateTime @default(now())
  reviewedAt    DateTime?
  reviewedBy    String?  // 用户ID
  reviewNotes   String?  // 审核备注
  
  @@index([status, createdAt])
  @@index([industryId])
}

model GraphChangeApproval {
  id         String   @id @default(cuid())
  reviewId   String   // 关联GraphUpdateReview
  changeId   String   // Change.id
  changeType String
  status     String   // "approved", "rejected", "pending"
  reason     String?  // 拒绝原因
  createdAt  DateTime @default(now())
  
  review GraphUpdateReview @relation(fields: [reviewId], references: [id], onDelete: Cascade)
  
  @@index([reviewId])
}
```

---

## 6. 前端UI设计

### 6.1 页面结构

```
/graph                          # 产业列表页
├── /graph/create              # 创建新产业图谱
├── /graph/[industryId]        # 泳道图展示页
└── /graph/reviews             # 待审核变更列表
    └── /graph/reviews/[id]    # Diff审核详情页
```

### 6.2 泳道图组件设计

**SwimLaneGraph.tsx**

```typescript
// src/components/graph/SwimLaneGraph.tsx

interface SwimLaneGraphProps {
  industryId: string
  data: SwimLaneData
}

interface SwimLaneData {
  industry: {
    name: string
    code: string
  }
  stages: Stage[]
}

interface Stage {
  id: string
  name: string        // "上游", "中游", "下游"
  code: string
  order: number
  segments: Segment[]
}

interface Segment {
  id: string
  name: string        // "芯片设计", "晶圆代工"
  companies: Company[]
  position: {         // 在泳道中的位置
    x: number
    y: number
  }
}

interface Company {
  id: string
  name: string
  ticker?: string
  marketPosition: 'leader' | 'major' | 'emerging'
  outgoingRelations: Relation[]  // 供应关系
  incomingRelations: Relation[]
}

interface Relation {
  type: 'SUPPLIES' | 'COMPETES_WITH'
  targetId: string
  description?: string
  confidence: number
}

export function SwimLaneGraph({ industryId, data }: SwimLaneGraphProps) {
  return (
    <div className="swimlane-container">
      {/* 顶部：产业名称和控制栏 */}
      <header className="swimlane-header">
        <h1>{data.industry.name}</h1>
        <div className="controls">
          <button>刷新数据</button>
          <button>触发更新</button>
        </div>
      </header>
      
      {/* 主体：横向泳道 */}
      <div className="swimlane-body">
        {data.stages.map(stage => (
          <SwimlaneStage key={stage.id} stage={stage} />
        ))}
      </div>
      
      {/* 底部：图例和统计 */}
      <footer className="swimlane-footer">
        <Legend />
        <Stats data={data} />
      </footer>
    </div>
  )
}

function SwimlaneStage({ stage }: { stage: Stage }) {
  return (
    <div className="swimlane-stage">
      {/* 阶段标题 */}
      <div className="stage-header">
        <h2>{stage.name}</h2>
      </div>
      
      {/* 环节列 */}
      <div className="stage-segments">
        {stage.segments.map(segment => (
          <SegmentColumn key={segment.id} segment={segment} />
        ))}
      </div>
    </div>
  )
}

function SegmentColumn({ segment }: { segment: Segment }) {
  return (
    <div className="segment-column">
      {/* 环节名称 */}
      <div className="segment-header">
        <h3>{segment.name}</h3>
      </div>
      
      {/* 企业卡片 */}
      <div className="segment-companies">
        {segment.companies.map(company => (
          <CompanyCard key={company.id} company={company} />
        ))}
      </div>
    </div>
  )
}

function CompanyCard({ company }: { company: Company }) {
  const positionBadge = {
    leader: '龙头',
    major: '主要',
    emerging: '新兴'
  }
  
  return (
    <div className={`company-card position-${company.marketPosition}`}>
      <div className="company-name">{company.name}</div>
      {company.ticker && (
        <div className="company-ticker">{company.ticker}</div>
      )}
      <Badge>{positionBadge[company.marketPosition]}</Badge>
      
      {/* 悬浮时显示关系连线 */}
    </div>
  )
}
```

**布局示例**

```
┌─────────────────────────────────────────────────────────────┐
│  AI算力硬件产业链                    [刷新] [触发更新]        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐             │
│  │  上游     │    │  中游     │    │  下游     │             │
│  ├──────────┤    ├──────────┤    ├──────────┤             │
│  │芯片设计   │    │封装测试   │    │系统集成   │             │
│  │ NVIDIA   │───→│ 日月光    │───→│ Dell     │             │
│  │ AMD      │    │ 长电科技  │    │ HPE      │             │
│  │          │    │          │    │          │             │
│  │晶圆代工   │    │          │    │云服务商   │             │
│  │ TSMC     │───→│          │    │ AWS      │             │
│  │ 三星      │    │          │    │ Azure    │             │
│  └──────────┘    └──────────┘    └──────────┘             │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  ● 龙头企业  ● 主要企业  ● 新兴企业     总计: 12家企业       │
└─────────────────────────────────────────────────────────────┘
```

### 6.3 Diff审核界面设计

**DiffReviewPage.tsx**

```typescript
// src/app/(dashboard)/graph/reviews/[id]/page.tsx

export default function DiffReviewPage({ params }: { params: { id: string } }) {
  const { data: review } = useDiffReview(params.id)
  
  return (
    <div className="diff-review-page">
      {/* 顶部：摘要和操作 */}
      <header className="review-header">
        <h1>图谱更新审核</h1>
        <div className="review-meta">
          <span>产业: {review.industryName}</span>
          <span>版本: {review.oldVersion} → {review.newVersion}</span>
          <span>更新时间: {review.createdAt}</span>
        </div>
        
        <div className="review-actions">
          <Button onClick={approveAll} variant="default">
            ✅ 全部接受
          </Button>
          <Button onClick={rejectAll} variant="destructive">
            ❌ 全部拒绝
          </Button>
          <Button onClick={reviewIndividually} variant="outline">
            📝 逐条审核
          </Button>
        </div>
      </header>
      
      {/* 变更统计 */}
      <section className="diff-summary">
        <Card>
          <CardHeader>
            <CardTitle>变更摘要</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="summary-grid">
              <StatCard
                label="新增节点"
                value={review.summary.addedNodes}
                color="green"
              />
              <StatCard
                label="删除节点"
                value={review.summary.removedNodes}
                color="red"
              />
              <StatCard
                label="修改节点"
                value={review.summary.modifiedNodes}
                color="blue"
              />
              <StatCard
                label="新增关系"
                value={review.summary.addedEdges}
                color="green"
              />
            </div>
          </CardContent>
        </Card>
      </section>
      
      {/* 变更详情列表 */}
      <section className="diff-changes">
        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">全部变更</TabsTrigger>
            <TabsTrigger value="added">新增</TabsTrigger>
            <TabsTrigger value="removed">删除</TabsTrigger>
            <TabsTrigger value="modified">修改</TabsTrigger>
          </TabsList>
          
          <TabsContent value="all">
            <ChangeList changes={review.changes} onReview={handleReview} />
          </TabsContent>
        </Tabs>
      </section>
    </div>
  )
}

function ChangeList({ changes, onReview }) {
  return (
    <div className="change-list">
      {changes.map(change => (
        <ChangeCard key={change.id} change={change} onReview={onReview} />
      ))}
    </div>
  )
}

function ChangeCard({ change, onReview }) {
  const icons = {
    node_added: '➕',
    node_removed: '➖',
    node_modified: '✏️',
    edge_added: '🔗',
    edge_removed: '🔓'
  }
  
  return (
    <Card className={`change-card change-${change.type}`}>
      <CardHeader>
        <div className="change-header">
          <span className="change-icon">{icons[change.type]}</span>
          <span className="change-path">{change.path}</span>
          <Badge variant="outline">{change.category}</Badge>
        </div>
      </CardHeader>
      
      <CardContent>
        <p className="change-description">{change.description}</p>
        
        {/* 属性变更详情 */}
        {change.propertyDiffs && (
          <div className="property-diffs">
            {change.propertyDiffs.map(diff => (
              <div key={diff.property} className="property-diff">
                <span className="property-name">{diff.property}:</span>
                <span className="old-value">{diff.oldValue}</span>
                <span className="arrow">→</span>
                <span className="new-value">{diff.newValue}</span>
              </div>
            ))}
          </div>
        )}
        
        {/* AI置信度 */}
        {change.confidence && (
          <div className="confidence-bar">
            <span>置信度: {(change.confidence * 100).toFixed(0)}%</span>
            <ProgressBar value={change.confidence * 100} />
          </div>
        )}
      </CardContent>
      
      <CardFooter>
        <Button
          size="sm"
          variant="default"
          onClick={() => onReview(change.id, 'approved')}
        >
          ✅ 接受
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => onReview(change.id, 'rejected')}
        >
          ❌ 拒绝
        </Button>
      </CardFooter>
    </Card>
  )
}
```

**审核界面示例**

```
┌─────────────────────────────────────────────────────────────┐
│  图谱更新审核                                                 │
│  产业: AI算力硬件  版本: 1.0 → 1.1  更新时间: 2026-08-09     │
│  [✅ 全部接受]  [❌ 全部拒绝]  [📝 逐条审核]                  │
├─────────────────────────────────────────────────────────────┤
│  变更摘要                                                     │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐                   │
│  │新增 3│  │删除 1│  │修改 5│  │关系+2│                   │
│  └──────┘  └──────┘  └──────┘  └──────┘                   │
├─────────────────────────────────────────────────────────────┤
│  [全部] [新增] [删除] [修改]                                  │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ ➕ 上游 > 先进封装 > CoWoS/SoIC/Foveros等    [细分环节]│    │
│  │                                                     │    │
│  │ 新增环节: 先进封装                                   │    │
│  │ 描述: 2.5D/3D封装技术，解决芯片间互连瓶颈            │    │
│  │                                                     │    │
│  │ 置信度: ████████░░ 85%                             │    │
│  │                                                     │    │
│  │ [✅ 接受]  [❌ 拒绝]                                │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ ➕ 上游 > 先进封装 > 日月光投控              [企业]  │    │
│  │                                                     │    │
│  │ 新增企业: 日月光投控 (3711.TW)                      │    │
│  │ - 股票代码: 3711.TW                                │    │
│  │ - 市场地位: 龙头                                    │    │
│  │ - 主要产品: CoWoS封装服务                           │    │
│  │                                                     │    │
│  │ 置信度: ██████████ 95%                            │    │
│  │                                                     │    │
│  │ [✅ 接受]  [❌ 拒绝]                                │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ ✏️ 上游 > 芯片设计 > NVIDIA                  [企业]  │    │
│  │                                                     │    │
│  │ 修改企业: NVIDIA                                    │    │
│  │ - market_cap: $2.1T → $2.3T                        │    │
│  │ - key_products: [H100] → [H100, H200]              │    │
│  │                                                     │    │
│  │ 置信度: ██████████ 98%                            │    │
│  │                                                     │    │
│  │ [✅ 接受]  [❌ 拒绝]                                │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```


---

## 7. API设计

### 7.1 产业图谱管理API

**创建新产业图谱**
```
POST /api/graph/industries/create

Request:
{
  "name": "AI算力硬件",
  "description": "可选的产业描述"
}

Response:
{
  "success": true,
  "data": {
    "taskId": "task_123",
    "industryId": "ind_abc",
    "status": "exploring_structure",
    "message": "AI正在探索产业链结构..."
  }
}
```

**获取探索任务状态**
```
GET /api/graph/industries/tasks/{taskId}

Response:
{
  "success": true,
  "data": {
    "taskId": "task_123",
    "status": "structure_ready" | "exploring_details" | "completed" | "failed",
    "progress": 65,
    "currentStep": "正在填充中游企业信息...",
    "structureYaml": {...},  // status=structure_ready时返回
    "error": null
  }
}
```

**审核产业链骨架**
```
POST /api/graph/industries/tasks/{taskId}/approve-structure

Request:
{
  "approved": true,
  "modifiedStructure": {...}  // 可选：用户修改后的骨架
}

Response:
{
  "success": true,
  "message": "骨架已确认，开始填充企业信息..."
}
```

**获取产业图谱数据**
```
GET /api/graph/industries/{industryId}

Response:
{
  "success": true,
  "data": {
    "industry": {
      "id": "ind_abc",
      "name": "AI算力硬件",
      "code": "ai_hardware",
      "version": "1.0",
      "nodeCount": 45,
      "edgeCount": 68,
      "updatedAt": "2026-08-01T10:00:00Z"
    },
    "stages": [
      {
        "id": "stage_1",
        "name": "上游",
        "code": "upstream",
        "order": 1,
        "segments": [...]
      }
    ]
  }
}
```

**获取泳道布局数据**
```
GET /api/graph/industries/{industryId}/swimlane

Response:
{
  "success": true,
  "data": {
    "industry": {...},
    "stages": [...],
    "layout": {
      "width": 1200,
      "stageWidth": 400,
      "segmentHeight": 300
    }
  }
}
```

**触发手动更新**
```
POST /api/graph/industries/{industryId}/update

Response:
{
  "success": true,
  "data": {
    "taskId": "task_456",
    "message": "更新任务已启动..."
  }
}
```

### 7.2 变更审核API

**获取待审核列表**
```
GET /api/graph/reviews?status=pending

Response:
{
  "success": true,
  "data": {
    "reviews": [
      {
        "id": "review_123",
        "industryId": "ind_abc",
        "industryName": "AI算力硬件",
        "oldVersion": "1.0",
        "newVersion": "1.1",
        "summary": {
          "totalChanges": 8,
          "addedNodes": 3,
          "removedNodes": 1,
          "modifiedNodes": 4
        },
        "createdAt": "2026-08-09T02:00:00Z",
        "status": "pending"
      }
    ],
    "total": 1
  }
}
```

**获取审核详情**
```
GET /api/graph/reviews/{reviewId}

Response:
{
  "success": true,
  "data": {
    "review": {...},
    "summary": {...},
    "changes": [
      {
        "id": "change_1",
        "type": "node_added",
        "category": "细分环节",
        "path": "上游 > 先进封装",
        "description": "新增环节: 先进封装",
        "data": {...},
        "confidence": 0.85
      }
    ]
  }
}
```

**批准/拒绝全部变更**
```
POST /api/graph/reviews/{reviewId}/approve-all
POST /api/graph/reviews/{reviewId}/reject-all

Request:
{
  "reason": "拒绝原因（可选）"
}

Response:
{
  "success": true,
  "message": "已批准所有变更",
  "appliedChanges": 8
}
```

**逐条审核变更**
```
POST /api/graph/reviews/{reviewId}/changes/{changeId}/review

Request:
{
  "action": "approved" | "rejected",
  "reason": "可选的理由"
}

Response:
{
  "success": true,
  "message": "变更已批准"
}
```

**提交审核结果**
```
POST /api/graph/reviews/{reviewId}/submit

Request:
{
  "approvals": [
    { "changeId": "change_1", "action": "approved" },
    { "changeId": "change_2", "action": "rejected", "reason": "信息不准确" }
  ]
}

Response:
{
  "success": true,
  "message": "审核已完成，图谱已更新",
  "appliedChanges": 5,
  "rejectedChanges": 3
}
```

### 7.3 数据服务层API（FastAPI）

```python
# data-service/routers/industry_graph.py

from fastapi import APIRouter, BackgroundTasks

router = APIRouter(prefix="/api/v1/industry-graph", tags=["industry-graph"])

@router.post("/explore")
async def explore_industry(
    request: IndustryExploreRequest,
    background_tasks: BackgroundTasks
):
    """
    启动产业链探索任务
    """
    task_id = generate_task_id()
    
    # 后台任务执行探索
    background_tasks.add_task(
        run_exploration_task,
        task_id=task_id,
        industry_name=request.name
    )
    
    return {
        "task_id": task_id,
        "status": "started"
    }

@router.get("/tasks/{task_id}")
async def get_task_status(task_id: str):
    """
    获取探索任务状态
    """
    task = await task_manager.get_task(task_id)
    return {
        "task_id": task_id,
        "status": task.status,
        "progress": task.progress,
        "result": task.result
    }

@router.post("/diff")
async def generate_diff(request: DiffRequest):
    """
    生成图谱版本对比
    """
    diff_service = GraphDiffService()
    diff = await diff_service.compare_versions(
        industry_id=request.industry_id,
        old_version=request.old_version,
        new_version=request.new_version
    )
    return diff

@router.post("/apply-changes")
async def apply_changes(request: ApplyChangesRequest):
    """
    应用审核通过的变更
    """
    neo4j = Neo4jService()
    
    for change in request.approved_changes:
        if change.type == "node_added":
            await neo4j.create_node(change.data)
        elif change.type == "node_modified":
            await neo4j.update_node(change.node_id, change.data)
        # ...
    
    return {
        "success": True,
        "applied_count": len(request.approved_changes)
    }
```

---

## 8. 定时更新机制

### 8.1 调度器配置

```python
# data-service/services/scheduler_service.py

from apscheduler.schedulers.asyncio import AsyncIOScheduler

scheduler = AsyncIOScheduler()

def setup_industry_update_jobs():
    """
    为所有活跃产业设置定时更新任务
    每周日凌晨2点更新
    """
    
    # 从数据库获取所有活跃产业
    industries = get_active_industries()
    
    for industry in industries:
        scheduler.add_job(
            func=run_weekly_update,
            trigger='cron',
            day_of_week='sun',
            hour=2,
            minute=0,
            args=[industry.id],
            id=f'industry_update_{industry.id}',
            replace_existing=True
        )
    
    scheduler.start()

async def run_weekly_update(industry_id: str):
    """
    执行周度更新
    """
    try:
        # 1. 获取当前版本
        current_version = await neo4j.get_latest_version(industry_id)
        
        # 2. AI重新探索
        explorer = IndustryExplorerService()
        
        # 使用现有骨架，只更新企业和关系
        structure = await neo4j.get_industry_structure(industry_id)
        new_graph_data = await explorer.fill_companies(structure)
        
        # 3. 生成新版本
        new_version = increment_version(current_version.version)
        await neo4j.save_graph_version(
            industry_id=industry_id,
            version=new_version,
            data=new_graph_data
        )
        
        # 4. 生成Diff
        diff_service = GraphDiffService()
        diff = await diff_service.compare_versions(
            industry_id=industry_id,
            old_version=current_version.version,
            new_version=new_version
        )
        
        # 5. 如果有变更，创建审核记录
        if diff["summary"]["totalChanges"] > 0:
            review = await create_review_record(
                industry_id=industry_id,
                old_version=current_version.version,
                new_version=new_version,
                diff=diff
            )
            
            # 6. 发送通知
            await notify_user_for_review(review.id)
            
            logger.info(f"产业 {industry_id} 更新完成，待审核: {review.id}")
        else:
            logger.info(f"产业 {industry_id} 无变更")
            
    except Exception as e:
        logger.error(f"产业 {industry_id} 更新失败: {e}")
        await notify_update_error(industry_id, str(e))
```

### 8.2 通知机制

```python
# data-service/services/notification_service.py

async def notify_user_for_review(review_id: str):
    """
    通知用户有待审核的变更
    """
    review = await db.get_review(review_id)
    
    # 1. 创建站内通知
    await db.create_notification({
        "user_id": "admin",  # TODO: 从配置获取
        "type": "graph_review_pending",
        "title": f"图谱更新待审核: {review.industry_name}",
        "content": f"发现 {review.summary.total_changes} 处变更",
        "link": f"/graph/reviews/{review_id}",
        "created_at": datetime.now()
    })
    
    # 2. 可选：发送邮件通知
    # await email_service.send_review_notification(review)
    
    # 3. 可选：Webhook通知
    # await webhook_service.trigger("graph.review.pending", review)
```

---

## 9. 数据迁移策略

### 9.1 从旧系统迁移

**目标**：将现有的手动图谱数据迁移到Neo4j

**步骤**：

1. **导出现有数据**
```typescript
// scripts/export-legacy-graph.ts

async function exportLegacyGraph() {
  const nodes = await prisma.graphNode.findMany({
    include: {
      sourceEdges: true,
      targetEdges: true
    }
  })
  
  const edges = await prisma.graphEdge.findMany()
  
  // 转换为Neo4j兼容格式
  const neo4jData = transformToNeo4jFormat(nodes, edges)
  
  // 保存到JSON
  fs.writeFileSync('legacy-graph-export.json', JSON.stringify(neo4jData, null, 2))
}
```

2. **导入到Neo4j**
```python
# scripts/import-to-neo4j.py

async def import_legacy_graph():
    with open('legacy-graph-export.json') as f:
        data = json.load(f)
    
    neo4j = Neo4jService()
    
    # 创建产业根节点
    industry = await neo4j.create_industry({
        "name": "AI算力硬件（历史数据）",
        "code": "ai_hardware_legacy",
        "version": "0.9",
        "created_by": "migration"
    })
    
    # 导入节点
    for node in data["nodes"]:
        await neo4j.create_node(node)
    
    # 导入关系
    for edge in data["edges"]:
        await neo4j.create_relationship(edge)
    
    print(f"迁移完成: {len(data['nodes'])} 节点, {len(data['edges'])} 关系")
```

3. **验证迁移**
```bash
# 对比节点和关系数量
SELECT COUNT(*) FROM GraphNode;  # SQLite
MATCH (n) RETURN count(n);       # Neo4j

# 抽样验证数据完整性
```

### 9.2 废弃旧表

迁移验证通过后，废弃旧的图谱表：

```prisma
// prisma/schema.prisma

// 注释掉或删除以下模型
// model GraphNode { ... }
// model GraphEdge { ... }
// model GraphChangeLog { ... }
// model GraphView { ... }
```

运行迁移：
```bash
npm run db:migrate
```

---

## 10. 实施计划

### Week 1: 基础设施搭建

**任务清单**
- [x] 部署Neo4j（Docker）
- [ ] 安装Tavily Search API
- [ ] 创建Neo4j数据模型
- [ ] 实现Neo4jService基础操作
- [ ] 添加SQLite审核表（GraphUpdateReview, GraphChangeApproval）
- [ ] 环境变量配置

**验收标准**
- Neo4j可正常连接和查询
- 能创建和查询Industry/Stage/Segment/Company节点
- SQLite审核表创建成功

### Week 2: AI探索引擎

**任务清单**
- [ ] 实现IndustryExplorerService
- [ ] 编写第一轮结构探索Prompt
- [ ] 编写第二轮企业填充Prompt
- [ ] 集成Tavily Search API
- [ ] 实现并行探索逻辑
- [ ] 错误处理和重试机制

**验收标准**
- 输入"AI算力硬件"能生成产业链骨架YAML
- 能并行填充各环节的企业信息
- 企业信息准确（股票代码、市值等）


### Week 3: Diff引擎和定时更新

**任务清单**
- [ ] 实现GraphDiffService
- [ ] 节点和关系对比算法
- [ ] 变更分类和路径生成
- [ ] 定时调度器集成
- [ ] 通知服务实现
- [ ] 版本管理逻辑

**验收标准**
- 能对比两个版本并生成详细diff
- 定时任务能正常触发
- 有变更时能创建审核记录并通知

### Week 4: 前端UI实现

**任务清单**
- [ ] 泳道图组件（SwimLaneGraph）
- [ ] 产业列表页
- [ ] 创建产业页面
- [ ] Diff审核页面
- [ ] 待审核列表页
- [ ] API集成和状态管理

**验收标准**
- 泳道图能正确展示产业链结构
- 企业卡片能显示关键信息
- 审核页面能展示Git-like diff
- 能批量或逐条批准变更

### Week 5: 集成测试和优化

**任务清单**
- [ ] 端到端测试（创建 → 更新 → 审核）
- [ ] 性能优化（Neo4j查询、并行探索）
- [ ] 错误处理完善
- [ ] 数据迁移脚本
- [ ] 废弃旧图谱系统
- [ ] 文档编写

**验收标准**
- 完整流程无阻塞运行
- 探索时间 < 5分钟/产业
- Diff生成时间 < 10秒
- 旧数据成功迁移到Neo4j

---

## 11. 技术栈总结

| 层级 | 技术选型 | 版本 | 用途 |
|------|---------|------|------|
| **前端框架** | Next.js | 16 | App Router + React 19 |
| **UI组件** | shadcn/ui | latest | 审核界面 |
| **可视化** | D3.js | 7.x | 泳道图渲染 |
| **状态管理** | SWR | 2.x | 数据获取和缓存 |
| **后端框架** | FastAPI | 0.110+ | 数据服务API |
| **图数据库** | Neo4j | 5.x | 图谱存储 |
| **关系数据库** | SQLite + Prisma | 7 | 审核记录 |
| **AI模型** | Claude 3.5 Sonnet | latest | 产业链分析 |
| **搜索引擎** | Tavily Search API | v1 | 联网搜索 |
| **调度器** | APScheduler | 3.10+ | 定时更新 |
| **Python依赖** | neo4j-driver | 5.x | Neo4j客户端 |
| | pyyaml | 6.x | YAML解析 |
| | tavily-python | latest | Tavily客户端 |

---

## 12. 环境变量配置

```env
# .env

# Neo4j配置
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-secure-password
NEO4J_DATABASE=neo4j

# Tavily Search API
TAVILY_API_KEY=tvly-your-api-key

# Claude API（复用现有）
ANTHROPIC_API_KEY=sk-ant-your-key

# 调度器配置
SCHEDULER_TIMEZONE=Asia/Shanghai
UPDATE_CRON_SCHEDULE="0 2 * * 0"  # 每周日凌晨2点

# 通知配置
ENABLE_EMAIL_NOTIFICATIONS=false
ENABLE_WEBHOOK_NOTIFICATIONS=false
```

---

## 13. Neo4j部署

### 13.1 Docker Compose配置

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
      - NEO4J_AUTH=neo4j/your-secure-password
      - NEO4J_PLUGINS=["apoc"]
      - NEO4J_dbms_memory_heap_initial__size=512m
      - NEO4J_dbms_memory_heap_max__size=2G
      - NEO4J_dbms_memory_pagecache_size=1G
    volumes:
      - neo4j_data:/data
      - neo4j_logs:/logs
      - neo4j_import:/var/lib/neo4j/import
    restart: unless-stopped

volumes:
  neo4j_data:
  neo4j_logs:
  neo4j_import:
```

### 13.2 启动Neo4j

```bash
# 启动容器
docker-compose -f docker-compose.neo4j.yml up -d

# 检查状态
docker-compose -f docker-compose.neo4j.yml ps

# 访问Neo4j Browser
open http://localhost:7474

# 查看日志
docker-compose -f docker-compose.neo4j.yml logs -f neo4j
```

### 13.3 初始化数据库

```cypher
-- 在Neo4j Browser中执行

-- 创建索引
CREATE INDEX industry_code IF NOT EXISTS FOR (i:Industry) ON (i.code);
CREATE INDEX company_ticker IF NOT EXISTS FOR (c:Company) ON (c.ticker);
CREATE INDEX segment_code IF NOT EXISTS FOR (s:Segment) ON (s.code);

-- 创建唯一约束
CREATE CONSTRAINT industry_id IF NOT EXISTS FOR (i:Industry) REQUIRE i.id IS UNIQUE;
CREATE CONSTRAINT company_id IF NOT EXISTS FOR (c:Company) REQUIRE c.id IS UNIQUE;

-- 验证
SHOW INDEXES;
SHOW CONSTRAINTS;
```

---

## 14. 风险与应对

| 风险 | 影响 | 概率 | 应对措施 |
|------|------|------|---------|
| **AI生成信息不准确** | 高 | 中 | 人工审核机制 + 置信度评分 + 多源验证 |
| **Neo4j运维复杂** | 中 | 低 | Docker容器化 + 自动备份 + 监控告警 |
| **Tavily API成本** | 中 | 中 | 请求缓存 + 批量搜索 + 成本监控 |
| **探索时间过长** | 中 | 中 | 并行探索 + 超时设置 + 进度反馈 |
| **版本冲突** | 低 | 低 | 乐观锁 + 版本号自增 + 冲突检测 |
| **数据迁移失败** | 高 | 低 | 充分测试 + 回滚方案 + 数据备份 |
| **用户不审核变更** | 中 | 中 | 邮件提醒 + 默认批准策略（可配置） |

---

## 15. 后续扩展

### Phase 2: 多产业支持（Week 6-8）

- [ ] 新能源汽车产业链
- [ ] 创新药/医疗器械产业链
- [ ] 消费电子产业链
- [ ] 产业间关联分析

### Phase 3: 高级功能（Week 9-12）

- [ ] 图算法：中心性分析、社区检测
- [ ] 时间线视图：产业演进历史
- [ ] 对比分析：多产业横向对比
- [ ] RAG问答：基于图谱的智能问答
- [ ] 投资组合建议：基于图谱的ETF推荐

### Phase 4: 平台化（Month 4+）

- [ ] 产业模板市场（用户贡献）
- [ ] 数据质量评分系统
- [ ] 知识融合引擎（多源数据合并）
- [ ] API开放平台（第三方集成）

---

## 16. 成功指标

### 16.1 功能指标

| 指标 | 目标值 | 测量方式 |
|------|--------|---------|
| 产业探索准确率 | > 85% | 人工抽样验证 |
| 企业信息完整度 | > 90% | 必填字段覆盖率 |
| 关系识别准确率 | > 80% | 人工验证样本 |
| 探索时间 | < 5分钟 | 系统计时 |
| Diff生成时间 | < 10秒 | 系统计时 |

### 16.2 用户体验指标

| 指标 | 目标值 | 测量方式 |
|------|--------|---------|
| 审核通过率 | > 80% | 批准变更数/总变更数 |
| 页面加载时间 | < 2秒 | 前端监控 |
| 泳道图渲染时间 | < 1秒 | 前端性能 |
| 错误率 | < 5% | 错误日志统计 |

### 16.3 系统性能指标

| 指标 | 目标值 | 测量方式 |
|------|--------|---------|
| Neo4j查询响应 | < 100ms | APM监控 |
| API响应时间 | < 500ms | API监控 |
| 并发支持 | 10个探索任务 | 压力测试 |
| 数据库容量 | 支持100个产业 | 存储监控 |

---

## 17. 文件结构

```
ai-invest/
├── data-service/
│   ├── services/
│   │   ├── industry_explorer.py          # AI探索引擎
│   │   ├── graph_diff_service.py         # Diff引擎
│   │   ├── neo4j_service.py              # Neo4j封装
│   │   └── notification_service.py       # 通知服务
│   ├── routers/
│   │   └── industry_graph.py             # FastAPI路由
│   ├── models/
│   │   ├── industry.py                   # 数据模型
│   │   └── diff.py
│   └── config/
│       └── neo4j_indexes.cypher          # Neo4j索引脚本
│
├── src/
│   ├── app/
│   │   └── (dashboard)/
│   │       └── graph/
│   │           ├── page.tsx              # 产业列表页
│   │           ├── create/
│   │           │   └── page.tsx          # 创建产业页
│   │           ├── [industryId]/
│   │           │   └── page.tsx          # 泳道图页面
│   │           └── reviews/
│   │               ├── page.tsx          # 待审核列表
│   │               └── [id]/
│   │                   └── page.tsx      # Diff审核详情
│   ├── components/
│   │   └── graph/
│   │       ├── SwimLaneGraph.tsx         # 泳道图组件
│   │       ├── SwimLaneStage.tsx
│   │       ├── SegmentColumn.tsx
│   │       ├── CompanyCard.tsx
│   │       ├── DiffReviewPanel.tsx       # 审核面板
│   │       └── ChangeCard.tsx            # 变更卡片
│   ├── lib/
│   │   └── services/
│   │       └── industry-graph.service.ts  # API封装
│   └── types/
│       ├── industry-graph.ts              # 类型定义
│       └── graph-diff.ts
│
├── prisma/
│   └── schema.prisma                      # 新增审核表
│
├── scripts/
│   ├── export-legacy-graph.ts            # 导出旧图谱
│   ├── import-to-neo4j.py                # 导入Neo4j
│   └── test-industry-explorer.ts         # 测试脚本
│
├── docs/
│   └── superpowers/
│       └── specs/
│           └── 2026-08-02-ai-powered-industry-graph-design.md
│
└── docker-compose.neo4j.yml               # Neo4j部署配置
```

---

## 18. 总结

### 18.1 核心创新

1. **AI自动发现**：从"手动创建"到"AI探索生成"
2. **两轮探索**：先骨架后细节，保证质量和控制力
3. **Git-like审核**：专业的变更管理体验
4. **泳道式展示**：直观的产业链可视化
5. **定时增量更新**：自动保持数据新鲜度

### 18.2 技术亮点

- **Neo4j图数据库**：专业的图存储和查询能力
- **Tavily Search**：强大的联网搜索和信息提取
- **并行探索**：提升探索效率
- **版本管理**：完整的图谱版本历史
- **混合存储**：Neo4j（图谱）+ SQLite（业务）

### 18.3 价值提升

- **效率提升**：从数天手动创建到5分钟自动生成
- **准确性**：AI+搜索引擎，信息更准确更全面
- **可维护性**：自动更新+人工审核，持续保持新鲜
- **可扩展性**：快速复制到多个产业领域
- **投资价值**：完整的产业链分析，辅助ETF投资决策

---

**设计文档版本**: 1.0  
**完成日期**: 2026-08-02  
**状态**: 待审阅  
**下一步**: 用户审阅 → 编写实施计划 → 开始开发

