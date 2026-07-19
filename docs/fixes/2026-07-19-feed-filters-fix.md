# 咨询流UI筛选功能修复

**日期**: 2026-07-19  
**问题**: 咨询流页面的全部情感、全部领域等筛选框逻辑没有生效

## 问题分析

### 1. 前端问题
在 `src/app/(dashboard)/events/feed/page.tsx` 中，Select组件的使用方式不正确：

**错误用法**：
```tsx
<Select value={sentimentFilter} onValueChange={(value) => setSentimentFilter(value ?? 'all')}>
  <SelectTrigger className="w-[160px]">
    <SelectValue placeholder={EVENTS_TEXT.feed.filter.sentimentAll}>
      {/* ❌ 在SelectValue中条件渲染子元素 */}
      {sentimentFilter === 'all' ? EVENTS_TEXT.feed.filter.sentimentAll :
       sentimentFilter === '利好' ? EVENTS_TEXT.feed.filter.sentimentBullish :
       ...}
    </SelectValue>
  </SelectTrigger>
</Select>
```

**问题**：
- shadcn/ui的Select组件，SelectValue应该只包含placeholder
- 实际显示的值应该自动从SelectItem中获取
- 在SelectValue内部条件渲染会导致组件行为异常

### 2. 数据问题
- 数据库中没有新闻数据（0条记录）
- API返回的数据来自Python服务降级，缺少sentiment和domainId字段
- 即使前端筛选逻辑正确，也无法筛选出结果

## 修复方案

### 1. 修复前端Select组件 ✅

**修改文件**: `src/app/(dashboard)/events/feed/page.tsx`

**正确用法**：
```tsx
<Select value={sentimentFilter} onValueChange={setSentimentFilter}>
  <SelectTrigger className="w-[160px]">
    <SelectValue placeholder={EVENTS_TEXT.feed.filter.sentimentAll} />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">{EVENTS_TEXT.feed.filter.sentimentAll}</SelectItem>
    <SelectItem value="利好">{EVENTS_TEXT.feed.filter.sentimentBullish}</SelectItem>
    <SelectItem value="中性">{EVENTS_TEXT.feed.filter.sentimentNeutral}</SelectItem>
    <SelectItem value="利空">{EVENTS_TEXT.feed.filter.sentimentBearish}</SelectItem>
  </SelectContent>
</Select>
```

**改进点**：
- 移除SelectValue内部的条件渲染逻辑
- 简化onValueChange回调，直接设置值
- Select组件会自动根据value值显示对应SelectItem的文本

同样的修复应用于：
- 领域筛选器（domainId）
- 排序筛选器（sortBy）

### 2. 修复种子脚本 ✅

**修改文件**: `scripts/seed.ts`

**问题**：
- 用户已存在导致create失败
- Portfolio没有复合唯一索引，不能使用upsert的userId_name语法

**解决方案**：
```typescript
// 使用upsert而不是create
const user = await prisma.user.upsert({
  where: { email: 'demo@example.com' },
  update: {},
  create: { /* ... */ }
})

// Portfolio使用findFirst + create
let portfolio = await prisma.portfolio.findFirst({
  where: { userId: user.id, name: '默认组合' }
})
if (!portfolio) {
  portfolio = await prisma.portfolio.create({ /* ... */ })
}
```

### 3. 添加测试新闻数据 ✅

**新建文件**: `scripts/seed-news.ts`

创建12条带有完整字段的测试新闻：
- ✅ 包含sentiment值（-1.0到1.0）
- ✅ 关联domainId（AI算力、半导体、新能源、医药医疗）
- ✅ 关联categoryId
- ✅ 包含impact、sectors等完整字段

**数据分布**：
- 利好新闻：7条（sentiment > 0.2）
- 中性新闻：2条（-0.2 ≤ sentiment ≤ 0.2）
- 利空新闻：3条（sentiment < -0.2）

按领域分布：
- AI算力：4条
- 半导体：3条
- 新能源：2条
- 医药医疗：2条
- 未分类：1条

## 测试验证

