#!/usr/bin/env tsx
/**
 * 重构九个领域的知识图谱
 * 基于市场数据驱动的方法论重新构建图谱结构
 *
 * 九个领域：
 * 1. 新能源车
 * 2. 电池储能
 * 3. 光伏产业
 * 4. 创新药
 * 5. 医疗器械
 * 6. 机器人
 * 7. 消费电子
 * 8. 数字经济
 * 9. 先进材料
 */

import prisma from '../src/lib/db/prisma'

// ==================== 1. 新能源车 ====================
const NEW_ENERGY_VEHICLE_GRAPH = {
  root: {
    id: 'new_energy_vehicle',
    name: '新能源车',
    type: 'domain_index',
    level: 0,
    description: '新能源汽车产业链，涵盖整车、动力系统、智能化',
    metadata: {
      relatedIndex: '399976',
      indexName: '中证新能源汽车指数',
      trackingETFs: [
        { ticker: '515030', name: '新能源车ETF', assets: 200 },
        { ticker: '515790', name: '新能源ETF', assets: 150 }
      ],
      industryChain: 'full',
      investmentTheme: '电动化+智能化双重驱动',
      marketCap: '数万亿',
      growthRate: '20-30% CAGR',
      peakYear: '2025-2030'
    }
  },

  l1: [
    {
      id: 'nev_vehicle',
      name: '整车制造',
      type: 'sector_l1',
      level: 1,
      parentId: 'new_energy_vehicle',
      description: '新能源整车制造，包括纯电动、混动、增程式',
      metadata: {
        relatedIndex: '399976',
        indexName: '中证新能源汽车指数',
        trackingETFs: [{ ticker: '515030', name: '新能源车ETF' }],
        capitalFlowSector: '汽车整车',
        industryChain: 'downstream',
        keyDrivers: ['政策补贴退坡后市场化', '智能化差异化竞争', '出口增长'],
        investmentLogic: '新能源车渗透率持续提升，头部车企份额集中',
        riskFactors: ['价格战', '需求波动', '技术路线分化'],
        cyclicality: 'high',
        volatility: 'high'
      }
    },
    {
      id: 'nev_battery_system',
      name: '动力电池系统',
      type: 'sector_l1',
      level: 1,
      parentId: 'new_energy_vehicle',
      description: '动力电池及电池管理系统',
      metadata: {
        relatedIndex: '399976',
        indexName: '中证新能源汽车指数',
        trackingETFs: [{ ticker: '159755', name: '电池ETF' }],
        capitalFlowSector: '锂电池',
        industryChain: 'midstream',
        keyDrivers: ['装机量增长', '技术迭代', '成本下降'],
        investmentLogic: '动力电池是新能源车核心，头部集中度高',
        riskFactors: ['原材料价格波动', '竞争加剧', '技术路线变化'],
        cyclicality: 'medium',
        volatility: 'high'
      }
    },
    {
      id: 'nev_intelligent',
      name: '智能驾驶',
      type: 'sector_l1',
      level: 1,
      parentId: 'new_energy_vehicle',
      description: '自动驾驶、智能座舱、车联网',
      metadata: {
        relatedIndex: '399976',
        indexName: '中证新能源汽车指数',
        trackingETFs: [{ ticker: '515030', name: '新能源车ETF' }],
        capitalFlowSector: '汽车电子',
        industryChain: 'supporting',
        keyDrivers: ['L2+渗透率提升', '城市NOA落地', '智能座舱升级'],
        investmentLogic: '智能化成为车企差异化竞争关键，零部件价值量提升',
        riskFactors: ['技术瓶颈', '法规限制', '竞争激烈'],
        cyclicality: 'low',
        volatility: 'medium'
      }
    }
  ],

  l2: [
    // 整车制造 (3个)
    {
      id: 'nev_bev',
      name: '纯电动车',
      type: 'subsector_l2',
      level: 2,
      parentId: 'nev_vehicle',
      description: '纯电动汽车(BEV)',
      metadata: {
        relatedIndex: '399976',
        trackingETFs: [{ ticker: '515030', name: '新能源车ETF' }],
        keyDrivers: ['续航里程提升', '充电便利性', '成本平价'],
        keyPlayers: [
          { name: '比亚迪', share: '35%', region: '中国' },
          { name: '特斯拉', share: '20%', region: '美国' },
          { name: '理想汽车', share: '8%', region: '中国' }
        ],
        investmentLogic: 'BEV是主流技术路线，头部车企份额集中',
        riskFactors: ['价格战', '补能焦虑', '二手车残值']
      }
    },
    {
      id: 'nev_phev',
      name: '插电混动',
      type: 'subsector_l2',
      level: 2,
      parentId: 'nev_vehicle',
      description: '插电式混合动力(PHEV/EREV)',
      metadata: {
        relatedIndex: '399976',
        trackingETFs: [{ ticker: '515030', name: '新能源车ETF' }],
        keyDrivers: ['无续航焦虑', '油电同价', '增程技术成熟'],
        keyPlayers: [
          { name: '比亚迪', share: '40%', region: '中国' },
          { name: '理想汽车', share: '25%', region: '中国' },
          { name: '长城汽车', share: '10%', region: '中国' }
        ],
        investmentLogic: 'PHEV/EREV增速快于BEV，适合当前市场需求',
        riskFactors: ['政策支持力度', '技术复杂度', '成本压力']
      }
    },
    {
      id: 'nev_export',
      name: '出口',
      type: 'subsector_l2',
      level: 2,
      parentId: 'nev_vehicle',
      description: '新能源车出口',
      metadata: {
        relatedIndex: '399976',
        trackingETFs: [{ ticker: '515030', name: '新能源车ETF' }],
        keyDrivers: ['欧洲电动化', '东南亚市场', '产业链完整'],
        investmentLogic: '中国新能源车出口快速增长，打开新增长空间',
        riskFactors: ['贸易壁垒', '本地化生产', '品牌认知']
      }
    },

    // 动力电池系统 (4个)
    {
      id: 'nev_battery_cell',
      name: '电芯',
      type: 'subsector_l2',
      level: 2,
      parentId: 'nev_battery_system',
      description: '动力电池电芯制造',
      metadata: {
        relatedIndex: '399976',
        trackingETFs: [{ ticker: '159755', name: '电池ETF' }],
        keyDrivers: ['装机量增长', 'CTP/CTC技术', '固态电池'],
        keyPlayers: [
          { name: '宁德时代', share: '43%', region: '中国' },
          { name: 'LG新能源', share: '14%', region: '韩国' },
          { name: '比亚迪', share: '26%', region: '中国' }
        ],
        investmentLogic: '电芯是动力电池核心，头部集中度持续提升',
        technologies: ['磷酸铁锂', '三元锂', '钠电池', '固态电池'],
        riskFactors: ['原材料成本', '技术路线', '产能过剩']
      }
    },
    {
      id: 'nev_battery_material',
      name: '正负极材料',
      type: 'subsector_l2',
      level: 2,
      parentId: 'nev_battery_system',
      description: '电池正极、负极材料',
      metadata: {
        relatedIndex: '399976',
        trackingETFs: [{ ticker: '159755', name: '电池ETF' }],
        keyDrivers: ['高镍化', '硅负极', '材料创新'],
        investmentLogic: '材料占电池成本50%+，技术迭代带来新机会',
        riskFactors: ['锂价波动', '产能过剩', '技术替代']
      }
    },
    {
      id: 'nev_separator_electrolyte',
      name: '隔膜电解液',
      type: 'subsector_l2',
      level: 2,
      parentId: 'nev_battery_system',
      description: '电池隔膜和电解液',
      metadata: {
        relatedIndex: '399976',
        trackingETFs: [{ ticker: '159755', name: '电池ETF' }],
        keyDrivers: ['安全性要求', '快充需求', '固液混合'],
        investmentLogic: '隔膜和电解液是电池关键材料，技术壁垒高',
        riskFactors: ['价格竞争', '技术路线', '需求波动']
      }
    },
    {
      id: 'nev_bms',
      name: '电池管理系统',
      type: 'subsector_l2',
      level: 2,
      parentId: 'nev_battery_system',
      description: 'BMS电池管理系统',
      metadata: {
        relatedIndex: '399976',
        trackingETFs: [{ ticker: '159755', name: '电池ETF' }],
        keyDrivers: ['电池安全', '寿命管理', '热管理'],
        investmentLogic: 'BMS保障电池安全和性能，智能化程度提升',
        riskFactors: ['芯片供应', '算法门槛', '竞争加剧']
      }
    },

    // 智能驾驶 (4个)
    {
      id: 'nev_adas',
      name: '自动驾驶系统',
      type: 'subsector_l2',
      level: 2,
      parentId: 'nev_intelligent',
      description: 'L2+/L3级自动驾驶系统',
      metadata: {
        relatedIndex: '399976',
        trackingETFs: [{ ticker: '515030', name: '新能源车ETF' }],
        keyDrivers: ['城市NOA', '端到端大模型', '去高精地图'],
        keyPlayers: [
          { name: '华为', share: '30%', region: '中国' },
          { name: '小鹏', share: '20%', region: '中国' },
          { name: '理想', share: '15%', region: '中国' }
        ],
        investmentLogic: 'L2+快速普及，城市NOA成为竞争焦点',
        riskFactors: ['法规监管', '安全责任', '技术瓶颈']
      }
    },
    {
      id: 'nev_sensor',
      name: '感知传感器',
      type: 'subsector_l2',
      level: 2,
      parentId: 'nev_intelligent',
      description: '摄像头、激光雷达、毫米波雷达',
      metadata: {
        relatedIndex: '399976',
        trackingETFs: [{ ticker: '515030', name: '新能源车ETF' }],
        keyDrivers: ['多传感器融合', '激光雷达降本', '高清摄像头'],
        investmentLogic: '传感器是自动驾驶的眼睛，单车价值量持续提升',
        riskFactors: ['技术路线分化', '成本压力', '供应链风险']
      }
    },
    {
      id: 'nev_cockpit',
      name: '智能座舱',
      type: 'subsector_l2',
      level: 2,
      parentId: 'nev_intelligent',
      description: '车载芯片、域控制器、HMI',
      metadata: {
        relatedIndex: '399976',
        trackingETFs: [{ ticker: '515030', name: '新能源车ETF' }],
        keyDrivers: ['多屏联动', 'AI语音助手', '生态应用'],
        investmentLogic: '智能座舱成为用户体验核心，芯片算力升级',
        riskFactors: ['芯片供应', '生态建设', '用户体验']
      }
    },
    {
      id: 'nev_v2x',
      name: '车联网',
      type: 'subsector_l2',
      level: 2,
      parentId: 'nev_intelligent',
      description: 'V2X通信、OTA、车云协同',
      metadata: {
        relatedIndex: '399976',
        trackingETFs: [{ ticker: '515030', name: '新能源车ETF' }],
        keyDrivers: ['5G普及', 'C-V2X标准', 'OTA升级'],
        investmentLogic: '车联网支撑智能驾驶和软件定义汽车',
        riskFactors: ['基础设施建设', '标准统一', '数据安全']
      }
    }
  ]
}

