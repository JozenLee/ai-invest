import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  if (process.env.VITEST) {
    const testUrl = process.env.TEST_DATABASE_URL
    if (!testUrl || testUrl === process.env.DATABASE_URL || /(?:^|\/)dev\.db$/.test(testUrl)) {
      throw new Error('数据库测试已阻止：请设置独立的 TEST_DATABASE_URL，禁止测试连接开发数据库。')
    }
  }
  const adapter = new PrismaBetterSqlite3({
    url: (process.env.VITEST ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL) || 'file:./prisma/dev.db',
  })

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query'] : [],
  })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export default prisma
