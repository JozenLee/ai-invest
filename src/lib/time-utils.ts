/**
 * 时间格式化工具函数
 * 统一处理时间显示，确保使用北京时间（CST = UTC+8）
 */

/**
 * 格式化相对时间（如"5分钟前"）
 * @param dateString ISO格式的时间字符串
 * @returns 格式化后的相对时间字符串
 */
export function formatRelativeTime(dateString?: string): string {
  if (!dateString) return '从未运行';

  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  // 小于1分钟
  if (diff < 60 * 1000) {
    return '刚刚';
  }
  // 小于1小时
  if (diff < 60 * 60 * 1000) {
    return `${Math.floor(diff / (60 * 1000))}分钟前`;
  }
  // 小于24小时
  if (diff < 24 * 60 * 60 * 1000) {
    return `${Math.floor(diff / (60 * 60 * 1000))}小时前`;
  }

  // 超过24小时，显示北京时间的日期时间
  return formatBeijingTime(date, 'short');
}

/**
 * 格式化为北京时间
 * @param date Date对象或ISO字符串
 * @param format 'full' | 'short' | 'date-only'
 * @returns 格式化后的北京时间字符串
 */
export function formatBeijingTime(
  date: Date | string,
  format: 'full' | 'short' | 'date-only' = 'full'
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  // 使用 Intl.DateTimeFormat 明确指定时区为 Asia/Shanghai（北京时间）
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Shanghai',
  };

  switch (format) {
    case 'full':
      // 完整格式：2026-07-25 10:30:45
      return dateObj.toLocaleString('zh-CN', {
        ...options,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });

    case 'short':
      // 短格式：07-25 10:30
      return dateObj.toLocaleString('zh-CN', {
        ...options,
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

    case 'date-only':
      // 仅日期：2026-07-25
      return dateObj.toLocaleDateString('zh-CN', {
        ...options,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });

    default:
      return dateObj.toLocaleString('zh-CN', options);
  }
}

/**
 * 获取北京时间的当前时间
 * @returns Date对象
 */
export function getBeijingTime(): Date {
  return new Date();
}

/**
 * 格式化未来时间（如"5分钟后"）
 * @param dateString ISO格式的时间字符串
 * @returns 格式化后的相对时间字符串
 */
export function formatFutureTime(dateString?: string): string {
  if (!dateString) return '未设置';

  const date = new Date(dateString);
  const now = new Date();
  const diff = date.getTime() - now.getTime();

  // 已过期
  if (diff < 0) {
    return '待执行';
  }
  // 小于1分钟
  if (diff < 60 * 1000) {
    return '即将执行';
  }
  // 小于1小时
  if (diff < 60 * 60 * 1000) {
    return `${Math.floor(diff / (60 * 1000))}分钟后`;
  }
  // 小于24小时
  if (diff < 24 * 60 * 60 * 1000) {
    return `${Math.floor(diff / (60 * 60 * 1000))}小时后`;
  }

  // 超过24小时，显示北京时间的日期时间
  return formatBeijingTime(date, 'short');
}
