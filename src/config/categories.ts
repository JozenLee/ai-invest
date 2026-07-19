/**
 * 新闻分类配置 - 统一配置中心
 *
 * 这个文件是所有分类相关配置的单一数据源（Single Source of Truth）
 * 任何分类的增删改都应该在这里进行，确保前端UI、后端映射、AI分类保持一致
 */

// ==================== 分类定义 ====================

/**
 * 新闻分类定义
 */
export interface CategoryDefinition {
  /** 分类代码（与AI输出、数据库code保持一致） */
  code: string
  /** 数据库ID（与Prisma schema中的id一致） */
  id: string
  /** 中文名称 */
  name: string
  /** 分类描述 */
  description?: string
  /** AI识别关键词（用于模糊匹配和降级） */
  keywords: string[]
  /** 所属分组 */
  group: CategoryGroup
  /** 排序权重 */
  sortOrder: number
}

/**
 * 分类分组
 */
export type CategoryGroup =
  | 'tech'          // 科技类
  | 'finance'       // 财经类
  | 'policy'        // 政策类
  | 'society'       // 社会类
  | 'international' // 国际类
  | 'industry'      // 产业类

/**
 * 分组信息
 */
export interface CategoryGroupInfo {
  key: CategoryGroup
  name: string
  description: string
  sortOrder: number
}

// ==================== 分类配置 ====================

/**
 * 分组配置
 */
export const CATEGORY_GROUPS: Record<CategoryGroup, CategoryGroupInfo> = {
  tech: {
    key: 'tech',
    name: '科技类',
    description: '科技、产品、创新相关',
    sortOrder: 1,
  },
  finance: {
    key: 'finance',
    name: '财经类',
    description: '财报、资本、经济相关',
    sortOrder: 2,
  },
  industry: {
    key: 'industry',
    name: '产业类',
    description: '供应链、产能、竞争相关',
    sortOrder: 3,
  },
  policy: {
    key: 'policy',
    name: '政策类',
    description: '政策、监管、政府相关',
    sortOrder: 4,
  },
  international: {
    key: 'international',
    name: '国际类',
    description: '地缘、贸易、全球市场',
    sortOrder: 5,
  },
  society: {
    key: 'society',
    name: '其他',
    description: '社会、消费、生活相关',
    sortOrder: 6,
  },
}

/**
 * 所有分类配置（22个）
 *
 * ⚠️ 重要：修改这里会影响：
 * 1. 前端UI筛选器
 * 2. AI分类Prompt
 * 3. 后端映射函数
 * 4. 数据库seed脚本
 */
