export function retryableAnalysisError(error:unknown){
  const message=error instanceof Error?error.message:String(error)
  if(/timed?\s*out|timeout|aborted|aborterror/i.test(message))return false
  return /overload|rate.?limit|429|502|503|504|connection|network|AI返回空内容|AI输出被截断|unterminated string|unexpected end of json|unexpected token|not valid json|智能分析输出必须是JSON对象|输出缺少字段|JSON at position/i.test(message)
}
