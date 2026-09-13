"use client";
import { TechnicalReadinessPanel } from '@/components/analysis/TechnicalReadinessPanel';
import type { TechnicalReadiness } from '@/lib/research/technical-readiness';
import { OpportunityLedger } from '@/components/analysis/OpportunityLedger';
import type { ResearchOpportunity } from '@/lib/analysis/opportunity-ledger';

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
import { ForwardEvaluationPanel } from "@/components/analysis/ForwardEvaluationPanel";
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
  aiServiceStatus?: {status?:string;reason?:string};
  opportunityLedger?: ResearchOpportunity[];
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
  dataQuality?: { status?: string; technicalReadiness?:TechnicalReadiness };
  reportQuality?: ReportQualityAssessment;
  strategyValidation?: {status?:string;validation?:string;reason?:string;snapshots?:number;trades?:number;observations?:number;limitations?:string[];results?:Array<{ticker:string;status:string;returnPct:number|null;excessReturnPct?:number|null;maxDrawdownPct:number|null;sharpeRatio?:number|null;informationRatio?:number|null}>};
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
  outputValidations?: Record<string,{status?:string;issues?:string[]}|null>;
  analysisStatuses?: Record<string, { status?: string; reason?: string } | null>;
  privatePortfolioAnalysis?: unknown;
  portfolioDecisionSupport?: PortfolioDecisionSupport;
  metadata?: { runId?: string; kind?: string; generatedAt?: string };
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
    description: "指数规则、产品选择与行动条件",
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
    description: "时效、质量、来源与版本",
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
  const quality = evaluation
      ? buildReportQuality({
        evaluation,
        consistencyIssues: structured.reportQuality?.consistencyIssues,
        dataQuality: structured.dataQuality,
        preflight: structured.researchPreflight,
        decisionTiming: timing,
        portfolioDecisionSupport: structured.portfolioDecisionSupport,
        analysisStatuses: structured.analysisStatuses,
        outputValidations: structured.outputValidations,
      })
    : structured.reportQuality;
  const decisions = evaluation?.decisions || [],
    sources = evaluation?.evidence || [];
  const baseUrl = `/api/research/${report.industryId}?snapshot=${evaluation?.snapshotId || ""}`;
  const advice = parseAnalysis(
      guardActionLanguage(structured.investmentAdvice, timing.executionReady),
    ),
    industry = parseAnalysis(structured.industryAnalysis);
  const summary = cleanClaim(
    String(parseAnalysis(advice.executiveSummary).conclusion || advice.thesis || industry.analysis || report.summary || ""),
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
    <main
      id="main-content"
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
          内容更新 {date(structured.metadata?.generatedAt || report.createdAt)} · 证据冻结 {date(evaluation?.asOf)} ·
          {timing.phase === "trading" ? "盘中数据日" : "收盘基准"} {evaluation?.expectedSession || "未核验"} ·{" "}
          {decisions.length}只产品 / {coverage.indexCount}个指数
        </p>
      </header>
      {structured.aiServiceStatus?.status==='billing-blocked'&&<p role="status" className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm leading-6">模型服务状态：{structured.aiServiceStatus.reason} 这不表示市场证据不足。恢复模型账户额度后可新建完整分析。</p>}
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
          {activePage === "summary" && (
            <section
              id="summary"
              className="scroll-mt-20 rounded-2xl border bg-card p-5 sm:p-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                {title("综合投资结论")}
                <Badge variant={investmentFallback ? "outline" : "default"}>{investmentFallback ? "超时降级汇编" : "AI 综合研判"}</Badge>
              </div>
              {investmentFallback && <p className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/[0.05] px-3 py-2 text-xs leading-5 text-amber-800 dark:text-amber-200">综合模型请求未在时限内完成；本结论由已完成的市场、事件、企业、行业总览和冻结规则结构化汇编，不新增模型推断。</p>}
              {!!quality?.consistencyIssues?.length && <div role="alert" className="mt-4 rounded-xl border border-destructive/40 p-4 text-sm leading-6"><p className="font-semibold">报告存在待修复的事实口径冲突，暂不作为执行依据</p><ul>{quality.consistencyIssues.map((issue,index)=><li key={index}>{issue}</li>)}</ul></div>}
              <ComprehensiveConclusionView
                advice={advice}
                fallbackSummary={summary}
                industryOutlook={industry.outlook}
                decisionSummary={`${decisions.filter((item) => item.state === "risk-off").length}只产品风险收缩，${decisions.filter((item) => item.state === "eligible").length}只满足条件。`}
              />
              <OpportunityLedger items={structured.opportunityLedger || []} />
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
              {title("指数基金技术规则对照")}
              <p className="text-sm text-muted-foreground">
                以下为技术策略在冻结数据上的原始意图，用于与独立研究比较。均线信号不自动决定账户交易；实际资金方案见个人组合。
              </p>
              <div className="grid gap-3 lg:grid-cols-2">
                {decisions.map((decision) => {
                  const action = safeDecisionAction(
                    decision,
                    timing.executionReady && readiness.level === "advice-ready" && !quality?.consistencyIssues?.length,
                  );
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
                          {decision.ticker} · {stateLabels[decision.state]}
                        </span>
                        <span className="mt-2 block text-sm">
                          规则意图：未持有 {action.unheld} · 已持有 {action.held}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          产品证据覆盖度 {decisionConfidence(decision)}/100 ·
                          指数 {decision.indexCode || "待映射"}
                        </span>
                      </summary>
                      <div className="space-y-3 border-t p-4">
                        <p className="text-sm leading-6">
                          {chineseNarrative(decision.reason)}
                        </p>
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
                                {condition.key === "market" && typeof condition.value === "number" ? `${(condition.value * 100).toFixed(2)}%` : condition.value ?? "未知"} ·{" "}
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
                  模型研究观点与逐产品说明
                </summary>
                <p className="mt-3 text-xs text-muted-foreground">
                  独立投资假设与技术信号交叉评估，保留冲突、反证和期限。账户方案根据真实基金暴露、费用及硬约束另行比较；旧版报告保留原始结论。
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
                timing.executionReady && readiness.level === "advice-ready" && !quality?.consistencyIssues?.length
              }
            />
          )}
          {activePage === "portfolio" && portfolio && (portfolio.allocationVersion ?? 0) >= 3 && <ForwardEvaluationPanel reportId={report.id}/>}
          {activePage === "readiness" && (
            <section id="readiness" className="scroll-mt-20 space-y-4">
              <TechnicalReadinessPanel data={structured.dataQuality?.technicalReadiness}/>
              {title("数据、时效与复盘附录")}
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
                    {timing.reasons.join("；") || "实时数据符合时效要求"}
                    。非交易时间不要求实时报价，不降低收盘研究的完整性。
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
                    证据质量评分：{quality.overallScore}分 · {quality.grade}级
                  </summary>
                  <p className="mt-2 text-sm text-muted-foreground">{quality.scoreMeaning || '评分反映证据覆盖，不是投资胜率或收益预测。'}</p>
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
              {structured.strategyValidation&&<details className="rounded-xl border p-4"><summary className="cursor-pointer text-sm font-medium">规则样本外回放：{structured.strategyValidation.validation==='candidate-walk-forward'?'达到候选样本门槛':'历史样本不足'}</summary><p className="mt-3 text-sm leading-6">{structured.strategyValidation.reason}</p><p className="mt-2 text-xs text-muted-foreground">冻结交易日 {structured.strategyValidation.snapshots||0} · 模拟交易 {structured.strategyValidation.trades||0} · 最少观察日 {structured.strategyValidation.observations||0}</p>{structured.strategyValidation.results?.length?<div className="mt-3 grid gap-2 sm:grid-cols-2">{structured.strategyValidation.results.slice(0,8).map(item=><div className="rounded-lg border p-3 text-xs" key={item.ticker}><span className="font-mono">{item.ticker}</span><span className="float-right">{item.status}</span><p className="mt-1 text-muted-foreground">回放收益 {item.returnPct?.toFixed(2)??'—'}% · 超额 {item.excessReturnPct?.toFixed(2)??'—'}% · 最大回撤 {item.maxDrawdownPct?.toFixed(2)??'—'}%</p></div>)}</div>:null}{structured.strategyValidation.limitations?.map((item,index)=><p className="mt-2 text-xs text-muted-foreground" key={index}>{item}</p>)}</details>}
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
    </main>
  );
}
