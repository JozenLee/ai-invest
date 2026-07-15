'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import * as d3 from 'd3'
import type { GraphNode, GraphEdge } from '@/types/graph'

// --------------- 类型定义 ---------------

interface D3Node extends d3.SimulationNodeDatum {
  id: string
  name: string
  type: string
  level: number
  momentum?: number
  cyclePos?: string
  description?: string
  x?: number
  y?: number
  fx?: number | null
  fy?: number | null
}

interface D3Link extends d3.SimulationLinkDatum<D3Node> {
  id: string
  relation: string
  weight: number
  direction: string
  description?: string
  confidence: number
}

export interface ForceGraphProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
  width?: number
  height?: number
  onNodeClick?: (node: GraphNode) => void
  selectedNodeId?: string | null
  className?: string
}

// --------------- 颜色映射 ---------------

const NODE_COLORS: Record<string, string> = {
  // 层级
  index: '#3b82f6',
  industry_l1: '#22c55e',
  industry_l2: '#84cc16',
  sub_sector: '#a855f7',
  stock: '#64748b',
  // 产业链
  chip_design: '#ef4444',
  wafer_foundry: '#f97316',
  packaging: '#f59e0b',
  equipment: '#eab308',
  material: '#d97706',
  eda: '#b45309',
  memory: '#fb923c',
  server: '#06b6d4',
  cooling: '#14b8a6',
  power: '#10b981',
  pcb: '#6b7280',
  networking: '#8b5cf6',
  data_center: '#7c3aed',
  cloud: '#6366f1',
  ai_application: '#ec4899',
  terminal_device: '#f43f5e',
  optical_comm: '#0ea5e9',
  cpo: '#2563eb',
  optical_module: '#1d4ed8',
  // 外部驱动
  policy: '#a3a3a3',
  macro: '#78716c',
  technology: '#d6d3d1',
  demand: '#fef08a',
}

const DEFAULT_NODE_COLOR = '#94a3b8'

// 节点类型中文标签
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

// 边关系中文标签
const EDGE_RELATION_LABELS: Record<string, string> = {
  supply_chain: '供应链',
  demand_driver: '需求驱动',
  competition: '竞争',
  complement: '互补',
  policy_impact: '政策影响',
  tech_enable: '技术赋能',
  tech_evolution: '技术演进',
  cost_pressure: '成本压力',
  substitution: '替代',
  capital_cycle: '资本周期',
  contain: '包含',
  support: '支撑',
}

// --------------- 辅助函数 ---------------

function getNodeColor(type: string): string {
  return NODE_COLORS[type] || DEFAULT_NODE_COLOR
}

function getNodeRadius(level: number): number {
  // 层级越高(数字越小)节点越大
  const base = [24, 18, 14, 12, 10]
  return base[Math.min(level, base.length - 1)] || 10
}

function getEdgeColor(direction: string): string {
  return direction === 'positive' ? '#22c55e' : '#ef4444'
}

// --------------- 组件 ---------------

