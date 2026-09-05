import { prisma } from '@/lib/db'
import { DEFAULT_PUBLISH_SCHEDULE, type PublishSchedule } from './publish-schedule-config'
export * from './publish-schedule-config'
export async function getPublishSchedule(): Promise<PublishSchedule> {
  const rows = await prisma.$queryRawUnsafe<Array<{ payload: string }>>('SELECT payload FROM publish_schedule WHERE id = ?', 'default')
  return rows.length ? JSON.parse(rows[0].payload) : structuredClone(DEFAULT_PUBLISH_SCHEDULE)
}
