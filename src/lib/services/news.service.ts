// src/lib/services/news.service.ts
// 新闻数据服务

import { dataClient, ApiResponse } from '@/lib/data-client'

export interface NewsArticle {
  id: string
  title: string
  content: string
  summary?: string
  source: string
  url?: string
  publishTime: string
  category: string
  sentiment?: number
  impact?: number
}

export interface NewsFeed {
  total: number
  items: NewsArticle[]
}

export const newsService = {
  async getFeed(params?: {
    category?: string
    limit?: number
    offset?: number
  }): Promise<ApiResponse<NewsFeed>> {
    const queryParams: Record<string, string> = {}
    if (params?.category) queryParams.category = params.category
    if (params?.limit) queryParams.limit = String(params.limit)
    if (params?.offset) queryParams.offset = String(params.offset)

    return dataClient.get<NewsFeed>('/api/news/feed', queryParams)
  },

  async getAIHardwareNews(limit: number = 20): Promise<ApiResponse<NewsArticle[]>> {
    return dataClient.get<NewsArticle[]>('/api/news/ai-hardware', {
      limit: String(limit),
    })
  },
}
