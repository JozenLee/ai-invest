// ==================== 7. 消费电子 ====================
export const CONSUMER_ELECTRONICS_GRAPH = {
  root: {
    id: 'consumer_electronics',
    name: '消费电子',
    type: 'domain_index',
    level: 0,
    description: '消费电子产业链，包括手机、可穿戴、AR/VR',
    metadata: {
      relatedIndex: '399286',
      indexName: '中证消费电子主题指数',
      trackingETFs: [
        { ticker: '159732', name: '消费电子ETF', assets: 120 }
      ],
      industryChain: 'full',
      investmentTheme: '消费电子创新周期',
      marketCap: '万亿级',
      growthRate: '10-15% CAGR',
      peakYear: '2024-2028'
    }
  },

  l1: [
    {
      id: 'ce_smartphone',
      name: '智能手机',
      type: 'sector_l1',
      level: 1,
      parentId: 'consumer_electronics',
      description: '智能手机及产业链',
      metadata: {
        relatedIndex: '399286',
        trackingETFs: [{ ticker: '159732', name: '消费电子ETF' }],
        capitalFlowSector: '消费电子',
        industryChain: 'downstream',
        keyDrivers: ['换机周期', '高端化', 'AI手机'],
        investmentLogic: '手机市场成熟，关注结构性机会和创新',
        riskFactors: ['出货量下滑', '竞争激烈', '创新不足'],
        cyclicality: 'medium',
        volatility: 'medium'
      }
    },
    {
      id: 'ce_wearable',
      name: '可穿戴设备',
      type: 'sector_l1',
      level: 1,
      parentId: 'consumer_electronics',
      description: '智能手表、耳机等可穿戴',
      metadata: {
        relatedIndex: '399286',
        trackingETFs: [{ ticker: '159732', name: '消费电子ETF' }],
        capitalFlowSector: '消费电子',
        industryChain: 'downstream',
        keyDrivers: ['健康监测', 'TWS普及', '功能升级'],
        investmentLogic: '可穿戴增长快于手机，渗透率持续提升',
        riskFactors: ['市场饱和', '价格战', '同质化'],
        cyclicality: 'low',
        volatility: 'medium'
      }
    },
    {
      id: 'ce_components',
      name: '核心元器件',
      type: 'sector_l1',
      level: 1,
      parentId: 'consumer_electronics',
      description: '摄像头、显示、芯片等',
      metadata: {
        relatedIndex: '399286',
        trackingETFs: [{ ticker: '159732', name: '消费电子ETF' }],
        capitalFlowSector: '消费电子',
        industryChain: 'upstream',
        keyDrivers: ['技术升级', '国产替代', '价值量提升'],
        investmentLogic: '核心元器件是消费电子价值核心，技术迭代快',
        riskFactors: ['客户集中', '技术壁垒', '价格压力'],
        cyclicality: 'medium',
        volatility: 'high'
      }
    }
  ],

  l2: [
    {
      id: 'ce_flagship',
      name: '高端旗舰',
      type: 'subsector_l2',
      level: 2,
      parentId: 'ce_smartphone',
      description: '高端旗舰手机',
      metadata: {
        relatedIndex: '399286',
        trackingETFs: [{ ticker: '159732', name: '消费电子ETF' }],
        keyDrivers: ['高端化', '折叠屏', 'AI功能'],
        investmentLogic: '高端机是利润主要来源，产业链价值量高',
        riskFactors: ['华为回归', '市场集中', '创新瓶颈']
      }
    },
    {
      id: 'ce_midrange',
      name: '中低端市场',
      type: 'subsector_l2',
      level: 2,
      parentId: 'ce_smartphone',
      description: '中低端智能手机',
      metadata: {
        relatedIndex: '399286',
        trackingETFs: [{ ticker: '159732', name: '消费电子ETF' }],
        keyDrivers: ['新兴市场', '5G普及', '性价比'],
        investmentLogic: '中低端是出货量主力，利润率低',
        riskFactors: ['价格战', '利润微薄', '品牌分化']
      }
    },
    {
      id: 'ce_foldable',
      name: '折叠屏',
      type: 'subsector_l2',
      level: 2,
      parentId: 'ce_smartphone',
      description: '折叠屏手机',
      metadata: {
        relatedIndex: '399286',
        trackingETFs: [{ ticker: '159732', name: '消费电子ETF' }],
        keyDrivers: ['技术成熟', '价格下探', '形态创新'],
        investmentLogic: '折叠屏是高端创新方向，渗透率快速提升',
        riskFactors: ['良率问题', '耐用性', '价格高']
      }
    },
    {
      id: 'ce_smartwatch',
      name: '智能手表',
      type: 'subsector_l2',
      level: 2,
      parentId: 'ce_wearable',
      description: '智能手表与手环',
      metadata: {
        relatedIndex: '399286',
        trackingETFs: [{ ticker: '159732', name: '消费电子ETF' }],
        keyDrivers: ['健康监测', '运动追踪', '续航提升'],
        keyPlayers: [
          { name: 'Apple Watch', share: '35%', region: '美国' },
          { name: '华为', share: '12%', region: '中国' },
          { name: '小米', share: '10%', region: '中国' }
        ],
        investmentLogic: '智能手表是可穿戴主力，健康功能驱动增长',
        riskFactors: ['功能同质化', '换机周期长', '竞争激烈']
      }
    },
    {
      id: 'ce_tws',
      name: 'TWS耳机',
      type: 'subsector_l2',
      level: 2,
      parentId: 'ce_wearable',
      description: '真无线蓝牙耳机',
      metadata: {
        relatedIndex: '399286',
        trackingETFs: [{ ticker: '159732', name: '消费电子ETF' }],
        keyDrivers: ['降噪技术', '音质提升', '空间音频'],
        investmentLogic: 'TWS快速普及，产业链成熟',
        riskFactors: ['市场饱和', '价格战', '山寨冲击']
      }
    },
    {
      id: 'ce_ar_vr',
      name: 'AR/VR/MR',
      type: 'subsector_l2',
      level: 2,
      parentId: 'ce_wearable',
      description: 'AR/VR/MR头显设备',
      metadata: {
        relatedIndex: '399286',
        trackingETFs: [{ ticker: '159732', name: '消费电子ETF' }],
        keyDrivers: ['Vision Pro', '内容生态', '轻量化'],
        investmentLogic: 'AR/VR是下一代计算平台，产业化加速',
        riskFactors: ['价格高', '内容匮乏', '佩戴体验']
      }
    },
    {
      id: 'ce_camera',
      name: '摄像头模组',
      type: 'subsector_l2',
      level: 2,
      parentId: 'ce_components',
      description: '手机摄像头模组',
      metadata: {
        relatedIndex: '399286',
        trackingETFs: [{ ticker: '159732', name: '消费电子ETF' }],
        keyDrivers: ['多摄、高像素', '潜望式长焦', 'AI摄影'],
        investmentLogic: '摄像头是手机核心卖点，价值量持续提升',
        riskFactors: ['客户集中', '技术迭代', '价格压力']
      }
    },
    {
      id: 'ce_display',
      name: '显示屏',
      type: 'subsector_l2',
      level: 2,
      parentId: 'ce_components',
      description: 'OLED/LCD显示屏',
      metadata: {
        relatedIndex: '399286',
        trackingETFs: [{ ticker: '159732', name: '消费电子ETF' }],
        keyDrivers: ['OLED普及', '高刷新率', '柔性屏'],
        investmentLogic: '显示屏是手机成本大头，OLED渗透率提升',
        riskFactors: ['韩国垄断', '产能过剩', '价格下滑']
      }
    },
    {
      id: 'ce_soc',
      name: '手机芯片',
      type: 'subsector_l2',
      level: 2,
      parentId: 'ce_components',
      description: '手机SoC芯片',
      metadata: {
        relatedIndex: '399286',
        trackingETFs: [{ ticker: '159732', name: '消费电子ETF' }],
        keyDrivers: ['先进制程', 'AI算力', '5G集成'],
        investmentLogic: '手机芯片是技术制高点，国产替代空间大',
        riskFactors: ['技术差距', '制裁风险', '研发投入大']
      }
    }
  ]
}
