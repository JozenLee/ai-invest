'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Building2,
  Users,
  Globe,
  AlertCircle,
  Info,
  Clock,
} from 'lucide-react'
import { useMarketData } from '@/hooks/useMarketData'

// 数据说明配置
const dataTooltips = {
  indexPrice: {
    title: '指数行情',
    description: '主要宽基指数的实时/最新收盘价格。',
    calculation: '数据来源：AKShare (东方财富)。显示最新价、涨跌额和涨跌幅百分比。',
  },
  institutional: {
    title: '机构/主力资金',
    description: '反映机构投资者的资金动向，是判断市场主力方向的重要指标。',
    calculation: '主力净流入 = 超大单净流入 + 大单净流入。占比 = 主力净流入绝对值 / (|主力净流入| + |散户净流入|) × 100%。',
  },
  retail: {
    title: '散户资金',
    description: '反映中小投资者的资金动向，与主力资金形成对比可判断市场分歧。',
    calculation: '散户净流入 = 中单净流入 + 小单净流入。散户与主力方向相反时，表示市场分歧较大。',
  },
  northbound: {
    title: '北向资金',
    description: '通过沪股通和深股通流入A股的境外资金，被称为"聪明钱"，对市场趋势有领先指示作用。',
    calculation: '北向资金净流入 = 沪股通净流入 + 深股通净流入。数据来源：东方财富互联互通数据。非交易时段显示最近交易日收盘数据。',
  },
  totalNet: {
    title: '大盘资金净流入',
    description: '沪深两市整体资金净流向，正值表示资金净流入，负值表示资金净流出。',
    calculation: '大盘资金净流入 = 主力净流入 + 散户净流入（中单+小单）。反映市场整体资金面状况。',
  },
  sentiment: {
    title: '市场情绪指数',
    description: '综合多维度指标计算的市场情绪评分，用于判断市场整体情绪。',
    calculation: '基于三个维度：主力资金流向(40%)、北向资金流向(35%)、主力散户分歧(25%)。50为中性，>60偏乐观，>75高度乐观，<40偏悲观，<25高度悲观。',
  },
  sectorInflow: {
    title: '板块资金流入排名',
    description: '当日主力资金净流入最多的行业板块，反映市场热点方向。',
    calculation: '按行业分类统计主力净流入金额，取Top10。数据来源：东方财富行业资金流向。',
  },
  sectorOutflow: {
    title: '板块资金流出排名',
    description: '当日主力资金净流出最多的行业板块，反映市场回避方向。',
    calculation: '按行业分类统计主力净流出金额，取Top10。数据来源：东方财富行业资金流向。',
  },
}

