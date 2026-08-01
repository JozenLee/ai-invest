import { describe, it, expect, beforeEach } from 'vitest'
import { tagService } from '../tag.service'
import { prisma } from '@/lib/db/prisma'

describe('TagService', () => {
  beforeEach(async () => {
    // 清理测试数据
    await prisma.tag.deleteMany({
      where: { code: { startsWith: 'test_' } }
    })
  })

  it('should create a tag', async () => {
    const tag = await tagService.createTag({
      name: '测试领域',
      code: 'test_domain',
      type: 'domain',
      level: 1,
      description: '测试描述'
    })

    expect(tag.name).toBe('测试领域')
    expect(tag.code).toBe('test_domain')
    expect(tag.level).toBe(1)
  })

  it('should get tag by code', async () => {
    await tagService.createTag({
      name: '测试标签',
      code: 'test_tag_001',
      type: 'tech',
      level: 2
    })

    const tag = await tagService.getTagByCode('test_tag_001')
    expect(tag).not.toBeNull()
    expect(tag?.name).toBe('测试标签')
  })

  it('should build tag tree', async () => {
    const parent = await tagService.createTag({
      name: '父标签',
      code: 'test_parent',
      type: 'domain',
      level: 1
    })

    await tagService.createTag({
      name: '子标签',
      code: 'test_child',
      type: 'tech',
      level: 2,
      parentId: parent.id
    })

    const tree = await tagService.getTagTree()
    const testParent = tree.find(t => t.code === 'test_parent')

    expect(testParent).toBeDefined()
    expect(testParent?.children).toHaveLength(1)
    expect(testParent?.children[0].code).toBe('test_child')
  })

  it('should throw error when creating duplicate code', async () => {
    await tagService.createTag({
      name: '标签1',
      code: 'test_dup',
      type: 'domain',
      level: 1
    })

    await expect(
      tagService.createTag({
        name: '标签2',
        code: 'test_dup',
        type: 'tech',
        level: 2
      })
    ).rejects.toThrow('Tag code already exists')
  })

  it('should get tag ancestors', async () => {
    const level1 = await tagService.createTag({
      name: 'L1',
      code: 'test_l1',
      type: 'domain',
      level: 1
    })

    const level2 = await tagService.createTag({
      name: 'L2',
      code: 'test_l2',
      type: 'tech',
      level: 2,
      parentId: level1.id
    })

    const level3 = await tagService.createTag({
      name: 'L3',
      code: 'test_l3',
      type: 'tech',
      level: 3,
      parentId: level2.id
    })

    const ancestors = await tagService.getTagAncestors(level3.id)
    expect(ancestors).toHaveLength(3)
    expect(ancestors[0].code).toBe('test_l1')
    expect(ancestors[1].code).toBe('test_l2')
    expect(ancestors[2].code).toBe('test_l3')
  })
})
