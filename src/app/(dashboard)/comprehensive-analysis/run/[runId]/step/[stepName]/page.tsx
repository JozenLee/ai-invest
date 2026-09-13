'use client'
/* eslint-disable @typescript-eslint/no-explicit-any -- Historical step artifacts are heterogeneous JSON payloads. */

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AlertTriangle, ArrowLeft, Database, FileText, Loader2, ExternalLink, BarChart3, ChevronDown, CheckCircle2, Clock3, GitBranch, Layers3, ShieldCheck } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AnalysisResultView } from '@/components/analysis/AnalysisResultView'
import { PromptDialog } from '@/components/analysis/PromptDialog'
import { PortfolioDecisionPanel } from '@/components/analysis/PortfolioDecisionPanel'
import type { PortfolioDecisionSupport } from '@/lib/portfolio/decision-support'
import { analysisFieldLabels, chineseValue } from '@/lib/analysis/chinese-labels'
import { comprehensiveWorkflowDefinition } from '@/lib/workflow/comprehensive-definition'

type Artifact = { artifactKey: string; artifactType: string; data: unknown; size: number; truncated?:boolean }
type Step = { stepName: string; status: string; startedAt?:string|null;completedAt: string | null;duration?:number|null;error?:string|null;progress?:{current?:number;total?:number;message?:string}|null;methodId?:string|null;methodVersion?:string|null;configSnapshot?:string|null; artifacts: Artifact[] }

const titles: Record<string, string> = Object.fromEntries(comprehensiveWorkflowDefinition.nodes.map(node=>[node.id,node.title]))
const purposes:Record<string,string>=Object.fromEntries(comprehensiveWorkflowDefinition.nodes.map(node=>[node.id,node.description]))

const labels: Record<string, string> = {
  'research-snapshot':'冻结研究快照','research-manifest':'研究证据清单','research-evaluation':'规则复核结果','etf-actions':'指数基金决策',
  'etf-bindings': '关联指数基金', 'etf-market-data': '指数基金行情数据', 'report-content': '分析报告',
  'report-id': '报告编号', companies: '产业链企业', 'company-codes': '企业代码',
  'company-market-data': '企业行情数据', news: '产业资讯', 'market-snapshot': '市场概览',
  'market-trends': '市场趋势', 'industry-info': '产业信息', 'etf-codes': '指数基金代码','data-quality':'数据质量','etf-data-gaps':'行情缺口',
  'etf-holdings':'指数基金持仓','holdings-summary':'持仓摘要','news-articles':'资讯样本','news-events':'归并事件','news-evidence-gaps':'资讯证据缺口',
  'news-trends':'资讯趋势','news-sentiment':'资讯倾向','market-reference-data':'市场参考数据','market-reference-indicators':'市场参考指标',
  'social-report':'一页研究摘要','social-report-status':'一页摘要状态','public-report-validation':'公开报告校验','portfolio-decision-support':'组合投资建议','portfolio-analysis':'私有持仓分析','historical-report-context':'纳入分析的历史报告','historical-report-policy':'历史报告回溯规则',
  'research-preflight':'同步与时效检查','decision-timing':'报告时效','graph-context':'产业图谱快照','graph-context-validation':'图谱结构校验','graph-mapping-validation':'图谱映射校验','strategy-validation':'规则样本外回放','ai-request-status':'模型请求状态','market-analysis-validation':'市场输出校验','news-analysis-validation':'事件输出校验','company-analysis-validation':'企业输出校验','industry-overview-validation':'行业汇编校验','investment-advice-validation':'综合结论校验',
  code: '代码', ticker: '代码', name: '名称', description: '描述', weight: '权重',
  bind_type: '绑定类型', bindType: '绑定类型', etf_code: '指数基金代码', etf_name: '指数基金名称',
  change_pct: '涨跌幅', change: '涨跌幅', price: '价格', date: '日期', time: '时间',
  status: '状态', source: '数据来源', total: '总数', count: '数量', success: '成功',
  reasoning: '匹配理由', relevance: '相关度', nodeName: '节点名称', nodeId: '节点编号',
  queued:'排队任务',completed:'完整返回',partial:'部分返回',failed:'失败任务',warnings:'同步提示',publicationNotes:'发布时点说明',issues:'校验问题',revisionId:'图谱结构版本',mappingRevisionId:'映射版本',mappingContentHash:'映射内容哈希',mappingSource:'映射来源',phase:'所处时段',timeZone:'时区',timezone:'时区',asOf:'冻结时间',expectedSession:'研究基准日',closeDataSession:'最近完整收盘日',eventCutoff:'事件截止时间',basis:'口径说明',version:'版本',stages:'产业阶段',segments:'细分环节',relations:'传导关系',evidencedRelations:'有来源关系',relationEvidencePct:'关系证据覆盖率',segmentEtfCoveragePct:'环节ETF覆盖率',segmentIndexCoveragePct:'环节指数覆盖率',companySegmentCoveragePct:'企业环节归属率',companyEtfCoveragePct:'企业ETF映射率',holdingVerifiedCoveragePct:'持仓验证覆盖率',reportId:'报告编号',sessionDate:'交易日',createdAt:'生成时间',role:'历史资料用途',sourceSummary:'来源分布',evidenceCount:'证据数量',graphRevision:'图谱版本',enabled:'是否启用',lookbackTradingDays:'回溯交易日',mode:'选择方式',industryId:'产业编号',industryName:'产业名称',comprehensiveConclusion:'历史综合结论',matchedEtfs:'关联ETF',matchedIndices:'关联指数',title:'报告标题',executionReady:'可执行',label:'时效结论',tradingDate:'当前交易日',quoteAsOf:'行情时点',eventCheckAsOf:'公告检查时点',validUntil:'有效期',reasons:'限制原因',attempt:'请求次数',timeoutMs:'超时上限（毫秒）',durationMs:'模型耗时（毫秒）',maxTokens:'输出上限',model:'模型',stopReason:'结束原因',
}

