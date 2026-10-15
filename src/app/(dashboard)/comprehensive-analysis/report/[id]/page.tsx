"use client";

import { DomainResearchView } from "@/components/analysis/DomainResearchView";
import type { DomainResearch } from "@/lib/workflow/domain-research";
import { UnifiedAllocationView } from "@/components/analysis/UnifiedAllocationView";
import type { UnifiedAllocation } from "@/lib/research/strategy/kernel";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  BookOpenCheck,
  BriefcaseBusiness,
  CircleGauge,
  DatabaseZap,
  Loader2,
  Megaphone,
  Printer,
  WalletCards,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ReportAnalysisView } from "@/components/analysis/ReportAnalysisView";
import {
  MarketResearchView,
  parseAnalysis,
} from "@/components/analysis/MarketResearchView";
import { ReportEvidenceView } from "@/components/analysis/ReportEvidenceView";
import { actionAvailability } from "@/lib/analysis/action-availability";
import { DailyExecutionPanel } from "@/components/analysis/DailyExecutionPanel";
import { PortfolioDecisionPanel } from "@/components/analysis/PortfolioDecisionPanel";
import { SocialReportView } from "@/components/analysis/SocialReportView";
import { ComprehensiveConclusionView } from "@/components/analysis/ComprehensiveConclusionView";
import type { Evaluation } from "@/lib/research/contracts";
import { chineseNarrative, chineseSource } from "@/lib/analysis/chinese-labels";
import {
  decisionConfidence,
  guardActionLanguage,
  productGroups,
  reportCoverage,
  reportReadiness,
  safeDecisionAction,
} from "@/lib/analysis/report-insights";
import {
  normalizeSocialReport,
  type SocialReport,
} from "@/lib/analysis/social-report";
import {
  applyDecisionTimingGate,
  type PortfolioDecisionSupport,
} from "@/lib/portfolio/decision-support";
import {
  buildReportQuality,
  type ReportQualityAssessment,
} from "@/lib/analysis/report-quality";
import {
  effectiveDecisionTiming,
  type DecisionTimingAssessment,
} from "@/lib/analysis/decision-timing";
import { cleanClaim } from "@/lib/analysis/evidence-references";
import { normalizeAIProductDecisions } from "@/lib/analysis/investment-conclusion";

type Report = {
  id: string;
  type: string;
  industryId: string;
  industryName: string;
  title: string;
  summary: string;
  content: string;
  dataJson?: string;
  createdAt: string;
};
type Structured = {
  domainResearch?: DomainResearch;
  domainValidation?: {matured:number;pending:number;excluded:number;basis:string};
  unifiedAllocation?:UnifiedAllocation;
  integrityWarnings?: string[];
  dataRemediationPlan?:Array<{condition:string;label:string;tickers:string[];priority:string}>;
  performance?: {wallMs:number;activeMs:number;idleMs:number;failedAttempts:number;failedRequests?:number};
  inputCoverage?:Record<string,{requirementCoveragePct?:number;candidateCoveragePct?:number}>;
  socialReport?: SocialReport;
  researchEvaluation?: Evaluation;
  researchPreflight?: {
    status?: string;
    queued?: number;
    completed?: number;
    partial?: number;
    failed?: number;
    warnings?: string[];
    publicationNotes?: string[];
  };
  dataQuality?: { status?: string };
  reportQuality?: ReportQualityAssessment;
  strategyValidation?: {status?:string;validation?:string;reason?:string;snapshots?:number;trades?:number;observations?:number;limitations?:string[];policyComparison?:{reports:number;executableAIProducts:number;excludedAIProducts:number;basis:string;rules:Array<{ticker:string;trades:number;performanceUsable:boolean;returnPct:number|null;buyAndHoldReturnPct:unknown}>;ai:Array<{ticker:string;trades:number;performanceUsable:boolean;returnPct:number|null}>};forecastCalibration?:{status:string;horizonTradingDays:number;minimumOutcomes:number;maturedOutcomes:number;pendingOutcomes:number;brierScore:number|null;hitRatePct:number|null};results?:Array<{ticker:string;status:string;performanceUsable?:boolean;returnPct:number|null;excessReturnPct?:number|null;maxDrawdownPct:number|null;sharpeRatio?:number|null;informationRatio?:number|null}>};
  decisionTiming?: DecisionTimingAssessment;
  inheritedFromReportId?: string | null;
  historicalReportContext?: Array<{
    reportId: string;
    title: string;
    sessionDate: string;
    createdAt: string;
    comprehensiveConclusion?: unknown;
  }>;
  marketAnalysis?: unknown;
  industryAnalysis?: unknown;
  companyAnalysis?: unknown;
  sentimentAnalysis?: unknown;
  investmentAdvice?: unknown;
  analysisStatuses?: Record<string, { status?: string; reason?: string } | null>;
  privatePortfolioAnalysis?: unknown;
  portfolioDecisionSupport?: PortfolioDecisionSupport;
  metadata?: { runId?: string; kind?: string };
};
const stateLabels: Record<string, string> = {
  blocked: "证据受限",
  watch: "持续观察",
  eligible: "满足条件",
  "risk-off": "风险收缩",
};
const statusLabels: Record<string, string> = {
  met: "满足",
  unmet: "未满足",
  unknown: "未知",
};
const availabilityLabels: Record<string, string> = {
  failed: "最近请求失败",
  missing: "数据缺失",
  stale: "日期落后",
  "pending-publication": "待发布",
  "not-applicable": "口径不适用",
};
function safeJson(value?: string): Structured {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}
function date(value?: string | null) {
  return value
    ? new Date(value).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "未标注";
}
function title(text: string) {
  return <h2 className="text-xl font-semibold tracking-tight">{text}</h2>;
}