export const CATEGORIES: CategoryDefinition[] = [
  // ========== 科技类 (5个) ==========
  {
    code: 'ai',
    id: 'cat_ai',
    name: '人工智能',
    description: '大模型、深度学习、机器学习',
    keywords: ['人工智能', 'AI', '大模型', '深度学习', '机器学习'],
    group: 'tech',
    sortOrder: 1,
  },
  {
    code: 'chip',
    id: 'cat_chip',
    name: '芯片半导体',
    description: '芯片、半导体、GPU、CPU',
    keywords: ['芯片', '半导体', 'GPU', 'CPU', '晶圆'],
    group: 'tech',
    sortOrder: 2,
  },
  {
    code: 'internet',
    id: 'cat_internet',
    name: '互联网',
    description: '电商、社交、游戏、云计算',
    keywords: ['互联网', '电商', '社交', '游戏', '云计算', 'SaaS'],
    group: 'tech',
    sortOrder: 3,
  },
  {
    code: 'product',
    id: 'cat_product',
    name: '产品发布',
    description: '新品发布、产品推出',
    keywords: ['发布', '新品', '产品', '推出'],
    group: 'tech',
    sortOrder: 4,
  },
  {
    code: 'breakthrough',
    id: 'cat_breakthrough',
    name: '技术突破',
    description: '技术创新、研发突破',
    keywords: ['技术', '突破', '研发', '创新'],
    group: 'tech',
    sortOrder: 5,
  },

  // ========== 财经类 (4个) ==========
  {
    code: 'earnings',
    id: 'cat_earnings',
    name: '财报业绩',
    description: '财报、业绩、营收、利润',
    keywords: ['财报', '业绩', '营收', '利润', '净利润'],
    group: 'finance',
    sortOrder: 1,
  },
  {
    code: 'merger',
    id: 'cat_merger',
    name: '合作并购',
    description: '合作、并购、收购、战略',
    keywords: ['合作', '并购', '收购', '战略', '投资'],
    group: 'finance',
    sortOrder: 2,
  },
  {
    code: 'capital',
    id: 'cat_capital',
    name: '资本市场',
    description: '上市、IPO、融资、股市',
    keywords: ['上市', 'IPO', '融资', '股市', '股价'],
    group: 'finance',
    sortOrder: 3,
  },
  {
    code: 'macro',
    id: 'cat_macro',
    name: '宏观经济',
    description: 'GDP、CPI、央行、货币政策',
    keywords: ['GDP', 'CPI', '央行', '货币', '经济'],
    group: 'finance',
    sortOrder: 4,
  },

  // ========== 产业类 (5个) ==========
  {
    code: 'supply',
    id: 'cat_supply',
    name: '供应链',
    description: '供应、出货、订单',
    keywords: ['供应', '供应链', '出货', '订单'],
    group: 'industry',
    sortOrder: 1,
  },
  {
    code: 'capacity',
    id: 'cat_capacity',
    name: '产能扩张',
    description: '扩产、建厂、投产、产能',
    keywords: ['扩产', '建厂', '投产', '产能'],
    group: 'industry',
    sortOrder: 2,
  },
  {
    code: 'competition',
    id: 'cat_competition',
    name: '竞争格局',
    description: '市场份额、竞争、格局',
    keywords: ['市场份额', '竞争', '格局'],
    group: 'industry',
    sortOrder: 3,
  },
  {
    code: 'new_energy',
    id: 'cat_new_energy',
    name: '新能源',
    description: '光伏、风电、电动车、锂电',
    keywords: ['新能源', '光伏', '风电', '电动车', '锂电'],
    group: 'industry',
    sortOrder: 4,
  },
  {
    code: 'medical',
    id: 'cat_medical',
    name: '医药医疗',
    description: '医药、医疗、创新药、疫苗',
    keywords: ['医药', '医疗', '创新药', '疫苗'],
    group: 'industry',
    sortOrder: 5,
  },

  // ========== 政策类 (3个) ==========
  {
    code: 'policy',
    id: 'cat_policy',
    name: '政策法规',
    description: '产业政策、补贴、规划',
    keywords: ['政策', '补贴', '规划', '意见'],
    group: 'policy',
    sortOrder: 1,
  },
  {
    code: 'regulation',
    id: 'cat_regulation',
    name: '监管制裁',
    description: '监管、制裁、管制、限制',
    keywords: ['制裁', '管制', '限制', '出口管制', '监管'],
    group: 'policy',
    sortOrder: 2,
  },
  {
    code: 'government',
    id: 'cat_government',
    name: '政府动态',
    description: '政府、国务院、部委',
    keywords: ['政府', '国务院', '部委', '发改委'],
    group: 'policy',
    sortOrder: 3,
  },

  // ========== 国际类 (3个) ==========
  {
    code: 'geopolitics',
    id: 'cat_geopolitics',
    name: '地缘政治',
    description: '地缘、冲突、外交',
    keywords: ['地缘', '冲突', '战争', '外交'],
    group: 'international',
    sortOrder: 1,
  },
  {
    code: 'global_market',
    id: 'cat_global_market',
    name: '全球市场',
    description: '海外市场、国际市场',
    keywords: ['海外', '美股', '欧洲', '日本', '市场', '全球'],
    group: 'international',
    sortOrder: 2,
  },
  {
    code: 'trade',
    id: 'cat_trade',
    name: '国际贸易',
    description: '贸易、进出口、关税',
    keywords: ['贸易', '进出口', '关税'],
    group: 'international',
    sortOrder: 3,
  },

  // ========== 社会类 (2个) ==========
  {
    code: 'event',
    id: 'cat_event',
    name: '社会事件',
    description: '突发事件、事故',
    keywords: ['事故', '灾害', '突发'],
    group: 'society',
    sortOrder: 1,
  },
  {
    code: 'consume',
    id: 'cat_consume',
    name: '消费生活',
    description: '消费、零售、购物',
    keywords: ['消费', '零售', '购物', '生活'],
    group: 'society',
    sortOrder: 2,
  },
]

