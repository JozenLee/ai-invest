import { prisma } from '@/lib/db'

export interface PathQueryOptions {
  maxDepth?: number
  maxPaths?: number
  relationTypes?: string[]
}

export interface PathNode {
  id: string
  name: string
  type: string
}

export interface PathEdge {
  sourceId: string
  targetId: string
  relation: string
  weight: number
  direction: 'positive' | 'negative'
  lag?: string
}

export interface Path {
  nodes: PathNode[]
  edges: PathEdge[]
  totalWeight: number
  totalLag?: string
}

export class PathFinderService {
  /**
   * Find all paths between two nodes using BFS
   */
  async findPaths(
    sourceId: string,
    targetId: string,
    options: PathQueryOptions = {}
  ): Promise<Path[]> {
    const {
      maxDepth = 4,
      maxPaths = 10,
      relationTypes
    } = options

    // 1. Load graph data
    const nodes = await prisma.graphNode.findMany()
    const edges = await prisma.graphEdge.findMany({
      where: relationTypes ? { relation: { in: relationTypes } } : undefined
    })

    // 2. Build adjacency list
    const adjacency = this.buildAdjacency(edges)

    // 3. BFS search
    const paths = this.bfsSearch(
      sourceId,
      targetId,
      adjacency,
      nodes,
      edges,
      maxDepth,
      maxPaths
    )

    return paths
  }

  private buildAdjacency(edges: any[]): Map<string, string[]> {
    const adj = new Map<string, string[]>()

    for (const edge of edges) {
      if (!adj.has(edge.sourceId)) {
        adj.set(edge.sourceId, [])
      }
      adj.get(edge.sourceId)!.push(edge.targetId)

      // Also add reverse for bidirectional search
      if (!adj.has(edge.targetId)) {
        adj.set(edge.targetId, [])
      }
      adj.get(edge.targetId)!.push(edge.sourceId)
    }

    return adj
  }

  private bfsSearch(
    sourceId: string,
    targetId: string,
    adjacency: Map<string, string[]>,
    nodes: any[],
    edges: any[],
    maxDepth: number,
    maxPaths: number
  ): Path[] {
    const paths: Path[] = []
    const queue: Array<{ nodeId: string, path: string[], depth: number }> = [
      { nodeId: sourceId, path: [sourceId], depth: 0 }
    ]

    const nodeMap = new Map(nodes.map(n => [n.id, n]))
    const edgeMap = new Map<string, any>()
    for (const edge of edges) {
      edgeMap.set(`${edge.sourceId}-${edge.targetId}`, edge)
      edgeMap.set(`${edge.targetId}-${edge.sourceId}`, edge)
    }

    while (queue.length > 0 && paths.length < maxPaths) {
      const { nodeId, path, depth } = queue.shift()!

      if (nodeId === targetId && path.length > 1) {
        // Found a path
        const pathNodes: PathNode[] = path.map(id => ({
          id,
          name: nodeMap.get(id)?.name || id,
          type: nodeMap.get(id)?.type || 'unknown'
        }))

        const pathEdges: PathEdge[] = []
        let totalWeight = 0

        for (let i = 0; i < path.length - 1; i++) {
          const edgeKey = `${path[i]}-${path[i + 1]}`
          const edge = edgeMap.get(edgeKey)
          if (edge) {
            pathEdges.push({
              sourceId: edge.sourceId,
              targetId: edge.targetId,
              relation: edge.relation,
              weight: edge.weight,
              direction: edge.direction,
              lag: edge.lag
            })
            totalWeight += edge.weight
          }
        }

        paths.push({
          nodes: pathNodes,
          edges: pathEdges,
          totalWeight: totalWeight / pathEdges.length, // Average weight
          totalLag: this.calculateTotalLag(pathEdges)
        })

        continue
      }

      if (depth >= maxDepth) {
        continue
      }

      const neighbors = adjacency.get(nodeId) || []
      for (const neighbor of neighbors) {
        if (!path.includes(neighbor)) {
          queue.push({
            nodeId: neighbor,
            path: [...path, neighbor],
            depth: depth + 1
          })
        }
      }
    }

    // Sort by total weight (descending)
    return paths.sort((a, b) => b.totalWeight - a.totalWeight)
  }

  private calculateTotalLag(edges: PathEdge[]): string | undefined {
    const lags = edges.map(e => e.lag).filter(Boolean) as string[]
    if (lags.length === 0) return undefined

    // Simple concatenation for now (can be improved)
    return lags.join(', ')
  }
}