// ==================== 2. 电池储能 ====================
const BATTERY_STORAGE_GRAPH = {
  root: {
    id: 'battery_storage',
    name: '电池储能',
    type: 'domain_index',
    level: 0,
    description: '电化学储能产业链，包括储能系统、电池、逆变器',
    metadata: {
      relatedIndex: '399808',
      indexName: '中证新能源指数',
      trackingETFs: [
        { ticker: '516160', name: '新能源电池ETF', assets: 80 },
        { ticker: '159755', name: '电池ETF', assets: 120 }
      ],
      industryChain: 'full',
      investmentTheme: '新型储能高速增长',
      marketCap: '千亿级',
      growthRate: '50-80% CAGR',
      peakYear: '2024-2028'
    }
  },

  l1: [
    {
      id: 'storage_system',
      name: '储能系统',
      type: 'sector_l1',
      level: 1,
      parentId: 'battery_storage',
      description: '储能系统集成',
      metadata: {
        relatedIndex: '399808',
        trackingETFs: [{ ticker: '516160', name: '新能源电池ETF' }],
        capitalFlowSector: '储能',
        industryChain: 'downstream',
        keyDrivers: ['新能源配储政策', '电价峰谷差', '独立储能电站'],
        investmentLogic: '储能是新能源消纳关键，政策+经济性双驱动',
        riskFactors: ['政策变化', '电池安全', '项目回报率'],
        cyclicality: 'medium',
        volatility: 'high'
      }
    },
    {
      id: 'storage_battery',
      name: '储能电池',
      type: 'sector_l1',
      level: 1,
      parentId: 'battery_storage',
      description: '储能专用电池',
      metadata: {
        relatedIndex: '399808',
        trackingETFs: [{ ticker: '159755', name: '电池ETF' }],
        capitalFlowSector: '锂电池',
        industryChain: 'midstream',
        keyDrivers: ['装机量爆发', '磷酸铁锂主导', '钠电池商用'],
        investmentLogic: '储能电池需求爆发，龙头电池厂加速布局',
        riskFactors: ['价格竞争', '产能过剩', '技术路线'],
        cyclicality: 'medium',
        volatility: 'high'
      }
    },
    {
      id: 'storage_pcs',
      name: '储能变流器',
      type: 'sector_l1',
      level: 1,
      parentId: 'battery_storage',
      description: 'PCS储能变流器',
      metadata: {
        relatedIndex: '399808',
        trackingETFs: [{ ticker: '516160', name: '新能源电池ETF' }],
        capitalFlowSector: '电力设备',
        industryChain: 'supporting',
        keyDrivers: ['储能装机增长', '大功率趋势', '集成化'],
        investmentLogic: 'PCS是储能核心设备，单价高毛利好',
        riskFactors: ['竞争加剧', '技术迭代', '客户集中'],
        cyclicality: 'medium',
        volatility: 'medium'
      }
    }
  ],

  l2: [
    {
      id: 'storage_utility',
      name: '大型储能电站',
      type: 'subsector_l2',
      level: 2,
      parentId: 'storage_system',
      description: '电网侧、电源侧大型储能',
      metadata: {
        relatedIndex: '399808',
        trackingETFs: [{ ticker: '516160', name: '新能源电池ETF' }],
        keyDrivers: ['新能源配储', '独立储能商业模式', '电力现货市场'],
        investmentLogic: '大储是主战场，项目大回报稳定',
        riskFactors: ['政策依赖', '电价机制', '安全风险']
      }
    },
    {
      id: 'storage_commercial',
      name: '工商业储能',
      type: 'subsector_l2',
      level: 2,
      parentId: 'storage_system',
      description: '工商业用户侧储能',
      metadata: {
        relatedIndex: '399808',
        trackingETFs: [{ ticker: '516160', name: '新能源电池ETF' }],
        keyDrivers: ['峰谷电价差', '需量电费管理', '分布式光伏配储'],
        investmentLogic: '工商储经济性好，市场化程度高',
        riskFactors: ['投资回收期', '电池寿命', '运维成本']
      }
    },
    {
      id: 'storage_residential',
      name: '户用储能',
      type: 'subsector_l2',
      level: 2,
      parentId: 'storage_system',
      description: '家庭户用储能系统',
      metadata: {
        relatedIndex: '399808',
        trackingETFs: [{ ticker: '516160', name: '新能源电池ETF' }],
        keyDrivers: ['欧洲能源危机', '光储一体化', '备电需求'],
        investmentLogic: '欧美户储需求强劲，中国企业出口主力',
        riskFactors: ['补贴政策', '能源价格', '库存周期']
      }
    },
    {
      id: 'storage_lfp_battery',
      name: '磷酸铁锂电池',
      type: 'subsector_l2',
      level: 2,
      parentId: 'storage_battery',
      description: '储能主流电池技术',
      metadata: {
        relatedIndex: '399808',
        trackingETFs: [{ ticker: '159755', name: '电池ETF' }],
        keyDrivers: ['安全性好', '循环寿命长', '成本优势'],
        keyPlayers: [
          { name: '宁德时代', share: '40%', region: '中国' },
          { name: '比亚迪', share: '20%', region: '中国' },
          { name: '亿纬锂能', share: '10%', region: '中国' }
        ],
        investmentLogic: '磷酸铁锂是储能最优选择，龙头优势明显',
        riskFactors: ['价格战', '产能过剩', '技术迭代']
      }
    },
    {
      id: 'storage_sodium_battery',
      name: '钠离子电池',
      type: 'subsector_l2',
      level: 2,
      parentId: 'storage_battery',
      description: '新型储能电池',
      metadata: {
        relatedIndex: '399808',
        trackingETFs: [{ ticker: '159755', name: '电池ETF' }],
        keyDrivers: ['资源丰富', '低温性能', '成本优势'],
        investmentLogic: '钠电池商业化加速，适合大型储能',
        riskFactors: ['能量密度低', '产业链不成熟', '市场接受度']
      }
    },
    {
      id: 'storage_liquid_flow',
      name: '液流电池',
      type: 'subsector_l2',
      level: 2,
      parentId: 'storage_battery',
      description: '长时储能技术',
      metadata: {
        relatedIndex: '399808',
        trackingETFs: [{ ticker: '516160', name: '新能源电池ETF' }],
        keyDrivers: ['长时储能需求', '安全性高', '寿命长'],
        investmentLogic: '液流电池适合4小时以上长时储能场景',
        riskFactors: ['成本高', '能量密度低', '产业链不成熟']
      }
    },
    {
      id: 'storage_pcs_device',
      name: 'PCS设备',
      type: 'subsector_l2',
      level: 2,
      parentId: 'storage_pcs',
      description: '储能变流器设备',
      metadata: {
        relatedIndex: '399808',
        trackingETFs: [{ ticker: '516160', name: '新能源电池ETF' }],
        keyDrivers: ['大功率化', '集成化', '智能化'],
        keyPlayers: [
          { name: '阳光电源', share: '30%', region: '中国' },
          { name: '上能电气', share: '15%', region: '中国' },
          { name: '固德威', share: '10%', region: '中国' }
        ],
        investmentLogic: 'PCS技术壁垒高，龙头企业盈利能力强',
        riskFactors: ['竞争加剧', '技术迭代', '原材料成本']
      }
    },
    {
      id: 'storage_ems',
      name: '能量管理系统',
      type: 'subsector_l2',
      level: 2,
      parentId: 'storage_pcs',
      description: 'EMS储能能量管理',
      metadata: {
        relatedIndex: '399808',
        trackingETFs: [{ ticker: '516160', name: '新能源电池ETF' }],
        keyDrivers: ['智能调度', 'AI优化', '电力市场交易'],
        investmentLogic: 'EMS是储能系统大脑，软件价值凸显',
        riskFactors: ['算法门槛', '数据安全', '标准化']
      }
    },
    {
      id: 'storage_bms',
      name: '电池管理系统',
      type: 'subsector_l2',
      level: 2,
      parentId: 'storage_pcs',
      description: 'BMS储能电池管理',
      metadata: {
        relatedIndex: '399808',
        trackingETFs: [{ ticker: '159755', name: '电池ETF' }],
        keyDrivers: ['安全监控', '寿命管理', '热管理'],
        investmentLogic: 'BMS保障储能电池安全，技术要求高',
        riskFactors: ['芯片供应', '技术壁垒', '价格压力']
      }
    }
  ]
}

