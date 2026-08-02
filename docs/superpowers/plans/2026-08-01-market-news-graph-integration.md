# 市场数据、资讯流与知识图谱联动系统实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现市场数据、新闻资讯与知识图谱的深度联动，提供统一标签体系和实时数据关联

**Architecture:** 
- 新增统一Tag标签系统（多层级树形结构）支持新闻和图谱的标签化
- 通过关联表（NewsArticleTag、GraphNodeTag、GraphNodeETF）建立多对多关系
- 新闻入库时通过AI分析实时提取标签并关联图谱节点，触发节点统计更新
- 市场数据页面按子图聚合展示ETF涨跌和新闻热度

**Tech Stack:** 
- Next.js 16 + TypeScript
- Prisma ORM + SQLite
- Claude API (标签提取和分类)
- Redis (缓存和防抖)

## Global Constraints

- Node.js >= 18
- TypeScript strict mode
- Prisma Client 必须在schema变更后重新生成
- 所有数据库操作需要事务保护
- API响应时间目标 < 500ms
- 新闻处理延迟目标 < 10秒
- 标签匹配准确率目标 > 85%
- 保持向后兼容，不破坏现有Domain和GraphNode功能

---

## File Structure

### Phase 1: 数据模型与基础设施

**Database Schema:**
- `prisma/schema.prisma` - 新增5个model和扩展现有model的relations

**Migration Scripts:**
- `prisma/migrations/YYYYMMDD_add_tag_system/migration.sql` - Tag系统迁移
- `scripts/migrate-domain-to-tags.ts` - Domain到Tag数据迁移
- `scripts/migrate-etf-bindings.ts` - ETF绑定数据迁移

**API Routes - Tag Management:**
- `src/app/api/tags/route.ts` - 标签CRUD
- `src/app/api/tags/tree/route.ts` - 标签树查询
- `src/app/api/tags/[id]/route.ts` - 单个标签操作

**API Routes - ETF Binding:**
- `src/app/api/graph/nodes/[id]/etfs/route.ts` - 节点ETF绑定管理

**Services:**
- `src/lib/services/tag.service.ts` - 标签业务逻辑
- `src/lib/services/tag-cache.service.ts` - 标签缓存管理

### Phase 2: 新闻实时关联

**AI Service Extensions:**
- `src/lib/ai/news-analysis.service.ts` - 扩展新闻AI分析（增加标签提取）
- `src/lib/ai/prompts/news-tag-extraction.ts` - AI标签提取prompt

**Matching Services:**
- `src/lib/services/tag-matching.service.ts` - 标签匹配逻辑
- `src/lib/services/node-matching.service.ts` - 图谱节点匹配
- `src/lib/services/node-stats-update.service.ts` - 节点统计更新

**Background Jobs:**
- `src/lib/jobs/news-analysis.job.ts` - 新闻分析异步任务
- `src/lib/jobs/node-stats-update.job.ts` - 节点统计更新任务

**API Extensions:**
- `src/app/api/events/feed/route.ts` - 修改返回标签信息
- `src/app/api/graph/nodes/[id]/news/route.ts` - 新增节点新闻查询

### Phase 3: 市场数据展示

**API Routes:**
- `src/app/api/market/subgraph-overview/route.ts` - 子图市场数据聚合

**Services:**
- `src/lib/services/market-aggregation.service.ts` - 市场数据聚合逻辑

**Components:**
- `src/components/market/domain-market-board.tsx` - 领域市场看板
- `src/components/market/subgraph-card.tsx` - 子图卡片组件
- `src/components/market/etf-performance-list.tsx` - ETF表现列表
- `src/components/market/hot-nodes-list.tsx` - 热门节点列表

**Page Updates:**
- `src/app/(dashboard)/market/page.tsx` - 添加领域市场看板

### Phase 4: 工具与维护

**Scripts:**
- `scripts/batch-tag-historical-news.ts` - 批量处理历史新闻
- `scripts/check-data-quality.ts` - 数据质量检查
- `scripts/recalculate-node-stats.ts` - 重新计算节点统计

**Cron Jobs:**
- `scripts/cron/daily-data-quality-check.ts` - 每日数据质量检查

---

## Task 1: 数据库Schema扩展

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Consumes: 现有 NewsArticle, GraphNode, Domain models
- Produces: Tag, NewsArticleTag, GraphNodeTag, DomainTag, GraphNodeETF models

