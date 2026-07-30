import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import path from 'path'

const dbPath = path.resolve(__dirname, '../../prisma/dev.db')
const adapter = new PrismaBetterSqlite3({
  url: `file:${dbPath}`,
})

const prisma = new PrismaClient({ adapter })

const STOCK_MAPPINGS = [
  // AI芯片设计
  { stockCode: '688256.SH', stockName: '寒武纪', nodeType: 'chip_design', nodeName: 'GPU/AI芯片', relevance: 1.0, category: '核心标的' },
  { stockCode: '688041.SH', stockName: '海光信息', nodeType: 'chip_design', nodeName: 'GPU/AI芯片', relevance: 1.0, category: '核心标的' },

  // 晶圆代工
  { stockCode: '688981.SH', stockName: '中芯国际', nodeType: 'industry_l2', nodeName: '晶圆代工', relevance: 1.0, category: '核心标的' },

  // 封装测试
  { stockCode: '600584.SH', stockName: '长电科技', nodeType: 'industry_l2', nodeName: '封装测试', relevance: 1.0, category: '核心标的' },
  { stockCode: '002185.SZ', stockName: '华天科技', nodeType: 'industry_l2', nodeName: '封装测试', relevance: 0.9, category: '核心标的' },
  { stockCode: '002156.SZ', stockName: '通富微电', nodeType: 'industry_l2', nodeName: '封装测试', relevance: 0.9, category: '核心标的' },

  // 设备
  { stockCode: '002371.SZ', stockName: '北方华创', nodeType: 'industry_l2', nodeName: '半导体设备', relevance: 1.0, category: '核心标的' },
  { stockCode: '688012.SH', stockName: '中微公司', nodeType: 'industry_l2', nodeName: '半导体设备', relevance: 1.0, category: '核心标的' },
  { stockCode: '688072.SH', stockName: '拓荆科技', nodeType: 'industry_l2', nodeName: '半导体设备', relevance: 0.9, category: '核心标的' },

  // 材料
  { stockCode: '688126.SH', stockName: '沪硅产业', nodeType: 'industry_l2', nodeName: '半导体材料', relevance: 1.0, category: '核心标的' },
  { stockCode: '300236.SZ', stockName: '上海新阳', nodeType: 'industry_l2', nodeName: '半导体材料', relevance: 0.9, category: '核心标的' },

  // 存储芯片 - HBM
  { stockCode: '002371.SZ', stockName: '北方华创', nodeType: 'memory', nodeName: 'HBM高带宽内存', relevance: 0.8, category: '相关标的' },

  // 服务器
  { stockCode: '000977.SZ', stockName: '浪潮信息', nodeType: 'server', nodeName: 'AI服务器', relevance: 1.0, category: '核心标的' },
  { stockCode: '603019.SH', stockName: '中科曙光', nodeType: 'server', nodeName: 'AI服务器', relevance: 0.9, category: '核心标的' },
  { stockCode: '002415.SZ', stockName: '海康威视', nodeType: 'server', nodeName: 'AI服务器', relevance: 0.7, category: '相关标的' },

  // 光模块
  { stockCode: '300308.SZ', stockName: '中际旭创', nodeType: 'optical_module', relevance: 1.0, category: '核心标的' },
  { stockCode: '300502.SZ', stockName: '新易盛', nodeType: 'optical_module', relevance: 0.9, category: '核心标的' },
  { stockCode: '300394.SZ', stockName: '天孚通信', nodeType: 'optical_module', relevance: 0.9, category: '核心标的' },
  { stockCode: '603083.SH', stockName: '剑桥科技', nodeType: 'optical_module', relevance: 0.8, category: '核心标的' },

  // CPO
  { stockCode: '688396.SH', stockName: '华润微', nodeType: 'cpo', relevance: 0.8, category: '相关标的' },

  // 散热
  { stockCode: '002837.SZ', stockName: '英维克', nodeType: 'cooling', nodeName: '液冷散热', relevance: 1.0, category: '核心标的' },
  { stockCode: '002180.SZ', stockName: '纳思达', nodeType: 'cooling', nodeName: '风冷散热', relevance: 0.7, category: '相关标的' },

  // 电源
  { stockCode: '002463.SZ', stockName: '沪电股份', nodeType: 'power', nodeName: '服务器电源', relevance: 0.8, category: '相关标的' },

  // PCB
  { stockCode: '002916.SZ', stockName: '深南电路', nodeType: 'pcb', nodeName: '高多层PCB', relevance: 1.0, category: '核心标的' },
  { stockCode: '603228.SH', stockName: '景旺电子', nodeType: 'pcb', nodeName: '高多层PCB', relevance: 0.9, category: '核心标的' },
  { stockCode: '300408.SZ', stockName: '三环集团', nodeType: 'pcb', nodeName: '高多层PCB', relevance: 0.8, category: '核心标的' },

  // 网络设备
  { stockCode: '000063.SZ', stockName: '中兴通讯', nodeType: 'industry_l2', nodeName: '网络设备', relevance: 0.9, category: '核心标的' },
  { stockCode: '600050.SH', stockName: '中国联通', nodeType: 'industry_l2', nodeName: '网络设备', relevance: 0.7, category: '相关标的' },

  // 数据中心
  { stockCode: '603881.SH', stockName: '数据港', nodeType: 'data_center', relevance: 1.0, category: '核心标的' },
  { stockCode: '300454.SZ', stockName: '深信服', nodeType: 'data_center', relevance: 0.8, category: '相关标的' },

  // 云计算
  { stockCode: '600588.SH', stockName: '用友网络', nodeType: 'industry_l2', nodeName: '云计算', relevance: 0.7, category: '相关标的' },

  // AI应用
  { stockCode: '002230.SZ', stockName: '科大讯飞', nodeType: 'ai_application', relevance: 1.0, category: '核心标的' },
  { stockCode: '688111.SH', stockName: '金山办公', nodeType: 'ai_application', relevance: 0.8, category: '相关标的' },
]

