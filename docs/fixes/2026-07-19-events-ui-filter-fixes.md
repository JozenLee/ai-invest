# 事件资讯UI筛选框修复

**日期**: 2026-07-19  
**问题**: 事件资讯页面筛选框显示逻辑错误，板块筛选被遮挡

## 问题描述

### 1. SelectValue显示逻辑错误
在多个事件页面中，`SelectValue` 组件内部使用了条件判断来显示选中的值，这导致：
- 筛选框显示内容与实际选中值不匹配
- SelectValue不会自动显示SelectItem的文本
- 用户选择后看到的是条件判断结果，而不是选项文本

**错误示例**：
```tsx
<SelectValue>
  {sentimentFilter === 'all' && '全部情感'}
  {sentimentFilter === '利好' && '利好'}
  {sentimentFilter === '中性' && '中性'}
  {sentimentFilter === '利空' && '利空'}
</SelectValue>
```

### 2. 板块筛选框z-index遮挡问题
在feed页面的二级分类下拉菜单中：
- 使用了 `z-10` 和 `bg-card`，容易被其他组件遮挡
- 阴影效果不够明显

### 3. 筛选规则与显示内容未正确联动
虽然API调用时传递了正确的参数，但前端显示逻辑不正确，导致用户看到的选项和实际筛选结果不一致。

## 修复方案

### 1. 修复SelectValue用法
**正确做法**：在SelectValue的children中使用条件判断来正确显示中文文本，并保持value为中文以便映射

```tsx
<Select value={sentimentFilter} onValueChange={(value) => setSentimentFilter(value ?? 'all')}>
  <SelectTrigger className="w-[160px]">
    <SelectValue placeholder={EVENTS_TEXT.feed.filter.sentimentAll}>
      {sentimentFilter === 'all' ? EVENTS_TEXT.feed.filter.sentimentAll :
       sentimentFilter === '利好' ? EVENTS_TEXT.feed.filter.sentimentBullish :
       sentimentFilter === '中性' ? EVENTS_TEXT.feed.filter.sentimentNeutral :
       sentimentFilter === '利空' ? EVENTS_TEXT.feed.filter.sentimentBearish :
       EVENTS_TEXT.feed.filter.sentimentAll}
    </SelectValue>
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">{EVENTS_TEXT.feed.filter.sentimentAll}</SelectItem>
    <SelectItem value="利好">{EVENTS_TEXT.feed.filter.sentimentBullish}</SelectItem>
    <SelectItem value="中性">{EVENTS_TEXT.feed.filter.sentimentNeutral}</SelectItem>
    <SelectItem value="利空">{EVENTS_TEXT.feed.filter.sentimentBearish}</SelectItem>
  </SelectContent>
</Select>
```

**关键点**：
- SelectValue的children需要显式映射value到显示文本
- 使用三元表达式确保所有情况都有对应的显示文本
- value保持为中文，通过sentimentApiMap映射到API参数

### 2. 修复z-index遮挡问题

**问题根源**：Card组件的CardContent默认可能有overflow限制，导致absolute定位的子元素被裁剪

**解决方案**：
1. 为CardContent添加 `overflow-visible` 类
2. 为分类标签容器添加 `relative` 类
3. 二级下拉菜单使用高z-index和正确的背景色

```tsx
{/* 筛选栏 */}
<Card>
  <CardContent className="p-4 space-y-4 overflow-visible">
    {/* 分类标签 */}
    <div className="flex flex-wrap gap-2 relative">
      {/* ... */}
      {/* 二级分类下拉 */}
      <div className="absolute top-full left-0 z-50 mt-1 min-w-[150px] rounded-md border bg-popover p-1 shadow-lg">
        {/* ... */}
      </div>
    </div>
  </CardContent>
</Card>
```

**改进点**：
- CardContent添加 `overflow-visible` 防止内容被裁剪
- 分类标签容器添加 `relative` 作为定位参考
- `z-10` → `z-50` 确保在最上层
- `bg-card` → `bg-popover` 使用正确的弹出层背景色
- `shadow-md` → `shadow-lg` 增强阴影效果

