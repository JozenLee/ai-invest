#!/usr/bin/env tsx
/**
 * 扩展节点类型到板块的映射关系
 */

// 在 graph-market-data.service.ts 的 mapNodeToSector 方法中
// 添加新的映射规则

const extendedMapping = `
  /**
   * 映射节点到板块名称（扩展版）
   */
  private mapNodeToSector(node: GraphNode): string | null {
    // 基础映射表
    const typeMapping: Record<string, string> = {
      // 原有映射
      'chip_design': '芯片',
      'memory': '存储芯片',
      'server': '服务器',
      'cooling': '散热',
      'data_center': '数据中心',
      'optical_module': '光模块',
      'cpo': '光通信',
      'networking': '通信设备',

      // 新增映射 - AI 相关
      'ai_index': '人工智能',
      'ai_l1': '人工智能',
      'ai_l2': '人工智能',

      // 新增映射 - 生物医药
      'biotech_index': '医药生物',
      'biotech_l1': '医药生物',
      'biotech_l2': '医药生物',

      // 新增映射 - 消费电子
      'ce_index': '电子',
      'ce_l1': '电子',
      'ce_l2': '电子',

      // 新增映射 - 消费
      'consumer_index': '消费',
      'consumer_l1': '消费',
      'consumer_l2': '消费',

      // 新增映射 - 国防军工
      'defense_index': '国防军工',
      'defense_l1': '国防军工',
      'defense_l2': '国防军工',

      // 新增映射 - 数字经济
      'digital_index': '通信',
      'digital_l1': '通信',
      'digital_l2': '通信',

      // 新增映射 - 新能源
      'energy_index': '电力设备',
      'energy_l1': '电力设备',
      'energy_l2': '电力设备',
      'nev_index': '汽车',
      'nev_l1': '汽车',
      'nev_l2': '汽车',
      'nev_l3': '汽车',

      // 新增映射 - 材料
      'materials_index': '基础化工',
      'materials_l1': '基础化工',
      'materials_l2': '基础化工',

      // 新增映射 - 机器人
      'robotics_index': '机械设备',
      'robotics_l1': '机械设备',
      'robotics_l2': '机械设备',

      // 通用映射
      'sector_l1': '芯片',
      'industry_l2': '电子',
      'sub_sector': '电子',
      'subsector_l2': '电子',
    }

    // 1. 先尝试精确类型匹配
    if (typeMapping[node.type]) {
      return typeMapping[node.type]
    }

    // 2. 基于名称的模糊匹配
    const nameMapping: Array<[RegExp, string]> = [
      [/芯片|半导体|GPU|CPU|AI芯片|ASIC|FPGA/, '芯片'],
      [/存储|内存|HBM|闪存|SSD/, '存储芯片'],
      [/服务器|算力|IDC|云计算/, '服务器'],
      [/散热|液冷|风冷|热管/, '散热'],
      [/数据中心|机房/, '数据中心'],
      [/光模块|光芯片|激光器/, '光模块'],
      [/CPO|硅光|光电/, '光通信'],
      [/通信设备|基站|路由器|交换机/, '通信设备'],
      [/人工智能|AI|机器学习|深度学习/, '人工智能'],
      [/医药|生物|制药|医疗/, '医药生物'],
      [/消费电子|手机|电脑|平板/, '电子'],
      [/新能源|电动车|锂电|光伏/, '电力设备'],
      [/汽车|车载|智能驾驶/, '汽车'],
      [/机器人|自动化|工业机器人/, '机械设备'],
      [/国防|军工|航空|航天/, '国防军工'],
      [/化工|材料|新材料/, '基础化工'],
    ]

    for (const [pattern, sector] of nameMapping) {
      if (pattern.test(node.name)) {
        return sector
      }
    }

    // 3. 如果有 metadata.sector 字段，优先使用
    if (node.metadata) {
      const metadata = typeof node.metadata === 'string'
        ? JSON.parse(node.metadata)
        : node.metadata
      if (metadata.sector) {
        return metadata.sector
      }
    }

    return null
  }
`

console.log('📝 扩展的节点类型映射代码：')
console.log(extendedMapping)
console.log('\n💡 请将以上代码替换到 src/lib/services/graph-market-data.service.ts 的 mapNodeToSector 方法')
