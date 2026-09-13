/** Retry only short, idempotent database operations. Never wrap model calls or a recapture of evidence. */
export function isDatabaseBusy(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== 'object' || depth > 4) return false
  const row = error as Record<string, unknown>
  if ([row.message,row.code,row.originalMessage].some(value => typeof value === 'string' && /SQLITE_BUSY|SQLITE_LOCKED|database (?:is |table is )?locked/i.test(value))) return true
  return [row.cause,row.meta,row.driverAdapterError].some(value => isDatabaseBusy(value, depth + 1))
}
export async function withDatabaseBusyRetry<T>(operation: () => Promise<T>, options: { attempts?: number; pause?: (ms: number) => Promise<void> } = {}): Promise<T> {
  const attempts = options.attempts ?? 5
  const pause = options.pause || ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)))
  for (let attempt = 0; ; attempt++) {
    try { return await operation() }
    catch (error) {
      if (!isDatabaseBusy(error) || attempt + 1 >= attempts) throw error
      await pause(Math.min(2000, 200 * 2 ** attempt))
    }
  }
}
