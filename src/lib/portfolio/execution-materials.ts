import { validateProductExecution, type ProductExecutionInput, type ProductEvidence, type ExecutionFact, type ProductType } from './product-research'

const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('执行资料必须为对象')
  return v as Record<string, unknown>
}
const text = (v: unknown, field: string): string => {
  if (typeof v !== 'string' || !v.trim() || v.length>2000) throw new Error(`${field}须为非空文本`)
  return v.trim()
}
const number = (v: unknown, field: string, max=Infinity): number => {
  if (typeof v!=='number' || !Number.isFinite(v) || v<0 || v>max) throw new Error(`${field}数值无效`)
  return v
}
const time = (v: unknown, field: string): string => {
  const s=text(v,field)
  if (!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(s) || !Number.isFinite(Date.parse(s))) throw new Error(`${field}需要带时区时间`)
  return s
}

/** User-provided supporting records are validated structurally, not certified by the server. */
export function parseExecutionMaterial(value: unknown, holding: {ticker:string;quantity:number}, expectedType: ProductType, now: string): ProductExecutionInput {
  const v=object(value),ticker=text(v.ticker,'ticker'),asOf=time(v.asOf,'asOf')
  if (ticker!==holding.ticker || !/^\d{6}$/.test(ticker) || holding.quantity<=0) throw new Error('基金不属于当前有效持仓')
  if (v.productType!==expectedType || !['etf','feeder','active','index','index-enhanced'].includes(expectedType)) throw new Error('执行类型与当前基金研究类型不符或类型尚未确认')
  if (v.side!=='buy' && v.side!=='sell') throw new Error('side须为buy或sell')
  if (Date.parse(asOf)>Date.parse(now)) throw new Error('观察时间不能晚于服务器当前时间')
  const evidence=(value:unknown):ProductEvidence=>{
    const e=object(value),observedAt=time(e.observedAt,'evidence.observedAt')
    if (Date.parse(observedAt)>Date.parse(asOf)) throw new Error('证据观察时间晚于资料观察时间')
    const url=e.url == null ? null : text(e.url,'evidence.url'),locator=e.locator == null ? undefined : text(e.locator,'evidence.locator')
    if (!url && !locator) throw new Error('证据须有来源链接或凭证定位说明')
    if (url) { const u=new URL(url); if (!['https:','http:'].includes(u.protocol) || u.username || u.password) throw new Error('来源链接无效') }
    const date=(value:unknown):string|null=>{
      if(value == null) return null
      const s=text(value,'证据日期'),d=s.slice(0,10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(Date.parse(s)) || new Date(d).toISOString().slice(0,10)!==d || d>new Date(Date.parse(asOf)+8*3600000).toISOString().slice(0,10)) throw new Error('证据日期无效或来自未来')
      return s
    }
    return {id:text(e.id,'evidence.id'),source:text(e.source,'evidence.source'),url,locator,observedAt,publishedAt:date(e.publishedAt),dataDate:date(e.dataDate)}
  }
  const fact=<T>(value:unknown,parse:(value:unknown)=>T):ExecutionFact<T>=>{
    const f=object(value),validUntil=time(f.validUntil,'validUntil')
    if (Date.parse(validUntil)<=Date.parse(now)) throw new Error('执行资料已经失效')
    return {value:parse(f.value),evidence:evidence(f.evidence),validUntil}
  }
  const fee=(v:unknown)=>{const f=object(v);return {ratePct:number(f.ratePct,'费率',100),fixedAmount:number(f.fixedAmount,'固定费用')}}
  const input:ProductExecutionInput={ticker,productType:expectedType,asOf,side:v.side}
  const boundLiveFact=<T>(f:ExecutionFact<T>,maxAgeMs:number)=>{
    const expiry=Math.min(Date.parse(f.validUntil),Date.parse(f.evidence.observedAt)+maxAgeMs)
    if(expiry<=Date.parse(now))throw new Error('交易状态或报价已经过期，需更新渠道资料')
    f.validUntil=new Date(expiry).toISOString()
  }
  if(expectedType==='etf'){
    if(v.otc!==undefined) throw new Error('场内ETF不能提交场外申赎资料')
    const e=object(v.exchange)
    input.exchange={
      quote:fact(e.quote,v=>{const q=object(v);return {bid:number(q.bid,'bid'),ask:number(q.ask,'ask'),availableQuantity:number(q.availableQuantity,'可成交数量')}}),
      status:fact(e.status,v=>{if(v!=='open'&&v!=='suspended')throw new Error('场内状态无效');return v}),
      commission:fact(e.commission,v=>{const f=object(v);return {ratePct:number(f.ratePct,'佣金',100),minimumAmount:number(f.minimumAmount,'最低佣金')}}),
      settlement:fact(e.settlement,v=>text(v,'结算规则')),
    }
    if(Date.parse(now)-Date.parse(input.exchange.quote!.evidence.observedAt)>300000)throw new Error('场内报价超过5分钟，需更新')
    boundLiveFact(input.exchange.quote!,300000)
    boundLiveFact(input.exchange.status!,300000)
  }else{
    if(v.exchange!==undefined) throw new Error('场外基金不能使用场内报价资料')
    const o=object(v.otc)
    input.otc={channel:text(o.channel,'渠道'),
      status:fact(o.status,v=>{if(v!=='open'&&v!=='suspended'&&v!=='limited')throw new Error('申赎状态无效');return v}),
      cutoff:fact(o.cutoff,v=>text(v,'截止规则')),
      settlement:fact(o.settlement,v=>{const s=object(v),days=s.cashArrivalBusinessDays==null?null:number(s.cashArrivalBusinessDays,'到账工作日数',365);if(days!==null&&!Number.isInteger(days))throw new Error('到账工作日数应为整数');return {confirmation:text(s.confirmation,'确认安排'),cashArrival:text(s.cashArrival,'到账安排'),cashArrivalBusinessDays:days}}),
    }
    boundLiveFact(input.otc.status!,86400000)
    if(v.side==='buy')input.otc.subscriptionFee=fact(o.subscriptionFee,fee)
    else{
      if(!Array.isArray(o.lots)||!o.lots.length||o.lots.length>200)throw new Error('赎回需要1–200个批次')
      input.otc.redemptionQuantity=number(o.redemptionQuantity,'赎回数量',holding.quantity)
      input.otc.lots=o.lots.map(value=>{const l=object(value),acquiredAt=text(l.acquiredAt,'取得日期');if(!Number.isFinite(Date.parse(acquiredAt))||Date.parse(acquiredAt)>Date.parse(asOf))throw new Error('批次取得日期无效');return {id:text(l.id,'批次编号'),quantity:number(l.quantity,'批次数量',holding.quantity),acquiredAt,evidence:evidence(l.evidence),fee:fact(l.fee,fee)}})
      if(input.otc.lots.reduce((sum,l)=>sum+l.quantity,0)>holding.quantity+1e-8)throw new Error('所录入批次总数量超过当前持仓')
    }
  }
  const checked=validateProductExecution({...input,asOf:now})
  const invalid=checked.gaps.filter(g=>!['otc-status','exchange-status'].includes(g.code))
  if(invalid.length)throw new Error(invalid.map(g=>g.detail).join('；'))
  return input
}
