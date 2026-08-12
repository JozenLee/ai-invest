// 从知识图谱同步Segment标签到Tag表
// 用于确保资讯流页面的标签与知识图谱产业标签一致

import { prisma } from '../src/lib/db/prisma'

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'

interface Industry {
  id: string
  code: string
  name: string
  description?: string
}

interface Segment {
  id: string
  code: string
  name: string
  description?: string
}

interface Stage {
  id: string
  code: string
  name: string
  segments: Segment[]
}

async function fetchIndustries(): Promise<Industry[]> {
  const response = await fetch(`${DATA_SERVICE_URL}/api/v1/industries`)
  if (!response.ok) {
    throw new Error(`获取产业列表失败: ${response.status}`)
  }
  return response.json()
}

async function fetchIndustryGraph(industryId: string): Promise<{ stages: Stage[] }> {
  const response = await fetch(`${DATA_SERVICE_URL}/api/v1/industries/${industryId}/graph`)
  if (!response.ok) {
    throw new Error(`获取产业图谱失败: ${response.status}`)
  }
  return response.json()
}

async function main() {
  console.log('🚀 开始从知识图谱同步Segment标签...\n')

  // Step 1: 清空旧的Tag数据（注意外键顺序）
  console.log('📦 清理旧标签数据...')

  // 先删除所有关联表
  const deletedNewsArticleTags = await prisma.newsArticleTag.deleteMany({})
  console.log(`  ✅ 删除 ${deletedNewsArticleTags.count} 条新闻标签关联`)

  const deletedGraphNodeTags = await prisma.graphNodeTag.deleteMany({})
  console.log(`  ✅ 删除 ${deletedGraphNodeTags.count} 条图谱节点标签关联`)

  const deletedDomainTags = await prisma.domainTag.deleteMany({})
  console.log(`  ✅ 删除 ${deletedDomainTags.count} 条领域标签关联`)

  // 最后删除Tag记录
  const deletedTagRecords = await prisma.tag.deleteMany({})
  console.log(`  ✅ 删除 ${deletedTagRecords.count} 条标签记录\n`)

  // Step 2: 从知识图谱获取所有产业和segment
  console.log('🔍 获取知识图谱数据...')
  const industries = await fetchIndustries()
  console.log(`  ✅ 获取到 ${industries.length} 个产业\n`)

  let totalSegments = 0
  const tagsToCreate: Array<{
    name: string
    code: string
    type: string
    level: number
    description: string
    keywords: string
    isActive: boolean
    sortOrder: number
  }> = []

  // Step 3: 遍历每个产业，提取segment
  for (const industry of industries) {
    console.log(`📊 处理产业: ${industry.name} (${industry.code})`)

    try {
      const graphData = await fetchIndustryGraph(industry.id)
      const stages = graphData.stages || []

      for (const stage of stages) {
        for (const segment of stage.segments || []) {
          totalSegments++

          // 构建Tag记录
          tagsToCreate.push({
            name: segment.name,
            code: segment.code,
            type: 'segment', // 新类型：segment（产业细分领域）
            level: 3, // level 3: 细分领域（相对于 1=产业, 2=阶段）
            description: segment.description || `${industry.name} - ${stage.name} - ${segment.name}`,
            keywords: JSON.stringify([
              segment.name,
              segment.code,
              industry.name,
              industry.code,
            ]),
            isActive: true,
            sortOrder: totalSegments,
          })

          console.log(`  ✅ ${stage.name} -> ${segment.name} (${segment.code})`)
        }
      }
    } catch (error) {
      console.error(`  ❌ 获取产业图谱失败:`, error)
    }
  }

  // Step 4: 批量创建Tag记录
  console.log(`\n💾 创建 ${tagsToCreate.length} 条标签记录...`)

  for (const tag of tagsToCreate) {
    try {
      await prisma.tag.create({
        data: tag,
      })
    } catch (error) {
      console.error(`  ❌ 创建标签失败: ${tag.code}`, error)
    }
  }

  console.log(`  ✅ 标签创建完成\n`)

  // Step 5: 验证结果
  const tagCount = await prisma.tag.count()
  console.log('✨ 同步完成！')
  console.log(`  - 总产业数: ${industries.length}`)
  console.log(`  - 总Segment数: ${totalSegments}`)
  console.log(`  - Tag表记录数: ${tagCount}\n`)
}

main()
  .then(() => {
    console.log('✅ 脚本执行成功')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ 脚本执行失败:', error)
    process.exit(1)
  })
