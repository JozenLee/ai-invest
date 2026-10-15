import type { PortfolioHoldingInput, RiskBudget } from '@/lib/portfolio/decision-support'
import type { LabExperiment } from './experiment'
import type { Evaluation } from '../contracts'
import { chinaDate } from '../time'
import type { TargetPlan } from './contracts'
import type { UnifiedDecisionVersion } from '../decision-ledger'

export type DailyAccount={portfolioId:string;asOf:string|null;totalAssets:number;cashWeightPct:number;holdings:PortfolioHoldingInput[];riskBudget:RiskBudget}
export type ExecutionFeedback={id:string;planId:string;actionId:string;ticker:string;status:'submitted'|'filled'|'skipped'|'cancelled';recordedAt:string;occurredAt:string;quantity?:number;price?:number;fee?:number;note:string;plannedAmount?:number|null;actualAmount?:number|null;amountDeviation?:number|null}
export type DailyAction={id:string;ticker:string;name:string;decisionTicker:string|null;side:'buy'|'sell'|'none';label:string;status:'blocked'|'review'|'no-change';currentWeightPct:number|null;targetWeightPct:number|null;changeWeightPct:number|null;amount:number|null;referencePrice:number|null;referenceUnits:number|null;estimatedFee:number|null;reason:string;trigger:string;invalidation:string;blockers:string[];checks:string[];instrument:'etf'|'fund'}
const round=(n:number)=>Math.round(n*100)/100
const valid=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)

/** Translate one explicitly identified research scenario into today's existing account limits.
 * A risk-budget experiment never silently becomes the account's risk budget.
 */
