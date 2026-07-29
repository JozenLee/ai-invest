// tests/integration/graph-builder.test.ts
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import prisma from '@/lib/db/prisma'
import { graphExtractorService } from '@/lib/services/graph-extractor.service'
import { graphSuggestionService } from '@/lib/services/graph-suggestion.service'

describe('Graph Builder Integration', () => {
  let testJobId: string
  let testSuggestionIds: string[] = []

  beforeAll(async () => {
    // Clean up in correct order due to foreign key constraints
    await prisma.graphEdge.deleteMany({})
    await prisma.graphStock.deleteMany({})
    await prisma.graphChangeLog.deleteMany({})
    await prisma.graphNode.deleteMany({})
    await prisma.graphSuggestion.deleteMany({})
    await prisma.graphExtractionJob.deleteMany({})
  })

  afterAll(async () => {
    // Clean up in correct order due to foreign key constraints
    await prisma.graphEdge.deleteMany({})
    await prisma.graphStock.deleteMany({})
    await prisma.graphChangeLog.deleteMany({})
    await prisma.graphNode.deleteMany({})
    await prisma.graphSuggestion.deleteMany({})
    await prisma.graphExtractionJob.deleteMany({})
  })

  it('should complete full extraction and review workflow', async () => {
    // Step 1: Create extraction job
    const job = await prisma.graphExtractionJob.create({
      data: {
        sourceType: 'news',
        status: 'processing'
      }
    })
    testJobId = job.id

    // Step 2: Extract entities and relations
    const extractionResult = await graphExtractorService.extract({
      text: `
        NVIDIA是全球领先的GPU设计公司，专注于AI芯片开发。
        其最新的H100芯片采用了HBM3内存技术，性能大幅提升。
        这些芯片由台积电（TSMC）的5nm工艺代工生产。
        NVIDIA的产品广泛应用于数据中心和云计算领域。
      `,
      type: 'news',
      metadata: {
        title: '集成测试新闻',
        source: '测试来源'
      }
    })

    // Verify extraction result
    expect(extractionResult.entities.length).toBeGreaterThan(0)
    expect(extractionResult.relations.length).toBeGreaterThan(0)

    // Step 3: Update job status
    await prisma.graphExtractionJob.update({
      where: { id: testJobId },
      data: {
        status: 'completed',
        extractedData: JSON.stringify(extractionResult),
        tokensUsed: extractionResult.metadata.tokensUsed,
        durationMs: extractionResult.metadata.durationMs,
        completedAt: new Date()
      }
    })

    // Step 4: Create suggestions
    const suggestionCount = await graphSuggestionService.createFromExtraction(
      testJobId,
      extractionResult
    )

    expect(suggestionCount).toBeGreaterThan(0)

    // Step 5: Get pending suggestions
    const suggestions = await graphSuggestionService.getSuggestions({
      status: 'pending'
    })

    expect(suggestions.length).toBe(suggestionCount)
    testSuggestionIds = suggestions.map(s => s.id)

    // Step 6: Approve high confidence suggestions
    const highConfidenceSuggestions = suggestions.filter(s => s.confidence >= 0.8)

    for (const suggestion of highConfidenceSuggestions) {
      await graphSuggestionService.approveSuggestion(suggestion.id, 'test-user')
    }

    // Step 7: Verify nodes created
    const nodes = await prisma.graphNode.findMany({})
    expect(nodes.length).toBeGreaterThan(0)

    // Step 8: Verify edges created (if any edge suggestions were approved)
    const edges = await prisma.graphEdge.findMany({})
    // May be 0 if no edge suggestions met the confidence threshold

    // Step 9: Verify change logs
    const changeLogs = await prisma.graphChangeLog.findMany({
      where: {
        source: 'ai_extraction'
      }
    })
    expect(changeLogs.length).toBe(nodes.length + edges.length)

    // Step 10: Reject remaining suggestions
    const remainingSuggestions = await graphSuggestionService.getSuggestions({
      status: 'pending'
    })

    for (const suggestion of remainingSuggestions) {
      await graphSuggestionService.rejectSuggestion(
        suggestion.id,
        'test-user',
        '集成测试拒绝'
      )
    }

    // Step 11: Verify all suggestions processed
    const finalSuggestions = await graphSuggestionService.getSuggestions({
      status: 'pending'
    })
    expect(finalSuggestions.length).toBe(0)

    // Step 12: Verify job statistics
    const finalJob = await prisma.graphExtractionJob.findUnique({
      where: { id: testJobId }
    })
    expect(finalJob?.status).toBe('completed')
    expect(finalJob?.suggestionsCreated).toBe(suggestionCount)
  }, 60000) // 60 second timeout for Claude API calls

  it.skip('should handle API endpoints correctly', async () => {
    // Note: This test requires the Next.js dev server to be running on port 3000
    // Run `npm run dev` in a separate terminal before running this test
    // To enable: change it.skip to it

    // Test extract endpoint
    const extractResponse = await fetch('http://localhost:3000/api/graph/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'NVIDIA推出新款GPU芯片。',
        type: 'news'
      })
    })

    expect(extractResponse.ok).toBe(true)
    const extractData = await extractResponse.json()
    expect(extractData.success).toBe(true)
    expect(extractData.data.jobId).toBeDefined()

    // Test suggestions endpoint
    const suggestionsResponse = await fetch(
      'http://localhost:3000/api/graph/suggestions?status=pending'
    )

    expect(suggestionsResponse.ok).toBe(true)
    const suggestionsData = await suggestionsResponse.json()
    expect(suggestionsData.success).toBe(true)
    expect(Array.isArray(suggestionsData.data.suggestions)).toBe(true)
  })
})
