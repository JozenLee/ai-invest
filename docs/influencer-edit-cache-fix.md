# 编辑大V后详情页数据不刷新问题修复

## 问题描述

编辑大V属性后，页面会自动跳转回大V详情页面，但详情页面**显示的仍是旧数据**，需要手动刷新页面才能看到更新后的内容。

**复现步骤**：
1. 访问大V详情页面（例如：`/events/influencers/inf_xxx`）
2. 点击"编辑"按钮进入编辑页面
3. 修改标签、采集频率等属性
4. 点击"保存"
5. 自动跳转回详情页面
6. **问题**：页面显示的仍是修改前的数据

## 根本原因

**React Query 缓存未失效**

编辑页面的流程：
```typescript
updateMutation.mutate(payload)
  ↓
onSuccess: () => {
  toast.success('更新成功');
  router.push(`/events/influencers/${influencerId}`);  // 直接跳转
}
```

问题：
1. 更新成功后直接跳转到详情页面
2. **没有使 React Query 的缓存失效**
3. 详情页面从缓存中读取旧数据
4. 用户看到的是修改前的数据

**数据流分析**：
```
编辑提交 → API更新成功 → 跳转详情页
                              ↓
                   React Query缓存（旧数据）
                              ↓
                      详情页显示旧数据 ❌
```

## 修复方案

### 方案：在更新成功后使缓存失效

使用 `queryClient.invalidateQueries` 使相关查询的缓存失效，强制重新获取最新数据。

### 实现步骤

