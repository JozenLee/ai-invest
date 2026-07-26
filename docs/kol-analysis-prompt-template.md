# KOL观点分析Prompt模板

## 基本信息输入
- 大V姓名：{influencer_name}
- 平台：{platform}
- 帖子内容：{content}
- 发布时间：{publish_time}
- 互动数据：点赞 {likes}，评论 {comments}，转发 {shares}

## 分析维度

### 1. 观点提取（Opinion Extraction）
**要求**：
- 提取核心观点摘要（30-50字）
- 识别观点立场：看多(bullish)/中性(neutral)/看空(bearish)
- 评估观点置信度（0-1，基于论据充分性）
- 列出3-5个关键论点

**输出字段**：
```json
{
  "opinion_summary": "核心观点摘要",
  "opinion_stance": "bullish|neutral|bearish",
  "opinion_confidence": 0.85,
  "main_points": ["论点1", "论点2", "论点3"]
}
```

### 2. 论据评估（Evidence Assessment）
**要求**：
- 提取支撑论据（数据、事实、逻辑）
- 评估可信度分数（0-1）
- 识别论据类型：数据支撑/行业经验/逻辑推理/消息来源

**输出字段**：
```json
{
  "arguments": [
    {
      "type": "data|experience|logic|source",
      "content": "论据内容",
      "credibility": 0.8
    }
  ],
  "credibility_score": 0.75
}
```

### 3. 领域分类（Domain Classification）
**要求**：
- 主要领域：从以下选择
  - AI_CHIP（AI芯片）
  - AI_SERVER（AI服务器）
  - AI_STORAGE（AI存储）
  - AI_NETWORK（AI网络）
  - AI_APPLICATION（AI应用）
  - AI_INFRASTRUCTURE（AI基础设施）
  - MARKET_GENERAL（市场综合）
- 次要领域：可多选
- 领域相关度评分（0-1）

**输出字段**：
```json
{
  "primary_domain": "AI_CHIP",
  "secondary_domains": ["AI_SERVER"],
  "domain_scores": {
    "AI_CHIP": 0.9,
    "AI_SERVER": 0.6
  }
}
```

### 4. 情绪分析（Sentiment Analysis）
**要求**：
- 情绪分数：-1到1（-1极度悲观，0中性，1极度乐观）
- 情绪方面：对技术/对市场/对公司/对政策的情绪

**输出字段**：
```json
{
  "sentiment": 0.7,
  "sentiment_aspects": {
    "technology": 0.8,
    "market": 0.6,
    "companies": 0.7,
    "policy": 0.5
  }
}
```

### 5. 风险与投资含义（Risk & Investment Implications）
**要求**：
- 识别提及的风险点
- 投资含义（看好/观望/谨慎）
- 时间维度（短期/中期/长期）

**输出字段**：
```json
{
  "risks": ["风险1", "风险2"],
  "investment_implications": "积极|中性|谨慎",
  "time_horizon": "short|medium|long"
}
```

## 完整输出格式
```json
{
  "opinion_summary": "英伟达新一代GPU算力提升显著，看好AI芯片板块中长期投资价值",
  "opinion_stance": "bullish",
  "opinion_confidence": 0.85,
  "main_points": [
    "新GPU算力提升3倍，技术领先优势扩大",
    "AI服务器需求持续旺盛，订单饱满",
    "国产替代加速，供应链机会增多"
  ],
  
  "arguments": [
    {
      "type": "data",
      "content": "英伟达B100 GPU性能提升3倍",
      "credibility": 0.9
    },
    {
      "type": "source",
      "content": "供应链消息显示订单排期已到明年Q2",
      "credibility": 0.7
    }
  ],
  "credibility_score": 0.8,
  
  "primary_domain": "AI_CHIP",
  "secondary_domains": ["AI_SERVER", "AI_INFRASTRUCTURE"],
  "domain_scores": {
    "AI_CHIP": 0.9,
    "AI_SERVER": 0.7,
    "AI_INFRASTRUCTURE": 0.5
  },
  
  "sentiment": 0.75,
  "sentiment_aspects": {
    "technology": 0.9,
    "market": 0.7,
    "companies": 0.8,
    "policy": 0.6
  },
  
  "risks": [
    "地缘政治风险",
    "估值过高风险"
  ],
  "investment_implications": "积极",
  "time_horizon": "medium"
}
```

## 注意事项
1. 所有分数范围严格遵守（0-1或-1到1）
2. 枚举值必须从预定义列表中选择
3. 如果内容不包含某维度信息，对应字段返回null
4. 保持客观分析，不添加主观判断
5. 摘要和论点使用简洁专业语言
