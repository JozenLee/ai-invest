// ==================== 9. 先进材料 ====================
export const ADVANCED_MATERIALS_GRAPH = {
  root: {
    id: 'advanced_materials',
    name: '先进材料',
    type: 'domain_index',
    level: 0,
    description: '先进材料产业链，包括新材料、化工材料、金属材料',
    metadata: {
      relatedIndex: '399441',
      indexName: '中证新材料主题指数',
      trackingETFs: [
        { ticker: '159856', name: '新材料ETF', assets: 60 }
      ],
      industryChain: 'full',
      investmentTheme: '材料技术突破与国产替代',
      marketCap: '千亿级',
      growthRate: '12-18% CAGR',
      peakYear: '2025-2030'
    }
  },

  l1: [
    {
      id: 'materials_electronic',
      name: '电子材料',
      type: 'sector_l1',
      level: 1,
      parentId: 'advanced_materials',
      description: '半导体、显示等电子材料',
      metadata: {
        relatedIndex: '399441',
        trackingETFs: [{ ticker: '159856', name: '新材料ETF' }],
        capitalFlowSector: '新材料',
        industryChain: 'upstream',
        keyDrivers: ['半导体国产化', '面板材料', '5G材料'],
        investmentLogic: '电子材料是高端制造基础，国产替代空间大',
        riskFactors: ['技术壁垒', '认证周期长', '客户集中'],
        cyclicality: 'high',
        volatility: 'high'
      }
    },
    {
      id: 'materials_energy',
      name: '能源材料',
      type: 'sector_l1',
      level: 1,
      parentId: 'advanced_materials',
      description: '锂电、光伏等能源材料',
      metadata: {
        relatedIndex: '399441',
        trackingETFs: [{ ticker: '159856', name: '新材料ETF' }],
        capitalFlowSector: '新材料',
        industryChain: 'midstream',
        keyDrivers: ['新能源需求', '技术迭代', '降本增效'],
        investmentLogic: '能源材料受益新能源发展，增长确定性高',
        riskFactors: ['产能过剩', '价格波动', '技术路线'],
        cyclicality: 'high',
        volatility: 'high'
      }
    },
    {
      id: 'materials_structural',
      name: '结构材料',
      type: 'sector_l1',
      level: 1,
      parentId: 'advanced_materials',
      description: '碳纤维、钛合金等结构材料',
      metadata: {
        relatedIndex: '399441',
        trackingETFs: [{ ticker: '159856', name: '新材料ETF' }],
        capitalFlowSector: '新材料',
        industryChain: 'supporting',
        keyDrivers: ['轻量化', '航空航天', '新能源车'],
        investmentLogic: '结构材料是高端应用关键，技术壁垒高',
        riskFactors: ['应用推广', '成本高', '工艺复杂'],
        cyclicality: 'low',
        volatility: 'medium'
      }
    }
  ],

  l2: [
    {
      id: 'materials_semiconductor',
      name: '半导体材料',
      type: 'subsector_l2',
      level: 2,
      parentId: 'materials_electronic',
      description: '硅片、光刻胶、电子气体等',
      metadata: {
        relatedIndex: '399441',
        trackingETFs: [{ ticker: '159856', name: '新材料ETF' }],
        keyDrivers: ['晶圆厂扩产', '国产替代', '先进制程'],
        investmentLogic: '半导体材料是芯片制造基础，国产化加速',
        riskFactors: ['认证周期长', '技术差距', '客户集中']
      }
    },
    {
      id: 'materials_display',
      name: '显示材料',
      type: 'subsector_l2',
      level: 2,
      parentId: 'materials_electronic',
      description: 'OLED材料、液晶材料等',
      metadata: {
        relatedIndex: '399441',
        trackingETFs: [{ ticker: '159856', name: '新材料ETF' }],
        keyDrivers: ['OLED普及', '柔性显示', '材料国产化'],
        investmentLogic: '显示材料受益OLED渗透，国产突破加速',
        riskFactors: ['韩国垄断', '专利壁垒', '需求波动']
      }
    },
    {
      id: 'materials_pcb',
      name: 'PCB材料',
      type: 'subsector_l2',
      level: 2,
      parentId: 'materials_electronic',
      description: '覆铜板、树脂等PCB材料',
      metadata: {
        relatedIndex: '399441',
        trackingETFs: [{ ticker: '159856', name: '新材料ETF' }],
        keyDrivers: ['高频高速', '5G通信', 'AI服务器'],
        investmentLogic: 'PCB材料受益电子制造升级，国产品牌份额高',
        riskFactors: ['原材料成本', '环保压力', '竞争激烈']
      }
    },
    {
      id: 'materials_battery_cathode',
      name: '电池正极材料',
      type: 'subsector_l2',
      level: 2,
      parentId: 'materials_energy',
      description: '三元、磷酸铁锂等正极材料',
      metadata: {
        relatedIndex: '399441',
        trackingETFs: [{ ticker: '159856', name: '新材料ETF' }],
        keyDrivers: ['电池装机量', '高镍化', '磷酸锰铁锂'],
        keyPlayers: [
          { name: '容百科技', share: '15%', region: '中国' },
          { name: '当升科技', share: '12%', region: '中国' },
          { name: '德方纳米', share: '18%', region: '中国' }
        ],
        investmentLogic: '正极材料占电池成本40%，技术迭代带来机会',
        riskFactors: ['锂价波动', '产能过剩', '技术路线']
      }
    },
    {
      id: 'materials_battery_anode',
      name: '电池负极材料',
      type: 'subsector_l2',
      level: 2,
      parentId: 'materials_energy',
      description: '石墨、硅基负极材料',
      metadata: {
        relatedIndex: '399441',
        trackingETFs: [{ ticker: '159856', name: '新材料ETF' }],
        keyDrivers: ['硅负极', '快充需求', '能量密度'],
        investmentLogic: '负极材料技术升级，硅基负极是方向',
        riskFactors: ['石墨产能过剩', '硅负极技术', '价格战']
      }
    },
    {
      id: 'materials_electrolyte',
      name: '电解液与添加剂',
      type: 'subsector_l2',
      level: 2,
      parentId: 'materials_energy',
      description: '电解液、六氟磷酸锂、添加剂',
      metadata: {
        relatedIndex: '399441',
        trackingETFs: [{ ticker: '159856', name: '新材料ETF' }],
        keyDrivers: ['电池安全', '快充', '低温性能'],
        investmentLogic: '电解液是电池关键，添加剂技术含量高',
        riskFactors: ['六氟磷酸锂价格', '产能过剩', '技术迭代']
      }
    },
    {
      id: 'materials_carbon_fiber',
      name: '碳纤维',
      type: 'subsector_l2',
      level: 2,
      parentId: 'materials_structural',
      description: '碳纤维及复合材料',
      metadata: {
        relatedIndex: '399441',
        trackingETFs: [{ ticker: '159856', name: '新材料ETF' }],
        keyDrivers: ['轻量化', '航空航天', '风电叶片'],
        investmentLogic: '碳纤维是终极轻量化材料，国产化加速',
        riskFactors: ['成本高', '工艺复杂', '应用推广']
      }
    },
    {
      id: 'materials_titanium',
      name: '钛合金',
      type: 'subsector_l2',
      level: 2,
      parentId: 'materials_structural',
      description: '钛合金材料',
      metadata: {
        relatedIndex: '399441',
        trackingETFs: [{ ticker: '159856', name: '新材料ETF' }],
        keyDrivers: ['航空航天', '医疗器械', '高端制造'],
        investmentLogic: '钛合金是高端材料，军工民用双需求',
        riskFactors: ['加工难度', '成本高', '下游需求']
      }
    },
    {
      id: 'materials_rare_earth',
      name: '稀土材料',
      type: 'subsector_l2',
      level: 2,
      parentId: 'materials_structural',
      description: '稀土永磁、催化等材料',
      metadata: {
        relatedIndex: '399441',
        trackingETFs: [{ ticker: '159856', name: '新材料ETF' }],
        keyDrivers: ['新能源车', '风电', '资源优势'],
        investmentLogic: '稀土是战略资源，中国具有全球优势',
        riskFactors: ['价格波动', '环保整治', '出口管制']
      }
    }
  ]
}
