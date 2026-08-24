import { Badge } from '@/components/ui/badge'

interface MarketInstrumentData {
  code: string
  name?: string
  current_price?: number
  price_change_pct?: number
  daily_change_pct?: number
  trend?: string
  data_points?: number
  is_fallback?: boolean
  ma5?: number
  ma10?: number
  ma20?: number
  ma60?: number
  macd?: { dif?: number; dea?: number; macd?: number }
  boll?: { upper?: number; mid?: number; lower?: number; bandwidth?: number; percent_b?: number }
  dmi?: { pdi?: number; mdi?: number; adx?: number; adxr?: number }
  rsi?: number
  kdj?: { k?: number; d?: number; j?: number }
  cci?: number
  wr?: number
  obv?: number
  vol_ma5?: number
  vol_ma20?: number
  volatility?: number
  max_drawdown?: number
}

interface MarketInstrumentCardProps {
  data: MarketInstrumentData
  type: 'etf' | 'index'
}

const positiveClass = 'text-red-600'
const negativeClass = 'text-green-600'
const neutralClass = 'text-foreground'

function trendLabel(value?: string) {
  const trend = String(value || '').toLowerCase()
  if (trend.includes('bullish') || trend.includes('strong_up') || trend.includes('uptrend') || trend.includes('上涨') || trend.includes('看涨')) return '偏强'
  if (trend.includes('bearish') || trend.includes('strong_down') || trend.includes('downtrend') || trend.includes('下跌') || trend.includes('看跌')) return '偏弱'
  return '震荡'
}

