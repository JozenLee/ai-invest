# Phase 3 & 4 实施设计

**日期**: 2026-07-30  
**状态**: 待实施  
**预计周期**: 7-9天  
**实施策略**: 渐进式迭代

## 1. 概述

本文档定义 Phase 3（可视化升级）和 Phase 4（ETF集成）的实施方案，基于已完成的 Phase 1-2 构建增强的可视化交互和 ETF 图谱分析能力。

### 1.1 实施策略

采用**渐进式迭代**策略，分3个迭代完成：

- **迭代1（3-4天）**: 核心可视化增强 - 筛选、路径探索、布局优化、基础视角
- **迭代2（2-3天）**: ETF图谱集成 - 持仓映射、图谱视角分析
- **迭代3（2天）**: 增强和优化 - 多视角、信息叠加、性能优化

### 1.2 已有基础

**Phase 1 & 2 已完成**：
- ✅ Graph Builder Pipeline（AI抽取、审核工作流）
- ✅ 新闻图谱关联（NewsGraphLink）
- ✅ 事件影响分析（传导路径计算）
- ✅ 图谱状态更新（动量、周期位置）

**Phase 3 部分组件已存在**：
- ⚠️ GraphFilters.tsx - 需完善并集成
- ⚠️ PathExplorer.tsx - 需增强交互
- ⚠️ hierarchical-layout.ts - 需集成到ForceGraph
- ⚠️ GraphToolbar.tsx - 需完善功能

## 2. 系统架构

```
┌─────────────────────────────────────────────────────────┐
│            Knowledge Graph System                       │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Phase 3: 可视化升级                                     │
│  ┌────────────────────────────────────────────────┐    │
│  │ UI组件层                                        │    │
│  │ • GraphFilters (筛选)                          │    │
│  │ • PathExplorer (路径探索)                      │    │
│  │ • ViewSwitcher (视角切换) - 新增              │    │
│  │ • NodeOverlay (信息叠加) - 新增               │    │
│  └────────────────────────────────────────────────┘    │
│  ┌────────────────────────────────────────────────┐    │
│  │ API层                                           │    │
│  │ • POST /api/graph/find-paths                   │    │
│  │ • GET /api/graph/views                         │    │
│  │ • GET /api/graph/views/[id]                    │    │
│  └────────────────────────────────────────────────┘    │
│  ┌────────────────────────────────────────────────┐    │
│  │ 服务层                                          │    │
│  │ • PathFinderService                            │    │
│  │ • GraphViewService                             │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  Phase 4: ETF集成                                        │
│  ┌────────────────────────────────────────────────┐    │
│  │ 数据模型                                        │    │
│  │ • GraphStock (个股→节点映射) - 新增           │    │
│  └────────────────────────────────────────────────┘    │
│  ┌────────────────────────────────────────────────┐    │
│  │ API层                                           │    │
│  │ • GET /api/etf/[ticker]/graph-mapping          │    │
│  │ • POST /api/etf/graph-analysis                 │    │
│  └────────────────────────────────────────────────┘    │
│  ┌────────────────────────────────────────────────┐    │
│  │ 服务层                                          │    │
│  │ • ETFGraphMapperService                        │    │
│  │ • ETFGraphAnalyzerService                      │    │
│  └────────────────────────────────────────────────┘    │
│  ┌────────────────────────────────────────────────┐    │
│  │ 数据服务 (Python)                               │    │
│  │ • ETF Holdings Provider                        │    │
│  └────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

## 3. 迭代1：核心可视化增强（3-4天）

### 3.1 完善 GraphFilters 组件

**目标**: 让用户能够根据多种条件筛选图谱节点

**当前状态**: 组件已存在但未集成到主页面

**实施步骤**:

1. **修改 GraphFilters.tsx**
   - 添加 `onFilterChange` 回调，实时更新筛选结果
   - 优化筛选逻辑性能（debounce）
   - 添加筛选结果计数显示

2. **集成到 graph/explore/page.tsx**
   - 在主页面添加筛选面板（可折叠侧边栏或弹出层）
   - 实现筛选逻辑：
     ```typescript
     const filteredNodes = useMemo(() => {
       return nodes.filter(node => {
         // 节点类型筛选
         if (filters.nodeTypes.length > 0 && !filters.nodeTypes.includes(node.type)) {
           return false
         }
         // 动量范围筛选
         if (node.momentum !== undefined) {
           if (node.momentum < filters.momentumRange[0] || node.momentum > filters.momentumRange[1]) {
             return false
           }
         }
         // 周期位置筛选
         if (filters.cyclePositions.length > 0 && node.cyclePos) {
           if (!filters.cyclePositions.includes(node.cyclePos)) {
             return false
           }
         }
         // 新闻热度筛选
         if (filters.hasRecentNews && (!node.newsCount7d || node.newsCount7d === 0)) {
           return false
         }
         if (node.newsCount7d !== undefined && node.newsCount7d < filters.minNewsCount) {
           return false
         }
         return true
       })
     }, [nodes, filters])
     ```
   - 筛选后的边也需要更新（只保留两端节点都存在的边）

3. **添加快捷筛选预设**
   - "热点节点"：有7天新闻 > 3
   - "上升期节点"：cyclePos = 'upturn'
   - "高动量节点"：momentum > 60

**验收标准**:
- ✅ 筛选面板可以展开/折叠
- ✅ 实时筛选节点和边
- ✅ 显示筛选结果数量
- ✅ 可以一键清除所有筛选

### 3.2 实现路径查询 API

**目标**: 提供两个节点之间的传导路径查询能力

**API 端点**: `POST /api/graph/find-paths`

**请求结构**:
```typescript
interface PathQueryRequest {
  sourceNodeId: string
  targetNodeId: string
  maxDepth?: number // 默认 4
  maxPaths?: number // 默认 10
  relationTypes?: string[] // 可选，限制关系类型
}
```

**响应结构**:
```typescript
interface PathQueryResponse {
  success: boolean
  data: {
    sourceNode: PathNode
    targetNode: PathNode
    paths: Path[]
  }
}

