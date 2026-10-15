'use client'

import { UnifiedValidationPanel } from './UnifiedValidationPanel'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ENTRY_FAMILIES } from '@/lib/research/lab/contracts'
import { Button } from '@/components/ui/button'
import type { LabExperiment } from '@/lib/research/lab/experiment'
import type { ResearchLoopMetrics } from '@/lib/research/loop-metrics'
import type { LabSettings } from '@/lib/research/lab/store'

type State={loopMetrics?:ResearchLoopMetrics|null;health?:{report:string;decision:string;validation:string;execution:string;reason?:string};settings:LabSettings;experiment:LabExperiment|null;history:Array<{id:string;createdAt:string}>;daily?:{date:string;status:string;reason?:string}|null}
const percent=(value:number|null|undefined)=>value==null?'—':`${value.toFixed(2)}%`
const modules:Record<string,string>={momentum:'60日动量','relative-strength':'20日相对强度',trend:'趋势过滤',volatility:'波动仓位缩放','fundamental-profit':'企业利润同比','fundamental-cash':'企业现金质量','event-evidence':'产业事件证据'}

export function StrategyLab({industryId}:{industryId:string}){
  const [state,setState]=useState<State|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const [family,setFamily]=useState('confirmed')
  const [view,setView]=useState<'historical'|'forward'>('historical')
  useEffect(()=>{
    const controller=new AbortController()
    fetch(`/api/research/${encodeURIComponent(industryId)}/lab`,{signal:controller.signal,cache:'no-store'})
      .then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error);if(!controller.signal.aborted)setState(data)})
      .catch(e=>{if(!controller.signal.aborted)setError(e.message)})
    return()=>controller.abort()
  },[industryId])
  async function act(action:'run'|'settings',enabled?:boolean){
    setBusy(true);setError('')
    try{
      const response=await fetch(`/api/research/${encodeURIComponent(industryId)}/lab`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,enabled})})
      const data=await response.json();if(!response.ok)throw new Error(data.error);setState(data)
    }catch(e){setError(e instanceof Error?e.message:'实验运行失败')}finally{setBusy(false)}
  }
  const experiment=state?.experiment
  return <section className="space-y-5" aria-label="策略实验室" aria-busy={busy}>
    <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border bg-card p-5">
      <div className="max-w-2xl space-y-2"><h2 className="text-xl font-semibold">策略实验室</h2><p className="text-sm leading-6 text-muted-foreground">比较多档积极风险预算。记录目标仓位、模拟成交与成熟结果；满126个历史观察日后，可根据模块移除对照自动登记候选，随后独立积累前瞻证据。账户回撤上限仍待验证后选择。</p><p className="text-sm">自动积累：{state?.settings.enabled?'已开启 · 收盘后本地运行':'未开启'} · 正式账户策略：未自动替换</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" className="min-h-11" disabled={!state||busy} onClick={()=>void act('settings',!state?.settings.enabled)}>{state?.settings.enabled?'暂停自动积累':'开启自动积累'}</Button><Button className="min-h-11" disabled={!state||busy} onClick={()=>void act('run')}>{busy?'正在验证…':'运行闭环验证'}</Button></div>
    </div>
    {error&&<p role="alert" className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive">{error}</p>}
    {state?.daily&&state.daily.status!=='completed'&&<p role="status" className="rounded-xl border p-4 text-sm leading-6">{state.daily.date} 自动实验：{state.daily.status==='waiting-data'?'等待完整收盘数据':state.daily.status==='needs-review'?'决策或账户需复核':'运行失败'}。{state.daily.reason}系统会在交易日收盘后每30分钟重试，不生成缺失数据下的前瞻计划。</p>}
    {!state&&!error&&<p role="status" className="p-5 text-sm text-muted-foreground">正在读取实验记录…</p>}
    {state&&!experiment&&<p className="rounded-xl border p-6 text-sm leading-6">尚未运行实验。先完成一次综合分析，再运行闭环验证。历史数据不足或过期会明确显示，不能生成有效性结论。</p>}
    {state?.health&&<div role="status" className="rounded-xl border p-4 text-sm leading-6">闭环状态：报告 {state.health.report==='completed'?'已归档':'待完成'} · 决策 {state.health.decision==='ready'?'目标已核验':'目标待核验'} · 实验 {{completed:'已运行',disabled:'未启用',failed:'失败'}[state.health.validation]||'待运行'} · 执行 {{ready:'可复核',blocked:'受限',failed:'失败',pending:'待生成'}[state.health.execution]||'待生成'}{state.health.reason&&<p>{state.health.reason}</p>}</div>}
    {state?.loopMetrics&&<div className="space-y-3 rounded-xl border p-4 text-sm leading-6" aria-label="实操性与迭代反馈">
      <h3 className="font-semibold">实操性与迭代反馈</h3>
      <p>当前有效非零动作 {state.loopMetrics.executableActions}/{state.loopMetrics.products} · 增加暴露 {state.loopMetrics.increase} · 减仓 {state.loopMetrics.reduce} · 需重新分析 {state.loopMetrics.requiresNewAnalysis}</p>
      <p className="text-muted-foreground">{state.loopMetrics.basis}</p>
      {state.loopMetrics.reanalysis&&<p>最近自动评估：{{started:'完整分析进行中',completed:'完整分析已完成',failed:'完整分析失败，需处理错误后继续',deferred:'等待重新分析','not-needed':'原观点仍可复核'}[state.loopMetrics.reanalysis.status]}{state.loopMetrics.reanalysis.retryAfter?`，最早重试 ${new Date(state.loopMetrics.reanalysis.retryAfter).toLocaleString('zh-CN')}`:''}。{state.loopMetrics.reanalysis.reasons.join('；')}</p>}
      {!!state.loopMetrics.blockers.length&&<details><summary className="min-h-11 cursor-pointer py-2 font-medium focus-visible:outline-2 focus-visible:outline-ring">查看动作阻塞原因</summary>{state.loopMetrics.blockers.map(item=><p key={item.reason}>{item.count}只产品 · {item.reason}</p>)}</details>}
    </div>}
    <UnifiedValidationPanel key={industryId} industryId={industryId}/>
    {experiment&&<>
      {experiment.unifiedValidation&&<p className="rounded-xl border p-4 text-sm leading-6">综合决策独立验证：{experiment.unifiedValidation.status==='insufficient-history'?'归档历史不足':experiment.unifiedValidation.status==='incomplete-coverage'?'证据覆盖待补齐':'已完成描述性比较'} · 已接纳 {experiment.unifiedValidation.accepted} 份归档决策 · 精确重放{experiment.unifiedValidation.exactReplayVerified?'通过':'尚未通过'}。该结果单独评价综合决策，不用价格实验收益替代。</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[['共同历史交易日',String(experiment.commonSessions)],['可用 ETF / 排除',`${experiment.assetCount} / ${experiment.exclusions.length}`],['成熟模块结果 / 待成熟',`${experiment.outcomes?.matured||0} / ${experiment.outcomes?.pending||0}`],['归档决策结果',`${experiment.decisionHistory?.directionalMatured||0} / ${experiment.decisionHistory?.pending||0}`]].map(([label,value])=><div key={label} className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 font-mono text-2xl">{value}</p></div>)}</div>
      <div className="rounded-xl border bg-card p-5 text-sm leading-6"><h3 className="font-semibold">统一决策链</h3><p className="mt-2">决策版本 {experiment.decisionVersionId?experiment.decisionVersionId.slice(-12):'当前快照尚未生成综合报告'} · 策略方法版本 {experiment.policyVersionId?.slice(-12)||'待归档'}</p><p className="text-muted-foreground">{experiment.decisionHistory?.calibrationStatus==='descriptive'?`已有 ${experiment.decisionHistory.directionalMatured} 个成熟方向结果，历史命中率 ${percent(experiment.decisionHistory.hitRatePct)}；已按同开盘去重及同指数非重叠窗口统计，结果仅作描述，不自动提高仓位。`:experiment.decisionHistory?`归档方向结果 ${experiment.decisionHistory.directionalMatured}/${experiment.decisionHistory.minimumDirectionalOutcomes}，尚不展示稳定命中率。`:'第一份新版综合报告生成后，决策、回滚验证和每日执行将共用同一版本标识。'}</p></div>
      <div className="flex flex-wrap gap-2" aria-label="验证数据类型"><Button variant={view==='historical'?'secondary':'ghost'} className="min-h-11" aria-pressed={view==='historical'} onClick={()=>setView('historical')}>历史重建诊断</Button><Button variant={view==='forward'?'secondary':'ghost'} className="min-h-11" aria-pressed={view==='forward'} onClick={()=>setView('forward')}>前瞻模拟盘</Button></div>
      <p className="text-sm leading-6 text-muted-foreground">{view==='historical'?'使用当前产品池重建价格策略，存在选样偏差；收益仅作探索性诊断。':'仅评价启用后真实归档的目标计划；不足252个观察日时继续积累，不标记策略有效。'} 数据截至 {new Date(experiment.asOf).toLocaleString('zh-CN')}。</p>
      <div className="space-y-3 rounded-xl border p-4"><p className="font-semibold">三种入场逻辑 × 三档风险预算</p><div className="flex flex-wrap gap-2">{ENTRY_FAMILIES.map(item=><Button key={item.id} variant={family===item.id?'secondary':'ghost'} aria-pressed={family===item.id} className="min-h-11" onClick={()=>setFamily(item.id)}>{item.name}</Button>)}</div><p className="text-sm leading-6 text-muted-foreground">{ENTRY_FAMILIES.find(item=>item.id===family)?.rule}。候选同时登记，不能把已查看的历史区间当作独立证明。</p></div>
      <div className="grid gap-4 xl:grid-cols-3">{experiment.strategies.filter(item=>(item.spec.entryMode||'confirmed')===family).map(strategy=>{
        const result=view==='historical'?strategy.historical:strategy.forward
        const targets=view==='forward'&&strategy.latestPlan?strategy.latestPlan.targets:result.latestTargets
        return <article key={strategy.spec.id} className="min-w-0 space-y-4 rounded-2xl border bg-card p-5">
          <div><h3 className="font-semibold">{strategy.spec.name}</h3><p className="mt-2 text-sm text-muted-foreground">最大暴露 {percent(strategy.spec.exposure*100)} · 单产品 {percent(strategy.spec.maxWeight*100)}</p></div>
          <dl className="grid grid-cols-2 gap-4 text-sm">{[['扣费收益',percent(result.returnPct)],['相对基准',percent(result.excessReturnPct)],['最大回撤',percent(result.maxDrawdownPct)],['最长水下期',`${result.recoverySessions} 个交易日`],['观察 / 成交',`${result.observations} / ${result.trades}`],['模拟费用',result.costs.toFixed(2)],['平均仓位',percent((view==='historical'?strategy.participation:strategy.forwardParticipation)?.averageExposurePct)],['空仓交易日',String((view==='historical'?strategy.participation:strategy.forwardParticipation)?.cashSessions??'—')]].map(([label,value])=><div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 font-mono text-base">{value}</dd></div>)}</dl>
          <p className="rounded-lg bg-muted/40 p-3 text-sm leading-6">历史滚动验证：{strategy.rolling.status==='historical-qualified'?'通过，可进入前瞻模拟':strategy.rolling.status==='historical-unstable'?'不稳定，仅保留诊断':'样本不足'}（{strategy.rolling.stabilityScore}分）。<br/>{strategy.promotion.status==='collecting-evidence'?'前瞻状态：证据积累中':'前瞻状态：可进入候选复核，正式账户尚未升级'}{result.halted?'；已触发回撤退出。':''}</p>
          <details><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">历史回滚、模块贡献与升级条件</summary><div className="space-y-3 text-sm leading-6"><p>不重叠时间窗口：{strategy.rolling.positiveExcessFolds}/{strategy.rolling.totalFolds} 个取得正超额；合计 {strategy.rolling.aggregateObservations} 个观察、{strategy.rolling.aggregateTrades} 笔模拟成交；最差窗口回撤 {percent(strategy.rolling.worstDrawdownPct)}。</p>{strategy.rolling.folds.map(fold=><p key={fold.startDate}>{fold.startDate} → {fold.endDate}：超额 {percent(fold.excessReturnPct)} · 回撤 {percent(fold.maxDrawdownPct)} · 交易 {fold.trades}</p>)}<p>移除模块后，相对完整策略的收益变化：</p>{strategy.ablations.map(item=><p key={item.removedModule}>{modules[item.removedModule]}：完整策略增量 {percent(item.incrementalReturnPct)}</p>)}<p>双倍成本收益：{percent(strategy.doubleCostReturnPct)}</p><p>末段留出收益：{percent(strategy.holdout?.returnPct)}{strategy.holdoutStatus==='no-active-validation'?'；该区间无交易，不能证明选取或入场有效':''}</p><p>固定仓位对照增量：{percent(strategy.controls?.timingIncrementPct)}；等权选取对照增量：{percent(strategy.controls?.selectionIncrementPct)}</p>{strategy.promotion.gates.map(gate=><p key={gate.key}>{gate.met?'通过':'待满足'} · {gate.detail}</p>)}</div></details>
          <details><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">最新模拟仓位与收益归因</summary><div className="space-y-2 text-sm">{view==='forward'&&strategy.latestPlan&&<p>最近归档的研究目标，有效至 {new Date(strategy.latestPlan.validUntil).toLocaleString('zh-CN')}；成交仍需下一交易日行情核验。</p>}{Object.entries(targets).filter(([,w])=>w>0).map(([ticker,weight])=><p key={ticker}>{ticker} · 目标 {percent(weight*100)}</p>)}{result.attribution.filter(a=>Math.abs(a.pnl)>.001).map(item=><p key={item.ticker}>{item.ticker} · 净盈亏 {item.pnl.toFixed(2)} · 费用 {item.cost.toFixed(2)}</p>)}{!result.observations&&<p>尚无可评价的前瞻成交区间。</p>}</div></details>
          <Link className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline" href={`/comprehensive-analysis?industryId=${encodeURIComponent(industryId)}&tab=daily&strategy=${encodeURIComponent(strategy.spec.id)}`}>查看该情景的每日执行清单</Link>
        </article>
      })}</div>
      <div className="rounded-xl border p-5 text-sm leading-6"><p className="font-medium">同范围等权买入持有 · 历史对照</p><p className="mt-2">扣费收益 {percent(experiment.baseline.returnPct)} · 最大回撤 {percent(experiment.baseline.maxDrawdownPct)} · 指数参照 {experiment.benchmark}。各策略起算时点和成本一致，持有到期按市值计价。</p></div>
      <div className="rounded-xl border p-5 text-sm leading-6"><h3 className="font-medium">企业与事件模块 · 前瞻验证</h3><p className="mt-2 text-muted-foreground">利润同比、现金质量与事件证据按当时快照记录，满20个交易日后回填结果。尚未证明有效的模块不直接决定仓位。</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{experiment.outcomes?.moduleEvaluation?.map(module=><p key={module.id}>{modules[module.id]||module.id} · 成熟样本 {module.samples} · 高低分组超额差 {percent(module.highMinusLowPct)}</p>)}</div></div>
      <details className="rounded-xl border p-5"><summary className="min-h-11 cursor-pointer py-2 font-medium focus-visible:outline-2 focus-visible:outline-ring">数据缺口、实验边界与版本记录</summary><div className="mt-3 space-y-2 text-sm leading-6">{experiment.exclusions.map(item=><p key={item.ticker}>{item.ticker}：{item.reason}</p>)}{experiment.limitations.map(item=><p key={item}>{item}</p>)}<p>引擎版本 {experiment.version} · 最近记录 {state.history.length} 次 · 单边佣金 {experiment.costs.commissionBps} bps + 滑点 {experiment.costs.slippageBps} bps。完整输入和方法哈希已归档。</p></div></details>
    </>}
  </section>
}