// ==================== 3. 光伏产业 ====================
const PHOTOVOLTAIC_GRAPH = {
  root: {
    id: 'photovoltaic',
    name: '光伏产业',
    type: 'domain_index',
    level: 0,
    description: '光伏产业链，从硅料到组件到电站',
    metadata: {
      relatedIndex: '931151',
      indexName: '中证全指光伏产业指数',
      trackingETFs: [
        { ticker: '515790', name: '光伏ETF', assets: 180 },
        { ticker: '159857', name: '光伏50ETF', assets: 100 }
      ],
      industryChain: 'full',
      investmentTheme: '全球能源转型主力',
      marketCap: '万亿级',
      growthRate: '15-25% CAGR',
      peakYear: '2025-2035'
    }
  },

  l1: [
    {
      id: 'pv_upstream',
      name: '上游材料',
      type: 'sector_l1',
      level: 1,
      parentId: 'photovoltaic',
      description: '硅料、硅片',
      metadata: {
        relatedIndex: '931151',
        trackingETFs: [{ ticker: '515790', name: '光伏ETF' }],
        capitalFlowSector: '光伏',
        industryChain: 'upstream',
        keyDrivers: ['产能释放', '成本下降', '技术迭代'],
        investmentLogic: '硅料硅片是光伏基础，周期性明显',
        riskFactors: ['产能过剩', '价格波动', '技术路线'],
        cyclicality: 'high',
        volatility: 'high'
      }
    },
    {
      id: 'pv_midstream',
      name: '中游制造',
      type: 'sector_l1',
      level: 1,
      parentId: 'photovoltaic',
      description: '电池片、组件',
      metadata: {
        relatedIndex: '931151',
        trackingETFs: [{ ticker: '515790', name: '光伏ETF' }],
        capitalFlowSector: '光伏',
        industryChain: 'midstream',
        keyDrivers: ['N型技术普及', '组件大尺寸', 'BC电池'],
        investmentLogic: '电池片组件是光伏核心，技术迭代快',
        riskFactors: ['竞争激烈', '产能过剩', '贸易壁垒'],
        cyclicality: 'high',
        volatility: 'high'
      }
    },
    {
      id: 'pv_downstream',
      name: '下游应用',
      type: 'sector_l1',
      level: 1,
      parentId: 'photovoltaic',
      description: '逆变器、电站、运营',
      metadata: {
        relatedIndex: '931151',
        trackingETFs: [{ ticker: '515790', name: '光伏ETF' }],
        capitalFlowSector: '电力设备',
        industryChain: 'downstream',
        keyDrivers: ['分布式光伏', '储能配套', '海外市场'],
        investmentLogic: '下游应用市场化程度高，盈利稳定',
        riskFactors: ['政策变化', '补贴退坡', '电网消纳'],
        cyclicality: 'medium',
        volatility: 'medium'
      }
    }
  ],

  l2: [
    {
      id: 'pv_polysilicon',
      name: '多晶硅',
      type: 'subsector_l2',
      level: 2,
      parentId: 'pv_upstream',
      description: '光伏级多晶硅料',
      metadata: {
        relatedIndex: '931151',
        trackingETFs: [{ ticker: '515790', name: '光伏ETF' }],
        keyDrivers: ['产能集中释放', '成本下降', '技术进步'],
        keyPlayers: [
          { name: '通威股份', share: '30%', region: '中国' },
          { name: '大全能源', share: '20%', region: '中国' },
          { name: '协鑫科技', share: '15%', region: '中国' }
        ],
        investmentLogic: '硅料是光伏基础原料，周期波动大',
        riskFactors: ['产能过剩', '价格暴跌', '需求波动']
      }
    },
    {
      id: 'pv_wafer',
      name: '硅片',
      type: 'subsector_l2',
      level: 2,
      parentId: 'pv_upstream',
      description: '光伏硅片切割',
      metadata: {
        relatedIndex: '931151',
        trackingETFs: [{ ticker: '515790', name: '光伏ETF' }],
        keyDrivers: ['大尺寸化', '薄片化', 'N型硅片'],
        keyPlayers: [
          { name: '隆基绿能', share: '40%', region: '中国' },
          { name: '中环股份', share: '25%', region: '中国' },
          { name: '上机数控', share: '10%', region: '中国' }
        ],
        investmentLogic: '硅片是产业链枢纽，龙头一体化优势',
        riskFactors: ['价格战', '产能过剩', '技术路线']
      }
    },
    {
      id: 'pv_equipment',
      name: '光伏设备',
      type: 'subsector_l2',
      level: 2,
      parentId: 'pv_upstream',
      description: '硅片、电池片制造设备',
      metadata: {
        relatedIndex: '931151',
        trackingETFs: [{ ticker: '515790', name: '光伏ETF' }],
        keyDrivers: ['扩产周期', '设备国产化', 'N型设备'],
        investmentLogic: '光伏设备受益产能扩张，国产替代加速',
        riskFactors: ['产能周期', '技术迭代', '客户集中']
      }
    },
    {
      id: 'pv_topcon',
      name: 'TOPCon电池',
      type: 'subsector_l2',
      level: 2,
      parentId: 'pv_midstream',
      description: 'TOPCon N型电池',
      metadata: {
        relatedIndex: '931151',
        trackingETFs: [{ ticker: '515790', name: '光伏ETF' }],
        keyDrivers: ['效率提升', '成本下降', '产能释放'],
        investmentLogic: 'TOPCon成为N型主流，2024年占比超50%',
        riskFactors: ['产能过剩', 'BC技术竞争', '价格战']
      }
    },
    {
      id: 'pv_hjt',
      name: 'HJT电池',
      type: 'subsector_l2',
      level: 2,
      parentId: 'pv_midstream',
      description: 'HJT异质结电池',
      metadata: {
        relatedIndex: '931151',
        trackingETFs: [{ ticker: '515790', name: '光伏ETF' }],
        keyDrivers: ['效率天花板高', '工艺简化', '降本路径'],
        investmentLogic: 'HJT是终极技术路线，降本后有望逆袭',
        riskFactors: ['成本高', '产业链不成熟', '市场占比低']
      }
    },
    {
      id: 'pv_bc',
      name: 'BC电池',
      type: 'subsector_l2',
      level: 2,
      parentId: 'pv_midstream',
      description: 'BC背接触电池',
      metadata: {
        relatedIndex: '931151',
        trackingETFs: [{ ticker: '515790', name: '光伏ETF' }],
        keyDrivers: ['效率最高', '美观', '分布式应用'],
        investmentLogic: 'BC电池效率领先，隆基重注',
        riskFactors: ['成本高', '工艺复杂', '产能爬坡']
      }
    },
    {
      id: 'pv_module',
      name: '光伏组件',
      type: 'subsector_l2',
      level: 2,
      parentId: 'pv_midstream',
      description: '光伏组件封装',
      metadata: {
        relatedIndex: '931151',
        trackingETFs: [{ ticker: '515790', name: '光伏ETF' }],
        keyDrivers: ['一体化趋势', '海外产能', '品牌溢价'],
        keyPlayers: [
          { name: '晶科能源', share: '20%', region: '中国' },
          { name: '天合光能', share: '18%', region: '中国' },
          { name: '隆基绿能', share: '16%', region: '中国' }
        ],
        investmentLogic: '组件是产业链终端，一体化龙头优势明显',
        riskFactors: ['价格战', '贸易壁垒', '汇率波动']
      }
    },
    {
      id: 'pv_inverter',
      name: '光伏逆变器',
      type: 'subsector_l2',
      level: 2,
      parentId: 'pv_downstream',
      description: '光伏并网逆变器',
      metadata: {
        relatedIndex: '931151',
        trackingETFs: [{ ticker: '515790', name: '光伏ETF' }],
        keyDrivers: ['微逆增长', '储能一体化', '海外市场'],
        keyPlayers: [
          { name: '阳光电源', share: '35%', region: '中国' },
          { name: '华为', share: '20%', region: '中国' },
          { name: '锦浪科技', share: '10%', region: '中国' }
        ],
        investmentLogic: '逆变器是光伏必备，龙头盈利能力强',
        riskFactors: ['竞争加剧', '价格压力', '技术迭代']
      }
    },
    {
      id: 'pv_station',
      name: '光伏电站',
      type: 'subsector_l2',
      level: 2,
      parentId: 'pv_downstream',
      description: '集中式/分布式光伏电站',
      metadata: {
        relatedIndex: '931151',
        trackingETFs: [{ ticker: '515790', name: '光伏ETF' }],
        keyDrivers: ['装机量增长', '电价市场化', '绿电交易'],
        investmentLogic: '电站运营稳定，现金流好',
        riskFactors: ['补贴退坡', '电网消纳', '土地资源']
      }
    },
    {
      id: 'pv_tracker',
      name: '跟踪支架',
      type: 'subsector_l2',
      level: 2,
      parentId: 'pv_downstream',
      description: '智能跟踪支架系统',
      metadata: {
        relatedIndex: '931151',
        trackingETFs: [{ ticker: '515790', name: '光伏ETF' }],
        keyDrivers: ['发电量提升', '平价上网', '大基地项目'],
        investmentLogic: '跟踪支架提升发电效率10-20%，渗透率提升',
        riskFactors: ['成本压力', '维护复杂', '地形限制']
      }
    }
  ]
}