interface Path {
  nodes: PathNode[]
  edges: PathEdge[]
  totalWeight: number
  totalLag?: string
}
```

**实施步骤**:

1. **创建服务** `src/lib/services/path-finder.service.ts`
   ```typescript
   export class PathFinderService {
     /**
      * BFS 查找两节点间的所有路径
      */
     async findPaths(
       sourceId: string,
       targetId: string,
       options: {
         maxDepth?: number
         maxPaths?: number
         relationTypes?: string[]
       }
     ): Promise<Path[]> {
       // 1. 获取图谱数据
       const nodes = await prisma.graphNode.findMany()
       const edges = await prisma.graphEdge.findMany({
         where: relationTypes 
           ? { relation: { in: relationTypes } }
           : undefined
       })
       
       // 2. 构建邻接表
       const adjacency = this.buildAdjacency(edges)
       
       // 3. BFS 搜索路径
       const paths = this.bfsSearch(
         sourceId, 
         targetId, 
         adjacency, 
         nodes, 
         edges, 
         maxDepth || 4,
         maxPaths || 10
       )
       
       return paths
     }
     
     private bfsSearch(...) {
       // BFS 实现，返回所有路径
     }
   }
   ```

2. **创建 API 路由** `src/app/api/graph/find-paths/route.ts`
   ```typescript
   export async function POST(request: Request) {
     const body = await request.json()
     const { sourceNodeId, targetNodeId, maxDepth, maxPaths, relationTypes } = body
     
     const pathFinder = new PathFinderService()
     const paths = await pathFinder.findPaths(
       sourceNodeId,
       targetNodeId,
       { maxDepth, maxPaths, relationTypes }
     )
     
     // 获取源节点和目标节点详情
     const [sourceNode, targetNode] = await prisma.graphNode.findMany({
       where: { id: { in: [sourceNodeId, targetNodeId] } }
     })
     
     return NextResponse.json({
       success: true,
       data: {
         sourceNode,
         targetNode,
         paths
       }
     })
   }
   ```

**验收标准**:
- ✅ 能查找两节点间的所有路径（最多10条）
- ✅ 路径按权重排序
- ✅ 支持最大深度限制
- ✅ 响应时间 < 1秒

### 3.3 增强 PathExplorer 交互

**目标**: 改进路径探索的用户体验

**实施步骤**:

1. **添加节点选择模式**
   - 在主页面添加"路径探索模式"按钮
   - 激活后，用户连续点击两个节点
   - 自动调用 `/api/graph/find-paths` 并在侧边栏显示结果

2. **增强 PathExplorer 组件**
   - 添加路径高亮功能：鼠标悬停路径时，在图谱中高亮显示该路径的节点和边
   - 实现路径对比：可以选中多条路径进行对比
   - 添加导出功能：导出路径为JSON或图片

3. **集成到 ForceGraph 组件**
   - ForceGraph 接收 `highlightedPath` prop
   - 高亮路径上的节点（加粗边框、改变颜色）
   - 高亮路径上的边（加粗、改变颜色）

**验收标准**:
- ✅ 点击两个节点能自动查找路径
- ✅ 悬停路径时图谱中高亮显示
- ✅ 路径探索模式可以开关

### 3.4 集成分层布局算法

**目标**: 改善图谱的默认布局，使层次结构更清晰

**当前状态**: `hierarchical-layout.ts` 已存在但未集成

**实施步骤**:

1. **修改 ForceGraph 组件** `src/components/graph/force-graph.tsx`
   - 添加 `layoutType` prop: `'force' | 'hierarchical'`
   - 在初始化时根据 layoutType 选择布局算法
   ```typescript
   useEffect(() => {
     if (layoutType === 'hierarchical') {
       const layoutEngine = new HierarchicalLayout({
         width,
         height,
         levelSpacing: 150,
         nodeSpacing: 80
       })
       const positioned = layoutEngine.layout(nodes, edges)
       // 应用位置到 D3 simulation
       simulation.nodes(positioned)
     } else {
       // 使用原有的力导向布局
     }
   }, [layoutType, nodes, edges])
   ```

2. **在主页面添加布局切换**
   - 添加布局切换按钮：力导向 / 分层布局
   - 切换时平滑过渡动画

3. **优化分层布局**
   - 调整参数使布局更紧凑
   - 添加"重新布局"按钮（用户拖动节点后可重置）

**验收标准**:
- ✅ 可以切换力导向和分层布局
- ✅ 分层布局层次清晰，节点不重叠
- ✅ 切换布局有平滑动画

### 3.5 实现基础视角切换

**目标**: 提供2个预定义视角：全景视图（默认）和热点视图

**实施步骤**:

1. **创建视角配置服务** `src/lib/services/graph-view.service.ts`
   ```typescript
   export interface GraphView {
     id: string
     name: string
     description: string
     filters: GraphFilters
     layoutType: 'force' | 'hierarchical'
     highlightRules?: {
       nodeCondition: (node: GraphNode) => boolean
       nodeStyle: Partial<CSSProperties>
     }[]
   }
   
   export const PREDEFINED_VIEWS: GraphView[] = [
     {
       id: 'panorama',
       name: '全景视图',
       description: '显示完整产业链，分层布局',
       filters: {
         nodeTypes: [],
         momentumRange: [-100, 100],
         cyclePositions: [],
         hasRecentNews: false,
         minNewsCount: 0
       },
       layoutType: 'hierarchical'
     },
     {
       id: 'hotspot',
       name: '热点视图',
       description: '只显示有新闻的节点，按热度着色',
       filters: {
         nodeTypes: [],
         momentumRange: [-100, 100],
         cyclePositions: [],
         hasRecentNews: true,
         minNewsCount: 1
       },
       layoutType: 'force',
       highlightRules: [
         {
           nodeCondition: (node) => (node.newsCount7d || 0) > 5,
           nodeStyle: { fill: '#ef4444', stroke: '#dc2626' }
         },
         {
           nodeCondition: (node) => (node.newsCount7d || 0) > 3,
           nodeStyle: { fill: '#f97316', stroke: '#ea580c' }
         }
       ]
     }
   ]
   ```

2. **创建 API 端点**
   - `GET /api/graph/views` - 返回所有预定义视角
   - `GET /api/graph/views/[id]` - 返回特定视角配置

3. **添加视角切换器组件** `src/components/graph/ViewSwitcher.tsx`
   ```typescript
   export function ViewSwitcher({
     currentView,
     onViewChange
   }: {
     currentView: string
     onViewChange: (viewId: string) => void
   }) {
     const [views, setViews] = useState<GraphView[]>([])
     
     useEffect(() => {
       fetch('/api/graph/views')
         .then(res => res.json())
         .then(data => setViews(data.data))
     }, [])
     
     return (
       <Select value={currentView} onValueChange={onViewChange}>
         <SelectTrigger>
           <SelectValue />
         </SelectTrigger>
         <SelectContent>
           {views.map(view => (
             <SelectItem key={view.id} value={view.id}>
               {view.name}
             </SelectItem>
           ))}
         </SelectContent>
       </Select>
     )
   }
   ```

4. **集成到主页面**
   - 添加视角切换器到工具栏
   - 切换视角时自动应用筛选和布局
   - 应用高亮规则到节点样式

**验收标准**:
- ✅ 可以在全景和热点视图间切换
- ✅ 热点视图自动筛选有新闻的节点
- ✅ 热点视图按新闻数量着色节点

## 4. 迭代2：ETF 图谱集成（2-3天）

### 4.1 创建 GraphStock 数据模型

**目标**: 建立个股到图谱节点的映射关系

**数据库 Schema**:

```prisma
model GraphStock {
  id          String   @id @default(cuid())
  
  // 个股信息
  stockCode   String   @unique  // 股票代码，如 "600519.SH"
  stockName   String              // 股票名称
  
  // 图谱映射
  nodeId      String              // 关联的图谱节点ID
  node        GraphNode @relation(fields: [nodeId], references: [id], onDelete: Cascade)
  
  // 映射元数据
  relevance   Float    @default(1.0)  // 相关度 0-1
  category    String?                  // 分类标签，如 "核心标的", "产业链上游"
  description String?                  // 映射说明
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@index([nodeId])
  @@index([stockCode])
}