const reportPages = [
  {
    id: "summary",
    label: "综合结论",
    description: "AI综合研判与配置立场",
    icon: CircleGauge,
  },
  {
    id: "analysis",
    label: "研究分析",
    description: "模块结论与相关数据依据",
    icon: BookOpenCheck,
  },
  {
    id: "decisions",
    label: "投资决策",
    description: "AI逐产品决策与程序约束",
    icon: BriefcaseBusiness,
  },
  {
    id: "portfolio",
    label: "组合调整",
    description: "真实持仓与调整路径",
    icon: WalletCards,
    requiresPortfolio: true,
  },
  {
    id: "readiness",
    label: "数据附录",
    description: "口径、质量、来源与版本",
    icon: DatabaseZap,
  },
  {
    id: "publish",
    label: "发布概览",
    description: "对外图文与长图预览",
    icon: Megaphone,
  },
] as const;
type ReportPageId = (typeof reportPages)[number]["id"];

export default function ComprehensiveReportPage() {
  const params = useParams(),
    router = useRouter(),
    searchParams = useSearchParams(),
    reportId = String(params.id || "");
  const [report, setReport] = useState<Report | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [clock, setClock] = useState(() => new Date().toISOString());
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/analysis/reports/${reportId}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "报告读取失败");
        setReport(data);
        setError("");
      })
      .catch((reason) => {
        if (reason.name !== "AbortError")
          setError(String(reason.message || reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reportId]);
  useEffect(() => {
    const timer = window.setInterval(
      () => setClock(new Date().toISOString()),
      30000,
    );
    return () => window.clearInterval(timer);
  }, []);
  const structured = useMemo(
      () => safeJson(report?.dataJson),
      [report?.dataJson],
    ),
    evaluation = structured.researchEvaluation;
  if (loading || (report && report.id !== reportId))
    return (
      <div className="flex min-h-80 items-center justify-center gap-3">
        <Loader2 className="size-5 animate-spin" />
        正在读取报告…
      </div>
    );
  if (error || !report)
    return (
      <div className="p-8">
        {error || "报告不存在"}
        <Button onClick={() => router.push("/comprehensive-analysis")}>
          返回
        </Button>
      </div>
    );
  const timing = effectiveDecisionTiming(structured.decisionTiming, clock, {
    asOf: evaluation?.asOf || report.createdAt,
    closeDataSession: evaluation?.expectedSession,
  });
  const readiness = reportReadiness(evaluation, structured.dataQuality, timing),
    coverage = reportCoverage(evaluation),
    groups = productGroups(evaluation);
  const storedQuality = structured.reportQuality || (evaluation
    ? buildReportQuality({
        evaluation,
        dataQuality: structured.dataQuality,
        preflight: structured.researchPreflight,
        decisionTiming: timing,
        analysisStatuses: structured.analysisStatuses,
      })
    : undefined);
  const quality = storedQuality && !timing.executionReady ? {...storedQuality,executionReadinessScore:0,usability:'limited-advice' as const,blockers:[...new Set([...storedQuality.blockers,...timing.reasons])]} : storedQuality;
  const decisions = evaluation?.decisions || [],
    sources = evaluation?.evidence || [];
  const baseUrl = `/api/research/${report.industryId}?snapshot=${evaluation?.snapshotId || ""}`;
  const advice = parseAnalysis(
      guardActionLanguage(structured.investmentAdvice, timing.executionReady),
    ),
    industry = parseAnalysis(structured.industryAnalysis);
  const aiProductDecisions = normalizeAIProductDecisions(
    advice.productDecisions,
    decisions.map((item) => item.ticker),
  );
  const aiDecisionByTicker = new Map(
    aiProductDecisions.map((item) => [item.ticker, item]),
  );
  const summary = cleanClaim(
    String((structured.domainResearch?.status === "completed" ? structured.domainResearch.opinion?.conclusion : null) || parseAnalysis(advice.executiveSummary).conclusion || advice.thesis || industry.analysis || report.summary || ""),
  );
  const investmentFallback = structured.analysisStatuses?.investment?.status === "fallback" || JSON.stringify(advice).includes("智能投资建议请求超时");
  const portfolio = applyDecisionTimingGate(
    structured.portfolioDecisionSupport,
    timing,
  );
  const preflight = structured.researchPreflight;
  const preflightWarnings = preflight?.warnings || [],
    publicationNotes = preflight?.publicationNotes || [];
  const unknowns = decisions.flatMap((decision) =>
    decision.conditions
      .filter((condition) => condition.status === "unknown")
      .map((condition) => ({
        ticker: decision.ticker,
        name: decision.name,
        ...condition,
      })),
  );
  const dataGroups = [...new Set(unknowns.map((item) => item.key))].map(
    (key) => ({ key, items: unknowns.filter((item) => item.key === key) }),
  );
  const sections = [
    ["event-analysis", "产业事件分析", structured.sentimentAnalysis],
    ["company-analysis", "企业景气分析", structured.companyAnalysis],
    ["industry-analysis", "综合判断与情景", structured.industryAnalysis],
  ] as const;
  const visiblePages = reportPages.filter(
    (page) => !("requiresPortfolio" in page) || Boolean(portfolio),
  );
  const requestedPage = searchParams.get("page");
  const normalizedRequestedPage = requestedPage === "products" ? "decisions" : requestedPage === "evidence" ? "readiness" : requestedPage;
  const activePage = visiblePages.some((page) => page.id === normalizedRequestedPage)
    ? normalizedRequestedPage as ReportPageId
    : "summary";
  return (
    <div
      className="mx-auto w-full max-w-7xl space-y-8 px-4 py-6 sm:px-6 [overflow-wrap:anywhere]"
    >
      <header className="space-y-4">
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button
            variant="ghost"
            onClick={() => router.push("/comprehensive-analysis")}
          >
            <ArrowLeft className="mr-2 size-4" />
            返回综合分析
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="mr-2 size-4" />
            打印或保存
          </Button>
          <Button
            variant="outline"
            onClick={() => router.push(`/publish?reportId=${report.id}`)}
          >
            制作发布图文
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{timing.label}</Badge>
          <Badge variant="outline">决策证据覆盖度 {readiness.confidencePct}/100</Badge>
          <Badge variant="outline">{quality?.grade || "—"}级数据质量</Badge>
        </div>
        <h1 className="text-2xl font-semibold sm:text-3xl">
          {chineseNarrative(report.title)}
        </h1>
        <p className="text-xs leading-6 text-muted-foreground">
          生成 {date(report.createdAt)} · 证据冻结 {date(evaluation?.asOf)} ·
          {timing.phase === "trading" ? "盘中数据日" : "收盘基准"} {evaluation?.expectedSession || "未核验"} ·{" "}
          {decisions.length}只产品 / {coverage.indexCount}个指数
        </p>
      </header>
      <section aria-label="报告使用边界" className="space-y-3 rounded-2xl border bg-card p-4 sm:p-5">
        {structured.integrityWarnings?.map(warning=><p key={warning} role="alert" className="rounded-lg border border-destructive p-3 text-sm leading-6">{warning}。</p>)}
        <p className="font-medium">{timing.executionReady ? "研究时效通过，操作仍需逐产品核验" : "当前仅供研究参考，操作前请重新复核"}</p>
        <p className="text-sm leading-6 text-muted-foreground">执行条件待复核 {aiProductDecisions.filter(item=>item.executionContract?.status!=="verified").length}/{aiProductDecisions.length} 只 · {timing.validUntil?`有效至 ${date(timing.validUntil)}`:"有效期未记录，需重新分析"}</p>
        {(quality?.blockers?.length || 0)>0 && <details className="text-sm"><summary className="min-h-11 cursor-pointer py-2 focus-visible:outline-2 focus-visible:outline-ring">查看研究限制（{quality?.blockers.length}项）</summary><ul className="list-disc space-y-1 pl-5 leading-6">{quality?.blockers.map(item=><li key={item}>{chineseNarrative(item)}</li>)}</ul></details>}
        {structured.performance && <p className="text-sm text-muted-foreground">生成用时 {(structured.performance.wallMs/60000).toFixed(1)} 分钟 · 实际处理 {(structured.performance.activeMs/60000).toFixed(1)} 分钟 · 等待 {(structured.performance.idleMs/60000).toFixed(1)} 分钟 · {structured.performance.failedRequests===undefined?`失败步骤 ${structured.performance.failedAttempts} 次`:`失败请求 ${structured.performance.failedRequests} 次`}</p>}
        {Object.values(structured.inputCoverage||{}).some(item=>item.candidateCoveragePct!==undefined) && <details className="text-sm"><summary className="min-h-11 cursor-pointer py-2 focus-visible:outline-2 focus-visible:outline-ring">证据筛选覆盖</summary><div className="space-y-1 leading-6">{Object.entries(structured.inputCoverage||{}).filter(([,item])=>item.candidateCoveragePct!==undefined).map(([name,item])=><p key={name}>{name==="news-analysis"?"资讯分析":"综合建议"}：候选事件展开 {item.candidateCoveragePct}% · 最低输入要求达标 {item.requirementCoveragePct}%</p>)}<p className="text-muted-foreground">达标率不代表模型阅读了全部候选资料。</p></div></details>}
      </section>
      <Link className="inline-flex min-h-11 items-center rounded-xl border bg-card px-4 py-3 font-medium text-primary" href={`/comprehensive-analysis?industryId=${encodeURIComponent(report.industryId)}&tab=daily`}>打开最新每日执行清单 · 与归档报告时点分开</Link>
      <div className="grid items-start gap-6 print:grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav
          aria-label="报告子页面"
          className="grid grid-cols-2 gap-2 rounded-2xl border bg-card p-2 shadow-sm print:hidden sm:grid-cols-4 lg:sticky lg:top-6 lg:z-10 lg:max-h-[calc(100dvh-7rem)] lg:grid-cols-1 lg:overflow-y-auto lg:overscroll-contain"
        >
          {visiblePages.map((page) => {
            const Icon = page.icon,
              active = page.id === activePage;
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={`group flex min-h-14 items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                key={page.id}
                href={`/comprehensive-analysis/report/${report.id}?page=${page.id}`}
              >
                <Icon aria-hidden className="size-4 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    {page.label}
                  </span>
                  <span
                    className={`hidden truncate text-[11px] leading-5 lg:block ${active ? "text-primary-foreground/75" : "text-muted-foreground"}`}
                  >
                    {page.description}
                  </span>
                </span>
              </Link>
            );
          })}
        </nav>
        <div className="min-w-0 space-y-6" key={activePage}>
          {activePage === "summary" && <DomainResearchView validation={structured.domainValidation} research={structured.domainResearch} baselineConclusion={String(parseAnalysis(advice.executiveSummary).conclusion || "")} />}
          {activePage === "summary" && (
            <section
              id="summary"
              className="scroll-mt-20 rounded-2xl border bg-card p-5 sm:p-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                {title(structured.domainResearch?.status === "completed" ? "原分步流程基线" : "综合投资结论")}
                <Badge variant={investmentFallback ? "outline" : "default"}>{investmentFallback ? "超时降级汇编" : "AI 综合研判"}</Badge>
              </div>
              {investmentFallback && <p className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/[0.05] px-3 py-2 text-xs leading-5 text-amber-800 dark:text-amber-200">综合模型请求未在时限内完成；本结论由已完成的市场、事件、企业、行业总览和冻结规则结构化汇编，不新增模型推断。</p>}
              <ComprehensiveConclusionView
                advice={advice}
                executionAvailable={aiProductDecisions.length>0&&aiProductDecisions.every(item=>actionAvailability(item,timing.executionReady).available)}
                fallbackSummary={summary}
                industryOutlook={industry.outlook}
                decisionSummary={!aiProductDecisions.some(item=>actionAvailability(item,timing.executionReady).available)?"归档原观点当前无有效执行动作，请查看每日执行清单。":`${aiProductDecisions.filter((item) => item.heldAction === "减仓").length}只AI建议减仓，${aiProductDecisions.filter((item) => item.unheldAction === "建仓" || item.heldAction === "加仓").length}只AI建议增加暴露。`}
              />
              <UnifiedAllocationView allocation={structured.unifiedAllocation}/>
              {structured.inheritedFromReportId && (
                <p className="mt-4 text-xs text-amber-700">
                  本轮为规则复核，研究正文继承自{" "}
                  <Link
                    className="underline"
                    href={`/comprehensive-analysis/report/${structured.inheritedFromReportId}`}
                  >
                    母报告
                  </Link>
                  ；未重新调用模型。
                </p>
              )}
              {evaluation?.baselineReport &&
                evaluation.changes.some(
                  (change) => change.from !== change.to,
                ) && (
                  <p className="mt-4 text-sm text-primary">
                    相对 {date(evaluation.baselineReport.createdAt)} 的报告，
                    {
                      evaluation.changes.filter(
                        (change) => change.from !== change.to,
                      ).length
                    }
                    只产品规则状态改变。详见数据附录中的版本记录。
                  </p>
                )}
            </section>
          )}
          {activePage === "analysis" && (
            <section id="analysis" className="scroll-mt-20 space-y-5">
              {title("研究分析与依据")}
              <article
                id="market-analysis"
                className="rounded-2xl border bg-card p-5 sm:p-6"
              >
                <h3 className="mb-4 text-lg font-semibold">市场与资金分析</h3>
                <MarketResearchView
                  value={structured.marketAnalysis}
                  evaluation={evaluation}
                  baseUrl={baseUrl}
                />
              </article>
              {sections
                .filter(([, , value]) => value)
                .map(([id, label, value]) => {
                  const row = parseAnalysis(
                    guardActionLanguage(value, timing.executionReady),
                  );
                  return (
                    <article
                      id={id}
                      key={id}
                      className="rounded-2xl border bg-card p-5 sm:p-6"
                    >
                      <h3 className="mb-4 text-lg font-semibold">{label}</h3>
                      <ReportAnalysisView
                        value={Object.fromEntries(
                          Object.entries(row).filter(
                            ([key]) => key !== "watchlist",
                          ),
                        )}
                        sources={sources}
                        evidenceBaseUrl={baseUrl}
                      />
                    </article>
                  );
                })}
              <div className="rounded-2xl border bg-muted/10 p-5 sm:p-6"><ReportEvidenceView evaluation={evaluation} baseUrl={baseUrl} mode="related" /></div>
            </section>
          )}
          {activePage === "decisions" && (
            <section id="decisions" className="scroll-mt-20 space-y-4">
              {title("AI逐产品投资决策")}
              <p className="text-sm text-muted-foreground">
                投资方向由AI综合市场、企业、新闻、估值与反证生成；量化状态仅作为证据。实际持仓金额还会受到产品范围、数据时效、现金底仓、仓位上限、费用和每日最大调整比例约束。
              </p>
              <div className="grid gap-3 lg:grid-cols-2">
                {decisions.map((decision) => {
                  const aiDecision = aiDecisionByTicker.get(decision.ticker);
                  const legacyAction = safeDecisionAction(
                    decision,
                    timing.executionReady && readiness.level === "advice-ready",
                  );
                  const action = aiDecision
                    ? { ...actionAvailability(aiDecision,timing.executionReady), intent: aiDecision.reason, confidencePct: aiDecision.confidencePct }
                    : legacyAction;
                  return (
                    <details
                      key={decision.ticker}
                      className="rounded-xl border bg-card"
                    >
                      <summary className="cursor-pointer p-4">
                        <span className="font-medium">
                          {chineseNarrative(decision.name)}
                        </span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {decision.ticker} · 量化证据 {stateLabels[decision.state]}
                        </span>
                        <span className="mt-2 block text-sm">
                          未持有：{action.unheld} · 已持有：{action.held}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {aiDecision ? `AI置信度 ${aiDecision.confidencePct.toFixed(0)}/100 · 建议单日调整 ${aiDecision.suggestedAdjustmentPct.toFixed(1)}个百分点` : `历史规则动作 · 产品证据覆盖度 ${decisionConfidence(decision)}/100`} ·
                          指数 {decision.indexCode || "待映射"}
                        </span>
                      </summary>
                      <div className="space-y-3 border-t p-4">
                        <p className="text-sm leading-6">
                          {chineseNarrative(action.intent)}
                        </p>
                        {aiDecision && <p className="rounded-lg border border-primary/15 bg-primary/[0.035] px-3 py-2 text-xs leading-5"><span className="font-medium">AI决策</span> · 触发：{chineseNarrative(aiDecision.trigger)}<br/><span className="text-muted-foreground">失效：{chineseNarrative(aiDecision.invalidation)}</span></p>}
                        <p className="text-xs leading-5 text-muted-foreground">
                          相对基准{" "}
                          {decision.metrics.relative20Pct?.toFixed(2) ?? "未知"}{" "}
                          个百分点 · 20日平均成交额{" "}
                          {decision.metrics.amount20 == null
                            ? "未知"
                            : (decision.metrics.amount20 / 1e8).toFixed(2) +
                              "亿元"}
                        </p>
                        <p className="text-xs leading-5 text-muted-foreground">多因子诊断 {decision.metrics.factorRegime||"未知"} · 得分 {decision.metrics.factorScore??"未知"} · 60日收益 {decision.metrics.return60Pct?.toFixed(2)??"未知"}% · 120日最大回撤 {decision.metrics.maxDrawdown120Pct?.toFixed(2)??"未知"}%（描述性指标，未直接驱动动作）</p>
                        <dl className="space-y-2">
                          {decision.conditions.map((condition) => (
                            <div
                              key={condition.key}
                              className="flex flex-wrap justify-between gap-2 border-b pb-2 text-xs"
                            >
                              <dt>{condition.label}</dt>
                              <dd>
                                {condition.value ?? "未知"} ·{" "}
                                {statusLabels[condition.status]}
                              </dd>
                              {condition.detail && (
                                <dd className="w-full text-muted-foreground">
                                  {condition.detail}
                                </dd>
                              )}
                            </div>
                          ))}
                        </dl>
                      </div>
                    </details>
                  );
                })}
              </div>
              <details className="rounded-xl border bg-card p-5">
                <summary className="cursor-pointer font-medium">
                  AI综合观点与逐产品说明
                </summary>
                <p className="mt-3 text-xs text-muted-foreground">
                  AI观点决定投资方向；程序仅计算并裁剪超出本地风险预算的目标范围和金额。旧报告没有AI逐产品决策时，仍按归档规则动作展示。
                </p>
                <div className="mt-4">
                  <ReportAnalysisView
                    value={Object.fromEntries(
                      Object.entries(advice).filter(
                        ([key]) =>
                          ![
                            "thesis",
                            "tacticalView",
                            "strategicView",
                            "watchlist",
                            "scenarios",
                            "productSelection",
                            "ruleAssessment",
                            "productDecisions",
                          ].includes(key),
                      ),
                    )}
                    sources={sources}
                    evidenceBaseUrl={baseUrl}
                  />
                </div>
              </details>
            </section>
          )}
          {activePage === "decisions" && (
            <section id="products" className="scroll-mt-20 space-y-4">
              {title("产品选择：同指数比较与估值")}
              <p className="text-sm text-muted-foreground">
                这一比较结果已经进入上方模型投资观点，并用于个人组合加仓时的候选筛选。先比较同一指数的产品成本与流动性，再检查建仓条件；选出更合适的产品不等于已经满足建仓条件。费率为年管理费，不含托管费和交易费用。
              </p>
              {groups.map((group) => {
                const frozen = evaluation?.productComparisons?.find(
                    (item) => item.indexCode === group.indexCode,
                  ),
                  candidate = frozen
                    ? frozen.candidate
                    : group.comparisonCandidate;
                return (
                  <article
                    key={group.indexCode}
                    className="overflow-hidden rounded-xl border bg-card"
                  >
                    <div className="border-b bg-muted/25 p-4">
                      <h3 className="font-medium">
                        {group.indexCode} · {group.products.length}只产品
                      </h3>
                      <p className="mt-2 text-sm">
                        {candidate
                          ? `研究比较候选：${candidate}`
                          : group.status === "single-product"
                            ? "无同指数对照产品"
                            : "可比数据不足，暂不选优"}
                        {!frozen && "（按归档数据重算，未参与原报告决策）"}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {frozen?.reason || group.reason}
                      </p>
                      <p className="mt-2 text-xs">
                        当期市盈率 {group.valuation.pe?.toFixed(2) ?? "缺失"} ·
                        市净率 {group.valuation.pb?.toFixed(2) ?? "缺失"} ·{" "}
                        {group.valuation.date || "日期未标注"} ·{" "}
                        {chineseSource(group.valuation.source || "来源未标注")}
                      </p>
                      {(group.valuation.pePercentileHistory!=null||group.valuation.pbPercentileHistory!=null)&&<p className="mt-1 text-xs text-muted-foreground">可用历史样本分位：市盈率 {group.valuation.pePercentileHistory?.toFixed(1)??"缺失"}% · 市净率 {group.valuation.pbPercentileHistory?.toFixed(1)??"缺失"}% · {group.valuation.historyStart||"起点未知"}起 {group.valuation.sampleCount} 期；不等同五年分位</p>}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[680px] text-left text-sm">
                        <thead className="text-xs text-muted-foreground">
                          <tr>
                            {[
                              "产品",
                              "年管理费",
                              "单位净值 / 日期",
                              "年化跟踪误差",
                              "20日平均成交额",
                            ].map((label) => (
                              <th key={label} className="p-3 font-medium">
                                {label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {group.products.map((product) => (
                            <tr key={product.ticker} className="border-t">
                              <td className="p-3">
                                {chineseNarrative(
                                  product.decision?.name || product.ticker,
                                )}
                                <span className="block text-xs text-muted-foreground">
                                  {product.ticker}
                                </span>
                                {product.exclusions.length > 0 && (
                                  <span className="block max-w-64 text-xs text-amber-700">
                                    {product.exclusions.join("；")}
                                  </span>
                                )}
                              </td>
                              <td className="p-3">
                                {product.feePct == null
                                  ? "未知"
                                  : product.feePct + "%"}
                              </td>
                              <td className="p-3">
                                {product.nav?.toFixed(4) ?? "旧报告未保存数值"}
                                <span className="block text-xs text-muted-foreground">
                                  {product.navDate || "日期缺失"}
                                </span>
                              </td>
                              <td className="p-3">
                                {product.trackingAnomaly
                                  ? "异常，不参与比较"
                                  : product.trackingErrorPct == null
                                    ? "未知"
                                    : product.trackingErrorPct.toFixed(2) + "%"}
                              </td>
                              <td className="p-3">
                                {product.decision?.metrics.amount20 == null
                                  ? "未知"
                                  : (
                                      product.decision.metrics.amount20 / 1e8
                                    ).toFixed(2) + "亿元"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </article>
                );
              })}
              {!!evaluation?.indexOverlaps?.length&&<div className="rounded-xl border bg-card p-4"><h3 className="font-medium">跨指数持仓重叠</h3><p className="mt-1 text-xs text-muted-foreground">用于识别重复暴露；按最新披露前十大持仓估算，不代表完整指数或实时权重。</p><div className="mt-3 grid gap-2 md:grid-cols-2">{evaluation.indexOverlaps.filter(item=>(item.weightedOverlapPct||0)>0).sort((a,b)=>(b.weightedOverlapPct||0)-(a.weightedOverlapPct||0)).slice(0,8).map(item=><div key={`${item.leftIndexCode}-${item.rightIndexCode}`} className="rounded-lg border p-3 text-xs"><span className="font-medium">{item.leftIndexCode} ↔ {item.rightIndexCode}</span><span className="float-right">重叠 {item.weightedOverlapPct?.toFixed(1)??"未知"}%</span><p className="mt-1 text-muted-foreground">共同持仓 {item.commonHoldings} 家 · 披露期 {item.periods.join("、")||"未知"}</p></div>)}</div></div>}
            </section>
          )}
          {activePage === "portfolio" && portfolio && (
            <PortfolioDecisionPanel
              support={portfolio}
              analysis={structured.privatePortfolioAnalysis}
              executionReady={
                timing.executionReady && readiness.level === "advice-ready"
              }
            />
          )}
          {activePage === "readiness" && (
            <section id="readiness" className="scroll-mt-20 space-y-4">
<DailyExecutionPanel industryId={report.industryId} archivedContext />
              {title("数据、质量与复盘附录")}
              <p className="text-sm leading-6 text-muted-foreground">这里集中保留数据健康度、字段限制、完整来源目录和版本链，供核对与复盘；用于形成结论的模块数据已放回对应研究页面。</p>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border p-4">
                  <h3 className="font-medium">数据完整性</h3>
                  <p className="mt-2 text-xl">
                    {coverage.dataTotal - coverage.dataUnknown}/
                    {coverage.dataTotal}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    底层字段可计算；{coverage.dataUnknown}项未知，不填零
                  </p>
                </div>
                <div className="rounded-xl border p-4">
                  <h3 className="font-medium">
                    {coverage.signalUnmet
                      ? "市场信号存在弱项"
                      : coverage.signalUnknown
                        ? "市场信号待核验"
                        : "市场信号满足条件"}
                  </h3>
                  <p className="mt-2 text-sm">
                    满足 {coverage.signalMet} · 未满足 {coverage.signalUnmet} ·
                    未知 {coverage.signalUnknown}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    未知不表示利空；已知未满足不属于采集失败
                  </p>
                </div>
                <div className="rounded-xl border p-4">
                  <h3 className="font-medium">{timing.label}</h3>
                  <p className="mt-2 text-xs leading-6 text-muted-foreground">
                    {timing.executionReady
                      ? timing.phase === "trading"
                        ? "使用底层订阅提供的实时行情快照。"
                        : `使用底层订阅提供的最新交易日收盘数据${timing.closeDataSession ? `（${timing.closeDataSession}）` : ""}。`
                      : timing.reasons.join("；") || "本轮仅供研究参考。"}
                    分析流程与建议等级不因生成时点变化。
                  </p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {coverage.data.map((item) => (
                  <div key={item.key} className="rounded-xl border p-4">
                    <h3 className="text-sm font-medium">
                      {item.label}{" "}
                      <span className="float-right">
                        {item.known}/{item.total}
                      </span>
                    </h3>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {item.key === "premium" && item.known < item.total
                        ? `最近完整收盘日 ${timing.closeDataSession || evaluation?.expectedSession}；盘中实时价格不能与尚未发布的当日净值配对。历史净值见产品比较。`
                        : item.detail}
                    </p>
                  </div>
                ))}
              </div>
              <details className="rounded-xl border p-4">
                <summary className="cursor-pointer text-sm font-medium">
                  字段限制与补齐原因（{unknowns.length}项）
                </summary>
                <div className="mt-3 space-y-3">
                  {dataGroups.map((group) => (
                    <div key={group.key}>
                      <h3 className="text-sm font-medium">
                        {group.items[0].label} · {group.items.length}只产品
                      </h3>
                      {group.items.map((item) => (
                        <p
                          key={item.ticker}
                          className="mt-1 text-xs leading-6 text-muted-foreground"
                        >
                          {item.ticker} ·{" "}
                          {availabilityLabels[item.availability || "missing"]}：
                          {item.detail ||
                            "旧快照未保存字段级原因，下一轮分析将重新核验"}
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
              </details>
              {preflight && (
                <div className="rounded-xl border p-4">
                  <h3 className="text-sm font-medium">
                    分析前同步：
                    {preflight.status === "fresh"
                      ? publicationNotes.length
                        ? "可发布数据已同步，部分字段待发布"
                        : "任务已完成"
                      : preflight.status === "blocked"
                        ? "同步受阻"
                        : "存在待发布或受限字段"}
                  </h3>
                  <p className="mt-2 text-xs leading-6 text-muted-foreground">
                    排队 {preflight.queued || 0} 项 · 完整返回{" "}
                    {preflight.completed || 0} 项 · 部分返回{" "}
                    {preflight.partial || 0} 项 · 请求失败{" "}
                    {preflight.failed || 0} 项。任务状态不等于全部字段的可用性。
                  </p>
                  {publicationNotes.map((note) => (
                    <p
                      className="mt-2 text-xs leading-6 text-muted-foreground"
                      key={note}
                    >
                      {note}
                    </p>
                  ))}
                  {preflightWarnings.some(
                    (item) =>
                      item.includes("shares") ||
                      item.includes("etf_share_size"),
                  ) && (
                    <p className="mt-2 text-sm leading-6">
                      ETF份额通常次日约08:30分批更新；当天盘后缺少当天份额可能尚未发布。请求异常另行保留，不将待发布计为市场利空。
                    </p>
                  )}
                  {preflightWarnings.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-primary">
                        查看同步诊断
                      </summary>
                      {preflightWarnings.map((warning, index) => (
                        <p className="mt-1 text-xs leading-6" key={index}>
                          {warning}
                        </p>
                      ))}
                    </details>
                  )}
                </div>
              )}
              {quality && (
                <details className="rounded-xl border p-4">
                  <summary className="cursor-pointer text-sm font-medium">
                    报告等级：{quality.overallScore}分 · {quality.grade}级 · {quality.usability==='advice-grade'?'建议级':quality.usability==='limited-advice'?'有限建议':'证据不足'}
                  </summary>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <div className="rounded-lg bg-muted/40 p-3 text-sm">证据置信度 <span className="float-right font-medium">{quality.evidenceConfidenceScore??quality.overallScore}</span></div>
                    <div className="rounded-lg bg-muted/40 p-3 text-sm">决策置信度 <span className="float-right font-medium">{quality.decisionConfidenceScore??quality.confidenceScore}</span></div>
                    <div className="rounded-lg bg-muted/40 p-3 text-sm">数据准备度 <span className="float-right font-medium">{quality.dataReadinessScore??"未审计"}</span></div>
                    <div className="rounded-lg bg-muted/40 p-3 text-sm">执行合同与组合就绪度 <span className="float-right font-medium">{quality.executionReadinessScore??0}</span></div>
                    {quality.executionAudit && <p className="text-xs text-muted-foreground">合同通过 {quality.executionAudit.verifiedProducts}/{quality.executionAudit.products}；可交易产品 {quality.executionAudit.tradableProducts}；组合可执行项 {quality.executionAudit.executablePortfolioActions}/{quality.executionAudit.portfolioActions}。持有、观望不代表交易许可，分数不代表收益概率。</p>}
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {quality.dimensions.map((item) => (
                      <div key={item.key} className="text-sm">
                        {item.label} {item.score}分
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.detail}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>
              )}
              {!!structured.dataRemediationPlan?.length && <details className="rounded-xl border p-4"><summary className="min-h-11 cursor-pointer py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">待补齐的数据（{structured.dataRemediationPlan.length}类）</summary><p className="mt-2 text-sm text-muted-foreground">这些是研究证据缺口，不代表市场走弱。数据更新后需新建分析。</p><ul className="mt-3 space-y-2 text-sm leading-6">{structured.dataRemediationPlan.map(item=><li key={item.condition}>{item.priority==='critical'?'优先补齐':'补充研究'} · {item.label} · {item.tickers.join('、')}</li>)}</ul></details>}
              {structured.strategyValidation?.policyComparison && <details className="rounded-xl border p-4"><summary className="min-h-11 cursor-pointer py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">规则、AI与持有基线对照</summary><p className="mt-2 text-sm leading-6">{structured.strategyValidation.policyComparison.basis}</p><p className="mt-2 text-sm text-muted-foreground">报告 {structured.strategyValidation.policyComparison.reports} 份 · 可核验AI产品决策 {structured.strategyValidation.policyComparison.executableAIProducts} 项 · 排除 {structured.strategyValidation.policyComparison.excludedAIProducts} 项</p><div className="mt-3 space-y-2">{structured.strategyValidation.policyComparison.ai.map(item=>{const rule=structured.strategyValidation?.policyComparison?.rules.find(row=>row.ticker===item.ticker);return <p className="text-sm leading-6" key={item.ticker}>{item.ticker}：AI模拟交易 {item.trades} 笔 / 规则 {rule?.trades||0} 笔；{item.performanceUsable&&rule?.performanceUsable?`AI收益 ${item.returnPct?.toFixed(2)}% / 规则 ${rule.returnPct?.toFixed(2)}% / 持有 ${typeof rule.buyAndHoldReturnPct==='number'?rule.buyAndHoldReturnPct.toFixed(2):'—'}%`:"样本未达门槛，不展示收益对比"}</p>})}</div></details>}
              {structured.strategyValidation&&<details className="rounded-xl border p-4"><summary className="cursor-pointer text-sm font-medium">规则样本外回放：{structured.strategyValidation.validation==='candidate-walk-forward'?'达到候选样本门槛':'历史样本不足'}</summary><p className="mt-3 text-sm leading-6">{structured.strategyValidation.reason}</p><p className="mt-2 text-xs text-muted-foreground">冻结交易日 {structured.strategyValidation.snapshots||0} · 模拟交易 {structured.strategyValidation.trades||0} · 最少观察日 {structured.strategyValidation.observations||0}</p>{structured.strategyValidation.forecastCalibration&&<p className="mt-2 text-xs text-muted-foreground">明确概率预测校准：成熟结果 {structured.strategyValidation.forecastCalibration.maturedOutcomes}/{structured.strategyValidation.forecastCalibration.minimumOutcomes} · 待成熟 {structured.strategyValidation.forecastCalibration.pendingOutcomes} · Brier {structured.strategyValidation.forecastCalibration.brierScore?.toFixed(3)??'样本不足'} · 命中率 {structured.strategyValidation.forecastCalibration.hitRatePct?.toFixed(1)??'样本不足'}%</p>}{structured.strategyValidation.results?.length?<div className="mt-3 grid gap-2 sm:grid-cols-2">{structured.strategyValidation.results.slice(0,8).map(item=><div className="rounded-lg border p-3 text-xs" key={item.ticker}><span className="font-mono">{item.ticker}</span><span className="float-right">{item.status}</span><p className="mt-1 text-muted-foreground">{item.performanceUsable===false?'样本未达门槛，收益指标隐藏':`回放收益 ${item.returnPct?.toFixed(2)??'—'}% · 超额 ${item.excessReturnPct?.toFixed(2)??'—'}% · 最大回撤 ${item.maxDrawdownPct?.toFixed(2)??'—'}%`}</p></div>)}</div>:null}{structured.strategyValidation.limitations?.map((item,index)=><p className="mt-2 text-xs text-muted-foreground" key={index}>{item}</p>)}</details>}
              <details className="rounded-xl border p-4">
                <summary className="cursor-pointer text-sm font-medium">
                  历史上下文与版本记录
                </summary>
                {evaluation?.baselineReport ? (
                  <div className="mt-3">
                    <Link
                      className="text-sm text-primary underline"
                      href={`/comprehensive-analysis/report/${evaluation.baselineReport.id}`}
                    >
                      比较基线：{evaluation.baselineReport.title} ·{" "}
                      {date(evaluation.baselineReport.createdAt)}
                    </Link>
                    {evaluation.changes.length ? (
                      evaluation.changes.map((change) => (
                        <p key={change.ticker} className="mt-2 text-xs">
                          {change.ticker}：
                          {stateLabels[change.from] || change.from} →{" "}
                          {stateLabels[change.to] || change.to}；
                          {change.changedConditions
                            .map(
                              (key) =>
                                decisions
                                  .find((item) => item.ticker === change.ticker)
                                  ?.conditions.find((item) => item.key === key)
                                  ?.label || key,
                            )
                            .join("、")}
                        </p>
                      ))
                    ) : (
                      <p className="mt-2 text-sm">
                        相对基线报告，规则状态没有变化。
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    本报告未保存可核验的完整报告比较基线；不展示中间快照差异。
                  </p>
                )}
                {structured.historicalReportContext?.map((item) => (
                  <Link
                    key={item.reportId}
                    className="mt-3 block text-xs text-primary"
                    href={`/comprehensive-analysis/report/${item.reportId}`}
                  >
                    纳入上下文：{item.title} · {date(item.createdAt)}
                  </Link>
                ))}
              </details>
              <details className="rounded-xl border p-5 print:hidden">
                <summary className="cursor-pointer text-sm font-medium">
                  归档正文（与研究模块同源）
                </summary>
                <p className="mt-3 text-xs text-muted-foreground">
                  保留生成时内容用于追溯；旧格式与历史措辞不代表当前交易状态。
                </p>
                <div className="mt-4 max-h-[640px] overflow-auto text-sm leading-7 [&_ul]:ml-5 [&_ul]:list-disc [&_h2]:my-4 [&_h2]:font-semibold">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {report.content}
                  </ReactMarkdown>
                </div>
              </details>
              <div className="border-t pt-6"><ReportEvidenceView evaluation={evaluation} baseUrl={baseUrl} mode="appendix" /></div>
            </section>
          )}
          {activePage === "publish" && (
            <section id="publish" className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border bg-card p-5 sm:p-6">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="rounded-xl bg-primary/10 p-2.5 text-primary">
                    <BarChart3 aria-hidden className="size-5" />
                  </span>
                  <div>
                    {title("发布概览")}
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      核对准备公开的核心判断、指标、风险提示与长图效果；此页面仅用于预览，不会自动发布。
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => router.push(`/publish?reportId=${report.id}`)}
                >
                  制作发布图文
                </Button>
              </div>
              {structured.socialReport ? (
                <SocialReportView
                  date={report.createdAt}
                  industry={report.industryName}
                  report={normalizeSocialReport(
                    structured.socialReport,
                    evaluation,
                    structured.companyAnalysis,
                  )}
                />
              ) : (
                <div className="rounded-2xl border border-dashed bg-muted/20 p-10 text-center">
                  <Megaphone
                    aria-hidden
                    className="mx-auto size-6 text-muted-foreground"
                  />
                  <h2 className="mt-4 font-semibold">暂无发布版内容</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    这份历史报告没有保存发布摘要，可进入发布工作台重新制作。
                  </p>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
      <p className="pb-6 text-center text-xs text-muted-foreground">
        研究结果仅供参考，不构成投资建议，不自动执行交易。
      </p>
    </div>
  );
}