const artifactTypes: Record<string, string> = { DATA: '数据', TEXT: '文本', JSON: '结构化数据' }
const statuses: Record<string, string> = { COMPLETED: '已完成', RUNNING: '进行中', PENDING: '等待中', FAILED: '失败', PAUSED: '已暂停' }

function pretty(value: unknown) {
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2) ?? '（空）'
}

function labelFor(key: string) {
  if(key.endsWith('-ai-status'))return '模型执行状态'
  if(/^ai-request-attempt-/.test(key))return '模型请求快照'
  if(/^ai-response/.test(key))return '模型原始响应'
  if(/^ai-error/.test(key))return '模型错误诊断'
  if(key.endsWith('-graph-usage-validation'))return '图谱使用校验'
  return labels[key] || analysisFieldLabels[key] || labels[key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] || key.replace(/[-_]/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2')
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '暂无'
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value === 'number') return value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
  if(Array.isArray(value))return `${value.length} 项`
  if(typeof value==='object')return '结构化明细'
  return String(chineseValue(value))
}

function formatBytes(value:number){if(value<1024)return `${value} B`;if(value<1024*1024)return `${(value/1024).toFixed(1)} KB`;return `${(value/1024/1024).toFixed(1)} MB`}

function compactAnalysisDiagnostics(value:unknown):unknown{
  if(Array.isArray(value))return value.map(compactAnalysisDiagnostics)
  if(!value||typeof value!=='object')return value
  return Object.fromEntries(Object.entries(value as Record<string,unknown>).map(([key,item])=>{
    if(key==='referenceIssues'&&Array.isArray(item)){
      const rows=item.map(String),dateCount=rows.filter(text=>text.includes('日期为')||text.includes('判断日期')).length,invalidCount=rows.filter(text=>text.includes('不在本轮证据包')||text.includes('已移除')).length,other=rows.filter(text=>!text.includes('日期为')&&!text.includes('判断日期')&&!text.includes('不在本轮证据包')&&!text.includes('已移除'))
      return [key,[...(dateCount?[`${dateCount}项引用日期与模型标注不一致；页面按冻结证据日期展示`]:[]),...(invalidCount?[`${invalidCount}项无效引用已从展示证据中移除`]:[]),...other.slice(0,3)]]
    }
    return [key,compactAnalysisDiagnostics(item)]
  }))
}

