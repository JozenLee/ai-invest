'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog'
import {
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  AlertCircle,
  Briefcase,
  Mail,
  Wallet,
  CheckCircle2,
  Clock3,
  Settings2,
  PieChart,
  ArrowUpDown,
  ShieldCheck,
} from 'lucide-react'

interface Holding {
  id: string
  portfolioId: string
  ticker: string
  market: string
  name: string
  category?: string | null
  industryDomain?: string | null
  industryDomainSource?: string | null
  industryDomainConfidence?: number | null
  quantity: number
  unitNav: number
  fundType?: string | null
  targetEtfCode?: string | null
  targetIndexCode?: string | null
  mappingSource?: string | null
  mappingConfidence?: number | null
  purchaseDate?: string | null
  costNav?: number | null
  redemptionFeePct?: number | null
  updatedAt: string
}

interface Portfolio {
  id: string
  userId: string
  name: string
  isDefault: boolean
  holdings: Holding[]
  cashBalance: number
  lastSyncedAt: string | null
  lastSyncEmail: string | null
}

interface SyncSchedule {
  portfolioId: string
  enabled: boolean
  timezone: string
  syncTimes: string[]
  lastRunAt: string | null
  lastError: string | null
}

interface RiskBudget { riskProfile: string; investHorizon: string; minCashRatio: number; maxIndustryRatio: number; maxFundRatio: number; maxSingleAdjustmentRatio: number; stagedAdjustment: boolean }
const defaultRiskBudget: RiskBudget = { riskProfile: 'moderate', investHorizon: 'medium', minCashRatio: .1, maxIndustryRatio: .2, maxFundRatio: .15, maxSingleAdjustmentRatio: .05, stagedAdjustment: true }

