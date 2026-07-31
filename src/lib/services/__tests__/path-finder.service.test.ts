import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PathFinderService } from '../path-finder.service'
import { prisma } from '@/lib/db'

describe('PathFinderService', () => {
  let service: PathFinderService

  beforeEach(() => {
    service = new PathFinderService()
  })

  afterEach(async () => {
    // Cleanup test data
    await prisma.graphEdge.deleteMany({
      where: {
        OR: [
          { sourceId: { startsWith: 'test_' } },
          { targetId: { startsWith: 'test_' } }
        ]
      }
    })
    await prisma.graphNode.deleteMany({
      where: { id: { startsWith: 'test_' } }
    })
  })

  it('should find direct path between two connected nodes', async () => {
    // Setup: Create test nodes and edge
    const nodeA = await prisma.graphNode.create({
      data: { id: 'test_node_a', name: 'Node A', type: 'test', level: 0 }
    })
    const nodeB = await prisma.graphNode.create({
      data: { id: 'test_node_b', name: 'Node B', type: 'test', level: 1 }
    })
    await prisma.graphEdge.create({
      data: {
        sourceId: nodeA.id,
        targetId: nodeB.id,
        relation: 'test_relation',
        weight: 0.8,
        direction: 'positive',
        confidence: 1.0
      }
    })

    const paths = await service.findPaths(nodeA.id, nodeB.id)

    expect(paths).toHaveLength(1)
    expect(paths[0].nodes).toHaveLength(2)
    expect(paths[0].edges).toHaveLength(1)
    expect(paths[0].totalWeight).toBe(0.8)
  })

  it('should find multiple paths when they exist', async () => {
    // Setup: A -> B -> D and A -> C -> D
    const nodeA = await prisma.graphNode.create({
      data: { id: 'test_node_a2', name: 'A', type: 'test', level: 0 }
    })
    const nodeB = await prisma.graphNode.create({
      data: { id: 'test_node_b2', name: 'B', type: 'test', level: 1 }
    })
    const nodeC = await prisma.graphNode.create({
      data: { id: 'test_node_c2', name: 'C', type: 'test', level: 1 }
    })
    const nodeD = await prisma.graphNode.create({
      data: { id: 'test_node_d2', name: 'D', type: 'test', level: 2 }
    })

    await prisma.graphEdge.createMany({
      data: [
        { sourceId: nodeA.id, targetId: nodeB.id, relation: 'supply_chain', weight: 0.7, direction: 'positive', confidence: 1.0 },
        { sourceId: nodeA.id, targetId: nodeC.id, relation: 'supply_chain', weight: 0.6, direction: 'positive', confidence: 1.0 },
        { sourceId: nodeB.id, targetId: nodeD.id, relation: 'supply_chain', weight: 0.8, direction: 'positive', confidence: 1.0 },
        { sourceId: nodeC.id, targetId: nodeD.id, relation: 'supply_chain', weight: 0.5, direction: 'positive', confidence: 1.0 }
      ]
    })

    const paths = await service.findPaths(nodeA.id, nodeD.id)

    expect(paths.length).toBeGreaterThanOrEqual(2)
  })

  it('should respect maxDepth constraint', async () => {
    const nodeA = await prisma.graphNode.create({
      data: { id: 'test_node_a3', name: 'A', type: 'test', level: 0 }
    })
    const nodeB = await prisma.graphNode.create({
      data: { id: 'test_node_b3', name: 'B', type: 'test', level: 1 }
    })

    await prisma.graphEdge.create({
      data: {
        sourceId: nodeA.id,
        targetId: nodeB.id,
        relation: 'test',
        weight: 0.5,
        direction: 'positive',
        confidence: 1.0
      }
    })

    const paths = await service.findPaths(nodeA.id, nodeB.id, { maxDepth: 2 })

    paths.forEach(path => {
      expect(path.nodes.length - 1).toBeLessThanOrEqual(2)
    })
  })

  it('should return empty array when no path exists', async () => {
    const nodeA = await prisma.graphNode.create({
      data: { id: 'test_isolated_a', name: 'Isolated A', type: 'test', level: 0 }
    })
    const nodeB = await prisma.graphNode.create({
      data: { id: 'test_isolated_b', name: 'Isolated B', type: 'test', level: 0 }
    })

    const paths = await service.findPaths(nodeA.id, nodeB.id)

    expect(paths).toHaveLength(0)
  })
})
