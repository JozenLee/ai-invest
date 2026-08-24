'use client'

import type { ComponentType, ReactNode } from 'react'
import { AlertCircle, FileText, Loader2, Sparkles } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

export interface AnalysisStep {
  icon: ComponentType<{ className?: string }>
  label: string
  detail: string
  active?: boolean
}

export interface AnalysisHistoryOption {
  id: string
  label: string
}

interface AnalysisModuleCardProps {
  icon: ComponentType<{ className?: string }>
  title: string
  description: string
  actionLabel?: string
  loadingActionLabel?: string
  loading: boolean
  canAnalyze?: boolean
  hasResult: boolean
  error: string | null
  onAnalyze: () => void
  steps: AnalysisStep[]
  loadingMessage: string
  reportTitle: string
  reportBadge: string
  reportDescription: string
  reportReady: boolean
  onOpenReport: () => void
  history?: {
    label: string
    value: string
    placeholder: string
    options: AnalysisHistoryOption[]
    onChange: (value: string | null) => void
    onOpen: () => void
  }
  emptyTitle: string
  emptyDescription: string
  headerExtra?: ReactNode
  errorVariant?: 'default' | 'destructive'
}

export function AnalysisModuleCard({
  icon: Icon,
  title,
  description,
  actionLabel = '开始分析',
  loadingActionLabel = '分析中...',
  loading,
  canAnalyze = true,
  hasResult,
  error,
  onAnalyze,
  steps,
  loadingMessage,
  reportTitle,
  reportBadge,
  reportDescription,
  reportReady,
  onOpenReport,
  history,
  emptyTitle,
  emptyDescription,
  headerExtra,
  errorVariant = 'destructive',
}: AnalysisModuleCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-2">
            <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0">
              <CardTitle>{title}</CardTitle>
              <CardDescription className="mt-1">{description}</CardDescription>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {headerExtra}
            <Button
              variant="outline"
              size="sm"
              onClick={onAnalyze}
              disabled={loading || !canAnalyze}
              className="gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  {loadingActionLabel}
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  {hasResult ? '重新分析' : actionLabel}
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}
          aria-label={`${title}分析步骤`}
        >
          {steps.map((step, index) => {
            const StepIcon = step.icon
            const active = loading || step.active

            return (
              <div
                key={step.label}
                className={`rounded-lg border p-3 transition-colors ${active ? 'border-primary/40 bg-primary/5' : 'bg-muted/30'}`}
              >
                <div className="flex items-center gap-2">
                  <StepIcon className={`h-4 w-4 ${active ? 'text-primary' : 'text-muted-foreground'}`} aria-hidden="true" />
                  <span className="text-sm font-medium">{index + 1}. {step.label}</span>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.detail}</p>
              </div>
            )
          })}
        </div>

        {loading && (
          <div className="space-y-3 rounded-lg border p-4" role="status" aria-live="polite">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {loadingMessage}
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        )}

        {error && (
          <Alert variant={errorVariant} role="alert">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            <AlertDescription className="whitespace-pre-wrap">{error}</AlertDescription>
          </Alert>
        )}

        {reportReady && (
          <div className="rounded-lg border border-primary/20 bg-primary/[0.03] p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <h3 className="truncate text-sm font-semibold">{reportTitle}</h3>
                <Badge variant="secondary" className="shrink-0">{reportBadge}</Badge>
              </div>
              <Button size="sm" className="shrink-0 gap-2" onClick={onOpenReport}>
                <FileText className="h-4 w-4" aria-hidden="true" />
                查看完整报告
              </Button>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{reportDescription}</p>
          </div>
        )}

        {history && history.options.length > 0 && (
          <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <div className="mb-1 text-xs font-medium text-muted-foreground">{history.label}</div>
              <Select value={history.value} onValueChange={history.onChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={history.placeholder}>
                    {history.options.find((option) => option.id === history.value)?.label}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {history.options.map((option) => (
                    <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" className="shrink-0 gap-2" onClick={history.onOpen} disabled={!history.value}>
              <FileText className="h-4 w-4" aria-hidden="true" />
              查看报告
            </Button>
          </div>
        )}

        {!loading && !hasResult && !error && (
          <div className="rounded-lg border border-dashed py-10 text-center">
            <Sparkles className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium">{emptyTitle}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{emptyDescription}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