export default function PortfolioOverviewPage() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [schedule, setSchedule] = useState<SyncSchedule | null>(null)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [riskOpen, setRiskOpen] = useState(false)
  const [riskBudget, setRiskBudget] = useState<RiskBudget>(defaultRiskBudget)
  const [isSavingRisk, setIsSavingRisk] = useState(false)
  const [scheduleEnabled, setScheduleEnabled] = useState(true)
  const [scheduleTimes, setScheduleTimes] = useState(['00:00', '12:00'])
  const [isSavingSchedule, setIsSavingSchedule] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [sortMode, setSortMode] = useState('category')

  // Dialog state
  const [addOpen, setAddOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [selectedHolding, setSelectedHolding] = useState<Holding | null>(null)

  // Form state
  const [formTicker, setFormTicker] = useState('')
  const [formName, setFormName] = useState('')
  const [formQuantity, setFormQuantity] = useState('')
  const [formUnitNav, setFormUnitNav] = useState('')
  const [formIndustryDomain, setFormIndustryDomain] = useState('')
  const [formFundType, setFormFundType] = useState('')
  const [formTargetEtf, setFormTargetEtf] = useState('')
  const [formTargetIndex, setFormTargetIndex] = useState('')
  const [formPurchaseDate, setFormPurchaseDate] = useState('')
  const [formCostNav, setFormCostNav] = useState('')
  const [formRedemptionFee, setFormRedemptionFee] = useState('')

  const fetchPortfolio = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/portfolio')
      const data = await res.json()
      if (data.success && data.data?.length > 0) {
        const defaultPortfolio = data.data.find((p: Portfolio) => p.isDefault) ?? data.data[0]
        setPortfolio(defaultPortfolio)
        setHoldings(defaultPortfolio.holdings ?? [])
        const scheduleRes = await fetch(`/api/portfolio/${defaultPortfolio.id}/schedule`)
        const scheduleData = await scheduleRes.json()
        if (scheduleData.success) {
          setSchedule(scheduleData.data)
          setScheduleEnabled(scheduleData.data.enabled)
          setScheduleTimes(scheduleData.data.syncTimes)
        }
        const riskRes = await fetch(`/api/portfolio/${defaultPortfolio.id}/risk-budget`)
        const riskData = await riskRes.json()
        if (riskData.success) setRiskBudget(riskData.data)
      } else {
        setPortfolio(null)
        setHoldings([])
      }
    } catch (err) {
      console.error('获取投资组合失败:', err)
      setError('获取投资组合数据失败')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const saveSchedule = async () => {
    if (!portfolio) return
    setIsSavingSchedule(true)
    try {
      const res = await fetch(`/api/portfolio/${portfolio.id}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: scheduleEnabled, syncTimes: scheduleTimes, timezone: 'Asia/Shanghai' }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error ?? '保存同步计划失败')
      setSchedule(data.data)
      setScheduleTimes(data.data.syncTimes)
      setScheduleOpen(false)
      setSyncMessage('同步计划已保存')
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存同步计划失败')
    } finally {
      setIsSavingSchedule(false)
    }
  }

  const saveRiskBudget = async () => {
    if (!portfolio) return
    setIsSavingRisk(true); setError(null)
    try {
      const res = await fetch(`/api/portfolio/${portfolio.id}/risk-budget`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(riskBudget) })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error ?? '保存风险预算失败')
      setRiskBudget(data.data); setRiskOpen(false); setSyncMessage('风险预算已保存，将用于下一次私有综合分析')
    } catch (err) { setError(err instanceof Error ? err.message : '保存风险预算失败') } finally { setIsSavingRisk(false) }
  }

  const syncPortfolio = async () => {
    setIsSyncing(true)
    setSyncMessage(null)
    setError(null)
    try {
      const res = await fetch('/api/portfolio/import-email', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error ?? '邮箱同步失败')
      setSyncMessage(`已同步 ${data.count} 只基金和余额`)
      await fetchPortfolio()
    } catch (err) {
      setError(err instanceof Error ? err.message : '邮箱同步失败')
    } finally {
      setIsSyncing(false)
    }
  }

  useEffect(() => {
    // The initial fetch hydrates this client-only page from the external API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPortfolio()
  }, [fetchPortfolio])

  const totalMarketValue = holdings.reduce((sum, h) => sum + h.unitNav * h.quantity, 0)
  const cashBalance = portfolio?.cashBalance ?? 0
  const totalAssets = totalMarketValue + cashBalance
  const investedRatio = totalAssets > 0 ? totalMarketValue / totalAssets * 100 : 0
  const cashRatio = totalAssets > 0 ? cashBalance / totalAssets * 100 : 0
  const categories = Array.from(new Set(holdings.map((holding) => holding.category).filter(Boolean))) as string[]
  const visibleHoldings = holdings
    .filter((holding) => categoryFilter === 'all' || holding.category === categoryFilter)
    .sort((a, b) => {
      const valueDifference = b.unitNav * b.quantity - a.unitNav * a.quantity
      if (sortMode === 'marketValue') return valueDifference
      return (a.category || '未分类').localeCompare(b.category || '未分类', 'zh-CN') || valueDifference
    })

  const resetForm = () => {
    setFormTicker('')
    setFormName('')
    setFormQuantity('')
    setFormUnitNav('')
    setFormIndustryDomain('')
    setFormFundType(''); setFormTargetEtf(''); setFormTargetIndex(''); setFormPurchaseDate(''); setFormCostNav(''); setFormRedemptionFee('')
  }

  const handleAdd = async () => {
    if (!portfolio || !formTicker || !formName || !formQuantity || !formUnitNav) return
    try {
      const res = await fetch(`/api/portfolio/${portfolio.id}/holdings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: formTicker,
          name: formName,
          quantity: parseFloat(formQuantity),
          unitNav: parseFloat(formUnitNav),
          ...(formIndustryDomain.trim() ? { industryDomain: formIndustryDomain.trim() } : {}),
          fundType: formFundType, targetEtfCode: formTargetEtf, targetIndexCode: formTargetIndex, purchaseDate: formPurchaseDate, costNav: formCostNav, redemptionFeePct: formRedemptionFee,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setAddOpen(false)
        resetForm()
        await fetchPortfolio()
      }
    } catch (err) {
      console.error('添加持仓失败:', err)
    }
  }

  const openEdit = (h: Holding) => {
    setSelectedHolding(h)
    setFormQuantity(String(h.quantity))
    setFormUnitNav(String(h.unitNav))
    setFormIndustryDomain(h.industryDomain ?? '')
    setFormFundType(h.fundType ?? '')
    setFormTargetEtf(h.targetEtfCode ?? '')
    setFormTargetIndex(h.targetIndexCode ?? '')
    setFormPurchaseDate(h.purchaseDate?.slice(0, 10) ?? '')
    setFormCostNav(h.costNav == null ? '' : String(h.costNav))
    setFormRedemptionFee(h.redemptionFeePct == null ? '' : String(h.redemptionFeePct))
    setEditOpen(true)
  }

  const handleEdit = async () => {
    if (!portfolio || !selectedHolding) return
    try {
      const res = await fetch(`/api/portfolio/${portfolio.id}/holdings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          holdingId: selectedHolding.id,
          quantity: parseFloat(formQuantity),
          unitNav: parseFloat(formUnitNav),
          industryDomain: formIndustryDomain.trim(),
          fundType: formFundType, targetEtfCode: formTargetEtf, targetIndexCode: formTargetIndex, purchaseDate: formPurchaseDate, costNav: formCostNav, redemptionFeePct: formRedemptionFee,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setEditOpen(false)
        setSelectedHolding(null)
        resetForm()
        await fetchPortfolio()
      }
    } catch (err) {
      console.error('更新持仓失败:', err)
    }
  }

  const openDelete = (h: Holding) => {
    setSelectedHolding(h)
    setDeleteOpen(true)
  }

  const handleDelete = async () => {
    if (!portfolio || !selectedHolding) return
    try {
      const res = await fetch(
        `/api/portfolio/${portfolio.id}/holdings?holdingId=${selectedHolding.id}`,
        { method: 'DELETE' }
      )
      const data = await res.json()
      if (data.success) {
        setDeleteOpen(false)
        setSelectedHolding(null)
        await fetchPortfolio()
      }
    } catch (err) {
      console.error('删除持仓失败:', err)
    }
  }

  const formatMoney = (n: number) =>
    n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const productMappingFields = (prefix: string) => <details className="rounded-xl border p-4"><summary className="cursor-pointer text-sm font-medium">底层产品映射与交易成本</summary><p className="mt-2 text-xs leading-5 text-muted-foreground">ETF联接基金建议填写目标ETF或跟踪指数；赎回费请按当前持有期限填写。</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="grid gap-1"><Label htmlFor={`${prefix}-fund-type`}>基金类型</Label><Select value={formFundType || 'unknown'} onValueChange={(value) => setFormFundType(value === 'unknown' || !value ? '' : value)}><SelectTrigger id={`${prefix}-fund-type`}><span>{formFundType === 'feeder' ? 'ETF联接' : formFundType === 'etf' ? '场内ETF' : formFundType === 'index-enhanced' ? '指数增强' : formFundType === 'active' ? '主动基金' : formFundType === 'qdii' ? 'QDII' : '待识别'}</span></SelectTrigger><SelectContent><SelectItem value="unknown">待识别</SelectItem><SelectItem value="feeder">ETF联接</SelectItem><SelectItem value="etf">场内ETF</SelectItem><SelectItem value="index-enhanced">指数增强</SelectItem><SelectItem value="active">主动基金</SelectItem><SelectItem value="qdii">QDII</SelectItem></SelectContent></Select></div><div className="grid gap-1"><Label htmlFor={`${prefix}-target-etf`}>目标ETF代码</Label><Input id={`${prefix}-target-etf`} placeholder="如 159995" value={formTargetEtf} onChange={(event) => setFormTargetEtf(event.target.value)}/></div><div className="grid gap-1"><Label htmlFor={`${prefix}-target-index`}>跟踪指数代码</Label><Input id={`${prefix}-target-index`} placeholder="如 980017.SZ" value={formTargetIndex} onChange={(event) => setFormTargetIndex(event.target.value)}/></div><div className="grid gap-1"><Label htmlFor={`${prefix}-purchase-date`}>开始持有日期</Label><Input id={`${prefix}-purchase-date`} type="date" value={formPurchaseDate} onChange={(event) => setFormPurchaseDate(event.target.value)}/></div><div className="grid gap-1"><Label htmlFor={`${prefix}-cost-nav`}>成本净值</Label><Input id={`${prefix}-cost-nav`} type="number" min="0" step="0.0001" value={formCostNav} onChange={(event) => setFormCostNav(event.target.value)}/></div><div className="grid gap-1"><Label htmlFor={`${prefix}-redemption-fee`}>当前赎回费率（%）</Label><Input id={`${prefix}-redemption-fee`} type="number" min="0" step="0.01" value={formRedemptionFee} onChange={(event) => setFormRedemptionFee(event.target.value)}/></div></div></details>

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">加载中...</span>
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center text-muted-foreground">
            <AlertCircle className="h-8 w-8 mx-auto mb-2" />
            <p>{error}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">持仓总览</h1>
          <p className="text-muted-foreground">
            {portfolio?.name ?? '投资组合'} · {holdings.length} 只持仓
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
            <DialogTrigger render={<Button variant="outline" size="sm" />}>
              <Settings2 className="mr-2 h-4 w-4" />
              同步计划
            </DialogTrigger>
            <DialogContent className="max-h-[90dvh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>持仓自动同步计划</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <label className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <span>
                    <span className="block font-medium">启用定时监控</span>
                    <span className="text-xs text-muted-foreground">按北京时间读取最新邮件并全量覆盖持仓</span>
                  </span>
                  <input type="checkbox" checked={scheduleEnabled} onChange={(e) => setScheduleEnabled(e.target.checked)} className="h-4 w-4 accent-primary" />
                </label>
                <div className="grid gap-2">
                  <Label>每日同步时间（北京时间）</Label>
                  {scheduleTimes.map((time, index) => (
                    <div className="flex items-center gap-2" key={`${index}-${time}`}>
                      <Clock3 className="h-4 w-4 text-muted-foreground" />
                      <Input type="time" value={time} onChange={(e) => setScheduleTimes((current) => current.map((item, itemIndex) => itemIndex === index ? e.target.value : item))} />
                      {scheduleTimes.length > 1 && <Button type="button" variant="ghost" size="sm" onClick={() => setScheduleTimes((current) => current.filter((_, itemIndex) => itemIndex !== index))}>移除</Button>}
                    </div>
                  ))}
                  {scheduleTimes.length < 4 && <Button type="button" variant="outline" size="sm" onClick={() => setScheduleTimes((current) => [...current, '18:00'])}>增加时间</Button>}
                </div>
              </div>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" size="sm" />}>取消</DialogClose>
                <Button size="sm" onClick={saveSchedule} disabled={isSavingSchedule || scheduleTimes.length === 0}>{isSavingSchedule ? '保存中...' : '保存计划'}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={riskOpen} onOpenChange={setRiskOpen}>
            <DialogTrigger render={<Button variant="outline" size="sm" />}><ShieldCheck className="mr-2 h-4 w-4"/>风险预算</DialogTrigger>
            <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
              <DialogHeader><DialogTitle>个人组合风险预算</DialogTitle></DialogHeader>
              <p className="text-sm leading-6 text-muted-foreground">目标仓位由这些硬约束计算。修改只影响下一次私有综合分析，不会自动交易。</p>
              <div className="grid gap-4 py-2 sm:grid-cols-2">
                <div className="grid gap-2"><Label>风险偏好</Label><Select value={riskBudget.riskProfile} onValueChange={(value) => setRiskBudget(current => ({ ...current, riskProfile: value ?? 'moderate' }))}><SelectTrigger><span>{riskBudget.riskProfile === 'conservative' ? '保守' : riskBudget.riskProfile === 'aggressive' ? '积极' : '稳健'}</span></SelectTrigger><SelectContent><SelectItem value="conservative">保守</SelectItem><SelectItem value="moderate">稳健</SelectItem><SelectItem value="aggressive">积极</SelectItem></SelectContent></Select></div>
                <div className="grid gap-2"><Label>投资期限</Label><Select value={riskBudget.investHorizon} onValueChange={(value) => setRiskBudget(current => ({ ...current, investHorizon: value ?? 'medium' }))}><SelectTrigger><span>{riskBudget.investHorizon === 'short' ? '短期' : riskBudget.investHorizon === 'long' ? '长期' : '中期'}</span></SelectTrigger><SelectContent><SelectItem value="short">短期</SelectItem><SelectItem value="medium">中期</SelectItem><SelectItem value="long">长期</SelectItem></SelectContent></Select></div>
                {[['minCashRatio','最低现金比例'],['maxIndustryRatio','单领域仓位上限'],['maxFundRatio','单基金仓位上限'],['maxSingleAdjustmentRatio','单次最大调整']].map(([key,label])=><div key={key} className="grid gap-2"><Label htmlFor={`risk-${key}`}>{label}</Label><div className="relative"><Input id={`risk-${key}`} type="number" min="0" max="100" step="1" className="pr-8" value={Number((riskBudget[key as keyof RiskBudget] as number) * 100).toFixed(0)} onChange={(event) => setRiskBudget(current => ({ ...current, [key]: Math.max(0, Math.min(100, Number(event.target.value))) / 100 }))}/><span className="absolute right-3 top-2.5 text-sm text-muted-foreground">%</span></div></div>)}
              </div>
              <label className="flex min-h-14 items-center justify-between gap-4 rounded-xl border p-4"><span><span className="block text-sm font-medium">分批调整</span><span className="mt-1 block text-xs text-muted-foreground">单次变化超过2个百分点时拆分为2—3批</span></span><input type="checkbox" checked={riskBudget.stagedAdjustment} onChange={(event) => setRiskBudget(current => ({ ...current, stagedAdjustment: event.target.checked }))} className="size-5 accent-primary"/></label>
              <DialogFooter><DialogClose render={<Button variant="outline" size="sm" />}>取消</DialogClose><Button size="sm" onClick={saveRiskBudget} disabled={isSavingRisk}>{isSavingRisk ? '保存中...' : '保存预算'}</Button></DialogFooter>
            </DialogContent>
          </Dialog>
          <Button variant="outline" size="sm" onClick={syncPortfolio} disabled={isSyncing}>
            <Mail className={`mr-2 h-4 w-4 ${isSyncing ? 'animate-pulse' : ''}`} />
            {isSyncing ? '同步中...' : '从邮箱同步'}
          </Button>
          <Button variant="outline" size="sm" onClick={fetchPortfolio} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger render={<Button size="sm" />}>
              <Plus className="mr-2 h-4 w-4" />
              添加持仓
            </DialogTrigger>
            <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>添加持仓</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3 py-2">
                <div className="grid gap-1">
                  <Label>ETF代码</Label>
                  <Input
                    placeholder="如 510300"
                    value={formTicker}
                    onChange={(e) => setFormTicker(e.target.value)}
                  />
                </div>
                {productMappingFields('add')}
                <div className="grid gap-1">
                  <Label>ETF名称</Label>
                  <Input
                    placeholder="如 沪深300ETF"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1">
                    <Label>持有份额</Label>
                    <Input
                      type="number"
                      placeholder="10000"
                      value={formQuantity}
                      onChange={(e) => setFormQuantity(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label>单位净值</Label>
                    <Input
                      type="number"
                      step="0.001"
                      placeholder="4.250"
                      value={formUnitNav}
                      onChange={(e) => setFormUnitNav(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid gap-1">
                  <Label>知识图谱产业领域（可选）</Label>
                  <Input
                    placeholder="如 AI算力硬件；留空由 AI 自动匹配"
                    value={formIndustryDomain}
                    onChange={(e) => setFormIndustryDomain(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" size="sm" />}>
                  取消
                </DialogClose>
                <Button size="sm" onClick={handleAdd}>
                  确认添加
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {(syncMessage || portfolio?.lastSyncedAt) && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{syncMessage ?? `最近同步：${new Date(portfolio!.lastSyncedAt!).toLocaleString('zh-CN')}`}</span>
          <span className="ml-auto hidden text-xs opacity-75 sm:inline">{portfolio?.lastSyncEmail ?? 'jozenlee@163.com'}</span>
        </div>
      )}

      {schedule && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock3 className="h-3.5 w-3.5" />
          <span>{schedule.enabled ? `自动同步：每天 ${schedule.syncTimes.join('、')}（北京时间）` : '自动同步已暂停'}</span>
          {schedule.lastError && <span className="text-destructive">最近失败：{schedule.lastError}</span>}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr_1fr_0.8fr]">
        <Card className="border-primary/20 bg-gradient-to-br from-primary/[0.08] via-card to-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">持仓总额</CardTitle>
            <PieChart className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight tabular-nums">{formatMoney(totalAssets)}</div>
            <div className="mt-4 space-y-2">
              <div className="flex h-2 overflow-hidden rounded-full bg-muted" aria-label="持仓市值与余额占比">
                <div className="bg-primary transition-[width] duration-300" style={{ width: `${investedRatio}%` }} />
                <div className="bg-amber-500 transition-[width] duration-300" style={{ width: `${cashRatio}%` }} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">持仓市值</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{formatMoney(totalMarketValue)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">余额</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{formatMoney(cashBalance)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">持仓数量</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{holdings.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Holdings Table */}
      {holdings.length > 0 ? (
        <Card>
          <CardHeader className="gap-3 border-b sm:flex sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>持仓明细</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">按基金类别归组，并以市值从高到低排列</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={categoryFilter} onValueChange={(value) => setCategoryFilter(value ?? 'all')}>
                <SelectTrigger size="sm" aria-label="筛选基金类别"><span>{categoryFilter === 'all' ? '全部类别' : categoryFilter}</span></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部类别</SelectItem>
                  {categories.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={sortMode} onValueChange={(value) => setSortMode(value ?? 'category')}>
                <SelectTrigger size="sm" aria-label="选择排序方式"><ArrowUpDown className="mr-1 h-3.5 w-3.5" /><span>{sortMode === 'marketValue' ? '市值优先' : '类别优先'}</span></SelectTrigger>
                <SelectContent>
                  <SelectItem value="category">类别优先</SelectItem>
                  <SelectItem value="marketValue">市值优先</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>基金代码</TableHead>
                  <TableHead>名称</TableHead>
                  <TableHead>基金类别</TableHead>
                  <TableHead>图谱产业领域</TableHead>
                  <TableHead className="text-right">持有份额</TableHead>
                  <TableHead className="text-right">单位净值</TableHead>
                  <TableHead className="text-right">市值</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleHoldings.map((h) => {
                  const marketValue = h.unitNav * h.quantity
                  const weight = totalAssets > 0 ? marketValue / totalAssets * 100 : 0
                  return (
                    <TableRow key={h.id} className="transition-colors hover:bg-muted/50">
                      <TableCell className="font-mono">{h.ticker}</TableCell>
                      <TableCell className="font-medium">{h.name}</TableCell>
                      <TableCell>
                        <Badge variant={h.category ? 'secondary' : 'outline'} className="max-w-48 truncate">
                          {h.category || '待识别'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex min-w-44 items-center gap-1.5">
                          <Badge variant={h.industryDomain ? 'secondary' : 'outline'} className="max-w-48 truncate">
                            {h.industryDomain || '待匹配'}
                          </Badge>
                          {h.industryDomainSource === 'ai' && <span className="text-[10px] text-muted-foreground">AI</span>}
                        </div>
                        {(h.targetEtfCode || h.targetIndexCode) && <p className="mt-1 font-mono text-[10px] text-muted-foreground">{h.targetEtfCode || '—'} · {h.targetIndexCode || '指数待补'}</p>}
                        {!h.targetEtfCode && !h.targetIndexCode && <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-300">{/ETF.*联接/i.test(h.name) ? '底层ETF待核验' : '穿透映射待补'}</p>}
                      </TableCell>
                      <TableCell className="text-right">{h.quantity.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{h.unitNav.toFixed(4)}</TableCell>
                      <TableCell className="text-right">
                        <div className="font-medium tabular-nums">{formatMoney(marketValue)}</div>
                        <div className="text-xs text-muted-foreground">{weight.toFixed(1)}%</div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`编辑 ${h.name}`}
                            onClick={() => openEdit(h)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`删除 ${h.name}`}
                            onClick={() => openDelete(h)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            </div>
            {visibleHoldings.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">该类别暂无持仓</p>}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center text-muted-foreground">
              <Briefcase className="h-10 w-10 mx-auto mb-3" />
              <p className="text-lg font-medium">暂无持仓</p>
              <p className="text-sm mt-1">点击《添加持仓》开始管理您的投资组合</p>
            <p className="mt-2 text-xs text-muted-foreground">也可以点击右上角《从邮箱同步》，读取支付宝业务凭证邮件</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>编辑持仓 - {selectedHolding?.name}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label>持有份额</Label>
                <Input
                  type="number"
                  value={formQuantity}
                  onChange={(e) => setFormQuantity(e.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <Label>单位净值</Label>
                <Input
                  type="number"
                  step="0.001"
                  value={formUnitNav}
                  onChange={(e) => setFormUnitNav(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-1">
              <Label>知识图谱产业领域</Label>
              <Input
                placeholder="如 AI算力硬件；留空则清除手动标注"
                value={formIndustryDomain}
                onChange={(e) => setFormIndustryDomain(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">同步或新增时会由 AI 自动匹配；手动填写后将优先保留。</p>
            </div>
            {productMappingFields('edit')}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>
              取消
            </DialogClose>
            <Button size="sm" onClick={handleEdit}>
              保存修改
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            确定要删除持仓 <strong>{selectedHolding?.name}</strong> ({selectedHolding?.ticker}) 吗？此操作不可撤销。
          </p>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>
              取消
            </DialogClose>
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
