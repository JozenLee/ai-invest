export const COMPANY_DATASET_KEYS = ['constituent_stock_realtime', 'constituent_stock_daily', 'stock_financial', 'stock_announcement']

type DatasetState = { datasetKey: string; enabled: boolean; status: string; lastError?: string | null; lastSuccessAt?: Date | null }

function canonicalCompanyCode(code: string) {
  return code.toLowerCase().replace(/^(sh|sz)/, '').replace(/\.(sh|sz)$/, '').replace(/^(\d+)\.hk$/, (_match, digits: string) => `${digits.replace(/^0+/, '') || '0'}.hk`)
}

export function syncErrorMessage(error?: string | null) {
  if (!error) return ''
  try { return String(JSON.parse(error).message || error) } catch { return error }
}

// Only datasets belonging to ETFs that hold this company may affect its state.
// A partial batch identifies the individual companies that failed.
export function companySyncState(stockCode: string, datasets: DatasetState[]) {
  const relevant = datasets.filter((item) => item.enabled && COMPANY_DATASET_KEYS.includes(item.datasetKey))
  const states = relevant.map((item) => {
    if (item.status === 'partial' && item.lastError) {
      try {
        const detail = JSON.parse(item.lastError) as { failedCodes?: string[]; succeededCodes?: string[] }
        const matches = (code: string) => canonicalCompanyCode(code) === canonicalCompanyCode(stockCode)
        if (detail.failedCodes?.some(matches)) return { ...item, status: 'failed' }
        if (detail.succeededCodes?.some(matches)) return { ...item, status: 'success', lastError: null }
      } catch { /* Legacy unstructured errors remain visible. */ }
    }
    return item
  })
  const busy = states.some((item) => ['queued', 'running'].includes(item.status))
  const failed = states.filter((item) => ['failed', 'partial'].includes(item.status))
  const succeeded = states.filter((item) => item.status === 'success')
  const status = busy ? 'running' : failed.length ? (succeeded.length ? 'partial' : 'failed') : states.length && succeeded.length === states.length ? 'success' : 'pending'
  const lastSuccess = states.reduce<Date | null>((latest, item) => item.lastSuccessAt && (!latest || item.lastSuccessAt > latest) ? item.lastSuccessAt : latest, null)
  return { status, lastError: [...new Set(failed.map((item) => syncErrorMessage(item.lastError)).filter(Boolean))].join('；') || null, lastSyncedAt: lastSuccess?.toISOString() || null }
}

export type SyncRun = { status: string; error?: string | null }
export function completedRunError(runs: SyncRun[], expected: number): string | null {
  if (runs.length !== expected || runs.some((run) => !['success', 'failed', 'partial'].includes(run.status))) return null
  const failed = runs.filter((run) => run.status !== 'success')
  return failed.length ? `${failed.length}/${expected} 个数据集未完整同步：${syncErrorMessage(failed[0].error) || '数据获取失败'}。可重新同步。` : ''
}

export async function waitForSubscriptionRuns(runIds: string[], fetcher: typeof fetch = fetch, pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)), attempts = 120) {
  if (!runIds.length) return
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetcher(`/api/data-subscriptions/runs?ids=${runIds.join(',')}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) })
    const payload = await response.json()
    if (!response.ok || !payload.success) throw new Error(payload.error || '读取同步状态失败，请刷新页面重试')
    const error = completedRunError(payload.data || [], runIds.length)
    if (error !== null) {
      if (error) throw new Error(error)
      return
    }
    await pause(1000)
  }
  throw new Error('等待超过 2 分钟，同步仍在后台继续，页面会持续更新状态；这不代表同步成功。')
}