### 3. 统一所有筛选器的显示逻辑
确保所有Select组件都使用placeholder属性，而不是在SelectValue内部做条件判断。

## 修复的文件

### 1. `/src/app/(dashboard)/events/feed/page.tsx`
- ✅ 修复情感筛选器显示
- ✅ 修复领域筛选器显示
- ✅ 修复排序筛选器显示
- ✅ 修复板块筛选框z-index遮挡问题

### 2. `/src/app/(dashboard)/events/trends/page.tsx`
- ✅ 修复领域选择器显示

### 3. `/src/app/(dashboard)/events/sources/page.tsx`
- ✅ 修复分类筛选器显示

### 4. `/src/app/(dashboard)/events/influencers/page.tsx`
- ✅ 修复平台筛选器显示
- ✅ 修复领域筛选器显示

## 技术说明

### SelectValue组件的正确用法

根据 `@base-ui/react` 的Select组件实现：

1. **SelectValue需要显式提供children来显示当前选中值**
2. **placeholder用于未选中时的占位文本**
3. **当value和显示文本不一致时，必须在SelectValue的children中映射**

```tsx
// ❌ 错误用法 - 使用 && 运算符会导致显示false或undefined
<SelectValue>
  {value === 'a' && 'Option A'}
  {value === 'b' && 'Option B'}
</SelectValue>

// ❌ 错误用法 - 空的SelectValue不会自动显示SelectItem的文本
<SelectValue placeholder="请选择" />

// ✅ 正确用法 - 使用三元表达式确保总有返回值
<SelectValue placeholder="请选择">
  {value === 'a' ? 'Option A' :
   value === 'b' ? 'Option B' :
   '请选择'}
</SelectValue>

// ✅ 正确用法 - 从数组中查找
<SelectValue placeholder="请选择">
  {options.find(opt => opt.value === value)?.label || '请选择'}
</SelectValue>
```

**为什么需要显式映射？**

在本项目中，筛选器的value使用中文（如"利好"），但显示文本来自常量文件（如`EVENTS_TEXT.feed.filter.sentimentBullish`）。即使value和显示文本相同，Base UI的Select也不会自动将SelectItem的文本显示在SelectValue中，需要显式提供。

### z-index层级管理

在UI组件库中：
- `z-10`: 普通浮动元素
- `z-20`: 对话框背景遮罩
- `z-30`: 对话框内容
- `z-40`: Toast通知
- `z-50`: 下拉菜单、工具提示等需要在最上层的元素

二级分类下拉菜单需要覆盖其他所有内容，因此使用 `z-50`。

## 测试验证

### 手动测试步骤

1. **情感筛选测试**
   - 打开事件资讯页面
   - 点击情感筛选框
   - 选择"利好"，验证：
     - 筛选框显示"利好"
     - 新闻列表只显示利好新闻
     - 当前筛选条件显示"情感: 利好"

2. **板块筛选测试**
   - 点击带有子分类的板块按钮
   - 验证二级分类下拉菜单：
     - 正确显示在按钮下方
     - 不被其他组件遮挡
     - 点击子分类后正确筛选

3. **领域筛选测试**
   - 选择不同领域
   - 验证筛选框显示正确的领域名称
   - 验证新闻列表正确筛选

4. **其他页面测试**
   - trends页面：验证领域选择器
   - sources页面：验证分类筛选器
   - influencers页面：验证平台和领域筛选器

### 自动化测试

```bash
# 类型检查
npm run typecheck

# 构建测试
npm run build
```

## 预期效果

修复后：
1. ✅ 所有筛选框正确显示选中的选项文本
2. ✅ 二级分类下拉菜单不会被遮挡
3. ✅ 筛选逻辑与显示内容完全一致
4. ✅ 用户体验流畅，无显示错误

## 相关文档

- [shadcn/ui Select组件文档](https://ui.shadcn.com/docs/components/select)
- [Base UI Select API](https://base-ui.com/components/select)
- [事件资讯UI优化设计文档](../superpowers/specs/2026-07-19-events-ui-optimization-design.md)