// ==================== 4. 创新药 ====================
const INNOVATIVE_DRUG_GRAPH = {
  root: {
    id: 'innovative_drug',
    name: '创新药',
    type: 'domain_index',
    level: 0,
    description: '创新药研发与生产产业链',
    metadata: {
      relatedIndex: '931152',
      indexName: '中证创新药产业指数',
      trackingETFs: [
        { ticker: '159992', name: '创新药ETF', assets: 150 },
        { ticker: '159858', name: '医药ETF', assets: 200 }
      ],
      industryChain: 'full',
      investmentTheme: '创新药黄金时代',
      marketCap: '万亿级',
      growthRate: '15-25% CAGR',
      peakYear: '2025-2035'
    }
  },

  l1: [
    {
      id: 'drug_rd',
      name: '药物研发',
      type: 'sector_l1',
      level: 1,
      parentId: 'innovative_drug',
      description: '创新药研发与临床',
      metadata: {
        relatedIndex: '931152',
        trackingETFs: [{ ticker: '159992', name: '创新药ETF' }],
        capitalFlowSector: '医药',
        industryChain: 'upstream',
        keyDrivers: ['创新药管线', 'License-in', '临床进展'],
        investmentLogic: '创新药是未来，研发管线决定公司价值',
        riskFactors: ['研发失败', '临床周期长', '集采压力'],
        cyclicality: 'low',
        volatility: 'high'
      }
    },
    {
      id: 'drug_production',
      name: '生产制造',
      type: 'sector_l1',
      level: 1,
      parentId: 'innovative_drug',
      description: '药品生产与CMO/CDMO',
      metadata: {
        relatedIndex: '931152',
        trackingETFs: [{ ticker: '159992', name: '创新药ETF' }],
        capitalFlowSector: 'CXO',
        industryChain: 'midstream',
        keyDrivers: ['CDMO需求', '产能建设', '质量体系'],
        investmentLogic: 'CDMO是确定性赛道，头部公司盈利能力强',
        riskFactors: ['客户集中', '产能过剩', '监管风险'],
        cyclicality: 'low',
        volatility: 'medium'
      }
    },
    {
      id: 'drug_cxo',
      name: 'CXO服务',
      type: 'sector_l1',
      level: 1,
      parentId: 'innovative_drug',
      description: 'CRO/CDMO外包服务',
      metadata: {
        relatedIndex: '931152',
        trackingETFs: [{ ticker: '159992', name: '创新药ETF' }],
        capitalFlowSector: 'CXO',
        industryChain: 'supporting',
        keyDrivers: ['全球外包趋势', '中国产能优势', '一体化服务'],
        investmentLogic: 'CXO是卖铲子生意，确定性高',
        riskFactors: ['客户流失', '国际关系', '产能投资'],
        cyclicality: 'low',
        volatility: 'medium'
      }
    }
  ],

  l2: [
    {
      id: 'drug_antibody',
      name: '抗体药物',
      type: 'subsector_l2',
      level: 2,
      parentId: 'drug_rd',
      description: '单抗、双抗药物',
      metadata: {
        relatedIndex: '931152',
        trackingETFs: [{ ticker: '159992', name: '创新药ETF' }],
        keyDrivers: ['靶点创新', 'PD-1/PD-L1', 'ADC药物'],
        investmentLogic: '抗体药是肿瘤治疗主力，市场空间大',
        riskFactors: ['集采降价', '研发竞争', 'Me-too过剩']
      }
    },
    {
      id: 'drug_adc',
      name: 'ADC药物',
      type: 'subsector_l2',
      level: 2,
      parentId: 'drug_rd',
      description: '抗体偶联药物',
      metadata: {
        relatedIndex: '931152',
        trackingETFs: [{ ticker: '159992', name: '创新药ETF' }],
        keyDrivers: ['精准治疗', '靶点扩展', '新技术平台'],
        investmentLogic: 'ADC是下一代肿瘤药，管线价值高',
        riskFactors: ['技术门槛', '安全性', '专利纠纷']
      }
    },
    {
      id: 'drug_small_molecule',
      name: '小分子药物',
      type: 'subsector_l2',
      level: 2,
      parentId: 'drug_rd',
      description: '化学创新药',
      metadata: {
        relatedIndex: '931152',
        trackingETFs: [{ ticker: '159992', name: '创新药ETF' }],
        keyDrivers: ['靶点创新', 'First-in-class', '改良新药'],
        investmentLogic: '小分子仍是主流，口服便利性优势',
        riskFactors: ['集采压力', '仿制药竞争', '研发难度']
      }
    },
    {
      id: 'drug_cell_gene',
      name: '细胞基因治疗',
      type: 'subsector_l2',
      level: 2,
      parentId: 'drug_rd',
      description: 'CAR-T、基因治疗',
      metadata: {
        relatedIndex: '931152',
        trackingETFs: [{ ticker: '159992', name: '创新药ETF' }],
        keyDrivers: ['治愈性疗法', '罕见病', '适应症扩展'],
        investmentLogic: '细胞基因治疗是前沿方向，颠覆性潜力',
        riskFactors: ['成本高', '技术难度', '安全性']
      }
    },
    {
      id: 'drug_cdmo',
      name: 'CDMO',
      type: 'subsector_l2',
      level: 2,
      parentId: 'drug_production',
      description: '药品定制研发生产',
      metadata: {
        relatedIndex: '931152',
        trackingETFs: [{ ticker: '159992', name: '创新药ETF' }],
        keyDrivers: ['全球外包', '大分子CDMO', '产能扩张'],
        keyPlayers: [
          { name: '药明生物', share: '25%', region: '中国' },
          { name: '凯莱英', share: '15%', region: '中国' },
          { name: '博腾股份', share: '10%', region: '中国' }
        ],
        investmentLogic: 'CDMO享受创新药红利，不承担研发风险',
        riskFactors: ['客户集中', '产能过剩', '监管变化']
      }
    },
    {
      id: 'drug_cmo',
      name: 'CMO',
      type: 'subsector_l2',
      level: 2,
      parentId: 'drug_production',
      description: '药品委托生产',
      metadata: {
        relatedIndex: '931152',
        trackingETFs: [{ ticker: '159992', name: '创新药ETF' }],
        keyDrivers: ['商业化生产', '产能利用率', '质量体系'],
        investmentLogic: 'CMO是成熟业务，稳定现金流',
        riskFactors: ['价格压力', '客户流失', '产能闲置']
      }
    },
    {
      id: 'drug_raw_material',
      name: '原料药',
      type: 'subsector_l2',
      level: 2,
      parentId: 'drug_production',
      description: '创新药原料药',
      metadata: {
        relatedIndex: '931152',
        trackingETFs: [{ ticker: '159992', name: '创新药ETF' }],
        keyDrivers: ['专利到期', '仿制药放量', '绿色合成'],
        investmentLogic: '原料药是基础，中国企业成本优势明显',
        riskFactors: ['环保压力', '价格波动', '技术壁垒']
      }
    },
    {
      id: 'drug_cro',
      name: 'CRO',
      type: 'subsector_l2',
      level: 2,
      parentId: 'drug_cxo',
      description: '临床研究外包',
      metadata: {
        relatedIndex: '931152',
        trackingETFs: [{ ticker: '159992', name: '创新药ETF' }],
        keyDrivers: ['临床试验需求', '国际多中心', 'AI赋能'],
        keyPlayers: [
          { name: '药明康德', share: '20%', region: '中国' },
          { name: '泰格医药', share: '15%', region: '中国' },
          { name: '康龙化成', share: '10%', region: '中国' }
        ],
        investmentLogic: 'CRO是创新药必经环节，需求持续增长',
        riskFactors: ['客户预算', '国际关系', '人才流失']
      }
    },
    {
      id: 'drug_preclinical',
      name: '临床前CRO',
      type: 'subsector_l2',
      level: 2,
      parentId: 'drug_cxo',
      description: '药物发现与临床前研究',
      metadata: {
        relatedIndex: '931152',
        trackingETFs: [{ ticker: '159992', name: '创新药ETF' }],
        keyDrivers: ['靶点发现', '化合物筛选', 'DMPK服务'],
        investmentLogic: '临床前是创新药起点，技术壁垒高',
        riskFactors: ['研发周期', '成功率低', '客户集中']
      }
    }
  ]
}