const diagnosticArtifact=(key:string)=>/^ai-(?:prompt|response|error|input-audit|request-attempt)|-graph-usage-validation$/.test(key)||key==='public-report-validation'
const qualityArtifact=(key:string)=>key==='ai-request-status'||key==='research-preflight'||key==='decision-timing'||key==='data-quality'||key==='strategy-validation'||/validation$|-ai-status$/.test(key)
const artifactDescriptions:Record<string,string>={
  'research-snapshot':'本轮所有研究模块共享的冻结输入摘要。','research-manifest':'证据数量、主要来源和图谱版本。','research-evaluation':'逐产品规则状态、条件和多因子诊断。','etf-actions':'由确定性规则生成的逐产品动作边界。','etf-bindings':'本领域纳入研究的ETF及其正式跟踪指数。','etf-market-data':'复权行情、趋势、波动率和流动性指标。','etf-holdings':'最新披露前十大持仓及披露期。','companies':'图谱、持仓与研究配置合并后的企业池。','company-market-data':'企业行情、财务覆盖与产业环节聚合输入。','news-events':'已归并并分级的产业事件。','market-snapshot':'市场基准、板块资金与时效快照。','data-quality':'数据可用、有限或缺失的原因。','portfolio-evidence':'本地组合比例、领域映射和风险预算。','portfolio-decision-support':'领域预算与逐基金执行门禁。','strategy-validation':'历史冻结决策的纸面回放结果。','investment-advice':'最终综合论点、反证、情景和配置立场。','report-content':'归档的完整研究正文。'
}

function SummaryCard({ label, value, tone = 'text-foreground' }: { label: string; value: unknown; tone?: string }) {
  return <div className="rounded-xl border bg-background/70 p-3"><div className="text-xs text-muted-foreground">{label}</div><div className={`mt-1 text-xl font-semibold tabular-nums ${tone}`}>{formatValue(value)}</div></div>
}

function Metric({ label, value }: { label: string; value: unknown }) {
  return <div><div className="text-muted-foreground">{label}</div><div className="mt-1 font-semibold tabular-nums">{formatValue(value)}</div></div>
}

function SectorFlowSummary({ sectors }: { sectors: any[] }) {
  const rows = sectors
    .map((item) => ({
      ...item,
      name: item.sector || item.name,
      flow: Number(item.mainForceNet ?? item.main_force_net ?? item.netFlow ?? item.net_flow ?? item.net_amount ?? item.netAmount ?? item.mainNet ?? 0),
    }))
    .filter((item) => item.name)
  const unique=[...new Map(rows.sort((a,b)=>Math.abs(b.flow)-Math.abs(a.flow)).map(item=>[item.name,item])).values()]
  const inflow = unique.filter((item) => item.flow > 0).sort((a, b) => b.flow - a.flow).slice(0, 10)
  const outflow = unique.filter((item) => item.flow < 0).sort((a, b) => a.flow - b.flow).slice(0, 10)
  if (!rows.length) return <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">暂无板块资金数据</div>
  return <div className="grid gap-3 md:grid-cols-2"><div className="rounded-xl border p-4"><div className="mb-3 font-medium text-emerald-600">净流入板块</div>{inflow.length?inflow.map((item) => <div key={item.name} className="flex justify-between py-1 text-sm"><span>{item.name}</span><span className="font-semibold text-emerald-600">+{item.flow.toFixed(2)} 亿</span></div>):<p className="text-xs text-muted-foreground">本轮没有净流入样本</p>}</div><div className="rounded-xl border p-4"><div className="mb-3 font-medium text-rose-600">净流出板块</div>{outflow.length?outflow.map((item) => <div key={item.name} className="flex justify-between py-1 text-sm"><span>{item.name}</span><span className="font-semibold text-rose-600">{item.flow.toFixed(2)} 亿</span></div>):<p className="text-xs text-muted-foreground">本轮没有净流出样本</p>}</div></div>
}

function ObjectGrid({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(([, value]) => typeof value !== 'object' || value === null)
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{entries.map(([key, value]) => <SummaryCard key={key} label={labelFor(key)} value={value} tone={key.toLowerCase().includes('risk') ? 'text-amber-600' : ''} />)}</div>
}

function DataTable({ rows, hiddenColumns = [],preferredColumns=[] }: { rows: unknown[]; hiddenColumns?: string[];preferredColumns?:string[] }) {
  const records = rows.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object' && !Array.isArray(row)))
  if (!records.length) return <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">暂无明细数据</div>
  const available=Array.from(new Set(records.flatMap((row) => Object.keys(row))))
  const columns = [...preferredColumns.filter(column=>available.includes(column)),...available.filter(column=>!preferredColumns.includes(column))]
    .filter((column) => !hiddenColumns.includes(column) && !hiddenColumns.includes(column.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())))
    .slice(0, 8)
  return <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[620px] text-sm"><thead className="bg-muted/40"><tr>{columns.map((column) => <th key={column} className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-muted-foreground">{labelFor(column)}</th>)}</tr></thead><tbody className="divide-y">{records.slice(0, 100).map((row, index) => <tr key={index} className="transition-colors hover:bg-muted/20">{columns.map((column) => <td key={column} className="max-w-[240px] truncate px-3 py-2">{formatValue(row[column])}</td>)}</tr>)}</tbody></table>{records.length > 100 && <p className="border-t px-3 py-2 text-xs text-muted-foreground">仅展示前 100 条，共 {records.length} 条</p>}</div>
}

