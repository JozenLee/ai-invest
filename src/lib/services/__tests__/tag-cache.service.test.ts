import { describe, it, expect, beforeEach } from 'vitest'
import { tagCacheService } from '../tag-cache.service'
import { tagService } from '../tag.service'

describe('TagCacheService', () => {
  beforeEach(async () => {
    await tagCacheService.invalidateTagCache()
  })

  it('should cache tag tree', async () => {
    const tree1 = await tagCacheService.getCachedTagTree()
    const tree2 = await tagCacheService.getCachedTagTree()

    expect(tree1).toBeDefined()
    expect(tree2).toBeDefined()
    // 第二次应该从缓存读取，所以是同一个引用
    expect(tree1).toBe(tree2)
  })

  it('should invalidate cache', async () => {
    const tree1 = await tagCacheService.getCachedTagTree()

    await tagCacheService.invalidateTagCache()

    const tree2 = await tagCacheService.getCachedTagTree()

    // 缓存失效后，应该是新的引用
    expect(tree1).not.toBe(tree2)
  })

  it('should cache tag by code', async () => {
    // 从现有标签中取一个
    const tree = await tagService.getTagTree()
    if (tree.length > 0) {
      const code = tree[0].code

      const tag1 = await tagCacheService.getCachedTagByCode(code)
      const tag2 = await tagCacheService.getCachedTagByCode(code)

      expect(tag1).not.toBeNull()
      expect(tag1).toBe(tag2) // 应该是同一个引用
    }
  })

  it('should warmup cache', async () => {
    await tagCacheService.warmupCache()

    // 验证缓存已预热（后续读取应该很快）
    const tree = await tagCacheService.getCachedTagTree()
    expect(tree).toBeDefined()
  })
})
