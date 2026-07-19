# 事件资讯筛选组件优化

## 概述
优化了事件资讯页面（`/events/feed`）的筛选功能，改善用户体验和筛选灵活性。

## 优化内容

### 1. 领域筛选显示中文名称 ✅
**问题**: 领域筛选框显示英文代码而非中文名称
**解决方案**: 修改 `SelectValue` 组件，动态显示选中领域的中文名称

**修改文件**: `src/app/(dashboard)/events/feed/page.tsx:369-381`

```tsx
<Select value={selectedDomainId || 'all'} onValueChange={(value) => setSelectedDomainId(value === 'all' ? null : value)}>
  <SelectTrigger className="w-[160px]">
    <SelectValue>
      {selectedDomainId ? domains.find(d => d.id === selectedDomainId)?.name : `${EVENTS_TEXT.common.all}领域`}
    </SelectValue>
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">{EVENTS_TEXT.common.all}领域</SelectItem>
    {domains.map((domain) => (
      <SelectItem key={domain.id} value={domain.id}>
        {domain.name}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

### 2. 层级化多选分类筛选 ✅
**问题**: 
- 分类筛选是互斥单选
- 没有体现分类的层级关系（科技 > 技术突破/产品发布）
- 无法同时筛选多个分类

**解决方案**: 
- 使用现有的 `CategoryTreeSelect` 组件
- 支持多选（并集/OR逻辑）
- 展示层级树形结构
- 显示每个分类的文章数量

**修改文件**: 
1. `src/app/(dashboard)/events/feed/page.tsx`
   - 导入 `CategoryTreeSelect` 组件
   - 将 `selectedCategoryId` 改为 `selectedCategoryIds: string[]`
   - 更新相关逻辑支持多选

2. `src/app/api/events/feed/route.ts`
   - 新增 `categoryIds` 参数支持（逗号分隔的ID列表）
   - 实现OR查询逻辑：自动包含所有选中分类及其子分类
   - 保持向后兼容，仍支持单个 `categoryId` 参数

**UI效果**:
```tsx
<CategoryTreeSelect
  value={selectedCategoryIds}
  onChange={setSelectedCategoryIds}
  placeholder="选择分类（可多选）"
/>
```

**API使用示例**:
```bash
# 单选分类（兼容旧逻辑）
GET /api/events/feed?categoryId=cat_ai

# 多选分类（新功能）
GET /api/events/feed?categoryIds=cat_ai,cat_macro,cat_product
```

### 3. 筛选条件显示优化
- 多个选中的分类以独立的 Badge 形式显示
- 每个 Badge 都可以单独点击删除
- 清晰展示当前的筛选状态

## 技术实现细节

### 前端状态管理
```tsx
// 旧版（单选）
const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)

// 新版（多选）
const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])
```

### API多选查询逻辑
```typescript
// 解析逗号分隔的分类ID
const selectedIds = categoryIdsParam.split(',').filter(Boolean)
const categoryIds = []

// 对每个选中的分类，获取其自身和所有子分类
for (const id of selectedIds) {
  const cat = await prisma.newsCategory.findUnique({
    where: { id },
    include: { children: true },
  })
  if (cat) {
    categoryIds.push(id)
    categoryIds.push(...cat.children.map((c) => c.id))
  }
}

// 去重（避免重复查询）
categoryIds = Array.from(new Set(categoryIds))
```

### 并集查询（OR逻辑）
数据库查询使用 Prisma 的 `in` 操作符实现OR逻辑：
```typescript
where: {
  categoryId: categoryIds ? { in: categoryIds } : undefined,
  // 其他筛选条件...
}
```

## 测试验证

### API测试
```bash
# 测试多分类筛选
curl "http://localhost:3000/api/events/feed?categoryIds=cat_ai,cat_macro&limit=5"

# 响应示例
{
  "success": true,
  "count": 3,
  "categories": ["人工智能", "宏观经济"]
}
```

### 类型检查
```bash
npm run typecheck
# ✓ 通过，无类型错误
```

## 用户体验改进

1. **直观的中文显示**: 所有筛选项都显示中文，避免混淆
2. **灵活的多选**: 可以同时查看多个分类的内容
3. **层级化组织**: 分类按父子关系组织，更易理解
4. **视觉反馈**: 树形结构、文章数量、选中状态一目了然
5. **便捷操作**: 可以快速清除单个或所有筛选条件

## 向后兼容性

- API 保持向后兼容，旧的 `categoryId` 参数仍可使用
- 前端组件可选升级，不影响其他页面
- 数据库查询逻辑封装在服务层，便于后续优化

## 相关文件清单

### 修改的文件
1. `src/app/(dashboard)/events/feed/page.tsx` - 主要页面组件
2. `src/app/api/events/feed/route.ts` - API路由处理

### 复用的组件
1. `src/components/events/CategoryTreeSelect.tsx` - 树形多选组件
2. `src/app/api/events/categories/tree/route.ts` - 分类树API

## 后续优化建议

1. **性能优化**: 考虑对分类树数据进行缓存
2. **高级筛选**: 支持更复杂的筛选组合（AND/NOT逻辑）
3. **保存筛选**: 允许用户保存常用的筛选条件
4. **URL同步**: 将筛选条件同步到URL，支持分享和书签

## 完成时间
2026-07-20
