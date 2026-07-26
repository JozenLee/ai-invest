/**
 * ETF领域配置 - 对应主流ETF指数分类
 *
 * 用于：
 * 1. 新闻的领域标签（支持1-3个多标签）
 * 2. 领域趋势分析的数据归类
 * 3. 用户筛选数据的初筛条件
 */

export interface ETFDomain {
  /** 领域代码 */
  code: string
  /** 中文名称 */
  name: string
  /** 描述 */
  description: string
  /** 对应的ETF代码示例 */
  etfExamples: string[]
  /** AI识别关键词 */
  keywords: string[]
  /** 排序权重 */
  sortOrder: number
}

/**
 * ETF领域配置（对应主流ETF指数）
 */
export const ETF_DOMAINS: ETFDomain[] = [
  // ========== 科技类 ==========
  {
    code: 'semiconductor',
    name: '半导体',
    description: '半导体、芯片设计、晶圆制造、封测',
    etfExamples: ['512480', '159995', '512760'],
    keywords: ['半导体', '芯片', '晶圆', '封测', 'IC', '集成电路', 'GPU', 'CPU', 'ASIC', '光刻机', '设备材料'],
    sortOrder: 1,
  },
  {
    code: 'ai',
    name: '人工智能',
    description: 'AI算力、大模型、深度学习',
    etfExamples: ['515070', '159819'],
    keywords: ['人工智能', 'AI', '大模型', '算力', '深度学习', '机器学习', 'GPT', 'Transformer', '智能驾驶'],
    sortOrder: 2,
  },
  {
    code: 'computing',
    name: '算力设备',
    description: '服务器、数据中心、云计算',
    etfExamples: ['516510'],
    keywords: ['服务器', '数据中心', '算力', '云计算', '边缘计算', 'IDC', '液冷', '光模块'],
    sortOrder: 3,
  },
  {
    code: 'robotics',
    name: '机器人',
    description: '工业机器人、服务机器人、人形机器人',
    etfExamples: ['159770', '562500'],
    keywords: ['机器人', '工业机器人', '服务机器人', '人形机器人', '协作机器人', '自动化', '减速器', '伺服系统'],
    sortOrder: 4,
  },
  {
    code: 'communication',
    name: '通信设备',
    description: '5G、6G、光通信、物联网',
    etfExamples: ['515050', '515860'],
    keywords: ['5G', '6G', '通信', '基站', '光通信', '光纤', '物联网', 'IoT', '卫星通信'],
    sortOrder: 5,
  },
  {
    code: 'software',
    name: '软件互联网',
    description: '软件开发、云服务、SaaS、电商',
    etfExamples: ['515770', '513050'],
    keywords: ['软件', 'SaaS', '云服务', '互联网', '电商', '社交', '游戏', '数字经济', 'IT服务'],
    sortOrder: 6,
  },

  // ========== 新能源类 ==========
  {
    code: 'new_energy_vehicle',
    name: '新能源车',
    description: '电动车、智能驾驶、汽车零部件',
    etfExamples: ['515030', '159806'],
    keywords: ['新能源车', '电动车', '新能源汽车', '智能驾驶', '自动驾驶', '汽车电子', '车联网', '充电桩'],
    sortOrder: 7,
  },
  {
    code: 'battery',
    name: '电池储能',
    description: '锂电池、钠电池、储能系统',
    etfExamples: ['159755', '561910'],
    keywords: ['锂电池', '动力电池', '储能', '钠电池', '固态电池', '电解液', '隔膜', '正负极材料'],
    sortOrder: 8,
  },
  {
    code: 'photovoltaic',
    name: '光伏产业',
    description: '光伏组件、硅料硅片、逆变器',
    etfExamples: ['515790', '159857'],
    keywords: ['光伏', '太阳能', '硅料', '硅片', '电池片', '组件', '逆变器', 'HJT', 'TOPCon'],
    sortOrder: 9,
  },
  {
    code: 'wind_power',
    name: '风电产业',
    description: '风力发电、风机设备',
    etfExamples: ['515380'],
    keywords: ['风电', '风力发电', '风机', '海上风电', '陆上风电', '风电运营'],
    sortOrder: 10,
  },

  // ========== 医药类 ==========
  {
    code: 'innovative_drug',
    name: '创新药',
    description: '生物制药、创新药研发、CXO',
    etfExamples: ['159992', '159858'],
    keywords: ['创新药', '生物制药', 'CXO', '抗体药', '基因治疗', '细胞治疗', 'ADC', '新药研发'],
    sortOrder: 11,
  },
  {
    code: 'medical_device',
    name: '医疗器械',
    description: '医疗设备、高值耗材、IVD',
    etfExamples: ['159883'],
    keywords: ['医疗器械', '医疗设备', '高值耗材', 'IVD', '体外诊断', '影像设备', '手术机器人'],
    sortOrder: 12,
  },

  // ========== 先进制造 ==========
  {
    code: 'equipment',
    name: '高端装备',
    description: '工业母机、精密仪器、工程机械',
    etfExamples: ['159658', '159611'],
    keywords: ['高端装备', '工业母机', '机床', '精密仪器', '工程机械', '数控', '激光设备'],
    sortOrder: 13,
  },
  {
    code: 'military',
    name: '国防军工',
    description: '军工装备、航空航天、军工电子',
    etfExamples: ['512660', '512810'],
    keywords: ['军工', '国防', '航空', '航天', '导弹', '卫星', '军工电子', '无人机'],
    sortOrder: 14,
  },

  // ========== 消费类 ==========
  {
    code: 'food_beverage',
    name: '食品饮料',
    description: '白酒、啤酒、食品加工',
    etfExamples: ['512400', '159736'],
    keywords: ['白酒', '啤酒', '饮料', '乳制品', '调味品', '食品', '餐饮'],
    sortOrder: 15,
  },
  {
    code: 'consumer_electronics',
    name: '消费电子',
    description: '手机、可穿戴、家电',
    etfExamples: ['159732'],
    keywords: ['消费电子', '手机', '可穿戴设备', '家电', 'AR', 'VR', 'MR', '智能手表', '智能家居'],
    sortOrder: 16,
  },

  // ========== 金融地产 ==========
  {
    code: 'finance',
    name: '金融',
    description: '银行、券商、保险',
    etfExamples: ['512000', '512200'],
    keywords: ['银行', '券商', '保险', '金融', '证券', '基金', '信托'],
    sortOrder: 17,
  },
  {
    code: 'real_estate',
    name: '房地产',
    description: '地产开发、物业管理、建材',
    etfExamples: ['512200'],
    keywords: ['房地产', '地产', '物业', '建材', 'REITs'],
    sortOrder: 18,
  },

  // ========== 其他 ==========
  {
    code: 'agriculture',
    name: '农业',
    description: '种植、养殖、农业科技',
    etfExamples: ['159825'],
    keywords: ['农业', '种植', '养殖', '种业', '化肥', '农药', '农机'],
    sortOrder: 19,
  },
  {
    code: 'environment',
    name: '环保',
    description: '环境治理、水务、固废处理',
    etfExamples: ['512580'],
    keywords: ['环保', '水务', '污水处理', '固废', '垃圾处理', '环境治理'],
    sortOrder: 20,
  },
  {
    code: 'irrelevant',
    name: '无影响',
    description: '与股市投资无关的新闻',
    etfExamples: [],
    keywords: ['娱乐', '体育', '社会民生', '日常生活', '趣闻', '八卦'],
    sortOrder: 99,
  },
]

