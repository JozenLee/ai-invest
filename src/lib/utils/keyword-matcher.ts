// 关键词匹配工具
// 用于快速过滤候选ETF和指数

export interface MatchResult {
  score: number
  matchedKeywords: string[]
}

/**
 * 关键词匹配器
 */
export class KeywordMatcher {
  /**
   * 匹配节点名称与ETF/指数名称
   */
  match(nodeName: string, targetName: string, keywords?: string[]): MatchResult {
    const matchedKeywords: string[] = []
    let score = 0

    // 提取节点中的核心关键词（2-4个字的词）
    const coreKeywords = this.extractCoreKeywords(nodeName)

    // 检查核心关键词是否在目标名称中
    for (const keyword of coreKeywords) {
      if (targetName.includes(keyword)) {
        matchedKeywords.push(keyword)
        // 根据关键词长度给予不同权重：越长的词匹配权重越高
        score += keyword.length >= 3 ? 0.4 : 0.3
      }
    }

    // 检查同义词匹配
    const synonyms = this.getSynonyms(nodeName)
    for (const synonym of synonyms) {
      if (targetName.includes(synonym)) {
        matchedKeywords.push(synonym)
        score += 0.3
      }
    }

    // 检查用户提供的额外关键词
    if (keywords && keywords.length > 0) {
      for (const keyword of keywords) {
        if (targetName.includes(keyword)) {
          matchedKeywords.push(keyword)
          score += 0.3
        }
      }
    }

    // 限制最高分数为1.0
    score = Math.min(score, 1.0)

    return {
      score,
      matchedKeywords: [...new Set(matchedKeywords)],
    }
  }

  /**
   * 提取核心关键词（去除无意义的短词）
   */
  private extractCoreKeywords(text: string): string[] {
    const cleaned = text.replace(/[^一-龥a-zA-Z0-9]/g, '')
    const keywords = new Set<string>()

    // 提取2-4个字的词
    for (let len = 4; len >= 2; len--) {
      for (let i = 0; i <= cleaned.length - len; i++) {
        const keyword = cleaned.substring(i, i + len)
        // 过滤掉一些常见的无意义组合
        if (!this.isStopWord(keyword)) {
          keywords.add(keyword)
        }
      }
    }

    return Array.from(keywords)
  }

  /**
   * 判断是否为停用词或无意义词
   */
  private isStopWord(word: string): boolean {
    const stopWords = ['设计', '制造', '生产', '系统', '服务', '应用', '技术', '产品', '设备', '建设', '运营', '管理']
    return stopWords.includes(word)
  }

  /**
   * 批量匹配并过滤
   */
  filterByKeywords<T extends { name: string }>(
    nodeName: string,
    candidates: T[],
    options?: {
      keywords?: string[]
      minScore?: number
      maxResults?: number
    }
  ): Array<T & { matchScore: number; matchedKeywords: string[] }> {
    const minScore = options?.minScore ?? 0.3
    const maxResults = options?.maxResults ?? 20

    const results = candidates
      .map(candidate => {
        const matchResult = this.match(nodeName, candidate.name, options?.keywords)
        return {
          ...candidate,
          matchScore: matchResult.score,
          matchedKeywords: matchResult.matchedKeywords,
        }
      })
      .filter(r => r.matchScore >= minScore)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, maxResults)

    return results
  }

  /**
   * 分词（中文按字符分，也可以集成分词库）
   */
  private tokenize(text: string): string[] {
    // 移除标点和空格
    const cleaned = text.replace(/[^一-龥a-zA-Z0-9]/g, '')

    // 提取关键词（2-4字）
    const tokens: string[] = []
    for (let i = 0; i < cleaned.length; i++) {
      for (let len = 2; len <= 4 && i + len <= cleaned.length; len++) {
        tokens.push(cleaned.substring(i, i + len))
      }
    }

    // 去重
    return [...new Set(tokens)]
  }

  /**
   * 获取同义词
   */
  private getSynonyms(text: string): string[] {
    const synonymMap: Record<string, string[]> = {
      '芯片': ['半导体', '集成电路', 'IC', 'AI芯片'],
      '半导体': ['芯片', '集成电路', 'IC'],
      'AI': ['人工智能', '智能'],
      '人工智能': ['AI', '智能'],
      '算力': ['计算', '云计算', '数据中心'],
      '服务器': ['算力', '云计算'],
      '数据中心': ['算力', '云计算', '服务器'],
      '云计算': ['算力', '数据中心', '服务器'],
      '封装': ['半导体', '芯片'],
      '存储': ['内存', '芯片'],
      '网络': ['通信', '5G', '互联'],
      '通信': ['网络', '5G'],
      '5G': ['通信', '网络'],
      '光模块': ['通信', '网络'],
      '新能源': ['光伏', '风电', '电池', '新能源车'],
      '汽车': ['整车', '车辆', '新能源车'],
      '电池': ['储能', '动力电池', '新能源'],
      '动力电池': ['电池', '新能源', '新能源车'],
      '整车': ['汽车', '新能源车'],
      '充电': ['新能源车', '电池'],
      '材料': ['新材料'],
      '设备': ['装备', '器械'],
      '医药': ['医疗', '生物医药', '制药'],
    }

    const synonyms: string[] = []
    for (const [key, values] of Object.entries(synonymMap)) {
      if (text.includes(key)) {
        synonyms.push(...values)
      }
    }

    return synonyms
  }
}

export const keywordMatcher = new KeywordMatcher()