// Info按钮组件
function InfoButton({ tooltip }: { tooltip: keyof typeof dataTooltips }) {
  const info = dataTooltips[tooltip]
  return (
    <Tooltip>
      <TooltipTrigger className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-muted hover:bg-muted-foreground/20 transition-colors">
        <Info className="h-3 w-3 text-muted-foreground" />
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end" className="max-w-xs p-3">
        <div className="space-y-1.5">
          <p className="font-semibold text-sm">{info.title}</p>
          <p className="text-xs text-muted-foreground">{info.description}</p>
          <div className="pt-1.5 border-t border-muted-foreground/20">
            <p className="text-xs"><span className="font-medium">计算方法：</span>{info.calculation}</p>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

export default function DashboardPage() {
  const { indices, capitalFlow, isLoading, error, source, lastUpdate, refetch } = useMarketData()

  const formatNumber = (num: number, decimals = 2) => {
    return num.toFixed(decimals)
  }

  const getChangeColor = (change: number) => {
    return change >= 0 ? 'text-red-500' : 'text-green-500'
  }

  const getChangeSymbol = (change: number) => {
    return change >= 0 ? '▲' : '▼'
  }

  return (
    <TooltipProvider>
      <div className="space-y-8">
        {/* 页面标题 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">仪表盘</h1>
            <p className="text-muted-foreground mt-1">
              市场概览与资金流向分析
            </p>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline" className="text-xs">
                {source === 'loading' ? '加载中...' :
                 source === 'akshare_realtime' ? '📊 AKShare实时数据' :
                 source === 'akshare_cached' ? '📋 AKShare缓存数据(上一交易日)' :
                 source === 'akshare' ? '📊 AKShare数据' :
                 source === 'unavailable' ? '⚠️ 数据暂不可用' :
                 source === 'yahoo' ? '🌐 Yahoo Finance' : '⏳ 等待数据'}
              </Badge>
              {lastUpdate && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {lastUpdate.toLocaleString('zh-CN')} 更新
                </span>
              )}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refetch}
            disabled={isLoading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            刷新数据
          </Button>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="rounded-lg bg-yellow-50 p-4 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              <p className="text-sm font-medium">数据获取失败</p>
            </div>
            <p className="text-sm mt-1">{error}</p>
            <p className="text-xs mt-2 text-yellow-600 dark:text-yellow-400">
              请确认 Python 数据服务已启动：cd data-service && python main.py
            </p>
          </div>
        )}

        {/* 第一区域：市场指数概览 */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-lg font-semibold">📊 市场指数</h2>
            <InfoButton tooltip="indexPrice" />
          </div>
          {indices.length > 0 ? (
            <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
              {indices.map((index) => (
                <Card key={index.code} className="hover:shadow-md transition-shadow">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{index.name}</CardTitle>
                    {index.changePct >= 0 ? (
                      <TrendingUp className="h-4 w-4 text-red-500" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-green-500" />
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatNumber(index.price)}</div>
                    <p className={`text-xs ${getChangeColor(index.changePct)}`}>
                      {getChangeSymbol(index.changePct)} {formatNumber(Math.abs(index.changePct))}%
                      ({formatNumber(Math.abs(index.change))})
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center py-8">
                <div className="text-center text-muted-foreground">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                  <p>暂无指数数据</p>
                  <p className="text-xs mt-1">请确认数据服务已启动</p>
                </div>
              </CardContent>
            </Card>
          )}
        </section>

        {/* 第二区域：资金流向 */}
        {capitalFlow && (
          <section>
            <h2 className="text-lg font-semibold mb-4">💰 资金流向</h2>
            <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
              {/* 机构资金 */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">机构资金</CardTitle>
                  <div className="flex items-center gap-1">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <InfoButton tooltip="institutional" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${getChangeColor(capitalFlow.market.institutionalNet)}`}>
                    {capitalFlow.market.institutionalNet >= 0 ? '+' : ''}{formatNumber(capitalFlow.market.institutionalNet)}亿
                  </div>
                  <p className="text-xs text-muted-foreground">
                    占比 {capitalFlow.market.institutionalPct >= 0 ? '+' : ''}{formatNumber(capitalFlow.market.institutionalPct)}%
                  </p>
                </CardContent>
              </Card>

              {/* 散户资金 */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">散户资金</CardTitle>
                  <div className="flex items-center gap-1">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <InfoButton tooltip="retail" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${getChangeColor(capitalFlow.market.retailNet)}`}>
                    {capitalFlow.market.retailNet >= 0 ? '+' : ''}{formatNumber(capitalFlow.market.retailNet)}亿
                  </div>
                  <p className="text-xs text-muted-foreground">
                    占比 {capitalFlow.market.retailPct >= 0 ? '+' : ''}{formatNumber(capitalFlow.market.retailPct)}%
                  </p>
                </CardContent>
              </Card>

              {/* 北向资金 */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">北向资金</CardTitle>
                  <div className="flex items-center gap-1">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <InfoButton tooltip="northbound" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${getChangeColor(capitalFlow.northbound?.net || 0)}`}>
                    {(capitalFlow.northbound?.net || 0) >= 0 ? '+' : ''}{formatNumber(capitalFlow.northbound?.net || 0)}亿
                  </div>
                  <p className="text-xs text-muted-foreground">
                    沪股通 {formatNumber(capitalFlow.northbound?.shConnect || 0)}亿 · 深股通 {formatNumber(capitalFlow.northbound?.szConnect || 0)}亿
                  </p>
                  {capitalFlow.northbound?.stale && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {capitalFlow.northbound.dataDate || '上一交易日'}收盘数据
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* 大盘总资金 */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">大盘总资金</CardTitle>
                  <div className="flex items-center gap-1">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    <InfoButton tooltip="totalNet" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${getChangeColor(capitalFlow.market.totalNet)}`}>
                    {capitalFlow.market.totalNet >= 0 ? '+' : ''}{formatNumber(capitalFlow.market.totalNet)}亿
                  </div>
                  <p className="text-xs text-muted-foreground">
                    沪深两市资金净流向
                  </p>
                </CardContent>
              </Card>

              {/* 市场情绪 */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">市场情绪</CardTitle>
                  <div className="flex items-center gap-1">
                    <AlertCircle className="h-4 w-4 text-muted-foreground" />
                    <InfoButton tooltip="sentiment" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${
                    (capitalFlow.market.sentiment || 50) >= 60 ? 'text-red-500' :
                    (capitalFlow.market.sentiment || 50) <= 40 ? 'text-green-500' : 'text-gray-500'
                  }`}>
                    {capitalFlow.market.sentiment || 50}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {(capitalFlow.market.sentiment || 50) >= 75 ? '🟢 高度乐观' :
                     (capitalFlow.market.sentiment || 50) >= 60 ? '🟡 偏乐观' :
                     (capitalFlow.market.sentiment || 50) >= 40 ? '⚪ 中性' :
                     (capitalFlow.market.sentiment || 50) >= 25 ? '🟡 偏悲观' : '🔴 高度悲观'}
                  </p>
                </CardContent>
              </Card>
            </div>
          </section>
        )}

        {/* 第三区域：板块资金流向 */}
        {capitalFlow && (capitalFlow.topInflowSectors.length > 0 || capitalFlow.topOutflowSectors.length > 0) && (
          <section>
            <h2 className="text-lg font-semibold mb-4">📈 板块资金流向</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Top10 资金流入板块 */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-red-500" />
                    Top10 资金流入板块
                    <InfoButton tooltip="sectorInflow" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground border-b pb-2">
                      <div className="flex items-center gap-3">
                        <span className="w-6 text-center">排名</span>
                        <span className="w-20">板块</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="w-20 text-right">净流入(亿)</span>
                        <span className="w-16 text-right">涨跌幅</span>
                      </div>
                    </div>
                    {capitalFlow.topInflowSectors.map((sector, index) => (
                      <div key={sector.sector} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className={`text-sm font-medium w-6 text-center ${index < 3 ? 'text-red-500 font-bold' : 'text-muted-foreground'}`}>
                            {index + 1}
                          </span>
                          <span className="font-medium w-20">{sector.sector}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-sm font-medium w-20 text-right text-red-500">
                            +{formatNumber(sector.netFlow)}
                          </span>
                          <span className={`text-sm w-16 text-right ${getChangeColor(sector.changePct)}`}>
                            {getChangeSymbol(sector.changePct)}{formatNumber(Math.abs(sector.changePct))}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Top10 资金流出板块 */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingDown className="h-5 w-5 text-green-500" />
                    Top10 资金流出板块
                    <InfoButton tooltip="sectorOutflow" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground border-b pb-2">
                      <div className="flex items-center gap-3">
                        <span className="w-6 text-center">排名</span>
                        <span className="w-20">板块</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="w-20 text-right">净流出(亿)</span>
                        <span className="w-16 text-right">涨跌幅</span>
                      </div>
                    </div>
                    {capitalFlow.topOutflowSectors.map((sector, index) => (
                      <div key={sector.sector} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className={`text-sm font-medium w-6 text-center ${index < 3 ? 'text-green-500 font-bold' : 'text-muted-foreground'}`}>
                            {index + 1}
                          </span>
                          <span className="font-medium w-20">{sector.sector}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-sm font-medium w-20 text-right text-green-500">
                            {formatNumber(sector.netFlow)}
                          </span>
                          <span className={`text-sm w-16 text-right ${getChangeColor(sector.changePct)}`}>
                            {getChangeSymbol(sector.changePct)}{formatNumber(Math.abs(sector.changePct))}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>
        )}

        {/* 无数据时的提示 */}
        {!capitalFlow && !isLoading && (
          <Card>
            <CardContent className="flex items-center justify-center py-8">
              <div className="text-center text-muted-foreground">
                <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                <p>暂无资金流向数据</p>
                <p className="text-xs mt-1">请确认数据服务已启动</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </TooltipProvider>
  )
}
