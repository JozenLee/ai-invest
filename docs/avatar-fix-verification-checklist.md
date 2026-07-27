# 大V监控头像显示 - 手动UI验证清单

## 修复内容总结

### 问题诊断
1. **列表页问题**: 显示"B站"文字而非头像
2. **详情页问题**: 显示裂图状态

### 根本原因
1. **Next.js配置缺失**: 未配置B站图片域名白名单
2. **FastAPI响应缺失**: list_influencers接口未返回avatarUrl字段

### 已实施的修复

#### 1. Next.js配置修复 (next.config.ts)
```typescript
images: {
  remotePatterns: [
    {
      protocol: 'https',
      hostname: 'i0.hdslb.com',
      pathname: '/bfs/**',
    },
    {
      protocol: 'https',
      hostname: 'i1.hdslb.com',
      pathname: '/bfs/**',
    },
    {
      protocol: 'https',
      hostname: 'i2.hdslb.com',
      pathname: '/bfs/**',
    },
  ],
}
```

#### 2. FastAPI路由修复 (data-service/routers/influencers.py)
在list_influencers函数中添加了avatarUrl和tags字段的返回：
- 第286-311行：添加了`avatarUrl=row_dict.get('avatarUrl')`
- 同时添加了tags字段的解析和返回

#### 3. 服务重启
- Next.js开发服务器已重启
- FastAPI服务已重启

---

## 手动验证步骤

### 前置检查 ✓
所有后端检查已通过：
- [✓] Next.js服务运行中 (端口3000)
- [✓] FastAPI服务运行中 (端口8000)
- [✓] 数据库中有头像URL
- [✓] FastAPI API返回头像URL
- [✓] Next.js API返回头像URL
- [✓] 头像URL可访问 (HTTP 200)
- [✓] B站图片域名已配置
- [✓] 详情页API返回头像URL

### UI验证步骤

#### 步骤1: 验证列表页
1. 在浏览器中打开: http://localhost:3000/events/influencers
2. 等待页面加载完成
3. 找到"二狗学长好"这个大V
4. **验证点**:
   - [ ] 应该看到圆形头像图片（不是"B站"两个字的彩色圆圈）
   - [ ] 头像应该清晰显示（不是裂图或placeholder图标）
   - [ ] 头像尺寸约为48x48像素

**预期效果**: 
```
┌─────────────────────────────────┐
│  [🖼️圆形头像]  二狗学长好       │
│                B站 ✓            │
│  账号: 72844725                 │
│  领域: 未分类                   │
│  最后抓取: X小时前              │
│  状态: 成功                     │
└─────────────────────────────────┘
```

#### 步骤2: 验证详情页
1. 点击"二狗学长好"卡片进入详情页
2. 或直接访问: http://localhost:3000/events/influencers/inf_1785044475094355
3. 等待页面加载完成
4. **验证点**:
   - [ ] 页面顶部左侧应该显示较大的圆形头像（约64x64像素）
   - [ ] 头像应该清晰显示，不是裂图
   - [ ] 头像右侧显示"二狗学长好"标题
   - [ ] 没有显示Users图标（👥）作为占位符

**预期效果**:
```
← 返回    [🖼️大圆形头像]  二狗学长好
                        B站 | 72844725
```

### 常见问题排查

#### 问题A: 列表页仍显示"B站"文字
**可能原因**:
- Next.js未重启或缓存未清除
- API仍返回null的avatarUrl

**排查步骤**:
```bash
# 1. 检查API返回
curl -s "http://localhost:3000/api/influencers?page=1&pageSize=20" | jq '.items[] | select(.name=="二狗学长好") | .avatarUrl'

# 2. 清除浏览器缓存并刷新页面
# 或使用硬刷新: Cmd+Shift+R (Mac) / Ctrl+Shift+R (Win)

# 3. 检查浏览器控制台是否有错误
```

#### 问题B: 详情页显示裂图
**可能原因**:
- Next.js图片域名配置未生效
- 浏览器阻止了图片加载

**排查步骤**:
1. 打开浏览器开发者工具 (F12)
2. 切换到Network标签
3. 刷新页面
4. 查找头像URL的请求（应该是i0.hdslb.com域名）
5. 检查HTTP状态码（应该是200）
6. 如果是403/404，可能是URL错误或需要特殊请求头

#### 问题C: 头像显示但很慢
**可能原因**:
- B站CDN网络延迟
- Next.js图片优化处理时间

**解决方案**:
- 已使用`unoptimized`属性跳过优化
- 可以考虑添加本地图片代理

---

## 验证完成标准

✅ **验证通过条件**:
1. 列表页"二狗学长好"显示实际头像（不是文字占位符）
2. 详情页头像正常显示（不是裂图或图标占位符）
3. 浏览器控制台无相关错误信息

✅ **如果验证通过**:
- 问题已修复
- 可以提交代码

❌ **如果验证失败**:
- 请截图并记录浏览器控制台的错误信息
- 运行诊断脚本: `bash scripts/diagnose-avatar-issue.sh`
- 报告具体失败的验证点

---

## 测试用例扩展

### 其他大V测试
"天津股侠" (微博) 目前没有头像URL:
- 应该显示橙色圆圈，内有"微博"两字
- 这是正常的fallback行为

### 新增大V测试
添加新的B站大V时：
1. 应自动获取头像URL
2. 列表页和详情页都应正确显示

---

## 相关文件

### 已修改文件
1. `next.config.ts` - 添加图片域名配置
2. `data-service/routers/influencers.py` - 修复list_influencers响应

### 验证脚本
1. `scripts/diagnose-avatar-issue.sh` - 完整诊断工具
2. `scripts/test-avatar-display.sh` - 快速测试
3. `scripts/verify-avatar-ui.sh` - 后端验证
4. `scripts/verify-ui-rendering.js` - UI自动化验证（需puppeteer）

### 相关组件
1. `src/app/(dashboard)/events/influencers/page.tsx` - 列表页
2. `src/app/(dashboard)/events/influencers/[id]/page.tsx` - 详情页
3. `src/app/api/influencers/route.ts` - Next.js API代理
4. `src/app/api/influencers/[id]/route.ts` - 详情页API

---

**验证完成后请确认**: 所有验证点都已通过 ✓
