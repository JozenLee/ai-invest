// src/app/api/graph/extract/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { graphExtractorService } from '@/lib/services/graph-extractor.service'
import { graphSuggestionService } from '@/lib/services/graph-suggestion.service'
import prisma from '@/lib/db/prisma'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate input
    if (body.text === undefined || body.text === null || typeof body.text !== 'string') {
      return NextResponse.json(
        { success: false, error: 'text字段必填' },
        { status: 400 }
      )
    }

    if (!body.type || !['report', 'news', 'article'].includes(body.type)) {
      return NextResponse.json(
        { success: false, error: 'type必须是report/news/article之一' },
        { status: 400 }
      )
    }

    // Create job
    const job = await prisma.graphExtractionJob.create({
      data: {
        sourceType: body.type,
        sourceId: body.metadata?.sourceId,
        sourceUrl: body.metadata?.sourceUrl,
        sourceText: body.text.substring(0, 500), // 只保存前500字
        status: 'processing'
      }
    })

    // Execute extraction (async but wait for completion)
    try {
      const startTime = Date.now()

      const result = await graphExtractorService.extract({
        text: body.text,
        type: body.type,
        metadata: body.metadata
      })

      const durationMs = Date.now() - startTime

      // Save extraction result
      await prisma.graphExtractionJob.update({
        where: { id: job.id },
        data: {
          status: 'completed',
          extractedData: JSON.stringify(result),
          tokensUsed: result.metadata.tokensUsed,
          durationMs: result.metadata.durationMs,
          completedAt: new Date()
        }
      })

      // Create suggestions
      const suggestionCount = await graphSuggestionService.createFromExtraction(
        job.id,
        result
      )

      return NextResponse.json({
        success: true,
        data: {
          jobId: job.id,
          suggestionsCreated: suggestionCount,
          tokensUsed: result.metadata.tokensUsed,
          durationMs
        }
      })
    } catch (extractionError) {
      // Update job status to failed
      await prisma.graphExtractionJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          errorMessage: String(extractionError),
          completedAt: new Date()
        }
      })

      return NextResponse.json({
        success: true,
        data: {
          jobId: job.id,
          error: String(extractionError)
        }
      })
    }
  } catch (error) {
    console.error('Extract API error:', error)
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}
