'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ForceGraph, TreeView } from '@/components/graph'
import { GraphFilters } from '@/components/graph/GraphFilters'
import { ViewSwitcher } from '@/components/graph/ViewSwitcher'
import { MarketDataPanel } from '@/components/graph/MarketDataPanel'
import { InvestmentSignals } from '@/components/graph/InvestmentSignals'
import type { GraphNode, GraphEdge } from '@/types/graph'
import type { GraphFilters as GraphFiltersType } from '@/components/graph/GraphFilters'
import type { MarketDataEnhancement } from '@/lib/services/graph-market-data.service'
import {
  GitBranch,
  RefreshCw,
  Search,
  TrendingUp,
  TrendingDown,
  Minus,
  Network,
  List,
  Info,
  Filter,
  BarChart3,
  Newspaper,
  DollarSign,
} from 'lucide-react'

// --------------- 常量 ---------------

const NODE_TYPE_LABELS: Record<string, string> = {
  index: '指数',
  industry_l1: '一级行业',
  industry_l2: '二级行业',
  sub_sector: '细分领域',
  stock: '个股',
  chip_design: '芯片设计',
  wafer_foundry: '晶圆代工',
  packaging: '封装测试',
  equipment: '设备',
  material: '材料',
  eda: 'EDA',
  memory: '存储',
  server: '服务器',
  cooling: '散热',
  power: '电源',
  pcb: 'PCB',
  networking: '网络',
  data_center: '数据中心',
  cloud: '云计算',
  ai_application: 'AI应用',
  terminal_device: '终端设备',
  optical_comm: '光通信',
  cpo: 'CPO',
  optical_module: '光模块',
  policy: '政策',
  macro: '宏观',
  technology: '技术',
  demand: '需求',
}

const NODE_TYPE_COLORS: Record<string, string> = {
  index: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  industry_l1: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  industry_l2: 'bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-200',
  sub_sector: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  stock: 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200',
  chip_design: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  wafer_foundry: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
  packaging: 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900 dark:text-fuchsia-200',
  equipment: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  material: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  eda: 'bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-200',
  memory: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  server: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  cooling: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
  power: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  pcb: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
  networking: 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200',
  data_center: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  cloud: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200',
  ai_application: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
  terminal_device: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  optical_comm: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  cpo: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  optical_module: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  policy: 'bg-stone-100 text-stone-800 dark:bg-stone-900 dark:text-stone-200',
  macro: 'bg-neutral-100 text-neutral-800 dark:bg-neutral-900 dark:text-neutral-200',
  technology: 'bg-zinc-100 text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200',
  demand: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
}

const EDGE_RELATION_LABELS: Record<string, string> = {
  contain: '包含',
  supply_chain: '供应链',
  demand_driver: '需求驱动',
  technology_driver: '技术驱动',
  policy_impact: '政策影响',
  market_correlation: '市场相关',
  competitive: '竞争',
  complementary: '互补',
  upstream: '上游',
  downstream: '下游',
}

// --------------- 树形数据转换 ---------------

interface TreeNode {
  id: string
  name: string
  type: string
  level: number
  description?: string
  momentum?: number
  cyclePos?: string
  children?: TreeNode[]
}

/**
 * 从扁平 nodes + edges 构建树形结构
 */
