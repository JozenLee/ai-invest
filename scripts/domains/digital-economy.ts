// ==================== 8. 数字经济 ====================
export const DIGITAL_ECONOMY_GRAPH = {
  root: {
    id: 'digital_economy',
    name: '数字经济',
    type: 'domain_index',
    level: 0,
    description: '数字经济产业链，包括云计算、大数据、网络安全',
    metadata: {
      relatedIndex: '931582',
      indexName: '中证云计算与大数据主题指数',
      trackingETFs: [
        { ticker: '516510', name: '中概互联ETF', assets: 180 },
        { ticker: '159870', name: '云计算ETF', assets: 80 }
      ],
      industryChain: 'full',
      investmentTheme: '数字化转型',
      marketCap: '万亿级',
      growthRate: '15-25% CAGR',
      peakYear: '2024-2030'
    }
  },

  l1: [
    {
      id: 'digital_cloud',
      name: '云计算',
      type: 'sector_l1',
      level: 1,
      parentId: 'digital_economy',
      description: '云基础设施与服务',
      metadata: {
        relatedIndex: '931582',
        trackingETFs: [{ ticker: '159870', name: '云计算ETF' }],
        capitalFlowSector: '云计算',
        industryChain: 'midstream',
        keyDrivers: ['企业上云', 'AI算力', '混合云'],
        investmentLogic: '云计算是数字化基础设施，长期增长确定',
        riskFactors: ['竞争激烈', '价格战', '客户集中'],
        cyclicality: 'low',
        volatility: 'medium'
      }
    },
    {
      id: 'digital_software',
      name: '企业软件',
      type: 'sector_l1',
      level: 1,
      parentId: 'digital_economy',
      description: 'SaaS与企业管理软件',
      metadata: {
        relatedIndex: '931582',
        trackingETFs: [{ ticker: '516510', name: '中概互联ETF' }],
        capitalFlowSector: '软件',
        industryChain: 'downstream',
        keyDrivers: ['SaaS化', '国产替代', 'AI赋能'],
        investmentLogic: '企业软件是数字化核心，订阅模式价值高',
        riskFactors: ['付费意愿', '客户续约', '盗版问题'],
        cyclicality: 'low',
        volatility: 'medium'
      }
    },
    {
      id: 'digital_security',
      name: '网络安全',
      type: 'sector_l1',
      level: 1,
      parentId: 'digital_economy',
      description: '网络安全产品与服务',
      metadata: {
        relatedIndex: '931582',
        trackingETFs: [{ ticker: '159870', name: '云计算ETF' }],
        capitalFlowSector: '网络安全',
        industryChain: 'supporting',
        keyDrivers: ['安全法规', '攻防对抗', '零信任'],
        investmentLogic: '网络安全是刚需，政策+威胁双驱动',
        riskFactors: ['预算波动', '技术迭代', '竞争激烈'],
        cyclicality: 'low',
        volatility: 'low'
      }
    }
  ],

  l2: [
    {
      id: 'digital_iaas',
      name: 'IaaS基础设施',
      type: 'subsector_l2',
      level: 2,
      parentId: 'digital_cloud',
      description: '云基础设施服务',
      metadata: {
        relatedIndex: '931582',
        trackingETFs: [{ ticker: '159870', name: '云计算ETF' }],
        keyDrivers: ['算力需求', 'AI训练', '边缘计算'],
        keyPlayers: [
          { name: '阿里云', share: '36%', region: '中国' },
          { name: '华为云', share: '18%', region: '中国' },
          { name: '腾讯云', share: '16%', region: '中国' }
        ],
        investmentLogic: 'IaaS是云计算基础，规模效应明显',
        riskFactors: ['资本开支大', '价格战', '客户集中']
      }
    },
    {
      id: 'digital_paas',
      name: 'PaaS平台服务',
      type: 'subsector_l2',
      level: 2,
      parentId: 'digital_cloud',
      description: '云平台开发服务',
      metadata: {
        relatedIndex: '931582',
        trackingETFs: [{ ticker: '159870', name: '云计算ETF' }],
        keyDrivers: ['低代码', 'AI平台', '容器化'],
        investmentLogic: 'PaaS提升开发效率，厂商差异化关键',
        riskFactors: ['生态建设', '开发者粘性', '技术壁垒']
      }
    },
    {
      id: 'digital_private_cloud',
      name: '私有云',
      type: 'subsector_l2',
      level: 2,
      parentId: 'digital_cloud',
      description: '私有云与混合云',
      metadata: {
        relatedIndex: '931582',
        trackingETFs: [{ ticker: '159870', name: '云计算ETF' }],
        keyDrivers: ['数据安全', '合规要求', '混合云'],
        investmentLogic: '私有云满足企业安全需求，国产厂商机会',
        riskFactors: ['定制化高', '利润率低', '运维复杂']
      }
    },
    {
      id: 'digital_saas_erp',
      name: 'ERP/CRM',
      type: 'subsector_l2',
      level: 2,
      parentId: 'digital_software',
      description: '企业资源管理软件',
      metadata: {
        relatedIndex: '931582',
        trackingETFs: [{ ticker: '516510', name: '中概互联ETF' }],
        keyDrivers: ['数字化转型', 'SaaS化', '中小企业'],
        investmentLogic: 'ERP/CRM是企业数字化核心，订阅收入稳定',
        riskFactors: ['国产替代慢', '定制化需求', '实施周期长']
      }
    },
    {
      id: 'digital_saas_vertical',
      name: '垂直SaaS',
      type: 'subsector_l2',
      level: 2,
      parentId: 'digital_software',
      description: '行业垂直SaaS',
      metadata: {
        relatedIndex: '931582',
        trackingETFs: [{ ticker: '516510', name: '中概互联ETF' }],
        keyDrivers: ['行业深耕', '场景化', '客户粘性'],
        investmentLogic: '垂直SaaS理解行业痛点，客户粘性强',
        riskFactors: ['市场规模小', '获客成本高', '续约压力']
      }
    },
    {
      id: 'digital_collaboration',
      name: '协同办公',
      type: 'subsector_l2',
      level: 2,
      parentId: 'digital_software',
      description: '在线协同办公软件',
      metadata: {
        relatedIndex: '931582',
        trackingETFs: [{ ticker: '516510', name: '中概互联ETF' }],
        keyDrivers: ['远程办公', 'AI助手', '生态集成'],
        investmentLogic: '协同办公是高频入口，用户规模大',
        riskFactors: ['免费模式', '付费转化', '巨头竞争']
      }
    },
    {
      id: 'digital_firewall',
      name: '边界安全',
      type: 'subsector_l2',
      level: 2,
      parentId: 'digital_security',
      description: '防火墙、网闸等边界安全',
      metadata: {
        relatedIndex: '931582',
        trackingETFs: [{ ticker: '159870', name: '云计算ETF' }],
        keyDrivers: ['等保合规', '零信任', '云化'],
        investmentLogic: '边界安全是传统强项，国产化率高',
        riskFactors: ['增长放缓', '竞争激烈', '技术演进']
      }
    },
    {
      id: 'digital_endpoint',
      name: '终端安全',
      type: 'subsector_l2',
      level: 2,
      parentId: 'digital_security',
      description: '终端检测与响应',
      metadata: {
        relatedIndex: '931582',
        trackingETFs: [{ ticker: '159870', name: '云计算ETF' }],
        keyDrivers: ['远程办公', 'EDR/XDR', 'AI威胁检测'],
        investmentLogic: '终端是攻击入口，检测响应需求增长',
        riskFactors: ['国际竞争', '误报率', '性能影响']
      }
    },
    {
      id: 'digital_data_security',
      name: '数据安全',
      type: 'subsector_l2',
      level: 2,
      parentId: 'digital_security',
      description: '数据防泄露与隐私保护',
      metadata: {
        relatedIndex: '931582',
        trackingETFs: [{ ticker: '159870', name: '云计算ETF' }],
        keyDrivers: ['数据安全法', '隐私计算', '数据泄露'],
        investmentLogic: '数据安全是新兴需求，政策驱动明显',
        riskFactors: ['技术复杂', '落地难', '预算有限']
      }
    }
  ]
}