// ==================== 5. 医疗器械 ====================
const MEDICAL_DEVICE_GRAPH = {
  root: {
    id: 'medical_device',
    name: '医疗器械',
    type: 'domain_index',
    level: 0,
    description: '医疗器械产业链，包括设备、耗材、IVD',
    metadata: {
      relatedIndex: '931153',
      indexName: '中证医疗器械指数',
      trackingETFs: [
        { ticker: '159883', name: '医疗器械ETF', assets: 100 }
      ],
      industryChain: 'full',
      investmentTheme: '医疗器械国产替代',
      marketCap: '千亿级',
      growthRate: '15-20% CAGR',
      peakYear: '2025-2030'
    }
  },

  l1: [
    {
      id: 'device_equipment',
      name: '医疗设备',
      type: 'sector_l1',
      level: 1,
      parentId: 'medical_device',
      description: '影像设备、手术设备',
      metadata: {
        relatedIndex: '931153',
        trackingETFs: [{ ticker: '159883', name: '医疗器械ETF' }],
        capitalFlowSector: '医疗器械',
        industryChain: 'upstream',
        keyDrivers: ['国产替代', '基层医疗', '智能化'],
        investmentLogic: '高端医疗设备国产化加速，进口替代空间大',
        riskFactors: ['集采降价', '技术壁垒', '渠道建设'],
        cyclicality: 'low',
        volatility: 'medium'
      }
    },
    {
      id: 'device_consumable',
      name: '高值耗材',
      type: 'sector_l1',
      level: 1,
      parentId: 'medical_device',
      description: '心血管、骨科等高值耗材',
      metadata: {
        relatedIndex: '931153',
        trackingETFs: [{ ticker: '159883', name: '医疗器械ETF' }],
        capitalFlowSector: '医疗器械',
        industryChain: 'midstream',
        keyDrivers: ['老龄化', '手术量增长', '创新产品'],
        investmentLogic: '高值耗材需求刚性，集采后龙头集中度提升',
        riskFactors: ['集采降价', '临床准入', '竞争加剧'],
        cyclicality: 'low',
        volatility: 'medium'
      }
    },
    {
      id: 'device_ivd',
      name: '体外诊断',
      type: 'sector_l1',
      level: 1,
      parentId: 'medical_device',
      description: 'IVD诊断设备与试剂',
      metadata: {
        relatedIndex: '931153',
        trackingETFs: [{ ticker: '159883', name: '医疗器械ETF' }],
        capitalFlowSector: '医疗器械',
        industryChain: 'supporting',
        keyDrivers: ['检测需求', '精准医疗', '分子诊断'],
        investmentLogic: 'IVD是医疗检测基础，耗材属性带来持续收入',
        riskFactors: ['集采压力', '技术迭代', '进口竞争'],
        cyclicality: 'low',
        volatility: 'low'
      }
    }
  ],

  l2: [
    {
      id: 'device_imaging',
      name: '医学影像',
      type: 'subsector_l2',
      level: 2,
      parentId: 'device_equipment',
      description: 'CT、MRI、超声等影像设备',
      metadata: {
        relatedIndex: '931153',
        trackingETFs: [{ ticker: '159883', name: '医疗器械ETF' }],
        keyDrivers: ['国产替代', 'AI辅助诊断', '基层配置'],
        investmentLogic: '影像设备是大型医疗设备核心，国产品牌崛起',
        riskFactors: ['技术差距', '品牌认知', '售后服务']
      }
    },
    {
      id: 'device_surgical_robot',
      name: '手术机器人',
      type: 'subsector_l2',
      level: 2,
      parentId: 'device_equipment',
      description: '微创手术机器人',
      metadata: {
        relatedIndex: '931153',
        trackingETFs: [{ ticker: '159883', name: '医疗器械ETF' }],
        keyDrivers: ['微创化趋势', '技术突破', '临床推广'],
        investmentLogic: '手术机器人是未来方向，国产突破进口垄断',
        riskFactors: ['研发周期长', '临床培训', '成本高']
      }
    },
    {
      id: 'device_monitoring',
      name: '监护设备',
      type: 'subsector_l2',
      level: 2,
      parentId: 'device_equipment',
      description: '生命体征监护设备',
      metadata: {
        relatedIndex: '931153',
        trackingETFs: [{ ticker: '159883', name: '医疗器械ETF' }],
        keyDrivers: ['ICU需求', '远程监护', '可穿戴化'],
        investmentLogic: '监护设备需求稳定，国产品牌已占主导',
        riskFactors: ['价格竞争', '技术迭代', '市场饱和']
      }
    },
    {
      id: 'device_cardiovascular',
      name: '心血管介入',
      type: 'subsector_l2',
      level: 2,
      parentId: 'device_consumable',
      description: '支架、球囊等心血管耗材',
      metadata: {
        relatedIndex: '931153',
        trackingETFs: [{ ticker: '159883', name: '医疗器械ETF' }],
        keyDrivers: ['患者基数大', '创新产品', '集采后稳定'],
        investmentLogic: '心血管介入是最大高值耗材市场，集采后龙头集中',
        riskFactors: ['集采降价', '创新不足', '术式变化']
      }
    },
    {
      id: 'device_orthopedic',
      name: '骨科植入',
      type: 'subsector_l2',
      level: 2,
      parentId: 'device_consumable',
      description: '人工关节、脊柱等骨科耗材',
      metadata: {
        relatedIndex: '931153',
        trackingETFs: [{ ticker: '159883', name: '医疗器械ETF' }],
        keyDrivers: ['老龄化', '运动医学', '创新材料'],
        investmentLogic: '骨科耗材增长稳定，集采影响后逐步恢复',
        riskFactors: ['集采降价', '手术量波动', '学术推广']
      }
    },
    {
      id: 'device_dental',
      name: '口腔医疗',
      type: 'subsector_l2',
      level: 2,
      parentId: 'device_consumable',
      description: '种植体、正畸等口腔耗材',
      metadata: {
        relatedIndex: '931153',
        trackingETFs: [{ ticker: '159883', name: '医疗器械ETF' }],
        keyDrivers: ['消费升级', '正畸需求', '种植集采'],
        investmentLogic: '口腔医疗消费属性强，民营连锁发展快',
        riskFactors: ['种植集采', '价格敏感', '竞争激烈']
      }
    },
    {
      id: 'device_molecular_diagnosis',
      name: '分子诊断',
      type: 'subsector_l2',
      level: 2,
      parentId: 'device_ivd',
      description: 'PCR、测序等分子诊断',
      metadata: {
        relatedIndex: '931153',
        trackingETFs: [{ ticker: '159883', name: '医疗器械ETF' }],
        keyDrivers: ['精准医疗', '肿瘤筛查', 'NGS降本'],
        investmentLogic: '分子诊断是高端IVD，技术壁垒高增长快',
        riskFactors: ['集采压力', '技术迭代', '政策变化']
      }
    },
    {
      id: 'device_immunoassay',
      name: '免疫诊断',
      type: 'subsector_l2',
      level: 2,
      parentId: 'device_ivd',
      description: '化学发光等免疫诊断',
      metadata: {
        relatedIndex: '931153',
        trackingETFs: [{ ticker: '159883', name: '医疗器械ETF' }],
        keyDrivers: ['装机量增长', '试剂放量', '国产替代'],
        investmentLogic: '免疫诊断是IVD最大市场，国产品牌份额提升',
        riskFactors: ['集采降价', '装机放缓', '竞争加剧']
      }
    },
    {
      id: 'device_poct',
      name: 'POCT即时检测',
      type: 'subsector_l2',
      level: 2,
      parentId: 'device_ivd',
      description: '即时检测设备与试剂',
      metadata: {
        relatedIndex: '931153',
        trackingETFs: [{ ticker: '159883', name: '医疗器械ETF' }],
        keyDrivers: ['基层医疗', '家用检测', '便携化'],
        investmentLogic: 'POCT满足快速检测需求，应用场景广泛',
        riskFactors: ['精度要求', '价格敏感', '渠道建设']
      }
    }
  ]
}