function buildTreeFromFlat(nodes: GraphNode[], edges: GraphEdge[]): TreeNode[] {
  const nodeMap = new Map<string, TreeNode>()
  nodes.forEach((n) => {
    nodeMap.set(n.id, {
      id: n.id,
      name: n.name,
      type: n.type,
      level: n.level,
      description: n.description,
      momentum: n.momentum,
      cyclePos: n.cyclePos,
      children: [],
    })
  })

  // 通过 parentId 建立层级关系
  const roots: TreeNode[] = []
  nodes.forEach((n) => {
    const treeNode = nodeMap.get(n.id)!
    if (n.parentId && nodeMap.has(n.parentId)) {
      const parent = nodeMap.get(n.parentId)!
      if (!parent.children) parent.children = []
      parent.children.push(treeNode)
    } else if (n.level === 0) {
      roots.push(treeNode)
    }
  })

  // 如果没有 parentId 关系，使用 edge 关系 (contain/supply_chain as hierarchy)
  if (roots.length === 0) {
    const childIds = new Set<string>()
    edges
      .filter((e) => (e.relation === 'contain' || e.relation === 'supply_chain') && e.direction === 'positive')
      .forEach((e) => {
        childIds.add(e.targetId)
        const parent = nodeMap.get(e.sourceId)
        const child = nodeMap.get(e.targetId)
        if (parent && child) {
          if (!parent.children) parent.children = []
          parent.children.push(child)
        }
      })

    nodes.forEach((n) => {
      if (!childIds.has(n.id) && n.level === 0) {
        roots.push(nodeMap.get(n.id)!)
      }
    })
  }

  // 如果还是没有根节点，取 level 最低的
  if (roots.length === 0) {
    const minLevel = Math.min(...nodes.map((n) => n.level))
    nodes
      .filter((n) => n.level === minLevel)
      .forEach((n) => roots.push(nodeMap.get(n.id)!))
  }

  return roots
}

// --------------- 组件 ---------------

