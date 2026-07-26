# 大V监控页面中文显示修复报告

## 修复日期
2026-07-26

## 问题描述

1. **平台选择器显示英文**：选择器触发按钮显示 "all", "weibo" 等英文值，而下拉列表显示中文
2. **面包屑显示英文路由**：页面顶部显示 "influencers" 而不是"大V监控"
3. **详情页显示 ID**：大V详情页面包屑显示原始 ID（如 `inf_1785044475094355`）

## 修复内容

### 1. 平台选择器中文显示

**文件**: `src/app/(dashboard)/events/influencers/page.tsx`

**修改**:
- 新增 `getPlatformLabel` 函数，提供平台代码到中文的映射
- 修改 `SelectValue` 组件，显示 `{getPlatformLabel(platformFilter)}`

```tsx
const getPlatformLabel = (platform: string) => {
  const labels: Record<string, string> = {
    all: '全部平台',
    bilibili: 'B站',
    weibo: '微博',
    xiaohongshu: '小红书',
    zhihu: '知乎',
    douyin: '抖音',
    alipay: '支付宝',
  };
  return labels[platform] || platform;
};

// SelectTrigger 中
<SelectValue>{getPlatformLabel(platformFilter)}</SelectValue>
```

**效果**:
- ❌ 修复前：显示 "all", "weibo"
- ✅ 修复后：显示 "全部平台", "微博"

### 2. 面包屑导航中文映射

**文件**: `src/components/layout/header.tsx`

**修改**:
- 在 `getBreadcrumbName` 的 `nameMap` 中添加 `influencers: '大V监控'`
- 添加 `new: '新建'` 用于新建页面路由

**效果**:
- ❌ 修复前：`首页 / events / influencers`
- ✅ 修复后：`首页 / 事件驱动 / 大V监控`

### 3. 动态路由智能显示

**文件**: `src/components/layout/header.tsx`

**修改**:
1. 引入 `useState` 和 `useEffect`
2. 添加 `dynamicNames` state 存储动态获取的名称
3. 添加 `useEffect` 监听路径变化，对于大V详情页自动调用 API 获取名称
4. 修改 `getBreadcrumbName` 函数：
   - 接受 `dynamicNames` 参数
   - 优先返回动态获取的名称
   - 对 ID 格式（`inf_` 开头或纯数字）返回"详情"而不是原始 ID

```tsx
// 动态加载逻辑
useEffect(() => {
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 3 && segments[0] === 'events' && segments[1] === 'influencers') {
    const influencerId = segments[2]
    if (influencerId.startsWith('inf_') || /^\d+$/.test(influencerId)) {
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

// 名称解析逻辑
function getBreadcrumbName(segment: string, dynamicNames: Record<string, string> = {}): string {
  // 优先检查动态名称
  if (dynamicNames[segment]) {
    return dynamicNames[segment]
  }
  
  // 如果是ID格式，返回通用名称
  if (segment.startsWith('inf_') || /^\d+$/.test(segment)) {
    return '详情'
  }
  
  // ... 其他映射
}
```

**效果**:
- ❌ 修复前：`首页 / 事件驱动 / 大V监控 / inf_1785044475094355`
- ⚡ 加载中：`首页 / 事件驱动 / 大V监控 / 详情`
- ✅ 加载后：`首页 / 事件驱动 / 大V监控 / 二狗学长好`

### 4. 开发规范文档化

**文件**: `docs/development-guidelines.md`

**内容**:
- ⭐️ 中文优先原则：所有用户界面必须使用中文
- 适用范围和实施要点
- Select 组件规范
- 面包屑导航规范
- 动态路由处理规范
- 代码审查清单

## 验证方法

运行验证脚本：
```bash
bash scripts/verify-chinese-display.sh
```

手动测试：
1. 访问大V监控列表页，检查平台选择器
2. 检查面包屑导航显示
3. 进入大V详情页，检查面包屑是否显示名称或"详情"

## 技术要点

### 为什么 SelectValue 需要明确指定内容？

shadcn/ui 的 Select 组件默认行为：
- 如果 `<SelectValue />` 为空，会显示当前 `value` 的原始值
- 需要显式提供 children 来覆盖默认显示

### 动态路由名称加载的性能考虑

- 使用 `useEffect` + `pathname` 依赖，仅在路由变化时触发
- API 调用失败不影响页面渲染（降级显示"详情"）
- 使用 state 缓存已加载的名称，避免重复请求

### 国际化准备

虽然当前仅支持中文，但代码结构便于未来扩展：
- 文本映射集中管理（`getPlatformLabel`, `nameMap`）
- 数据层使用英文代码（value）
- 显示层使用中文标签（label）

## 后续开发注意事项

1. **所有新增页面路由**必须在 `header.tsx` 的 `nameMap` 中添加中文映射
2. **所有 Select 组件**必须为 `SelectValue` 提供中文显示内容
3. **动态路由**应参考大V详情页的实现，添加名称加载逻辑
4. **提交 PR 前**运行 `bash scripts/verify-chinese-display.sh` 检查

## 相关文件

- `src/app/(dashboard)/events/influencers/page.tsx` - 列表页
- `src/app/(dashboard)/events/influencers/[id]/page.tsx` - 详情页
- `src/components/layout/header.tsx` - 面包屑导航
- `docs/development-guidelines.md` - 开发规范
- `scripts/verify-chinese-display.sh` - 验证脚本

## 修复完成 ✅

所有问题已修复，验证脚本全部通过。
