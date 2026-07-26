# 开发规范指南

## UI/UX 规范

### 1. 语言显示规范 ⭐️ 重要

**所有用户界面必须使用中文显示**

#### 适用范围
- 页面标题和副标题
- 按钮文本
- 表单标签和占位符
- 下拉菜单选项（包括 Select 组件的 trigger 显示值）
- 状态标签（Badge）
- 错误和成功提示
- 面包屑导航
- 表格列标题
- 加载和空状态提示

#### 实施要点

**✅ 正确示例**

```tsx
// 下拉菜单 - SelectValue 必须显示中文
<Select value={platformFilter} onValueChange={setPlatformFilter}>
  <SelectTrigger>
    <SelectValue>{getPlatformLabel(platformFilter)}</SelectValue>
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">全部平台</SelectItem>
    <SelectItem value="weibo">微博</SelectItem>
  </SelectContent>
</Select>

// 辅助函数提供中文映射
const getPlatformLabel = (platform: string) => {
  const labels: Record<string, string> = {
    all: '全部平台',
    weibo: '微博',
    // ...
  };
  return labels[platform] || platform;
};

// 面包屑导航
const nameMap: Record<string, string> = {
  dashboard: '仪表盘',
  influencers: '大V监控',
  // ...
};
```

**❌ 错误示例**

```tsx
// 错误：SelectValue 为空，显示英文原始值
<SelectTrigger>
  <SelectValue />
</SelectTrigger>

// 错误：使用英文标题
<h1>Influencers</h1>

// 错误：使用英文按钮
<Button>Add New</Button>
```

#### 特殊情况

以下情况可以保留英文：
- 代码变量名和函数名
- API 端点路径
- 数据库字段名
- 技术日志输出
- 开发者工具和调试信息

### 2. 面包屑导航

所有新增页面路由必须在 `src/components/layout/header.tsx` 的 `getBreadcrumbName` 函数中添加中文映射：

```tsx
function getBreadcrumbName(segment: string, dynamicNames: Record<string, string> = {}): string {
  const nameMap: Record<string, string> = {
    // 添加新页面的中文名称
    'new-page': '新页面名称',
  };
  // ...
}
```

#### 动态路由处理

对于包含 ID 的动态路由（如 `/events/influencers/[id]`），应该：

1. **在 Header 组件中添加 API 调用逻辑**，根据 ID 获取实际名称
2. **使用 `dynamicNames` state** 存储获取到的名称
3. **在 `getBreadcrumbName` 函数中优先检查 `dynamicNames`**
4. **对于无法识别的 ID，显示通用名称**（如"详情"）而不是原始 ID

```tsx
// Header 组件中
useEffect(() => {
  const segments = pathname.split('/').filter(Boolean)
  
  // 检查是否是详情页路由
  if (segments.length === 3 && segments[0] === 'events' && segments[1] === 'influencers') {
    const influencerId = segments[2]
    if (influencerId.startsWith('inf_')) {
      fetch(`/api/influencers/${influencerId}`)
        .then(res => res.json())
        .then(data => {
          if (data?.name) {
            setDynamicNames(prev => ({ ...prev, [influencerId]: data.name }))
          }
        })
    }
  }
}, [pathname])

// getBreadcrumbName 函数中
function getBreadcrumbName(segment: string, dynamicNames: Record<string, string> = {}): string {
  // 优先检查动态名称
  if (dynamicNames[segment]) {
    return dynamicNames[segment]
  }
  
  // 如果是ID格式，返回通用名称
  if (segment.startsWith('inf_') || /^\d+$/.test(segment)) {
    return '详情'
  }
  
  // 其他逻辑...
}
```

**效果对比：**
- ❌ 错误：`首页 / 事件驱动 / 大V监控 / inf_1785044475094355`
- ✅ 正确：`首页 / 事件驱动 / 大V监控 / 详情` （加载前）
- ✅ 最佳：`首页 / 事件驱动 / 大V监控 / 张三` （加载后）

### 3. 下拉选择组件规范

使用 shadcn/ui Select 组件时：

1. **必须**为 `SelectValue` 提供显示内容
2. **必须**创建辅助函数处理值到中文的映射
3. 下拉列表项使用中文
4. value 使用英文代码（方便程序处理）

```tsx
// 标准模式
<Select value={filter} onValueChange={setFilter}>
  <SelectTrigger>
    <SelectValue>{getFilterLabel(filter)}</SelectValue>
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="option1">选项一</SelectItem>
    <SelectItem value="option2">选项二</SelectItem>
  </SelectContent>
</Select>
```

## 代码审查清单

提交 PR 前请确认：

- [ ] 所有用户可见文本使用中文
- [ ] Select 组件的 SelectValue 有中文显示
- [ ] 新增路由已添加面包屑中文映射
- [ ] 按钮、标题、提示文本都是中文
- [ ] Badge 和状态文本使用中文

## 国际化准备

虽然当前版本仅支持中文，但代码应该为未来的国际化做准备：

- 将文本映射集中管理（如 `getPlatformLabel` 函数）
- 避免硬编码文本直接嵌入 JSX
- 使用语义化的英文代码作为数据值

## 更新历史

- 2026-07-26: 初始版本，明确中文优先规范