export default function GraphExplorePage() {
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [selectedNodeMarketData, setSelectedNodeMarketData] = useState<MarketDataEnhancement | null>(null)
  const [loadingMarketData, setLoadingMarketData] = useState(false)
  const [viewMode, setViewMode] = useState<'force' | 'tree'>('tree')
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [graphDimensions, setGraphDimensions] = useState({ width: 900, height: 600 })
  const graphDimensionsRef = useRef({ width: 900, height: 600 })
  const graphAreaRef = useRef<HTMLDivElement>(null)
  const [filters, setFilters] = useState<GraphFiltersType>({
    nodeTypes: [],
    momentumRange: [-100, 100],
    cyclePositions: [],
    hasRecentNews: false,
    minNewsCount: 0
  })
  const [showFilters, setShowFilters] = useState(false)
  const [currentView, setCurrentView] = useState<string>('panorama')
  const [showMarketData, setShowMarketData] = useState(true)

  // ---------- 节点点击回调（稳定引用） ----------
  // ForceGraph 传入 GraphNode，TreeView 传入 TreeNode（结构兼容，详情面板只读共享字段）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleNodeClick = useCallback(async (node: any) => {
    setSelectedNode(node as GraphNode | null)

    // 加载市场数据
    if (node?.id && showMarketData) {
      setLoadingMarketData(true)
      setSelectedNodeMarketData(null)
      try {
        const response = await fetch(`/api/graph/nodes/${node.id}/market-data`)
        const result = await response.json()
        if (result.success && result.data?.marketData) {
          setSelectedNodeMarketData(result.data.marketData)
        }
      } catch (error) {
        console.error('加载市场数据失败:', error)
      } finally {
        setLoadingMarketData(false)
      }
    }
  }, [showMarketData])

  // ---------- 视角切换逻辑 ----------
  const handleViewChange = useCallback(async (viewId: string) => {
    try {
      const response = await fetch(`/api/graph/views/${viewId}`)
      const result = await response.json()

      if (result.success && result.data) {
        const view = result.data
        setCurrentView(viewId)
        setFilters(view.filters)
        // Map layoutType to viewMode: hierarchical -> tree, force -> force
        setViewMode(view.layoutType === 'hierarchical' ? 'tree' : 'force')
      }
    } catch (error) {
      console.error('切换视角失败:', error)
    }
  }, [])

  // ---------- 数据获取 ----------
  const fetchGraph = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/graph/full')
      if (response.ok) {
        const data = await response.json()
        if (data.success && data.data) {
          setNodes(data.data.nodes || [])
          setEdges(data.data.edges || [])
        }
      }
    } catch (error) {
      console.error('获取图谱数据失败:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchGraph()
  }, [fetchGraph])

  // ---------- 初始化默认视图 ----------
  useEffect(() => {
    // Load the initial view settings
    handleViewChange(currentView)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------- 响应式宽度（跟踪容器宽度，高度固定） ----------
  useEffect(() => {
    const el = graphAreaRef.current
    if (!el) return

    const updateDimensions = () => {
      const rect = el.getBoundingClientRect()
      const w = Math.floor(rect.width)
      const h = 600 // 固定高度

      if (w > 0 && (w !== graphDimensionsRef.current.width || h !== graphDimensionsRef.current.height)) {
        graphDimensionsRef.current = { width: w, height: h }
        setGraphDimensions({ width: w, height: h })
      }
    }

    // 初始化时更新
    updateDimensions()

    const observer = new ResizeObserver(() => updateDimensions())
    observer.observe(el)

    return () => observer.disconnect()
  }, [viewMode, isLoading])

  // ---------- 应用筛选器 ----------
  const filteredNodesByFilter = useMemo(() => {
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
      if (filters.cyclePositions.length > 0 && node.cyclePos && !filters.cyclePositions.includes(node.cyclePos)) {
        return false
      }
      // 有最近新闻筛选
      if (filters.hasRecentNews && (!node.newsCount7d || node.newsCount7d === 0)) {
        return false
      }
      // 最少新闻数筛选
      if (node.newsCount7d !== undefined && node.newsCount7d < filters.minNewsCount) {
        return false
      }
      return true
    })
  }, [nodes, filters])

  // ---------- 组合搜索和筛选 ----------
  const filteredNodes = useMemo(() => {
    return filteredNodesByFilter.filter(n =>
      !searchQuery ||
      n.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (n.description && n.description.toLowerCase().includes(searchQuery.toLowerCase()))
    )
  }, [filteredNodesByFilter, searchQuery])

  const filteredEdges = useMemo(() => {
    const nodeIds = new Set(filteredNodes.map(n => n.id))
    return edges.filter(e => nodeIds.has(e.sourceId) && nodeIds.has(e.targetId))
  }, [edges, filteredNodes])

  // ---------- 树形数据 ----------
  const treeData = useMemo(
    () => buildTreeFromFlat(filteredNodes, filteredEdges),
    [filteredNodes, filteredEdges]
  )

  // ---------- 统计 ----------
  const nodeTypeCounts = nodes.reduce(
    (acc, n) => {
      acc[n.type] = (acc[n.type] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  const edgeRelationCounts = edges.reduce(
    (acc, e) => {
      acc[e.relation] = (acc[e.relation] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  // ---------- 辅助渲染 ----------
  const getCycleBadge = (cyclePos?: string) => {
    if (!cyclePos) return null
    const config: Record<string, { label: string; variant: string }> = {
      upturn: { label: '上升', variant: 'default' },
      peak: { label: '顶部', variant: 'destructive' },
      downturn: { label: '下降', variant: 'secondary' },
      trough: { label: '底部', variant: 'outline' },
    }
    const { label, variant } = config[cyclePos] || { label: cyclePos, variant: 'outline' }
    return <Badge variant={variant as 'default' | 'destructive' | 'secondary' | 'outline'}>{label}</Badge>
  }

  const getMomentumIcon = (momentum?: number) => {
    if (!momentum) return null
    if (momentum > 60) return <TrendingUp className="h-4 w-4 text-green-500" />
    if (momentum < 40) return <TrendingDown className="h-4 w-4 text-red-500" />
    return <Minus className="h-4 w-4 text-gray-500" />
  }

  // 获取关联节点
  const getRelatedNodes = (nodeId: string): GraphNode[] => {
    const relatedIds = edges
      .filter((e) => e.sourceId === nodeId || e.targetId === nodeId)
      .map((e) => (e.sourceId === nodeId ? e.targetId : e.sourceId))
    return nodes.filter((n) => relatedIds.includes(n.id))
  }

  // 获取关联边
  const getNodeEdges = (nodeId: string): GraphEdge[] => {
    return edges.filter((e) => e.sourceId === nodeId || e.targetId === nodeId)
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">知识图谱</h1>
          <p className="text-muted-foreground">
            AI硬件产业链结构化知识图谱 -- 力导向图与树形图可视化
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              <BarChart3 className="mr-1 h-3 w-3" />
              市场数据来源: AKShare (真实数据)
            </Badge>
            <Badge variant="secondary" className="text-xs">
              数据更新: 每日交易日收盘后
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchGraph} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        </div>
      </div>

      {/* 搜索框 */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="搜索节点名称或类型..."
          className="w-full rounded-lg border bg-background py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* 筛选工具栏 */}
      <div className="flex items-center gap-3">
        <ViewSwitcher
          currentView={currentView}
          onViewChange={handleViewChange}
        />
        <Button
          variant={showFilters ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter className="mr-2 h-4 w-4" />
          {showFilters ? '隐藏筛选' : '显示筛选'}
        </Button>
        <Button
          variant={showMarketData ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowMarketData(!showMarketData)}
        >
          <BarChart3 className="mr-2 h-4 w-4" />
          {showMarketData ? '隐藏市场数据' : '显示市场数据'}
        </Button>
        {filteredNodes.length < nodes.length && (
          <span className="text-sm text-muted-foreground">
            已筛选: {filteredNodes.length}/{nodes.length} 节点
          </span>
        )}
      </div>

      {/* 筛选面板 */}
      {showFilters && (
        <GraphFilters
          filters={filters}
          onChange={setFilters}
          onReset={() => setFilters({
            nodeTypes: [],
            momentumRange: [-100, 100],
            cyclePositions: [],
            hasRecentNews: false,
            minNewsCount: 0
          })}
          availableTypes={Array.from(new Set(nodes.map(n => n.type)))}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        {/* 左侧：知识图谱视图 */}
        <div className="space-y-4">
          <Tabs
            value={viewMode}
            onValueChange={(v) => setViewMode(v as 'force' | 'tree')}
          >
            <div className="flex items-center justify-between">
              <TabsList>
                <TabsTrigger value="tree" className="gap-1.5">
                  <List className="h-4 w-4" />
                  树形图
                </TabsTrigger>
                <TabsTrigger value="force" className="gap-1.5">
                  <Network className="h-4 w-4" />
                  力导向图
                </TabsTrigger>
              </TabsList>

              {/* 搜索命中计数 */}
              {searchQuery && (
                <span className="text-xs text-muted-foreground">
                  找到 {filteredNodes.length} 个节点, {filteredEdges.length} 条关系
                </span>
              )}
            </div>

            <TabsContent value="tree">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <List className="h-4 w-4" />
                    树形图 -- 点击节点展开/折叠
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div ref={graphAreaRef} className="min-h-[600px]">
                    {isLoading ? (
                      <div className="flex h-[600px] items-center justify-center">
                        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                      </div>
                    ) : treeData.length === 0 ? (
                      <div className="flex h-[600px] flex-col items-center justify-center text-muted-foreground">
                        <GitBranch className="mb-4 h-12 w-12" />
                        <p>暂无图谱数据</p>
                      </div>
                    ) : (
                      <TreeView
                        data={treeData}
                        width={graphDimensions.width}
                        height={graphDimensions.height}
                        onNodeClick={handleNodeClick}
                        selectedNodeId={selectedNode?.id}
                      />
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="force">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Network className="h-4 w-4" />
                    力导向图 -- 拖拽节点到任意位置、滚轮缩放
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="min-h-[600px]">
                    {isLoading ? (
                      <div className="flex h-[600px] items-center justify-center">
                        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                      </div>
                    ) : filteredNodes.length === 0 ? (
                      <div className="flex h-[600px] flex-col items-center justify-center text-muted-foreground">
                        <GitBranch className="mb-4 h-12 w-12" />
                        <p>暂无图谱数据</p>
                      </div>
                    ) : (
                      <ForceGraph
                        nodes={filteredNodes}
                        edges={filteredEdges}
                        width={graphDimensions.width}
                        height={graphDimensions.height}
                        onNodeClick={handleNodeClick}
                        selectedNodeId={selectedNode?.id}
                      />
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* 右侧：节点详情和市场数据 */}
        <div className="space-y-4">
          {selectedNode ? (
            <>
              {/* 第一行：基本信息和关联节点 */}
              <div className="grid gap-4 grid-cols-2">
                {/* 左侧：基本信息和关联关系 */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Info className="h-4 w-4" />
                      节点详情
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* 名称和类型 */}
                    <div>
                      <h3 className="text-base font-bold">{selectedNode.name}</h3>
                      {NODE_TYPE_LABELS[selectedNode.type] && (
                        <Badge
                          className={NODE_TYPE_COLORS[selectedNode.type] || 'bg-gray-100 text-gray-800'}
                        >
                          {NODE_TYPE_LABELS[selectedNode.type]}
                        </Badge>
                      )}
                    </div>

                    {/* 描述 */}
                    {selectedNode.description && (
                      <p className="text-xs text-muted-foreground">{selectedNode.description}</p>
                    )}

                    {/* 基本属性 */}
                    <div className="space-y-2 rounded-lg border p-2">
                      <h4 className="text-xs font-semibold text-muted-foreground">基本属性</h4>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">层级</span>
                        <span className="text-xs font-medium">{selectedNode.level}</span>
                      </div>

                      {selectedNode.cyclePos && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">周期</span>
                          {getCycleBadge(selectedNode.cyclePos)}
                        </div>
                      )}

                      {selectedNode.momentum !== undefined && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">动量</span>
                          <div className="flex items-center gap-1">
                            {getMomentumIcon(selectedNode.momentum)}
                            <span className="text-xs font-medium">{selectedNode.momentum}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 关联关系 */}
                    <div>
                      <h4 className="mb-1.5 text-xs font-semibold text-muted-foreground">
                        关联关系 ({getNodeEdges(selectedNode.id).length})
                      </h4>
                      <div className="max-h-24 space-y-0.5 overflow-y-auto">
                        {getNodeEdges(selectedNode.id).slice(0, 5).map((edge) => {
                          const relatedId =
                            edge.sourceId === selectedNode.id ? edge.targetId : edge.sourceId
                          const relatedNode = nodes.find((n) => n.id === relatedId)
                          const isOutgoing = edge.sourceId === selectedNode.id
                          const relationLabel = EDGE_RELATION_LABELS[edge.relation]
                          return (
                            <div
                              key={edge.id}
                              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs hover:bg-muted"
                            >
                              <span className={isOutgoing ? 'text-green-500' : 'text-blue-500'}>
                                {isOutgoing ? '→' : '←'}
                              </span>
                              <span className="font-medium truncate flex-1 text-[11px]">{relatedNode?.name || relatedId}</span>
                              {relationLabel && (
                                <span className="text-muted-foreground text-[10px]">{relationLabel}</span>
                              )}
                            </div>
                          )
                        })}
                        {getNodeEdges(selectedNode.id).length > 5 && (
                          <div className="text-[10px] text-muted-foreground text-center pt-0.5">
                            +{getNodeEdges(selectedNode.id).length - 5} 更多
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* 右侧：关联节点 */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Network className="h-4 w-4" />
                      关联节点
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div>
                      <h4 className="mb-1.5 text-xs font-semibold text-muted-foreground">
                        关联节点 ({getRelatedNodes(selectedNode.id).length})
                      </h4>
                      <div className="max-h-96 space-y-0.5 overflow-y-auto">
                        {getRelatedNodes(selectedNode.id).slice(0, 20).map((related) => (
                          <div
                            key={related.id}
                            className="flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-muted"
                            onClick={() => setSelectedNode(related)}
                          >
                            {NODE_TYPE_LABELS[related.type] && (
                              <Badge
                                variant="outline"
                                className="text-[9px] px-1 py-0"
                              >
                                {NODE_TYPE_LABELS[related.type]}
                              </Badge>
                            )}
                            <span className="text-[11px] truncate">{related.name}</span>
                          </div>
                        ))}
                        {getRelatedNodes(selectedNode.id).length > 20 && (
                          <div className="text-[10px] text-muted-foreground text-center pt-0.5">
                            +{getRelatedNodes(selectedNode.id).length - 20} 更多
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* 第二行：新闻热度和投资参考 */}
              <div className="grid gap-4 lg:grid-cols-2">
                {/* 左侧：新闻热度 */}
                {showMarketData && !loadingMarketData && selectedNodeMarketData?.newsHeat && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Newspaper className="h-4 w-4" />
                        新闻热度
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="text-xs">
                          <span className="text-muted-foreground block mb-1">7日新闻</span>
                          <span className="text-lg font-bold">{selectedNodeMarketData.newsHeat.count7d}</span>
                          {selectedNodeMarketData.newsHeat.trending && (
                            <Badge variant="destructive" className="ml-2 text-xs">热点</Badge>
                          )}
                        </div>
                        <div className="text-xs">
                          <span className="text-muted-foreground block mb-1">30日新闻</span>
                          <span className="text-lg font-bold">{selectedNodeMarketData.newsHeat.count30d}</span>
                        </div>
                      </div>
                      {selectedNodeMarketData.newsHeat.sentimentLabel && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">市场情绪</span>
                          <Badge variant={
                            selectedNodeMarketData.newsHeat.sentimentLabel === 'bullish' ? 'default' :
                            selectedNodeMarketData.newsHeat.sentimentLabel === 'bearish' ? 'destructive' : 'secondary'
                          }>
                            {selectedNodeMarketData.newsHeat.sentimentLabel === 'bullish' ? '看多' :
                             selectedNodeMarketData.newsHeat.sentimentLabel === 'bearish' ? '看空' : '中性'}
                          </Badge>
                        </div>
                      )}
                      {selectedNodeMarketData.newsHeat.topKeywords && selectedNodeMarketData.newsHeat.topKeywords.length > 0 && (
                        <div className="text-xs">
                          <span className="text-muted-foreground block mb-1">热词</span>
                          <div className="flex flex-wrap gap-1">
                            {selectedNodeMarketData.newsHeat.topKeywords.map((kw, i) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                {kw}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* 右侧：投资参考 */}
                {showMarketData && !loadingMarketData && selectedNodeMarketData && (
                  <InvestmentSignals
                    marketData={selectedNodeMarketData}
                    nodeType={selectedNode.type}
                    nodeName={selectedNode.name}
                  />
                )}
              </div>

              {/* 第三行：行业指数和ETF */}
              {showMarketData && !loadingMarketData && selectedNodeMarketData && (
                <div className="grid gap-4 lg:grid-cols-2">
                  {/* 左侧：行业指数 */}
                  {selectedNodeMarketData.indexPerformance && (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <BarChart3 className="h-4 w-4" />
                          行业指数表现
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">
                            {selectedNodeMarketData.indexPerformance.name}
                          </p>
                          <div className="grid grid-cols-3 gap-2 text-xs">
                            <div>
                              <span className="text-muted-foreground block mb-1">1日</span>
                              {selectedNodeMarketData.indexPerformance.changePct1d !== undefined && (
                                selectedNodeMarketData.indexPerformance.changePct1d > 0 ? (
                                  <span className="text-green-600 flex items-center gap-1">
                                    <TrendingUp className="h-3 w-3" />
                                    +{selectedNodeMarketData.indexPerformance.changePct1d.toFixed(2)}%
                                  </span>
                                ) : selectedNodeMarketData.indexPerformance.changePct1d < 0 ? (
                                  <span className="text-red-600 flex items-center gap-1">
                                    <TrendingDown className="h-3 w-3" />
                                    {selectedNodeMarketData.indexPerformance.changePct1d.toFixed(2)}%
                                  </span>
                                ) : (
                                  <span className="text-gray-600 flex items-center gap-1">
                                    <Minus className="h-3 w-3" />
                                    0.00%
                                  </span>
                                )
                              )}
                            </div>
                            <div>
                              <span className="text-muted-foreground block mb-1">5日</span>
                              {selectedNodeMarketData.indexPerformance.changePct5d !== undefined && (
                                selectedNodeMarketData.indexPerformance.changePct5d > 0 ? (
                                  <span className="text-green-600 flex items-center gap-1">
                                    <TrendingUp className="h-3 w-3" />
                                    +{selectedNodeMarketData.indexPerformance.changePct5d.toFixed(2)}%
                                  </span>
                                ) : selectedNodeMarketData.indexPerformance.changePct5d < 0 ? (
                                  <span className="text-red-600 flex items-center gap-1">
                                    <TrendingDown className="h-3 w-3" />
                                    {selectedNodeMarketData.indexPerformance.changePct5d.toFixed(2)}%
                                  </span>
                                ) : (
                                  <span className="text-gray-600 flex items-center gap-1">
                                    <Minus className="h-3 w-3" />
                                    0.00%
                                  </span>
                                )
                              )}
                            </div>
                            <div>
                              <span className="text-muted-foreground block mb-1">30日</span>
                              {selectedNodeMarketData.indexPerformance.changePct30d !== undefined && (
                                selectedNodeMarketData.indexPerformance.changePct30d > 0 ? (
                                  <span className="text-green-600 flex items-center gap-1">
                                    <TrendingUp className="h-3 w-3" />
                                    +{selectedNodeMarketData.indexPerformance.changePct30d.toFixed(2)}%
                                  </span>
                                ) : selectedNodeMarketData.indexPerformance.changePct30d < 0 ? (
                                  <span className="text-red-600 flex items-center gap-1">
                                    <TrendingDown className="h-3 w-3" />
                                    {selectedNodeMarketData.indexPerformance.changePct30d.toFixed(2)}%
                                  </span>
                                ) : (
                                  <span className="text-gray-600 flex items-center gap-1">
                                    <Minus className="h-3 w-3" />
                                    0.00%
                                  </span>
                                )
                              )}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* 右侧：ETF跟踪 */}
                  {selectedNodeMarketData.etfTracking && selectedNodeMarketData.etfTracking.length > 0 && (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <DollarSign className="h-4 w-4" />
                          跟踪ETF ({selectedNodeMarketData.etfTracking.length})
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {selectedNodeMarketData.etfTracking.slice(0, 3).map((etf) => (
                          <div key={etf.ticker} className="rounded-lg border p-2">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium">{etf.name}</span>
                              <span className="text-xs text-muted-foreground">{etf.ticker}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">5日涨跌</span>
                              {etf.changePct5d !== undefined && (
                                etf.changePct5d > 0 ? (
                                  <span className="text-green-600 flex items-center gap-1">
                                    <TrendingUp className="h-3 w-3" />
                                    +{etf.changePct5d.toFixed(2)}%
                                  </span>
                                ) : etf.changePct5d < 0 ? (
                                  <span className="text-red-600 flex items-center gap-1">
                                    <TrendingDown className="h-3 w-3" />
                                    {etf.changePct5d.toFixed(2)}%
                                  </span>
                                ) : (
                                  <span className="text-gray-600 flex items-center gap-1">
                                    <Minus className="h-3 w-3" />
                                    0.00%
                                  </span>
                                )
                              )}
                            </div>
                            {etf.premium !== undefined && (
                              <div className="flex items-center justify-between text-xs mt-1">
                                <span className="text-muted-foreground">溢折价率</span>
                                <span className={etf.premium > 0 ? 'text-red-600' : 'text-green-600'}>
                                  {etf.premium > 0 ? '+' : ''}{etf.premium.toFixed(2)}%
                                </span>
                              </div>
                            )}
                            {etf.inflow5d !== undefined && (
                              <div className="flex items-center justify-between text-xs mt-1">
                                <span className="text-muted-foreground">5日资金流入</span>
                                <span className={etf.inflow5d > 0 ? 'text-green-600' : 'text-red-600'}>
                                  {etf.inflow5d > 0 ? '+' : ''}{etf.inflow5d.toFixed(2)}亿
                                </span>
                              </div>
                            )}
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <GitBranch className="mb-4 h-16 w-16" />
                  <p className="text-base">点击图谱中的节点查看详情</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
