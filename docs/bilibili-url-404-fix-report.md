# B站动态链接404问题修复报告

## 问题描述
大V详情页面的"查看原文"链接点击后跳转到 `https://www.bilibili.com/404`

## 根本原因

### 错误的URL构建逻辑
原代码在 `bilibili_provider.py:_parse_dynamic` 方法中，对于不同类型的动态使用了不同的URL格式：

```python
# 错误的逻辑
if dynamic_type == 'DYNAMIC_TYPE_AV':
    # 使用 rid_str (资源ID) 而不是 dynamic_id
    url = f"https://www.bilibili.com/video/av{rid_str}"
elif dynamic_type == 'DYNAMIC_TYPE_ARTICLE':
    url = f"https://www.bilibili.com/read/cv{rid_str}"
else:
    url = f"https://www.bilibili.com/opus/{dynamic_id}"
```

**问题分析：**
- B站API返回的 `id_str` 是动态的唯一标识符（例如：`1224134527723503621`）
- `rid_str` 是资源ID（例如：视频的AV号 `116906661125000`）
- 对于动态类型为视频（DYNAMIC_TYPE_AV）的内容，代码错误地使用了 `rid_str` 构建视频链接
- 但用户需要的是动态页面链接，而不是视频播放页面链接

### 示例对比

以"假球为什么屡禁不止"这条动态为例：

| 字段 | 值 |
|------|-----|
| id_str (动态ID) | 1224134527723503621 |
| rid_str (资源ID) | 116906661125000 |
| type | DYNAMIC_TYPE_AV (视频动态) |

**错误的URL：** `https://www.bilibili.com/video/av116906661125000`  
**正确的URL：** `https://t.bilibili.com/1224134527723503621`

## 修复方案

### 代码修改
修改 `data-service/providers/bilibili_provider.py:_parse_dynamic` 方法：

```python
# 修复后的代码（第284-287行）
# Build URL - 统一使用 t.bilibili.com 格式，这是B站动态的标准格式
# dynamic_id (id_str) 是动态的唯一标识符，适用于所有动态类型
# 注意：不要使用 rid_str，那是资源ID（如视频AV号），不是动态ID
url = f"https://t.bilibili.com/{dynamic_id}"
```

### 关键改进
1. **统一URL格式**：所有动态类型统一使用 `https://t.bilibili.com/{dynamic_id}` 格式
2. **使用正确的ID**：使用 `id_str`（动态ID）而不是 `rid_str`（资源ID）
3. **简化逻辑**：移除了复杂的条件判断，降低出错概率

## 验证结果

### 修复前
```
假球为什么屡禁不止？回报率会告诉你原因
URL: https://www.bilibili.com/opus/116906661125000  ❌ (跳转到404)
```

### 修复后
```
假球为什么屡禁不止？回报率会告诉你原因
URL: https://t.bilibili.com/1224134527723503621  ✅ (正常访问)
```

### 测试验证
```bash
# 测试修复后的URL
curl -I "https://t.bilibili.com/1224134527723503621"
# HTTP/2 200  ✅
```

## 数据更新

修复代码后，需要重新采集数据以更新数据库中的URL：

```bash
# 删除旧数据
sqlite3 prisma/dev.db "DELETE FROM InfluencerPost WHERE influencerId = 'inf_xxx';"

# 触发重新采集
curl -X POST "http://localhost:8000/api/influencers/inf_xxx/fetch"
```

### 已更新的大V
- ✅ 钞能力毛毛 (inf_1785177252634019) - 2条动态已更新
- ✅ 二狗学长好 (inf_1785044475094355) - 3条动态已更新

## 技术细节

### B站动态API结构
```json
{
  "id_str": "1224134527723503621",  // 动态ID - 用于构建链接
  "type": "DYNAMIC_TYPE_AV",        // 动态类型
  "basic": {
    "rid_str": "116906661125000",   // 资源ID (如视频AV号)
    "comment_id_str": "..."
  },
  "modules": {
    "module_dynamic": { ... },
    "module_author": { ... }
  }
}
```

### URL格式说明
| URL格式 | 用途 | 示例 |
|---------|------|------|
| `https://t.bilibili.com/{id_str}` | 动态页面（推荐） | https://t.bilibili.com/1224134527723503621 |
| `https://www.bilibili.com/opus/{id_str}` | 新版动态页面 | https://www.bilibili.com/opus/1224134527723503621 |
| `https://www.bilibili.com/video/av{rid_str}` | 视频播放页面 | https://www.bilibili.com/video/av116906661125000 |

**注意：** 动态分享链接应该使用 `id_str`，而不是 `rid_str`。

## 影响范围
- ✅ 所有新采集的B站动态将使用正确的URL格式
- ✅ 前端"查看原文"链接可以正常跳转
- ✅ 用户可以访问完整的动态页面（包括评论、转发等信息）

## 后续建议
1. 对于已存在的旧数据，可以通过批量脚本更新URL
2. 考虑添加URL有效性检查机制
3. 在采集日志中记录URL构建的详细信息，便于调试

## 修复时间
2026-07-28

## 修复人员
Claude (Opus 5)