// 扩展 GraphNode
model GraphNode {
  // ... 现有字段
  
  stocks      GraphStock[]  // 关联的个股
}
```

**迁移文件**: `prisma/migrations/XXXXXX_add_graph_stock/migration.sql`

**实施步骤**:

1. **更新 Prisma Schema**
   - 在 `prisma/schema.prisma` 中添加 GraphStock 模型
   - 扩展 GraphNode 添加 stocks 关系

2. **创建迁移**
   ```bash
   npm run db:migrate
   ```

3. **创建种子数据脚本** `prisma/seed-graph-stock.ts`
   - 手动定义核心个股到节点的映射
   - 示例映射：
     ```typescript
     const STOCK_MAPPINGS = [
       {
         stockCode: '688256.SH',
         stockName: '寒武纪',
         nodeId: 'node_ai_chip',  // AI芯片设计节点
         relevance: 1.0,
         category: '核心标的'
       },
       {
         stockCode: '002371.SZ',
         stockName: '北方华创',
         nodeId: 'node_semiconductor_equipment',
         relevance: 1.0,
         category: '核心标的'
       },
       // ... 更多映射
     ]
     ```

**验收标准**:
- ✅ GraphStock 表创建成功
- ✅ 可以查询节点关联的个股
- ✅ 种子数据包含至少 20 个核心标的映射

### 4.2 扩展 Python 数据服务 - ETF 持仓接口

**目标**: 通过 AKShare 获取 ETF 持仓数据

**实施步骤**:

1. **创建 ETF Provider** `data-service/providers/etf_provider.py`
   ```python
   import akshare as ak
   from typing import List, Dict, Optional
   
   class ETFProvider:
       """ETF数据提供者"""
       
       def get_holdings(self, ticker: str) -> List[Dict]:
           """
           获取ETF持仓明细
           
           Args:
               ticker: ETF代码，如 "512480"
               
           Returns:
               持仓列表，包含股票代码、名称、权重等
           """
           try:
               # 使用AKShare获取ETF持仓
               df = ak.fund_etf_fund_info_em(fund=ticker, indicator="持仓明细")
               
               holdings = []
               for _, row in df.iterrows():
                   holdings.append({
                       'stock_code': row['股票代码'],
                       'stock_name': row['股票名称'],
                       'weight': float(row['持仓占比']),  # 转换为小数
                       'shares': int(row['持股数']) if '持股数' in row else None,
                       'market_value': float(row['持仓市值']) if '持仓市值' in row else None
                   })
               
               return holdings
           except Exception as e:
               print(f"获取ETF持仓失败: {e}")
               return []
       
       def get_etf_info(self, ticker: str) -> Optional[Dict]:
           """获取ETF基本信息"""
           try:
               df = ak.fund_etf_fund_info_em(fund=ticker, indicator="基本信息")
               # 解析基本信息
               return {
                   'ticker': ticker,
                   'name': df.loc[df['item'] == '基金简称', 'value'].iloc[0],
                   'type': df.loc[df['item'] == '基金类型', 'value'].iloc[0],
                   'size': df.loc[df['item'] == '基金规模', 'value'].iloc[0]
               }
           except Exception as e:
               print(f"获取ETF信息失败: {e}")
               return None
   ```

2. **添加 API 路由** `data-service/routers/etf.py`
   ```python
   from fastapi import APIRouter, HTTPException
   from providers.etf_provider import ETFProvider
   
   router = APIRouter(prefix="/etf", tags=["ETF"])
   etf_provider = ETFProvider()
   
   @router.get("/{ticker}/holdings")
   async def get_etf_holdings(ticker: str):
       """获取ETF持仓"""
       holdings = etf_provider.get_holdings(ticker)
       if not holdings:
           raise HTTPException(status_code=404, detail="未找到持仓数据")
       return {"success": True, "data": holdings}
   
   @router.get("/{ticker}/info")
   async def get_etf_info(ticker: str):
       """获取ETF基本信息"""
       info = etf_provider.get_etf_info(ticker)
       if not info:
           raise HTTPException(status_code=404, detail="未找到ETF信息")
       return {"success": True, "data": info}
   ```

3. **注册路由到主应用** `data-service/main.py`
   ```python
   from routers import etf
   
   app.include_router(etf.router)
   ```

**验收标准**:
- ✅ `GET /etf/{ticker}/holdings` 返回持仓数据
- ✅ `GET /etf/{ticker}/info` 返回基本信息
- ✅ 测试至少 3 个 ETF（如 512480, 515790, 159995）

### 4.3 实现 ETF 持仓映射服务

**目标**: 将 ETF 持仓映射到图谱节点

**实施步骤**:

1. **创建服务** `src/lib/services/etf-graph-mapper.service.ts`
   ```typescript
   export interface ETFHolding {
     stock_code: string
     stock_name: string
     weight: number
   }
   
   export interface NodeExposure {
     nodeId: string
     nodeName: string
     nodeType: string
     exposure: number  // 该节点的总权重
     stocks: {
       code: string
       name: string
       weight: number
     }[]
   }
   
   export class ETFGraphMapperService {
     /**
      * 映射 ETF 持仓到图谱节点
      */
     async mapETFToGraph(ticker: string): Promise<NodeExposure[]> {
       // 1. 从 Python 服务获取持仓
       const response = await fetch(
         `http://localhost:8000/etf/${ticker}/holdings`
       )
       const { data: holdings } = await response.json()
       
       // 2. 查询持仓个股对应的图谱节点
       const stockCodes = holdings.map(h => h.stock_code)
       const graphStocks = await prisma.graphStock.findMany({
         where: { stockCode: { in: stockCodes } },
         include: { node: true }
       })
       
       // 3. 构建映射 Map: stockCode -> nodeId
       const stockToNode = new Map<string, { nodeId: string, nodeName: string, nodeType: string }>()
       for (const gs of graphStocks) {
         stockToNode.set(gs.stockCode, {
           nodeId: gs.nodeId,
           nodeName: gs.node.name,
           nodeType: gs.node.type
         })
       }
       
       // 4. 按节点聚合权重
       const nodeExposureMap = new Map<string, NodeExposure>()
       
       for (const holding of holdings) {
         const nodeInfo = stockToNode.get(holding.stock_code)
         if (!nodeInfo) continue
         
         if (!nodeExposureMap.has(nodeInfo.nodeId)) {
           nodeExposureMap.set(nodeInfo.nodeId, {
             nodeId: nodeInfo.nodeId,
             nodeName: nodeInfo.nodeName,
             nodeType: nodeInfo.nodeType,
             exposure: 0,
             stocks: []
           })
         }
         
         const exposure = nodeExposureMap.get(nodeInfo.nodeId)!
         exposure.exposure += holding.weight
         exposure.stocks.push({
           code: holding.stock_code,
           name: holding.stock_name,
           weight: holding.weight
         })
       }
       
       // 5. 转换为数组并排序
       return Array.from(nodeExposureMap.values())
         .sort((a, b) => b.exposure - a.exposure)
     }
   }
   ```

2. **创建 API 端点** `src/app/api/etf/[ticker]/graph-mapping/route.ts`
   ```typescript
   export async function GET(
     request: Request,
     { params }: { params: { ticker: string } }
   ) {
     const { ticker } = params
     
     const mapper = new ETFGraphMapperService()
     const exposures = await mapper.mapETFToGraph(ticker)
     
     return NextResponse.json({
       success: true,
       data: {
         ticker,
         nodeExposures: exposures,
         coverage: exposures.length,
         totalExposure: exposures.reduce((sum, e) => sum + e.exposure, 0)
       }
     })
   }
   ```

**验收标准**:
- ✅ 能将 ETF 持仓映射到图谱节点
- ✅ 按节点聚合权重
- ✅ 返回覆盖的节点数和总权重

### 4.4 实现图谱视角的 ETF 分析服务

**目标**: 基于图谱视角分析 ETF 的产业链布局

**实施步骤**:

1. **创建服务** `src/lib/services/etf-graph-analyzer.service.ts`
   ```typescript
   export interface GraphPerspectiveAnalysis {
     // 产业链覆盖度
     coverage: {
       totalNodes: number
       coveredNodes: number
       coverageRate: number
       uncoveredLevels: string[]  // 缺失的层级
     }
     
     // 周期风险分析
     cycleRisk: {
       upturn: number    // 上升期暴露度
       peak: number      // 高位暴露度
       downturn: number  // 下降期暴露度
       trough: number    // 底部暴露度
       riskScore: number // 风险得分 0-100
     }
     
     // 上下游平衡
     supplyChainBalance: {
       upstream: number   // 上游暴露度
       midstream: number  // 中游暴露度
       downstream: number // 下游暴露度
       isBalanced: boolean
     }
     
     // 动量聚合
     momentum: {
       weightedAverage: number  // 加权平均动量
       distribution: {
         high: number   // 高动量节点占比
         medium: number
         low: number
       }
     }
     
     // AI 洞察
     insights: string[]
   }
   
   export class ETFGraphAnalyzerService {
     async analyze(ticker: string): Promise<GraphPerspectiveAnalysis> {
       // 1. 获取持仓映射
       const mapper = new ETFGraphMapperService()
       const exposures = await mapper.mapETFToGraph(ticker)
       
       // 2. 获取所有图谱节点
       const allNodes = await prisma.graphNode.findMany()
       
       // 3. 分析覆盖度
       const coverage = this.analyzeCoverage(exposures, allNodes)
       
       // 4. 分析周期风险
       const cycleRisk = this.analyzeCycleRisk(exposures, allNodes)
       
       // 5. 分析供应链平衡
       const balance = this.analyzeBalance(exposures, allNodes)
       
       // 6. 分析动量
       const momentum = this.analyzeMomentum(exposures, allNodes)
       
       // 7. 生成 AI 洞察
       const insights = await this.generateInsights(
         ticker,
         coverage,
         cycleRisk,
         balance,
         momentum
       )
       
       return {
         coverage,
         cycleRisk,
         supplyChainBalance: balance,
         momentum,
         insights
       }
     }
     
     private analyzeCoverage(...) {
       // 计算覆盖度逻辑
     }
     
     private analyzeCycleRisk(...) {
       // 计算周期风险逻辑
     }
     
     private analyzeBalance(...) {
       // 计算供应链平衡逻辑
     }
     
     private analyzeMomentum(...) {
       // 计算动量逻辑
     }
     
     private async generateInsights(...) {
       // 使用 Claude API 生成洞察
     }
   }
   ```

2. **创建 API 端点** `src/app/api/etf/graph-analysis/route.ts`
   ```typescript
   export async function POST(request: Request) {
     const { ticker } = await request.json()
     
     const analyzer = new ETFGraphAnalyzerService()
     const analysis = await analyzer.analyze(ticker)
     
     return NextResponse.json({
       success: true,
       data: analysis
     })
   }
   ```

**验收标准**:
- ✅ 能分析 ETF 的产业链覆盖度
- ✅ 能评估周期风险
- ✅ 能判断上下游平衡
- ✅ 能计算加权动量
- ✅ 生成至少 3 条 AI 洞察

### 4.5 创建 ETF 图谱分析页面

**目标**: 在前端展示 ETF 的图谱视角分析

**实施步骤**:

1. **创建页面** `src/app/(dashboard)/etf-graph/page.tsx`
   - ETF 选择器（输入代码或从列表选择）
   - 图谱映射可视化（饼图显示节点暴露度）
   - 产业链覆盖度雷达图
   - 周期风险分布
   - 上下游平衡柱状图
   - AI 洞察卡片

2. **或者集成到现有 ETF 分析页面**
   - 在 `/analysis` 页面添加"图谱视角" tab
   - 显示图谱分析结果
   - 添加"查看图谱"按钮，跳转到图谱页面并高亮相关节点

**验收标准**:
- ✅ 可以输入 ETF 代码并分析
- ✅ 可视化展示产业链布局
- ✅ 显示 AI 生成的投资洞察

## 5. 迭代3：增强和优化（2天）

### 5.1 添加剩余视角

**目标**: 实现周期视图、动量视图、供应链视图

**实施步骤**:

1. **扩展视角配置** `src/lib/services/graph-view.service.ts`
   ```typescript
   export const PREDEFINED_VIEWS: GraphView[] = [
     // ... 已有的全景和热点视图
     
     {
       id: 'cycle',
       name: '周期视图',
       description: '按周期位置分组展示',
       filters: {
         nodeTypes: [],
         momentumRange: [-100, 100],
         cyclePositions: [],
         hasRecentNews: false,
         minNewsCount: 0
       },
       layoutType: 'force',
       customLayout: 'circular-by-cycle'  // 自定义圆形布局
     },
     {
       id: 'momentum',
       name: '动量视图',
       description: '按动量排序，颜色渐变',
       filters: {
         nodeTypes: [],
         momentumRange: [-100, 100],
         cyclePositions: [],
         hasRecentNews: false,
         minNewsCount: 0
       },
       layoutType: 'force',
       highlightRules: [
         {
           nodeCondition: (node) => (node.momentum || 0) > 60,
           nodeStyle: { fill: '#22c55e' }  // 绿色 - 高动量
         },
         {
           nodeCondition: (node) => (node.momentum || 0) < -40,
           nodeStyle: { fill: '#ef4444' }  // 红色 - 低动量
         }
       ]
     },
     {
       id: 'supply_chain',
       name: '供应链视图',
       description: '只显示供应链关系',
       filters: {
         nodeTypes: [],
         momentumRange: [-100, 100],
         cyclePositions: [],
         hasRecentNews: false,
         minNewsCount: 0
       },
       layoutType: 'hierarchical',
       relationFilter: ['supply_chain', 'indirect_supply']
     }
   ]
   ```

2. **实现自定义布局**
   - 周期视图：按 cyclePos 分成4个象限（圆形布局）
   - 供应链视图：只渲染 supply_chain 类型的边

**验收标准**:
- ✅ 5 个视角全部可用
- ✅ 周期视图按周期位置分组
- ✅ 供应链视图只显示供应链关系

### 5.2 信息叠加层

**目标**: 在节点上叠加显示动态信息

**实施步骤**:

1. **创建叠加组件** `src/components/graph/NodeOverlay.tsx`
   ```typescript
   export function NodeOverlay({ node, position }: {
     node: GraphNode
     position: { x: number, y: number }
   }) {
     return (
       <div 
         style={{ 
           position: 'absolute', 
           left: position.x, 
           top: position.y,
           pointerEvents: 'none'
         }}
         className="flex flex-col items-center gap-1"
       >
         {/* 动量指示器 */}
         {node.momentum !== undefined && (
           <div className="px-2 py-0.5 rounded bg-black/70 text-white text-xs">
             {node.momentum > 0 ? '↑' : '↓'} {Math.abs(node.momentum)}
           </div>
         )}
         
         {/* 新闻热度气泡 */}
         {node.newsCount7d && node.newsCount7d > 0 && (
           <div className="h-4 w-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">
             {node.newsCount7d}
           </div>
         )}
       </div>
     )
   }
   ```

2. **集成到 ForceGraph**
   - 渲染所有可见节点的叠加层
   - 随节点位置动态更新

3. **添加开关控制**
   - 在工具栏添加"显示叠加信息"复选框
   - 可以选择显示哪些信息（动量、新闻、趋势）

**验收标准**:
- ✅ 节点上显示动量和新闻数
- ✅ 叠加信息随缩放自动调整大小
- ✅ 可以开关叠加层显示

### 5.3 性能优化

**目标**: 确保图谱加载 < 2秒，交互 < 500ms

**优化策略**:

1. **按需优化**
   - 先测试当前性能
   - 如果节点数 < 200，跳过虚拟化
   - 如果节点数 > 200，实施以下优化

2. **前端优化**
   - 使用 `useMemo` 缓存计算结果
   - 防抖筛选操作（300ms debounce）
   - Canvas 渲染替代 SVG（如果节点 > 500）
   - 虚拟化长列表（节点详情列表）

3. **后端优化**
   - 数据库查询添加索引
   - API 响应缓存（5分钟）
   - 路径查询结果缓存（基于源节点+目标节点）

4. **数据加载优化**
   - 首次只加载核心节点（level ≤ 2）
   - 按需加载详细信息
   - 图谱数据增量更新而非全量刷新

**实施步骤**:

1. **添加性能监控**
   ```typescript
   const measurePerformance = (label: string, fn: () => void) => {
     const start = performance.now()
     fn()
     const end = performance.now()
     console.log(`[Performance] ${label}: ${(end - start).toFixed(2)}ms`)
   }
   ```

2. **优化筛选逻辑**
   ```typescript
   const debouncedFilter = useMemo(
     () => debounce((filters: GraphFilters) => {
       measurePerformance('Filter nodes', () => {
         const filtered = filterNodes(nodes, filters)
         setFilteredNodes(filtered)
       })
     }, 300),
     [nodes]
   )
   ```

3. **添加加载状态**
   - 图谱加载时显示骨架屏
   - 路径查询时显示加载指示器

**验收标准**:
- ✅ 图谱首次加载 < 2秒
- ✅ 筛选响应 < 500ms
- ✅ 路径查询 < 1秒
- ✅ 视角切换平滑无卡顿

## 6. 数据库迁移清单

### 6.1 迁移文件

**迁移 1**: `20260730_add_graph_stock.sql`
```sql
-- 创建 GraphStock 表
CREATE TABLE "GraphStock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stockCode" TEXT NOT NULL,
    "stockName" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "relevance" REAL NOT NULL DEFAULT 1.0,
    "category" TEXT,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GraphStock_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "GraphNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 创建索引
