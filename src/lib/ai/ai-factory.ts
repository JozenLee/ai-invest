// AI客户端工厂
// 根据环境变量选择使用Claude或OpenAI

import { ClaudeClient } from './claude'
import { OpenAIClient } from './openai'

export type AIProvider = 'claude' | 'openai'

export interface AIClient {
  analyzeEvent: ClaudeClient['analyzeEvent']
  complete: ClaudeClient['complete']
}

/**
 * 获取AI客户端
 * 根据环境变量 AI_PROVIDER 决定使用哪个提供商
 */
export function getAIClient(): AIClient {
  const provider = (process.env.AI_PROVIDER || 'claude') as AIProvider

  switch (provider) {
    case 'openai':
      return new OpenAIClient()
    case 'claude':
    default:
      return new ClaudeClient()
  }
}

// 全局单例
export const aiClient = getAIClient()
