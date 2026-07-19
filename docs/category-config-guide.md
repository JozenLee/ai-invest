# 分类配置封装 - 使用指南

## 📋 概述

我们创建了统一的分类配置层，确保前端UI、后端映射、AI分类保持一致。

### 核心文件

```
src/config/categories.ts              # TypeScript配置（前端）
data-service/config/categories.py     # Python配置（后端）
```

---

## 🎯 设计原则

### 单一数据源（Single Source of Truth）
所有分类相关的配置都在这两个文件中定义，任何修改都从这里开始。

### 前后端同步
两个配置文件包含完全相同的分类定义，通过约定保持同步。

### 自动生成
- AI Prompt自动生成
- UI筛选器自动生成
- 关键词映射自动生成

---

## 📦 配置结构

### 分类定义

每个分类包含：
```typescript
{
  code: 'ai',                  // 分类代码（AI输出）
  id: 'cat_ai',               // 数据库ID
  name: '人工智能',            // 显示名称
  description: '大模型...',    // 描述（用于AI Prompt）
  keywords: ['AI', '大模型'],  // 关键词（用于匹配）
  group: 'tech',              // 所属分组
  sortOrder: 1                // 排序
}
```

### 分组定义

```typescript
{
  key: 'tech',
  name: '科技类',
  description: '科技、产品、创新相关',
  sortOrder: 1
}
```

---

## 🔧 使用方法

### 1. 前端使用（TypeScript）

#### 生成UI筛选器
```typescript
import { generateUIFilterGroups } from '@/config/categories'

// 自动生成UI筛选配置
const filterGroups = generateUIFilterGroups()

// 渲染
filterGroups.map(group => (
  <MultiSelect
    key={group.label}
    options={group.categories}
    placeholder={group.label}
  />
))
```

#### 获取分类信息
```typescript
import { getCategoryByCode, getCategoryById } from '@/config/categories'

// 通过代码查找
const category = getCategoryByCode('ai')
console.log(category?.name) // '人工智能'

// 通过ID查找
const category2 = getCategoryById('cat_ai')
console.log(category2?.code) // 'ai'
```

#### 获取关键词映射
```typescript
import { getCategoryKeywordMap } from '@/config/categories'

const keywordMap = getCategoryKeywordMap()
// { ai: ['AI', '大模型', ...], chip: ['芯片', ...], ... }
```

---

### 2. 后端使用（Python）

#### AI分类Prompt
```python
from config.categories import AI_CATEGORY_PROMPT

# 直接使用生成的prompt
prompt = f"""分析以下新闻：{news_content}

{AI_CATEGORY_PROMPT}

只返回分类代码。"""
```

#### 验证分类代码
```python
from config.categories import VALID_CATEGORY_CODES

ai_output = "ai"
if ai_output in VALID_CATEGORY_CODES:
    print("有效分类")
```

#### 关键词匹配
```python
from config.categories import CATEGORY_KEYWORD_MAP

def simple_categorize(title: str) -> str:
    for code, keywords in CATEGORY_KEYWORD_MAP.items():
        if any(kw in title for kw in keywords):
            return code
    return 'global_market'
```

#### 获取分类信息
```python
from config.categories import get_category_by_code

cat = get_category_by_code('ai')
if cat:
    print(cat.name)        # '人工智能'
    print(cat.id)          # 'cat_ai'
    print(cat.keywords)    # ['AI', '大模型', ...]
```

---

## 📝 如何新增/修改分类

### 步骤1: 修改配置文件

#### TypeScript版本（src/config/categories.ts）
```typescript
export const CATEGORIES: CategoryDefinition[] = [
  // ... 现有分类
  
  // 新增一个分类
  {
    code: 'blockchain',           // 新的分类代码
    id: 'cat_blockchain',         // 数据库ID
    name: '区块链',               // 中文名称
    description: 'Web3、加密货币、NFT',
    keywords: ['区块链', 'Web3', '加密货币', 'NFT', '比特币'],
    group: 'tech',                // 所属分组
    sortOrder: 6,                 // 排序（科技类第6个）
  },
]
```

#### Python版本（data-service/config/categories.py）
```python
CATEGORIES: List[CategoryDefinition] = [
    # ... 现有分类
    
    # 新增相同的分类
    CategoryDefinition(
        code='blockchain',
        id='cat_blockchain',
        name='区块链',
        description='Web3、加密货币、NFT',
        keywords=['区块链', 'Web3', '加密货币', 'NFT', '比特币'],
        group='tech',
        sort_order=6
    ),
]
```

### 步骤2: 更新数据库

```bash
# 更新种子数据
npm run db:seed

# 或手动添加到数据库
sqlite3 prisma/dev.db "
INSERT INTO NewsCategory (id, name, code, parentId, sortOrder)
VALUES ('cat_blockchain', '区块链', 'blockchain', 'cat_tech', 6);
"
```

