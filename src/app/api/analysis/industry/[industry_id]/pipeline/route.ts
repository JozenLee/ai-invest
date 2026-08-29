import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { aiClient } from '@/lib/ai/ai-factory'
import {
  assessReportQuality,
  buildEvidence,
  buildRuleBasedAdvice,
  buildStructureSummary,
  composeInvestmentConclusion,
  parseJsonObject,
} from '@/lib/analysis/daily-action'
import {
  normalizeCompany,
  normalizeMarket,
  normalizeNews,
  normalizePortfolio,
  normalizeAdvice,
  type DailyActionReportData,
  type InvestmentHorizon,
  type ModuleHealth,
  type RiskTolerance,
} from '@/lib/analysis/report-contract'
import { ANALYSIS_MODULE_ORDER, ANALYSIS_PIPELINE_STEPS, getAnalysisPipelineSteps, normalizeAiModuleConfig, type AnalysisPipelineModule } from '@/config/comprehensive-analysis-flow'

// 企业数据模块可能同时执行多家企业的行情、财报和公告抓取，且可选执行两次 AI 请求。
// 不能让 Next.js 路由在 6 分钟前主动终止仍在执行的数据服务请求。
export const maxDuration = 900

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'
const ORDER = ANALYSIS_MODULE_ORDER
const FLOW_STEPS = ANALYSIS_PIPELINE_STEPS

type Result = { success: boolean; payload: Record<string, unknown>; error?: string; fetchedAt: string; durationMs: number }

const DEFAULT_MODULE_TIMEOUT_MS = 600000
const COMPANY_MODULE_TIMEOUT_MS = 720000

function moduleTimeoutMs(url: string) {
  return url.includes('/companies?') ? COMPANY_MODULE_TIMEOUT_MS : DEFAULT_MODULE_TIMEOUT_MS
}

async function fetchModule(url: string): Promise<Result> {
  const started = Date.now()
  const fetchedAt = new Date().toISOString()
  const timeoutMs = moduleTimeoutMs(url)
  try {
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) })
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>
    const error = typeof payload.detail === 'string' ? payload.detail : typeof payload.error === 'string' ? payload.error : undefined
    return { success: response.ok, payload, error: response.ok ? undefined : error || `HTTP ${response.status}`, fetchedAt, durationMs: Date.now() - started }
  } catch (error) {
    const isTimeout = error instanceof DOMException
      ? error.name === 'TimeoutError' || error.name === 'AbortError'
      : error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError' || /abort|timeout/i.test(error.message))
    return {
      success: false,
      payload: {},
      error: isTimeout
        ? `数据服务请求超时（${Math.round(timeoutMs / 1000)}秒），未返回可用结果`
        : error instanceof Error ? error.message : '数据服务不可用',
      fetchedAt,
      durationMs: Date.now() - started,
    }
  }
}

function health(result: Result, records: number, warning?: string): ModuleHealth {
  return { status: result.success ? (records > 0 && !warning ? 'success' : 'degraded') : 'failed', fetchedAt: result.fetchedAt, durationMs: result.durationMs, records, error: result.error || warning }
}

