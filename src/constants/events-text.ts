/**
 * 事件驱动系统 - 中文文本常量
 * 集中管理所有事件页面的UI文本，确保统一的用户体验
 */

export const EVENTS_TEXT = {
  // 通用文本
  common: {
    loading: '加载中...',
    loadingData: '正在加载数据...',
    noResults: '暂无数据',
    noData: '暂无数据',
    search: '搜索...',
    refresh: '刷新',
    all: '全部',
    confirm: '确认',
    cancel: '取消',
    save: '保存',
    edit: '编辑',
    delete: '删除',
    view: '查看',
    enable: '启用',
    disable: '停用',
    success: '操作成功',
    failed: '操作失败',
    error: '出错了',
    retry: '重试',
    close: '关闭',
    detail: '详情',
    back: '返回',
    next: '下一步',
    previous: '上一步',
    total: '共',
    items: '项',
  },

  // 事件资讯页
  feed: {
    title: '事件资讯',
    description: '实时追踪市场动态',
    stats: {
      todayNews: '今日新闻',
      bullishEvents: '利好事件',
      bearishEvents: '利空事件',
      avgSentiment: '平均情感分',
    },
    filter: {
      searchPlaceholder: '搜索标题、内容或来源...',
      sentimentAll: '全部情感',
      sentimentBullish: '利好',
      sentimentBearish: '利空',
      sentimentNeutral: '中性',
      sortBy: '排序方式',
      sortByTime: '最新发布',
      sortBySentiment: '情感最强',
      sortByImpact: '影响力最高',
      sortByRelevance: '按相关度排序',
    },
    card: {
      source: '来源',
      publishedAt: '发布于',
      readMore: '阅读全文',
      analyze: '分析影响',
      noSummary: '暂无摘要',
    },
    sentiment: {
      bullish: '利好',
      bearish: '利空',
      neutral: '中性',
      unknown: '未知',
    },
    empty: {
      title: '暂无事件资讯',
      description: '当前没有符合条件的新闻事件',
      action: '刷新数据',
    },
    error: {
      title: '数据加载失败',
      description: '无法获取事件资讯，请稍后重试',
      action: '重新加载',
    },
  },

  // 数据源管理页
  sources: {
    title: '数据源管理',
    description: '管理采集源与调度任务',
    stats: {
      totalSources: '数据源总数',
      activeSources: '运行中',
      inactiveSources: '已停止',
      lastFetch: '上次采集',
    },
    scheduler: {
      title: '调度器状态',
      statusOnline: '在线',
      statusOffline: '离线',
      statusRunning: '运行中',
      statusStopped: '已停止',
      enabled: '已启用',
      disabled: '已禁用',
      lastRun: '上次运行',
      nextRun: '下次运行',
      manualFetch: '手动采集',
      toggleScheduler: '切换调度器',
      startScheduler: '启动调度器',
      stopScheduler: '停止调度器',
    },
    category: {
      officialNews: '官方新闻',
      financialMedia: '财经媒体',
      socialMedia: '社交媒体',
      research: '研究报告',
      other: '其他来源',
    },
    sourceCard: {
      enabled: '已启用',
      disabled: '已停用',
      lastSuccess: '上次成功',
      fetchInterval: '采集间隔',
      totalFetched: '累计采集',
      errorRate: '错误率',
      configure: '配置',
      testConnection: '测试连接',
      viewLogs: '查看日志',
    },
    empty: {
      title: '暂无数据源',
      description: '还没有配置任何数据源',
      action: '添加数据源',
    },
    error: {
      title: '调度服务不可用',
      description: '调度服务暂时离线，部分功能可能无法使用',
      suggestion: '请检查 Python 数据服务是否已启动（端口 8000）',
      action: '重新连接',
    },
    actions: {
      fetchSuccess: '采集任务已启动',
      fetchFailed: '采集任务启动失败',
      toggleSuccess: '调度器状态已更新',
      toggleFailed: '调度器状态更新失败',
    },
  },

  // 领域趋势页
  trends: {
    title: '领域趋势',
    description: '洞察行业发展方向',
    stats: {
      monitoredDomains: '监控领域',
      bullishSignals: '利好信号',
      bearishSignals: '风险信号',
      trendScore: '趋势评分',
    },
    domains: {
      aiChip: 'AI芯片',
      smartHardware: '智能硬件',
      cloudComputing: '云计算',
      semiconductor: '半导体',
      dataCenter: '数据中心',
      all: '全部领域',
    },
    factors: {
      driversTitle: '驱动因素',
      risksTitle: '风险因素',
      noDrivers: '暂无驱动因素',
      noRisks: '暂无风险因素',
      viewDetail: '查看详情',
      impact: '影响程度',
      impactHigh: '高',
      impactMedium: '中',
      impactLow: '低',
    },
    propagation: {
      title: '传导路径',
      noPath: '暂无传导路径数据',
      upstream: '上游',
      downstream: '下游',
      related: '相关',
      nodes: '节点',
      edges: '关系',
      viewGraph: '查看图谱',
    },
    overview: {
      title: '领域概览',
      sentiment: '整体情感',
      events: '相关事件',
      lastUpdate: '更新时间',
      summary: '趋势总结',
      noSummary: '暂无总结',
    },
    sentiment: {
      veryBullish: '强烈利好',
      bullish: '利好',
      neutral: '中性',
      bearish: '利空',
      veryBearish: '强烈利空',
    },
    empty: {
      title: '暂无趋势数据',
      description: '当前领域还没有足够的数据进行分析',
      action: '切换领域',
    },
    error: {
      title: '趋势分析不可用',
      description: '无法加载领域趋势数据',
      action: '重新加载',
    },
    loading: {
      loadingFactors: '正在加载驱动因素...',
      loadingPropagation: '正在分析传导路径...',
      analyzingTrend: '正在分析趋势...',
    },
  },

  // 状态标签
  status: {
    online: '在线',
    offline: '离线',
    running: '运行中',
    stopped: '已停止',
    active: '活跃',
    inactive: '未活跃',
    enabled: '已启用',
    disabled: '已禁用',
    success: '成功',
    failed: '失败',
    pending: '等待中',
    processing: '处理中',
  },

  // 时间格式
  time: {
    justNow: '刚刚',
    minutesAgo: '分钟前',
    hoursAgo: '小时前',
    daysAgo: '天前',
    weeksAgo: '周前',
    monthsAgo: '月前',
    never: '从未',
    unknown: '未知',
  },

  // 单位
  units: {
    count: '个',
    articles: '篇',
    people: '人',
    times: '次',
    score: '分',
    percent: '%',
  },
} as const;

// 类型导出，方便 TypeScript 类型检查
export type EventsTextKey = keyof typeof EVENTS_TEXT;
export type CommonTextKey = keyof typeof EVENTS_TEXT.common;
export type FeedTextKey = keyof typeof EVENTS_TEXT.feed;
export type SourcesTextKey = keyof typeof EVENTS_TEXT.sources;
export type TrendsTextKey = keyof typeof EVENTS_TEXT.trends;
