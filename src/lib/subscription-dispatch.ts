export async function notifySubscriptionWorker() {
  const configured = new URL(process.env.DATA_SERVICE_URL || 'http://localhost:8000')
  // The bundled Python service listens on IPv4; localhost may resolve to ::1.
  if (configured.hostname === 'localhost') configured.hostname = '127.0.0.1'
  const serviceUrl = configured.toString().replace(/\/$/, '')
  try {
    const response = await fetch(`${serviceUrl}/api/data/local/subscriptions/refresh-due`, { method: 'POST', signal: AbortSignal.timeout(10000) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const payload = await response.json()
    if (!payload.success) throw new Error('后台未接受任务')
  } catch (error) {
    throw new Error(`无法启动数据同步：${error instanceof Error ? error.message : '数据服务不可用'}。请检查数据服务后重试。`)
  }
}
