/** Transport failures may arrive as SDK errors or JSON encoded gateway errors. */
export function upstreamAnalysisGatewayError(error:unknown){
  // An SSE gateway upstream failure is different from our own HTTP 401/403.
  // Never retry invalid credentials or an explicit API permission error.
  const status=error&&typeof error==='object'&&'status' in error?Number(error.status):null
  if(status===401||status===403)return false
  const message=error instanceof Error?error.message:String(error)
  try{
    const payload=JSON.parse(message)
    return payload?.error?.type==='upstream_error'||payload?.type==='upstream_error'
  }catch{return false}
}

export function transientAnalysisTransportError(error:unknown){
  const message=error instanceof Error?error.message:String(error)
  return /stream_read_error|upstream stream disconnected|unexpected EOF|premature close|stream.*terminated|^terminated$|ECONNRESET|EPIPE|UND_ERR_SOCKET|connection error|network error|fetch failed/i.test(message)
}

export function retryableAnalysisError(error:unknown){
  const message=error instanceof Error?error.message:String(error)
  if(analysisAccountUnavailable(error)||/aborted|aborterror/i.test(message))return false
  if(upstreamAnalysisGatewayError(error))return true
  if(transientAnalysisTransportError(error))return true
  if(/timed?\s*out|timeout/i.test(message))return true
  return /overload|rate.?limit|429|502|503|504|connection|network|AI返回空内容|AI输出被截断|unterminated string|unexpected end of json|unexpected token|not valid json|智能分析输出必须是JSON对象|输出缺少字段|输出字段类型错误|输出包含|输出校验失败|JSON at position/i.test(message)
}

/** Billing failures are not market evidence and must not trigger another paid retry. */
export function analysisAccountUnavailable(error:unknown){
  const message=error instanceof Error?error.message:String(error)
  return /insufficient account balance|credit balance (?:is )?too low|insufficient credits|billing hard limit/i.test(message)
}
