type Attempt = { startedAt: Date | string; completedAt: Date | string | null; status: string }
type Step = { stepName: string; attempts: Attempt[]; artifacts: Array<{artifactKey:string;data:string|null}> }
/** Merge concurrent intervals; summing durations would overcount parallel work. */
export function workflowPerformance(startedAt: Date | string, steps: Step[], now: Date | string = new Date()) {
  const end=+new Date(now),start=+new Date(startedAt)
  const intervals=steps.flatMap(step=>step.attempts.map(attempt=>[Math.max(start,+new Date(attempt.startedAt)),Math.min(end,attempt.completedAt?+new Date(attempt.completedAt):end)]))
    .filter(([a,b])=>Number.isFinite(a)&&Number.isFinite(b)&&b>=a).sort((a,b)=>a[0]-b[0])
  let activeMs=0,through=start
  for(const [a,b] of intervals){activeMs+=Math.max(0,b-Math.max(a,through));through=Math.max(through,b)}
  const requests=steps.flatMap(step=>step.artifacts.filter(item=>/^ai-response-execution-\d+-request-\d+$/.test(item.artifactKey)).flatMap(item=>{
    try{return [JSON.parse(item.data||'{}')]}catch{return []}
  }))
  return {wallMs:Math.max(0,end-start),activeMs,idleMs:Math.max(0,end-start-activeMs),
    failedRequests:steps.flatMap(step=>step.artifacts).filter(item=>/^ai-error-execution-\d+-request-\d+$/.test(item.artifactKey)).length,
    failedAttempts:steps.flatMap(step=>step.attempts).filter(attempt=>attempt.status==='FAILED').length,
    inputTokens:requests.reduce((sum,row)=>sum+Number(row.usage?.input_tokens||0),0),outputTokens:requests.reduce((sum,row)=>sum+Number(row.usage?.output_tokens||0),0),
    requestCount:requests.length,basis:'活动耗时按并行尝试区间合并；等待包含中断与调度间隔；tokens仅包含已保存响应，不是账单总额'}
}