function signed(value: number, digits = 2) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`
}

function ValueRow({ label, value, className = neutralClass }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}:</span>
      <span className={className}>{value}</span>
    </div>
  )
}

export function MarketInstrumentCard({ data, type }: MarketInstrumentCardProps) {
  const priceChangePct = data.price_change_pct
  const dailyChangePct = data.daily_change_pct
  const displayName = data.name || data.code
  const trend = trendLabel(data.trend)
  const priceLabel = type === 'etf' ? '当前价格' : '当前点位'
  const pricePrefix = type === 'etf' ? '¥' : ''
  const macdClass = data.macd?.dif == null || data.macd?.dea == null
    ? neutralClass
    : data.macd.dif > data.macd.dea ? positiveClass : negativeClass
  const rsiClass = data.rsi == null ? neutralClass : data.rsi < 30 ? positiveClass : data.rsi > 70 ? negativeClass : neutralClass
  const kdjClass = data.kdj?.k == null || data.kdj?.d == null
    ? neutralClass
    : data.kdj.k > data.kdj.d ? positiveClass : negativeClass
  const cciClass = data.cci == null ? neutralClass : data.cci > 100 ? positiveClass : data.cci < -100 ? negativeClass : neutralClass
  const wrClass = data.wr == null ? neutralClass : data.wr < -80 ? positiveClass : data.wr > -20 ? negativeClass : neutralClass
  const volatilityClass = data.volatility == null ? neutralClass : data.volatility > 30 ? negativeClass : neutralClass
  const drawdownClass = data.max_drawdown == null ? neutralClass : negativeClass

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{displayName}</div>
          <div className="text-xs text-muted-foreground">{data.code}</div>
        </div>
        <Badge variant="secondary" className="shrink-0 text-xs">{trend}</Badge>
      </div>

      {data.current_price != null && (
        <ValueRow
          label={priceLabel}
          value={`${pricePrefix}${data.current_price.toFixed(type === 'etf' ? 3 : 2)}`}
        />
      )}

      {(dailyChangePct != null || priceChangePct != null) && (
        <div className="space-y-1.5">
          {dailyChangePct != null && <ValueRow label="当日涨跌" value={`${signed(dailyChangePct)}%`} className={dailyChangePct > 0 ? positiveClass : dailyChangePct < 0 ? negativeClass : neutralClass} />}
          {priceChangePct != null && <ValueRow label="期间涨跌" value={`${signed(priceChangePct)}%`} className={priceChangePct > 0 ? positiveClass : priceChangePct < 0 ? negativeClass : neutralClass} />}
        </div>
      )}

      {(data.ma5 != null || data.ma10 != null || data.ma20 != null || data.ma60 != null) && (
        <div className="space-y-1 rounded-md bg-muted/50 p-2 text-xs">
          <div className="font-medium">均线指标</div>
          {data.ma5 != null && <ValueRow label="MA5" value={data.ma5.toFixed(3)} />}
          {data.ma10 != null && <ValueRow label="MA10" value={data.ma10.toFixed(3)} />}
          {data.ma20 != null && <ValueRow label="MA20" value={data.ma20.toFixed(3)} />}
          {data.ma60 != null && <ValueRow label="MA60" value={data.ma60.toFixed(3)} />}
        </div>
      )}

      {data.macd && (data.macd.dif != null || data.macd.dea != null || data.macd.macd != null) && (
        <div className="space-y-1 rounded-md bg-muted/50 p-2 text-xs">
          <div className="font-medium">MACD</div>
          {data.macd.dif != null && <ValueRow label="DIF" value={data.macd.dif.toFixed(4)} />}
          {data.macd.dea != null && <ValueRow label="DEA" value={data.macd.dea.toFixed(4)} />}
          {data.macd.macd != null && <ValueRow label="柱值" value={data.macd.macd.toFixed(4)} className={macdClass} />}
        </div>
      )}

      {data.rsi != null && (
        <div className="space-y-1 rounded-md bg-muted/50 p-2 text-xs">
          <div className="font-medium">RSI</div>
          <ValueRow label="相对强弱" value={data.rsi.toFixed(2)} className={rsiClass} />
        </div>
      )}

      {data.kdj && (data.kdj.k != null || data.kdj.d != null || data.kdj.j != null) && (
        <div className="space-y-1 rounded-md bg-muted/50 p-2 text-xs">
          <div className="font-medium">KDJ</div>
          {data.kdj.k != null && <ValueRow label="K值" value={data.kdj.k.toFixed(2)} className={kdjClass} />}
          {data.kdj.d != null && <ValueRow label="D值" value={data.kdj.d.toFixed(2)} />}
          {data.kdj.j != null && <ValueRow label="J值" value={data.kdj.j.toFixed(2)} />}
        </div>
      )}

      {(data.cci != null || data.wr != null) && (
        <div className="space-y-1 rounded-md bg-muted/50 p-2 text-xs">
          <div className="font-medium">动量指标</div>
          {data.cci != null && <ValueRow label="CCI" value={data.cci.toFixed(2)} className={cciClass} />}
          {data.wr != null && <ValueRow label="WR" value={data.wr.toFixed(2)} className={wrClass} />}
        </div>
      )}

      {(data.volatility != null || data.max_drawdown != null) && (
        <div className="space-y-1 rounded-md bg-muted/50 p-2 text-xs">
          <div className="font-medium">风险指标</div>
          {data.volatility != null && <ValueRow label="波动率" value={`${data.volatility.toFixed(2)}%`} className={volatilityClass} />}
          {data.max_drawdown != null && <ValueRow label="最大回撤" value={`${data.max_drawdown.toFixed(2)}%`} className={drawdownClass} />}
        </div>
      )}

      {(data.obv != null || data.vol_ma5 != null || data.vol_ma20 != null) && (
        <div className="space-y-1 rounded-md bg-muted/50 p-2 text-xs">
          <div className="font-medium">成交量指标</div>
          {data.obv != null && <ValueRow label="OBV" value={data.obv.toLocaleString()} />}
          {data.vol_ma5 != null && <ValueRow label="量均线 MA5" value={data.vol_ma5.toLocaleString()} />}
          {data.vol_ma20 != null && <ValueRow label="量均线 MA20" value={data.vol_ma20.toLocaleString()} />}
        </div>
      )}

      {(data.data_points != null || data.is_fallback) && (
        <div className="flex items-center gap-2 border-t pt-2 text-xs text-muted-foreground">
          {data.data_points != null && <span>{data.data_points}个交易日</span>}
          {data.is_fallback && <Badge variant="outline" className="text-xs">模拟数据</Badge>}
        </div>
      )}
    </div>
  )
}