function SnapshotSummary({data}:{data:Record<string,any>}){
  const counts=data.counts||{}
  return <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><SummaryCard label="指数基金" value={counts.etfs}/><SummaryCard label="企业样本" value={counts.companies}/><SummaryCard label="冻结事件" value={counts.events}/><SummaryCard label="证据记录" value={counts.evidence}/><SummaryCard label="资金记录" value={counts.sectorFlows}/></div><div className="rounded-xl border bg-muted/20 p-4 text-sm"><p className="font-medium">冻结边界</p><p className="mt-2 leading-6 text-muted-foreground">证据时点 {formatValue(data.asOf)} · 市场基准 {formatValue(data.profile?.benchmark)} · 观察周期 {formatValue(data.profile?.horizonDays)} 个交易日</p><p className="mt-1 leading-6 text-muted-foreground">原始记录已独立持久化；本页只展示研究摘要，避免重复传输大对象。</p></div>{data.graphCoverage&&<ObjectGrid data={data.graphCoverage}/>}</div>
}

function EvaluationSummary({data}:{data:Record<string,any>}){
  const decisions=Array.isArray(data.decisions)?data.decisions:[]
  const states=decisions.reduce<Record<string,number>>((result,item:any)=>({...result,[item.state]:(result[item.state]||0)+1}),{})
  return <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><SummaryCard label="产品数" value={decisions.length}/><SummaryCard label="风险收缩" value={states['risk-off']||0} tone="text-amber-600"/><SummaryCard label="满足条件" value={states.eligible||0} tone="text-emerald-600"/><SummaryCard label="持续观察" value={states.watch||0}/><SummaryCard label="证据受限" value={states.blocked||0}/></div><div className="grid gap-3 lg:grid-cols-2">{decisions.map((decision:any)=><details key={decision.ticker} className="rounded-xl border bg-background"><summary className="min-h-12 cursor-pointer list-none p-4"><span className="font-medium">{decision.name||decision.ticker}</span><Badge variant="outline" className="float-right">{String(chineseValue(decision.state))}</Badge><span className="mt-1 block text-xs text-muted-foreground">{decision.ticker} · {decision.indexCode||'指数待核验'} · {decision.conditions?.filter((item:any)=>item.status==='unknown').length||0}项未知</span></summary><div className="border-t p-4 text-xs leading-6 text-muted-foreground"><p>{decision.reason}</p><p className="mt-2">多因子 {decision.metrics?.factorRegime||'未知'} · 得分 {decision.metrics?.factorScore??'未知'} · 20日相对收益 {decision.metrics?.relative20Pct?.toFixed?.(2)??'未知'}</p></div></details>)}</div></div>
}

function CompanyDataSummary({rows}:{rows:any[]}){
  return <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-3"><SummaryCard label="企业样本" value={rows.length}/><SummaryCard label="图谱核心环节样本" value={rows.filter(row=>row.segment&&!String(row.segment).includes('图谱外')&&row.segment!=='产业环节待确认').length}/><SummaryCard label="具备多期财报" value={rows.filter(row=>(row.financialPeriods||0)>=2).length}/></div><DataTable rows={rows} preferredColumns={['stockCode','stockName','stage','segment','pool','financialPeriods','announcementCount','profitGrowthPct']}/></div>
}

function GraphContextSummary({data}:{data:Record<string,any>}){
  const stages=Array.isArray(data.stages)?data.stages:[]
  return <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><SummaryCard label="结构版本" value={data.revisionId}/><SummaryCard label="映射版本" value={data.mappingRevisionId||'旧快照未生成'}/><SummaryCard label="映射来源" value={data.mappingSource||'图谱发布数据'}/><SummaryCard label="冻结时间" value={data.sourceFetchedAt}/></div>{data.coverage&&<ObjectGrid data={data.coverage}/>}<DataTable rows={stages.map((stage:any)=>({code:stage.code,name:stage.name,segments:stage.segments?.length||0,companies:(stage.segments||[]).reduce((sum:number,item:any)=>sum+(item.companies?.length||0),0),matchedEtfs:new Set((stage.segments||[]).flatMap((item:any)=>item.etfs?.map((etf:any)=>etf.code)||[])).size,matchedIndices:new Set((stage.segments||[]).flatMap((item:any)=>item.indices?.map((index:any)=>index.code)||[])).size}))} preferredColumns={['code','name','segments','companies','matchedEtfs','matchedIndices']}/><p className="text-xs leading-5 text-muted-foreground">企业、ETF和事件路径的完整记录保留在冻结快照中；本页只展示覆盖情况和版本边界。</p></div>
}