// ==================== 6. 机器人 ====================
const ROBOTICS_GRAPH = {
  root: {
    id: 'robotics',
    name: '机器人',
    type: 'domain_index',
    level: 0,
    description: '机器人产业链，包括工业、服务、人形机器人',
    metadata: {
      relatedIndex: '931770',
      indexName: '中证机器人指数',
      trackingETFs: [
        { ticker: '159770', name: '机器人ETF', assets: 80 },
        { ticker: '562500', name: '人形机器人ETF', assets: 50 }
      ],
      industryChain: 'full',
      investmentTheme: '自动化+人形机器人',
      marketCap: '千亿级',
      growthRate: '20-30% CAGR',
      peakYear: '2025-2035'
    }
  },

  l1: [
    {
      id: 'robotics_industrial',
      name: '工业机器人',
      type: 'sector_l1',
      level: 1,
      parentId: 'robotics',
      description: '工业自动化机器人',
      metadata: {
        relatedIndex: '931770',
        trackingETFs: [{ ticker: '159770', name: '机器人ETF' }],
        capitalFlowSector: '机器人',
        industryChain: 'midstream',
        keyDrivers: ['制造业升级', '人工替代', '柔性生产'],
        investmentLogic: '工业机器人渗透率持续提升，国产替代加速',
        riskFactors: ['经济周期', '价格战', '技术差距'],
        cyclicality: 'high',
        volatility: 'medium'
      }
    },
    {
      id: 'robotics_service',
      name: '服务机器人',
      type: 'sector_l1',
      level: 1,
      parentId: 'robotics',
      description: '服务型机器人',
      metadata: {
        relatedIndex: '931770',
        trackingETFs: [{ ticker: '159770', name: '机器人ETF' }],
        capitalFlowSector: '机器人',
        industryChain: 'downstream',
        keyDrivers: ['人口老龄化', '劳动力短缺', '技术成熟'],
        investmentLogic: '服务机器人应用场景多元化，市场空间大',
        riskFactors: ['商业模式', '技术成熟度', '成本高'],
        cyclicality: 'low',
        volatility: 'medium'
      }
    },
    {
      id: 'robotics_components',
      name: '核心零部件',
      type: 'sector_l1',
      level: 1,
      parentId: 'robotics',
      description: '减速器、伺服、控制器',
      metadata: {
        relatedIndex: '931770',
        trackingETFs: [{ ticker: '159770', name: '机器人ETF' }],
        capitalFlowSector: '机器人',
        industryChain: 'upstream',
        keyDrivers: ['国产替代', '技术突破', '降本增效'],
        investmentLogic: '核心零部件是机器人价值核心，国产化突破带来机会',
        riskFactors: ['技术壁垒', '进口依赖', '价格压力'],
        cyclicality: 'medium',
        volatility: 'medium'
      }
    }
  ],

  l2: [
    {
      id: 'robotics_welding',
      name: '焊接机器人',
      type: 'subsector_l2',
      level: 2,
      parentId: 'robotics_industrial',
      description: '工业焊接机器人',
      metadata: {
        relatedIndex: '931770',
        trackingETFs: [{ ticker: '159770', name: '机器人ETF' }],
        keyDrivers: ['汽车制造', '3C电子', '焊接质量'],
        investmentLogic: '焊接是工业机器人最大应用，需求稳定',
        riskFactors: ['经济周期', '技术迭代', '竞争激烈']
      }
    },
    {
      id: 'robotics_handling',
      name: '搬运码垛',
      type: 'subsector_l2',
      level: 2,
      parentId: 'robotics_industrial',
      description: '物流搬运码垛机器人',
      metadata: {
        relatedIndex: '931770',
        trackingETFs: [{ ticker: '159770', name: '机器人ETF' }],
        keyDrivers: ['电商物流', '智能仓储', 'AGV/AMR'],
        investmentLogic: '物流自动化快速发展，搬运机器人需求旺盛',
        riskFactors: ['价格战', '技术同质化', '客户集中']
      }
    },
    {
      id: 'robotics_assembly',
      name: '装配机器人',
      type: 'subsector_l2',
      level: 2,
      parentId: 'robotics_industrial',
      description: '精密装配机器人',
      metadata: {
        relatedIndex: '931770',
        trackingETFs: [{ ticker: '159770', name: '机器人ETF' }],
        keyDrivers: ['3C电子', '精密制造', '柔性产线'],
        investmentLogic: '装配机器人技术要求高，国产化空间大',
        riskFactors: ['技术难度', '客户认证', '投资回收期']
      }
    },
    {
      id: 'robotics_humanoid',
      name: '人形机器人',
      type: 'subsector_l2',
      level: 2,
      parentId: 'robotics_service',
      description: '通用人形机器人',
      metadata: {
        relatedIndex: '931770',
        trackingETFs: [{ ticker: '562500', name: '人形机器人ETF' }],
        keyDrivers: ['具身智能', 'AI大模型', '通用性'],
        keyPlayers: [
          { name: 'Tesla Optimus', share: '30%', region: '美国' },
          { name: '小米CyberOne', share: '10%', region: '中国' },
          { name: '优必选', share: '8%', region: '中国' }
        ],
        investmentLogic: '人形机器人是终极形态，产业化加速',
        riskFactors: ['技术成熟度', '成本高', '应用场景']
      }
    },
    {
      id: 'robotics_cleaning',
      name: '清洁机器人',
      type: 'subsector_l2',
      level: 2,
      parentId: 'robotics_service',
      description: '商用/家用清洁机器人',
      metadata: {
        relatedIndex: '931770',
        trackingETFs: [{ ticker: '159770', name: '机器人ETF' }],
        keyDrivers: ['扫地机器人普及', '商用清洁', '智能化'],
        investmentLogic: '清洁机器人是服务机器人最成熟市场',
        riskFactors: ['市场饱和', '价格战', '技术迭代']
      }
    },
    {
      id: 'robotics_medical',
      name: '医疗机器人',
      type: 'subsector_l2',
      level: 2,
      parentId: 'robotics_service',
      description: '手术、康复机器人',
      metadata: {
        relatedIndex: '931770',
        trackingETFs: [{ ticker: '159770', name: '机器人ETF' }],
        keyDrivers: ['微创手术', '康复需求', '临床认可'],
        investmentLogic: '医疗机器人技术壁垒高，市场空间大',
        riskFactors: ['临床认证', '学习曲线', '高价格']
      }
    },
    {
      id: 'robotics_reducer',
      name: '减速器',
      type: 'subsector_l2',
      level: 2,
      parentId: 'robotics_components',
      description: 'RV/谐波减速器',
      metadata: {
        relatedIndex: '931770',
        trackingETFs: [{ ticker: '159770', name: '机器人ETF' }],
        keyDrivers: ['国产替代', '精度提升', '降本'],
        investmentLogic: '减速器是机器人核心部件，国产化突破关键',
        riskFactors: ['技术差距', '品牌认知', '价格压力']
      }
    },
    {
      id: 'robotics_servo',
      name: '伺服系统',
      type: 'subsector_l2',
      level: 2,
      parentId: 'robotics_components',
      description: '伺服电机与驱动器',
      metadata: {
        relatedIndex: '931770',
        trackingETFs: [{ ticker: '159770', name: '机器人ETF' }],
        keyDrivers: ['高性能需求', '国产替代', '一体化'],
        investmentLogic: '伺服系统是运动控制核心，国产品牌崛起',
        riskFactors: ['技术壁垒', '进口品牌', '价格竞争']
      }
    },
    {
      id: 'robotics_controller',
      name: '控制器',
      type: 'subsector_l2',
      level: 2,
      parentId: 'robotics_components',
      description: '机器人控制系统',
      metadata: {
        relatedIndex: '931770',
        trackingETFs: [{ ticker: '159770', name: '机器人ETF' }],
        keyDrivers: ['算法优化', '开源生态', 'AI融合'],
        investmentLogic: '控制器是机器人大脑，软件价值提升',
        riskFactors: ['算法门槛', '生态建设', '客户粘性']
      }
    }
  ]
}

