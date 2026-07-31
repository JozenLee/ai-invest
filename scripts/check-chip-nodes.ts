import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

const adapter = new PrismaBetterSqlite3({ url: 'file:./prisma/dev.db' })
const prisma = new PrismaClient({ adapter })

async function check() {
  const chipNodes = await prisma.graphNode.findMany({
    where: { type: 'chip_design' }
  })
  console.log('chip_design nodes:')
  chipNodes.forEach(n => console.log(`  ${n.name} (type: ${n.type})`))

  await prisma.$disconnect()
}

check().catch(console.error)
