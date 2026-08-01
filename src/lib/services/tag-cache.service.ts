import { tagService, type TagTreeNode } from './tag.service'
import type { Tag } from '@prisma/client'

// 缓存键
const CACHE_KEY_TAG_TREE = 'tag:tree'
const CACHE_KEY_TAG_BY_CODE = 'tag:by-code:'
const CACHE_TTL = 3600 // 1小时

// 内存缓存（降级方案）
let memoryCache: {
  tagTree: TagTreeNode[] | null
  tagByCode: Map<string, Tag>
  lastUpdate: number
} = {
  tagTree: null,
  tagByCode: new Map(),
  lastUpdate: 0
}

export class TagCacheService {
  /**
   * 获取缓存的标签树
   */
  async getCachedTagTree(): Promise<TagTreeNode[]> {
    try {
      // 尝试从内存缓存读取
      const now = Date.now()
      if (memoryCache.tagTree && (now - memoryCache.lastUpdate) < CACHE_TTL * 1000) {
        return memoryCache.tagTree
      }

      // 从数据库读取
      const tree = await tagService.getTagTree()

      // 更新内存缓存
      memoryCache.tagTree = tree
      memoryCache.lastUpdate = now

      return tree

    } catch (error) {
      console.error('Failed to get cached tag tree:', error)

      // 降级：直接从数据库读取
      return tagService.getTagTree()
    }
  }

  /**
   * 获取缓存的标签（通过code）
   */
  async getCachedTagByCode(code: string): Promise<Tag | null> {
    try {
      // 检查内存缓存
      const cached = memoryCache.tagByCode.get(code)
      if (cached) {
        return cached
      }

      // 从数据库读取
      const tag = await tagService.getTagByCode(code)

      // 更新内存缓存
      if (tag) {
        memoryCache.tagByCode.set(code, tag)
      }

      return tag

    } catch (error) {
      console.error('Failed to get cached tag by code:', error)
      return tagService.getTagByCode(code)
    }
  }

  /**
   * 使缓存失效
   */
  async invalidateTagCache(): Promise<void> {
    try {
      // 清空内存缓存
      memoryCache.tagTree = null
      memoryCache.tagByCode.clear()
      memoryCache.lastUpdate = 0

      console.log('Tag cache invalidated')

    } catch (error) {
      console.error('Failed to invalidate tag cache:', error)
    }
  }

  /**
   * 预热缓存
   */
  async warmupCache(): Promise<void> {
    console.log('Warming up tag cache...')
    await this.getCachedTagTree()
    console.log('Tag cache warmed up')
  }
}

export const tagCacheService = new TagCacheService()
