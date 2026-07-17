import { NextResponse } from 'next/server'

// 新闻数据源配置
const NEWS_DATA_SOURCES = [
  // 综合财经媒体
  {
    id: 'cls_news',
    name: '财联社',
    description: '实时财经新闻资讯，覆盖A股、港股、美股市场动态',
    category: '综合财经媒体',
    provider: '财联社',
    website: 'https://www.cls.cn',
    updateFrequency: '实时',
    coverage: ['A股', '港股', '美股', '宏观经济'],
    dataQuality: 'high',
    status: 'active',
  },
  {
    id: 'eastmoney_news',
    name: '东方财富',
    description: '全面的财经资讯平台，提供股票、基金、债券等市场信息',
    category: '综合财经媒体',
    provider: '东方财富',
    website: 'https://www.eastmoney.com',
    updateFrequency: '实时',
    coverage: ['A股', '基金', '债券', '期货'],
    dataQuality: 'high',
    status: 'active',
  },
  {
    id: 'sina_finance',
    name: '新浪财经',
    description: '权威财经新闻门户，覆盖国内外金融市场',
    category: '综合财经媒体',
    provider: '新浪财经',
    website: 'https://finance.sina.com.cn',
    updateFrequency: '实时',
    coverage: ['A股', '港股', '美股', '宏观经济'],
    dataQuality: 'high',
    status: 'active',
  },

  // 行业专业媒体
  {
    id: 'semi_insight',
    name: '半导体行业观察',
    description: '专注于半导体、芯片产业的深度分析和新闻报道',
    category: '行业专业媒体',
    provider: '半导体行业观察',
    website: 'https://www.semiinsights.com',
    updateFrequency: '每日',
    coverage: ['半导体', '芯片', 'GPU', 'AI芯片'],
    dataQuality: 'high',
    status: 'active',
  },
  {
    id: 'optic_comm',
    name: '光通信之家',
    description: '光通信、光模块行业专业资讯平台',
    category: '行业专业媒体',
    provider: '光通信之家',
    website: 'https://www.ofweek.com',
    updateFrequency: '每日',
    coverage: ['光模块', '光通信', 'CPO', '光纤'],
    dataQuality: 'medium',
    status: 'active',
  },
  {
    id: 'datacenter_world',
    name: '数据中心世界',
    description: '数据中心、云计算、算力基础设施行业资讯',
    category: '行业专业媒体',
    provider: '数据中心世界',
    website: 'https://www.datacenterdynamics.com',
    updateFrequency: '每日',
    coverage: ['数据中心', '云计算', '算力', '服务器'],
    dataQuality: 'medium',
    status: 'active',
  },

  // 政策与监管
  {
    id: 'csrc_announcement',
    name: '证监会公告',
    description: '中国证券监督管理委员会官方公告和政策发布',
    category: '政策与监管',
    provider: '中国证监会',
    website: 'http://www.csrc.gov.cn',
    updateFrequency: '不定期',
    coverage: ['证券市场', '监管政策', 'IPO', '再融资'],
    dataQuality: 'high',
    status: 'active',
  },
  {
    id: 'miit_policy',
    name: '工信部政策',
    description: '工业和信息化部政策文件，涉及半导体、人工智能等产业政策',
    category: '政策与监管',
    provider: '工业和信息化部',
    website: 'https://www.miit.gov.cn',
    updateFrequency: '不定期',
    coverage: ['产业政策', '半导体', '人工智能', '新能源'],
    dataQuality: 'high',
    status: 'active',
  },

  // 国际视角
  {
    id: 'bloomberg',
    name: 'Bloomberg',
    description: '全球领先的商业、金融信息和新闻资讯提供商',
    category: '国际视角',
    provider: '彭博社',
    website: 'https://www.bloomberg.com',
    updateFrequency: '实时',
    coverage: ['全球市场', '宏观经济', '科技', '金融'],
    dataQuality: 'high',
    status: 'active',
  },
  {
    id: 'reuters',
    name: 'Reuters',
    description: '国际新闻机构，提供全球商业、金融、政治和科技新闻',
    category: '国际视角',
    provider: '路透社',
    website: 'https://www.reuters.com',
    updateFrequency: '实时',
    coverage: ['全球市场', '宏观经济', '政治', '科技'],
    dataQuality: 'high',
    status: 'active',
  },
]

export async function GET() {
  const categories = [...new Set(NEWS_DATA_SOURCES.map(s => s.category))]

  return NextResponse.json({
    success: true,
    data: {
      sources: NEWS_DATA_SOURCES,
      categories: categories,
      total: NEWS_DATA_SOURCES.length,
      activeCount: NEWS_DATA_SOURCES.filter(s => s.status === 'active').length,
    },
  })
}
