# 数据源时间显示统一为北京时间 - 完整修复报告

## 修复目标
将所有数据源的时间显示统一为北京时间（CST = UTC+8），确保用户看到的时间更直观。

## 问题诊断

### 初始问题
用户报告：36氪、华尔街见闻、财联社等数据源显示"8小时前"，但实际应该是"几分钟前"。

### 根本原因
数据库中存在两种时间戳格式：

1. **新采集的数据**（修复后的代码）：
   - 格式：`2026-07-24T18:36:48.065902+00:00`
   - 带有 `+00:00` 时区标识
   - 正确的UTC时间 ✅

2. **被错误修复的历史数据**：
   - 格式：`2026-07-24T10:34:25.532437`
   - 没有时区标识
   - 被第一次修复脚本错误地减去了8小时 ❌

### 时间处理错误链
1. **原始问题**：Python 使用 `datetime.utcnow()` 存储 naive datetime
2. **第一次修复**：修复脚本误将本地时间格式的时间戳减去8小时
3. **显示错误**：导致时间往过去偏移了8小时

## 完整解决方案

### 1. 创建统一的时间格式化工具
**文件**: `src/lib/time-utils.ts`

创建了专门的时间工具函数：
- `formatRelativeTime()`: 格式化相对时间（"X分钟前"）
- `formatBeijingTime()`: 格式化为北京时间
- `formatFutureTime()`: 格式化未来时间（"X分钟后"）

所有函数统一使用 `timeZone: 'Asia/Shanghai'` 确保显示北京时间。

```typescript
export function formatBeijingTime(
  date: Date | string,
  format: 'full' | 'short' | 'date-only' = 'full'
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Shanghai',
    // ... 其他选项
  };
  return dateObj.toLocaleString('zh-CN', options);
}
```

### 2. 更新前端组件使用统一工具

#### DataSourceCard 组件
**文件**: `src/components/events/DataSourceCard.tsx`

- 引入 `formatRelativeTime` 和 `formatFutureTime`
- 移除重复的时间格式化逻辑
- 使用 `useEffect` 定时更新时间显示

#### 数据源页面
**文件**: `src/app/(dashboard)/events/sources/page.tsx`

- 引入 `formatRelativeTime`
- 简化 `calculateLatestFetchTime` 函数
- 统一使用时间工具函数

#### 事件Feed页面
**文件**: `src/app/(dashboard)/events/feed/page.tsx`

- 引入 `formatRelativeTime`
- 简化 `formatTime` 函数
- 统一时间显示逻辑

### 3. 修复数据库中的错误时间戳
**脚本**: `data-service/scripts/fix_incorrect_timestamps.py`

识别并修复被错误处理的时间戳：
- 查询没有时区标识的记录
- 加回被错误减去的8小时
- 转换为带时区的ISO格式 (`+00:00`)

修复结果：✅ 成功修复 15 个时间戳

### 4. 后端保持UTC存储
**文件**: `data-service/services/fetch_service.py`

保持使用 `datetime.now(timezone.utc)` 存储UTC时间：
- 符合国际最佳实践
- 便于跨时区处理
- 只在显示时转换为本地时间

## 验证结果

### 数据库时间戳格式统一
所有记录现在都使用带时区的ISO格式：
```
ds_newsnow_cailian    | 2026-07-24T18:36:48.065902+00:00
ds_newsnow_thepaper   | 2026-07-24T18:36:40.746757+00:00
ds_newsnow_36kr       | 2026-07-24T18:34:25.532437+00:00
ds_newsnow_wallstreet | 2026-07-24T18:33:47.645084+00:00
```

### 时间显示正确
当前时间：2026-07-24 18:43 UTC (北京时间 2026-07-25 02:43)

各数据源显示：
- 36氪-NewsNow: 8分钟前 ✅
- 澎湃财经-NewsNow: 6分钟前 ✅
- 财联社热榜-NewsNow: 6分钟前 ✅
- 华尔街见闻-NewsNow: 9分钟前 ✅

### TypeScript类型检查
```bash
$ npm run typecheck
✅ 通过
```

## 技术改进总结

### 1. 时区处理最佳实践
- ✅ 后端存储：始终使用UTC时间（带时区信息）
- ✅ 前端显示：转换为用户本地时区（北京时间）
- ✅ 时间计算：基于UTC时间进行

### 2. 代码复用性
- ✅ 统一的时间格式化工具函数
- ✅ 所有组件使用相同的工具
- ✅ 便于维护和扩展

### 3. 用户体验
- ✅ 相对时间显示（"X分钟前"）更直观
- ✅ 北京时间对齐用户习惯
- ✅ 定时更新保持时间准确

## 文件修改清单

### 新增文件
- `src/lib/time-utils.ts` - 时间格式化工具
- `data-service/scripts/fix_incorrect_timestamps.py` - 时间戳修复脚本

### 修改文件
- `src/components/events/DataSourceCard.tsx` - 使用统一时间工具
- `src/app/(dashboard)/events/sources/page.tsx` - 使用统一时间工具
- `src/app/(dashboard)/events/feed/page.tsx` - 使用统一时间工具

### 数据库修改
- 修复 15 个错误的时间戳
- 所有时间戳统一为带时区的UTC格式

## 后续建议

1. **监控新采集数据**：确保所有新数据都使用正确的UTC时间格式
2. **代码规范**：在代码审查中强制要求使用 `datetime.now(timezone.utc)`
3. **时间工具扩展**：根据需要添加更多时间格式化选项（如完整日期显示）
4. **其他页面检查**：确保整个应用中的时间显示都使用统一工具

---
**修复完成时间**: 2026-07-25 02:43 CST  
**修复人员**: Claude (Opus 4.8)  
**验证状态**: ✅ 全部通过