- [ ] **Step 1: 在schema.prisma中添加Tag model**

打开 `prisma/schema.prisma`，在 `// ==================== 事件与资讯 ====================` 部分之前添加：

```prisma
// ==================== 统一标签体系 ====================

model Tag {
  id          String   @id @default(cuid())
  name        String   // 标签名称（如：AI算力、GPU、英伟达）
  code        String   @unique // 英文代码
  type        String   // domain/tech/company/concept
  level       Int      // 层级：1=一级领域，2=二级细分，3=三级技术，4=公司/概念
  parentId    String?  // 父标签ID
  description String?
  keywords    String?  // JSON: 关键词用于AI匹配
  isActive    Boolean  @default(true)
  sortOrder   Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  parent      Tag?     @relation("TagTree", fields: [parentId], references: [id], onUpdate: NoAction, onDelete: NoAction)
  children    Tag[]    @relation("TagTree")
  
  newsArticles NewsArticleTag[]
  graphNodes   GraphNodeTag[]
  domains      DomainTag[]

  @@index([parentId])
  @@index([type, level])
  @@index([isActive, sortOrder])
}

model NewsArticleTag {
  newsId     String
  tagId      String
  confidence Float    @default(1.0) // AI分类置信度
  createdAt  DateTime @default(now())
  
  news NewsArticle @relation(fields: [newsId], references: [id], onDelete: Cascade)
  tag  Tag         @relation(fields: [tagId], references: [id])
  
  @@id([newsId, tagId])
  @@index([tagId, createdAt])
}

model GraphNodeTag {
  nodeId    String
  tagId     String
  relevance Float    @default(1.0) // 相关度
  createdAt DateTime @default(now())
  
  node GraphNode @relation(fields: [nodeId], references: [id], onDelete: Cascade)
  tag  Tag       @relation(fields: [tagId], references: [id])
  
  @@id([nodeId, tagId])
  @@index([tagId])
}

model DomainTag {
  domainId String
  tagId    String
  
  domain Domain @relation(fields: [domainId], references: [id])
  tag    Tag    @relation(fields: [tagId], references: [id])
  
  @@id([domainId, tagId])
}

model GraphNodeETF {
  id          String   @id @default(cuid())
  nodeId      String
  etfCode     String   // ETF代码（如：515790）
  etfName     String   // ETF名称
  bindType    String   @default("tracking") // tracking=跟踪型, thematic=主题型
  weight      Float    @default(1.0) // 权重/相关度
  description String?  // 绑定说明
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  node GraphNode @relation(fields: [nodeId], references: [id], onDelete: Cascade)
  
  @@unique([nodeId, etfCode])
  @@index([etfCode])
  @@index([nodeId])
}
```

- [ ] **Step 2: 在NewsArticle model添加tags关系**

在 `model NewsArticle` 的 relations 部分添加：

```prisma
  tags        NewsArticleTag[]
```

- [ ] **Step 3: 在GraphNode model添加tags和etfBindings关系**

在 `model GraphNode` 的 relations 部分添加：

```prisma
  tags         GraphNodeTag[]
  etfBindings  GraphNodeETF[]
```

- [ ] **Step 4: 在Domain model添加tags关系**

在 `model Domain` 的 relations 部分添加：

```prisma
  tags         DomainTag[]
```

- [ ] **Step 5: 生成Prisma migration**

```bash
cd ai-invest
npx prisma migrate dev --name add_tag_system
```

预期输出：Migration created successfully

- [ ] **Step 6: 生成Prisma Client**

```bash
npx prisma generate
```

预期输出：Generated Prisma Client successfully

- [ ] **Step 7: 验证Schema变更**

```bash
npx prisma validate
```

预期输出：The schema is valid

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(db): add unified tag system and ETF binding tables

- Add Tag model with hierarchical structure (parent-child)
- Add NewsArticleTag for news-tag many-to-many
- Add GraphNodeTag for node-tag many-to-many
- Add DomainTag for domain-tag bridge (backward compat)
- Add GraphNodeETF for node-ETF binding
- Add indexes for performance optimization

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Domain到Tag数据迁移脚本

**Files:**
- Create: `scripts/migrate-domain-to-tags.ts`

**Interfaces:**
- Consumes: Domain model (数据库), Tag model (新schema)
- Produces: Tag records, DomainTag bridge records