function PortfolioEvidenceSummary({data}:{data:Record<string,any>}){
  const holdings=Array.isArray(data.holdings)?data.holdings:[]
  return <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><SummaryCard label="持仓数量" value={data.holdingCount}/><SummaryCard label="现金比例" value={data.cashWeightPct}/><SummaryCard label="本领域仓位" value={data.industryWeightPct}/><SummaryCard label="前五大持仓" value={data.topFiveWeightPct}/></div><DataTable rows={holdings} preferredColumns={['ticker','name','category','industry','industryMatchConfidence','weightPct','fundType','targetEtfCode']}/><p className="text-xs leading-5 text-muted-foreground">产业领域归属用于领域仓位汇总；只有正式底层ETF/指数映射才用于逐基金动作。</p></div>
}

function VisualArtifact({ artifact }: { artifact: Artifact }) {
  const data = artifact.data
  if(artifact.artifactKey==='research-snapshot'&&data&&typeof data==='object')return <SnapshotSummary data={data as Record<string,any>}/>
  if(artifact.artifactKey==='research-evaluation'&&data&&typeof data==='object')return <EvaluationSummary data={data as Record<string,any>}/>
  if(artifact.artifactKey==='graph-context'&&data&&typeof data==='object')return <GraphContextSummary data={data as Record<string,any>}/>
  if(artifact.artifactKey==='portfolio-evidence'&&data&&typeof data==='object')return <PortfolioEvidenceSummary data={data as Record<string,any>}/>
  if(artifact.artifactKey==='portfolio-decision-support'&&data&&typeof data==='object'){
    const support=data as PortfolioDecisionSupport
    return <PortfolioDecisionPanel support={support} executionReady={support.gates?.every(gate=>gate.met)}/>
  }
  if(artifact.artifactKey==='historical-report-context'&&Array.isArray(data))return <DataTable rows={data.map((item:any)=>({sessionDate:item.sessionDate,title:item.title,createdAt:item.createdAt,role:item.role}))} preferredColumns={['sessionDate','title','createdAt','role']}/>
  if(artifact.artifactKey==='research-manifest'&&data&&typeof data==='object'){
    const record=data as Record<string,any>
    return <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-3"><SummaryCard label="证据数量" value={record.evidenceCount}/><SummaryCard label="清单版本" value={record.version}/><SummaryCard label="证据时点" value={record.asOf}/></div>{Array.isArray(record.sourceSummary)&&<DataTable rows={record.sourceSummary} preferredColumns={['source','count']}/>}</div>
  }
  if(artifact.artifactKey==='company-market-data'&&Array.isArray(data))return <CompanyDataSummary rows={data}/>
  if (artifact.artifactKey === 'report-content' || artifact.artifactKey.endsWith('analysis') || artifact.artifactKey === 'industry-overview' || artifact.artifactKey === 'investment-advice') {
    let parsed=data
    if(typeof data==='string')try{parsed=JSON.parse(data.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''))}catch{/* Markdown remains a string. */}
    return <AnalysisResultView value={compactAnalysisDiagnostics(parsed)} />
  }
  if (Array.isArray(data)) {
    if (artifact.artifactKey === 'etf-market-data') {
      return <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.map((item: any, index) => <div key={item.code || item.ticker || index} className="rounded-xl border p-4"><div className="flex items-start justify-between gap-2"><div><div className="font-medium">{item.name || item.code || item.ticker || '指数基金'}</div><div className="text-xs text-muted-foreground">{item.code || item.ticker || '暂无代码'}</div></div><Badge variant="outline">{String(chineseValue(item.trend || '震荡'))}</Badge></div><div className="mt-3 grid grid-cols-2 gap-3 text-xs"><Metric label="最新价格" value={item.price ?? item.current_price} /><Metric label="涨跌幅" value={item.changePct ?? item.change_pct ?? item.price_change_pct} /><Metric label="20日均线" value={item.keyIndicators?.trend?.ma?.ma20 ?? item.ma20} /><Metric label="相对强弱指标" value={item.keyIndicators?.momentum?.rsi?.rsi12 ?? item.rsi} /><Metric label="波动率" value={item.volatility} /><Metric label="最大回撤" value={item.max_drawdown} /></div></div>)}</div>
    }
    const preferred:Record<string,string[]>={
      'etf-bindings':['etf_code','etf_name','indexCode','indexName'],'etf-holdings':['etfCode','stock_code','stock_name','weight','trade_date','source'],'companies':['stockCode','stockName','stage','segment','source','matchConfidence'],'news-events':['title','category','publishedAt','status','priority','evidenceGrade','materialityScore'],'news-articles':['title','publishTime','source','category'],'etf-actions':['ticker','name','state','unheldAction','heldAction','confidencePct'],
    }
    return <DataTable rows={data} hiddenColumns={artifact.artifactKey === 'etf-bindings' ? ['bind_type', 'bindType','holdings'] : []} preferredColumns={preferred[artifact.artifactKey]||[]} />
  }
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>
    const nestedArrays = Object.entries(record).filter(([, value]) => Array.isArray(value)&&value.length>0)
    if (artifact.artifactKey === 'market-snapshot' && Array.isArray((record.overview as any)?.indices)) {
      const indices = (record.overview as any).indices
      return <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{indices.map((item: any, index: number) => <div key={item.code || index} className="rounded-xl border p-4"><div className="flex items-start justify-between gap-2"><div><div className="font-medium">{item.name || item.code}</div><div className="text-xs text-muted-foreground">{item.code}</div></div><Badge variant="outline">{item.changePct > 0 ? '上涨' : item.changePct < 0 ? '下跌' : '震荡'}</Badge></div><div className="mt-3 grid grid-cols-2 gap-3 text-xs"><Metric label="最新价格" value={item.price} /><Metric label="涨跌幅" value={item.changePct} /><Metric label="20日均线" value={item.indicators?.trend?.ma?.ma20} /><Metric label="相对强弱指标" value={item.indicators?.momentum?.rsi?.rsi12} /><Metric label="指数平滑异同移动平均线" value={item.indicators?.trend?.macd?.macd} /><Metric label="成交量比" value={item.indicators?.volume?.volumeRatio} /></div></div>)}</div><SectorFlowSummary sectors={Array.isArray(record.sectors) ? record.sectors : []} /></div>
    }
    return <div className="space-y-4"><ObjectGrid data={record} />{nestedArrays.map(([key, value]) => <section key={key}><h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><BarChart3 className="h-4 w-4 text-primary" />{labelFor(key)}</h3>{(value as unknown[]).every(item=>typeof item!=='object'||item===null)?<ul className="space-y-2 rounded-lg border bg-muted/15 p-4">{(value as unknown[]).slice(0,30).map((item,index)=><li className="text-sm leading-6 text-muted-foreground" key={index}>{formatValue(item)}</li>)}</ul>:<DataTable rows={value as unknown[]} hiddenColumns={artifact.artifactKey === 'etf-bindings' ? ['bind_type', 'bindType','holdings'] : []}/>}</section>)}</div>
  }
  return <div className="rounded-lg bg-muted/30 p-4 text-sm">{formatValue(data)}</div>
}

