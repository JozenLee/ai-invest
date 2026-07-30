import type { GraphFilters } from '@/components/graph/GraphFilters'

export interface GraphView {
  id: string
  name: string
  description: string
  filters: GraphFilters
  layoutType: 'force' | 'hierarchical'
  relationFilter?: string[]
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
    layoutType: 'force'
  }
]

export class GraphViewService {
  static getViews(): GraphView[] {
    return PREDEFINED_VIEWS
  }

  static getViewById(id: string): GraphView | undefined {
    return PREDEFINED_VIEWS.find(v => v.id === id)
  }
}
