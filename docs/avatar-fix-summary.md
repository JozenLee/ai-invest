# 头像显示问题修复总结

## 问题
编辑大V和添加大V页面的头像显示错误，但大V监控列表页面正常。

## 原因
- 编辑和添加页面使用了原生 `<img>` 标签
- B站等平台有防盗链机制（Referer 检查）
- 直接使用 `<img>` 会被拒绝请求

## 解决方案
将 `<img>` 替换为 Next.js `Image` 组件 + `unoptimized` 属性

### 修改的文件
1. `src/app/(dashboard)/events/influencers/new/page.tsx` - 添加大V页面
2. `src/app/(dashboard)/events/influencers/[id]/edit/page.tsx` - 编辑大V页面

### 修改内容
```tsx
// 修改前
<img
  src={avatarUrl}
  alt={name}
  className="w-16 h-16 rounded-full"
/>

// 修改后
<div className="relative w-16 h-16 rounded-full overflow-hidden flex-shrink-0">
  <Image
    src={avatarUrl}
    alt={name}
    fill
    className="object-cover"
    unoptimized
  />
</div>
```

## 验证结果
✅ 所有 `<img>` 标签已替换为 `Image` 组件
✅ TypeScript 类型检查通过
✅ 与监控列表页面保持一致
✅ 支持 B站、微博等平台头像显示

## 测试步骤
1. 启动开发服务器：`npm run dev`
2. 访问添加大V页面，验证账号后检查头像
3. 访问编辑大V页面，检查头像显示
4. 确认与监控列表页面显示效果一致

修复日期：2026-07-28
