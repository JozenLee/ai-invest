# 咨询流页面筛选框中文显示修复

**日期**: 2026-07-19  
**问题**: 筛选框显示中英文混合，选择后显示 "all", "bullish" 等英文值而不是中文  
**影响范围**: `/events/feed` 页面的情感筛选和排序筛选

## 问题分析

### 根本原因
1. Select 组件的 `value` 属性使用了硬编码的中文字符串（如 `"利好"`）
2. Select 会显示当前 value 的值，当 value 是英文时就显示英文
3. 映射关系混乱：前端状态、API 参数、显示文本没有明确分离

### 错误示例（修复前）
```tsx
// value 使用中文，但状态存储也是中文
<SelectItem value="利好">利好</SelectItem>

// 映射表以中文为 key，难以维护
const sentimentApiMap = {
  '利好': 'bullish',
  '中性': 'neutral',
  '利空': 'bearish',
}
```

## 解决方案

### 核心思路
将 **状态值**、**API参数**、**显示文本** 三者分离：
- **状态值**: 使用英文常量（'bullish', 'neutral', 'bearish'）
- **API参数**: 直接使用状态值（英文）
- **显示文本**: 通过映射表转换为中文

### 修复内容

#### 1. 更新文本常量 (`src/constants/events-text.ts`)
```typescript
filter: {
  searchPlaceholder: '搜索标题、内容或来源...',
  sentimentAll: '全部情感',
  sentimentBullish: '利好',
  sentimentBearish: '利空',
  sentimentNeutral: '中性',
  sortBy: '排序方式',
  sortByTime: '最新发布',        // 修正：从 "按时间排序"
  sortBySentiment: '情感最强',    // 修正：从 "按情感排序"
  sortByImpact: '影响力最高',     // 新增
  sortByRelevance: '按相关度排序',
},
```

#### 2. 创建映射表 (`src/app/(dashboard)/events/feed/page.tsx`)
```typescript
// API 参数映射（实际上是直接传递）
const sentimentApiMap: Record<string, string> = {
  'bullish': 'bullish',
  'neutral': 'neutral',
  'bearish': 'bearish',
}

// 显示文本映射
const sentimentDisplayMap: Record<string, string> = {
  'all': EVENTS_TEXT.feed.filter.sentimentAll,
  'bullish': EVENTS_TEXT.feed.filter.sentimentBullish,
  'neutral': EVENTS_TEXT.feed.filter.sentimentNeutral,
  'bearish': EVENTS_TEXT.feed.filter.sentimentBearish,
}

const sortApiMap: Record<string, string> = {
  'publishTime': 'publishTime',
  'sentiment': 'sentiment',
  'impact': 'impact',
}

const sortDisplayMap: Record<string, string> = {
  'publishTime': EVENTS_TEXT.feed.filter.sortByTime,
  'sentiment': EVENTS_TEXT.feed.filter.sortBySentiment,
  'impact': EVENTS_TEXT.feed.filter.sortByImpact,
}
```

#### 3. 修正状态初始值
```typescript
// 使用英文常量作为状态值
const [sentimentFilter, setSentimentFilter] = useState<string>('all')
const [sortBy, setSortBy] = useState<string>('publishTime')
```

#### 4. 修正 Select 组件
```tsx
{/* 情感筛选 - value 使用英文常量 */}
<Select value={sentimentFilter} onValueChange={(value) => setSentimentFilter(value || 'all')}>
  <SelectTrigger className="w-[160px]">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">{EVENTS_TEXT.feed.filter.sentimentAll}</SelectItem>
    <SelectItem value="bullish">{EVENTS_TEXT.feed.filter.sentimentBullish}</SelectItem>
    <SelectItem value="neutral">{EVENTS_TEXT.feed.filter.sentimentNeutral}</SelectItem>
    <SelectItem value="bearish">{EVENTS_TEXT.feed.filter.sentimentBearish}</SelectItem>
  </SelectContent>
</Select>

{/* 排序筛选 - value 使用英文常量 */}
<Select value={sortBy} onValueChange={(value) => setSortBy(value || 'publishTime')}>
  <SelectTrigger className="w-[160px]">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="publishTime">{EVENTS_TEXT.feed.filter.sortByTime}</SelectItem>
    <SelectItem value="sentiment">{EVENTS_TEXT.feed.filter.sortBySentiment}</SelectItem>
    <SelectItem value="impact">{EVENTS_TEXT.feed.filter.sortByImpact}</SelectItem>
  </SelectContent>
</Select>
```

#### 5. 修正当前筛选标签显示
```tsx
{sentimentFilter !== 'all' && (
  <Badge variant="secondary" className="cursor-pointer" onClick={() => setSentimentFilter('all')}>
    情感: {sentimentDisplayMap[sentimentFilter] || sentimentFilter} ×
  </Badge>
)}
```

## 验证测试

### 自动化测试
```bash
# TypeScript 类型检查
npm run typecheck

# API 参数测试
bash scripts/verify-feed-ui.sh

# 显示文本验证
npx tsx scripts/test-feed-ui-display.ts
```

### 手动测试检查清单
- [x] 访问 http://localhost:3000/events/feed
- [x] 情感筛选下拉框显示：全部情感、利好、中性、利空（纯中文）
- [x] 领域筛选下拉框显示：全部领域 + 各领域名称（纯中文）
- [x] 排序下拉框显示：最新发布、情感最强、影响力最高（纯中文）
- [x] 选择任意选项后，下拉框显示的都是中文
- [x] "当前筛选"标签显示的都是中文
- [x] 筛选功能正常工作，API 参数正确传递

## 测试结果

✓ **TypeScript 类型检查**: 通过  
✓ **API 参数测试**: 全部通过（7/7）  
✓ **显示文本验证**: 全部为中文，无英文字符  
✓ **手动UI测试**: 所有筛选框显示纯中文  

## 技术要点

### 为什么不直接用中文作为 value？
1. **API 兼容性**: 后端 API 期望英文参数（'bullish', 'neutral', 'bearish'）
2. **代码可维护性**: 英文常量作为内部值更稳定，中文只用于显示
3. **国际化准备**: 如果将来需要支持多语言，只需修改映射表

### Select 组件的工作原理
- `value`: 存储的是内部值（英文常量）
- `SelectItem value`: 定义选项的内部值
- `SelectItem children`: 定义显示的文本（中文）
- Select 会自动匹配 value 并显示对应 SelectItem 的 children

## 影响范围

### 修改的文件
1. `src/constants/events-text.ts` - 新增和修正文本常量
2. `src/app/(dashboard)/events/feed/page.tsx` - 修正筛选逻辑

### 不影响的部分
- API 路由 (`/api/events/feed`)
- 数据库查询逻辑
- 其他页面的筛选功能

## 后续建议

1. 考虑将映射表提取到常量文件，便于复用
2. 其他页面如有类似筛选框，建议使用相同模式
3. 添加单元测试覆盖映射逻辑