function markdown(data: DailyActionReportData) {
  return [`# ${data.snapshot.industryName} 每日投资行动报告`, '', `分析时点：${data.snapshot.asOf}`, '', '## 核心结论', data.advice.investmentConclusion || composeInvestmentConclusion(data.advice.summary, data.advice.strategy), '', '## 风险与质量提示', data.advice.riskWarning, '', ...data.advice.limitations.map((item) => `- ${item}`)].join('\n')
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ industry_id: string }> }) {
  const encoder = new TextEncoder()
  const { industry_id: industryId } = await params
  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const industryName = typeof body.industryName === 'string' ? body.industryName.trim() : ''
  const riskTolerance = (body.riskTolerance || 'balanced') as RiskTolerance
  const investmentHorizon = (body.investmentHorizon || 'short') as InvestmentHorizon
  const companySource = body.companySource === 'graph' ? 'graph' : 'etf_holdings'
  const marketIndexCodes = Array.isArray(body.marketIndexCodes)
    ? body.marketIndexCodes.map((code) => String(code).trim()).filter(Boolean).join(',')
    : ''
  const requestedCount = Math.min(Math.max(Number(body.moduleCount || 5), 1), ORDER.length)
  const stages = ORDER.slice(0, requestedCount)
  const requestedAiReport = typeof body.generateAiReport === 'boolean' ? body.generateAiReport : undefined
  const aiModules = requestedAiReport === undefined
    ? normalizeAiModuleConfig(body.aiModules)
    : normalizeAiModuleConfig(Object.fromEntries(ANALYSIS_MODULE_ORDER.map((module) => [module, requestedAiReport])))
  const aiEnabled = (module: AnalysisPipelineModule) => aiModules[module]
  const periodDays = Math.min(Math.max(Number(body.periodDays || 90), 30), 365)

  if (!industryName) return new Response(JSON.stringify({ success: false, error: 'industryName is required' }), { status: 400 })

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
      const startedAt = new Date().toISOString()
      const modules: Record<string, ModuleHealth> = {}
      let currentStepId = ''
      let market = normalizeMarket({}), news = normalizeNews({}), company = normalizeCompany({}), portfolio = normalizePortfolio({})
      let advice = buildRuleBasedAdvice(industryName, market, news, company, portfolio, assessReportQuality(market, news, company, portfolio, modules, industryName), riskTolerance, investmentHorizon)
      let savedReport: Awaited<ReturnType<typeof prisma.aIAnalysisReport.create>> | null = null
      try {
        send({ type: 'run_started', runId: randomUUID(), stages, steps: FLOW_STEPS })
        // 每次只推进一个子流程，避免前端收到“整列同时 started/completed”的假进度。
        // 数据服务的模块接口目前以模块为原子边界，因此模块内部的后续步骤在收到
        // 模块结果后逐个确认；overview 则按质量→证据→AI逐个推进。
        const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
        const runStep = async <T>(stepId: string, operation?: () => Promise<T> | T, detail?: string): Promise<T | undefined> => {
          currentStepId = stepId
          send({ type: 'step', stepId, status: 'started' })
          await pause()
          // 长耗时的数据源请求期间持续刷新 NDJSON 连接，避免反向代理将无输出的
          // 流误判为空闲连接而提前断开。前端无需处理 heartbeat 事件。
          const heartbeat = operation
            ? setInterval(() => {
                try { send({ type: 'step', stepId, status: 'started', detail: '正在执行，数据服务处理中…' }) } catch { /* 客户端已断开 */ }
              }, 15000)
            : undefined
          try {
            const value = operation ? await operation() : undefined
            send({ type: 'step', stepId, status: 'completed', detail })
            await pause()
            return value
          } catch (error) {
            const message = error instanceof Error ? error.message : '该步骤执行失败'
            send({ type: 'step', stepId, status: 'failed', error: message })
            throw error
          } finally {
            if (heartbeat) clearInterval(heartbeat)
          }
        }
        const moduleSteps = (module: AnalysisPipelineModule) => getAnalysisPipelineSteps(module).map((step) => step.id)
        const persistReport = async (provided?: DailyActionReportData) => {
          const quality = provided?.quality || assessReportQuality(market, news, company, portfolio, modules, industryName)
          const evidence = provided?.evidence || buildEvidence(market, news, company, quality)
          const structure = provided?.structure || buildStructureSummary(company, news)
          if (!provided) {
            advice = buildRuleBasedAdvice(industryName, market, news, company, portfolio, quality, riskTolerance, investmentHorizon)
            advice.evidence = evidence
          }
          const reportData: DailyActionReportData = provided || {
            schemaVersion: '2.0',
            snapshot: { runId: randomUUID(), asOf: startedAt, timezone: 'Asia/Shanghai', periodDays, industryId, industryName, modules, preferences: { riskTolerance, investmentHorizon }, companySource, marketToCompany: { selectedEtfCodes: market.etfCandidates.concat(market.etfs).map((item) => String(item.code || item.symbol || '')).filter(Boolean), companySource } },
            quality, market, news, company, portfolio, structure, advice, evidence,
          }
          const data = { type: 'comprehensive', industryId, industryName, title: `${industryName} 每日投资行动报告`, summary: advice.summary, content: markdown(reportData), dataJson: JSON.stringify(reportData) }
          savedReport = savedReport
            ? await prisma.aIAnalysisReport.update({ where: { id: savedReport.id }, data })
            : await prisma.aIAnalysisReport.create({ data })
          send({ type: 'report', report: { id: savedReport.id, title: savedReport.title, createdAt: savedReport.createdAt.toISOString() } })
          return savedReport
        }

        if (stages.includes('market')) {
          const [graphStep, quoteStep, indexStep, signalStep, reportStep] = moduleSteps('market')
          await runStep(graphStep, undefined, '已读取产业图谱中的 ETF 与指数候选')
          const marketQuery = new URLSearchParams({ industry_name: industryName, period_days: String(periodDays), generate_ai_report: String(aiEnabled('market')) })
          if (marketIndexCodes) marketQuery.set('market_index_codes', marketIndexCodes)
          const result = await runStep(quoteStep, async () => {
            const value = await fetchModule(`${DATA_SERVICE_URL}/api/industry-analysis/${encodeURIComponent(industryId)}/market?${marketQuery.toString()}`)
            if (!value.success) throw new Error(value.error || '市场分析失败')
            return value
          }, 'ETF 行情获取完成，正在整理有效样本') as Result
          market = normalizeMarket(result.payload)
          modules.market = health(result, market.etfs.length + market.indices.length)
          await runStep(indexStep, undefined, `已整理 ${market.indices.length} 个指数与资金信号`)
          await runStep(signalStep, undefined, `已完成 ${market.etfs.length} 个 ETF、${market.indices.length} 个指数的趋势指标计算`)
          if (aiEnabled('market')) await runStep(reportStep)
          else { send({ type: 'step', stepId: reportStep, status: 'skipped' }); await pause() }
          send({ type: 'module', stage: 'market', status: modules.market.status, result: market, error: modules.market.error })
          await persistReport()
        }
        if (stages.includes('news')) {
          const [graphStep, validateStep, impactStep] = moduleSteps('news')
          const result = await runStep(graphStep, async () => {
            const value = await fetchModule(`${DATA_SERVICE_URL}/api/industry-analysis/${encodeURIComponent(industryId)}/news?industry_name=${encodeURIComponent(industryName)}&limit=50&generate_ai_report=${String(aiEnabled('news'))}`)
            if (!value.success) throw new Error(value.error || '资讯分析失败')
            return value
          }, '资讯读取完成，进入字段校验') as Result
          news = normalizeNews(result.payload)
          await runStep(validateStep, () => {
            if (!news.items.length) throw new Error('资讯分析未返回有效资讯')
          }, `已校验 ${news.items.length} 条有效资讯`)
          if (aiEnabled('news')) await runStep(impactStep, undefined, `已完成 ${news.items.length} 条资讯的影响方向整理`)
          else { send({ type: 'step', stepId: impactStep, status: 'skipped' }); await pause() }
          modules.news = health(result, news.items.length)
          send({ type: 'module', stage: 'news', status: modules.news.status, result: news, error: modules.news.error })
          await persistReport()
        }
        if (stages.includes('company')) {
          const [candidatesStep, dataStep, metricsStep, reportStep] = moduleSteps('company')
          await runStep(candidatesStep, undefined, '企业候选范围已确定')
          const etfCodes = market.etfCandidates.concat(market.etfs).map((item) => String(item.code || item.symbol || '')).filter(Boolean).join(',')
          const result = await runStep(dataStep, async () => {
            const value = await fetchModule(`${DATA_SERVICE_URL}/api/industry-analysis/${encodeURIComponent(industryId)}/companies?period_days=${periodDays}&source=${companySource}&etf_codes=${encodeURIComponent(etfCodes)}&generate_ai_report=${String(aiEnabled('company'))}`)
            if (!value.success) throw new Error(value.error || '企业数据读取失败')
            if (aiEnabled('company') && typeof value.payload.report_warning === 'string' && value.payload.report_warning.trim()) throw new Error(value.payload.report_warning)
            return value
          }, '企业行情、财报与公告读取完成') as Result
          company = normalizeCompany(result.payload)
          await runStep(metricsStep, undefined, `已完成 ${company.analyzed} 家企业的指标分析`)
          if (aiEnabled('company')) await runStep(reportStep)
          else { send({ type: 'step', stepId: reportStep, status: 'skipped' }); await pause() }
          modules.company = health(result, company.analyzed, typeof result.payload.report_warning === 'string' ? result.payload.report_warning : undefined)
          send({ type: 'module', stage: 'company', status: modules.company.status, result: company, error: modules.company.error })
          await persistReport()
        }
        if (stages.includes('portfolio')) {
          const [readStep, quoteStep] = moduleSteps('portfolio')
          const portfolios = await runStep(readStep, () => prisma.portfolio.findMany({ include: { holdings: true }, orderBy: { createdAt: 'desc' } }), '持仓组合读取完成') as Awaited<ReturnType<typeof prisma.portfolio.findMany>>
          portfolio = normalizePortfolio(portfolios.find((item) => item.isDefault) ?? portfolios[0] ?? {})
          await runStep(quoteStep, undefined, `已补充 ${portfolio.holdings.length} 个持仓行情`)
          modules.portfolio = { status: portfolio.holdings.length ? 'success' : 'degraded', fetchedAt: new Date().toISOString(), records: portfolio.holdings.length, error: portfolio.holdings.length ? undefined : '暂无默认持仓数据' }
          send({ type: 'module', stage: 'portfolio', status: modules.portfolio.status, result: portfolio, error: modules.portfolio.error })
          await persistReport()
        }
        if (stages.includes('overview')) {
          const [qualityStep, evidenceStep, aiStep] = moduleSteps('overview')
          const structure = buildStructureSummary(company, news)
          const quality = await runStep(qualityStep, () => assessReportQuality(market, news, company, portfolio, modules, industryName), '数据质量评估完成') as ReturnType<typeof assessReportQuality>
          const evidence = await runStep(evidenceStep, () => buildEvidence(market, news, company, quality), '分析证据链汇总完成') as ReturnType<typeof buildEvidence>
          advice = buildRuleBasedAdvice(industryName, market, news, company, portfolio, quality, riskTolerance, investmentHorizon)
          advice.evidence = evidence
          if (aiEnabled('overview')) await runStep(aiStep, async () => {
            try {
              const raw = await aiClient.complete({
                system: '你是严谨的中文投研助手，只返回 JSON，不得补造输入中不存在的事实。',
                prompt: JSON.stringify({ industryName, riskTolerance, investmentHorizon, market, news, company, portfolio, quality, ruleAdvice: advice }),
                maxTokens: 2600,
              })
              const candidate = normalizeAdvice(parseJsonObject(raw) || {}, industryName)
              if (candidate.summary && candidate.strategy) advice = { ...advice, ...candidate, evidence, investmentConclusion: composeInvestmentConclusion(candidate.summary, candidate.strategy), generatedBy: 'hybrid' }
            } catch (error) {
              throw new Error(`AI 总览生成失败：${error instanceof Error ? error.message : '未知错误'}`)
            }
          })
          else { send({ type: 'step', stepId: aiStep, status: 'skipped' }); await pause() }
          const reportData: DailyActionReportData = {
            schemaVersion: '2.0',
            snapshot: { runId: randomUUID(), asOf: startedAt, timezone: 'Asia/Shanghai', periodDays, industryId, industryName, modules, preferences: { riskTolerance, investmentHorizon }, companySource, marketToCompany: { selectedEtfCodes: market.etfCandidates.concat(market.etfs).map((item) => String(item.code || item.symbol || '')).filter(Boolean), companySource } },
            quality, market, news, company, portfolio, structure, advice, evidence,
          }
          const report = await persistReport(reportData)
          send({ type: 'module', stage: 'overview', status: 'success', result: { advice, quality, evidence }, report: { id: report.id, title: report.title, createdAt: report.createdAt.toISOString() } })
        }
        send({ type: 'complete' })
      } catch (error) {
        send({ type: 'pipeline_error', stage: stages.find((stage) => !modules[stage]) || 'overview', stepId: currentStepId, error: error instanceof Error ? error.message : '分析链路失败' })
      } finally { controller.close() }
    },
  })
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' } })
}