#### 1. 导入 useQueryClient

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
```

#### 2. 获取 queryClient 实例

```typescript
export default function EditInfluencerPage() {
  const queryClient = useQueryClient();
  const influencerId = params.id as string;
  // ...
}
```

#### 3. 在 onSuccess 中使缓存失效

```typescript
const updateMutation = useMutation({
  mutationFn: async (data: any) => {
    const response = await fetch(`/api/influencers/${influencerId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || error.error || '更新失败');
    }
    return response.json();
  },
  onSuccess: () => {
    // ✅ 使缓存失效，强制重新获取数据
    queryClient.invalidateQueries({ queryKey: ['influencer', influencerId] });
    queryClient.invalidateQueries({ queryKey: ['influencers'] });

    toast.success('更新成功');
    router.push(`/events/influencers/${influencerId}`);
  },
  onError: (error: Error) => {
    toast.error('更新失败', {
      description: error.message,
    });
  },
});
```

### 为什么要使两个查询失效？

1. **`['influencer', influencerId]`** - 详情页的单个大V查询
   - 确保详情页显示最新数据
   
2. **`['influencers']`** - 列表页的所有大V查询
   - 确保返回列表页时也是最新数据
   - 避免列表页显示旧的标签、状态等

## 修复后的数据流

```
编辑提交 → API更新成功 → 使缓存失效
                              ↓
                   React Query缓存（已清除）
                              ↓
                        跳转详情页
                              ↓
                   自动重新获取数据（最新）
                              ↓
                      详情页显示新数据 ✅
```

## 测试验证

### 测试场景1：修改标签

1. 详情页显示：`标签: [投资] [金融]`
2. 编辑页修改为：`科技, AI, 投资`
3. 保存后跳转回详情页
4. **验证**：详情页立即显示 `标签: [科技] [AI] [投资]` ✅

### 测试场景2：修改采集频率

1. 详情页显示：`轮询周期: 30 分钟`
2. 编辑页修改为：`60 分钟`
3. 保存后跳转
4. **验证**：详情页立即显示 `轮询周期: 60 分钟` ✅

### 测试场景3：修改调度策略

1. 详情页显示：`调度策略: 轮询模式`
2. 编辑页修改为：`定时模式 (09:00, 18:00)`
3. 保存后跳转
4. **验证**：详情页立即显示定时模式和执行时间 ✅

### 测试场景4：返回列表页

1. 编辑并保存大V
2. 跳转到详情页（显示新数据）
3. 点击"返回"到列表页
4. **验证**：列表页也显示更新后的数据 ✅

## React Query 缓存策略

### 当前查询配置

```typescript
// 详情页
const { data: influencerData } = useQuery({
  queryKey: ['influencer', influencerId],
  queryFn: async () => {
    const response = await fetch(`/api/influencers/${influencerId}`);
    return response.json();
  },
});

// 列表页
const { data } = useQuery({
  queryKey: ['influencers', platformFilter, page],
  queryFn: async () => {
    const params = new URLSearchParams({
      page: page.toString(),
      pageSize: pageSize.toString(),
    });
    if (platformFilter !== 'all') {
      params.set('platform', platformFilter);
    }
    const response = await fetch(`/api/influencers?${params}`);
    return response.json();
  },
});
```

### invalidateQueries 行为

- **精确匹配**：`['influencer', 'inf_123']` 只失效这个特定的查询
- **前缀匹配**：`['influencers']` 失效所有以此开头的查询
  - `['influencers', 'all', 1]`
  - `['influencers', 'bilibili', 1]`
  - 等等

### 缓存失效后的行为

1. **自动重新获取**：如果组件当前正在使用该查询，React Query 会自动在后台重新获取数据
2. **无缝更新**：新数据到达后，UI 自动更新，无需手动刷新
3. **保持加载状态**：重新获取期间可以显示加载指示器（通过 `isRefetching`）

## 其他相关操作

### 删除大V后也需要使缓存失效

当前 `handleDelete` 代码：
```typescript
const handleDelete = async () => {
  if (!confirm('确定要删除此大V监控吗？')) return;

  try {
    const response = await fetch(`/api/influencers/${influencerId}`, {
      method: 'DELETE',
    });

    if (response.ok) {
      alert('已删除');
      router.push('/events/influencers');
    }
  }
}
```

**建议优化**：
```typescript
import { useQueryClient } from '@tanstack/react-query';

const queryClient = useQueryClient();

const handleDelete = async () => {
  if (!confirm('确定要删除此大V监控吗？')) return;

  try {
    const response = await fetch(`/api/influencers/${influencerId}`, {
      method: 'DELETE',
    });

    if (response.ok) {
      // 使列表页缓存失效
      queryClient.invalidateQueries({ queryKey: ['influencers'] });
      
      toast.success('已删除');
      router.push('/events/influencers');
    }
  } catch (error) {
    toast.error('删除失败');
  }
}
```

### 手动采集后刷新帖子列表

```typescript
const handleFetch = async () => {
  try {
    const response = await fetch(`/api/influencers/${influencerId}/fetch`, {
      method: 'POST',
    });
    const result = await response.json();
    
    if (result.success) {
      // 使帖子列表缓存失效
      queryClient.invalidateQueries({ queryKey: ['influencer-posts', influencerId] });
      
      toast.success(`采集成功！新增 ${result.postsNew} 条动态`);
    }
  } catch (error) {
    toast.error('采集失败');
  }
}
```

## 修改文件

```
src/app/(dashboard)/events/influencers/[id]/edit/page.tsx
├── 导入 useQueryClient（第3行）
├── 获取 queryClient 实例（第39行）
└── onSuccess 中使缓存失效（第90-91行）
```

## 用户体验提升

### 修复前
- ❌ 编辑后看不到新数据
- ❌ 需要手动刷新页面（F5）
- ❌ 用户困惑：保存成功了吗？

### 修复后
- ✅ 编辑后立即显示新数据
- ✅ 自动刷新，无需手动操作
- ✅ Toast提示 + 数据更新 = 明确的成功反馈

## 性能考虑

### 缓存失效的开销

- **网络请求**：跳转后会发起1-2个GET请求获取最新数据
- **影响范围**：仅影响当前编辑的大V，其他缓存不受影响
- **用户感知**：通常 < 200ms，用户几乎无感知

### 优化建议（可选）

使用 `setQueryData` 直接更新缓存：
```typescript
onSuccess: (updatedData) => {
  // 直接更新缓存，无需重新请求
  queryClient.setQueryData(['influencer', influencerId], {
    success: true,
    data: updatedData
  });
  
  // 仍然失效列表页缓存
  queryClient.invalidateQueries({ queryKey: ['influencers'] });
  
  router.push(`/events/influencers/${influencerId}`);
}
```

**优势**：
- 无需额外网络请求
- 页面切换更快

**劣势**：
- 需要确保 `updatedData` 格式与查询返回格式完全一致
- 增加代码复杂度

## 总结

✅ **问题**：编辑后详情页显示旧数据  
✅ **原因**：React Query 缓存未失效  
✅ **修复**：在更新成功后调用 `queryClient.invalidateQueries`  
✅ **影响**：详情页和列表页都能显示最新数据  
✅ **体验**：用户无需手动刷新，自动看到更新结果  

**状态**：已完成并测试通过  
**日期**：2026-07-28
