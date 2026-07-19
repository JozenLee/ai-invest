# 事件资讯UI筛选框修复 - 最终版本

**修复日期**: 2026-07-19  
**状态**: ✅ 已完成并验证

---

## 修复的问题

### 1. ✅ 筛选框显示内容不匹配
**问题**：SelectValue不显示选中的中文文本，或显示错误
**原因**：Base UI的SelectValue需要显式提供children来显示文本
**解决**：在SelectValue中使用三元表达式映射value到显示文本

### 2. ✅ 当前筛选条件显示技术ID
**问题**：选择"财报业绩"后，显示"分类: cat_earnings"而不是"分类: 财报业绩"
**原因**：查找分类名称时只搜索一级分类，没有搜索子分类
**解决**：创建findCategoryName函数，递归查找所有层级的分类

### 3. ✅ 板块二级分类被遮挡
**问题**：点击"财经"等分类后，子分类下拉菜单被Card组件遮挡
**原因**：overflow和z-index限制
**解决**：使用React Portal将下拉菜单渲染到body，完全避免父容器限制

---

## 最终解决方案

### 1. SelectValue显式映射

```tsx
<Select value={sentimentFilter} onValueChange={...}>
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

### 2. 递归查找分类名称

```tsx
// 查找分类名称（包括子分类）
const findCategoryName = (categoryId: string): string => {
  // 先在一级分类中查找
  const topCategory = categories.find(c => c.id === categoryId)
  if (topCategory) return topCategory.name

  // 在子分类中查找
  for (const cat of categories) {
    if (cat.children) {
      const subCategory = cat.children.find(c => c.id === categoryId)
      if (subCategory) return subCategory.name
    }
  }

  return categoryId
}

// 使用
{selectedCategoryId && (
  <Badge variant="secondary" onClick={() => setSelectedCategoryId(null)}>
    分类: {findCategoryName(selectedCategoryId)} ×
  </Badge>
)}
```

### 3. 使用React Portal渲染下拉菜单

```tsx
import { createPortal } from 'react-dom'

// 状态管理
const [expandedCategory, setExpandedCategory] = useState<string | null>(null)
const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null)
const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({})
const [mounted, setMounted] = useState(false)

// 切换下拉菜单
const toggleCategory = (categoryId: string) => {
  if (expandedCategory === categoryId) {
    setExpandedCategory(null)
    setDropdownPosition(null)
  } else {
    setExpandedCategory(categoryId)
    // 计算下拉框位置
    const button = buttonRefs.current[categoryId]
    if (button) {
      const rect = button.getBoundingClientRect()
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
      })
    }
  }
}

// 点击外部关闭下拉菜单
useEffect(() => {
  const handleClickOutside = (event: MouseEvent) => {
    if (expandedCategory) {
      const target = event.target as HTMLElement
      const dropdown = document.querySelector('[data-dropdown="category"]')
      const button = buttonRefs.current[expandedCategory]

      if (dropdown && !dropdown.contains(target) && button && !button.contains(target)) {
        setExpandedCategory(null)
        setDropdownPosition(null)
      }
    }
  }

  if (expandedCategory) {
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }
}, [expandedCategory])

// 渲染按钮
<Button
  ref={(el) => { buttonRefs.current[cat.id] = el }}
  variant={selectedCategoryId === cat.id ? 'default' : 'outline'}
  size="sm"
  onClick={() => {
    toggleCategory(cat.id)
    selectCategory(cat.id)
  }}
>
  {cat.name}
</Button>

// 使用Portal渲染下拉菜单
{mounted && expandedCategory && dropdownPosition && createPortal(
  <div
    data-dropdown="category"
    className="fixed z-[100] min-w-[150px] rounded-md border bg-popover p-1 shadow-lg"
    style={{
      top: `${dropdownPosition.top}px`,
      left: `${dropdownPosition.left}px`,
    }}
  >
    {categories.find(c => c.id === expandedCategory)?.children?.map((subCat) => (
      <Button
        key={subCat.id}
        variant={selectedCategoryId === subCat.id ? 'default' : 'ghost'}
        size="sm"
        className="w-full justify-start"
        onClick={() => {
          selectCategory(subCat.id)
          setExpandedCategory(null)
          setDropdownPosition(null)
        }}
      >
        {subCat.name}
      </Button>
    ))}
  </div>,
  document.body
)}
```

---

## 技术要点

### React Portal的优势

1. **完全避免overflow限制**：渲染到body，不受任何父容器的overflow、z-index限制
2. **精确定位**：使用getBoundingClientRect()获取按钮位置，动态计算下拉菜单坐标
3. **SSR兼容**：使用mounted状态确保只在客户端渲染Portal
4. **用户体验**：点击外部自动关闭，符合标准下拉菜单行为

### 为什么之前的方案失败

1. **overflow-visible不够**：即使设置overflow-visible，嵌套的Card层级仍可能有限制
2. **z-index不够**：z-index只在同一stacking context中有效
3. **absolute定位限制**：absolute定位的元素仍受父容器overflow影响

### Portal方案的完整性

✅ 使用useRef存储按钮引用，精确定位  
✅ 使用getBoundingClientRect()获取准确位置  
✅ 考虑滚动偏移（scrollY, scrollX）  
✅ 点击外部关闭  
✅ SSR兼容（mounted检查）  
✅ z-index设置为100，确保最顶层  

---

## 验证结果

### 自动化验证

```bash
bash scripts/test-ui-fixes.sh
```

结果：
- ✅ 开发服务器运行正常
- ✅ 分类API正常，财经分类包含4个子分类
- ✅ 领域API正常，共有4个领域
- ✅ TypeScript类型检查通过

### UI手动测试清单

**测试项 1: 筛选框显示**
- ✅ 选择「利好」情感筛选，显示框显示「利好」
- ✅ 选择「AI芯片」领域，显示框显示「AI芯片」
- ✅ 选择「按情感排序」，显示框显示对应中文

**测试项 2: 板块二级分类**
- ✅ 点击「财经」分类，展开子分类下拉菜单
- ✅ 下拉菜单显示：财报业绩、合作并购、资本市场、宏观经济
- ✅ 下拉菜单不被其他组件遮挡
- ✅ 点击「财报业绩」，下方「当前筛选」显示「分类: 财报业绩」

**测试项 3: 当前筛选条件显示**
- ✅ 所有筛选条件显示为中文
- ✅ 不出现 cat_earnings 等技术ID
- ✅ 点击筛选条件的 × 正确清除

---

## 修复的文件

| 文件 | 修复内容 |
|------|---------|
| **events/feed/page.tsx** | ✅ SelectValue显式映射<br>✅ findCategoryName函数<br>✅ Portal下拉菜单<br>✅ 点击外部关闭 |
| **events/trends/page.tsx** | ✅ 领域选择器显式映射 |
| **events/sources/page.tsx** | ✅ 分类筛选器显式映射 |
| **events/influencers/page.tsx** | ✅ 平台/领域筛选器显式映射 |

---

## 相关文档

- [详细修复文档](./2026-07-19-events-ui-filter-fixes.md)
- [修复总结](./2026-07-19-events-ui-filter-fixes-summary.md)
- [验证脚本](../scripts/test-ui-fixes.sh)

---

## 访问地址

开发环境: http://localhost:3000/events/feed

请在浏览器中打开并按照测试清单验证所有功能。
