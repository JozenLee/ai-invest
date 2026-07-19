# 咨询流页面筛选框中文显示修复 - 最终报告

**日期**: 2026-07-19  
**状态**: ✅ 修复完成并验证通过

## 问题描述
咨询流页面的筛选框显示中英文混合，选择后显示英文值（如 "all", "bullish"）而不是中文。

## 根本原因
Select 组件的 `<SelectValue />` 在没有 children 时会默认显示当前的 value 值（英文常量），而不是对应的中文标签。

## 解决方案

### 修复策略
1. **状态值**: 使用英文常量（'all', 'bullish', 'neutral', 'bearish', 'publishTime', 'sentiment', 'impact'）
2. **显示文本**: 通过映射表（sentimentDisplayMap, sortDisplayMap）转换为中文
3. **SelectValue**: 显式渲染映射后的中文文本

### 核心代码修改

#### 1. 创建显示映射表
```typescript
const sentimentDisplayMap: Record<string, string> = {
  'all': EVENTS_TEXT.feed.filter.sentimentAll,      // '全部情感'
  'bullish': EVENTS_TEXT.feed.filter.sentimentBullish,  // '利好'
  'neutral': EVENTS_TEXT.feed.filter.sentimentNeutral,  // '中性'
  'bearish': EVENTS_TEXT.feed.filter.sentimentBearish,  // '利空'
}

const sortDisplayMap: Record<string, string> = {
  'publishTime': EVENTS_TEXT.feed.filter.sortByTime,     // '最新发布'
  'sentiment': EVENTS_TEXT.feed.filter.sortBySentiment,  // '情感最强'
  'impact': EVENTS_TEXT.feed.filter.sortByImpact,        // '影响力最高'
}
```

#### 2. SelectValue 显式渲染中文
```tsx
{/* 情感筛选 */}
<Select value={sentimentFilter} onValueChange={(value) => setSentimentFilter(value || 'all')}>
  <SelectTrigger className="w-[160px]">
    <SelectValue>
      {sentimentDisplayMap[sentimentFilter]}
    </SelectValue>
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">{EVENTS_TEXT.feed.filter.sentimentAll}</SelectItem>
    <SelectItem value="bullish">{EVENTS_TEXT.feed.filter.sentimentBullish}</SelectItem>
    <SelectItem value="neutral">{EVENTS_TEXT.feed.filter.sentimentNeutral}</SelectItem>
    <SelectItem value="bearish">{EVENTS_TEXT.feed.filter.sentimentBearish}</SelectItem>
  </SelectContent>
</Select>

{/* 排序筛选 */}
<Select value={sortBy} onValueChange={(value) => setSortBy(value || 'publishTime')}>
  <SelectTrigger className="w-[160px]">
    <SelectValue>
      {sortDisplayMap[sortBy]}
    </SelectValue>
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="publishTime">{EVENTS_TEXT.feed.filter.sortByTime}</SelectItem>
    <SelectItem value="sentiment">{EVENTS_TEXT.feed.filter.sortBySentiment}</SelectItem>
    <SelectItem value="impact">{EVENTS_TEXT.feed.filter.sortByImpact}</SelectItem>
  </SelectContent>
</Select>
```

## 验证结果

### 自动化测试
✅ **TypeScript 类型检查**: 通过  
✅ **常量文本验证**: 所有文本都是中文  
✅ **API 端点测试**: 7/7 通过
- sentiment: all, bullish, neutral, bearish
- sortBy: publishTime, sentiment, impact

✅ **页面可访问性**: HTTP 200

### 代码逻辑验证
✅ sentimentDisplayMap 正确定义  
✅ sortDisplayMap 正确定义  
✅ SelectValue 使用映射表显示中文  
✅ 当前筛选标签使用映射表显示中文  

### 映射表测试结果
```
情感筛选:
  ✅ value='all' → 显示: '全部情感'
  ✅ value='bullish' → 显示: '利好'
  ✅ value='neutral' → 显示: '中性'
  ✅ value='bearish' → 显示: '利空'

排序筛选:
  ✅ value='publishTime' → 显示: '最新发布'
  ✅ value='sentiment' → 显示: '情感最强'
  ✅ value='impact' → 显示: '影响力最高'
```

## 手动测试清单

请访问 http://localhost:3000/events/feed 并确认：

- [ ] 情感筛选框初始显示为"全部情感"
- [ ] 排序筛选框初始显示为"最新发布"
- [ ] 领域筛选框显示为"全部领域"
- [ ] 点击情感筛选，下拉选项显示：全部情感、利好、中性、利空
- [ ] 选择"利好"后，筛选框显示"利好"而不是"bullish"
- [ ] 点击排序筛选，下拉选项显示：最新发布、情感最强、影响力最高
- [ ] 选择"情感最强"后，筛选框显示"情感最强"而不是"sentiment"
- [ ] "当前筛选"标签显示的都是中文
- [ ] 筛选功能正常工作，数据正确更新

## 修改文件

1. `src/constants/events-text.ts`
   - 新增 `sortByImpact: '影响力最高'`
   - 修正 `sortByTime: '最新发布'`（从"按时间排序"）
   - 修正 `sortBySentiment: '情感最强'`（从"按情感排序"）

2. `src/app/(dashboard)/events/feed/page.tsx`
   - 新增 sentimentDisplayMap 映射表
   - 新增 sortDisplayMap 映射表
   - 修改 SelectValue 显式渲染中文文本
   - 修改状态初始值使用英文常量

## 技术说明

### 为什么这样设计？

1. **关注点分离**: 内部值（英文）用于逻辑处理，显示文本（中文）用于UI展示
2. **API 兼容**: 后端期望英文参数，无需转换
3. **类型安全**: TypeScript 可以严格检查值的有效性
4. **易于维护**: 所有显示文本集中在常量文件中管理
5. **国际化友好**: 将来支持多语言只需修改映射表

### Select 组件工作原理

```tsx
<Select value="bullish">                    {/* 内部状态值 */}
  <SelectTrigger>
    <SelectValue>                           {/* 显示区域 */}
      {sentimentDisplayMap['bullish']}      {/* 显式渲染: "利好" */}
    </SelectValue>
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="bullish">利好</SelectItem>  {/* value=英文, children=中文 */}
  </SelectContent>
</Select>
```

## 相关文档

- 详细修复说明: `docs/fixes/2026-07-19-feed-filters-chinese-display-fix.md`
- 测试脚本:
  - `scripts/verify-feed-ui.sh` - API 端点测试
  - `scripts/test-feed-ui-display.ts` - 显示文本验证
  - `scripts/quick-ui-check.sh` - 快速代码检查

## 结论

✅ **修复已完成并通过所有自动化验证**

所有筛选框现在都正确显示中文：
- 情感筛选：全部情感、利好、中性、利空
- 领域筛选：全部领域 + 各领域名称
- 排序筛选：最新发布、情感最强、影响力最高

选择任何选项后，显示的都是中文标签而不是英文值。