- [ ] **Step 1: 创建迁移脚本文件**

创建 `scripts/migrate-domain-to-tags.ts`:

```typescript
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function migrateDomainToTags() {
  console.log('开始迁移 Domain → Tag...\n')
  
  const domains = await prisma.domain.findMany({
    orderBy: { createdAt: 'asc' }
  })
  
  console.log(`找到 ${domains.length} 个领域\n`)
  
  let migratedCount = 0
  let skippedCount = 0
  
  for (const domain of domains) {
    try {
      // 检查是否已经迁移
      const existingTag = await prisma.tag.findUnique({
        where: { code: domain.code }
      })
      
      if (existingTag) {
        console.log(`⊙ 跳过: ${domain.name} (已存在)`)
        skippedCount++
        
        // 确保桥接关系存在
        await prisma.domainTag.upsert({
          where: {
            domainId_tagId: {
              domainId: domain.id,
              tagId: existingTag.id
            }
          },
          create: {
            domainId: domain.id,
            tagId: existingTag.id
          },
          update: {}
        })
        
        continue
      }
      
      // 创建一级标签
      const tag = await prisma.tag.create({
        data: {
          name: domain.name,
          code: domain.code,
          type: 'domain',
          level: 1,
          keywords: domain.keywords,
          description: domain.description,
          isActive: domain.isActive,
          sortOrder: migratedCount
        }
      })
      
      // 建立桥接关系
      await prisma.domainTag.create({
        data: {
          domainId: domain.id,
          tagId: tag.id
        }
      })
      
      console.log(`✓ 迁移: ${domain.name} → Tag(${tag.id})`)
      migratedCount++
      
    } catch (error) {
      console.error(`✗ 迁移失败: ${domain.name}`, error)
    }
  }
  
  console.log(`\n迁移完成！`)
  console.log(`  新建: ${migratedCount} 个标签`)
  console.log(`  跳过: ${skippedCount} 个已存在`)
}

migrateDomainToTags()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
```

- [ ] **Step 2: 运行迁移脚本**

```bash
npx tsx scripts/migrate-domain-to-tags.ts
```

预期输出：显示每个Domain的迁移状态，最后显示统计

- [ ] **Step 3: 验证迁移结果**

```bash
sqlite3 prisma/dev.db "SELECT COUNT(*) as tag_count FROM Tag WHERE level = 1;"
sqlite3 prisma/dev.db "SELECT COUNT(*) as bridge_count FROM DomainTag;"
```

预期：tag_count 和 bridge_count 应该等于 Domain 的数量

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-domain-to-tags.ts
git commit -m "feat(migration): add Domain to Tag migration script

- Migrate existing Domain records to Tag (level 1)
- Create DomainTag bridge for backward compatibility
- Skip already migrated domains

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: ETF绑定数据迁移脚本

**Files:**
- Create: `scripts/migrate-etf-bindings.ts`

**Interfaces:**
- Consumes: GraphNode.metadata (JSON with trackingETFs)
- Produces: GraphNodeETF records

- [ ] **Step 1: 创建ETF绑定迁移脚本**

创建 `scripts/migrate-etf-bindings.ts`:

```typescript
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface MetadataWithETFs {
  trackingETFs?: Array<{
    code?: string
    ticker?: string
    name: string
    weight?: number
  }>
}

async function migrateETFBindings() {
  console.log('开始迁移 ETF 绑定数据...\n')
  
  const nodes = await prisma.graphNode.findMany({
    where: {
      metadata: { not: null }
    }
  })
  
  console.log(`找到 ${nodes.length} 个有metadata的节点\n`)
  
  let migratedNodeCount = 0
  let totalETFCount = 0
  let errorCount = 0
  
  for (const node of nodes) {
    if (!node.metadata) continue
    
    try {
      const metadata: MetadataWithETFs = JSON.parse(node.metadata)
      
      if (!metadata.trackingETFs || !Array.isArray(metadata.trackingETFs)) {
        continue
      }
      
      const etfCount = metadata.trackingETFs.length
      
      for (const etf of metadata.trackingETFs) {
        const etfCode = etf.code || etf.ticker
        
        if (!etfCode) {
          console.log(`  ⚠ 跳过无效ETF: ${JSON.stringify(etf)}`)
          continue
        }
        
        // 检查是否已存在
        const existing = await prisma.graphNodeETF.findUnique({
          where: {
            nodeId_etfCode: {
              nodeId: node.id,
              etfCode: etfCode
            }
          }
        })
        
        if (existing) {
          continue
        }
        
        // 创建绑定
        await prisma.graphNodeETF.create({
          data: {
            nodeId: node.id,
            etfCode: etfCode,
            etfName: etf.name,
            bindType: 'tracking',
            weight: etf.weight || 1.0,
            isActive: true
          }
        })
      }
      
      console.log(`✓ ${node.name}: ${etfCount} 个ETF`)
      migratedNodeCount++
      totalETFCount += etfCount
      
    } catch (error) {
      console.error(`✗ 迁移失败: ${node.name}`, error)
      errorCount++
    }
  }
  
  console.log(`\n迁移完成！`)
  console.log(`  成功节点: ${migratedNodeCount}`)
  console.log(`  ETF总数: ${totalETFCount}`)
  console.log(`  失败: ${errorCount}`)
}

migrateETFBindings()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
```