// ==================== 辅助函数 ====================

/**
 * 按分组整理分类
 */
export const getCategoriesByGroup = (): Record<CategoryGroup, CategoryDefinition[]> => {
  const result: Record<string, CategoryDefinition[]> = {}

  for (const group of Object.keys(CATEGORY_GROUPS) as CategoryGroup[]) {
    result[group] = CATEGORIES.filter(cat => cat.group === group)
      .sort((a, b) => a.sortOrder - b.sortOrder)
  }

  return result as Record<CategoryGroup, CategoryDefinition[]>
}

/**
 * 获取所有分类代码（用于AI Prompt）
 */
export const getAllCategoryCodes = (): string[] => {
  return CATEGORIES.map(cat => cat.code)
}

/**
 * 获取所有分类ID（用于数据库查询）
 */
export const getAllCategoryIds = (): string[] => {
  return CATEGORIES.map(cat => cat.id)
}

/**
 * 通过代码查找分类
 */
export const getCategoryByCode = (code: string): CategoryDefinition | undefined => {
  return CATEGORIES.find(cat => cat.code === code)
}

/**
 * 通过ID查找分类
 */
export const getCategoryById = (id: string): CategoryDefinition | undefined => {
  return CATEGORIES.find(cat => cat.id === id)
}

/**
 * 获取分类的关键词映射（用于后端映射）
 */
export const getCategoryKeywordMap = (): Record<string, string[]> => {
  const map: Record<string, string[]> = {}
  for (const cat of CATEGORIES) {
    map[cat.code] = cat.keywords
  }
  return map
}

/**
 * 生成AI Prompt的分类描述
 */
export const generateAICategoryPrompt = (): string => {
  const grouped = getCategoriesByGroup()
  let prompt = '从以下22个类别中选择最合适的一个：\n\n'

  for (const groupKey of Object.keys(CATEGORY_GROUPS) as CategoryGroup[]) {
    const group = CATEGORY_GROUPS[groupKey]
    const categories = grouped[groupKey]

    prompt += `${group.name}:\n`
    categories.forEach(cat => {
      prompt += `- ${cat.code}: ${cat.description}\n`
    })
    prompt += '\n'
  }

  return prompt
}

/**
 * 生成UI筛选器配置
 */
export interface UIFilterGroup {
  label: string
  categories: Array<{
    value: string
    label: string
  }>
}

export const generateUIFilterGroups = (): UIFilterGroup[] => {
  const grouped = getCategoriesByGroup()
  const groupOrder = Object.keys(CATEGORY_GROUPS).sort(
    (a, b) => CATEGORY_GROUPS[a as CategoryGroup].sortOrder - CATEGORY_GROUPS[b as CategoryGroup].sortOrder
  ) as CategoryGroup[]

  return groupOrder.map(groupKey => ({
    label: CATEGORY_GROUPS[groupKey].name,
    categories: grouped[groupKey].map(cat => ({
      value: cat.id,
      label: cat.name,
    })),
  }))
}

// ==================== 导出汇总 ====================

export default {
  CATEGORIES,
  CATEGORY_GROUPS,
  getCategoriesByGroup,
  getAllCategoryCodes,
  getAllCategoryIds,
  getCategoryByCode,
  getCategoryById,
  getCategoryKeywordMap,
  generateAICategoryPrompt,
  generateUIFilterGroups,
}
