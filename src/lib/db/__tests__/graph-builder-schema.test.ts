import { describe, it, expect, beforeAll } from 'vitest'
import prisma from '@/lib/db/prisma'

describe('Graph Builder Schema', () => {
  beforeAll(async () => {
    // Run migrations
    await prisma.$executeRaw`PRAGMA foreign_keys = ON`
  })

  it('should create GraphSuggestion table with correct schema', async () => {
    const result = await prisma.$queryRaw`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='GraphSuggestion'
    `
    expect(result).toHaveLength(1)
  })

  it('should create GraphExtractionJob table', async () => {
    const result = await prisma.$queryRaw`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='GraphExtractionJob'
    `
    expect(result).toHaveLength(1)
  })

  it('should have status index on GraphSuggestion', async () => {
    const indexes = await prisma.$queryRaw`
      SELECT name FROM sqlite_master
      WHERE type='index' AND tbl_name='GraphSuggestion'
    `
    const indexNames = (indexes as any[]).map(i => i.name)
    expect(indexNames).toContain('GraphSuggestion_status_createdAt_idx')
  })
})