// ==================== 辅助函数 ====================

/**
 * 获取所有领域代码
 */
export const getAllDomainCodes = (): string[] => {
  return ETF_DOMAINS.map(d => d.code)
}

/**
 * 通过代码查找领域
 */
export const getDomainByCode = (code: string): ETFDomain | undefined => {
  return ETF_DOMAINS.find(d => d.code === code)
}

/**
 * 生成AI Prompt的领域描述
 */
export const generateAIDomainPrompt = (): string => {
  let prompt = '从以下领域中选择1-3个最相关的（按相关度从高到低）：\n\n'

  ETF_DOMAINS.forEach(domain => {
    if (domain.code !== 'irrelevant') {
      prompt += `- ${domain.code}: ${domain.description}\n`
    }
  })

  prompt += `\n特殊情况：\n- irrelevant: 与股市投资完全无关的新闻（如纯娱乐、体育、社会民生等）\n`

  return prompt
}

/**
 * 获取领域关键词映射
 */
export const getDomainKeywordMap = (): Record<string, string[]> => {
  const map: Record<string, string[]> = {}
  for (const domain of ETF_DOMAINS) {
    map[domain.code] = domain.keywords
  }
  return map
}

export default {
  ETF_DOMAINS,
  getAllDomainCodes,
  getDomainByCode,
  generateAIDomainPrompt,
  getDomainKeywordMap,
}
