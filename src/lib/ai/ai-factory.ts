import { ClaudeClient } from './claude'
import type { AIScene } from './scene-catalog'
export type AIProvider = 'anthropic' | 'claude' | 'chatgpt' | 'openai'
export interface AIClient {
  analyzeEvent: ClaudeClient['analyzeEvent']
  complete: ClaudeClient['complete']
}
export function getAIClient(scene: AIScene = 'comprehensive'): AIClient {
  return new ClaudeClient({ scene })
}
export const aiClient = getAIClient()
export const matchingAIClient = getAIClient('matching')
