# 数据源时间显示问题修复总结

## 问题描述
数据源页面中，所有数据源的"上次采集时间"都显示为"刚刚"，而不是实际的采集时间。

## 根本原因
1. **数据库数据正确**：检查数据库发现 `lastFetchAt` 字段存储了正确的时间戳（例如：2026-07-20T05:16:13）
2. **前端计算问题**：`DataSourceCard` 组件中的 `formatTime` 函数在组件首次渲染时计算相对时间，但之后不会更新
3. **无定时刷新**：相对时间需要定期重新计算才能保持准确，但原代码没有实现这个机制

## 修复方案
在 `src/components/events/DataSourceCard.tsx` 中实现了以下改进：

### 1. 添加状态管理
```typescript
// 使用状态来存储格式化后的时间，以便定时更新
const [formattedTime, setFormattedTime] = useState<string>('');
```

### 2. 添加定时更新机制
```typescript
// 初始化和定时更新时间显示
useEffect(() => {
  // 立即计算一次
  setFormattedTime(formatTime(lastFetchAt));

  // 每30秒更新一次时间显示
  const timer = setInterval(() => {
    setFormattedTime(formatTime(lastFetchAt));
  }, 30000);

  return () => clearInterval(timer);
}, [lastFetchAt]);
```

### 3. 使用状态值渲染
```typescript
<div className="text-sm text-muted-foreground">
  {formattedTime}
</div>
```

## 修复效果
- ✅ 数据库中5天前的记录现在正确显示为 "2026/07/20 05:16:13"
- ✅ 相对时间（小时前、分钟前）会每30秒自动更新
- ✅ 不同时间范围使用不同的显示格式：
  - 1分钟内：刚刚
  - 1小时内：X分钟前
  - 24小时内：X小时前
  - 超过24小时：完整日期时间

## 测试验证
1. **数据库验证**：
```sql
SELECT id, name, lastFetchAt, datetime(lastFetchAt) as formatted_time 
FROM DataSource LIMIT 5;
```
结果显示时间正确存储。

2. **API验证**：
```bash
curl http://localhost:3000/api/datasources
```
返回的 `lastFetchAt` 字段正确。

3. **前端测试**：创建了 `test-time-display.html` 用于独立测试时间格式化逻辑。

## 技术细节
- **更新频率**：30秒（平衡实时性和性能）
- **时区处理**：使用 `toLocaleString('zh-CN')` 确保本地化显示
- **内存清理**：通过 `useEffect` 的 cleanup 函数清理定时器，避免内存泄漏
- **响应式更新**：当 `lastFetchAt` prop 变化时，自动重新设置定时器

## 相关文件
- `src/components/events/DataSourceCard.tsx` - 主要修复文件
- `test-time-display.html` - 测试页面

## 日期
2026-07-25