### 步骤3: 重启服务

```bash
# 重启Python服务（使新配置生效）
cd data-service
pkill -f "python main.py"
python main.py &

# Next.js会自动热重载
```

### 步骤4: 验证

```bash
# 验证配置同步
curl http://localhost:8000/api/ai/health

# 验证UI显示
# 访问 http://localhost:3000/events/feed
# 应该能看到新的"区块链"筛选选项
```

---

## ⚠️ 注意事项

### 1. 前后端必须同步
修改配置时，**必须同时更新**：
- `src/config/categories.ts`
- `data-service/config/categories.py`

### 2. 代码命名规范
- **code**: 小写蛇形命名（如：`new_energy`）
- **id**: `cat_` 前缀 + code（如：`cat_new_energy`）
- **name**: 中文简短名称（如：`新能源`）

### 3. 不要重复代码
每个 `code` 和 `id` 必须唯一。

### 4. 关键词设计
- 使用该领域最常见的术语
- 包含同义词和缩写
- 中英文都要覆盖
- 3-5个关键词为宜

---

## 🔄 迁移现有代码

### 前端迁移

#### Before（硬编码）
```typescript
// ❌ 不推荐
const categoryGroups = [
  {
    name: '科技类',
    categories: ['cat_ai', 'cat_chip', 'cat_internet', 'cat_product', 'cat_breakthrough']
  },
  // ...
]
```

#### After（使用配置）
```typescript
// ✅ 推荐
import { generateUIFilterGroups } from '@/config/categories'

const categoryGroups = generateUIFilterGroups()
```

### 后端迁移

#### Before（硬编码）
```python
# ❌ 不推荐
valid_categories = ["ai", "chip", "internet", ...]
```

#### After（使用配置）
```python
# ✅ 推荐
from config.categories import VALID_CATEGORY_CODES

valid_categories = VALID_CATEGORY_CODES
```

---

## ✅ 检查清单

新增/修改分类时，确保：

- [ ] TypeScript配置已更新
- [ ] Python配置已更新（保持同步）
- [ ] 数据库已更新（运行seed或手动添加）
- [ ] Python服务已重启
- [ ] UI能正常显示新分类
- [ ] AI能输出新分类
- [ ] 映射函数能识别新分类
- [ ] 文档已更新（如有必要）

---

## 📊 配置验证

### 自动验证脚本

```bash
# 创建验证脚本
cat > scripts/verify-categories.ts << 'EOF'
import { CATEGORIES, getAllCategoryCodes, getAllCategoryIds } from '@/config/categories'

console.log('分类配置验证:')
console.log('总数:', CATEGORIES.length)
console.log('分类代码:', getAllCategoryCodes())
console.log('分类ID:', getAllCategoryIds())

// 检查重复
const codes = getAllCategoryCodes()
const ids = getAllCategoryIds()
const uniqueCodes = new Set(codes)
const uniqueIds = new Set(ids)

if (codes.length !== uniqueCodes.size) {
  console.error('❌ 发现重复的分类代码!')
}
if (ids.length !== uniqueIds.size) {
  console.error('❌ 发现重复的分类ID!')
}
if (codes.length === uniqueCodes.size && ids.length === uniqueIds.size) {
  console.log('✅ 配置验证通过')
}
EOF

npx tsx scripts/verify-categories.ts
```

---

## 🎯 最佳实践

### 1. 分类设计原则
- **互斥性**: 一条新闻应该只属于一个分类
- **完整性**: 覆盖主要的新闻类型
- **平衡性**: 避免某个分类过于宽泛

### 2. 关键词选择
- 优先选择高频词
- 包含行业术语
- 考虑同义词
- 避免歧义词

### 3. 分组规划
- 每组3-5个分类为宜
- 同组分类应该相关
- 按使用频率排序

### 4. 版本控制
- 配置文件纳入git管理
- 重大变更记录在CHANGELOG
- 考虑向后兼容性

---

## 📚 相关文档

- `src/config/categories.ts` - TypeScript配置
- `data-service/config/categories.py` - Python配置
- `UPGRADE_COMPLETED.md` - AI分类升级总结
- `FINAL_REPORT.md` - 最终验证报告

---

## 🆘 常见问题

### Q: 修改配置后UI没有更新？
A: 清除浏览器缓存并硬刷新（Cmd+Shift+R）

### Q: Python服务没有使用新配置？
A: 重启Python服务：`pkill -f "python main.py" && python main.py &`

### Q: 如何确认前后端配置同步？
A: 运行验证脚本或手动对比两个文件的分类列表

### Q: 可以删除旧的分类吗？
A: 可以，但需要考虑历史数据。建议先标记为不活跃，观察一段时间后再删除。

---

**统一配置，一处修改，全局生效！** 🎉
