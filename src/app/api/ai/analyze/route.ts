import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { buildIndustryNewsInsightPrompt } from '@/lib/analysis/news-insight';

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:8000';

type PromptRecord = Record<string, unknown>;

function promptValue(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function cleanPublishText(value: string) {
  return value
    .replace(/```(?:[a-zA-Z0-9_-]+\n)?([\s\S]*?)```/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s*[-*_]{3,}\s*$/gm, '')
    .replace(/\|/g, ' ')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function limitText(value: string, maxLength: number) {
  return Array.from(value).slice(0, maxLength).join('').trim();
}

function safeTitle(industryName: string, candidate: string) {
  const normalized = cleanPublishText(candidate).replace(/[\r\n]+/g, '').trim();
  if (Array.from(normalized).length <= 20) return normalized;
  const fallbacks = [
    `${industryName}投资观察`,
    `${industryName}研究简报`,
    '产业投资观察',
  ];
  const completeFallback = fallbacks.find((value) => Array.from(value).length <= 20);
  return completeFallback || `${limitText(industryName, 12)}观察`;
}

function truncateAtParagraph(value: string, maxLength: number) {
  const normalized = value.trim();
  if (Array.from(normalized).length <= maxLength) return normalized;
  const paragraphs = normalized.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  let result = '';
  for (const paragraph of paragraphs) {
    const candidate = result ? `${result}\n\n${paragraph}` : paragraph;
    if (Array.from(candidate).length > maxLength) break;
    result = candidate;
  }
  return result || limitText(normalized, maxLength);
}

function buildXhsHashtags(industryName: string) {
  const industryTag = industryName.replace(/[^\p{L}\p{N}\u4e00-\u9fff]/gu, '');
  return [`#${industryTag || '行业研究'}`, '#投资研究', '#产业链', '#行业观察'].join(' ');
}

function formatXhsContent(value: string, industryName: string) {
  const decorated = cleanPublishText(value)
    .replace(/(^|\n)\s*核心判断\s*[:：]?/g, '$1📌 核心判断：')
    .replace(/(^|\n)\s*关键变化\s*[:：]?/g, '$1🔎 关键变化：')
    .replace(/(^|\n)\s*机会与风险\s*[:：]?/g, '$1🚀 机会与风险：')
    .replace(/(^|\n)\s*后续关注\s*[:：]?/g, '$1👀 后续关注：')
    .replace(/(^|\n)\s*风险提示\s*[:：]?/g, '$1⚠️ 风险提示：')
    .trim();
  const hashtags = buildXhsHashtags(industryName);
  const contentBudget = 980 - Array.from(`\n\n${hashtags}`).length;
  return `${truncateAtParagraph(decorated, contentBudget)}\n\n${hashtags}`.trim();
}

const PUBLISH_REFINEMENT_TEMPLATE = `
你是小红书投资研究内容编辑。底层报告是全面研究版本，只作为事实和推理依据，不能原样展示给用户。

请把输入报告改写成适合手机阅读的小红书研究卡片，必须遵循以下统一结构：
一、核心结论：先用1-2句话说清当前判断；
二、关键事实：提炼2-4条可核对事实或数据，不编造数字；
三、产业影响：说明影响产业链的环节、企业类型或传导路径，并区分事实与推断；
四、机会与风险：各列2-3条，写清触发条件和观察方向；
五、关注清单：列出未来1-3个月值得跟踪的指标、事件或验证点；
六、风险提示：用一句话说明不确定性。

格式要求：
- 只输出中文纯文本，不要 Markdown、表格、代码块、星号或井号；
- 保留以上六个小标题，每个小标题独占一行；
- 每个小标题下使用短句或“•”分点，每点不超过55字；
- 全文控制在700-900字，信息完整但不堆砌；
- 不直接给出确定性买卖指令，不承诺收益，不补写输入中没有的事实；
- 语言像有经验的研究员给普通投资者做的清晰解读，少用“综上所述”“值得注意的是”等套话。
`;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL,
});

