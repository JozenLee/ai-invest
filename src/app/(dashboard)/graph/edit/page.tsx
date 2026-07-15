'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { GraphNode, GraphEdge } from '@/types/graph'
import {
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Search,
  Save,
  X,
  ArrowRight,
  Network,
  Link,
} from 'lucide-react'

// --------------- 常量 ---------------

const NODE_TYPES = [
  { value: 'index', label: '指数' },
  { value: 'industry_l1', label: '一级行业' },
  { value: 'industry_l2', label: '二级行业' },
  { value: 'sub_sector', label: '细分领域' },
  { value: 'stock', label: '个股' },
  { value: 'chip_design', label: '芯片设计' },
  { value: 'wafer_foundry', label: '晶圆代工' },
  { value: 'packaging', label: '封装测试' },
  { value: 'equipment', label: '设备' },
  { value: 'material', label: '材料' },
  { value: 'eda', label: 'EDA' },
  { value: 'memory', label: '存储' },
  { value: 'server', label: '服务器' },
  { value: 'cooling', label: '散热' },
  { value: 'power', label: '电源' },
  { value: 'pcb', label: 'PCB' },
  { value: 'networking', label: '网络' },
  { value: 'data_center', label: '数据中心' },
  { value: 'cloud', label: '云计算' },
  { value: 'ai_application', label: 'AI应用' },
  { value: 'terminal_device', label: '终端设备' },
  { value: 'optical_comm', label: '光通信' },
  { value: 'cpo', label: 'CPO' },
  { value: 'optical_module', label: '光模块' },
  { value: 'policy', label: '政策' },
  { value: 'macro', label: '宏观' },
  { value: 'technology', label: '技术' },
  { value: 'demand', label: '需求' },
]

const RELATION_TYPES = [
  { value: 'supply_chain', label: '供应链' },
  { value: 'demand_driver', label: '需求驱动' },
  { value: 'competition', label: '竞争' },
  { value: 'complement', label: '互补' },
  { value: 'policy_impact', label: '政策影响' },
  { value: 'tech_enable', label: '技术赋能' },
  { value: 'tech_evolution', label: '技术演进' },
  { value: 'cost_pressure', label: '成本压力' },
  { value: 'substitution', label: '替代' },
  { value: 'capital_cycle', label: '资本周期' },
  { value: 'contain', label: '包含' },
  { value: 'support', label: '支撑' },
]

const NODE_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  NODE_TYPES.map((t) => [t.value, t.label])
)

// --------------- 类型 ---------------

interface NodeFormData {
  name: string
  type: string
  level: number
  description: string
  parentId: string
  cyclePos: string
  momentum: string
}

interface EdgeFormData {
  sourceId: string
  targetId: string
  relation: string
  weight: number
  direction: string
  confidence: number
  description: string
}

const EMPTY_NODE_FORM: NodeFormData = {
  name: '',
  type: 'sub_sector',
  level: 2,
  description: '',
  parentId: '',
  cyclePos: '',
  momentum: '',
}

const EMPTY_EDGE_FORM: EdgeFormData = {
  sourceId: '',
  targetId: '',
  relation: 'supply_chain',
  weight: 0.5,
  direction: 'positive',
  confidence: 0.5,
  description: '',
}

// --------------- 组件 ---------------

