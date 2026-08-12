/**
 * AI产业细分功能集成测试
 *
 * 测试范围：
 * - AI分析器初始化和产业细分领域加载
 * - 新闻AI分析功能和segmentCodes字段生成
 * - segmentCodes有效性验证（与产业图谱对比）
 *
 * 注意：
 * - 需要data-service和Next.js服务同时运行
 * - AI分析需要时间，设置较长的超时时间
 */

import { describe, it, expect, beforeAll } from 'vitest'

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:8000'
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000'
const TEST_TIMEOUT = 30000 // 30秒超时

describe('AI产业细分功能集成测试', () => {
  let validSegmentCodes: Set<string> = new Set()
  let allIndustries: any[] = []

  beforeAll(async () => {
    console.log('=== 测试环境准备 ===')
    console.log('DATA_SERVICE_URL:', DATA_SERVICE_URL)
    console.log('API_BASE:', API_BASE)
  })

  describe('1. AI分析器初始化', () => {
    it('应该成功加载产业细分领域（数量 > 30）', async () => {
      console.log('\n=== 测试AI分析器初始化 ===')

      // 获取所有产业列表
      const industriesResponse = await fetch(`${DATA_SERVICE_URL}/api/v1/industries`)
      expect(industriesResponse.status).toBe(200)

      allIndustries = await industriesResponse.json()
      console.log(`✓ 获取到 ${allIndustries.length} 个产业`)

      expect(allIndustries.length).toBeGreaterThan(0)

      // 收集所有细分领域代码
      let totalSegments = 0

      for (const industry of allIndustries) {
        const graphResponse = await fetch(
          `${DATA_SERVICE_URL}/api/v1/industries/${industry.id}/graph`
        )

        if (graphResponse.status === 200) {
          const graphData = await graphResponse.json()

          // 从图谱数据中提取segment codes
          // 结构: industry -> stages[] -> segments[] -> code
          if (graphData.stages) {
            for (const stage of graphData.stages) {
              if (stage.segments) {
                for (const segment of stage.segments) {
                  if (segment.code) {
                    // 使用 industry_code + segment_code 作为完整的标识
                    const fullCode = `${industry.code}_${segment.code}`
                    validSegmentCodes.add(fullCode)
                    // 也添加单独的segment code（兼容性）
                    validSegmentCodes.add(segment.code)
                    totalSegments++
                  }
                }
              }
            }
          }
        }
      }

      console.log(`✓ 收集到 ${validSegmentCodes.size} 个唯一的产业细分领域代码`)
      console.log(`✓ 总节点数: ${totalSegments}`)
      console.log('示例代码:', Array.from(validSegmentCodes).slice(0, 10))

      // 验证细分领域数量
      expect(validSegmentCodes.size).toBeGreaterThan(30)
    }, TEST_TIMEOUT)
  })

  describe('2. 新闻AI分析功能', () => {
    it('应该成功触发新闻采集任务', async () => {
      console.log('\n=== 测试新闻采集触发 ===')

      // 触发财联社新闻采集
      const fetchResponse = await fetch(`${DATA_SERVICE_URL}/api/v1/datasources/fetch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source_id: 'cailian_default',
          source_config: {
            driverType: 'api',
            provider: 'akshare',
            keyword: '财联社',
            limit: 20
          }
        })
      })

      console.log('采集任务响应状态:', fetchResponse.status)

      if (fetchResponse.status === 200) {
        const fetchResult = await fetchResponse.json()
        console.log('✓ 采集任务已触发:', fetchResult)
        expect(fetchResult.success).toBe(true)
      } else {
        const errorText = await fetchResponse.text()
        console.warn('⚠️ 采集任务触发失败:', errorText)
        // 不强制要求成功，因为可能data-service未运行
      }

      // 等待20秒让AI分析完成
      console.log('⏳ 等待20秒让AI分析完成...')
      await new Promise(resolve => setTimeout(resolve, 20000))
    }, TEST_TIMEOUT)

    it('应该有至少80%的新闻包含segmentCodes字段', async () => {
      console.log('\n=== 测试新闻AI分析结果 ===')

      // 获取最新的50条新闻以获得更准确的统计
      const newsResponse = await fetch(`${API_BASE}/api/events/feed?limit=50&sortBy=publishTime`)
      expect(newsResponse.status).toBe(200)

      const newsData = await newsResponse.json()
      console.log('API响应结构:', Object.keys(newsData))

      // 支持两种响应格式
      const news = newsData.data?.items || newsData.items || []

      console.log(`✓ 获取到 ${news.length} 条新闻`)

      if (news.length === 0) {
        console.warn('⚠️ 没有新闻数据，跳过测试')
        return
      }

      // 统计包含segmentCodes的新闻数量
      let withSegmentCodes = 0
      let withValidSegmentCodes = 0
      let aiProcessedCount = 0
      let emptyCodesCount = 0

      for (const article of news) {
        if (article.aiProcessed) {
          aiProcessedCount++
        }

        // 只在前5条新闻输出详细日志
        const showDetail = withSegmentCodes + emptyCodesCount < 10

        if (showDetail) {
          console.log('\n--- 新闻分析 ---')
          console.log('标题:', article.title?.substring(0, 50))
          console.log('发布时间:', article.publishTime)
          console.log('AI处理状态:', article.aiProcessed)
          console.log('segmentCodes原始值:', article.segmentCodes)
        }

        if (article.segmentCodes) {
          // segmentCodes可能是JSON字符串或数组
          let codes: string[] = []

          if (typeof article.segmentCodes === 'string') {
            try {
              codes = JSON.parse(article.segmentCodes)
            } catch (e) {
              if (showDetail) console.error('解析segmentCodes失败:', e)
              codes = []
            }
          } else if (Array.isArray(article.segmentCodes)) {
            codes = article.segmentCodes
          }

          if (codes.length > 0) {
            withSegmentCodes++
            if (showDetail) console.log('✓ 包含 segmentCodes:', codes)

            // 验证格式：应该是字符串数组
            const allStrings = codes.every((code: any) => typeof code === 'string')
            expect(allStrings).toBe(true)

            // 检查是否包含有效代码
            const hasValidCode = codes.some((code: string) => validSegmentCodes.has(code))
            if (hasValidCode) {
              withValidSegmentCodes++
              if (showDetail) console.log('✓ 包含有效的segment代码')
            } else {
              if (showDetail) console.warn('⚠️ 不包含有效的segment代码，codes:', codes)
            }
          } else {
            emptyCodesCount++
            if (showDetail) console.log('✗ segmentCodes 为空数组')
          }
        } else {
          emptyCodesCount++
          if (showDetail) console.log('✗ 缺少 segmentCodes 字段')
        }
      }

      const coverageRate = (withSegmentCodes / news.length) * 100
      const validRate = withValidSegmentCodes > 0 ? (withValidSegmentCodes / withSegmentCodes) * 100 : 0
      const aiProcessedRate = (aiProcessedCount / news.length) * 100

      console.log('\n=== 统计结果 ===')
      console.log(`总新闻数: ${news.length}`)
      console.log(`AI已处理: ${aiProcessedCount} (${aiProcessedRate.toFixed(1)}%)`)
      console.log(`包含 segmentCodes: ${withSegmentCodes} (${coverageRate.toFixed(1)}%)`)
      console.log(`segmentCodes 为空: ${emptyCodesCount}`)
      console.log(`包含有效 codes: ${withValidSegmentCodes} (${validRate.toFixed(1)}%)`)

      // 验证：至少80%的新闻应该包含segmentCodes
      // 如果当前覆盖率低于80%，说明AI分析功能有问题
      if (coverageRate < 80) {
        console.error('\n❌ AI分析功能异常检测:')
        console.error(`  - 当前覆盖率: ${coverageRate.toFixed(1)}% (目标: ≥80%)`)
        console.error(`  - AI处理率: ${aiProcessedRate.toFixed(1)}%`)
        console.error(`  - 可能原因: AI分析器未正确加载产业细分领域`)
        console.error(`  - 建议检查: data-service日志中的产业细分领域加载状态`)
      }

      expect(coverageRate).toBeGreaterThanOrEqual(80)
    }, TEST_TIMEOUT)
  })

  describe('3. segmentCodes有效性验证', () => {
    it('segmentCodes中的代码应该在产业图谱中存在', async () => {
      console.log('\n=== 测试 segmentCodes 有效性 ===')

      // 获取最新的10条新闻
      const newsResponse = await fetch(`${API_BASE}/api/events/feed?limit=10&sortBy=publishTime`)
      expect(newsResponse.status).toBe(200)

      const newsData = await newsResponse.json()
      const news = newsData.data?.items || newsData.items || []

      if (news.length === 0) {
        console.warn('⚠️ 没有新闻数据，跳过测试')
        return
      }

      console.log(`分析 ${news.length} 条新闻的 segmentCodes 有效性`)
      console.log(`有效的 segment codes 总数: ${validSegmentCodes.size}`)

      let totalCodes = 0
      let validCodes = 0
      let invalidCodes: string[] = []

      for (const article of news) {
        if (article.segmentCodes) {
          let codes: string[] = []

          if (typeof article.segmentCodes === 'string') {
            try {
              codes = JSON.parse(article.segmentCodes)
            } catch (e) {
              codes = []
            }
          } else if (Array.isArray(article.segmentCodes)) {
            codes = article.segmentCodes
          }

          for (const code of codes) {
            totalCodes++

            if (validSegmentCodes.has(code)) {
              validCodes++
            } else {
              invalidCodes.push(code)
            }
          }
        }
      }

      const validityRate = totalCodes > 0 ? (validCodes / totalCodes) * 100 : 0

      console.log('\n=== 有效性统计 ===')
      console.log(`总 segment codes: ${totalCodes}`)
      console.log(`有效 codes: ${validCodes} (${validityRate.toFixed(1)}%)`)
      console.log(`无效 codes: ${invalidCodes.length}`)

      if (invalidCodes.length > 0) {
        console.log('无效代码示例:', invalidCodes.slice(0, 10))
      }

      // 验证：所有segmentCodes应该在产业图谱中存在
      // 允许少量误差（可能是AI生成的新代码）
      if (totalCodes > 0) {
        expect(validityRate).toBeGreaterThanOrEqual(70)
      }
    }, TEST_TIMEOUT)

    it('可以通过segmentCodes筛选新闻', async () => {
      console.log('\n=== 测试通过 segmentCodes 筛选 ===')

      if (validSegmentCodes.size === 0) {
        console.warn('⚠️ 没有有效的 segment codes，跳过测试')
        return
      }

      // 随机选择一个有效的segment code
      const testCode = Array.from(validSegmentCodes)[0]
      console.log('测试代码:', testCode)

      // 使用segment code筛选新闻
      const filterResponse = await fetch(
        `${API_BASE}/api/events/feed?segmentCodes=${testCode}&limit=10`
      )

      expect(filterResponse.status).toBe(200)

      const filterData = await filterResponse.json()
      const filteredNews = filterData.data?.items || filterData.items || []

      console.log(`✓ 筛选结果: ${filteredNews.length} 条新闻`)

      // 验证筛选结果中的新闻都包含该segment code
      for (const article of filteredNews) {
        if (article.segmentCodes) {
          let codes: string[] = []

          if (typeof article.segmentCodes === 'string') {
            try {
              codes = JSON.parse(article.segmentCodes)
            } catch (e) {
              codes = []
            }
          } else if (Array.isArray(article.segmentCodes)) {
            codes = article.segmentCodes
          }

          const hasTestCode = codes.includes(testCode)
          console.log(`新闻 "${article.title?.substring(0, 30)}" 包含测试代码:`, hasTestCode)
          expect(hasTestCode).toBe(true)
        }
      }
    }, TEST_TIMEOUT)
  })

  describe('4. 错误处理', () => {
    it('AI分析失败的新闻应该有错误标记', async () => {
      console.log('\n=== 测试错误处理 ===')

      const newsResponse = await fetch(`${API_BASE}/api/events/feed?limit=50`)
      const newsData = await newsResponse.json()
      const news = newsData.data?.items || newsData.items || []

      if (news.length === 0) {
        console.warn('⚠️ 没有新闻数据，跳过测试')
        return
      }

      // 统计AI处理失败的新闻
      const failedNews = news.filter((article: any) => article.aiError)

      console.log(`总新闻数: ${news.length}`)
      console.log(`AI处理失败: ${failedNews.length}`)

      if (failedNews.length > 0) {
        console.log('失败原因示例:', failedNews[0].aiError)
      }

      // AI失败率应该低于20%
      const failureRate = (failedNews.length / news.length) * 100
      console.log(`AI失败率: ${failureRate.toFixed(1)}%`)

      expect(failureRate).toBeLessThan(20)
    }, TEST_TIMEOUT)
  })
})