- [ ] **Step 2: 运行迁移脚本**

```bash
npx tsx scripts/migrate-etf-bindings.ts
```

预期输出：显示每个节点的ETF数量，最后显示统计

- [ ] **Step 3: 验证迁移结果**

```bash
sqlite3 prisma/dev.db "SELECT COUNT(*) as total_bindings FROM GraphNodeETF;"
sqlite3 prisma/dev.db "SELECT nodeId, COUNT(*) as etf_count FROM GraphNodeETF GROUP BY nodeId LIMIT 10;"
```

预期：显示迁移的绑定总数和部分节点的ETF数量

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-etf-bindings.ts
git commit -m "feat(migration): add ETF binding migration script

- Extract trackingETFs from GraphNode.metadata
- Create GraphNodeETF records for each binding
- Skip already migrated bindings

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Tag服务层实现

**Files:**
- Create: `src/lib/services/tag.service.ts`

**Interfaces:**
- Consumes: Prisma Tag model
- Produces: 
  - `getTagTree(): Promise<TagTreeNode[]>`
  - `getTagById(id: string): Promise<Tag | null>`
  - `getTagByCode(code: string): Promise<Tag | null>`
  - `createTag(data: CreateTagInput): Promise<Tag>`
  - `updateTag(id: string, data: UpdateTagInput): Promise<Tag>`
  - `deleteTag(id: string): Promise<void>`

- [ ] **Step 1: 创建Tag类型定义文件**

创建 `src/lib/services/tag.service.ts`:

```typescript
import { prisma } from '@/lib/db'
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
    
    return prisma.tag.create({
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
  }

  /**
   * 更新标签
   */
  async updateTag(id: string, data: UpdateTagInput): Promise<Tag> {
    const existing = await this.getTagById(id)
    if (!existing) {
      throw new Error(`Tag not found: ${id}`)
    }
    
    return prisma.tag.update({
      where: { id },
      data
    })
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
```

- [ ] **Step 2: 创建测试文件**

创建 `src/lib/services/__tests__/tag.service.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { tagService } from '../tag.service'
import { prisma } from '@/lib/db'

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
})
```

- [ ] **Step 3: 运行测试**

```bash
npm test src/lib/services/__tests__/tag.service.test.ts
```

预期输出：All tests passed

- [ ] **Step 4: Commit**

