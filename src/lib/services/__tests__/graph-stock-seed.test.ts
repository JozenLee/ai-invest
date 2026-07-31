import { describe, it, expect } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || 'file:./prisma/dev.db',
})

const prisma = new PrismaClient({ adapter })

describe('GraphStock Seed Data', () => {
  it('should have at least 30 stock mappings', async () => {
    const count = await prisma.graphStock.count()
    expect(count).toBeGreaterThanOrEqual(30)
  })

  it('should have core AI chip stocks mapped to GPU/AI芯片 node', async () => {
    const aiChipStocks = await prisma.graphStock.findMany({
      where: {
        stockCode: { in: ['688256.SH', '688041.SH'] }
      },
      include: {
        node: true
      }
    })

    expect(aiChipStocks).toHaveLength(2)
    aiChipStocks.forEach(stock => {
      expect(stock.node.name).toBe('GPU/AI芯片')
      expect(stock.relevance).toBe(1.0)
      expect(stock.category).toBe('核心标的')
    })
  })

  it('should have stocks with valid relevance scores (0.7-1.0)', async () => {
    const stocks = await prisma.graphStock.findMany()

    stocks.forEach(stock => {
      expect(stock.relevance).toBeGreaterThanOrEqual(0.7)
      expect(stock.relevance).toBeLessThanOrEqual(1.0)
    })
  })

  it('should have proper category classification', async () => {
    const stocks = await prisma.graphStock.findMany()

    const categories = new Set(stocks.map(s => s.category))
    expect(categories.has('核心标的')).toBe(true)
    expect(categories.has('相关标的')).toBe(true)
  })

  it('should map stocks to valid graph nodes', async () => {
    const stocks = await prisma.graphStock.findMany({
      include: {
        node: true
      }
    })

    stocks.forEach(stock => {
      expect(stock.node).toBeDefined()
      expect(stock.node.id).toBeTruthy()
      expect(stock.node.name).toBeTruthy()
    })
  })

  it('should have unique stock codes', async () => {
    const stocks = await prisma.graphStock.findMany()
    const codes = stocks.map(s => s.stockCode)
    const uniqueCodes = new Set(codes)

    expect(uniqueCodes.size).toBe(codes.length)
  })
})