/**
 * POST /api/ai/analyze - AI分析（支持新闻事件分析和产业综合分析）
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type } = body;

    // 如果是产业综合分析，直接在Next.js处理
    if (type === 'industry_comprehensive') {
      const { data } = body;
      const { industryName, companyTrend, marketTrend, recentNews } = data;
      const newsItems = Array.isArray(recentNews) ? recentNews as PromptRecord[] : [];

      const prompt = `作为资深投资分析师，请对${industryName}领域进行综合投资分析。

## 企业发展趋势
${companyTrend || '暂无数据'}

## 大盘趋势
${marketTrend || '暂无数据'}

## 最新资讯
${newsItems.length > 0
  ? newsItems.map((n) => `- ${promptValue(n.title, '无标题')}: ${promptValue(n.summary, '暂无摘要')}`).join('\n')
  : '暂无数据'}

请从以下维度进行综合分析（控制在600字以内）：
1. 领域整体发展态势
2. 投资机会与风险
3. 关键关注点
4. 投资展望

要求：
- 客观专业，数据驱动
- 结合企业、市场和资讯的综合视角
- 突出关键发现和投资价值`;

      const message = await anthropic.messages.create({
        model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022',
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const analysis = message.content[0].type === 'text' ? message.content[0].text : '';

      return NextResponse.json({ success: true, analysis });
    }

    // 资讯分析将近期新闻与产业知识图谱上下文结合，生成可追溯的热点影响报告。
    if (type === 'industry_news_insight') {
      const { data } = body;
      const { industryName, recentNews, graphContext } = data || {};
      const news = Array.isArray(recentNews) ? recentNews as PromptRecord[] : [];
      const graph = graphContext && typeof graphContext === 'object'
        ? graphContext as PromptRecord
        : {};
      const prompt = buildIndustryNewsInsightPrompt(String(industryName || ''), news, graph);

      const message = await anthropic.messages.create({
        model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022',
        max_tokens: 2400,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const analysis = message.content[0].type === 'text' ? message.content[0].text : '';

      return NextResponse.json({ success: true, analysis });
    }

    if (type === 'publish_report') {
      const { data } = body;
      const industryName = promptValue(data?.industryName, '目标产业');
      const moduleTitle = promptValue(data?.moduleTitle, '产业分析');
      const rawReport = promptValue(data?.rawReport, '暂无底层分析报告');
      const prompt = `${PUBLISH_REFINEMENT_TEMPLATE}

产业：${industryName}
报告模块：${moduleTitle}

底层全面分析报告：
${rawReport}`;
      const message = await anthropic.messages.create({
        model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022',
        max_tokens: 3200,
        messages: [{ role: 'user', content: prompt }],
      });
      const refined = message.content[0].type === 'text' ? message.content[0].text : '';
      return NextResponse.json({ success: true, analysis: cleanPublishText(refined) });
    }

    if (type === 'publish_copy') {
      const { data } = body;
      const industryName = promptValue(data?.industryName, '目标产业');
      const reports = Array.isArray(data?.reports) ? data.reports as PromptRecord[] : [];
      const reportText = reports.length > 0
        ? reports.map((report, index) => `${index + 1}. ${promptValue(report.title, '分析报告')}\n${promptValue(report.content, '暂无报告内容')}`).join('\n\n')
        : '暂无分析报告';
      const prompt = `请把以下「${industryName}」的多份已经美化过的 AI 投资分析报告，合并提炼为一篇适合小红书发布的中文投资研究笔记。

要求：
- 只使用报告提供的信息，不编造数据或新闻事实；
- 标题控制在18-20个中文字符以内，正文控制在850-950个字符以内，确保信息完整；
- 输出严格使用以下格式：第一行“标题：...”，随后输出纯文本正文；
- 正文使用“核心判断、关键变化、机会与风险、后续关注、风险提示”5个短段落，每段之间空一行，每段不超过180字；
- 每个段落可以使用“核心判断：”“关键变化：”等纯文本小标题，不要使用Markdown符号、表格或代码块；
- 语气专业但易读，适合手机端快速阅读，避免直接给出确定性买卖指令；
- 正文必须覆盖报告中的主要结论、事实依据、机会风险和关注点，不要只写摘要。

分析报告：
${reportText}`;
      const message = await anthropic.messages.create({
        model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022',
        max_tokens: 2200,
        messages: [{ role: 'user', content: prompt }],
      });
      const copy = message.content[0].type === 'text' ? message.content[0].text : '';
      const titleMatch = copy.match(/^\s*(?:标题|Title)\s*[:：]\s*(.+)$/mi);
      const title = safeTitle(industryName, titleMatch?.[1] || `${industryName}投资观察`);
      const content = formatXhsContent(copy.replace(/^\s*(?:标题|Title)\s*[:：].+$/mi, '').trim(), industryName);
      return NextResponse.json({ success: true, title, content });
    }

    // 其他类型的分析转发到Python服务
    const response = await fetch(`${PYTHON_API_URL}/api/ai/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(
        {
          success: false,
          error: error.detail || 'AI analysis failed',
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in AI analysis:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'AI analysis failed',
      },
      { status: 500 }
    );
  }
}