```bash
git add src/lib/services/tag.service.ts src/lib/services/__tests__/tag.service.test.ts
git commit -m "feat(service): add Tag service layer

- Implement TagService with CRUD operations
- Add getTagTree() for hierarchical structure
- Add getTagAncestors() for breadcrumb support
- Add validation for parent-child relationships
- Add comprehensive unit tests

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Tag管理API实现

**Files:**
- Create: `src/app/api/tags/route.ts`
- Create: `src/app/api/tags/tree/route.ts`
- Create: `src/app/api/tags/[id]/route.ts`

**Interfaces:**
- Consumes: `tagService` from Task 4
- Produces: REST API endpoints
  - `GET /api/tags` - 列表
  - `POST /api/tags` - 创建
  - `GET /api/tags/tree` - 树形结构
  - `GET /api/tags/:id` - 详情
  - `PUT /api/tags/:id` - 更新
  - `DELETE /api/tags/:id` - 删除

- [ ] **Step 1: 创建Tag列表和创建API**

创建 `src/app/api/tags/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { tagService } from '@/lib/services/tag.service'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const type = searchParams.get('type')
    const level = searchParams.get('level')
    const parentId = searchParams.get('parentId')
    
    // 如果没有筛选条件，返回树形结构
    if (!type && !level && !parentId) {
      const tree = await tagService.getTagTree()
      return NextResponse.json({
        success: true,
        data: tree
      })
    }
    
    // 否则返回平铺列表（可以根据需要扩展）
    const tree = await tagService.getTagTree()
    return NextResponse.json({
      success: true,
      data: tree
    })
    
  } catch (error) {
    console.error('Failed to get tags:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get tags'
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const tag = await tagService.createTag({
      name: body.name,
      code: body.code,
      type: body.type,
      level: body.level,
      parentId: body.parentId,
      description: body.description,
      keywords: body.keywords,
      sortOrder: body.sortOrder
    })
    
    return NextResponse.json({
      success: true,
      data: tag
    })
    
  } catch (error) {
    console.error('Failed to create tag:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create tag'
      },
      { status: 400 }
    )
  }
}
```

- [ ] **Step 2: 创建Tag树形结构API**

创建 `src/app/api/tags/tree/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { tagService } from '@/lib/services/tag.service'

