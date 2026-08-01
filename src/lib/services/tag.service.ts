import { prisma } from '@/lib/db/prisma'
import type { Tag, Prisma } from '@prisma/client'

export interface TagTreeNode extends Tag {
  children: TagTreeNode[]
}

export interface CreateTagInput {
  name: string
  code: string
  type: 'domain' | 'tech' | 'company' | 'concept'
  level: number
  parentId?: string
  description?: string
  keywords?: string
  sortOrder?: number
}

export interface UpdateTagInput {
  name?: string
  description?: string
  keywords?: string
  isActive?: boolean
  sortOrder?: number
}

export class TagService {
  /**
   * 获取标签树（完整层级结构）
   */
  async getTagTree(): Promise<TagTreeNode[]> {
    const allTags = await prisma.tag.findMany({
      where: { isActive: true },
      orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }]
    })

    const tagMap = new Map<string, TagTreeNode>()
    const rootTags: TagTreeNode[] = []

    // 初始化所有节点
    for (const tag of allTags) {
      tagMap.set(tag.id, { ...tag, children: [] })
    }

    // 构建树形结构
    for (const tag of allTags) {
      const node = tagMap.get(tag.id)!

      if (tag.parentId) {
        const parent = tagMap.get(tag.parentId)
        if (parent) {
          parent.children.push(node)
        }
      } else {
        rootTags.push(node)
      }
    }

    return rootTags
  }

  /**
   * 根据ID获取标签
   */
  async getTagById(id: string): Promise<Tag | null> {
    return prisma.tag.findUnique({
      where: { id }
    })
  }

  /**
   * 根据code获取标签
   */
  async getTagByCode(code: string): Promise<Tag | null> {
    return prisma.tag.findUnique({
      where: { code }
    })
  }

  /**
   * 创建标签
   */
  async createTag(data: CreateTagInput): Promise<Tag> {
    // 验证parentId存在
    if (data.parentId) {
      const parent = await this.getTagById(data.parentId)
      if (!parent) {
        throw new Error(`Parent tag not found: ${data.parentId}`)
      }
      if (parent.level >= data.level) {
        throw new Error(`Child level must be greater than parent level`)
      }
    }

    // 检查code唯一性
    const existing = await this.getTagByCode(data.code)
    if (existing) {
      throw new Error(`Tag code already exists: ${data.code}`)
    }

    const tag = await prisma.tag.create({
      data: {
        name: data.name,
        code: data.code,
        type: data.type,
        level: data.level,
        parentId: data.parentId,
        description: data.description,
        keywords: data.keywords,
        sortOrder: data.sortOrder ?? 0,
        isActive: true
      }
    })

    // 清除缓存
    const { tagCacheService } = await import('./tag-cache.service')
    await tagCacheService.invalidateTagCache()

    return tag
  }

  /**
   * 更新标签
   */
  async updateTag(id: string, data: UpdateTagInput): Promise<Tag> {
    const existing = await this.getTagById(id)
    if (!existing) {
      throw new Error(`Tag not found: ${id}`)
    }

    const tag = await prisma.tag.update({
      where: { id },
      data
    })

    // 清除缓存
    const { tagCacheService } = await import('./tag-cache.service')
    await tagCacheService.invalidateTagCache()

    return tag
  }

  /**
   * 删除标签（软删除）
   */
  async deleteTag(id: string): Promise<void> {
    const tag = await this.getTagById(id)
    if (!tag) {
      throw new Error(`Tag not found: ${id}`)
    }

    // 检查是否有子标签
    const children = await prisma.tag.count({
      where: { parentId: id, isActive: true }
    })

    if (children > 0) {
      throw new Error(`Cannot delete tag with active children`)
    }

    await prisma.tag.update({
      where: { id },
      data: { isActive: false }
    })

    // 清除缓存
    const { tagCacheService } = await import('./tag-cache.service')
    await tagCacheService.invalidateTagCache()
  }

  /**
   * 获取标签的所有祖先（从根到当前）
   */
  async getTagAncestors(tagId: string): Promise<Tag[]> {
    const ancestors: Tag[] = []
    let currentId: string | null = tagId

    while (currentId) {
      const tag = await this.getTagById(currentId)
      if (!tag) break

      ancestors.unshift(tag)
      currentId = tag.parentId
    }

    return ancestors
  }
}

export const tagService = new TagService()
