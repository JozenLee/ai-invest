import type { StepContext } from './types'

/** Keep stepId real for workflow persistence; namespace only substage artifacts.
 * Global billing/access blocks stay shared. Attempts resume within their own scope. */
export function scopedAnalysisContext(context: StepContext, scope: string): StepContext {
  if (!/^[a-z][a-z0-9-]*$/.test(scope)) throw new Error('Invalid analysis scope')
  const prefix = `${scope}-`
  const shared = new Set(['ai-service-status', 'ai-access-status'])
  const artifacts = new Map(context.artifacts)
  let previousAIRequestAttempt = 0
  for (const [key] of context.artifacts) {
    if (key.startsWith('ai-') && !shared.has(key)) artifacts.delete(key)
  }
  for (const [key, value] of context.artifacts) {
    if (key.startsWith(prefix)) {
      const local = key.slice(prefix.length)
      artifacts.set(local, value)
      const match = /^ai-(?:request|response|error)-attempt-(\d+)$/.exec(local)
      if (match) previousAIRequestAttempt = Math.max(previousAIRequestAttempt, Number(match[1]))
    }
  }
  return {
    ...context, artifacts, previousAIRequestAttempt,
    saveArtifact: async (key, value, type) => {
      const target = key.startsWith('ai-') && !shared.has(key) ? prefix + key : key
      await context.saveArtifact(target, value, type)
      context.artifacts.set(target, value)
      artifacts.set(key, value)
    },
  }
}

