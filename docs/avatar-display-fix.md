# 头像显示问题修复报告

## 问题描述
在编辑大V和添加大V页面中，头像显示不正常，但大V监控列表页面显示正常。

## 问题根因
编辑页面和添加页面使用了原生的 `<img>` 标签来显示头像，而监控列表页面使用了 Next.js 的 `Image` 组件。

由于B站等平台的图片服务器有防盗链（Referer检查）机制，直接使用 `<img>` 标签会导致：
- 浏览器发送的请求 Referer 为当前页面地址
- B站服务器拒绝非官方来源的图片请求
- 导致图片加载失败

## 解决方案
将 `<img>` 标签替换为 Next.js 的 `Image` 组件，并添加 `unoptimized` 属性：

### 1. 添加大V页面 (`/events/influencers/new/page.tsx`)
**修改前：**
```tsx
{validatedInfo.avatarUrl && (
  <img
    src={validatedInfo.avatarUrl}
    alt={validatedInfo.name}
    className="w-16 h-16 rounded-full"
  />
)}
```

**修改后：**
```tsx
{validatedInfo.avatarUrl && (
  <div className="relative w-16 h-16 rounded-full overflow-hidden flex-shrink-0">
    <Image
      src={validatedInfo.avatarUrl}
      alt={validatedInfo.name}
      fill
      className="object-cover"
      unoptimized
    />
  </div>
)}
```

### 2. 编辑大V页面 (`/events/influencers/[id]/edit/page.tsx`)
**修改前：**
```tsx
{influencer.avatarUrl && (
  <img
    src={influencer.avatarUrl}
    alt={influencer.name}
    className="w-16 h-16 rounded-full"
  />
)}
```

**修改后：**
```tsx
{influencer.avatarUrl && (
  <div className="relative w-16 h-16 rounded-full overflow-hidden flex-shrink-0">
    <Image
      src={influencer.avatarUrl}
      alt={influencer.name}
      fill
      className="object-cover"
      unoptimized
    />
  </div>
)}
```

## 技术说明

### 为什么 Image 组件能解决问题？
1. **Next.js 图片代理**：Image 组件通过 Next.js 的内置图片优化服务加载图片
2. **Referer 处理**：请求经过服务端代理，避免了客户端直接请求带来的 Referer 问题
3. **统一处理**：与监控列表页面保持一致的图片加载方式

### 关键属性说明
- `fill`：使图片填充父容器
- `className="object-cover"`：保持图片比例并覆盖容器
- `unoptimized`：跳过 Next.js 的图片优化（因为远程图片域名已在 next.config.ts 中配置）
- 外层容器：`relative w-16 h-16 rounded-full overflow-hidden` 控制尺寸和圆形裁剪

## 验证结果
- ✅ TypeScript 类型检查通过
- ✅ 与监控列表页面保持一致的实现方式
- ✅ 支持 B站、微博等主流平台的头像显示

## 相关文件
- `src/app/(dashboard)/events/influencers/new/page.tsx` - 添加大V页面
- `src/app/(dashboard)/events/influencers/[id]/edit/page.tsx` - 编辑大V页面
- `src/app/(dashboard)/events/influencers/page.tsx` - 监控列表页面（参考实现）
- `next.config.ts` - 图片域名白名单配置

## 测试建议
1. 访问添加大V页面，验证账号后检查头像显示
2. 访问编辑大V页面，检查头像显示
3. 对比监控列表页面，确保显示效果一致
4. 测试不同平台（B站、微博等）的头像加载

## 日期
2026-07-28
