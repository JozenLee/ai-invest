import Anthropic from '@anthropic-ai/sdk'
import type { AIScene } from './scene-catalog'
import { getSceneSettings } from './scene-settings'

/** Resolve configuration for each request, including clients held by background services. */
export function sceneAnthropic(scene: AIScene, options: ConstructorParameters<typeof Anthropic>[0] = {}): Anthropic {
  let cached: Anthropic | undefined
  let fingerprint = ''
  function resolve() {
    const config = getSceneSettings(scene)
    const key = config.apiKey || options?.apiKey
    if (!key) throw new Error('请在设置中配置 AI API Token')
    const next = JSON.stringify([key, config.baseURL])
    if (!cached || fingerprint !== next) {
      cached = new Anthropic({ ...options, apiKey: key, baseURL: config.baseURL || options?.baseURL })
      fingerprint = next
    }
    return { client: cached, config }
  }
  return { messages: new Proxy({}, { get(_target, method) {
    return (params: Record<string, unknown>, ...args: unknown[]) => {
      const { client, config } = resolve()
      const messages = client.messages as unknown as Record<PropertyKey, (...args: unknown[]) => unknown>
      return messages[method].call(client.messages, { ...params, model: config.model, max_tokens: Math.min(Number(params.max_tokens) || config.maxTokens, config.maxTokens) }, ...args)
    }
  } }) } as Anthropic
}
