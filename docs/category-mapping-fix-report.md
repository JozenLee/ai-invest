# categoryId 映射修复报告

**修复时间**: 2026-07-31 02:05  
**修复人员**: AI Assistant  
**问题**: NewsArticle.categoryId 字段全部为 NULL，导致前端分类筛选功能失效

---

## 🎯 修复内容

### 1. 问题分析

**原因**：
- Python 数据服务采集新闻后，通过 Claude API 进行 AI 分类
- AI 返回的是分类代码（category code），如 "ai", "chip", "policy"
- 存储到数据库时，只保存了 `category` 字段（code），没有映射到 `categoryId`（NewsCategory.id）
- 前端分类筛选功能依赖 `categoryId` 字段，因此完全失效

**影响**：
- ❌ 用户无法按分类筛选新闻（"只看 AI 新闻"、"只看政策新闻"等）
- ❌ 分类统计显示全部为 0
- ❌ 多分类联合筛选功能失效

### 2. 修复方案

#### 方案 A: 修改 API 批量保存逻辑 ✅

**位置**: `src/app/api/events/batch-save/route.ts`

**修改内容**:
```typescript
/**
 * 将 AI 分类结果（category code）映射到 NewsCategory ID
 */
async function mapCategoryCodeToId(categoryCode: string | null | undefined): Promise<string | null> {
  if (!categoryCode) return null
  
  const category = await prisma.newsCategory.findUnique({
    where: { code: categoryCode },
    select: { id: true }
  })
  return category?.id || null
}

// 在保存文章时自动映射
let categoryId = article.categoryId
if (!categoryId && article.category) {
  categoryId = await mapCategoryCodeToId(article.category)
}
```

**优点**:
- ✅ 自动映射，未来采集的文章都会正确设置 categoryId
- ✅ 无需修改 Python 服务
- ✅ 代码简洁，易于维护

#### 方案 B: 修复历史数据 ✅

**工具**: `scripts/fix-category-mapping.ts`

**执行结果**:
```
📊 修复前状态:
  总文章数: 244
  已有categoryId: 22
  缺失categoryId: 222

✅ 修复后状态:
  总文章数: 244
  已有categoryId: 222
  缺失categoryId: 22
  映射成功率: 91.0%
```

---

## 📊 修复结果

### 数据库统计

| 指标 | 修复前 | 修复后 |
|------|--------|--------|
| 总文章数 | 244 | 244 |
| 有 categoryId | 22 (9%) | 222 (91%) |
| 无 categoryId | 222 (91%) | 22 (9%) |

### 各分类文章数量（Top 15）

| 分类 | 代码 | 文章数 |
|------|------|--------|
| 社会事件 | event | 46 |
| 人工智能 | ai | 26 |
| 政策法规 | policy | 25 |
| 地缘政治 | geopolitics | 22 |
| 全球市场 | global_market | 22 |
| 资本市场 | capital | 20 |
| 财报业绩 | earnings | 18 |
| 芯片半导体 | chip | 12 |
| 监管制裁 | regulation | 9 |
| 产品发布 | product | 7 |
| 供应链 | supply | 4 |
| 消费生活 | consume | 3 |
| 政府动态 | government | 3 |
| 技术突破 | breakthrough | 2 |
| 互联网 | internet | 1 |

### 未映射的分类（22篇）

这些文章的 category 字段中的代码在 NewsCategory 表中找不到对应记录，可能原因：
1. AI 返回了不在预定义列表中的分类代码
2. 分类代码拼写错误
3. 新增分类尚未在数据库中创建

**建议**：定期检查未映射的分类，必要时在 NewsCategory 表中补充新分类。

---

## 🧪 功能测试

### 测试 1: 单分类筛选

**请求**:
```bash
GET /api/events/feed?categoryIds=cat_ai&limit=3
```

**结果**: ✅ 成功
- 返回 26 篇 AI 分类文章
- 包含正确的 categoryId 和 categoryName

**示例文章**:
- "本届世界人工智能大会现场虽展示具身智能产品数量激增..."
- "真正的难题，不是模型不够强，而是员工是否愿意把经验交给系统"
- "多家公司在联名信中表示，采用开放方式开发AI软件..."

### 测试 2: 多分类筛选

**请求**:
```bash
GET /api/events/feed?categoryIds=cat_chip,cat_policy&limit=3
```

**结果**: ✅ 成功
- 返回 37 篇文章（芯片 12 篇 + 政策 25 篇）
- 正确筛选出两个分类的文章

**示例文章**:
- "十年最强鹰派分歧？美联储继续按兵不动..." (policy)
- "中共中央政治局召开会议，决定召开二十届五中全会..." (policy)
- "沃什：2%通胀目标不动摇，保持独立性，关注AI变革..." (policy + ai)

### 测试 3: 分类统计

**请求**:
```bash
GET /api/events/categories
```

**结果**: ✅ 成功
- 所有分类的 articleCount 正确显示
- 不再全部显示为 0

---

## ✅ 验证清单

- [x] 修改 batch-save API，添加自动映射逻辑
- [x] 运行修复脚本，更新历史数据
- [x] 验证数据库：222/244 篇文章有 categoryId
- [x] 测试单分类筛选功能
- [x] 测试多分类筛选功能
- [x] 测试分类统计显示
- [x] 验证 API 返回数据包含 categoryId 和 categoryName

---

## 🔄 未来采集流程

### 修复后的数据流

```
1. Python 服务采集新闻
   ↓
2. Claude API 分类（返回 category code）
   ↓
3. POST /api/events/batch-save
   ↓
4. mapCategoryCodeToId() 自动映射
   ↓
5. 保存文章（包含 category 和 categoryId）
   ↓
6. 前端可以通过 categoryId 筛选 ✅
```

### 注意事项

1. **新增分类**: 如果 AI 返回新的分类代码，需要先在 `NewsCategory` 表中创建对应记录
2. **监控未映射**: 定期检查 `categoryId IS NULL` 的文章，分析原因
3. **分类标准化**: 保持 AI prompt 中的分类列表与数据库中的 `NewsCategory.code` 一致

---

## 📝 相关文件

- API 修改: `src/app/api/events/batch-save/route.ts`
- 修复脚本: `scripts/fix-category-mapping.ts`
- 数据库 Schema: `prisma/schema.prisma` (NewsArticle, NewsCategory)
- 前端页面: `src/app/(dashboard)/events/feed/page.tsx`

---

## 🎯 结论

**修复状态**: ✅ 完成

**修复效果**:
- ✅ 91% 的文章成功映射 categoryId
- ✅ 前端分类筛选功能恢复正常
- ✅ 分类统计正确显示
- ✅ 未来采集的文章自动映射

**遗留问题**:
- ⚠️ 22 篇文章（9%）未映射，需要分析原因
- 📋 建议定期检查和补充新分类

**总体评价**: 修复成功，核心功能恢复正常！
