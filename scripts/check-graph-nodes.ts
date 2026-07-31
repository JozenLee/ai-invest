import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || 'file:./prisma/dev.db',
})

const prisma = new PrismaClient({ adapter })

async function check() {
  const nodes = await prisma.graphNode.findMany({
    orderBy: [{ level: 'asc' }, { type: 'asc' }],
    select: { id: true, type: true, name: true, level: true }
  })

  console.log('Total nodes:', nodes.length)
  console.log('\nNode types:', [...new Set(nodes.map(n => n.type))].join(', '))

  console.log('\nAll nodes:')
  nodes.forEach(n => console.log(`- ${n.type}: ${n.name} (level ${n.level}, id: ${n.id})`))

  await prisma.$disconnect()
}

check().catch(console.error)