export default function StepResultPage() {
  const params = useParams<{ runId: string; stepName: string }>()
  const router = useRouter()
  const [step, setStep] = useState<Step | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/analysis/comprehensive/${params.runId}?view=step&stepName=${encodeURIComponent(decodeURIComponent(params.stepName))}`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('读取流程结果失败')))
      .then((run) => setStep(run.steps.find((item: Step) => item.stepName === decodeURIComponent(params.stepName)) || null))
      .catch((reason) => setError(reason instanceof Error ? reason.message : '读取流程结果失败'))
      .finally(() => setLoading(false))
  }, [params.runId, params.stepName])

  const reportId = useMemo(() => {
    const value = step?.artifacts.find((artifact) => artifact.artifactKey === 'report-id')?.data
    return typeof value === 'string' ? value : value == null ? '' : String(value)
  }, [step])

  const artifactGroups=useMemo(()=>{
    const all=(step?.artifacts||[]).filter(artifact=>!['etf-codes','industry-info','portfolio-decision-validation'].includes(artifact.artifactKey))
    const diagnostics=all.filter(artifact=>diagnosticArtifact(artifact.artifactKey))
    const quality=all.filter(artifact=>!diagnosticArtifact(artifact.artifactKey)&&qualityArtifact(artifact.artifactKey))
    const primary=all.filter(artifact=>!diagnosticArtifact(artifact.artifactKey)&&!qualityArtifact(artifact.artifactKey))
    return {primary,quality,diagnostics,totalSize:all.reduce((sum,item)=>sum+item.size,0)}
  },[step])

  if (loading) return <div className="flex min-h-[400px] items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />加载结果中...</div>
  const analysisUrl = `/comprehensive-analysis?runId=${encodeURIComponent(params.runId)}`

  if (error || !step) return <div className="space-y-4 p-6"><Button variant="ghost" onClick={() => router.push(analysisUrl)}><ArrowLeft className="mr-2 h-4 w-4" />返回综合分析</Button><Card><CardContent className="p-8 text-center text-muted-foreground">{error || '未找到该子流程结果'}</CardContent></Card></div>

  const completed=step.status==='COMPLETED',duration=step.duration==null?'—':step.duration<1000?`${step.duration}毫秒`:`${(step.duration/1000).toFixed(1)}秒`
  const nodeDefinition=comprehensiveWorkflowDefinition.nodes.find(node=>node.id===step.stepName)
  let stepConfig:Record<string,unknown>={}
  try{stepConfig=step.configSnapshot?JSON.parse(step.configSnapshot):{}}catch{}
  return <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6">
    <Button variant="ghost" onClick={() => router.push(analysisUrl)}><ArrowLeft className="mr-2 h-4 w-4" />返回综合分析</Button>
    <header className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6"><div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between"><div className="max-w-3xl"><div className="flex flex-wrap items-center gap-2">{completed?<CheckCircle2 className="size-5 text-emerald-600"/>:step.status==='FAILED'?<AlertTriangle className="size-5 text-destructive"/>:<Database className="size-5 text-primary"/>}<Badge variant="secondary">研究步骤</Badge><Badge variant="outline">{statuses[step.status] || step.status}</Badge><span className="font-mono text-xs text-muted-foreground">{step.stepName}</span></div><h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{titles[step.stepName] || step.stepName}</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">{purposes[step.stepName]||'查看该步骤的输入边界、关键结果、质量校验与审计信息。'}</p>{step.error&&<p className="mt-3 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">{step.error}</p>}</div><div className="flex flex-wrap gap-2">{step.artifacts.some(artifact => artifact.artifactKey === 'ai-prompt') && <PromptDialog artifacts={step.artifacts} />}{reportId && <Button onClick={() => router.push(`/comprehensive-analysis/report/${reportId}`)}><FileText className="mr-2 h-4 w-4" />打开完整报告</Button>}</div></div><div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="flex items-center gap-3 rounded-xl border bg-muted/15 p-3"><Clock3 className="size-4 text-primary"/><div><p className="text-xs text-muted-foreground">执行耗时</p><p className="font-semibold tabular-nums">{duration}</p></div></div><div className="flex items-center gap-3 rounded-xl border bg-muted/15 p-3"><Layers3 className="size-4 text-primary"/><div><p className="text-xs text-muted-foreground">主要产物</p><p className="font-semibold tabular-nums">{artifactGroups.primary.length} 项</p></div></div><div className="flex items-center gap-3 rounded-xl border bg-muted/15 p-3"><Database className="size-4 text-primary"/><div><p className="text-xs text-muted-foreground">归档体积</p><p className="font-semibold tabular-nums">{formatBytes(artifactGroups.totalSize)}</p></div></div></div></header>
    {nodeDefinition&&<section className="rounded-2xl border bg-card p-5 sm:p-6"><div className="mb-4 flex items-center gap-2"><GitBranch className="size-5 text-primary"/><div><h2 className="font-semibold">方法与输入边界</h2><p className="text-xs text-muted-foreground">以下端口来自本轮固化的工作流定义；实际数据版本可在拓扑血缘中继续追踪。</p></div></div><div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]"><div className="rounded-xl border bg-muted/15 p-4"><p className="text-xs text-muted-foreground">执行方法</p><p className="mt-1 text-sm font-semibold">{nodeDefinition.methods.find(method=>method.id===step.methodId)?.label||step.methodId||nodeDefinition.methods.find(method=>method.id===nodeDefinition.defaultMethodId)?.label}</p><p className="mt-1 font-mono text-[10px] text-muted-foreground">{step.methodId||nodeDefinition.defaultMethodId}@{step.methodVersion||nodeDefinition.version}</p>{Object.keys((stepConfig.parameters as Record<string,unknown>)||{}).length>0&&<ObjectGrid data={(stepConfig.parameters as Record<string,unknown>)||{}}/>}</div><div className="grid gap-3 sm:grid-cols-2">{nodeDefinition.inputs.length?nodeDefinition.inputs.map(port=><div key={port.id} className="rounded-xl border bg-background p-4"><div className="flex items-start justify-between gap-2"><p className="text-sm font-medium">{port.label}</p><Badge variant="outline" className="text-[10px]">{port.required?'必需':'可选'}</Badge></div><p className="mt-2 font-mono text-[10px] text-muted-foreground">{port.sourceNodeId}.{port.artifactKey}</p><p className="mt-1 font-mono text-[10px] text-muted-foreground">{port.schemaId}@{port.schemaVersion}</p></div>):<p className="text-sm text-muted-foreground">该模块以创建轮次时固化的研究范围为输入。</p>}</div></div></section>}
    {!!artifactGroups.quality.length&&<section className="rounded-2xl border bg-card p-5 sm:p-6"><div className="mb-4 flex items-center gap-2"><ShieldCheck className="size-5 text-primary"/><div><h2 className="font-semibold">运行与质量</h2><p className="text-xs text-muted-foreground">先确认数据和模型状态，再阅读研究结论。</p></div></div><div className="grid gap-3 lg:grid-cols-2">{artifactGroups.quality.map(artifact=><div key={artifact.artifactKey} className="rounded-xl border bg-background p-4"><div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-sm font-medium">{labelFor(artifact.artifactKey)}</h3><span className="text-xs text-muted-foreground">{formatBytes(artifact.size)}</span></div><VisualArtifact artifact={artifact}/></div>)}</div></section>}
    {artifactGroups.primary.length===0?<Card><CardContent className="p-8 text-center text-muted-foreground">该步骤没有主要研究产物；请查看上方运行状态。</CardContent></Card>:<section className="space-y-4"><div><h2 className="text-xl font-semibold tracking-tight">主要结果</h2><p className="mt-1 text-sm text-muted-foreground">经过筛选的业务内容；大对象已摘要化，避免原始字段干扰阅读。</p></div>{artifactGroups.primary.map(artifact=><Card key={artifact.artifactKey}><CardHeader className="space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><CardTitle className="text-base">{labelFor(artifact.artifactKey)}</CardTitle><Badge variant="outline" className="text-[10px]">{artifactTypes[artifact.artifactType] || '数据'}</Badge>{artifact.truncated&&<Badge variant="secondary" className="text-[10px]">摘要展示</Badge>}</div><span className="text-xs text-muted-foreground">{formatBytes(artifact.size)}</span></div>{artifactDescriptions[artifact.artifactKey]&&<p className="text-xs leading-5 text-muted-foreground">{artifactDescriptions[artifact.artifactKey]}</p>}</CardHeader><CardContent className="space-y-4"><VisualArtifact artifact={artifact}/>{artifact.artifactKey==='report-id'&&<Button variant="link" className="px-0" onClick={()=>router.push(`/comprehensive-analysis/report/${reportId}`)}>查看报告 <ExternalLink className="ml-1 size-3"/></Button>}{!artifact.truncated&&artifact.size<500_000&&<details className="group rounded-lg border bg-muted/10"><summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs text-muted-foreground"><ChevronDown className="size-3.5 transition-transform group-open:rotate-180"/>查看原始数据（调试用）</summary><pre className="max-h-[360px] overflow-auto whitespace-pre-wrap border-t bg-muted/30 p-3 font-mono text-xs leading-5">{pretty(artifact.data)}</pre></details>}{artifact.truncated&&<p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">原始数据体积较大，本页只返回业务摘要；完整记录仍保存在冻结快照中。</p>}</CardContent></Card>)}</section>}
    {!!artifactGroups.diagnostics.length&&<details className="group rounded-2xl border bg-card"><summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3"><span><span className="block font-medium">高级诊断</span><span className="block text-xs text-muted-foreground">模型响应、输入审计和图谱使用校验，共 {artifactGroups.diagnostics.length} 项</span></span><ChevronDown className="size-4 transition-transform group-open:rotate-180"/></summary><div className="grid gap-3 border-t p-4 lg:grid-cols-2">{artifactGroups.diagnostics.map(artifact=><div key={artifact.artifactKey} className="rounded-xl border p-4"><div className="flex items-center justify-between gap-2"><h3 className="text-sm font-medium">{labelFor(artifact.artifactKey)}</h3><span className="text-xs text-muted-foreground">{formatBytes(artifact.size)}</span></div><details className="mt-3"><summary className="cursor-pointer text-xs text-primary">查看诊断内容</summary><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/30 p-3 font-mono text-xs leading-5">{pretty(artifact.data)}</pre></details></div>)}</div></details>}
  </div>
}
