// ETF/指数匹配的AI Prompt模板

export function buildMatchingPrompt(params: {
  nodeName: string
  nodeType: string
  nodeDescription?: string
  industryContext?: string
  etfCandidates: Array<{ ticker: string; name: string }>
  indexCandidates: Array<{ code: string; name: string }>
}): string {
  const { nodeName, nodeType, nodeDescription, industryContext, etfCandidates, indexCandidates } = params

  return `你是一位专业的金融分析师，专注于A股市场的ETF和指数分析。

**任务**：分析产业节点与ETF/指数的相关性

**节点信息**：
- 名称：${nodeName}
- 类型：${nodeType}
${nodeDescription ? `- 描述：${nodeDescription}` : ''}
${industryContext ? `- 产业链位置：${industryContext}` : ''}

**候选ETF列表**（已通过关键词初筛，共${etfCandidates.length}个）：
${etfCandidates.map(etf => `- ${etf.ticker}: ${etf.name}`).join('\n')}

**候选指数列表**（已通过关键词初筛，共${indexCandidates.length}个）：
${indexCandidates.map(idx => `- ${idx.code}: ${idx.name}`).join('\n')}

**输出要求**：
请分析每个候选项与节点的相关性，输出JSON格式：
{
  "etfs": [
    {
      "code": "515050",
      "name": "华夏芯片ETF",
      "relevance": 0.95,
      "reasoning": "该ETF主要投资半导体芯片产业链，与节点高度相关"
    }
  ],
  "indices": [
    {
      "code": "931865",
      "name": "中证芯片产业指数",
      "relevance": 0.92,
      "reasoning": "该指数覆盖芯片设计、制造、封测全产业链"
    }
  ]
}

**评分标准**：
- 1.0: 直接追踪该细分领域，核心成分股高度匹配
- 0.8-0.9: 高度相关，该领域是主要成分（权重>30%）
- 0.6-0.7: 中度相关，该领域是次要成分（权重10-30%）
- 0.4-0.5: 低度相关，有间接关联但权重较小
- <0.4: 不推荐（应过滤）

**注意事项**：
1. 只返回相关度>=0.6的结果
2. 每类最多返回5个结果
3. 按相关度降序排列
4. reasoning字段简明扼要（不超过30字）
5. 确保输出有效的JSON格式，不要包含其他文字

请直接输出JSON，不要添加任何解释文字。`
}
