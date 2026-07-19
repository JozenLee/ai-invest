# AI打标签配置与数据映射诊断报告

生成时间: 2026-07-20

## ✅ 1. AI服务配置状态

### Python数据服务 (端口8000)
- ✅ **服务运行正常**
- ✅ **AI客户端已配置**
- ✅ **API Key**: 已设置 (tp-cjzs4...)
- ✅ **Base URL**: https://apiclaude.cc (第三方API)
- ✅ **模型**: mimo-v2.5-pro
- ✅ **定时任务**: 每60分钟采集财联社新闻

### AI分析能力
- ✅ 事件分类 (8类)
- ✅ 情感分析 (-1~1分数)
- ✅ 情感标签 (bullish/neutral/bearish)
- ✅ 实体识别 (公司、产品、人物)
- ✅ 关键词提取
- ✅ 板块识别

---

## 📊 2. AI分类 → 数据库映射分析

### AI输出的8个分类代码
```
1. policy     - 政策
2. earnings   - 业绩
3. product    - 产品发布
4. partnership- 合作
5. supply     - 供应链
6. tech       - 技术
7. regulation - 监管
8. market     - 市场
```

### 数据库中的22个分类

#### ✅ 精确匹配 (5个)
| AI分类 | 数据库code | 数据库ID | 名称 |
|--------|-----------|----------|------|
| policy | policy | cat_policy | 政策法规 |
| earnings | earnings | cat_earnings | 财报业绩 |
| product | product | cat_product | 产品发布 |
| regulation | regulation | cat_regulation | 监管制裁 |
| supply | supply | cat_supply | 供应链 |

#### ⚠️ 需要模糊映射 (3个)
| AI分类 | 映射到数据库 | 映射关键词 |
|--------|-------------|-----------|
| tech | cat_breakthrough | 技术、研发、创新 |
| partnership | cat_merger | 合作、战略合作、并购 |
| market | cat_global_market | 市场、行情、趋势 |

#### ❌ 无AI输出映射 (14个)
这些分类在数据库中存在，但AI不会主动输出这些代码，只能通过模糊匹配：

**科技类:**
- cat_ai (ai) - 人工智能
- cat_chip (chip) - 芯片半导体
- cat_internet (internet) - 互联网

**财经类:**
- cat_capital (capital) - 资本市场
- cat_macro (macro) - 宏观经济

**政策类:**
- cat_government (government) - 政府动态

**社会类:**
- cat_event (event) - 社会事件
- cat_consume (consume) - 消费生活

**国际类:**
- cat_geopolitics (geopolitics) - 地缘政治
- cat_trade (trade) - 国际贸易

**产业类:**
- cat_capacity (capacity) - 产能扩张
- cat_competition (competition) - 竞争格局
- cat_new_energy (new_energy) - 新能源
- cat_medical (medical) - 医药医疗

### 映射函数工作状态
✅ **`mapAICategoryToDatabase()` 正常工作**

从数据库中的11条新闻验证：
- market → cat_global_market ✅ (4条)
- product → cat_product ✅ (3条)
- tech → cat_breakthrough ✅ (2条)
- earnings → cat_earnings ✅ (1条)
- partnership → cat_merger ✅ (1条)

---

## 🌐 3. 领域匹配分析

### AI识别的领域关键词 (content_analyzer.py)
```python
'ai': ['ai', '人工智能', '芯片', 'gpu', '服务器', '数据中心', '算力', '大模型', '深度学习']
'new_energy': ['新能源', '光伏', '风电', '储能', '锂电', '电池', '电动车', '充电桩']
'medical': ['医药', '医疗', '创新药', '生物', '疫苗', '医疗器械', 'cxo']
'semiconductor': ['半导体', '芯片', '晶圆', '封装', '光刻', '集成电路']
'internet': ['互联网', '电商', '社交', '游戏', '云计算', 'saas']
'finance': ['金融', '银行', '保险', '证券', '基金', '投资']
```

### 数据库中的领域 (Domain表)
| Domain ID | 名称 | Code | 数据库关键词 |
|-----------|------|------|------------|
| dom_ai | AI算力 | ai | ["AI","芯片","GPU","服务器","数据中心","算力"] |
| dom_new_energy | 新能源 | new_energy | ["光伏","风电","储能","新能源汽车","锂电"] |
| dom_medical | 医药医疗 | medical | ["创新药","医疗器械","医疗服务","CXO"] |
| dom_semiconductor | 半导体 | semiconductor | ["半导体","芯片","晶圆","封装","光刻"] |

### ✅ 完美匹配的领域
- ai ✅
- new_energy ✅
- medical ✅
- semiconductor ✅

