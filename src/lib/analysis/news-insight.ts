import { NormalizedCompany, NormalizedNews, StructureSummary, cleanAdviceText, textValue } from './report-contract'

type PromptRecord = Record<string, unknown>

function promptValue(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function segmentLabel(value: unknown) {
  const raw = textValue(value)
  if (!raw) return ''
  if (/[一-鿿]/.test(raw)) return raw
  const labels: Record<string, string> = {
    ai: '人工智能',
    chip: '芯片',
    semiconductor: '半导体',
    equipment: '设备',
    wafer: '晶圆',
    foundry: '晶圆代工',
    packaging: '封装',
    testing: '测试',
    memory: '存储',
    server: '服务器',
    board: '板卡',
    cloud: '云计算',
    data: '数据',
    center: '中心',
    model: '模型',
    optical: '光通信',
    communication: '通信',
    display: '显示',
    sensor: '传感器',
    power: '功率',
    material: '材料',
    substrate: '基板',
    robotics: '机器人',
    software: '软件',
    supply: '供应',
    chain: '链',
  }
  return raw
    .toLowerCase()
    .split(/[_\s-]+/)
    .map((word) => labels[word] || '')
    .filter(Boolean)
    .join('')
}

function stance(positive: number, negative: number) {
  if (positive > negative * 1.3) return '偏积极'
  if (negative > positive * 1.3) return '偏谨慎'
  return '中性'
}

function compact(value: string, length: number) {
  const normalized = cleanAdviceText(value).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (Array.from(normalized).length <= length) return normalized
  const prefix = Array.from(normalized).slice(0, length).join('')
  const sentenceEnd = [...prefix.matchAll(/[。！？]/gu)].at(-1)
  if (sentenceEnd?.index != null) return prefix.slice(0, sentenceEnd.index + 1)
  return `${prefix.replace(/[，、；：及与和]$/u, '')}。`
}

function summarizeSegments(news: NormalizedNews) {
  const counts = new Map<string, number>()
  for (const item of news.items) {
    for (const code of item.segmentCodes) {
      const label = segmentLabel(code)
      if (label) counts.set(label, (counts.get(label) || 0) + 1)
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
}

export function buildNewsInsightFallback(news: NormalizedNews, company?: NormalizedCompany, structure?: StructureSummary) {
  const items = news.items
  if (!items.length) return '## 一、近期热点\n\n暂无近期资讯，无法形成资讯与产业链结论。'

  const positive = items.filter((item) => (item.sentiment ?? 0) > 0.1).length
  const negative = items.filter((item) => (item.sentiment ?? 0) < -0.1).length
  const neutral = Math.max(items.length - positive - negative, 0)
  const highImpact = [...items]
    .sort((a, b) => (b.impact ?? 0) - (a.impact ?? 0))
    .slice(0, 3)
  const segments = summarizeSegments(news)
  const segmentText = segments.length ? segments.map(([name, count]) => `${name}（${count}条）`).join('、') : '暂无已标注环节'
  const structureText = structure && structure.segmentCount > 0
    ? `产业链当前识别到 ${structure.segmentCount} 个环节，其中 ${structure.positiveSegments.length} 个环节区间表现为正、${structure.negativeSegments.length} 个环节区间表现为负。`
    : '产业链环节行情暂无完整结构化结果。'
  const companyText = company && company.analyzed > 0
    ? `企业数据已完成 ${company.analyzed}/${company.total || company.analyzed} 家分析，重点企业结论仍需结合行情与覆盖度核对。`
    : '企业数据暂未形成可交叉验证的样本。'
  const conclusion = `本次纳入 ${items.length} 条资讯，偏积极 ${positive} 条、偏谨慎 ${negative} 条、中性 ${neutral} 条，资讯面判断为${stance(positive, negative)}。${structureText}`

  return [
    '## 一、近期热点',
    `近期资讯主要围绕${segmentText}展开。高影响样本包括：${highImpact.map((item) => `“${compact(item.title, 36)}”`).join('、')}。这些是新闻事实，不直接等同于投资结论。`,
    '',
    '## 二、产业链影响',
    `${structureText}${companyText}已标注资讯优先用于判断热点可能落在哪些环节，未标注资讯不纳入单一环节的强结论。`,
    '',
    '## 三、机会与风险',
    `机会：偏积极资讯共 ${positive} 条，若相关环节后续价格表现、企业公告或财报继续验证，产业链景气判断的可信度会提高。`,
    `风险：偏谨慎资讯共 ${negative} 条，且单条新闻可能存在重复报道、预期交易或数据覆盖不足，不能仅凭新闻新增风险。`,
    '',
    '## 四、后续关注',
    '跟踪高影响资讯对应环节的价格反应、企业公告和财报兑现情况；优先补齐未标注资讯的产业链映射，并观察资讯情绪是否与市场广度同步。',
    '',
    '## 五、结论',
    conclusion,
  ].join('\n\n')
}

export function buildIndustryNewsInsightPrompt(
  industryName: string,
  recentNews: PromptRecord[],
  graphContext: PromptRecord = {},
) {
  const stages = Array.isArray(graphContext.stages) ? graphContext.stages as PromptRecord[] : []
  const companyNames = Array.isArray(graphContext.companyNames)
    ? graphContext.companyNames.filter((name): name is string => typeof name === 'string')
    : []
  return `作为资深产业研究员，请对「${industryName || '未知产业'}」近期资讯进行结构化分析。

## 分析边界
- 只基于提供的新闻和产业图谱上下文进行判断，不要补写未提供的事实。
- 区分新闻事实、分析推断和待验证信息。
- 不直接给出买卖指令，不使用确定性收益承诺。
- 全文只使用中文；趋势、质量、状态等标签必须翻译成中文，不要输出 sideways、high、medium、success 等英文标签。

## 近期新闻（按时间优先）
${recentNews.length > 0
    ? recentNews.map((item, index) => {
        const content = promptValue(item.summary || item.content, '暂无摘要')
        const publishedAt = promptValue(item.published_at || item.publish_time, '时间未知')
        return `${index + 1}. ${promptValue(item.title, '无标题')}｜${promptValue(item.source, '来源未知')}｜${publishedAt}\n   ${content}`
      }).join('\n')
    : '暂无相关新闻'}

## 产业知识图谱上下文
${stages.length > 0
    ? stages.map((stage) => {
        const segments = Array.isArray(stage.segments)
          ? stage.segments.filter((segment): segment is string => typeof segment === 'string')
          : []
        const companyCount = typeof stage.companyCount === 'number' ? stage.companyCount : 0
        return `- ${promptValue(stage.name, '未命名阶段')}：${segments.join('、') || '暂无环节'}（约${companyCount}家关联企业）`
      }).join('\n')
    : '暂无产业图谱数据'}
代表企业：${companyNames.join('、') || '暂无'}

请输出一份600字以内的中文资讯分析报告，严格使用以下结构：
一、近期热点：归纳2-4个主要主题，并说明对应新闻事实；
二、产业链影响：说明热点可能影响产业链的哪些阶段、环节或企业类型，标注“事实/推断”；
三、机会与风险：分别列出2-3项，说明触发条件和影响方向；
四、后续关注：列出未来1-3个月需要跟踪的指标、政策、公司动态或数据验证点；
五、结论：用一段话概括当前产业资讯面状态，并给出“偏积极/中性/偏谨慎”的判断。

要求：语言简洁、观点可核对、优先引用新闻标题和图谱环节，不重复罗列新闻。`
}

export function summarizeNewsForAdvice(value: string) {
  const normalized = value.replace(/\r\n/g, '\n').trim()
  const conclusion = normalized.match(/##\s*五、结论\s*\n([\s\S]*)$/i)?.[1]?.trim()
  const paragraphs = normalized
    .split(/\n\s*\n/)
    .map((item) => item.trim())
    .filter((item) => item && !/^#+\s*[^\n]+$/.test(item))
  const candidate = conclusion || paragraphs.find((item) => !/^#+\s*/.test(item)) || normalized
  // Keep the complete conclusion in the normal 600-character report budget;
  // only pathological output is shortened, and then only at a sentence end.
  return compact(candidate.replace(/^#+\s*[^\n]+\n?/, ''), 260)
}
