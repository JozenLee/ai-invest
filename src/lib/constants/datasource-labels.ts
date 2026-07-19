/**
 * 数据源字段中文映射常量
 *
 * 将数据源的英文技术字段映射为中文标签，用于用户界面显示
 */

// ==================== 数据源类型 (type) ====================

/**
 * 数据源类型映射
 */
const TYPE_LABELS: Record<string, string> = {
  financial: '财经资讯',
  social: '社交媒体',
  video: '视频平台',
  custom: '自定义',
}

/**
 * 获取数据源类型的中文标签
 * @param type - 数据源类型（financial/social/video/custom）
 * @returns 中文标签
 */
export function getTypeLabel(type: string): string {
  return TYPE_LABELS[type] || type
}

// ==================== 驱动类型 (driverType) ====================

/**
 * 驱动类型映射
 */
const DRIVER_TYPE_LABELS: Record<string, string> = {
  api: 'API接口',
  crawler: '网页爬虫',
  rss: 'RSS订阅',
  social: '社交平台',
}

/**
 * 获取驱动类型的中文标签
 * @param driverType - 驱动类型（api/crawler/rss/social）
 * @returns 中文标签
 */
export function getDriverTypeLabel(driverType: string): string {
  return DRIVER_TYPE_LABELS[driverType] || driverType
}

// ==================== 数据源状态 (isActive) ====================

/**
 * 数据源状态映射
 */
const STATUS_LABELS: Record<string, string> = {
  active: '启用中',
  inactive: '已禁用',
}

/**
 * 获取数据源状态的中文标签
 * @param isActive - 是否启用
 * @returns 中文标签
 */
export function getStatusLabel(isActive: boolean): string {
  return isActive ? STATUS_LABELS.active : STATUS_LABELS.inactive
}

// ==================== 采集状态 (lastFetchStatus) ====================

/**
 * 采集状态映射
 */
const FETCH_STATUS_LABELS: Record<string, string> = {
  success: '成功',
  failed: '失败',
  running: '运行中',
}

/**
 * 获取采集状态的中文标签
 * @param status - 采集状态（success/failed/running）
 * @returns 中文标签
 */
export function getFetchStatusLabel(status: string | null): string {
  if (!status) return '未运行'
  return FETCH_STATUS_LABELS[status] || status
}

// ==================== 调度类型 (scheduleType) ====================

/**
 * 调度类型映射
 */
const SCHEDULE_TYPE_LABELS: Record<string, string> = {
  cron: 'Cron表达式',
  interval: '定时间隔',
  webhook: 'Webhook触发',
}

/**
 * 获取调度类型的中文标签
 * @param scheduleType - 调度类型（cron/interval/webhook）
 * @returns 中文标签
 */
export function getScheduleTypeLabel(scheduleType: string): string {
  return SCHEDULE_TYPE_LABELS[scheduleType] || scheduleType
}

// ==================== 导出汇总 ====================

export default {
  getTypeLabel,
  getDriverTypeLabel,
  getStatusLabel,
  getFetchStatusLabel,
  getScheduleTypeLabel,
}