export function buildDailyPlan(input:{experiment?:LabExperiment;evaluation:Evaluation;account:DailyAccount|null;strategyId?:string;now:string;feedback?:ExecutionFeedback[];prices:Record<string,number>;decisionVersion?:UnifiedDecisionVersion|null;requireDecisionVersion?:boolean;selectionConfirmed?:boolean;externalBlockers?:Record<string,string[]>}){
  const {experiment,evaluation,account,now}=input
  const allocation=input.decisionVersion?.allocation
  const unified=!!allocation&&(!input.strategyId||input.strategyId===allocation.strategy.id)
  const strategy=experiment?.strategies.find(s=>s.spec.id===input.strategyId)
  if(!unified&&!strategy)throw new Error('策略不属于当前实验版本')
  const sourceSnapshotId=unified?allocation!.snapshotId:experiment!.snapshotId
  const sourceAsOf=unified?allocation!.asOf:experiment!.asOf
  const signal:TargetPlan|undefined=unified?{id:allocation!.id,strategyId:allocation!.strategy.id,sourceDate:allocation!.sourceDate,generatedAt:input.decisionVersion!.generatedAt,validUntil:allocation!.validUntil,targets:allocation!.targets,features:[],decisions:allocation!.decisions,reason:'归档统一目标'}:strategy?.latestObservation||strategy?.latestPlan||undefined
  const globalGaps:string[]=[]
  if(unified&&evaluation.snapshotId!==sourceSnapshotId)globalGaps.push('账户计划的证据评估与归档目标不是同一快照')
  if(unified&&account&&(account.holdings.some(h=>!valid(h.weightPct)||h.weightPct<0||h.weightPct>100)||Math.abs(account.holdings.reduce((sum,h)=>sum+(h.weightPct||0),0)+account.cashWeightPct-100)>1))globalGaps.push('账户持仓与现金比例不完整或不一致')
  if(!unified&&input.selectionConfirmed===false)globalGaps.push('当前仅为策略预览，请先明确选定试行策略版本')
  if(input.requireDecisionVersion&&!input.decisionVersion)globalGaps.push('当前策略快照没有同一证据时点的统一决策版本，需先完成综合分析')
  if(input.decisionVersion&&input.decisionVersion.snapshotId!==sourceSnapshotId)globalGaps.push('统一决策与策略实验不属于同一冻结快照')
  if(input.decisionVersion&&!(Date.parse(input.decisionVersion.validUntil)>Date.parse(now)))globalGaps.push('统一决策版本已过期，需按最新证据复核')
  if(input.decisionVersion&&(input.decisionVersion.reportQuality.usability!=='advice-grade'||input.decisionVersion.reportQuality.executionReadinessScore!==100))globalGaps.push('统一决策报告尚未达到可执行等级')
  if(!signal)globalGaps.push('没有当前版本的前瞻计划，请更新研究证据')
  else if(!(Date.parse(signal.generatedAt)<=Date.parse(now)&&Date.parse(now)<Date.parse(signal.validUntil)))globalGaps.push('研究计划已过期或时点无效，需要重新生成')
  if(!unified&&experiment?.dataStatus!=='current')globalGaps.push('行情或研究证据未通过时效检查')
  if(strategy?.forward.halted)globalGaps.push('该策略的前瞻模拟已触发回撤退出，需要复核后才能重新采用')
  if(!account||!valid(account.totalAssets)||account.totalAssets<=0)globalGaps.push('尚无有效账户资产快照')
  const age=Date.parse(now)-Date.parse(account?.asOf||'')
  if(!Number.isFinite(age)||age<0||age>72*3600_000)globalGaps.push('持仓与现金业务日期缺失或超过72小时，请同步账户')
  if(account&&(!valid(account.cashWeightPct)||account.cashWeightPct<0||account.cashWeightPct>100))globalGaps.push('现金比例无效')
  const pending=(input.feedback||[]).filter(f=>f.status==='submitted'||f.status==='filled'&&Date.parse(f.occurredAt)>Date.parse(account?.asOf||'1970-01-01'))
  if(pending.length)globalGaps.push('已记录操作尚未反映到持仓快照，请核对确认份额并同步后再生成，避免重复下单')
  const policy=account?.riskBudget
  if(account&&![policy?.minCashRatio,policy?.maxIndustryRatio,policy?.maxFundRatio,policy?.maxSingleAdjustmentRatio].every(v=>valid(v)&&v>=0&&v<=1))globalGaps.push('账户风险预算配置无效，不能按零上限计算卖出')
  const portfolioHoldings=account?.holdings||[]
  const targetIndex=new Map<string,number>()
  for(const [ticker,weight] of Object.entries(signal?.targets||{})){
    const index=evaluation.decisions.find(d=>d.ticker===ticker)?.indexCode
    if(index)targetIndex.set(index,(targetIndex.get(index)||0)+weight*100)
  }
  const mapped=portfolioHoldings.map(holding=>{
    const direct=evaluation.decisions.find(d=>d.ticker===holding.ticker)
    const verified=!!direct||!!holding.mappingSource&&['official-document','provider-cross-check','manual'].includes(holding.mappingSource)&&(holding.mappingConfidence??0)>=.8
    const decision=direct||(verified?evaluation.decisions.find(d=>d.ticker===holding.targetEtfCode||d.indexCode===holding.targetIndexCode):undefined)
    return {holding,decision,index:decision?.indexCode||null,verified}
  })
  const reserved=mapped.filter(m=>!m.index&&m.holding.industry===evaluation.profile.name).reduce((s,m)=>s+(m.holding.weightPct||0),0)
  const totalTarget=[...targetIndex.values()].reduce((s,n)=>s+n,0)
  const scale=totalTarget>0?Math.min(1,Math.max(0,(policy?.maxIndustryRatio||0)*100-reserved)/totalTarget):0
  const actions:DailyAction[]=[]
  const redemptionRates=new Map<string,number|null>()
  function action(ticker:string,name:string,current:number|null,target:number|null,decisionTicker:string|null,instrument:'etf'|'fund',extra:string[],feePct:number|null){
    const direction=current!==null&&target!==null?target-current:0
    const item=signal?.decisions?.find(d=>d.ticker===decisionTicker)
    const unifiedProduct=input.decisionVersion?.products.find(row=>row.ticker===decisionTicker||row.indexCode===evaluation.decisions.find(d=>d.ticker===decisionTicker)?.indexCode)
    const blockers=[...globalGaps,...extra,...(input.externalBlockers?.[decisionTicker||ticker]||[]),...(unified?allocation!.decisions.find(d=>d.ticker===decisionTicker)?.blockers||[]:[])]
    if(unified&&unifiedProduct?.executionStatus!=='verified')blockers.push('统一决策产品尚未通过执行核验')
    if(unified&&unifiedProduct?.direction==='neutral'&&(target??0)<=.05&&(allocation!.priorTargets[decisionTicker||ticker]||0)<=.0005&&direction<-.05)blockers.push('初始研究现金目标不代表已有持仓的退出指令，需明确减仓依据')
    if(!unified&&(input.requireDecisionVersion||input.decisionVersion)&&direction>.05&&(!unifiedProduct||unifiedProduct.direction!=='increase'||unifiedProduct.executionStatus!=='verified'))blockers.push('策略目标要求增加暴露，但本轮统一决策未同时给出已核验的增仓方向')
    if(!unified&&(input.requireDecisionVersion||input.decisionVersion)&&direction<-.05&&(!unifiedProduct||unifiedProduct.direction!=='reduce'||unifiedProduct.executionStatus!=='verified'))blockers.push('策略目标要求降低暴露，但本轮统一决策未同时给出已核验的减仓方向')
    if(item?.status==='missing')blockers.push('标的输入缺失，不能把缺失当作零仓位信号')
    const reference=instrument==='etf'?input.prices[ticker]:portfolioHoldings.find(h=>h.ticker===ticker)?.unitNav
    if(!valid(reference)||reference<=0)blockers.push('缺少可核验参考价格或净值')
    const checks=instrument==='fund'?['核验渠道申赎截止时间、确认净值与到账时间；未到账赎回款不用于买入','核验实际持有批次及申赎费率']:['下单前检查实时报价、价差、停牌与涨跌停状态','使用限价单，核验交易单位和券商最低佣金']
    const side=direction>.05?'buy':direction<-.05?'sell':'none'
    const status=blockers.length?'blocked':side==='none'?'no-change':'review'
    redemptionRates.set(ticker,feePct)
    actions.push({id:ticker,ticker,name,decisionTicker,instrument,side,status,label:status==='blocked'?'暂无有效动作':side==='buy'?'试行加仓':side==='sell'?'试行减仓':'维持目标仓位',currentWeightPct:current,targetWeightPct:target,changeWeightPct:current!==null&&target!==null?round(direction):null,amount:null,referencePrice:valid(reference)?reference:null,referenceUnits:null,estimatedFee:side==='none'?0:null,reason:unified?`${item?.reason||'统一研究目标'}；归档目标按账户约束映射为${target===null?'待核验':target.toFixed(2)}%，当前账户${current===null?'待核验':current.toFixed(2)}%，按差额计算本次调整`:item?.reason||(!decisionTicker?'缺少唯一可核验的底层产品关系':'根据研究目标与账户现有风险上限计算'),trigger:item?.trigger||'补齐产品映射与当前证据后再判断',invalidation:item?.invalidation||'业务日期、映射或价格失效时撤销本清单',blockers,checks})
  }
  for(const m of mapped){
    if(!m.index&&m.holding.industry!==evaluation.profile.name)continue
    const peers=mapped.filter(p=>p.index&&p.index===m.index)
    const total=peers.reduce((s,p)=>s+(p.holding.weightPct||0),0)
    const share=total>0?(m.holding.weightPct||0)/total:1/Math.max(1,peers.length)
    const known=!!signal&&!!m.index&&targetIndex.has(m.index)
    const desired=known?Math.min((policy?.maxFundRatio||0)*100,targetIndex.get(m.index!)!*scale*share):null
    action(m.holding.ticker,m.holding.name,m.holding.weightPct,desired,m.decision?.ticker||null,m.holding.ticker===m.decision?.ticker?'etf':'fund',!m.index?['产品映射未核验，不能用产业方向替代该基金的买卖判断']:!known?['该产品没有有效研究目标，不能把缺失解释为零仓位']:[],m.holding.redemptionFeePct??null)
  }
  for(const [index,weight] of targetIndex){
    if(weight<=0||mapped.some(m=>m.index===index))continue
    const decision=evaluation.decisions.find(d=>d.indexCode===index&&(signal?.targets[d.ticker]||0)>0)
    if(decision)action(decision.ticker,decision.name,0,Math.min((policy?.maxFundRatio||0)*100,weight*scale),decision.ticker,'etf',[],null)
  }
  const spentAdjustmentPct=(input.feedback||[]).filter(f=>f.status==='filled'&&chinaDate(f.occurredAt)===chinaDate(now)).reduce((s,f)=>s+(f.quantity||0)*(f.price||0),0)/Math.max(1,account?.totalAssets||0)*100
  let capacity=Math.max(0,(policy?.maxSingleAdjustmentRatio||0)*100-spentAdjustmentPct)
  let availableCash=Math.max(0,(account?.cashWeightPct||0)-(policy?.minCashRatio||0)*100)
  for(const row of [...actions].sort((a,b)=>(a.side==='sell'?-1:1)-(b.side==='sell'?-1:1)||a.ticker.localeCompare(b.ticker))){
    if(row.status==='blocked'||row.currentWeightPct===null||row.changeWeightPct===null)continue
    const requested=Math.abs(row.changeWeightPct),allowed=Math.min(requested,capacity,row.side==='buy'?Math.max(0,availableCash-5/Math.max(1,account?.totalAssets||0)*100)/(1+.0003):100)
    if(row.side==='none')continue
    const feePct=row.instrument==='fund'&&row.side==='sell'?redemptionRates.get(row.ticker)??null:null
    if(row.instrument==='fund'&&row.side==='sell'&&feePct===null){row.status='blocked';row.blockers.push('赎回费率缺失');continue}
    row.changeWeightPct=round((row.side==='sell'?-1:1)*allowed)
    row.targetWeightPct=round(row.currentWeightPct+row.changeWeightPct)
    row.amount=round((account?.totalAssets||0)*allowed/100)
    row.referenceUnits=row.referencePrice?row.instrument==='etf'?Math.floor(row.amount/row.referencePrice/100)*100:round(row.amount/row.referencePrice):null
    const availableUnits=portfolioHoldings.find(h=>h.ticker===row.ticker)?.quantity
    if(row.side==='sell'&&valid(availableUnits)&&row.referenceUnits!==null&&row.referenceUnits>availableUnits){
      row.referenceUnits=row.instrument==='etf'?Math.floor(availableUnits/100)*100:availableUnits
      row.amount=round(row.referenceUnits*(row.referencePrice||0))
      row.changeWeightPct=-round(row.amount/Math.max(1,account?.totalAssets||0)*100)
      row.targetWeightPct=round(row.currentWeightPct+row.changeWeightPct)
      row.checks.push('参考卖出份额已限制在已确认持仓以内；零股或渠道限额需人工核验')
    }
    if(row.instrument==='etf'&&row.referenceUnits!==null&&row.referencePrice!==null){
      row.amount=round(row.referenceUnits*row.referencePrice)
      row.changeWeightPct=round((row.side==='sell'?-1:1)*row.amount/Math.max(1,account?.totalAssets||0)*100)
      row.targetWeightPct=round(row.currentWeightPct+row.changeWeightPct)
    }
    row.estimatedFee=feePct!==null?round(row.amount*feePct/100):row.instrument==='etf'?round(Math.max(5,row.amount*.0003)):null
    if(row.instrument==='etf')row.checks.push('参考佣金按万分之三、最低5元估算；实际券商费率必须执行前核对')
    const actualAllowed=Math.abs(row.changeWeightPct)
    capacity-=actualAllowed;if(row.side==='buy')availableCash-=actualAllowed
    if(allowed<requested)row.checks.push('已应用账户每日总调整上限与已到账现金，不使用预计卖出收入')
    if(actualAllowed<=.05){row.status='no-change';row.label='额度、现金或交易单位不足，等待复核';row.amount=0;row.referenceUnits=0}
  }
  const active=actions.filter(a=>a.status==='review')
  return {version:1,asOf:now,sourceAsOf,sourceSnapshotId,strategyId:unified?allocation!.strategy.id:strategy!.spec.id,strategyName:unified?allocation!.strategy.name:strategy!.spec.name,policyVersionId:unified?allocation!.strategy.id:experiment?.policyVersionId||null,decisionVersionId:input.decisionVersion?.id||null,decisionReportId:input.decisionVersion?.reportId||null,portfolioId:account?.portfolioId||null,portfolioAsOf:account?.asOf||null,validUntil:signal?.validUntil||null,
    validation:unified?'unified-research':strategy!.promotion.status,mode:unified?'unified-decision' as const:'manual-trial' as const,summary:globalGaps.length?'暂无可执行清单，先完成列出的数据修复。':active.length?`${active.length}项试行调整供人工复核；采用账户已保存的风险上限，不自动采用实验回撤预算。`:actions.some(a=>a.side!=='none')?'模型目标仍有差异，但受数据、现金、额度或交易单位约束，等待下一次复核。':'本轮没有需要改变的已核验仓位；查看条件和下一次复核时间。',
    experimentalBoundary:'策略尚在验证，金额为研究情景下的参考值，不代表已证明超额收益。系统不向券商或基金平台下单。',
    actions,blockers:[...new Set(globalGaps)],policy,checklist:['盘前：同步持仓、已到账现金和昨日成交确认','执行前：核验产品、费用、实时价格和清单有效期','执行后：记录已提交/已确认成交或跳过原因','次日：同步实际持仓，核对计划与实际成交偏差'],feedback:input.feedback||[]}
}
export type DailyPlan=ReturnType<typeof buildDailyPlan>&{id:string}