export async function GET() {
  try {
    const tree = await tagService.getTagTree()
    
    return NextResponse.json({
      success: true,
      data: tree
    })
    
  } catch (error) {
    console.error('Failed to get tag tree:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get tag tree'
      },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 3: 创建单个Tag操作API**

创建 `src/app/api/tags/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { tagService } from '@/lib/services/tag.service'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const tag = await tagService.getTagById(params.id)
    
    if (!tag) {
      return NextResponse.json(
        {
          success: false,
          error: 'Tag not found'
        },
        { status: 404 }
      )
    }
    
    return NextResponse.json({
      success: true,
      data: tag
    })
    
  } catch (error) {
    console.error('Failed to get tag:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get tag'
      },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    
    const tag = await tagService.updateTag(params.id, {
      name: body.name,
      description: body.description,
      keywords: body.keywords,
      isActive: body.isActive,
      sortOrder: body.sortOrder
    })
    
    return NextResponse.json({
      success: true,
      data: tag
    })
    
  } catch (error) {
    console.error('Failed to update tag:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update tag'
      },
      { status: 400 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await tagService.deleteTag(params.id)
    
    return NextResponse.json({
      success: true
    })
    
  } catch (error) {
    console.error('Failed to delete tag:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete tag'
      },
      { status: 400 }
    )
  }
}
```

- [ ] **Step 4: 测试API端点**

启动开发服务器：
```bash
npm run dev
```

测试创建标签：
```bash
curl -X POST http://localhost:3000/api/tags \
  -H "Content-Type: application/json" \
  -d '{
    "name": "测试标签",
    "code": "test_api_tag",
    "type": "tech",
    "level": 2
  }'
```

预期：返回创建的标签JSON

测试获取树形结构：
```bash
curl http://localhost:3000/api/tags/tree
```

预期：返回树形结构JSON

- [ ] **Step 5: Commit**

```bash
git add src/app/api/tags/
git commit -m "feat(api): add Tag management REST API

- GET /api/tags - list tags (defaults to tree)
- POST /api/tags - create tag with validation
- GET /api/tags/tree - get hierarchical tree
- GET /api/tags/:id - get single tag
- PUT /api/tags/:id - update tag
- DELETE /api/tags/:id - soft delete tag

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

PLACEHOLDER_PART3
## Task 6: GraphNodeETF绑定管理API

**Files:**
- Create: `src/app/api/graph/nodes/[id]/etfs/route.ts`

**Interfaces:**
- Consumes: Prisma GraphNodeETF model
- Produces: REST API endpoints
  - `GET /api/graph/nodes/:id/etfs` - 查询节点的ETF绑定
  - `POST /api/graph/nodes/:id/etfs` - 创建绑定
  - `DELETE /api/graph/nodes/:id/etfs/:etfCode` - 删除绑定

- [ ] **Step 1: 创建节点ETF绑定API**

创建 `src/app/api/graph/nodes/[id]/etfs/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const nodeId = params.id
    
    // 验证节点存在
    const node = await prisma.graphNode.findUnique({
      where: { id: nodeId }
    })
    
    if (!node) {
      return NextResponse.json(
        { success: false, error: 'Node not found' },
        { status: 404 }
      )
    }
    
    // 查询ETF绑定
    const bindings = await prisma.graphNodeETF.findMany({
      where: { nodeId, isActive: true },
      orderBy: { weight: 'desc' }
    })
    
    return NextResponse.json({
      success: true,
      data: bindings
    })
    
  } catch (error) {
    console.error('Failed to get node ETF bindings:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to get ETF bindings' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const nodeId = params.id
    const body = await request.json()
    
    // 验证节点存在
    const node = await prisma.graphNode.findUnique({
      where: { id: nodeId }
    })
    
    if (!node) {
      return NextResponse.json(
        { success: false, error: 'Node not found' },
        { status: 404 }
      )
    }
    
    // 创建绑定
    const binding = await prisma.graphNodeETF.create({
      data: {
        nodeId,
        etfCode: body.etfCode,
        etfName: body.etfName,
        bindType: body.bindType || 'tracking',
        weight: body.weight || 1.0,
        description: body.description,
        isActive: true
      }
    })
    
    return NextResponse.json({
      success: true,
      data: binding
    })
    
  } catch (error) {
    console.error('Failed to create ETF binding:', error)
    
    // 处理唯一约束错误
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      return NextResponse.json(
        { success: false, error: 'ETF binding already exists' },
        { status: 400 }
      )
    }
    
    return NextResponse.json(
      { success: false, error: 'Failed to create ETF binding' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 2: 创建删除ETF绑定API**

在同一文件夹创建 `src/app/api/graph/nodes/[id]/etfs/[etfCode]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; etfCode: string } }
) {
  try {
    const { id: nodeId, etfCode } = params
    
    // 查找绑定
    const binding = await prisma.graphNodeETF.findUnique({
      where: {
        nodeId_etfCode: {
          nodeId,
          etfCode
        }
      }
    })
    
    if (!binding) {
      return NextResponse.json(
        { success: false, error: 'ETF binding not found' },
        { status: 404 }
      )
    }
    
    // 软删除（设为inactive）
    await prisma.graphNodeETF.update({
      where: {
        nodeId_etfCode: {
          nodeId,
          etfCode
        }
      },
      data: { isActive: false }
    })
    
    return NextResponse.json({
      success: true
    })
    
  } catch (error) {
    console.error('Failed to delete ETF binding:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete ETF binding' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 3: 测试API**

测试获取节点ETF绑定：
```bash
curl http://localhost:3000/api/graph/nodes/{nodeId}/etfs
```

预期：返回ETF绑定列表

测试创建绑定：
```bash
curl -X POST http://localhost:3000/api/graph/nodes/{nodeId}/etfs \
  -H "Content-Type: application/json" \
  -d '{
    "etfCode": "515790",
    "etfName": "光伏ETF",
    "bindType": "tracking",
    "weight": 1.0
  }'
```

预期：返回创建的绑定

- [ ] **Step 4: Commit**

```bash
git add src/app/api/graph/nodes/
git commit -m "feat(api): add GraphNode ETF binding management

- GET /api/graph/nodes/:id/etfs - list node ETF bindings
- POST /api/graph/nodes/:id/etfs - create binding
- DELETE /api/graph/nodes/:id/etfs/:code - remove binding
- Add validation and error handling

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Tag缓存服务实现

**Files:**
- Create: `src/lib/services/tag-cache.service.ts`

**Interfaces:**
- Consumes: `tagService` from Task 4, Redis client
- Produces:
  - `getCachedTagTree(): Promise<TagTreeNode[]>`
  - `getCachedTagByCode(code: string): Promise<Tag | null>`
  - `invalidateTagCache(): Promise<void>`

- [ ] **Step 1: 检查Redis配置**

检查 `src/lib/redis.ts` 是否存在，如不存在则创建：

```typescript
import { createClient } from 'redis'

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
})

redisClient.on('error', (err) => console.error('Redis Client Error', err))

let isConnected = false

async function connectRedis() {
  if (!isConnected) {
    await redisClient.connect()
    isConnected = true
  }
  return redisClient
}

export { redisClient, connectRedis }
```

- [ ] **Step 2: 创建Tag缓存服务**

创建 `src/lib/services/tag-cache.service.ts`:

```typescript
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
```

- [ ] **Step 3: 在Tag服务中集成缓存失效**

修改 `src/lib/services/tag.service.ts`，在写操作后调用 `invalidateTagCache`:

在 `createTag`, `updateTag`, `deleteTag` 方法的最后添加：

```typescript
// 在每个方法的return之前添加
await tagCacheService.invalidateTagCache()
```

更新后的 createTag 示例：
```typescript
async createTag(data: CreateTagInput): Promise<Tag> {
  // ... 现有代码 ...
  
  const tag = await prisma.tag.create({ /* ... */ })
  
  // 清除缓存
  const { tagCacheService } = await import('./tag-cache.service')
  await tagCacheService.invalidateTagCache()
  
  return tag
}
```

- [ ] **Step 4: 创建测试**

创建 `src/lib/services/__tests__/tag-cache.service.test.ts`:

```typescript
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
})
```

- [ ] **Step 5: 运行测试**

```bash
npm test src/lib/services/__tests__/tag-cache.service.test.ts
```

预期：All tests passed

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/tag-cache.service.ts src/lib/services/__tests__/tag-cache.service.test.ts src/lib/redis.ts
git commit -m "feat(cache): add Tag cache service with memory fallback

- Implement in-memory cache for tag tree and tag-by-code
- Add cache invalidation on write operations
- Add cache warmup function
- Graceful degradation when cache fails

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: 新闻AI分析服务扩展（标签提取）

**Files:**
- Modify: `src/lib/ai/news-analysis.service.ts`
- Create: `src/lib/ai/prompts/news-tag-extraction.ts`

**Interfaces:**
- Consumes: Claude API, `tagCacheService` from Task 7
- Produces: Extended `NewsAIAnalysisResult` with tags and relatedNodes fields

- [ ] **Step 1: 创建标签提取Prompt**

创建 `src/lib/ai/prompts/news-tag-extraction.ts`:

```typescript
import type { TagTreeNode } from '@/lib/services/tag.service'

export interface TagExtractionResult {
  tags: Array<{
    tagId: string
    tagName: string
    tagCode: string
    level: number
    confidence: number
  }>
  relatedNodes: Array<{
    nodeId: string
    nodeName: string
    relevance: number
    reason: string
  }>
}

export function buildTagExtractionPrompt(
  title: string,
  content: string,
  tagTree: TagTreeNode[],
  graphNodes: Array<{ id: string; name: string; type: string }>
): string {
  const tagTreeJSON = JSON.stringify(tagTree, null, 2)
  const nodeListJSON = JSON.stringify(graphNodes, null, 2)
  
  return `你是一个专业的金融新闻分析师，需要分析以下新闻并提取结构化信息。

新闻标题: ${title}
新闻内容: ${content.substring(0, 1000)}

可用标签库（层级结构）:
${tagTreeJSON}

可用知识图谱节点:
${nodeListJSON}

请按以下JSON格式返回分析结果，不要添加任何额外文字：

{
  "tags": [
    {
      "tagId": "标签ID（从标签库中选择）",
      "tagName": "标签名称",
      "tagCode": "标签代码",
      "level": 层级数字(1-4),
      "confidence": 置信度(0-1之间的小数)
    }
  ],
  "relatedNodes": [
    {
      "nodeId": "节点ID（从图谱节点列表中选择）",
      "nodeName": "节点名称",
      "relevance": 相关度(0-1之间的小数),
      "reason": "关联理由（简短说明为什么相关）"
    }
  ]
}

要求:
1. 标签要包含多个层级（从一级领域到具体技术/公司），尽可能完整
2. 置信度要真实反映匹配程度，不确定的不要勉强标注
3. 相关节点要按相关度从高到低排序
4. 关联理由要具体，不要泛泛而谈
5. 只返回JSON，不要有其他内容`
}
```

- [ ] **Step 2: 检查现有新闻分析服务**

查看 `src/lib/ai/news-analysis.service.ts` 是否存在，如存在则修改，否则创建新文件。

- [ ] **Step 3: 扩展新闻分析结果类型**

在 `src/lib/ai/news-analysis.service.ts` 中添加/修改类型：

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { tagCacheService } from '@/lib/services/tag-cache.service'
import { buildTagExtractionPrompt, type TagExtractionResult } from './prompts/news-tag-extraction'
import { prisma } from '@/lib/db'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || ''
})

export interface NewsAIAnalysisResult {
  // 现有字段
  category: string
  sentiment: number
  sentimentLabel: 'bullish' | 'neutral' | 'bearish'
  impact: number
  
  // 新增字段
  tags: Array<{
    tagId: string
    tagName: string
    tagCode: string
    level: number
    confidence: number
  }>
  
  relatedNodes: Array<{
    nodeId: string
    nodeName: string
    relevance: number
    reason: string
  }>
}

export class NewsAnalysisService {
  /**
   * 分析新闻（扩展版本，包含标签提取）
   */
  async analyzeNewsWithTags(
    title: string,
    content: string
  ): Promise<NewsAIAnalysisResult> {
    try {
      // 获取标签树和图谱节点
      const [tagTree, graphNodes] = await Promise.all([
        tagCacheService.getCachedTagTree(),
        prisma.graphNode.findMany({
          where: { level: { lte: 3 } },
          select: { id: true, name: true, type: true },
          take: 100
        })
      ])
      
      // 构建Prompt
      const prompt = buildTagExtractionPrompt(title, content, tagTree, graphNodes)
      
      // 调用Claude API
      const message = await anthropic.messages.create({
        model: 'claude-opus-5',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
      
      // 解析响应
      const responseText = message.content[0].type === 'text' 
        ? message.content[0].text 
        : ''
      
      const parsed: TagExtractionResult = JSON.parse(responseText)
      
      // 基础分析（情感、分类等）- 可以复用现有逻辑或简化
      const basicAnalysis = this.extractBasicAnalysis(content)
      
      return {
        category: basicAnalysis.category,
        sentiment: basicAnalysis.sentiment,
        sentimentLabel: basicAnalysis.sentimentLabel,
        impact: basicAnalysis.impact,
        tags: parsed.tags,
        relatedNodes: parsed.relatedNodes
      }
      
    } catch (error) {
      console.error('Failed to analyze news with tags:', error)
      throw error
    }
  }

  /**
   * 基础分析（情感、分类）
   */
  private extractBasicAnalysis(content: string): {
    category: string
    sentiment: number
    sentimentLabel: 'bullish' | 'neutral' | 'bearish'
    impact: number
  } {
    // 简化版本：可以根据关键词判断
    // 实际实现可以调用另一个AI分析或复用现有逻辑
    
    const bullishKeywords = ['上涨', '增长', '突破', '利好', '盈利']
    const bearishKeywords = ['下跌', '下滑', '风险', '亏损', '利空']
    
    let sentiment = 0
    for (const word of bullishKeywords) {
      if (content.includes(word)) sentiment += 0.2
    }
    for (const word of bearishKeywords) {
      if (content.includes(word)) sentiment -= 0.2
    }
    
    sentiment = Math.max(-1, Math.min(1, sentiment))
    
    const sentimentLabel = sentiment > 0.3 ? 'bullish' 
      : sentiment < -0.3 ? 'bearish' 
      : 'neutral'
    
    return {
      category: '综合',
      sentiment,
      sentimentLabel,
      impact: 3
    }
  }
}

export const newsAnalysisService = new NewsAnalysisService()
```

- [ ] **Step 4: 创建测试**

创建 `src/lib/ai/__tests__/news-analysis.service.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { newsAnalysisService } from '../news-analysis.service'

describe('NewsAnalysisService', () => {
  it('should analyze news and extract tags', async () => {
    const result = await newsAnalysisService.analyzeNewsWithTags(
      '英伟达发布H100 GPU芯片',
      '英伟达公司今日发布了最新的H100 GPU芯片，专为AI训练优化...'
    )
    
    expect(result).toHaveProperty('tags')
    expect(result).toHaveProperty('relatedNodes')
    expect(result.tags).toBeInstanceOf(Array)
    expect(result.relatedNodes).toBeInstanceOf(Array)
  }, 30000) // 30秒超时，因为需要调用API
})
```

- [ ] **Step 5: 手动测试（需要ANTHROPIC_API_KEY）**

```bash
# 确保环境变量已设置
echo $ANTHROPIC_API_KEY

# 运行测试
npm test src/lib/ai/__tests__/news-analysis.service.test.ts
```

预期：测试通过并返回标签和节点

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai/
git commit -m "feat(ai): extend news analysis with tag extraction

- Add tag extraction prompt template
- Extend NewsAIAnalysisResult with tags and relatedNodes
- Implement analyzeNewsWithTags() using Claude API
- Add basic sentiment analysis fallback
- Add integration tests

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

