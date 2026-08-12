import { Badge } from '@/components/ui/badge'

interface MarketInstrumentData {
  code: string
  name?: string
  current_price?: number
  price_change_pct?: number
  daily_change_pct?: number  // 新增：当日涨跌幅
  trend: string
  data_points?: number
  is_fallback?: boolean

  // 趋势指标
  ma5?: number
  ma10?: number
  ma20?: number
  ma60?: number
  macd?: { dif: number; dea: number; macd: number }
  boll?: { upper: number; mid: number; lower: number; bandwidth?: number; percent_b?: number }
  dmi?: { pdi: number; mdi: number; adx: number; adxr?: number }

  // 动量指标
  rsi?: number
  kdj?: { k: number; d: number; j: number }
  cci?: number
  wr?: number

  // 成交量指标
  obv?: number
  vol_ma5?: number
  vol_ma20?: number

  // 稳定性指标
  volatility?: number
  max_drawdown?: number
}

interface MarketInstrumentCardProps {
  data: MarketInstrumentData
  type: 'etf' | 'index'
}

export function MarketInstrumentCard({ data, type }: MarketInstrumentCardProps) {
  const priceChangePct = data.price_change_pct ?? 0
  const dailyChangePct = data.daily_change_pct ?? null
  const displayName = data.name || data.code
  const priceLabel = type === 'etf' ? '当前价格' : '当前点位'
  const pricePrefix = type === 'etf' ? '¥' : ''

  return (
    <div className="p-3 rounded-lg border space-y-3">
      {/* 头部：名称、代码 */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="font-medium">{displayName}</div>
          <div className="text-xs text-muted-foreground">{data.code}</div>
        </div>
        <Badge variant="secondary" className="text-xs">{data.trend}</Badge>
      </div>

      {/* 价格信息 */}
      {data.current_price != null && (
        <div className="text-sm">
          <span className="text-muted-foreground">{priceLabel}: </span>
          <span className="font-medium">
            {pricePrefix}{type === 'etf' ? data.current_price.toFixed(3) : data.current_price.toFixed(2)}
          </span>
        </div>
      )}

      {/* 涨跌幅：当日和期间 */}
      <div className="space-y-1.5">
        {dailyChangePct != null && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">当日涨跌:</span>
            <span className={`text-sm font-semibold ${dailyChangePct >= 0 ? 'text-red-600' : 'text-green-600'}`}>
              {dailyChangePct >= 0 ? '+' : ''}{dailyChangePct.toFixed(2)}%
            </span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">期间涨跌:</span>
          <span className={`text-sm ${priceChangePct >= 0 ? 'text-red-600' : 'text-green-600'}`}>
            {priceChangePct >= 0 ? '+' : ''}{priceChangePct.toFixed(2)}%
          </span>
        </div>
      </div>

      {/* 关键指标 */}
      <div className="space-y-2 text-xs">
        {/* 均线 */}
        {(data.ma5 != null || data.ma20 != null) && (
          <div className="p-2 bg-muted/50 rounded space-y-1">
            <div className="font-medium">移动平均线</div>
            {data.ma5 != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">MA5:</span>
                <span>{data.ma5.toFixed(3)}</span>
              </div>
            )}
            {data.ma20 != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">MA20:</span>
                <span>{data.ma20.toFixed(3)}</span>
              </div>
            )}
          </div>
        )}

        {/* RSI */}
        {data.rsi != null && (
          <div className="p-2 bg-muted/50 rounded space-y-1">
            <div className="font-medium">RSI</div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">相对强弱:</span>
              <span className={data.rsi > 70 ? 'text-orange-600' : data.rsi < 30 ? 'text-blue-600' : ''}>
                {data.rsi.toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {/* MACD */}
        {data.macd && (
          <div className="p-2 bg-muted/50 rounded space-y-1">
            <div className="font-medium">MACD</div>
            {data.macd.dif != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">DIF:</span>
                <span>{data.macd.dif.toFixed(4)}</span>
              </div>
            )}
            {data.macd.dea != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">DEA:</span>
                <span>{data.macd.dea.toFixed(4)}</span>
              </div>
            )}
          </div>
        )}

        {/* 稳定性 */}
        {(data.volatility != null || data.max_drawdown != null) && (
          <div className="p-2 bg-muted/50 rounded space-y-1">
            <div className="font-medium">稳定性</div>
            {data.volatility != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">波动率:</span>
                <span>{data.volatility.toFixed(2)}%</span>
              </div>
            )}
            {data.max_drawdown != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">最大回撤:</span>
                <span className={Math.abs(data.max_drawdown) > 20 ? 'text-green-600' : 'text-red-600'}>
                  {data.max_drawdown.toFixed(2)}%
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 数据质量标记 */}
      {(data.data_points != null || data.is_fallback) && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t">
          {data.data_points != null && (
            <span>{data.data_points}个交易日</span>
          )}
          {data.is_fallback && (
            <Badge variant="outline" className="text-xs">
              模拟数据
            </Badge>
          )}
        </div>
      )}
    </div>
  )
}
