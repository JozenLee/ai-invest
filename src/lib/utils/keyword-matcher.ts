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
    const nodeTokens = this.tokenize(nodeName)
    const targetTokens = this.tokenize(targetName)
    const keywordTokens = keywords ? keywords.flatMap(k => this.tokenize(k)) : []

    const allTokens = [...nodeTokens, ...keywordTokens]
    const matchedKeywords: string[] = []
    let matchCount = 0

    // 检查直接匹配
    for (const token of allTokens) {
      if (targetName.includes(token)) {
        matchedKeywords.push(token)
        matchCount++
      }
    }

    // 检查模糊匹配（同义词、相似词）
    const synonyms = this.getSynonyms(nodeName)
    for (const synonym of synonyms) {
      if (targetName.includes(synonym)) {
        matchedKeywords.push(synonym)
        matchCount += 0.5
      }
    }

    // 计算匹配得分
    const score = Math.min(matchCount / Math.max(allTokens.length, 1), 1)

    return {
      score,
      matchedKeywords: [...new Set(matchedKeywords)],
    }
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
      '芯片': ['半导体', '集成电路', 'IC'],
      '半导体': ['芯片', '集成电路', 'IC'],
      'AI': ['人工智能', '智能'],
      '人工智能': ['AI', '智能'],
      '算力': ['计算', '云计算'],
      '新能源': ['光伏', '风电', '电池'],
      '汽车': ['整车', '车辆'],
      '电池': ['储能', '动力电池'],
      '材料': ['新材料'],
      '设备': ['装备', '器械'],
      '通信': ['5G', '网络'],
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
