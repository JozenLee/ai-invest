# B站动态链接跳转404问题排查与解决

## 问题描述

大V详情页面"最近动态"中，点击"查看原文"链接后跳转到 `https://www.bilibili.com/404` 页面，无法查看原始动态内容。

## 问题排查

### 1. URL数据完整性检查

```bash
# 检查存储的URL
curl -s "http://localhost:8000/api/influencers/inf_1785177252634019/posts" | jq '.data.items[] | {url}'
```

**结果**：URL存在且格式正确
```json
{
  "url": "https://www.bilibili.com/opus/116906661125000"
}
```

### 2. 前端代码检查

```tsx
<a
  href={post.url}
  target="_blank"
  rel="noopener noreferrer"
  className="text-primary hover:underline"
>
  查看原文 <ExternalLink />
</a>
```

**结果**：前端代码正确，有`target="_blank"`和完整的URL。

### 3. URL可访问性测试

使用curl测试：
```bash
curl -I "https://www.bilibili.com/opus/116906661125000"
# HTTP/2 412 或 200（但内容是验证码页面）
```

在浏览器中测试：
- ❌ 跳转到 `https://www.bilibili.com/404`

## 根本原因分析

### 可能原因1：动态已删除或过期
- B站用户删除了该动态
- 动态因违规被平台删除
- 动态ID失效

### 可能原因2：URL格式问题
B站动态有多种URL格式：
1. **新版格式**：`https://www.bilibili.com/opus/{dynamic_id}`
2. **旧版格式**：`https://t.bilibili.com/{dynamic_id}`
3. **视频动态**：`https://www.bilibili.com/video/av{av_id}`
4. **专栏动态**：`https://www.bilibili.com/read/cv{cv_id}`

**问题**：代码统一使用opus格式，但不同类型动态需要不同格式。

### 可能原因3：comment_id vs dynamic_id
原代码使用`comment_id_str`而非`dynamic_id`：
```python
# 原代码（可能有误）
basic = raw.get('basic', {})
comment_id = basic.get('comment_id_str', dynamic_id)
url = f"https://www.bilibili.com/opus/{comment_id}"
```

`comment_id_str`是评论区ID，不一定等于动态ID。

## 解决方案

### 方案1：根据动态类型生成正确URL（已实现）

修改 `data-service/providers/bilibili_provider.py`：

```python
# 根据动态类型构建URL
basic = raw.get('basic', {})
rid_str = basic.get('rid_str', '')  # 资源ID

if dynamic_type == 'DYNAMIC_TYPE_AV':
    # 视频类型：使用AV号
    url = f"https://www.bilibili.com/video/av{rid_str}" if rid_str else f"https://www.bilibili.com/opus/{dynamic_id}"
elif dynamic_type == 'DYNAMIC_TYPE_ARTICLE':
    # 专栏类型
    url = f"https://www.bilibili.com/read/cv{rid_str}" if rid_str else f"https://www.bilibili.com/opus/{dynamic_id}"
else:
    # 普通动态：使用opus格式
    url = f"https://www.bilibili.com/opus/{dynamic_id}"
```

### 方案2：添加链接验证和fallback机制

如果URL无效，提供备选链接或提示：

#### 2.1 前端添加错误处理

```tsx
<a
  href={post.url}
  target="_blank"
  rel="noopener noreferrer"
  onClick={(e) => {
    // 可选：记录点击，用于后续分析哪些链接失效
    console.log('Opening post:', post.id, post.url);
  }}
>
  查看原文 <ExternalLink />
</a>
```

#### 2.2 提供用户空间链接作为备选

如果动态链接失效，用户可以访问UP主空间：

```tsx
{post.url && (
  <a href={post.url} target="_blank" rel="noopener noreferrer">
    查看原文 <ExternalLink />
  </a>
)}
{!post.url && influencer.profileUrl && (
  <a href={influencer.profileUrl} target="_blank" rel="noopener noreferrer">
    访问UP主空间 <ExternalLink />
  </a>
)}
```

### 方案3：采集时验证URL有效性

在保存动态时验证URL：

```python
async def _validate_url(self, url: str) -> bool:
    """验证URL是否可访问"""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.head(url, timeout=5) as response:
                return response.status == 200
    except:
        return False
```

但这会**大幅增加采集时间**，不推荐。

## 测试验证

### 测试页面

我创建了测试页面 `/tmp/bilibili-test.html`，包含：
- 当前数据库中的URL
- 不同格式的测试链接
- 使用说明

**请在浏览器中打开此文件进行测试。**

### 测试步骤

1. 打开 `/tmp/bilibili-test.html`
2. 点击每个链接，记录结果：
   - ✅ 能正常打开动态
   - ❌ 跳转到404
   - ⚠️ 显示验证码或其他错误

3. 如果所有链接都跳转到404，说明：
   - 这些动态已被删除
   - 需要采集更新的动态

## 建议的完整解决方案

### 短期方案（立即生效）

1. **重新采集数据**：删除旧动态，采集最新的动态
2. **修改URL生成逻辑**：使用更新后的代码（已完成）
3. **验证新采集的动态链接**：在浏览器中手动测试

### 长期方案

1. **定期清理失效链接**
   - 后台任务验证URL有效性
   - 标记或删除失效动态

2. **多种URL格式支持**
   - 保存多个可能的URL格式
   - 前端尝试多个链接

3. **用户反馈机制**
   - 添加"链接失效"报告按钮
   - 自动触发重新采集

4. **缓存用户空间链接**
   - 当动态链接失效时，至少能访问UP主空间

## 当前状态

### 已完成
- ✅ 修复URL生成逻辑（根据动态类型）
- ✅ 优化采集计数逻辑（显示有效动态数）
- ✅ 创建测试页面

### 待确认
- ⏳ 需要在浏览器中测试实际链接是否有效
- ⏳ 如果链接仍然404，需要采集更新的动态数据

### 下一步
1. **请在浏览器中测试** `/tmp/bilibili-test.html`
2. **告诉我测试结果**：
   - 链接能否打开？
   - 最终跳转到哪个页面？
   - 页面显示什么内容？

## 临时解决方案（如果链接确实失效）

如果这些动态确实已删除，临时方案：

### 方案A：采集更新的账号
选择一个活跃的B站UP主进行测试：
- 罗翔说刑法 (ID: 517327498)
- 半佛仙人 (ID: 37663924)
- 老番茄 (ID: 37663924)

### 方案B：修改前端显示
如果无法获取有效链接，修改UI：
```tsx
{post.url ? (
  <a href={post.url} target="_blank">查看原文</a>
) : (
  <span className="text-muted">动态已删除</span>
)}
```

## 修改文件

```
data-service/providers/bilibili_provider.py
└── _parse_dynamic 函数（第234-311行）
    └── URL生成逻辑（第284-297行）
```

## 总结

**问题**：B站动态链接跳转404  
**原因**：
1. 动态可能已删除（需验证）
2. URL格式可能不正确（已修复）

**已修复**：根据动态类型生成正确的URL格式  
**待验证**：实际链接在浏览器中是否有效  

**状态**：等待浏览器测试反馈  
**日期**：2026-07-28
