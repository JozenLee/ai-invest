
export type PublishSchedule = { enabled: boolean; times: string[]; industryIds: string[]; accountId: string; visibility: '仅自己可见' | '公开可见'; tags: string[]; isOriginal: boolean }
export const DEFAULT_PUBLISH_SCHEDULE: PublishSchedule = { enabled: false, times: ['12:30', '14:30'], industryIds: [], accountId: '', visibility: '仅自己可见', tags: [], isOriginal: true }

export function validatePublishSchedule(value: PublishSchedule): PublishSchedule {
  if (!value || typeof value.enabled !== 'boolean' || !Array.isArray(value.times) || !value.times.length || value.times.length > 4 || value.times.some(time => !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) throw new Error('请设置 1–4 个 HH:mm 格式时间')
  if (!Array.isArray(value.industryIds) || value.industryIds.some(id => typeof id !== 'string') || (value.enabled && !value.industryIds.length)) throw new Error('请选择至少一个产业')
  if (typeof value.accountId !== 'string' || (value.enabled && !value.accountId)) throw new Error('请选择发布账号')
  if (!['仅自己可见', '公开可见'].includes(value.visibility)) throw new Error('无效可见范围')
  if (!Array.isArray(value.tags) || value.tags.length > 10 || value.tags.some(tag => typeof tag !== 'string' || tag.length > 30)) throw new Error('最多设置10个话题，每个不超过30字')
  return { enabled: value.enabled, times: [...new Set(value.times)].sort(), industryIds: [...new Set(value.industryIds)], accountId: value.accountId, visibility: value.visibility, tags: value.tags.map(tag => tag.trim()).filter(Boolean), isOriginal: value.isOriginal !== false }
}


export function dueSlots(schedule: PublishSchedule, now = new Date()) {
  const local = new Date(now.getTime() + 8 * 3600000)
  const minute = local.getUTCHours() * 60 + local.getUTCMinutes()
  return schedule.enabled ? schedule.times.filter(time => { const [h,m] = time.split(':').map(Number); return minute >= h * 60 + m && minute - h * 60 - m < 5 }).map(time => `${local.toISOString().slice(0,10)}T${time}+08:00`) : []
}