async function seed() {
  console.log('开始填充 GraphStock 数据...')

  // 获取所有图谱节点
  const allNodes = await prisma.graphNode.findMany()

  if (allNodes.length === 0) {
    console.error('错误: 数据库中没有 GraphNode 记录。请先运行 graph nodes seed。')
    process.exit(1)
  }

  console.log(`找到 ${allNodes.length} 个图谱节点`)

  // Create maps for both type-based and type+name-based lookups
  const nodeTypeMap = new Map(allNodes.map(n => [n.type, n]))
  const nodeTypeNameMap = new Map(allNodes.map(n => [`${n.type}:${n.name}`, n]))

  let created = 0
  let skipped = 0

  for (const mapping of STOCK_MAPPINGS) {
    // Try to find node by type+name first, then by type only
    let node
    if (mapping.nodeName) {
      node = nodeTypeNameMap.get(`${mapping.nodeType}:${mapping.nodeName}`)
    }
    if (!node) {
      node = nodeTypeMap.get(mapping.nodeType)
    }

    if (!node) {
      console.warn(`跳过 ${mapping.stockName}: 未找到类型为 ${mapping.nodeType}${mapping.nodeName ? ` 名称为 ${mapping.nodeName}` : ''} 的节点`)
      skipped++
      continue
    }

    try {
      await prisma.graphStock.create({
        data: {
          stockCode: mapping.stockCode,
          stockName: mapping.stockName,
          nodeId: node.id,
          relevance: mapping.relevance,
          category: mapping.category
        }
      })
      created++
      console.log(`✓ 创建映射: ${mapping.stockName} (${mapping.stockCode}) -> ${node.name}`)
    } catch (error: any) {
      if (error.code === 'P2002') {
        console.log(`跳过 ${mapping.stockName}: 已存在`)
        skipped++
      } else {
        throw error
      }
    }
  }

  console.log(`\n完成！创建 ${created} 条映射，跳过 ${skipped} 条`)
}

seed()
  .catch(error => {
    console.error('种子数据填充失败:', error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
