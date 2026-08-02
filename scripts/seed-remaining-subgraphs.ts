import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import path from 'path'

const dbPath = path.resolve(__dirname, '../prisma/dev.db')
const adapter = new PrismaBetterSqlite3({
  url: `file:${dbPath}`,
})
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('开始为剩余7个子图谱创建节点数据...')

  // ==================== 1. 创新药/医疗器械 ====================
  console.log('创建创新药/医疗器械子图谱节点...')
  const biotechNodes = [
    // Level 0: Root
    { id: 'biotech_root', type: 'biotech_index', name: '创新药/医疗器械', level: 0, subGraphId: 'biotech_medical', description: '生物医药产业链总览', totalScore: 65 },

    // Level 1: Core segments
    { id: 'biotech_drug', type: 'biotech_l1', name: '创新药', level: 1, parentId: 'biotech_root', subGraphId: 'biotech_medical', totalScore: 70 },
    { id: 'biotech_device', type: 'biotech_l1', name: '医疗器械', level: 1, parentId: 'biotech_root', subGraphId: 'biotech_medical', totalScore: 68 },
    { id: 'biotech_cxo', type: 'biotech_l1', name: 'CXO', level: 1, parentId: 'biotech_root', subGraphId: 'biotech_medical', totalScore: 65 },

    // Level 2: Drug segments
    { id: 'biotech_antibody', type: 'biotech_l2', name: '抗体药物', level: 2, parentId: 'biotech_drug', subGraphId: 'biotech_medical', totalScore: 72 },
    { id: 'biotech_cell_therapy', type: 'biotech_l2', name: '细胞治疗', level: 2, parentId: 'biotech_drug', subGraphId: 'biotech_medical', totalScore: 75 },
    { id: 'biotech_gene_therapy', type: 'biotech_l2', name: '基因治疗', level: 2, parentId: 'biotech_drug', subGraphId: 'biotech_medical', totalScore: 68 },

    // Level 2: Device segments
    { id: 'biotech_imaging', type: 'biotech_l2', name: '影像设备', level: 2, parentId: 'biotech_device', subGraphId: 'biotech_medical', totalScore: 66 },
    { id: 'biotech_ivd', type: 'biotech_l2', name: '体外诊断', level: 2, parentId: 'biotech_device', subGraphId: 'biotech_medical', totalScore: 70 },
    { id: 'biotech_implant', type: 'biotech_l2', name: '植入器械', level: 2, parentId: 'biotech_device', subGraphId: 'biotech_medical', totalScore: 64 },
  ]

  for (const node of biotechNodes) {
    await prisma.graphNode.upsert({
      where: { id: node.id },
      update: node,
      create: node,
    })
  }

  // ==================== 2. 消费电子 ====================
  console.log('创建消费电子子图谱节点...')
  const ceNodes = [
    // Level 0: Root
    { id: 'ce_root', type: 'ce_index', name: '消费电子', level: 0, subGraphId: 'consumer_electronics', description: '消费电子产业链总览', totalScore: 62 },

    // Level 1: Core segments
    { id: 'ce_smartphone', type: 'ce_l1', name: '智能手机', level: 1, parentId: 'ce_root', subGraphId: 'consumer_electronics', totalScore: 60 },
    { id: 'ce_wearable', type: 'ce_l1', name: '可穿戴设备', level: 1, parentId: 'ce_root', subGraphId: 'consumer_electronics', totalScore: 68 },
    { id: 'ce_component', type: 'ce_l1', name: '电子元器件', level: 1, parentId: 'ce_root', subGraphId: 'consumer_electronics', totalScore: 65 },

    // Level 2: Smartphone segments
    { id: 'ce_camera', type: 'ce_l2', name: '摄像头模组', level: 2, parentId: 'ce_smartphone', subGraphId: 'consumer_electronics', totalScore: 63 },
    { id: 'ce_display', type: 'ce_l2', name: '显示屏', level: 2, parentId: 'ce_smartphone', subGraphId: 'consumer_electronics', totalScore: 58 },

    // Level 2: Wearable segments
    { id: 'ce_smartwatch', type: 'ce_l2', name: '智能手表', level: 2, parentId: 'ce_wearable', subGraphId: 'consumer_electronics', totalScore: 70 },
    { id: 'ce_earbuds', type: 'ce_l2', name: 'TWS耳机', level: 2, parentId: 'ce_wearable', subGraphId: 'consumer_electronics', totalScore: 66 },
    { id: 'ce_ar_vr', type: 'ce_l2', name: 'AR/VR', level: 2, parentId: 'ce_wearable', subGraphId: 'consumer_electronics', totalScore: 72 },
  ]

  for (const node of ceNodes) {
    await prisma.graphNode.upsert({
      where: { id: node.id },
      update: node,
      create: node,
    })
  }

  // ==================== 3. 军工航天 ====================
  console.log('创建军工航天子图谱节点...')
  const defenseNodes = [
    // Level 0: Root
    { id: 'defense_root', type: 'defense_index', name: '军工航天', level: 0, subGraphId: 'defense_aerospace', description: '军工航天产业链总览', totalScore: 58 },

    // Level 1: Core segments
    { id: 'defense_aviation', type: 'defense_l1', name: '航空装备', level: 1, parentId: 'defense_root', subGraphId: 'defense_aerospace', totalScore: 60 },
    { id: 'defense_space', type: 'defense_l1', name: '航天装备', level: 1, parentId: 'defense_root', subGraphId: 'defense_aerospace', totalScore: 62 },
    { id: 'defense_info', type: 'defense_l1', name: '信息化装备', level: 1, parentId: 'defense_root', subGraphId: 'defense_aerospace', totalScore: 65 },

    // Level 2
    { id: 'defense_fighter', type: 'defense_l2', name: '战斗机', level: 2, parentId: 'defense_aviation', subGraphId: 'defense_aerospace', totalScore: 58 },
    { id: 'defense_satellite', type: 'defense_l2', name: '卫星', level: 2, parentId: 'defense_space', subGraphId: 'defense_aerospace', totalScore: 64 },
    { id: 'defense_radar', type: 'defense_l2', name: '雷达', level: 2, parentId: 'defense_info', subGraphId: 'defense_aerospace', totalScore: 66 },
  ]

  for (const node of defenseNodes) {
    await prisma.graphNode.upsert({
      where: { id: node.id },
      update: node,
      create: node,
    })
  }

  // ==================== 4. 储能/电力设备 ====================
  console.log('创建储能/电力设备子图谱节点...')
  const energyNodes = [
    // Level 0: Root
    { id: 'energy_root', type: 'energy_index', name: '储能/电力设备', level: 0, subGraphId: 'energy_storage', description: '储能电力产业链总览', totalScore: 66 },

    // Level 1: Core segments
    { id: 'energy_storage', type: 'energy_l1', name: '储能系统', level: 1, parentId: 'energy_root', subGraphId: 'energy_storage', totalScore: 70 },
    { id: 'energy_grid', type: 'energy_l1', name: '电网设备', level: 1, parentId: 'energy_root', subGraphId: 'energy_storage', totalScore: 64 },
    { id: 'energy_inverter', type: 'energy_l1', name: '逆变器', level: 1, parentId: 'energy_root', subGraphId: 'energy_storage', totalScore: 68 },

    // Level 2
    { id: 'energy_battery_storage', type: 'energy_l2', name: '电化学储能', level: 2, parentId: 'energy_storage', subGraphId: 'energy_storage', totalScore: 72 },
    { id: 'energy_transformer', type: 'energy_l2', name: '变压器', level: 2, parentId: 'energy_grid', subGraphId: 'energy_storage', totalScore: 62 },
    { id: 'energy_solar_inv', type: 'energy_l2', name: '光伏逆变器', level: 2, parentId: 'energy_inverter', subGraphId: 'energy_storage', totalScore: 70 },
  ]

  for (const node of energyNodes) {
    await prisma.graphNode.upsert({
      where: { id: node.id },
      update: node,
      create: node,
    })
  }

  // ==================== 5. 机器人/自动化 ====================
  console.log('创建机器人/自动化子图谱节点...')
  const roboticsNodes = [
    // Level 0: Root
    { id: 'robotics_root', type: 'robotics_index', name: '机器人/自动化', level: 0, subGraphId: 'robotics', description: '机器人自动化产业链总览', totalScore: 68 },

    // Level 1: Core segments
    { id: 'robotics_industrial', type: 'robotics_l1', name: '工业机器人', level: 1, parentId: 'robotics_root', subGraphId: 'robotics', totalScore: 70 },
    { id: 'robotics_service', type: 'robotics_l1', name: '服务机器人', level: 1, parentId: 'robotics_root', subGraphId: 'robotics', totalScore: 72 },
    { id: 'robotics_core', type: 'robotics_l1', name: '核心零部件', level: 1, parentId: 'robotics_root', subGraphId: 'robotics', totalScore: 66 },

    // Level 2
    { id: 'robotics_welding', type: 'robotics_l2', name: '焊接机器人', level: 2, parentId: 'robotics_industrial', subGraphId: 'robotics', totalScore: 68 },
    { id: 'robotics_humanoid', type: 'robotics_l2', name: '人形机器人', level: 2, parentId: 'robotics_service', subGraphId: 'robotics', totalScore: 75 },
    { id: 'robotics_reducer', type: 'robotics_l2', name: '减速器', level: 2, parentId: 'robotics_core', subGraphId: 'robotics', totalScore: 64 },
    { id: 'robotics_servo', type: 'robotics_l2', name: '伺服系统', level: 2, parentId: 'robotics_core', subGraphId: 'robotics', totalScore: 66 },
  ]

  for (const node of roboticsNodes) {
    await prisma.graphNode.upsert({
      where: { id: node.id },
      update: node,
      create: node,
    })
  }

  // ==================== 6. 数字经济 ====================
  console.log('创建数字经济子图谱节点...')
  const digitalNodes = [
    // Level 0: Root
    { id: 'digital_root', type: 'digital_index', name: '数字经济', level: 0, subGraphId: 'digital_economy', description: '数字经济产业链总览', totalScore: 64 },

    // Level 1: Core segments
    { id: 'digital_cloud', type: 'digital_l1', name: '云计算', level: 1, parentId: 'digital_root', subGraphId: 'digital_economy', totalScore: 68 },
    { id: 'digital_bigdata', type: 'digital_l1', name: '大数据', level: 1, parentId: 'digital_root', subGraphId: 'digital_economy', totalScore: 65 },
    { id: 'digital_security', type: 'digital_l1', name: '网络安全', level: 1, parentId: 'digital_root', subGraphId: 'digital_economy', totalScore: 70 },

    // Level 2
    { id: 'digital_iaas', type: 'digital_l2', name: 'IaaS', level: 2, parentId: 'digital_cloud', subGraphId: 'digital_economy', totalScore: 66 },
    { id: 'digital_saas', type: 'digital_l2', name: 'SaaS', level: 2, parentId: 'digital_cloud', subGraphId: 'digital_economy', totalScore: 70 },
    { id: 'digital_analytics', type: 'digital_l2', name: '数据分析', level: 2, parentId: 'digital_bigdata', subGraphId: 'digital_economy', totalScore: 64 },
    { id: 'digital_firewall', type: 'digital_l2', name: '防火墙', level: 2, parentId: 'digital_security', subGraphId: 'digital_economy', totalScore: 68 },
  ]

  for (const node of digitalNodes) {
    await prisma.graphNode.upsert({
      where: { id: node.id },
      update: node,
      create: node,
    })
  }

  // ==================== 7. 先进材料 ====================
  console.log('创建先进材料子图谱节点...')
  const materialsNodes = [
    // Level 0: Root
    { id: 'materials_root', type: 'materials_index', name: '先进材料', level: 0, subGraphId: 'advanced_materials', description: '先进材料产业链总览', totalScore: 62 },

    // Level 1: Core segments
    { id: 'materials_new_material', type: 'materials_l1', name: '新材料', level: 1, parentId: 'materials_root', subGraphId: 'advanced_materials', totalScore: 65 },
    { id: 'materials_chemical', type: 'materials_l1', name: '化工新材料', level: 1, parentId: 'materials_root', subGraphId: 'advanced_materials', totalScore: 60 },
    { id: 'materials_metal', type: 'materials_l1', name: '金属新材料', level: 1, parentId: 'materials_root', subGraphId: 'advanced_materials', totalScore: 58 },

    // Level 2
    { id: 'materials_carbon', type: 'materials_l2', name: '碳纤维', level: 2, parentId: 'materials_new_material', subGraphId: 'advanced_materials', totalScore: 66 },
    { id: 'materials_polymer', type: 'materials_l2', name: '高分子材料', level: 2, parentId: 'materials_chemical', subGraphId: 'advanced_materials', totalScore: 62 },
    { id: 'materials_titanium', type: 'materials_l2', name: '钛合金', level: 2, parentId: 'materials_metal', subGraphId: 'advanced_materials', totalScore: 60 },
  ]

  for (const node of materialsNodes) {
    await prisma.graphNode.upsert({
      where: { id: node.id },
      update: node,
      create: node,
    })
  }

  console.log('✅ 所有7个子图谱的节点创建完成！')

  // 统计信息
  const stats = await prisma.subGraph.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
    },
  })

  for (const sg of stats) {
    const count = await prisma.graphNode.count({
      where: { subGraphId: sg.id },
    })
    console.log(`  - ${sg.name}: ${count} 个节点`)
  }
}

main()
  .then(async () => {
    await prisma.$disconnect()
    console.log('\n✨ 脚本执行成功！')
  })
  .catch(async (e) => {
    console.error('❌ 脚本执行失败:', e)
    await prisma.$disconnect()
    process.exit(1)
  })