export function ForceGraph({
  nodes: rawNodes,
  edges: rawEdges,
  width = 900,
  height = 600,
  onNodeClick,
  selectedNodeId,
  className,
}: ForceGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const simulationRef = useRef<d3.Simulation<D3Node, D3Link> | null>(null)
  const containerRef = useRef<SVGGElement>(null)
  const [hoveredNode, setHoveredNode] = useState<D3Node | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })

  // 用 ref 持有最新回调，避免回调引用变化触发 D3 重建
  const onNodeClickRef = useRef(onNodeClick)
  onNodeClickRef.current = onNodeClick

  // 将原始数据转换为 D3 数据
  const transformData = useCallback(() => {
    const nodeMap = new Map<string, D3Node>()
    const d3Nodes: D3Node[] = rawNodes.map((n) => {
      const d3Node: D3Node = {
        id: n.id,
        name: n.name,
        type: n.type,
        level: n.level,
        momentum: n.momentum,
        cyclePos: n.cyclePos,
        description: n.description,
      }
      nodeMap.set(n.id, d3Node)
      return d3Node
    })

    const d3Links: D3Link[] = rawEdges
      .filter((e) => nodeMap.has(e.sourceId) && nodeMap.has(e.targetId))
      .map((e) => ({
        id: e.id,
        source: e.sourceId,
        target: e.targetId,
        relation: e.relation,
        weight: e.weight,
        direction: e.direction,
        description: e.description,
        confidence: e.confidence,
      }))

    return { d3Nodes, d3Links }
  }, [rawNodes, rawEdges])

  useEffect(() => {
    if (!svgRef.current || rawNodes.length === 0) return

    const svg = d3.select(svgRef.current)
    const { d3Nodes, d3Links } = transformData()

    // 清空旧内容
    svg.selectAll('*').remove()

    // ---------- Defs: 箭头 ----------
    const defs = svg.append('defs')

    // 正向箭头 (绿色)
    defs
      .append('marker')
      .attr('id', 'arrow-positive')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#22c55e')

    // 负向箭头 (红色)
    defs
      .append('marker')
      .attr('id', 'arrow-negative')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#ef4444')

    // 默认箭头
    defs
      .append('marker')
      .attr('id', 'arrow-default')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#94a3b8')

    // ---------- Zoom 容器 ----------
    const container = svg.append('g').attr('class', 'graph-container')
    containerRef.current = container.node()

    const zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 5])
      .on('zoom', (event) => {
        container.attr('transform', event.transform)
      })

    svg.call(zoomBehavior)

    // 初始居中
    const initialTransform = d3.zoomIdentity.translate(width / 2, height / 2).scale(0.8)
    svg.call(zoomBehavior.transform, initialTransform)

    // ---------- 边 ----------
    const linkGroup = container.append('g').attr('class', 'links')

    const link = linkGroup
      .selectAll('line')
      .data(d3Links)
      .join('line')
      .attr('stroke', (d) => d.relation === 'contain' ? '#64748b' : getEdgeColor(d.direction))
      .attr('stroke-opacity', (d) => d.relation === 'contain' ? 0.25 : 0.5)
      .attr('stroke-width', (d) => d.relation === 'contain' ? 1 : Math.max(1, d.weight * 3))
      .attr('stroke-dasharray', (d) => d.relation === 'contain' ? '4,3' : 'none')
      .attr('marker-end', (d) =>
        d.relation === 'contain'
          ? 'none'
          : d.direction === 'positive'
            ? 'url(#arrow-positive)'
            : d.direction === 'negative'
              ? 'url(#arrow-negative)'
              : 'url(#arrow-default)'
      )

    // 边标签
    const linkLabelGroup = container.append('g').attr('class', 'link-labels')

    const linkLabel = linkLabelGroup
      .selectAll('text')
      .data(d3Links.filter((d) => d.relation !== 'contain'))
      .join('text')
      .text((d) => EDGE_RELATION_LABELS[d.relation] || d.relation)
      .attr('font-size', 9)
      .attr('fill', '#94a3b8')
      .attr('text-anchor', 'middle')
      .attr('dy', -4)
      .style('pointer-events', 'none')

    // ---------- 节点组 ----------
    const nodeGroup = container.append('g').attr('class', 'nodes')

    const node = nodeGroup
      .selectAll('g')
      .data(d3Nodes)
      .join('g')
      .attr('cursor', 'pointer')
      .style('user-select', 'none')

    // 节点圆圈
    node
      .append('circle')
      .attr('r', (d) => getNodeRadius(d.level))
      .attr('fill', (d) => getNodeColor(d.type))
      .attr('stroke', (d) => (d.id === selectedNodeId ? '#fbbf24' : '#1e293b'))
      .attr('stroke-width', (d) => (d.id === selectedNodeId ? 3 : 1.5))
      .attr('opacity', 0.9)

    // 节点标签
    node
      .append('text')
      .text((d) => d.name)
      .attr('font-size', (d) => (d.level === 0 ? 12 : d.level === 1 ? 11 : 10))
      .attr('font-weight', (d) => (d.level <= 1 ? 600 : 400))
      .attr('fill', '#e2e8f0')
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => getNodeRadius(d.level) + 14)
      .style('pointer-events', 'none')
      .style('text-shadow', '0 1px 3px rgba(0,0,0,0.8)')

    // 节点类型小标签 (圆圈内)
    node
      .append('text')
      .text((d) => {
        const label = NODE_TYPE_LABELS[d.type] || d.type
        return label.length > 3 ? label.slice(0, 2) : label
      })
      .attr('font-size', (d) => (d.level === 0 ? 10 : 8))
      .attr('fill', '#fff')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .style('pointer-events', 'none')
      .style('font-weight', '600')

    // ---------- 交互 ----------

    // 拖拽（静态模式：拖拽后节点固定在新位置，不触发力模拟）
    const dragBehavior = d3
      .drag<SVGGElement, D3Node>()
      .on('start', (event, d) => {
        d.fx = d.x
        d.fy = d.y
      })
      .on('drag', (event, d) => {
        d.fx = event.x
        d.fy = event.y
        // 直接更新位置，不重启力模拟
        d.x = event.x
        d.y = event.y
        // 立即更新该节点和关联边的渲染
        d3.select(event.sourceEvent.target.closest('g'))
          .attr('transform', `translate(${d.x},${d.y})`)
        link
          .attr('x1', (l) => (l.source as D3Node).x!)
          .attr('y1', (l) => (l.source as D3Node).y!)
          .attr('x2', (l) => (l.target as D3Node).x!)
          .attr('y2', (l) => (l.target as D3Node).y!)
        linkLabel
          .attr('x', (l) => ((l.source as D3Node).x! + (l.target as D3Node).x!) / 2)
          .attr('y', (l) => ((l.source as D3Node).y! + (l.target as D3Node).y!) / 2)
      })
      .on('end', (event, d) => {
        // 保持节点固定在拖拽结束位置
        d.fx = event.x
        d.fy = event.y
      })

    node.call(dragBehavior as any)

    // 点击
    node.on('click', (event, d) => {
      event.stopPropagation()
      if (onNodeClickRef.current) {
        // 从原始数据中找到对应的 GraphNode
        const originalNode = rawNodes.find((n) => n.id === d.id)
        if (originalNode) onNodeClickRef.current(originalNode)
      }
    })

    // Hover
    node
      .on('mouseenter', (event, d) => {
        setHoveredNode(d)
        const svgRect = svgRef.current?.getBoundingClientRect()
        if (svgRect) {
          setTooltipPos({
            x: event.clientX - svgRect.left,
            y: event.clientY - svgRect.top,
          })
        }
        // 高亮关联边
        link.attr('stroke-opacity', (l) =>
          (l.source as D3Node).id === d.id || (l.target as D3Node).id === d.id ? 0.9 : 0.15
        )
        linkLabel.attr('opacity', (l) =>
          (l.source as D3Node).id === d.id || (l.target as D3Node).id === d.id ? 1 : 0.2
        )
        // 降低无关节点透明度
        const connectedIds = new Set<string>()
        connectedIds.add(d.id)
        d3Links.forEach((l) => {
          if ((l.source as D3Node).id === d.id) connectedIds.add((l.target as D3Node).id)
          if ((l.target as D3Node).id === d.id) connectedIds.add((l.source as D3Node).id)
        })
        node.select('circle').attr('opacity', (n) => (connectedIds.has(n.id) ? 1 : 0.2))
        node.selectAll('text').attr('opacity', (n: any) => (connectedIds.has(n.id) ? 1 : 0.2))
      })
      .on('mousemove', (event) => {
        const svgRect = svgRef.current?.getBoundingClientRect()
        if (svgRect) {
          setTooltipPos({
            x: event.clientX - svgRect.left,
            y: event.clientY - svgRect.top,
          })
        }
      })
      .on('mouseleave', () => {
        setHoveredNode(null)
        link.attr('stroke-opacity', 0.5)
        linkLabel.attr('opacity', 1)
        node.select('circle').attr('opacity', 0.9)
        node.selectAll('text').attr('opacity', 1)
      })

    // ---------- 力模拟（仅运行一次计算初始布局，然后停止） ----------
    const simulation = d3
      .forceSimulation<D3Node>(d3Nodes)
      .force(
        'link',
        d3
          .forceLink<D3Node, D3Link>(d3Links)
          .id((d) => d.id)
          .distance((d) => d.relation === 'contain' ? 50 + d.weight * 20 : 80 + (1 - d.weight) * 60)
          .strength((d) => d.relation === 'contain' ? 0.6 : 0.4)
      )
      .force('charge', d3.forceManyBody().strength(-300).distanceMax(400))
      .force('center', d3.forceCenter(0, 0).strength(0.05))
      .force(
        'collision',
        d3.forceCollide().radius((d) => getNodeRadius((d as D3Node).level) + 8)
      )
      .force('x', d3.forceX(0).strength(0.03))
      .force('y', d3.forceY(0).strength(0.03))
      .alphaTarget(0)
      .alphaDecay(0.05)

    simulationRef.current = simulation

    // 运行模拟直到收敛，然后固定所有节点位置
    simulation.on('tick', () => {
      link
        .attr('x1', (d) => (d.source as D3Node).x!)
        .attr('y1', (d) => (d.source as D3Node).y!)
        .attr('x2', (d) => (d.target as D3Node).x!)
        .attr('y2', (d) => (d.target as D3Node).y!)

      linkLabel
        .attr('x', (d) => ((d.source as D3Node).x! + (d.target as D3Node).x!) / 2)
        .attr('y', (d) => ((d.source as D3Node).y! + (d.target as D3Node).y!) / 2)

      node.attr('transform', (d) => `translate(${d.x},${d.y})`)
    })

    // 模拟收敛后停止并固定所有节点
    simulation.on('end', () => {
      d3Nodes.forEach((n) => {
        n.fx = n.x
        n.fy = n.y
      })
    })

    // 点击空白区域取消选中
    svg.on('click', () => {
      if (onNodeClickRef.current) onNodeClickRef.current(null as any)
    })

    return () => {
      simulation.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawNodes, rawEdges, width, height, selectedNodeId])

  return (
    <div className={className} style={{ position: 'relative' }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="rounded-lg bg-background"
        style={{ border: '1px solid var(--border)' }}
      />

      {/* 自定义 Tooltip */}
      {hoveredNode && (
        <div
          className="pointer-events-none absolute z-50 rounded-md bg-foreground px-3 py-2 text-xs text-background shadow-lg"
          style={{
            left: tooltipPos.x + 12,
            top: tooltipPos.y - 8,
            maxWidth: 260,
          }}
        >
          <div className="mb-1 font-semibold">{hoveredNode.name}</div>
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: getNodeColor(hoveredNode.type) }}
            />
            <span>{NODE_TYPE_LABELS[hoveredNode.type] || hoveredNode.type}</span>
          </div>
          {hoveredNode.description && (
            <div className="mt-1 max-w-[220px] text-[11px] leading-tight opacity-80">
              {hoveredNode.description.length > 80
                ? hoveredNode.description.slice(0, 80) + '...'
                : hoveredNode.description}
            </div>
          )}
          <div className="mt-1 flex gap-3 text-[11px] opacity-70">
            <span>层级 L{hoveredNode.level}</span>
            {hoveredNode.momentum !== undefined && <span>动量 {hoveredNode.momentum}</span>}
            {hoveredNode.cyclePos && <span>周期 {hoveredNode.cyclePos}</span>}
          </div>
        </div>
      )}

      {/* 图例 */}
      <div className="absolute bottom-2 left-2 flex flex-wrap gap-1.5 rounded-md bg-background/80 p-2 text-[10px] backdrop-blur-sm">
        {Object.entries(NODE_TYPE_LABELS)
          .filter(([key]) => rawNodes.some((n) => n.type === key))
          .map(([type, label]) => (
            <div key={type} className="flex items-center gap-1">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: getNodeColor(type) }}
              />
              <span className="text-muted-foreground">{label}</span>
            </div>
          ))}
      </div>
    </div>
  )
}
