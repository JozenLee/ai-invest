import { readFileSync, writeFileSync, renameSync, statSync } from 'node:fs'
import path from 'node:path'
import { parse } from 'dotenv'
import { AI_SCENES, type AIScene, type PublicAISetting } from './scene-catalog'

export const settingsPath = () => path.join(process.cwd(), '.env')
function environment() {
  try { return { ...process.env, ...parse(readFileSync(settingsPath())) } }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return process.env; throw error }
}
export function getSceneSettings(scene: AIScene) {
  const env = environment()
  const prefix = `AI_${scene.toUpperCase()}_`
  const budget = Number(env[`${prefix}MAX_TOKENS`])
  return {
    model: env[`${prefix}MODEL`] || AI_SCENES[scene].model,
    maxTokens: budget > 0 ? budget : AI_SCENES[scene].maxTokens,
    customMaxTokens: budget > 0,
    apiKey: env[`${prefix}API_KEY`] || env.ANTHROPIC_API_KEY || '',
    baseURL: env.ANTHROPIC_BASE_URL || undefined,
    tokenSource: (env[`${prefix}API_KEY`] ? 'scene' : env.ANTHROPIC_API_KEY ? 'global' : 'none') as PublicAISetting['tokenSource'],
  }
}
export function publicSettings(): PublicAISetting[] {
  return (Object.keys(AI_SCENES) as AIScene[]).map(scene => {
    const { apiKey, model, maxTokens, customMaxTokens, tokenSource } = getSceneSettings(scene)
    return { scene, model, maxTokens, customMaxTokens, tokenSource, tokenConfigured: !!apiKey }
  })
}
// Only the settings UI uses this response; other consumers retain redacted metadata.
export function settingsForDisplay() {
  return publicSettings().map(row => ({ ...row, apiKey: getSceneSettings(row.scene).apiKey }))
}
export class SettingsValidationError extends Error {}
export function saveSceneSettings(input: unknown) {
  if (!Array.isArray(input) || input.length !== Object.keys(AI_SCENES).length) throw new SettingsValidationError('请提交全部场景配置')
  const updates: Record<string, string> = {}
  const seen = new Set<string>()
  for (const row of input) {
    if (!row || !Object.hasOwn(AI_SCENES, row.scene) || seen.has(row.scene)) throw new SettingsValidationError('场景无效或重复')
    seen.add(row.scene)
    if (typeof row.model !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(row.model)) throw new SettingsValidationError('模型名称格式无效')
    if (!Number.isInteger(row.maxTokens) || row.maxTokens < 256 || row.maxTokens > 65536) throw new SettingsValidationError('输出 Token 上限须为 256–65536 的整数')
    if (row.apiKey !== undefined && (typeof row.apiKey !== 'string' || !/^[a-zA-Z0-9._:/+=-]{0,4096}$/.test(row.apiKey))) throw new SettingsValidationError('API Token 格式无效')
    const prefix = `AI_${row.scene.toUpperCase()}_`
    updates[`${prefix}MODEL`] = row.model
    updates[`${prefix}MAX_TOKENS`] = String(row.maxTokens)
    // Omitted/empty input preserves a secret; explicit reset restores global inheritance.
    if (row.resetToken === true) updates[`${prefix}API_KEY`] = ''
    else if (row.apiKey) updates[`${prefix}API_KEY`] = row.apiKey
  }
  const file = settingsPath()
  let original = ''
  let mode = 0o600
  try { original = readFileSync(file, 'utf8'); mode = statSync(file).mode & 0o777 }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  for (const [key, value] of Object.entries(updates)) {
    const pattern = new RegExp(`^(?:export\\s+)?${key}\\s*=.*$`, 'gm')
    if (pattern.test(original)) original = original.replace(pattern, `${key}=${value}`)
    else original += `${original.endsWith('\n') || !original ? '' : '\n'}${key}=${value}\n`
  }
  const temp = `${file}.${process.pid}.tmp`
  writeFileSync(temp, original, { mode })
  renameSync(temp, file)
  return publicSettings()
}