export default function GraphEditPage() {
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  // 节点编辑状态
  const [nodeDialogOpen, setNodeDialogOpen] = useState(false)
  const [editingNode, setEditingNode] = useState<GraphNode | null>(null)
  const [nodeForm, setNodeForm] = useState<NodeFormData>(EMPTY_NODE_FORM)
  const [deleteNodeConfirm, setDeleteNodeConfirm] = useState<GraphNode | null>(null)

  // 边编辑状态
  const [edgeDialogOpen, setEdgeDialogOpen] = useState(false)
  const [editingEdge, setEditingEdge] = useState<GraphEdge | null>(null)
  const [edgeForm, setEdgeForm] = useState<EdgeFormData>(EMPTY_EDGE_FORM)
  const [deleteEdgeConfirm, setDeleteEdgeConfirm] = useState<GraphEdge | null>(null)

  const [saving, setSaving] = useState(false)

  // ---------- 数据获取 ----------
  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [nodesRes, edgesRes] = await Promise.all([
        fetch('/api/graph/nodes'),
        fetch('/api/graph/edges'),
      ])

      if (nodesRes.ok) {
        const data = await nodesRes.json()
        if (data.success && data.data) setNodes(data.data)
      }

      if (edgesRes.ok) {
        const data = await edgesRes.json()
        if (data.success && data.data) setEdges(data.data)
      }
    } catch (error) {
      console.error('获取图谱数据失败:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ---------- 过滤 ----------
  const filteredNodes = useMemo(
    () =>
      searchQuery
        ? nodes.filter(
            (n) =>
              n.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
              n.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
              (n.description && n.description.toLowerCase().includes(searchQuery.toLowerCase()))
          )
        : nodes,
    [nodes, searchQuery]
  )

  const filteredEdges = useMemo(() => {
    if (!searchQuery) return edges
    return edges.filter((e) => {
      const sourceName = nodes.find((n) => n.id === e.sourceId)?.name || ''
      const targetName = nodes.find((n) => n.id === e.targetId)?.name || ''
      const query = searchQuery.toLowerCase()
      return (
        sourceName.toLowerCase().includes(query) ||
        targetName.toLowerCase().includes(query) ||
        e.relation.toLowerCase().includes(query)
      )
    })
  }, [edges, searchQuery, nodes])

  // ---------- 节点操作 ----------
  const openCreateNode = () => {
    setEditingNode(null)
    setNodeForm(EMPTY_NODE_FORM)
    setNodeDialogOpen(true)
  }

  const openEditNode = (node: GraphNode) => {
    setEditingNode(node)
    setNodeForm({
      name: node.name,
      type: node.type,
      level: node.level,
      description: node.description || '',
      parentId: node.parentId || '',
      cyclePos: node.cyclePos || '',
      momentum: node.momentum !== undefined ? String(node.momentum) : '',
    })
    setNodeDialogOpen(true)
  }

  const saveNode = async () => {
    setSaving(true)
    try {
      const body: any = {
        name: nodeForm.name,
        type: nodeForm.type,
        level: nodeForm.level,
        description: nodeForm.description || undefined,
        parentId: nodeForm.parentId || undefined,
        cyclePos: nodeForm.cyclePos || undefined,
        momentum: nodeForm.momentum ? parseFloat(nodeForm.momentum) : undefined,
      }

      const url = editingNode ? `/api/graph/nodes/${editingNode.id}` : '/api/graph/nodes'
      const method = editingNode ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        setNodeDialogOpen(false)
        fetchData()
      } else {
        const err = await res.json()
        alert(err.error || '操作失败')
      }
    } catch (error) {
      console.error('保存节点失败:', error)
      alert('网络错误')
    } finally {
      setSaving(false)
    }
  }

  const deleteNode = async (node: GraphNode) => {
    try {
      const res = await fetch(`/api/graph/nodes/${node.id}`, { method: 'DELETE' })
      if (res.ok) {
        setDeleteNodeConfirm(null)
        fetchData()
      }
    } catch (error) {
      console.error('删除节点失败:', error)
    }
  }

  // ---------- 边操作 ----------
  const openCreateEdge = () => {
    setEditingEdge(null)
    setEdgeForm(EMPTY_EDGE_FORM)
    setEdgeDialogOpen(true)
  }

  const openEditEdge = (edge: GraphEdge) => {
    setEditingEdge(edge)
    setEdgeForm({
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      relation: edge.relation,
      weight: edge.weight,
      direction: edge.direction,
      confidence: edge.confidence,
      description: edge.description || '',
    })
    setEdgeDialogOpen(true)
  }

  const saveEdge = async () => {
    setSaving(true)
    try {
      const body = { ...edgeForm }

      let url: string
      let method: string

      if (editingEdge) {
        url = `/api/graph/edges/${editingEdge.id}`
        method = 'PUT'
      } else {
        url = '/api/graph/edges'
        method = 'POST'
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        setEdgeDialogOpen(false)
        fetchData()
      } else {
        const err = await res.json()
        alert(err.error || '操作失败')
      }
    } catch (error) {
      console.error('保存边失败:', error)
      alert('网络错误')
    } finally {
      setSaving(false)
    }
  }

  const deleteEdge = async (edge: GraphEdge) => {
    try {
      const res = await fetch(`/api/graph/edges/${edge.id}`, { method: 'DELETE' })
      if (res.ok) {
        setDeleteEdgeConfirm(null)
        fetchData()
      }
    } catch (error) {
      console.error('删除边失败:', error)
    }
  }

  // ---------- 辅助 ----------
  const getNodeName = (id: string) => nodes.find((n) => n.id === id)?.name || id

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">图谱编辑</h1>
          <p className="text-muted-foreground">
            手动编辑知识图谱的节点和关系
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={isLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      {/* 搜索框 */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="搜索节点名称、类型或关系..."
          className="pl-10"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* 统计概览 */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <Network className="h-8 w-8 text-blue-500" />
            <div>
              <p className="text-2xl font-bold">{nodes.length}</p>
              <p className="text-xs text-muted-foreground">节点总数</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <Link className="h-8 w-8 text-green-500" />
            <div>
              <p className="text-2xl font-bold">{edges.length}</p>
              <p className="text-xs text-muted-foreground">关系总数</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <Pencil className="h-8 w-8 text-purple-500" />
            <div>
              <p className="text-2xl font-bold">{filteredNodes.length + filteredEdges.length}</p>
              <p className="text-xs text-muted-foreground">当前显示</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 主内容 */}
      <Tabs defaultValue="nodes">
        <TabsList>
          <TabsTrigger value="nodes" className="gap-1.5">
            <Network className="h-4 w-4" />
            节点管理
          </TabsTrigger>
          <TabsTrigger value="edges" className="gap-1.5">
            <Link className="h-4 w-4" />
            关系管理
          </TabsTrigger>
        </TabsList>

        {/* ===== 节点管理 ===== */}
        <TabsContent value="nodes">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>节点列表</CardTitle>
              <Button size="sm" onClick={openCreateNode}>
                <Plus className="mr-1.5 h-4 w-4" />
                添加节点
              </Button>
            </CardHeader>
            <CardContent>
              {filteredNodes.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>名称</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead className="text-center">层级</TableHead>
                      <TableHead>描述</TableHead>
                      <TableHead>周期</TableHead>
                      <TableHead className="text-center">动量</TableHead>
                      <TableHead className="w-24 text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredNodes.map((node) => (
                      <TableRow key={node.id}>
                        <TableCell className="font-medium">{node.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {NODE_TYPE_LABELS[node.type] || node.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">L{node.level}</TableCell>
                        <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                          {node.description || '-'}
                        </TableCell>
                        <TableCell className="text-sm">{node.cyclePos || '-'}</TableCell>
                        <TableCell className="text-center">
                          {node.momentum !== undefined ? node.momentum : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEditNode(node)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => setDeleteNodeConfirm(node)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Network className="mb-4 h-12 w-12" />
                  <p>{isLoading ? '加载中...' : '暂无节点数据'}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== 关系管理 ===== */}
        <TabsContent value="edges">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>关系列表</CardTitle>
              <Button size="sm" onClick={openCreateEdge}>
                <Plus className="mr-1.5 h-4 w-4" />
                添加关系
              </Button>
            </CardHeader>
            <CardContent>
              {filteredEdges.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>源节点</TableHead>
                      <TableHead></TableHead>
                      <TableHead>目标节点</TableHead>
                      <TableHead>关系类型</TableHead>
                      <TableHead className="text-center">权重</TableHead>
                      <TableHead className="text-center">方向</TableHead>
                      <TableHead className="text-center">置信度</TableHead>
                      <TableHead className="w-24 text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEdges.map((edge) => (
                      <TableRow key={edge.id}>
                        <TableCell className="font-medium">
                          {getNodeName(edge.sourceId)}
                        </TableCell>
                        <TableCell className="text-center">
                          <ArrowRight className="inline h-4 w-4 text-muted-foreground" />
                        </TableCell>
                        <TableCell className="font-medium">
                          {getNodeName(edge.targetId)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">
                            {RELATION_TYPES.find((r) => r.value === edge.relation)?.label || edge.relation}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">{edge.weight.toFixed(2)}</TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant={edge.direction === 'positive' ? 'default' : 'destructive'}
                            className="text-xs"
                          >
                            {edge.direction === 'positive' ? '正向' : '负向'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">{(edge.confidence * 100).toFixed(0)}%</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEditEdge(edge)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => setDeleteEdgeConfirm(edge)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Link className="mb-4 h-12 w-12" />
                  <p>{isLoading ? '加载中...' : '暂无关系数据'}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ===== 节点编辑对话框 ===== */}
      <Dialog open={nodeDialogOpen} onOpenChange={setNodeDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingNode ? '编辑节点' : '添加节点'}</DialogTitle>
            <DialogDescription>
              {editingNode ? '修改节点信息' : '创建新的图谱节点'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="node-name">名称 *</Label>
              <Input
                id="node-name"
                value={nodeForm.name}
                onChange={(e) => setNodeForm({ ...nodeForm, name: e.target.value })}
                placeholder="节点名称"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>类型 *</Label>
                <Select
                  value={nodeForm.type}
                  onValueChange={(v) => setNodeForm({ ...nodeForm, type: v ?? '' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NODE_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="node-level">层级</Label>
                <Input
                  id="node-level"
                  type="number"
                  min={0}
                  max={4}
                  value={nodeForm.level}
                  onChange={(e) => setNodeForm({ ...nodeForm, level: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>父节点</Label>
              <Select
                value={nodeForm.parentId || '__none__'}
                onValueChange={(v) => setNodeForm({ ...nodeForm, parentId: (v === '__none__' || !v) ? '' : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="无（顶级节点）" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">无（顶级节点）</SelectItem>
                  {nodes
                    .filter((n) => n.id !== editingNode?.id)
                    .map((n) => (
                      <SelectItem key={n.id} value={n.id}>
                        {n.name} ({NODE_TYPE_LABELS[n.type] || n.type})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="node-desc">描述</Label>
              <Textarea
                id="node-desc"
                value={nodeForm.description}
                onChange={(e) => setNodeForm({ ...nodeForm, description: e.target.value })}
                placeholder="节点描述..."
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>周期位置</Label>
                <Select
                  value={nodeForm.cyclePos || '__none__'}
                  onValueChange={(v) => setNodeForm({ ...nodeForm, cyclePos: (v === '__none__' || !v) ? '' : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="未设置" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">未设置</SelectItem>
                    <SelectItem value="upturn">上升</SelectItem>
                    <SelectItem value="peak">顶部</SelectItem>
                    <SelectItem value="downturn">下降</SelectItem>
                    <SelectItem value="trough">底部</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="node-momentum">动量 (-100~100)</Label>
                <Input
                  id="node-momentum"
                  type="number"
                  min={-100}
                  max={100}
                  value={nodeForm.momentum}
                  onChange={(e) => setNodeForm({ ...nodeForm, momentum: e.target.value })}
                  placeholder="未设置"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNodeDialogOpen(false)}>
              <X className="mr-1.5 h-4 w-4" />
              取消
            </Button>
            <Button onClick={saveNode} disabled={saving || !nodeForm.name}>
              <Save className="mr-1.5 h-4 w-4" />
              {saving ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== 边编辑对话框 ===== */}
      <Dialog open={edgeDialogOpen} onOpenChange={setEdgeDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingEdge ? '编辑关系' : '添加关系'}</DialogTitle>
            <DialogDescription>
              {editingEdge ? '修改关系属性' : '创建新的节点关系'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>源节点 *</Label>
                <Select
                  value={edgeForm.sourceId}
                  onValueChange={(v) => setEdgeForm({ ...edgeForm, sourceId: v ?? '' })}
                  disabled={!!editingEdge}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择源节点" />
                  </SelectTrigger>
                  <SelectContent>
                    {nodes.map((n) => (
                      <SelectItem key={n.id} value={n.id}>
                        {n.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>目标节点 *</Label>
                <Select
                  value={edgeForm.targetId}
                  onValueChange={(v) => setEdgeForm({ ...edgeForm, targetId: v ?? '' })}
                  disabled={!!editingEdge}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择目标节点" />
                  </SelectTrigger>
                  <SelectContent>
                    {nodes.map((n) => (
                      <SelectItem key={n.id} value={n.id}>
                        {n.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>关系类型 *</Label>
                <Select
                  value={edgeForm.relation}
                  onValueChange={(v) => setEdgeForm({ ...edgeForm, relation: v ?? '' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RELATION_TYPES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>方向</Label>
                <Select
                  value={edgeForm.direction}
                  onValueChange={(v) => setEdgeForm({ ...edgeForm, direction: v ?? 'positive' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="positive">正向</SelectItem>
                    <SelectItem value="negative">负向</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edge-weight">权重 (0~1)</Label>
                <Input
                  id="edge-weight"
                  type="number"
                  min={0}
                  max={1}
                  step={0.1}
                  value={edgeForm.weight}
                  onChange={(e) => setEdgeForm({ ...edgeForm, weight: parseFloat(e.target.value) || 0 })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edge-confidence">置信度 (0~1)</Label>
                <Input
                  id="edge-confidence"
                  type="number"
                  min={0}
                  max={1}
                  step={0.1}
                  value={edgeForm.confidence}
                  onChange={(e) => setEdgeForm({ ...edgeForm, confidence: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edge-desc">描述</Label>
              <Textarea
                id="edge-desc"
                value={edgeForm.description}
                onChange={(e) => setEdgeForm({ ...edgeForm, description: e.target.value })}
                placeholder="关系描述..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEdgeDialogOpen(false)}>
              <X className="mr-1.5 h-4 w-4" />
              取消
            </Button>
            <Button
              onClick={saveEdge}
              disabled={saving || !edgeForm.sourceId || !edgeForm.targetId}
            >
              <Save className="mr-1.5 h-4 w-4" />
              {saving ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== 删除节点确认 ===== */}
      <Dialog open={!!deleteNodeConfirm} onOpenChange={() => setDeleteNodeConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除节点</DialogTitle>
            <DialogDescription>
              确定要删除节点「{deleteNodeConfirm?.name}」吗？该操作会同时删除所有关联的关系，且不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteNodeConfirm(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteNodeConfirm && deleteNode(deleteNodeConfirm)}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== 删除边确认 ===== */}
      <Dialog open={!!deleteEdgeConfirm} onOpenChange={() => setDeleteEdgeConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除关系</DialogTitle>
            <DialogDescription>
              确定要删除「{deleteEdgeConfirm && getNodeName(deleteEdgeConfirm.sourceId)}
              → {deleteEdgeConfirm && getNodeName(deleteEdgeConfirm.targetId)}」的关系吗？不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteEdgeConfirm(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteEdgeConfirm && deleteEdge(deleteEdgeConfirm)}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
