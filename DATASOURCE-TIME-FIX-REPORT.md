# 数据源页面"上次采集时间"修复报告

## 问题描述
数据源页面顶部统计卡片的"上次采集时间"一直显示"刚刚"，即使距离上次采集已经过去了几分钟甚至几小时。

## 根本原因
发现了两个问题：

### 1. 前端缺少定时更新机制
页面组件中的 `getLatestFetchTime()` 函数只在组件渲染时计算一次，没有定时更新机制，导致时间显示静态不变。

### 2. 后端时间戳存储错误（主要问题）
Python 数据服务使用 `datetime.utcnow()` 保存时间戳，但这个方法返回的是 **naive datetime**（无时区信息），导致：
- 实际存储的是本地时间（CST = UTC+8）
- 但被当作 UTC 时间处理
- 前端解析时，时间戳向未来偏移了8小时
- 由于时间差为负数（未来时间），且 `-28748012 < 60000`，所以一直显示"刚刚"

## 修复方案

### 1. 前端优化
**文件**: `src/app/(dashboard)/events/sources/page.tsx`

- 添加 `latestFetchTime` 状态管理
- 使用 `useCallback` 重构时间计算函数
- 添加 `useEffect` 定时器，每30秒自动更新时间显示

```typescript
const [latestFetchTime, setLatestFetchTime] = useState<string>('从未运行')

const calculateLatestFetchTime = useCallback(() => {
  // ... 时间计算逻辑
}, [dataSources])

useEffect(() => {
  setLatestFetchTime(calculateLatestFetchTime())
  const timer = setInterval(() => {
    setLatestFetchTime(calculateLatestFetchTime())
  }, 30000)
  return () => clearInterval(timer)
}, [calculateLatestFetchTime])
```

### 2. 后端时间戳修复
**文件**: `data-service/services/fetch_service.py`

- 导入 `timezone` 模块：`from datetime import datetime, timedelta, timezone`
- 批量替换所有 `datetime.utcnow()` 为 `datetime.now(timezone.utc)`
- 确保所有时间戳都带有正确的 UTC 时区信息

```python
# 修改前
last_fetch_at=datetime.utcnow()

# 修改后
last_fetch_at=datetime.now(timezone.utc)
```

### 3. 数据库历史数据修复
**脚本**: `data-service/scripts/fix_timestamps.py`

创建了修复脚本，将数据库中所有错误的时间戳（本地时间格式）转换为正确的 UTC 时间：
- 解析现有时间戳（假设为 CST 本地时间）
- 减去8小时转换为 UTC 时间
- 更新数据库中的所有记录

修复结果：✅ 成功修复 20 个数据源的时间戳

## 验证结果

修复后的时间显示（当前时间：2026-07-24 18:34 UTC）：
- 雪球: 4分钟前 ✅
- AI资讯-AKShare: 14分钟前 ✅
- 财联社热榜-NewsNow: 17分钟前 ✅
- 澎湃财经-NewsNow: 19分钟前 ✅
- 财新网-AKShare: 45分钟前 ✅

统计卡片显示："4分钟前" ✅

## 影响范围
- ✅ 数据源页面顶部统计卡片
- ✅ 单个数据源卡片的"上次采集"时间
- ✅ 所有后续的采集任务时间戳
- ✅ 数据库中的历史时间记录

## 技术要点
1. **时区处理**: 始终使用带时区信息的 datetime 对象（`timezone.utc`）
2. **定时更新**: 客户端组件使用 `useEffect` + `setInterval` 实现时间的自动刷新
3. **数据一致性**: 历史数据也需要一并修复，确保新旧数据使用相同的时间格式

## 后续建议
1. 在其他可能使用时间戳的地方检查是否有类似问题
2. 考虑在代码规范中明确：所有时间戳必须使用 `datetime.now(timezone.utc)`
3. 前端显示时间时，统一使用相对时间（"X分钟前"）而非绝对时间，提升用户体验

---
**修复完成时间**: 2026-07-25 02:35 CST  
**修复人员**: Claude (Opus 4.8)
