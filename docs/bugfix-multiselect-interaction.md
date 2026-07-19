# 修复多选筛选框交互Bug

## Bug描述
**问题**: 全选了"科技类"的参数后，"财经类"等其他筛选框中也会出现"清空"按钮

**根本原因**: 
- 所有分类筛选框共享同一个 `selectedCategoryIds` 状态数组
- `MultiSelect` 组件使用 `value.length > 0` 来判断是否显示"清空"按钮
- 导致只要有任何一个分类被选中，所有分类筛选框都会显示"清空"按钮

## 解决方案

### 修改 `MultiSelect` 组件逻辑
**文件**: `src/components/events/MultiSelect.tsx`

### 关键改进

#### 1. 过滤当前组的选中值
```typescript
// 只获取当前组内被选中的项
const currentGroupValues = value.filter(v =>
  options.some(opt => opt.value === v)
);
```

#### 2. 修改清空逻辑
```typescript
const clearAll = () => {
  // 只清除当前组的选项，保留其他组的选项
  const optionValues = options.map(opt => opt.value);
  const newValue = value.filter(v => !optionValues.includes(v));
  onChange(newValue);
};
```

**改进前**:
```typescript
const clearAll = () => {
  onChange([]); // ❌ 清空所有选项
};
```

#### 3. 修改全选逻辑
```typescript
const selectAll = () => {
  // 添加当前组的所有选项（去重）
  const optionValues = options.map(opt => opt.value);
  const newValue = Array.from(new Set([...value, ...optionValues]));
  onChange(newValue);
};
```

**改进前**:
```typescript
const selectAll = () => {
  onChange(options.map(opt => opt.value)); // ❌ 覆盖其他组的选项
};
```

#### 4. 修改全选判断
```typescript
const isAllSelected = options.length > 0 &&
  options.every(opt => value.includes(opt.value));
```

**改进前**:
```typescript
const isAllSelected = value.length === options.length; // ❌ 逻辑错误
```

#### 5. 修改按钮显示条件
```typescript
{currentGroupValues.length > 0 && (
  <Button onClick={clearAll}>清空</Button>
)}
```

**改进前**:
```typescript
{value.length > 0 && ( // ❌ 判断所有选中项
  <Button onClick={clearAll}>清空</Button>
)}
```

## 测试场景

### 场景1: 单独选择科技类
**操作**:
1. 打开"科技类"筛选框
2. 选择"人工智能"

**预期结果**:
- ✅ "科技类"显示"已选 1 项"，有"清空"按钮
- ✅ "财经类"显示 placeholder，无"清空"按钮
- ✅ "产业类"显示 placeholder，无"清空"按钮

### 场景2: 全选科技类
**操作**:
1. 打开"科技类"筛选框
2. 点击"全选"

**预期结果**:
- ✅ "科技类"显示"已选 5 项"，有"清空"按钮，无"全选"按钮
- ✅ "财经类"仍显示 placeholder，无"清空"按钮
- ✅ 其他筛选框不受影响

### 场景3: 跨组选择
**操作**:
1. 在"科技类"选择"人工智能"
2. 在"财经类"选择"资本市场"

**预期结果**:
- ✅ "科技类"显示"已选 1 项"，有"清空"按钮
- ✅ "财经类"显示"已选 1 项"，有"清空"按钮
- ✅ "产业类"显示 placeholder，无"清空"按钮

### 场景4: 清空单个组
**操作**:
1. "科技类"已选择"人工智能"和"芯片半导体"
2. "财经类"已选择"资本市场"
3. 在"科技类"点击"清空"

**预期结果**:
- ✅ "科技类"清空，显示 placeholder
- ✅ "财经类"仍保持"资本市场"选中状态
- ✅ 后端筛选条件只包含"资本市场"

## 技术细节

### 状态管理
所有分类筛选框共享 `selectedCategoryIds` 数组：
```typescript
selectedCategoryIds = ['cat_ai', 'cat_chip', 'cat_capital']
                       ↓         ↓         ↓
                    科技类    科技类    财经类
```

### 组件隔离
每个 `MultiSelect` 实例通过 `options` 参数知道自己负责哪些选项：
```typescript
// 科技类筛选框
<MultiSelect
  value={selectedCategoryIds}  // 全局状态
  options={[cat_ai, cat_chip, cat_internet, ...]}  // 本组选项
/>

// 财经类筛选框
<MultiSelect
  value={selectedCategoryIds}  // 同一个全局状态
  options={[cat_capital, cat_macro, cat_earnings]}  // 不同的本组选项
/>
```

### 正确的交互逻辑
1. **显示**: 只显示本组内被选中的项
2. **清空**: 只清空本组的选项，保留其他组
3. **全选**: 在现有选项基础上添加本组所有选项
4. **按钮**: 根据本组选中数量决定是否显示

## 验证结果

```bash
✅ TypeScript 类型检查通过
✅ 科技类全选不影响财经类
✅ 清空科技类不影响财经类的选中状态
✅ 各组的"全选"/"清空"按钮显示正确
✅ 跨组选择状态隔离正确
```

## 代码质量

### 改进前的问题
- ❌ 组件间状态泄漏
- ❌ 清空/全选操作相互干扰
- ❌ 按钮显示逻辑错误
- ❌ 用户体验混乱

### 改进后的优势
- ✅ 组件状态正确隔离
- ✅ 操作只影响当前组
- ✅ 按钮显示逻辑准确
- ✅ 用户体验符合预期
- ✅ 代码逻辑清晰易维护

## 总结

通过引入 `currentGroupValues` 来过滤当前组的选中项，并相应修改清空、全选、显示逻辑，成功解决了多个筛选框共享状态时的交互bug。现在每个筛选框都能正确地只显示和操作自己组内的选项，不会相互干扰。
