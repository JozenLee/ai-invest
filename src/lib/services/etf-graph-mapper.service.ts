import { prisma } from '@/lib/db'

export interface ETFHolding {
  stock_code: string
  stock_name: string
  weight: number
  shares?: number
  market_value?: number
}

export interface NodeExposure {
  nodeId: string
  nodeName: string
  nodeType: string
  exposure: number
  stocks: Array<{
    code: string
    name: string
    weight: number
  }>
}

export class ETFGraphMapperService {
  private dataServiceUrl = process.env.DATA_SERVICE_URL || 'http://localhost:8000'

  async mapETFToGraph(ticker: string): Promise<NodeExposure[]> {
    // 1. 从 Python 服务获取持仓
    const response = await fetch(`${this.dataServiceUrl}/api/etf/${ticker}/holdings`)
    if (!response.ok) {
      throw new Error(`获取ETF持仓失败: ${response.statusText}`)
    }
    const { data: holdings } = await response.json() as { data: ETFHolding[] }

    // 2. 查询持仓个股对应的图谱节点
    const stockCodes = holdings.map(h => h.stock_code)
    const graphStocks = await prisma.graphStock.findMany({
      where: { stockCode: { in: stockCodes } },
      include: { node: true }
    })

    // 3. 构建映射 Map: stockCode -> nodeInfo
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
