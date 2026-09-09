import type { LucideIcon } from 'lucide-react'
import {
  Binoculars,
  CheckCircle2,
  CircleDotDashed,
  Compass,
  History,
  ListChecks,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { chineseNarrative } from '@/lib/analysis/chinese-labels'
import { normalizeExecutiveConclusion } from '@/lib/analysis/investment-conclusion'

type Row = Record<string, unknown>

function record(value: unknown): Row {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Row
  try {
    const parsed = JSON.parse(String(value || '{}'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Row : {}
  } catch {
    return {}
  }
}

function text(value: unknown, fallback = '') {
  return chineseNarrative(String(value || fallback))
}

function statusTone(status: string) {
  if (/已兑现|正在兑现|新出现|已出现/.test(status)) return 'border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-800 dark:text-emerald-200'
  if (/失效|恶化/.test(status)) return 'border-rose-500/25 bg-rose-500/[0.07] text-rose-800 dark:text-rose-200'
  return 'border-amber-500/25 bg-amber-500/[0.07] text-amber-800 dark:text-amber-200'
}

function ListModule({ title, icon: Icon, items, empty, tone = 'default' }: { title: string; icon: LucideIcon; items: string[]; empty: string; tone?: 'default' | 'risk' | 'watch' }) {
  const iconTone = tone === 'risk' ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300' : tone === 'watch' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-primary/10 text-primary'
  return <section className="rounded-2xl border bg-card p-4 sm:p-5">
    <div className="flex items-center gap-2.5"><span className={`flex size-9 items-center justify-center rounded-xl ${iconTone}`} aria-hidden="true"><Icon className="size-4" /></span><h3 className="text-sm font-semibold">{title}</h3></div>
    {items.length ? <ul className="mt-4 space-y-3">{items.map((item, index) => <li key={`${item}-${index}`} className="flex gap-3 text-sm leading-6"><span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-current opacity-55" aria-hidden="true"/><span>{text(item)}</span></li>)}</ul> : <p className="mt-4 text-sm leading-6 text-muted-foreground">{empty}</p>}
  </section>
}

export function ComprehensiveConclusionView({ advice, fallbackSummary, industryOutlook, decisionSummary }: { advice: unknown; fallbackSummary: string; industryOutlook?: unknown; decisionSummary: string }) {
  const raw = record(advice)
  const conclusion = normalizeExecutiveConclusion(raw, fallbackSummary)
  const recommendation = record(raw.recommendation)
  const tactical = record(raw.tacticalView)
  const strategic = record(raw.strategicView)
  const scenarios = record(raw.scenarios)
  const bull = record(scenarios.bull)
  const opportunities = conclusion.opportunities.length ? conclusion.opportunities : text(bull.conditions) ? [{ title: '乐观情景的机会条件', status: '待观察', evidence: text(bull.conditions), actionImplication: '条件兑现后，再结合产品规则与风险预算复核操作。' }] : []
  const unheld = conclusion.actionPlan.unheld || text(recommendation.unheld, '观望')
  const held = conclusion.actionPlan.held || text(recommendation.held, '按风险预算复核')
  const stance = conclusion.allocationStance || text(recommendation.reason, '维持当前风险预算。')
  const priority = conclusion.actionPlan.priority || text(recommendation.reason, '等待关键条件确认后复核。')

  return <div className="mt-5 space-y-4">
    <section className="overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.08] via-primary/[0.025] to-transparent">
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-primary"><Compass className="size-4" aria-hidden="true"/>当前观点<Badge variant="outline" className="ml-auto bg-background/70">{text(raw.rating, '未评级')}</Badge></div>
        <p className="mt-4 text-base font-medium leading-8 text-foreground sm:text-lg">{text(conclusion.conclusion, '综合观点待生成')}</p>
      </div>
      <div className="grid gap-px border-t bg-border/70 sm:grid-cols-2 xl:grid-cols-4">
        <div className="bg-card/95 p-4 sm:p-5"><p className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Compass className="size-3.5" aria-hidden="true"/>配置立场</p><p className="mt-2 text-sm font-medium leading-6">{text(stance)}</p></div>
        <div className="bg-card/95 p-4 sm:p-5"><p className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Target className="size-3.5" aria-hidden="true"/>优先动作</p><p className="mt-2 text-sm font-medium leading-6">{text(priority)}</p></div>
        <div className="bg-card/95 p-4 sm:p-5"><p className="text-xs font-medium text-muted-foreground">未持有</p><p className="mt-2 text-sm font-semibold leading-6 text-primary">{text(unheld)}</p></div>
        <div className="bg-card/95 p-4 sm:p-5"><p className="text-xs font-medium text-muted-foreground">已持有</p><p className="mt-2 text-sm font-semibold leading-6 text-primary">{text(held)}</p></div>
      </div>
    </section>

    <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.035] p-4 sm:p-5">
      <div className="flex items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" aria-hidden="true"><Sparkles className="size-4"/></span><div><h3 className="text-sm font-semibold">机会与兑现状态</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">区分新线索、正在兑现与尚待确认，避免把情景直接当成交易信号。</p></div></div>
      {opportunities.length ? <div className="mt-4 grid gap-3 lg:grid-cols-3">{opportunities.map((item, index) => <article key={`${item.title}-${index}`} className="rounded-xl border bg-card p-4"><div className="flex items-start justify-between gap-3"><h4 className="text-sm font-semibold leading-6">{text(item.title)}</h4><Badge variant="outline" className={`shrink-0 ${statusTone(item.status)}`}>{text(item.status)}</Badge></div>{item.evidence && <p className="mt-3 text-xs leading-5 text-muted-foreground"><span className="font-medium text-foreground/80">当前依据：</span>{text(item.evidence)}</p>}{item.actionImplication && <p className="mt-3 border-t pt-3 text-xs leading-5"><span className="font-medium">操作含义：</span>{text(item.actionImplication)}</p>}</article>)}</div> : <div className="mt-4 flex items-start gap-3 rounded-xl border border-dashed bg-card/60 p-4 text-sm leading-6 text-muted-foreground"><CircleDotDashed className="mt-1 size-4 shrink-0" aria-hidden="true"/>本轮没有形成可单独列示的机会条件，继续等待证据与规则信号共振。</div>}
    </section>

    {conclusion.historyComparison.length > 0 && <section className="rounded-2xl border bg-card p-4 sm:p-5"><div className="flex items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-700 dark:text-sky-300" aria-hidden="true"><History className="size-4"/></span><div><h3 className="text-sm font-semibold">历史机会验证</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">只对照历史报告的综合结论，检查此前机会是否在本轮证据中出现。</p></div></div><ol className="mt-4 space-y-3">{conclusion.historyComparison.map((item,index)=><li key={`${item.previousOpportunity}-${index}`} className="grid gap-3 rounded-xl border p-4 md:grid-cols-[132px_minmax(0,1fr)]"><div><Badge variant="outline" className={statusTone(item.status)}>{text(item.status)}</Badge><p className="mt-2 text-[11px] text-muted-foreground">来源 {text(item.sourceDate,'历史报告')}</p></div><div><p className="text-sm font-medium leading-6">{text(item.previousOpportunity)}</p>{item.currentEvidence&&<p className="mt-1 text-xs leading-5 text-muted-foreground">本轮验证：{text(item.currentEvidence)}</p>}{item.implication&&<p className="mt-2 flex gap-2 text-xs leading-5"><CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true"/>{text(item.implication)}</p>}</div></li>)}</ol></section>}

    <div className="grid gap-4 lg:grid-cols-3">
      <ListModule title="关键驱动" icon={Zap} items={conclusion.keyDrivers} empty="本轮未形成独立的关键驱动条目。" />
      <ListModule title="主要风险" icon={ShieldAlert} items={conclusion.mainRisks} empty="本轮未补充结构化风险，请结合数据边界阅读。" tone="risk" />
      <ListModule title="重点关注" icon={Binoculars} items={conclusion.watchPoints} empty="下一轮复核点待生成。" tone="watch" />
    </div>

    <section className="rounded-2xl border bg-muted/15 p-4 sm:p-5"><div className="flex items-center gap-2.5"><span className="flex size-9 items-center justify-center rounded-xl bg-muted text-muted-foreground" aria-hidden="true"><ListChecks className="size-4"/></span><h3 className="text-sm font-semibold">时间维度与规则边界</h3></div><dl className="mt-4 grid gap-3 md:grid-cols-2"><div className="rounded-xl bg-card p-4"><dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><TrendingUp className="size-3.5" aria-hidden="true"/>20个交易日</dt><dd className="mt-2 text-sm leading-6">{text(tactical.signal, decisionSummary)}</dd></div><div className="rounded-xl bg-card p-4"><dt className="text-xs font-medium text-muted-foreground">6—12个月</dt><dd className="mt-2 text-sm leading-6">{text(strategic.thesis ?? industryOutlook, '长期观点待生成')}</dd></div></dl></section>
  </div>
}
