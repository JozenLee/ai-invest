'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Building2,
  Users,
  Globe,
  AlertCircle,
} from 'lucide-react'
import { useMarketData } from '@/hooks/useMarketData'

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
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">仪表盘</h1>
          <p className="text-muted-foreground">
            市场概览与资金流向分析
          </p>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="text-xs">
              {source === 'loading' ? '加载中...' :
               source === 'akshare_realtime' ? '📊 AKShare实时数据' :
               source === 'akshare_cached' ? '📋 AKShare缓存数据(上一交易日)' :
               source === 'akshare' ? '📊 AKShare数据' :
               source === 'unavailable' ? '⚠️ 数据暂不可用' :
               source === 'yahoo' ? '🌐 Yahoo Finance' : '⏳ 等待数据'}
            </Badge>
            {lastUpdate && (
              <span className="text-xs text-muted-foreground">
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

      {/* 市场概览卡片 */}
      {indices.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {indices.map((index) => (
            <Card key={index.code}>
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

      {/* 资金流向概览 - 机构/散户/大盘 */}
      {capitalFlow ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            {/* 机构资金 */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">机构资金净流入</CardTitle>
                <Building2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${getChangeColor(capitalFlow.market.institutionalNet)}`}>
                  {capitalFlow.market.institutionalNet >= 0 ? '+' : ''}{formatNumber(capitalFlow.market.institutionalNet)}亿
                </div>
                <p className="text-xs text-muted-foreground">
                  占比 {capitalFlow.market.institutionalPct >= 0 ? '+' : ''}{formatNumber(capitalFlow.market.institutionalPct)}% · 主力资金动向
                </p>
              </CardContent>
            </Card>

            {/* 散户资金 */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">散户资金净流入</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${getChangeColor(capitalFlow.market.retailNet)}`}>
                  {capitalFlow.market.retailNet >= 0 ? '+' : ''}{formatNumber(capitalFlow.market.retailNet)}亿
                </div>
                <p className="text-xs text-muted-foreground">
                  占比 {capitalFlow.market.retailPct >= 0 ? '+' : ''}{formatNumber(capitalFlow.market.retailPct)}% · 散户资金动向
                </p>
              </CardContent>
            </Card>

            {/* 大盘总资金 */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">大盘资金净流入</CardTitle>
                <Globe className="h-4 w-4 text-muted-foreground" />
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
          </div>

          {/* Top10 资金流入板块 & Top10 资金流出板块 */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Top10 资金流入板块 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-red-500" />
                  Top10 资金流入板块
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
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingDown className="h-5 w-5 text-green-500" />
                  Top10 资金流出板块
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
        </>
      ) : (
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
  )
}