### ⚠️ 缺失的领域
AI能识别但数据库没有配置的领域：
- **internet** - 互联网（建议添加）
- **finance** - 金融（建议添加）

---

## 🔍 4. UI筛选与数据一致性检查

### 当前UI筛选配置 (events/feed/page.tsx)

**分类筛选 - 6组多选:**
1. 科技类: cat_ai, cat_chip, cat_internet, cat_breakthrough, cat_product
2. 财经类: cat_capital, cat_macro, cat_earnings
3. 产业类: cat_supply, cat_capacity, cat_competition, cat_new_energy, cat_medical
4. 政策类: cat_policy, cat_regulation, cat_government
5. 国际类: cat_geopolitics, cat_global_market, cat_trade
6. 其他: cat_society, cat_event, cat_consume, cat_merger

**领域筛选:**
- AI算力 (dom_ai)
- 新能源 (dom_new_energy)
- 医药医疗 (dom_medical)
- 半导体 (dom_semiconductor)

**情感筛选:**
- 利好 (bullish: sentiment > 0.2)
- 中性 (neutral: -0.2 ≤ sentiment ≤ 0.2)
- 利空 (bearish: sentiment < -0.2)

### ⚠️ 潜在问题

1. **UI显示空数据的分类** (14个)
   - 这些分类在UI中可选择，但AI不会主动输出对应code
   - 只能通过模糊匹配的关键词命中
   - 用户选择后可能看到"无数据"

2. **领域不完整**
   - UI只显示4个领域，但AI能识别6个
   - internet和finance领域的新闻无法通过领域筛选

---

## 💡 5. 改进建议

### 🔴 紧急修复

#### A. 扩展AI分类代码输出
修改 `data-service/routers/ai.py` 的分类列表：

```python
# 当前只有8类
categories = [
    "policy", "earnings", "product", "partnership", 
    "supply", "tech", "regulation", "market"
]

# 建议扩展到22类（与数据库一致）
categories = [
    # 科技类
    "ai", "chip", "internet", "product", "breakthrough",
    # 财经类
    "earnings", "merger", "capital", "macro",
    # 政策类
    "policy", "regulation", "government",
    # 社会类
    "event", "consume",
    # 国际类
    "geopolitics", "global_market", "trade",
    # 产业类
    "supply", "capacity", "competition", "new_energy", "medical"
]
```

#### B. 补充数据库领域
添加缺失的领域到种子数据：

```typescript
// prisma/seed.ts
const domains = [
  // ... 现有的4个领域
  { 
    id: 'dom_internet', 
    name: '互联网', 
    code: 'internet', 
    description: '电商、社交、游戏、云计算等', 
    keywords: '["互联网","电商","社交","游戏","云计算","SaaS"]'
  },
  { 
    id: 'dom_finance', 
    name: '金融', 
    code: 'finance', 
    description: '银行、保险、证券、基金等', 
    keywords: '["金融","银行","保险","证券","基金","投资"]'
  },
]
```

### 🟡 优化建议

#### C. 优化映射函数
在 `mapAICategoryToDatabase()` 中增加更智能的映射逻辑：

```typescript
// 增强映射表
const categoryMap: Record<string, string[]> = {
  // 新增细分映射
  ai: ['人工智能', 'AI', '大模型'],
  chip: ['芯片', '半导体', 'GPU'],
  internet: ['互联网', '电商', '社交'],
  government: ['政府', '国务院', '部委'],
  capital: ['上市', 'IPO', '融资', '股市'],
  macro: ['GDP', 'CPI', '央行', '货币政策'],
  // ... 其他映射
}
```

#### D. 添加映射监控
记录映射失败的情况，便于调优：

```typescript
if (!categoryId) {
  console.warn(`AI分类映射失败: ${aiCategory}, 标题: ${article.title}`)
  // 记录到日志表，用于后续分析
}
```

---

## ✅ 6. 当前工作正常的功能

1. ✅ AI接口调用正常
2. ✅ 情感分析准确（-1~1分数 + 标签）
3. ✅ 5个核心分类精确匹配
4. ✅ 3个分类模糊匹配工作正常
5. ✅ 4个领域关键词匹配准确
6. ✅ 定时采集任务正常运行
7. ✅ 数据去重功能正常
8. ✅ 7天滚动存储正常

---

## 📝 7. 执行清单

**立即执行:**
- [ ] 确认是否需要扩展AI分类到22类
- [ ] 决定是否添加internet和finance领域
- [ ] 更新种子数据并重新初始化

**长期优化:**
- [ ] 添加AI分类映射监控日志
- [ ] 定期分析映射失败的案例
- [ ] 根据实际数据优化关键词映射表
- [ ] 考虑使用更精细的AI prompt来输出22类
