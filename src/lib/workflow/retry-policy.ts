export function retryableAnalysisError(error:unknown){
  const message=error instanceof Error?error.message:String(error)
  if(/timed?\s*out|timeout|aborted|aborterror/i.test(message))return false
  return /领域研究校验失败|投资结论一致性校验失败|执行条件校验失败|产品证据校验失败|数值事实校验失败|overload|rate.?limit|429|502|503|504|connection|network|AI返回空内容|AI输出被截断|unterminated string|unexpected end of json|unexpected token|not valid json|智能分析输出必须是JSON对象|输出缺少字段|AI逐产品决策范围不完整|JSON at position/i.test(message)
}
