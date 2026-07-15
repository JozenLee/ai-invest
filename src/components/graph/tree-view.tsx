'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import * as d3 from 'd3'

// --------------- 类型定义 ---------------

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

interface TreeNodeDatum extends d3.HierarchyPointNode<TreeNode> {
  _children?: TreeNodeDatum[]
  x0?: number
  y0?: number
}

export interface TreeViewProps {
  data: TreeNode[]
  width?: number
  height?: number
  onNodeClick?: (node: TreeNode) => void
  selectedNodeId?: string | null
  className?: string
}

// --------------- 颜色映射 ---------------

const NODE_COLORS: Record<string, string> = {
  index: '#3b82f6',
  industry_l1: '#22c55e',
  industry_l2: '#84cc16',
  sub_sector: '#a855f7',
  stock: '#64748b',
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
  policy: '#a3a3a3',
  macro: '#78716c',
  technology: '#d6d3d1',
  demand: '#fef08a',
}

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

const DEFAULT_NODE_COLOR = '#94a3b8'

function getNodeColor(type: string): string {
  return NODE_COLORS[type] || DEFAULT_NODE_COLOR
}

// --------------- 组件 ---------------

export function TreeView({
  data,
  width = 900,
  height = 600,
  onNodeClick,
  selectedNodeId,
  className,
}: TreeViewProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoveredNode, setHoveredNode] = useState<TreeNode | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })

  // 用 ref 持有最新回调，避免回调引用变化触发 D3 重建
  const onNodeClickRef = useRef(onNodeClick)
  onNodeClickRef.current = onNodeClick

  // 用 ref 持有 selectedNodeId，避免选中变化触发整棵树重建
  const selectedNodeIdRef = useRef(selectedNodeId)
  selectedNodeIdRef.current = selectedNodeId

  const renderTree = useCallback(() => {
    if (!svgRef.current || data.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    // 将 selectedNodeId 存入 ref，供事件回调读取最新值
    const selectedId = selectedNodeIdRef.current

    const margin = { top: 40, right: 160, bottom: 40, left: 80 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = height - margin.top - margin.bottom

    // 构建根节点（如果 data 有多个顶层节点，创建虚拟根）
    let rootData: TreeNode
    if (data.length === 1) {
      rootData = data[0]
    } else {
      rootData = {
        id: '__root__',
        name: '知识图谱',
        type: 'index',
        level: 0,
        children: data,
      }
    }

    const root = d3.hierarchy<TreeNode>(rootData) as TreeNodeDatum

    // 初始状态：只展开前两层
    root.descendants().forEach((d, i) => {
      if (d.depth >= 2 && d.children) {
        ;(d as TreeNodeDatum)._children = d.children as TreeNodeDatum[]
        ;(d as any).children = undefined
      }
    })

    const treemap = d3.tree<TreeNode>().size([innerHeight, innerWidth])

    // ---------- Zoom 容器 ----------
    const container = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    const zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 3])
      .on('zoom', (event) => {
        container.attr(
          'transform',
          `translate(${margin.left + event.transform.x},${margin.top + event.transform.y}) scale(${event.transform.k})`
        )
      })

    svg.call(zoomBehavior)

    // ---------- 更新函数 ----------
    let nodeId = 0

    function update(source: TreeNodeDatum) {
      const treeData = treemap(root)
      const nodes = treeData.descendants() as TreeNodeDatum[]
      const links = treeData.links()

      // 固定水平间距
      nodes.forEach((d) => {
        d.y = d.depth * 200
      })

      // ===== 节点 =====
      const node = container
        .selectAll<SVGGElement, TreeNodeDatum>('g.tree-node')
        .data(nodes, (d) => d.data.id || String(++nodeId))

      const nodeEnter = node
        .enter()
        .append('g')
        .attr('class', 'tree-node')
        .attr('transform', () => `translate(${source.y0 || 0},${source.x0 || 0})`)
        .attr('cursor', 'pointer')
        .style('user-select', 'none')
        .on('click', (event, d) => {
          event.stopPropagation()
          // 切换展开/折叠
          if (d.children) {
            ;(d as TreeNodeDatum)._children = d.children as TreeNodeDatum[]
            ;(d as any).children = undefined
          } else if ((d as TreeNodeDatum)._children) {
            ;(d as any).children = (d as TreeNodeDatum)._children
            ;(d as TreeNodeDatum)._children = undefined
          }
          update(d)

          if (onNodeClickRef.current && d.data.id !== '__root__') {
            onNodeClickRef.current(d.data)
          }
        })

      // 圆圈
      nodeEnter
        .append('circle')
        .attr('r', 1e-6)
        .attr('fill', (d) => (d.data.id === '__root__' ? '#1e293b' : getNodeColor(d.data.type)))
        .attr('stroke', (d) => (d.data.id === selectedId ? '#fbbf24' : '#475569'))
        .attr('stroke-width', (d) => (d.data.id === selectedId ? 3 : 1.5))

      // 标签文字
      nodeEnter
        .append('text')
        .attr('dy', '.35em')
        .attr('x', (d) => (d.children || (d as TreeNodeDatum)._children ? -14 : 14))
        .attr('text-anchor', (d) =>
          d.children || (d as TreeNodeDatum)._children ? 'end' : 'start'
        )
        .text((d) => d.data.name)
        .attr('font-size', (d) => (d.depth === 0 ? 14 : d.depth === 1 ? 12 : 11))
        .attr('font-weight', (d) => (d.depth <= 1 ? 600 : 400))
        .attr('fill', '#e2e8f0')
        .style('text-shadow', '0 1px 3px rgba(0,0,0,0.8)')

      // 类型标签
      nodeEnter
        .append('text')
        .attr('class', 'type-label')
        .attr('dy', '1.6em')
        .attr('x', (d) => (d.children || (d as TreeNodeDatum)._children ? -14 : 14))
        .attr('text-anchor', (d) =>
          d.children || (d as TreeNodeDatum)._children ? 'end' : 'start'
        )
        .text((d) =>
          d.data.id === '__root__' ? '' : NODE_TYPE_LABELS[d.data.type] || d.data.type
        )
        .attr('font-size', 9)
        .attr('fill', '#94a3b8')

      // 展开/折叠指示器
      nodeEnter
        .append('text')
        .attr('class', 'expand-indicator')
        .attr('dy', '.35em')
        .attr('x', 14)
        .attr('text-anchor', 'start')
        .attr('font-size', 10)
        .attr('fill', '#64748b')
        .text((d) => ((d as TreeNodeDatum)._children ? ' [+]' : d.children ? '' : ''))

      // Hover 效果
      nodeEnter
        .on('mouseenter', (event, d) => {
          if (d.data.id === '__root__') return
          setHoveredNode(d.data)
          const svgRect = svgRef.current?.getBoundingClientRect()
          if (svgRect) {
            setTooltipPos({
              x: event.clientX - svgRect.left,
              y: event.clientY - svgRect.top,
            })
          }
          d3.select(event.currentTarget as SVGGElement)
            .select('circle')
            .transition()
            .duration(200)
            .attr('r', 10)
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
        .on('mouseleave', (event, d) => {
          setHoveredNode(null)
          d3.select(event.currentTarget as SVGGElement)
            .select('circle')
            .transition()
            .duration(200)
            .attr('r', (d) => ((d as TreeNodeDatum).depth === 0 ? 8 : 6))
        })

      // 过渡到新位置
      const nodeUpdate = nodeEnter.merge(node)

      nodeUpdate
        .transition()
        .duration(400)
        .attr('transform', (d) => `translate(${d.y},${d.x})`)

      nodeUpdate
        .select('circle')
        .attr('r', (d) => (d.depth === 0 ? 8 : 6))
        .attr('fill', (d) => (d.data.id === '__root__' ? '#1e293b' : getNodeColor(d.data.type)))
        .attr('stroke', (d) => (d.data.id === selectedId ? '#fbbf24' : '#475569'))
        .attr('stroke-width', (d) => (d.data.id === selectedId ? 3 : 1.5))

      nodeUpdate
        .select('text:not(.type-label):not(.expand-indicator)')
        .attr('x', (d) => (d.children || (d as TreeNodeDatum)._children ? -14 : 14))
        .attr('text-anchor', (d) =>
          d.children || (d as TreeNodeDatum)._children ? 'end' : 'start'
        )

      nodeUpdate
        .selectAll('.expand-indicator')
        .text((d: any) => (d._children ? ' [+]' : d.children ? '' : ''))

      // 移除退出的节点
      const nodeExit = node
        .exit()
        .transition()
        .duration(400)
        .attr('transform', () => `translate(${source.y},${source.x})`)
        .remove()

      nodeExit.select('circle').attr('r', 1e-6)
      nodeExit.select('text').attr('opacity', 1e-6)

      // ===== 边 =====
      const link = container
        .selectAll<SVGPathElement, d3.HierarchyLink<TreeNode>>('path.tree-link')
        .data(links, (d) => d.target.data.id)

      const linkEnter = link
        .enter()
        .insert('path', 'g')
        .attr('class', 'tree-link')
        .attr('fill', 'none')
        .attr('stroke', '#334155')
        .attr('stroke-opacity', 0.5)
        .attr('stroke-width', 1.5)
        .attr('d', () => {
          const o = { x: source.x0 || 0, y: source.y0 || 0 }
          return diagonal(o, o)
        })

      const linkUpdate = linkEnter.merge(link)

      linkUpdate.transition().duration(400).attr('d', (d) => diagonal(d.source, d.target))

      link
        .exit()
        .transition()
        .duration(400)
        .attr('d', () => {
          const o = { x: source.x, y: source.y }
          return diagonal(o, o)
        })
        .remove()

      // 保存旧位置用于过渡
      nodes.forEach((d) => {
        d.x0 = d.x
        d.y0 = d.y
      })
    }

    // 贝塞尔曲线路径
    function diagonal(s: { x: number; y: number }, d: { x: number; y: number }) {
      return `M ${s.y} ${s.x}
              C ${(s.y + d.y) / 2} ${s.x},
                ${(s.y + d.y) / 2} ${d.x},
                ${d.y} ${d.x}`
    }

    // 初始化位置
    root.x0 = innerHeight / 2
    root.y0 = 0

    update(root)

    // 点击空白区域
    svg.on('click', () => {
      if (onNodeClickRef.current) onNodeClickRef.current(null as any)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, width, height])

  useEffect(() => {
    renderTree()
  }, [renderTree])

  // 选中节点变化时，仅更新高亮样式，不重建树
  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.selectAll<SVGGElement, TreeNodeDatum>('g.tree-node').each(function (d) {
      d3.select(this)
        .select('circle')
        .attr('stroke', d.data.id === selectedNodeId ? '#fbbf24' : '#475569')
        .attr('stroke-width', d.data.id === selectedNodeId ? 3 : 1.5)
    })
  }, [selectedNodeId])

  return (
    <div className={className} style={{ position: 'relative' }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="rounded-lg bg-background"
        style={{ border: '1px solid var(--border)' }}
      />

      {/* Tooltip */}
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
          </div>
        </div>
      )}

      {/* 提示 */}
      <div className="absolute bottom-2 right-2 rounded-md bg-background/80 px-2 py-1 text-[10px] text-muted-foreground backdrop-blur-sm">
        点击节点展开/折叠 | 滚轮缩放 | 拖拽平移
      </div>
    </div>
  )
}