CREATE UNIQUE INDEX "GraphStock_stockCode_key" ON "GraphStock"("stockCode");
CREATE INDEX "GraphStock_nodeId_idx" ON "GraphStock"("nodeId");
CREATE INDEX "GraphStock_stockCode_idx" ON "GraphStock"("stockCode");
```

### 6.2 种子数据

**文件**: `prisma/seeds/graph-stock-seed.ts`

包含至少 30 个核心标的映射：
- AI 芯片设计：寒武纪、海光信息
- 晶圆代工：中芯国际
- 封装测试：长电科技、华天科技
- 设备：北方华创、中微公司
- 材料：沪硅产业
- 服务器：浪潮信息、中科曙光
- 光模块：中际旭创、天孚通信
- 等等

## 7. API 端点清单

### 7.1 新增端点

**Phase 3 - 可视化**:
- `POST /api/graph/find-paths` - 路径查询
- `GET /api/graph/views` - 获取视角列表
- `GET /api/graph/views/[id]` - 获取特定视角配置

**Phase 4 - ETF 集成**:
- `GET /api/etf/[ticker]/graph-mapping` - ETF 持仓映射
- `POST /api/etf/graph-analysis` - 图谱视角分析

**Python 数据服务**:
- `GET /etf/{ticker}/holdings` - 获取 ETF 持仓
- `GET /etf/{ticker}/info` - 获取 ETF 基本信息

### 7.2 端点详细设计

#### POST /api/graph/find-paths

**请求**:
```json
{
  "sourceNodeId": "node_123",
  "targetNodeId": "node_456",
  "maxDepth": 4,
  "maxPaths": 10,
  "relationTypes": ["supply_chain", "demand_driver"]
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "sourceNode": {
      "id": "node_123",
      "name": "AI芯片",
      "type": "chip_design"
    },
    "targetNode": {
      "id": "node_456",
      "name": "数据中心",
      "type": "data_center"
    },
    "paths": [
      {
        "nodes": [...],
        "edges": [...],
        "totalWeight": 0.85,
        "totalLag": "3-6个月"
      }
    ]
  }
}
```

#### GET /api/etf/[ticker]/graph-mapping

**响应**:
```json
{
  "success": true,
  "data": {
    "ticker": "512480",
    "nodeExposures": [
      {
        "nodeId": "node_ai_chip",
        "nodeName": "AI芯片",
        "nodeType": "chip_design",
        "exposure": 0.25,
        "stocks": [
          {
            "code": "688256.SH",
            "name": "寒武纪",
            "weight": 0.15
          },
          {
            "code": "688981.SH",
            "name": "海光信息",
            "weight": 0.10
          }
        ]
      }
    ],
    "coverage": 12,
    "totalExposure": 0.78
  }
}
```

#### POST /api/etf/graph-analysis

**请求**:
```json
{
  "ticker": "512480"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "coverage": {
      "totalNodes": 50,
      "coveredNodes": 12,
      "coverageRate": 0.24,
      "uncoveredLevels": ["材料", "封装测试"]
    },
    "cycleRisk": {
      "upturn": 0.45,
      "peak": 0.20,
      "downturn": 0.15,
      "trough": 0.05,
      "riskScore": 35
    },
    "supplyChainBalance": {
      "upstream": 0.30,
      "midstream": 0.50,
      "downstream": 0.20,
      "isBalanced": false
    },
    "momentum": {
      "weightedAverage": 42.5,
      "distribution": {
        "high": 0.30,
        "medium": 0.50,
        "low": 0.20
      }
    },
    "insights": [
      "该ETF重点布局AI芯片设计和服务器环节，产业链覆盖度24%",
      "当前45%仓位处于上升期，整体周期风险中等偏低",
      "持仓集中在产业链中游，上下游布局相对较弱",
      "加权平均动量为42.5，处于中性偏弱区间"
    ]
  }
}
```

## 8. 前端组件清单

### 8.1 新增组件

**Phase 3**:
- `src/components/graph/ViewSwitcher.tsx` - 视角切换器
- `src/components/graph/NodeOverlay.tsx` - 节点信息叠加层
- `src/components/graph/PathSelector.tsx` - 路径选择模式控制器

**Phase 4**:
- `src/components/etf/GraphMapping.tsx` - ETF 持仓映射可视化
- `src/components/etf/GraphAnalysis.tsx` - 图谱视角分析展示
- `src/components/etf/CoverageRadar.tsx` - 产业链覆盖度雷达图
- `src/components/etf/CycleRiskChart.tsx` - 周期风险分布图

### 8.2 修改的组件

- `src/components/graph/force-graph.tsx` - 集成分层布局、高亮路径
- `src/app/(dashboard)/graph/explore/page.tsx` - 集成筛选、路径探索、视角切换
- `src/app/(dashboard)/analysis/page.tsx` - 添加图谱视角 tab

## 9. 服务层清单

### 9.1 新增服务

**Phase 3**:
- `src/lib/services/path-finder.service.ts` - 路径查询服务
- `src/lib/services/graph-view.service.ts` - 视角配置服务

**Phase 4**:
- `src/lib/services/etf-graph-mapper.service.ts` - ETF 持仓映射服务
- `src/lib/services/etf-graph-analyzer.service.ts` - 图谱视角分析服务

**Python 数据服务**:
- `data-service/providers/etf_provider.py` - ETF 数据提供者
- `data-service/routers/etf.py` - ETF 路由

## 10. 测试策略

### 10.1 单元测试

**Phase 3**:
- `path-finder.service.test.ts` - 测试路径查询算法
- `graph-view.service.test.ts` - 测试视角配置

**Phase 4**:
- `etf-graph-mapper.service.test.ts` - 测试持仓映射逻辑
- `etf-graph-analyzer.service.test.ts` - 测试分析算法

### 10.2 集成测试

**Phase 3**:
- 测试从前端选择两个节点到显示路径的完整流程
- 测试视角切换的完整流程
- 测试筛选功能的各种组合

**Phase 4**:
- 测试从输入 ETF 代码到显示图谱分析的完整流程
- 测试 Python 服务和 Next.js 服务的交互

### 10.3 E2E 测试

使用 Playwright 测试关键用户流程：
1. 用户打开图谱页面，切换到热点视图
2. 用户选择两个节点，查看传导路径
3. 用户输入 ETF 代码，查看图谱分析
4. 用户应用多个筛选条件，验证结果正确

## 11. 实施时间表

### Week 1（Day 1-4）: 迭代1 - 核心可视化

**Day 1**:
- ✅ 完善 GraphFilters 组件
- ✅ 集成到主页面
- ✅ 实现筛选逻辑

**Day 2**:
- ✅ 创建 PathFinderService
- ✅ 实现 /api/graph/find-paths 端点
- ✅ 增强 PathExplorer 交互

**Day 3**:
- ✅ 集成 hierarchical-layout 到 ForceGraph
- ✅ 添加布局切换功能
- ✅ 实现路径选择模式

**Day 4**:
- ✅ 创建 ViewSwitcher 组件
- ✅ 实现 2 个基础视角
- ✅ 集成视角切换

### Week 2（Day 5-7）: 迭代2 - ETF 集成

**Day 5**:
- ✅ 创建 GraphStock 数据模型
- ✅ 数据库迁移
- ✅ 编写种子数据

**Day 6**:
- ✅ 扩展 Python 数据服务（ETF 持仓接口）
- ✅ 实现 ETFGraphMapperService
- ✅ 创建 /api/etf/[ticker]/graph-mapping 端点

**Day 7**:
- ✅ 实现 ETFGraphAnalyzerService
- ✅ 创建 /api/etf/graph-analysis 端点
- ✅ 创建前端展示页面

### Week 2（Day 8-9）: 迭代3 - 增强和优化

**Day 8**:
- ✅ 添加剩余 3 个视角
- ✅ 实现 NodeOverlay 组件
- ✅ 集成信息叠加层

**Day 9**:
- ✅ 性能测试和优化
- ✅ 编写单元测试
- ✅ 编写集成测试
- ✅ 文档完善

## 12. 风险与缓解

### 12.1 技术风险

**风险 1**: 路径查询性能问题（节点数多时）
- **缓解**: 限制最大深度为 4，最多返回 10 条路径
- **缓解**: 添加查询结果缓存
- **缓解**: 如果超时，返回部分结果

**风险 2**: ETF 持仓数据获取失败（AKShare 不稳定）
- **缓解**: 添加重试机制（最多 3 次）
- **缓解**: 提供降级方案（使用缓存数据）
- **缓解**: 记录失败日志，手动补数据

**风险 3**: GraphStock 映射不完整
- **缓解**: 优先映射 top 30 核心标的
- **缓解**: 提供 AI 辅助映射功能（Phase 5）
- **缓解**: 显示映射覆盖率，让用户知道分析的局限性

**风险 4**: 前端性能问题（大图谱渲染）
- **缓解**: 按需优化，先测试再决定是否需要虚拟化
- **缓解**: 提供"精简模式"只显示核心节点
- **缓解**: 使用 Canvas 替代 SVG（如果需要）

### 12.2 数据风险

**风险 5**: ETF 持仓数据更新延迟
- **缓解**: 在 UI 显示数据更新时间
- **缓解**: 添加"刷新数据"按钮
- **缓解**: 说明数据可能有延迟

**风险 6**: 图谱节点与实际个股不匹配
- **缓解**: GraphStock 支持多对多关系（一个个股可能属于多个节点）
- **缓解**: 使用 relevance 字段表示关联强度
- **缓解**: 在分析结果中显示映射覆盖度

## 13. 成功指标

### 13.1 功能指标

**Phase 3 - 可视化**:
- ✅ 筛选功能支持 6 种筛选维度
- ✅ 路径查询成功率 > 95%
- ✅ 5 个视角全部可用
- ✅ 信息叠加层正确显示

**Phase 4 - ETF 集成**:
- ✅ GraphStock 表包含 ≥ 30 个核心标的
- ✅ ETF 持仓映射覆盖率 ≥ 60%
- ✅ 图谱分析生成 ≥ 4 条洞察
- ✅ 支持至少 10 个主流 AI 硬件 ETF

### 13.2 性能指标

- ✅ 图谱首次加载 < 2秒
- ✅ 筛选响应 < 500ms
- ✅ 路径查询 < 1秒
- ✅ 视角切换 < 300ms
- ✅ ETF 分析 < 3秒

### 13.3 用户体验指标

- ✅ 图谱页面停留时间增加 > 30%
- ✅ 路径探索功能使用率 > 20%
- ✅ ETF 图谱分析功能使用率 > 15%
- ✅ 用户反馈可用性评分 ≥ 4/5

## 14. 后续扩展方向

### 14.1 短期（Phase 5）

- AI 辅助 GraphStock 映射（自动识别个股归属）
- 时间序列图谱（查看历史版本）
- 图谱对比功能（对比两个时间点的变化）
- 更多 ETF 分析维度（行业集中度、风格因子）

### 14.2 中期（Phase 6）

- 图谱编辑器（可视化编辑节点和边）
- 协作功能（多人同时查看和标注）
- 图谱问答（自然语言查询图谱）
- 移动端适配

### 14.3 长期（Phase 7+）

- 迁移到图数据库（Neo4j）
- 实时图谱更新（基于新闻流）
- 跨市场图谱（A股 + 港股 + 美股）
- 知识推理引擎（自动发现隐含关系）

## 15. 附录

### 15.1 依赖库

**前端**:
- `d3-force` - 力导向布局（已有）
- `recharts` - 图表可视化（已有）
- `lodash.debounce` - 防抖函数

**后端**:
- `prisma` - ORM（已有）
- `@anthropic-ai/sdk` - Claude API（已有）

**Python**:
- `akshare` - 数据源（已有）
- `fastapi` - API 框架（已有）

### 15.2 参考资料

- [D3.js Force Layout](https://d3js.org/d3-force)
- [Graph Theory - Path Finding Algorithms](https://en.wikipedia.org/wiki/Pathfinding)
- [ETF Holdings Data - AKShare](https://akshare.akfamily.xyz/)
- [Hierarchical Layout Algorithms](https://en.wikipedia.org/wiki/Layered_graph_drawing)

---

**设计完成日期**: 2026-07-30  
**预计开发周期**: 7-9天  
**预计人力**: 1名全栈开发  
**状态**: 待审核
