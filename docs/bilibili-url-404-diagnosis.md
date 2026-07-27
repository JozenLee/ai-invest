# B站动态链接404问题诊断

## 问题描述
大V详情页面的"查看原文"链接点击后跳转到 `https://www.bilibili.com/404`

## 数据链路检查

### 1. 数据库层 ✅ 正常
```sql
-- 检查存储的URL
SELECT id, originalUrl FROM InfluencerPost LIMIT 5;
```

结果：URL格式正确
- `https://www.bilibili.com/opus/116991100782676`
- `https://www.bilibili.com/opus/1229360364767936516`

### 2. FastAPI层 ✅ 正常
```bash
curl http://localhost:8000/api/influencers/inf_xxx/posts
```

返回的`url`字段正确，与数据库一致。

### 3. Next.js API层 ✅ 正常
```bash
curl http://localhost:3000/api/influencers/inf_xxx/posts
```

返回的`url`字段正确，直接代理FastAPI响应。

### 4. 前端渲染层 ✅ 正常
```tsx
// src/app/(dashboard)/events/influencers/[id]/page.tsx:439-448
{post.url && (
  <a
    href={post.url}
    target="_blank"
    rel="noopener noreferrer"
    className="text-primary hover:underline flex items-center gap-1"
  >
    查看原文 <ExternalLink className="h-3 w-3" />
  </a>
)}
```

代码直接使用 `post.url`，没有任何修改。

## 可能的原因

### 原因1：B站动态已被删除
B站的动态可能已经被UP主删除，导致链接失效跳转到404页面。

**验证方法：**
1. 手动访问几个不同的链接
2. 如果都是404，说明不是删除问题
3. 如果部分404，说明是内容已删除

### 原因2：B站opus链接格式问题
B站的动态链接有多种格式：
- 新版：`https://www.bilibili.com/opus/{dynamic_id}`
- 旧版：`https://t.bilibili.com/{dynamic_id}`

**解决方案：** 尝试使用旧版格式

### 原因3：需要登录态
某些B站动态可能需要登录后才能查看。

**验证方法：** 在已登录B站的浏览器中打开链接

### 原因4：dynamic_id不正确
Provider在解析动态时获取的`id_str`可能不是正确的动态ID。

## 问题定位

请执行以下步骤来定位问题：

### 步骤1：手动测试链接
在浏览器中直接打开以下链接：
- https://www.bilibili.com/opus/116991100782676
- https://www.bilibili.com/opus/1229360364767936516

**如果跳转到404：**
说明问题出在B站的opus链接格式或dynamic_id不正确。

### 步骤2：尝试旧版链接格式
尝试访问：
- https://t.bilibili.com/116991100782676
- https://t.bilibili.com/1229360364767936516

**如果旧版链接可以访问：**
需要修改 `bilibili_provider.py` 中的URL构建逻辑。

### 步骤3：检查原始API返回的数据
运行以下脚本查看B站API返回的原始数据结构：

```python
# 查看B站API返回的dynamic结构
import aiohttp
import asyncio

async def check():
    # 需要先获取Cookie
    pass
```

### 步骤4：对比UP主空间页面
访问UP主空间：
- https://space.bilibili.com/72844725/dynamic

手动点击任意动态，查看URL格式。

## 推荐的修复方案

基于最常见的情况，问题很可能是B站的opus链接需要特定格式或者动态ID不完整。

### 方案A：支持多种URL格式
修改 `bilibili_provider.py:_parse_dynamic` 方法，尝试多种URL格式：

```python
# 构建多个可能的URL格式
urls_to_try = [
    f"https://www.bilibili.com/opus/{dynamic_id}",
    f"https://t.bilibili.com/{dynamic_id}",
    f"https://www.bilibili.com/h5/dynamic/detail/{dynamic_id}"
]

# 存储所有可能的URL，前端可以依次尝试
```

### 方案B：使用t.bilibili.com格式
将URL构建改为旧版格式：

```python
# bilibili_provider.py 第298行
url = f"https://t.bilibili.com/{dynamic_id}"
```

### 方案C：使用B站Web动态详情页格式
```python
url = f"https://www.bilibili.com/h5/dynamic/detail/{dynamic_id}"
```

## 下一步行动

1. 手动测试数据库中的URL是否可以访问
2. 根据测试结果选择对应的修复方案
3. 更新URL构建逻辑
4. 重新采集数据以更新URL