// PLACEHOLDER_FOR_MORE_DOMAINS_4

async function main() {
  console.log('=== 开始重构九个领域的知识图谱 ===\n')

  const domains = [
    { name: '新能源车', graph: NEW_ENERGY_VEHICLE_GRAPH },
    { name: '电池储能', graph: BATTERY_STORAGE_GRAPH },
    { name: '光伏产业', graph: PHOTOVOLTAIC_GRAPH },
    { name: '创新药', graph: INNOVATIVE_DRUG_GRAPH },
    { name: '医疗器械', graph: MEDICAL_DEVICE_GRAPH },
    { name: '机器人', graph: ROBOTICS_GRAPH },
  ]

  for (const domain of domains) {
    console.log(`\n📊 处理领域: ${domain.name}`)
    await rebuildDomain(domain.graph)
  }

  console.log('\n✅ 所有领域重构完成！')
  await prisma.$disconnect()
}

async function rebuildDomain(graph: any) {
  const rootId = graph.root.id

  // 检查是否已存在
  const existing = await prisma.graphNode.findUnique({
    where: { id: rootId }
  })

  if (existing) {
    console.log(`   ⚠️  ${graph.root.name} 已存在，跳过`)
    return
  }

  // 创建L0根节点
  await prisma.graphNode.create({
    data: {
      ...graph.root,
      metadata: JSON.stringify(graph.root.metadata)
    }
  })
  console.log(`   ✅ 创建根节点: ${graph.root.name}`)

  // 创建L1节点
  for (const node of graph.l1) {
    await prisma.graphNode.create({
      data: {
        ...node,
        metadata: JSON.stringify(node.metadata)
      }
    })
    console.log(`   ✅ 创建L1: ${node.name}`)
  }

  // 创建L2节点
  for (const node of graph.l2) {
    await prisma.graphNode.create({
      data: {
        ...node,
        metadata: JSON.stringify(node.metadata)
      }
    })
  }
  console.log(`   ✅ 创建 ${graph.l2.length} 个L2节点`)
}

main()
