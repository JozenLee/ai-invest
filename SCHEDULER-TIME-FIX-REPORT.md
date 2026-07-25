# 调度器时间显示统一为北京时间 - 修复报告

## 问题描述
用户报告：调度器中的"上次运行"和"运行历史"时间显示不是北京时间，但"下次运行"时间是北京时间，导致时间显示不一致。

## 根本原因
多个调度器相关组件使用了 `toLocaleString('zh-CN')` 而没有明确指定 `timeZone: 'Asia/Shanghai'`，导致：
- 不同组件的时间显示可能不一致
- 部分时间可能使用系统默认时区而非北京时间
- 与统一的时间工具函数不一致

## 修复内容

### 修复的组件列表

#### 1. SchedulerDialog.tsx
**文件路径**: `src/components/events/SchedulerDialog.tsx`

**修改**:
- 引入 `formatBeijingTime` 工具函数
- 修改 `formatTime` 函数使用统一工具
- 影响范围：
  - 调度器设置对话框中的"上次运行"时间
  - 调度器设置对话框中的"下次运行"时间
  - 运行历史列表中的时间戳

```typescript
// 修改前
const formatTime = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

// 修改后
import { formatBeijingTime } from '@/lib/time-utils';

const formatTime = (dateString: string) => {
  return formatBeijingTime(dateString, 'full');
};
```

#### 2. SchedulerDrawer.tsx
**文件路径**: `src/components/events/SchedulerDrawer.tsx`

**修改**:
- 引入 `formatBeijingTime` 工具函数
- 修改 `formatTime` 函数使用统一工具
- 影响范围：
  - 抽屉式调度器中的"上次运行"时间
  - 抽屉式调度器中的"下次运行"时间
  - 运行历史列表中的时间戳

#### 3. HealthMonitor.tsx
**文件路径**: `src/components/datasources/HealthMonitor.tsx`

**修改**:
- 引入 `formatBeijingTime` 工具函数
- 修改"最后失败时间"的显示
- 影响范围：
  - 健康监控组件中的失败时间显示

```typescript
// 修改前
最后失败时间: {new Date(data.lastFailed).toLocaleString('zh-CN')}

// 修改后
最后失败时间: {formatBeijingTime(data.lastFailed, 'full')}
```

#### 4. FetchLogs.tsx
**文件路径**: `src/components/logs/FetchLogs.tsx`

**修改**:
- 引入 `formatRelativeTime` 工具函数
- 简化 `formatTime` 函数，使用统一工具
- 影响范围：
  - 采集日志列表中的时间显示

```typescript
// 修改前
const formatTime = (dateString: string) => {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return '刚刚'
  if (diffMins < 60) return `${diffMins}分钟前`
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}小时前`

  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 修改后
import { formatRelativeTime } from '@/lib/time-utils';

const formatTime = (dateString: string) => {
  return formatRelativeTime(dateString)
}
```

#### 5. StatsOverview.tsx
**文件路径**: `src/components/stats/StatsOverview.tsx`

**修改**:
- 引入 `formatBeijingTime` 工具函数
- 修改"最后采集"时间的显示
- 影响范围：
  - 统计概览中的最后采集时间

```typescript
// 修改前
最后采集: ${new Date(stats.dataSources.lastFetch).toLocaleString('zh-CN', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
})}

// 修改后
最后采集: ${formatBeijingTime(stats.dataSources.lastFetch, 'short')}
```

#### 6. [id]/page.tsx (数据源详情页)
**文件路径**: `src/app/(dashboard)/events/sources/[id]/page.tsx`

**修改**:
- 引入 `formatBeijingTime` 工具函数
- 修改"创建于"时间的显示
- 影响范围：
  - 数据源详情页面中的创建时间

## 统一时间工具函数

所有修复都使用了 `src/lib/time-utils.ts` 中的统一工具函数：

### formatBeijingTime()
用于显示绝对时间（北京时间）：
- `'full'`: 完整格式 - `2026/07/25 10:30:45`
- `'short'`: 短格式 - `07/25 10:30`
- `'date-only'`: 仅日期 - `2026/07/25`

### formatRelativeTime()
用于显示相对时间：
- 小于1分钟：`刚刚`
- 小于1小时：`X分钟前`
- 小于24小时：`X小时前`
- 超过24小时：显示北京时间日期

### formatFutureTime()
用于显示未来时间：
- 小于1分钟：`即将执行`
- 小于1小时：`X分钟后`
- 小于24小时：`X小时后`
- 超过24小时：显示北京时间日期

## 验证结果

### TypeScript 类型检查
```bash
$ npm run typecheck
✅ 通过
```

### 时间格式化统一性检查
- ✅ 所有调度器相关组件已使用统一工具
- ✅ 所有时间显示明确指定 `timeZone: 'Asia/Shanghai'`
- ✅ 不再有混合使用不同时间格式化方式的情况

### 修改的文件数量
- 新增文件：1 个（`time-utils.ts`）
- 修改文件：6 个组件
- 统一使用时间工具的位置：15+ 处

## 用户体验改进

### 修复前
- "上次运行"可能显示非北京时间 ❌
- "运行历史"时间可能不一致 ❌
- 不同组件时间格式不统一 ❌

### 修复后
- 所有时间统一显示北京时间 ✅
- 相对时间（"X分钟前"）更直观 ✅
- 绝对时间明确标注时区 ✅
- 代码维护性提高 ✅

## 技术改进

### 1. 代码复用
- 所有时间格式化使用统一工具函数
- 减少重复代码
- 便于全局修改和扩展

### 2. 时区处理一致性
- 后端存储：UTC时间（带时区信息）
- 前端显示：北京时间
- 计算逻辑：基于UTC时间

### 3. 类型安全
- TypeScript 类型检查通过
- 函数签名明确
- 减少运行时错误

## 后续建议

1. **代码规范**：在代码审查中确保所有新的时间显示都使用统一工具函数
2. **文档更新**：在开发文档中说明时间处理的最佳实践
3. **单元测试**：为时间工具函数添加单元测试，覆盖各种边界情况
4. **全局检查**：定期检查是否有新增的直接使用 `toLocaleString` 的代码

## 影响范围总结

### 直接影响
- ✅ 调度器设置对话框
- ✅ 调度器抽屉
- ✅ 健康监控组件
- ✅ 采集日志列表
- ✅ 统计概览
- ✅ 数据源详情页

### 间接影响
- ✅ 提高代码一致性
- ✅ 提升用户体验
- ✅ 便于后续维护

---
**修复完成时间**: 2026-07-25 02:50 CST  
**修复人员**: Claude (Opus 4.8)  
**验证状态**: ✅ 全部通过
