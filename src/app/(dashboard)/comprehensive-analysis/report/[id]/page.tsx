"use client";

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
import { PortfolioDecisionPanel } from "@/components/analysis/PortfolioDecisionPanel";
import { SocialReportView } from "@/components/analysis/SocialReportView";
import type { Evaluation } from "@/lib/research/contracts";
import { chineseNarrative, chineseSource } from "@/lib/analysis/chinese-labels";
import {
  consolidateWatchlist,
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
  decisionTiming?: DecisionTimingAssessment;
  inheritedFromReportId?: string | null;
  historicalReportContext?: Array<{
    reportId: string;
    title: string;
    sessionDate: string;
    createdAt: string;
    summary: string;
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
        dataQuality: structured.dataQuality,
        preflight: structured.researchPreflight,
        decisionTiming: timing,
      })
    : structured.reportQuality;
  const decisions = evaluation?.decisions || [],
    sources = evaluation?.evidence || [];
  const baseUrl = `/api/research/${report.industryId}?snapshot=${evaluation?.snapshotId || ""}`;
  const advice = parseAnalysis(
      guardActionLanguage(structured.investmentAdvice, timing.executionReady),
    ),
    industry = parseAnalysis(structured.industryAnalysis);
  const watchlist = [
    ...new Set(
      [
        structured.investmentAdvice,
        structured.industryAnalysis,
        structured.marketAnalysis,
        structured.companyAnalysis,
        structured.sentimentAnalysis,
      ].flatMap((value) => {
        const row = parseAnalysis(value);
        return Array.isArray(row.watchlist)
          ? row.watchlist.filter(
              (item): item is string => typeof item === "string",
            )
          : [];
      }),
    ),
  ];
  const summary = cleanClaim(
    String(parseAnalysis(advice.executiveSummary).conclusion || advice.thesis || industry.analysis || report.summary || ""),
  );
  const executive = parseAnalysis(advice.executiveSummary);
  const recommendation = parseAnalysis(advice.recommendation);
  const executiveDrivers = Array.isArray(executive.keyDrivers) ? executive.keyDrivers.filter((item): item is string => typeof item === "string").slice(0, 3) : [];
  const executiveRisks = Array.isArray(executive.mainRisks) ? executive.mainRisks.filter((item): item is string => typeof item === "string").slice(0, 3) : [];
  const executiveActions = parseAnalysis(executive.actionPlan);
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
          <Badge variant="outline">研究置信度 {readiness.confidencePct}%</Badge>
          <Badge variant="outline">{quality?.grade || "—"}级数据质量</Badge>
        </div>
        <h1 className="text-2xl font-semibold sm:text-3xl">
          {chineseNarrative(report.title)}
        </h1>
        <p className="text-xs leading-6 text-muted-foreground">
          生成 {date(report.createdAt)} · 证据冻结 {date(evaluation?.asOf)} ·
          收盘基准 {evaluation?.expectedSession || "未核验"} ·{" "}
          {decisions.length}只产品 / {coverage.indexCount}个指数
        </p>
      </header>
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
                <div className="flex flex-wrap gap-2"><Badge variant={investmentFallback ? "outline" : "default"}>{investmentFallback ? "超时降级汇编" : "AI 综合研判"}</Badge><Badge variant="outline">{chineseNarrative(String(advice.rating || "未评级"))}</Badge></div>
              </div>
              {investmentFallback && <p className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/[0.05] px-3 py-2 text-xs leading-5 text-amber-800 dark:text-amber-200">综合模型请求未在时限内完成；本结论由已完成的市场、事件、企业、行业总览和冻结规则结构化汇编，不新增模型推断。</p>}
              <p className="mt-5 text-base leading-8">
                {chineseNarrative(summary)}
              </p>
              <div className="mt-5 rounded-xl border border-primary/20 bg-primary/[0.035] p-4">
                <h3 className="text-sm font-medium">配置立场</h3>
                <p className="mt-2 text-sm leading-6">{chineseNarrative(String(executive.allocationStance || recommendation.reason || "配置立场待生成"))}</p>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border p-4">
                  <h3 className="text-sm font-medium">未持有</h3>
                  <p className="mt-2 text-sm leading-6">{chineseNarrative(String(executiveActions.unheld || recommendation.unheld || "观望"))}</p>
                </div>
                <div className="rounded-xl border p-4">
                  <h3 className="text-sm font-medium">已持有</h3>
                  <p className="mt-2 text-sm leading-6">{chineseNarrative(String(executiveActions.held || recommendation.held || "按风险预算复核"))}</p>
                </div>
                <div className="rounded-xl border p-4">
                  <h3 className="text-sm font-medium">20个交易日</h3>
                  <p className="mt-2 text-sm leading-6">
                    {chineseNarrative(
                      String(
                        parseAnalysis(advice.tacticalView).signal ||
                          `${decisions.filter((item) => item.state === "risk-off").length}只产品风险收缩，${decisions.filter((item) => item.state === "eligible").length}只满足条件。`,
                      ),
                    )}
                  </p>
                </div>
                <div className="rounded-xl border p-4">
                  <h3 className="text-sm font-medium">6—12个月</h3>
                  <p className="mt-2 text-sm leading-6">
                    {chineseNarrative(
                      String(
                        parseAnalysis(advice.strategicView).thesis ||
                          industry.outlook ||
                          "长期观点待生成",
                      ),
                    )}
                  </p>
                </div>
              </div>
              {(executiveDrivers.length > 0 || executiveRisks.length > 0) && <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border p-4"><h3 className="text-sm font-medium">结论成立的关键驱动</h3><ul className="mt-3 space-y-2">{executiveDrivers.map(item => <li key={item} className="flex gap-2 text-sm leading-6"><span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-emerald-500"/>{chineseNarrative(item)}</li>)}</ul>{!executiveDrivers.length && <p className="mt-2 text-sm text-muted-foreground">旧报告未保存结构化驱动因素。</p>}</div>
                <div className="rounded-xl border p-4"><h3 className="text-sm font-medium">主要风险与反证</h3><ul className="mt-3 space-y-2">{executiveRisks.map(item => <li key={item} className="flex gap-2 text-sm leading-6"><span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-amber-500"/>{chineseNarrative(item)}</li>)}</ul>{!executiveRisks.length && <p className="mt-2 text-sm text-muted-foreground">旧报告未保存结构化主要风险。</p>}</div>
              </div>}
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
              {title("指数基金规则与行动建议")}
              <p className="text-sm text-muted-foreground">
                以下动作来自逐产品规则；模型研究观点另列。相同状态可以对应相同动作，每只产品的触发依据与数据覆盖独立展示。
              </p>
              <div className="grid gap-3 lg:grid-cols-2">
                {decisions.map((decision) => {
                  const action = safeDecisionAction(
                    decision,
                    timing.executionReady && readiness.level === "advice-ready",
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
                          未持有：{action.unheld} · 已持有：{action.held}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          产品证据覆盖评分 {decisionConfidence(decision)}% ·
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
                  模型研究观点与逐产品说明
                </summary>
                <p className="mt-3 text-xs text-muted-foreground">
                  模型观点用于解释产业机会、风险和情景；规则动作及组合预算单独计算。旧报告中建议方向可能曾被程序覆盖。
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
          {activePage === "summary" && (
            <section className="space-y-4 rounded-2xl border bg-card p-5 sm:p-6">
              {title("后续观察")}
              <p className="text-sm text-muted-foreground">
                跨模块观察项集中展示；出现变化后再复核对应研究判断。
              </p>
              <ul className="grid gap-2 md:grid-cols-2">
                {consolidateWatchlist(watchlist).map((item) => (
                  <li
                    key={item}
                    className="rounded-lg border p-3 text-sm leading-6"
                  >
                    {chineseNarrative(item)}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {activePage === "readiness" && (
            <section id="readiness" className="scroll-mt-20 space-y-4">
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
                        ? `收盘价基准 ${evaluation?.expectedSession}；部分净值日期落后，无法配对计算同日折溢价。历史净值见产品比较。`
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
                    质量评分：{quality.overallScore}分 · {quality.grade}级
                  </summary>
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
