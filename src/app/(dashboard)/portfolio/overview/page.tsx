'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  TrendingUp,
  TrendingDown,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  AlertCircle,
  Briefcase,
} from 'lucide-react'

interface Holding {
  id: string
  portfolioId: string
  ticker: string
  market: string
  name: string
  quantity: number
  avgCost: number
  currentPrice: number | null
  updatedAt: string
}

interface Portfolio {
  id: string
  userId: string
  name: string
  isDefault: boolean
  holdings: Holding[]
}

export default function PortfolioOverviewPage() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Dialog state
  const [addOpen, setAddOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [selectedHolding, setSelectedHolding] = useState<Holding | null>(null)

  // Form state
  const [formTicker, setFormTicker] = useState('')
  const [formName, setFormName] = useState('')
  const [formQuantity, setFormQuantity] = useState('')
  const [formAvgCost, setFormAvgCost] = useState('')
  const [formCurrentPrice, setFormCurrentPrice] = useState('')

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

  useEffect(() => {
    fetchPortfolio()
  }, [fetchPortfolio])

  // P&L calculations
  const calcPnL = (h: Holding) => {
    const current = h.currentPrice ?? h.avgCost
    const marketValue = current * h.quantity
    const costBasis = h.avgCost * h.quantity
    const pnl = marketValue - costBasis
    const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0
    return { marketValue, costBasis, pnl, pnlPct, current }
  }

  const totalMarketValue = holdings.reduce((sum, h) => sum + calcPnL(h).marketValue, 0)
  const totalCostBasis = holdings.reduce((sum, h) => sum + calcPnL(h).costBasis, 0)
  const totalPnL = totalMarketValue - totalCostBasis
  const totalPnLPct = totalCostBasis > 0 ? (totalPnL / totalCostBasis) * 100 : 0

  const resetForm = () => {
    setFormTicker('')
    setFormName('')
    setFormQuantity('')
    setFormAvgCost('')
    setFormCurrentPrice('')
  }

  const handleAdd = async () => {
    if (!portfolio || !formTicker || !formName || !formQuantity || !formAvgCost) return
    try {
      const res = await fetch(`/api/portfolio/${portfolio.id}/holdings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: formTicker,
          name: formName,
          quantity: parseInt(formQuantity),
          avgCost: parseFloat(formAvgCost),
          currentPrice: formCurrentPrice ? parseFloat(formCurrentPrice) : undefined,
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
    setFormAvgCost(String(h.avgCost))
    setFormCurrentPrice(h.currentPrice != null ? String(h.currentPrice) : '')
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
          quantity: parseInt(formQuantity),
          avgCost: parseFloat(formAvgCost),
          currentPrice: formCurrentPrice ? parseFloat(formCurrentPrice) : undefined,
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

  const pnlColor = (n: number) => (n >= 0 ? 'text-red-500' : 'text-green-500')

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
          <Button variant="outline" size="sm" onClick={fetchPortfolio} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger render={<Button size="sm" />}>
              <Plus className="mr-2 h-4 w-4" />
              添加持仓
            </DialogTrigger>
            <DialogContent>
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
                    <Label>平均成本</Label>
                    <Input
                      type="number"
                      step="0.001"
                      placeholder="4.250"
                      value={formAvgCost}
                      onChange={(e) => setFormAvgCost(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid gap-1">
                  <Label>当前价格 (可选)</Label>
                  <Input
                    type="number"
                    step="0.001"
                    placeholder="留空则使用成本价"
                    value={formCurrentPrice}
                    onChange={(e) => setFormCurrentPrice(e.target.value)}
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

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总市值</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatMoney(totalMarketValue)}</div>
            <p className="text-xs text-muted-foreground">
              成本 {formatMoney(totalCostBasis)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总盈亏</CardTitle>
            {totalPnL >= 0 ? (
              <TrendingUp className="h-4 w-4 text-red-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-green-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${pnlColor(totalPnL)}`}>
              {totalPnL >= 0 ? '+' : ''}{formatMoney(totalPnL)}
            </div>
            <p className={`text-xs ${pnlColor(totalPnL)}`}>
              {totalPnLPct >= 0 ? '+' : ''}{totalPnLPct.toFixed(2)}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">持仓数量</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{holdings.length}</div>
            <p className="text-xs text-muted-foreground">只ETF</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">盈亏比例</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${pnlColor(totalPnLPct)}`}>
              {totalPnLPct >= 0 ? '+' : ''}{totalPnLPct.toFixed(2)}%
            </div>
            <p className="text-xs text-muted-foreground">
              {holdings.filter(h => calcPnL(h).pnl >= 0).length} 盈 / {holdings.filter(h => calcPnL(h).pnl < 0).length} 亏
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Holdings Table */}
      {holdings.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>持仓明细</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ETF代码</TableHead>
                  <TableHead>名称</TableHead>
                  <TableHead className="text-right">持有份额</TableHead>
                  <TableHead className="text-right">平均成本</TableHead>
                  <TableHead className="text-right">当前价格</TableHead>
                  <TableHead className="text-right">市值</TableHead>
                  <TableHead className="text-right">盈亏</TableHead>
                  <TableHead className="text-right">盈亏%</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {holdings.map((h) => {
                  const { marketValue, pnl, pnlPct, current } = calcPnL(h)
                  return (
                    <TableRow key={h.id}>
                      <TableCell className="font-mono">{h.ticker}</TableCell>
                      <TableCell className="font-medium">{h.name}</TableCell>
                      <TableCell className="text-right">{h.quantity.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{h.avgCost.toFixed(3)}</TableCell>
                      <TableCell className="text-right">{current.toFixed(3)}</TableCell>
                      <TableCell className="text-right">{formatMoney(marketValue)}</TableCell>
                      <TableCell className={`text-right font-medium ${pnlColor(pnl)}`}>
                        {pnl >= 0 ? '+' : ''}{formatMoney(pnl)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={pnl >= 0 ? 'destructive' : 'default'} className={pnl >= 0 ? '' : 'bg-green-600 text-white hover:bg-green-700'}>
                          {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => openEdit(h)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
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
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center text-muted-foreground">
              <Briefcase className="h-10 w-10 mx-auto mb-3" />
              <p className="text-lg font-medium">暂无持仓</p>
              <p className="text-sm mt-1">点击"添加持仓"开始管理您的投资组合</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
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
                <Label>平均成本</Label>
                <Input
                  type="number"
                  step="0.001"
                  value={formAvgCost}
                  onChange={(e) => setFormAvgCost(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-1">
              <Label>当前价格 (可选)</Label>
              <Input
                type="number"
                step="0.001"
                value={formCurrentPrice}
                onChange={(e) => setFormCurrentPrice(e.target.value)}
              />
            </div>
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
        <DialogContent>
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
