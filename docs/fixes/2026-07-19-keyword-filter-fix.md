# 关键词筛选功能修复报告

**日期**: 2026-07-19  
**问题**: 咨询流页面中的关键词筛选功能没有生效  
**状态**: ✅ 已修复

## 问题描述

用户在咨询流页面（`/events/feed`）中输入关键词进行搜索时，返回的结果并未被正确筛选，包含了大量不相关的新闻。

## 问题排查

### 1. 前端逻辑检查
- ✅ 页面正确捕获用户输入的关键词
- ✅ 点击搜索按钮正确触发 `handleSearch` 函数
- ✅ 关键词通过 URL 参数正确传递给 API：`/api/events/feed?keyword=xxx`

**前端代码**: `src/app/(dashboard)/events/feed/page.tsx`
```typescript
// 第118行：正确构建URL
if (keyword) url += `&keyword=${encodeURIComponent(keyword)}`
```

### 2. Next.js API 路由检查
- ✅ API 路由正确接收 `keyword` 参数
- ✅ 参数正确传递给 `eventService.getNewsFeed()`

**API 代码**: `src/app/api/events/feed/route.ts`
```typescript
// 第11行：接收参数
const keyword = searchParams.get('keyword') || undefined
// 第29行：传递给服务
const result = await eventService.getNewsFeed({ keyword, ... })
```

### 3. 事件服务逻辑检查
**问题1**: Prisma 查询结构不正确

**文件**: `src/lib/services/event.service.ts`

原始代码（第88-94行）：
```typescript
if (keyword) {
  where.OR = [
    { title: { contains: keyword } },
    { content: { contains: keyword } },
    { summary: { contains: keyword } },
  ]
}
```

**问题**: 当同时存在其他筛选条件（如 `categoryId`、`domainId`）时，直接设置 `where.OR` 会破坏 Prisma 查询结构，导致其他条件失效。

**修复**: 使用 `AND` 包装所有条件
```typescript
if (keyword) {
  const otherConditions = { ...where }
  where.AND = [
    otherConditions,
    {
      OR: [
        { title: { contains: keyword } },
        { content: { contains: keyword } },
        { summary: { contains: keyword } },
      ],
    },
  ]
  Object.keys(otherConditions).forEach(key => {
    if (key !== 'AND') delete where[key]
  })
}
```

### 4. Python 数据服务检查（主要问题）
**问题2**: Python 服务未定义 `keyword` 参数

**文件**: `data-service/routers/news.py`

原始代码（第167-172行）：
```python
@router.get("/feed")
async def get_news_feed(
    category: Optional[str] = Query(default=None, description="新闻分类"),
    limit: int = Query(default=20, ge=1, le=100, description="返回数量"),
    offset: int = Query(default=0, ge=0, description="偏移量"),
):
```

**问题**: 缺少 `keyword` 参数定义，导致前端传递的关键词被忽略。

**修复**: 
1. 添加 `keyword` 参数定义
2. 实现关键词筛选逻辑

```python
@router.get("/feed")
async def get_news_feed(
    category: Optional[str] = Query(default=None, description="新闻分类"),
    keyword: Optional[str] = Query(default=None, description="关键词搜索"),
    limit: int = Query(default=20, ge=1, le=100, description="返回数量"),
    offset: int = Query(default=0, ge=0, description="偏移量"),
):
    # ... 获取新闻列表 ...
    
    # 分类筛选
    if category:
        news_list = [n for n in news_list if n.get("category") == category]
    
    # 关键词筛选（新增）
    if keyword:
        keyword_lower = keyword.lower()
        news_list = [
            n for n in news_list
            if keyword_lower in n.get("title", "").lower()
            or keyword_lower in n.get("content", "").lower()
            or keyword_lower in n.get("summary", "").lower()
        ]
```

## 根本原因

系统采用了**降级策略**：
1. 优先从本地数据库（SQLite）读取新闻
2. 如果数据库为空，降级到 Python 数据服务

在测试环境中，数据库为空，所以实际使用的是 Python 数据服务。而 Python 服务的 `/api/news/feed` 端点缺少关键词筛选功能，导致前端的关键词参数被忽略。

## 修复内容

### 1. 修复 Prisma 查询逻辑
**文件**: `src/lib/services/event.service.ts`  
**修改**: 使用 `AND` 正确组合关键词搜索与其他筛选条件

### 2. 修复 Python 数据服务
**文件**: `data-service/routers/news.py`  
**修改**: 
- 添加 `keyword` 参数定义
- 实现关键词筛选逻辑（支持标题、内容、摘要搜索）
- 支持中英文关键词（通过 `lower()` 实现大小写不敏感搜索）

## 测试验证

### 测试结果
✅ 所有测试通过（6/6）

### 测试用例
1. **英文关键词**: AI, WAIC
2. **中文关键词**: 手机, 数据中心, 芯片
3. **组合筛选**: 关键词 + 情感筛选

### 验证方式
```bash
# 英文关键词
curl "http://localhost:3000/api/events/feed?keyword=AI&limit=10"
# 返回: 1条结果，标题包含"AI"

# 中文关键词
curl "http://localhost:3000/api/events/feed?keyword=手机&limit=10"
# 返回: 2条结果，标题都包含"手机"

# 组合筛选
curl "http://localhost:3000/api/events/feed?keyword=AI&sentiment=bullish&limit=10"
# 返回: 正确应用了关键词和情感双重筛选
```

## 注意事项

1. **URL 编码**: 中文关键词在 URL 中需要正确编码，前端已通过 `encodeURIComponent()` 处理
2. **大小写**: 关键词搜索不区分大小写（通过 `lower()` 实现）
3. **搜索范围**: 关键词会在标题、内容、摘要三个字段中搜索
4. **服务重启**: Python 数据服务修改后需要重启才能生效

## 相关文件

- `src/app/(dashboard)/events/feed/page.tsx` - 前端页面
- `src/app/api/events/feed/route.ts` - Next.js API 路由
- `src/lib/services/event.service.ts` - 事件服务（数据库查询）
- `data-service/routers/news.py` - Python 数据服务路由

## 后续优化建议

1. **性能优化**: 考虑在数据库层面使用全文搜索索引（如 SQLite FTS5）
2. **高级搜索**: 支持多关键词、精确匹配、正则表达式等
3. **搜索高亮**: 在前端显示搜索结果时高亮关键词
4. **搜索历史**: 保存用户的搜索历史，提供快捷输入
