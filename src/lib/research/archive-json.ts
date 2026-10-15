import { createHash } from 'node:crypto'

/** Producers hash the bytes they persist. JSON parse/stringify changes Python
 * floats (1.0 → 1) and Unicode escapes; never use that to verify raw imports. */
export function readVerifiedArchive<T>(row: { payload: string; contentHash: string }): T {
  const hash = createHash('sha256').update(row.payload).digest('hex')
  if (hash !== row.contentHash) throw new Error('历史价格归档校验失败')
  return JSON.parse(row.payload) as T
}
