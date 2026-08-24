'use client'

import { ArrowDownRight, ArrowUpRight, CheckCircle2, ListChecks, ShieldAlert, Target } from 'lucide-react'
import type { ReactNode } from 'react'

type SignalBrief = {
  headline?: string
  positiveSignals?: string[]
  negativeSignals?: string[]
  dataIssues?: string[]
  action?: string
  waitFor?: string[]
}

type ReportInsightHierarchyProps = {
  summary?: string
  strategy?: string
  decisionBrief?: SignalBrief
  fallbackEvidence?: Array<{ title?: string; value?: string; direction?: string }>
}

function clean(value: unknown) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

function items(value: unknown) {
  return Array.isArray(value) ? value.map(clean).filter(Boolean) : []
}

function SignalList({ values, empty }: { values: string[]; empty: string }) {
  if (!values.length) return <p className="text-sm leading-6 text-muted-foreground">{empty}</p>
  return (
    <ul className="space-y-2.5" aria-label="信号列表">
      {values.map((value, index) => (
        <li key={`${value}-${index}`} className="flex gap-2.5 text-sm leading-6 text-foreground/90">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
          <span>{value}</span>
        </li>
      ))}
    </ul>
  )
}

function InsightCard({
  number,
  title,
  description,
  icon: Icon,
  tone,
  children,
}: {
  number: string
  title: string
  description: string
  icon: typeof ArrowUpRight
  tone: 'positive' | 'negative' | 'neutral' | 'strategy'
  children: ReactNode
}) {
  const tones = {
    positive: 'border-rose-200/70 bg-rose-50/70 dark:border-rose-900/50 dark:bg-rose-950/20',
    negative: 'border-emerald-200/70 bg-emerald-50/70 dark:border-emerald-900/50 dark:bg-emerald-950/20',
    neutral: 'border-primary/20 bg-primary/[0.04]',
    strategy: 'border-amber-200/70 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/20',
  }
  const iconTones = {
    positive: 'text-rose-600 dark:text-rose-300',
    negative: 'text-emerald-600 dark:text-emerald-300',
    neutral: 'text-primary',
    strategy: 'text-amber-600 dark:text-amber-300',
  }
  return (
    <section className={`rounded-xl border p-4 transition-colors duration-200 ${tones[tone]}`} aria-labelledby={`report-insight-${number}`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background/80 ${iconTones[tone]}`} aria-hidden="true">
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold text-muted-foreground">{number}</span>
            <h3 id={`report-insight-${number}`} className="text-sm font-semibold tracking-tight">{title}</h3>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="mt-4 pl-0 sm:pl-12">{children}</div>
    </section>
  )
}

export function ReportInsightHierarchy({ summary, strategy, decisionBrief, fallbackEvidence = [] }: ReportInsightHierarchyProps) {
  const positive = items(decisionBrief?.positiveSignals)
  const negative = items(decisionBrief?.negativeSignals)
  const fallbackPositive = fallbackEvidence.filter((item) => item.direction === 'positive').map((item) => `${clean(item.title)}：${clean(item.value)}`).filter(Boolean)
  const fallbackNegative = fallbackEvidence.filter((item) => item.direction === 'negative').map((item) => `${clean(item.title)}：${clean(item.value)}`).filter(Boolean)
  // summary 是跨模块凝练后的判断；headline 仅作为缺失时的降级值。
  const coreSummary = clean(summary) || clean(decisionBrief?.headline) || '暂无核心判断'
  const strategyText = clean(strategy) || clean(decisionBrief?.action) || '暂无投资策略'
  const waits = items(decisionBrief?.waitFor)
  const dataIssues = items(decisionBrief?.dataIssues)

  return (
    <div className="space-y-3" aria-label="综合分析核心结论与投资策略">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">核心结论与投资策略</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">先看多空信号，再看核心判断和可执行策略，降低长文本阅读成本。</p>
        </div>
        <span className="hidden rounded-full border bg-background/70 px-2.5 py-1 font-mono text-[11px] text-muted-foreground sm:inline-flex">AI DECISION BRIEF</span>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <InsightCard number="01" title="利好信号" description="支持产业趋势或风险偏好改善的证据" icon={ArrowUpRight} tone="positive">
          <SignalList values={positive.length ? positive : fallbackPositive} empty="当前没有足够的结构化利好信号。" />
        </InsightCard>
        <InsightCard number="02" title="利空信号" description="可能压制表现或限制新增风险的因素" icon={ArrowDownRight} tone="negative">
          <SignalList values={negative.length ? negative : fallbackNegative} empty="当前没有足够的结构化利空信号。" />
        </InsightCard>
      </div>

      <InsightCard number="03" title="核心判断" description="综合多空信号、数据质量与持仓约束后的当前结论" icon={Target} tone="neutral">
        <div className="space-y-2 text-sm leading-7">
          <p className="font-medium text-foreground">{coreSummary}</p>
          {dataIssues.length > 0 && <p className="text-xs leading-5 text-muted-foreground">数据限制：{dataIssues.join('；')}</p>}
        </div>
      </InsightCard>

      <InsightCard number="04" title="投资策略" description="将判断转化为今天可执行、可复核的动作" icon={ListChecks} tone="strategy">
        <div className="space-y-3 text-sm leading-7">
          <div className="flex gap-2.5">
            <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden="true" />
            <p>{strategyText}</p>
          </div>
          {waits.length > 0 && <div className="flex gap-2.5 border-t border-amber-900/10 pt-3 dark:border-amber-100/10"><ShieldAlert className="mt-1 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden="true" /><p><span className="font-medium">下一步等待：</span>{waits.join('；')}</p></div>}
        </div>
      </InsightCard>
    </div>
  )
}
