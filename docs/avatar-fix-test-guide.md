# 头像显示修复测试指南

## 修复内容
已将编辑大V和添加大V页面的头像显示从 `<img>` 标签改为 Next.js `Image` 组件，以解决B站等平台的防盗链问题。

## 已完成的操作
✅ 修改了 `src/app/(dashboard)/events/influencers/new/page.tsx`（添加大V页面）
✅ 修改了 `src/app/(dashboard)/events/influencers/[id]/edit/page.tsx`（编辑大V页面）
✅ 清除了 `.next` 缓存
✅ 重启了开发服务器（运行在 http://localhost:3000）
✅ TypeScript 类型检查通过

## 测试步骤

### 1. 测试添加大V页面的头像显示
1. 访问：http://localhost:3000/events/influencers/new
2. 选择平台：**bilibili**
3. 输入账号ID：`1958881925`（你之前添加过的飞飞飞飞洁莉）
4. 点击"验证账号"
5. **检查点**：验证成功后，在"平台信息"卡片中应该能看到：
   - 圆形头像正常显示（不是裂图）
   - 显示名称：飞飞飞飞洁莉
   - 显示"✓ 已认证"标记
   - 显示简介信息

### 2. 测试编辑大V页面的头像显示
1. 访问：http://localhost:3000/events/influencers
2. 找到任意一个已添加的大V（建议使用B站账号）
3. 点击进入详情页
4. 点击"编辑"按钮
5. **检查点**：在编辑页面的"平台信息"卡片中应该能看到：
   - 圆形头像正常显示（不是裂图）
   - 显示大V名称、平台、账号ID等信息

### 3. 对比监控列表页面（参考标准）
1. 访问：http://localhost:3000/events/influencers
2. **检查点**：列表中的头像应该都正常显示
3. 比较添加/编辑页面的头像显示效果，应该与列表页面一致

## 常见问题排查

### 如果头像仍然显示错误：

#### 1. 浏览器缓存问题
- 按 `Cmd+Shift+R`（Mac）或 `Ctrl+Shift+R`（Windows）强制刷新页面
- 或者打开浏览器开发者工具 > Network 面板 > 勾选 "Disable cache"

#### 2. 检查浏览器控制台错误
- 打开开发者工具（F12）
- 查看 Console 面板是否有错误信息
- 查看 Network 面板，筛选图片请求，检查头像 URL 的请求状态

#### 3. 检查图片 URL
- 在开发者工具的 Network 面板中找到头像图片请求
- 正确的情况应该是：
  - 请求通过 Next.js 的 `/_next/image?url=...` 代理
  - 返回状态码 200
  - 能够正常显示图片

#### 4. 检查 Next.js 图片配置
运行以下命令检查配置：
```bash
grep -A 20 "images:" next.config.ts
```

应该看到 B站的域名配置：
```typescript
images: {
  remotePatterns: [
    {
      protocol: 'https',
      hostname: 'i0.hdslb.com',
      pathname: '/bfs/**',
    },
    // ... 其他配置
  ],
}
```

## 技术细节

### Image 组件的关键属性
```tsx
<div className="relative w-16 h-16 rounded-full overflow-hidden flex-shrink-0">
  <Image
    src={avatarUrl}
    alt={name}
    fill                    // 填充父容器
    className="object-cover" // 保持比例并覆盖
    unoptimized             // 跳过优化（因为已配置域名白名单）
  />
</div>
```

### 为什么 Image 组件能解决问题？
1. **服务端代理**：图片请求通过 Next.js 服务器代理，避免了客户端直接请求
2. **Referer 处理**：Next.js 处理了 Referer 头，绕过防盗链检查
3. **统一处理**：与监控列表页面使用相同的实现方式

## 预期结果
- ✅ 添加大V页面：验证账号后能看到头像预览
- ✅ 编辑大V页面：能看到大V的头像
- ✅ 三个页面的头像显示效果一致
- ✅ 支持 B站、微博等主流平台

## 如果问题依然存在
1. 检查是否有其他 Next.js 进程在运行：`lsof -ti:3000`
2. 完全清理并重启：
   ```bash
   pkill -f "next dev"
   rm -rf .next
   npm run dev
   ```
3. 检查修改是否正确应用：
   ```bash
   grep -n "Image" src/app/\(dashboard\)/events/influencers/new/page.tsx
   grep -n "unoptimized" src/app/\(dashboard\)/events/influencers/new/page.tsx
   ```

测试日期：2026-07-28