### 测试脚本
创建 `scripts/test-feed-filters.sh`，包含11个测试用例：

1. ✅ 获取所有新闻（无筛选）
2. ✅ 情感筛选 - 利好（bullish）
3. ✅ 情感筛选 - 利空（bearish）
4. ✅ 情感筛选 - 中性（neutral）
5. ✅ 获取领域列表
6. ✅ 领域筛选 - AI算力
7. ✅ 获取分类列表
8. ✅ 分类筛选 - 科技
9. ✅ 排序功能 - 按时间
10. ✅ 排序功能 - 按情感强度
11. ✅ 组合筛选（情感+排序）

### 测试结果
**全部通过** ✅

关键验证点：
- 情感筛选返回正确的sentiment范围数据
- 领域筛选返回正确的domainId数据
- 组合筛选正确应用多个条件
- 排序功能按预期工作

## 后端逻辑验证

### API路由
`src/app/api/events/feed/route.ts` - 逻辑正确 ✅
- 正确接收并传递categoryId、domainId、sentiment参数
- 支持子分类查询（包含父分类和所有子分类）

### 事件服务
`src/lib/services/event.service.ts` - 逻辑正确 ✅

情感筛选SQL条件：
```typescript
if (sentiment) {
  switch (sentiment) {
    case 'bullish':
      where.sentiment = { gt: 0.2 }
      break
    case 'bearish':
      where.sentiment = { lt: -0.2 }
      break
    case 'neutral':
      where.sentiment = { gte: -0.2, lte: 0.2 }
      break
  }
}
```

领域筛选SQL条件：
```typescript
if (domainId) {
  where.domainId = domainId
}
```

## 执行步骤

```bash
# 1. 运行基础种子数据
npm run db:seed

# 2. 添加测试新闻数据
npx tsx scripts/seed-news.ts

# 3. 启动开发服务器
npm run dev

# 4. 运行测试
bash scripts/test-feed-filters.sh
```

## 关键修复点总结

1. **前端Select组件使用规范**
   - SelectValue不应包含条件渲染的子元素
   - 只需要placeholder属性
   - 组件会自动显示选中项的文本

2. **数据完整性**
   - 筛选功能依赖数据库中的sentiment和domainId字段
   - 必须有完整的测试数据才能验证筛选功能
   - Python服务降级数据可能缺少这些字段

3. **API参数映射**
   - 前端中文标签（'利好'）→ API英文参数（'bullish'）
   - 通过sentimentApiMap进行转换
   - 'all'值需要在URL构建时过滤掉

## 相关文件

### 修改的文件
- `src/app/(dashboard)/events/feed/page.tsx` - 修复Select组件
- `scripts/seed.ts` - 修复种子脚本错误

### 新增的文件
- `scripts/seed-news.ts` - 新闻测试数据
- `scripts/test-feed-filters.sh` - 筛选功能测试脚本
- `docs/fixes/2026-07-19-feed-filters-fix.md` - 本文档

### 验证的文件（无需修改）
- `src/app/api/events/feed/route.ts` - 后端逻辑正确
- `src/lib/services/event.service.ts` - 服务逻辑正确

## 用户体验改进

修复后，用户可以正常使用以下功能：
- ✅ 按情感筛选（全部/利好/中性/利空）
- ✅ 按领域筛选（全部领域/AI算力/半导体等）
- ✅ 按分类筛选（科技/财经/政治等）
- ✅ 按排序方式（最新发布/情感最强/影响力最高）
- ✅ 关键词搜索
- ✅ 组合筛选（多个条件同时生效）
- ✅ 实时更新筛选条件标签
- ✅ 一键清除所有筛选

## 后续建议

1. **数据采集**
   - 实施定时采集任务，确保数据库有持续的新闻数据
   - 使用Claude API自动分析新闻的sentiment和领域

2. **性能优化**
   - 为高频查询添加数据库索引（已有）
   - 考虑添加Redis缓存层

3. **用户体验**
   - 添加筛选结果数量预览
   - 保存用户筛选偏好
   - 添加筛选历史记录
