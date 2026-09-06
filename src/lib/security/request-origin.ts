export function sameOriginRequest(request: Request) {
  const origin=request.headers.get('origin')
  if(!origin)return true // Local scheduler and CLI calls have no browser Origin.
  try{return new URL(origin).host===(request.headers.get('host')||new URL(request.url).host)}catch{return false}
}
