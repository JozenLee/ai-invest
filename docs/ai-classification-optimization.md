# AI分类逻辑优化完成报告

日期：2026-07-25

## 优化目标

1. ✅ 对跟股市无关的新闻标注为"无影响"（irrelevant），不标注利好/利空/中性
2. ✅ 支持多领域标签（1-3个），对应主流ETF指数分类
3. ✅ 优化领域分类精准度，便于下游趋势分析和用户筛选

---

## 实施内容

### 1. 创建ETF领域配置（新增文件）

**文件**: `src/config/etf-domains.ts`

定义了20个主流ETF领域分类：

**科技类**（6个）:
- semiconductor（半导体）
- ai（人工智能）
- computing（算力设备）
- robotics（机器人）
- communication（通信设备）
- software（软件互联网）

**新能源类**（4个）:
- new_energy_vehicle（新能源车）
- battery（电池储能）
- photovoltaic（光伏产业）
- wind_power（风电产业）

**医药类**（2个）:
- innovative_drug（创新药）
- medical_device（医疗器械）

**制造类**（2个）:
- equipment（高端装备）
- military（国防军工）

**消费类**（2个）:
- food_beverage（食品饮料）
- consumer_electronics（消费电子）

**金融地产**（2个）:
- finance（金融）
- real_estate（房地产）

**其他**（2个）:
- agriculture（农业）
- environment（环保）

**特殊**（1个）:
- **irrelevant（无影响）** - 与股市投资无关的新闻

每个领域包含：
- ETF代码示例（如512480对应半导体）
- AI识别关键词
- 详细描述

---

### 2. 优化AI分析逻辑

**文件**: `data-service/services/content_analyzer.py`

#### 修改点1: `_analyze_single_comprehensive()` - 综合分析方法

**变更**:
```python
# 新增领域识别到prompt
prompt = f"""请对以下新闻进行全面分析，以JSON格式返回结果：
{{
  "summary": "新闻摘要（30-50字）",
  "category": "分类代码（ai/chip/earnings/policy等22个类别之一）",
  "domains": ["领域代码1", "领域代码2"],  # 新增
  "sentiment": 情感分数（-1到1的浮点数，若irrelevant则为null）,  # 修改
  "impact": 影响力等级（1-5的整数）,
  "keywords": ["关键词1", "关键词2", "关键词3"]
}}

领域代码说明（对应ETF指数分类，选择1-3个最相关的）：
科技类: semiconductor(半导体), ai(人工智能), computing(算力设备), robotics(机器人), communication(通信设备), software(软件互联网)
新能源: new_energy_vehicle(新能源车), battery(电池储能), photovoltaic(光伏), wind_power(风电)
医药类: innovative_drug(创新药), medical_device(医疗器械)
制造类: equipment(高端装备), military(国防军工)
消费类: food_beverage(食品饮料), consumer_electronics(消费电子)
其他: finance(金融), real_estate(房地产), agriculture(农业), environment(环保)
特殊: irrelevant(与股市投资无关)

重要规则：
1. 如果新闻与股市投资完全无关（纯娱乐、体育、社会民生等），domains返回["irrelevant"]，sentiment返回null
2. 对于irrelevant新闻，不要标注利好/利空/中性
3. domains应按相关度从高到低排序，最多3个
4. 多个领域相关的新闻应打上所有相关标签（如："芯片制造设备"应标注["semiconductor", "equipment"]）
"""
```

**处理逻辑**:
```python
# 检查是否为无影响新闻
is_irrelevant = "irrelevant" in domains

# 情感处理
sentiment_raw = analysis.get("sentiment")
if is_irrelevant or sentiment_raw is None:
    sentiment = None
    sentiment_label = None
else:
    sentiment = float(sentiment_raw)
    sentiment = max(-1.0, min(1.0, sentiment))
    # 生成情感标签
    if sentiment > 0.2:
        sentiment_label = "bullish"
    elif sentiment < -0.2:
        sentiment_label = "bearish"
    else:
        sentiment_label = "neutral"
```

#### 修改点2: `_fallback_analysis()` - 降级方案

**变更**: 添加简单领域判断，无影响新闻不标注情感

```python
# 简单领域判断
domains = self._simple_domains(combined_text)

# 检查是否为无影响新闻
is_irrelevant = "irrelevant" in domains

# 简单情感（无影响新闻不标注情感）
if is_irrelevant:
    sentiment = None
    sentiment_label = None
    sentiment_confidence = None
else:
    sentiment = self._simple_sentiment(combined_text)
    sentiment_label = self._get_sentiment_label(sentiment)
    sentiment_confidence = 0.5
```

#### 修改点3: `_simple_domains()` - 新增关键词匹配方法

**新增方法**: 基于关键词匹配的简单领域判断（AI不可用时的降级方案）

```python
def _simple_domains(self, content: str) -> List[str]:
    """简化版领域判断（基于关键词匹配）"""
    content_lower = content.lower()
    domains = []

    # 领域关键词映射（对应ETF指数分类）
    domain_keywords = {
        'semiconductor': ['半导体', '芯片', '晶圆', ...],
        'ai': ['人工智能', 'ai', '大模型', ...],
        'computing': ['服务器', '数据中心', ...],
        'robotics': ['机器人', '工业机器人', ...],
        # ... 其他领域
        'irrelevant': ['娱乐明星', '演唱会', '电影', '体育赛事', '网红', '八卦']
    }

    # 匹配领域
    for domain, keywords in domain_keywords.items():
        for keyword in keywords:
            if keyword in content_lower:
                if domain not in domains:
                    domains.append(domain)
                break

    return domains[:3]  # 最多返回3个
```

#### 修改点4: `_get_default_analysis()` - 默认值调整

**变更**: 默认情感为None而非0.0

```python
def _get_default_analysis(self) -> Dict[str, Any]:
    """获取默认分析结果"""
    return {
        "summary": "",
        "sentiment": None,  # 改为None
        "sentimentLabel": None,  # 改为None
        "sentimentConfidence": None,  # 改为None
        "category": "global_market",
        "categoryConfidence": 0.3,
        "impact": 3,
        "keywords": [],
        "entities": [],
        "domains": []
    }
```

---

### 3. 更新数据存储逻辑

**文件**: `data-service/services/fetch_service.py`

#### 修改点: `_process_with_ai()` - 处理AI分析结果

**变更**: 支持sentiment可能为None的情况

```python
# 检查是否为无影响新闻
domains = analysis.get("domains", [])
is_irrelevant = "irrelevant" in domains

processed_item = {
    **item,
    "summary": analysis.get("summary", item.get("title", "")[:100]),
    "category": analysis.get("category", "global_market"),
    "categoryConfidence": analysis.get("categoryConfidence", 0.5),
    "sentiment": analysis.get("sentiment"),  # 可能为None
    "sentimentLabel": analysis.get("sentimentLabel"),  # 可能为None
    "sentimentConfidence": analysis.get("sentimentConfidence"),  # 可能为None
    "impact": analysis.get("impact", 3),
    "keywords": analysis.get("keywords", []),
    "entities": analysis.get("entities", []),
    "sectors": self._extract_sectors(item.get("title", "")),
    "domainIds": domains,
    "aiProcessed": True,
    "aiProcessedAt": datetime.now(timezone.utc).isoformat(),
    "aiError": None
}
```

---

### 4. 更新前端查询逻辑

**文件**: `src/lib/services/event.service.ts`

#### 修改点: `getNewsFeed()` - 支持多领域查询

**变更**: domainIds字段改为JSON数组匹配

```typescript
// 领域筛选（支持多选）- 基于domainIds字段（JSON数组）
if (domainIds && domainIds.length > 0) {
  // domainIds是JSON字符串，需要匹配数组中的任一元素
  // SQLite不支持JSON函数，所以使用字符串匹配
  where.OR = domainIds.map(domainId => ({
    domainIds: { contains: `"${domainId}"` }
  }))
}
```

**返回数据**: 解析domainIds JSON数组

```typescript
// 解析domainIds（JSON数组）
let domainIds: string[] = []
if (a.domainIds) {
  try {
    domainIds = JSON.parse(a.domainIds as string)
  } catch (e) {
    console.error('解析domainIds失败:', e)
  }
}

return {
  // ... 其他字段
  domainIds: domainIds,
  // ...
}
```

---

## 测试验证

**测试文件**: `scripts/test-new-classification.py`

### 测试用例及结果

| 用例 | 标题 | 期望领域 | 实际领域 | 情感 | 结果 |
|------|------|----------|----------|------|------|
| 1 | 英伟达发布H200 GPU | semiconductor, ai, computing | ✅ semiconductor, ai, computing | 0.8 (bullish) | ✅ 通过 |
| 2 | 某明星宣布离婚 | irrelevant | ✅ irrelevant | None | ✅ 通过 |
| 3 | 宁德时代钠电池 | battery, new_energy_vehicle | ✅ battery, new_energy_vehicle | 0.8 (bullish) | ✅ 通过 |
| 4 | 某地马拉松比赛 | irrelevant | ✅ irrelevant | None | ✅ 通过 |
| 5 | 中芯国际光刻机 | semiconductor, equipment | ✅ semiconductor, equipment | 0.8 (bullish) | ✅ 通过 |
| 6 | 网红直播被罚 | irrelevant | ✅ irrelevant | None | ✅ 通过 |

**测试结果**: ✅ 6/6 全部通过

---

## 核心改进点

### 1. 无影响新闻处理 ✅

**问题**: 之前所有新闻都会标注利好/利空/中性，即使是娱乐、体育新闻
**解决**: 
- 新增 `irrelevant` 领域标签
- irrelevant新闻的 `sentiment` 和 `sentimentLabel` 都为 `null`
- 不会在情感筛选中出现

### 2. 多领域标签 ✅

**问题**: 之前只能标注一个领域，无法表达多领域相关性
**解决**:
- 支持1-3个领域标签
- 按相关度排序
- 例如："芯片制造设备"同时标注 `semiconductor` 和 `equipment`

### 3. ETF对应关系 ✅

**问题**: 领域分类与主流ETF指数不对应
**解决**:
- 20个领域直接对应主流ETF（如512480对应半导体）
- 便于趋势分析按ETF领域归类
- 用户可按关注的ETF领域筛选新闻

### 4. 数据库兼容性 ✅

**数据库字段**: `domainIds` (String, JSON格式)
- 存储格式: `["semiconductor", "ai"]`
- 查询方式: 字符串匹配 `contains: "semiconductor"`
- 向后兼容: 旧数据可能为空，不影响查询

---

## 影响范围

### 后端
- ✅ `data-service/services/content_analyzer.py` - AI分析逻辑
- ✅ `data-service/services/fetch_service.py` - 数据处理
- ✅ 数据库字段 `domainIds` 已存在，无需迁移

### 前端
- ✅ `src/config/etf-domains.ts` - 新增领域配置
- ✅ `src/lib/services/event.service.ts` - 查询逻辑优化
- ⚠️ 前端UI需要更新（筛选器、标签显示）- 待后续实现

### 下游应用
- **领域趋势分析**: 可按ETF领域聚合分析
- **用户筛选**: 可按关注领域初筛新闻
- **投资决策**: 更精准的领域归类

---

## 后续建议

### 立即可做
1. ✅ 测试通过，可部署到生产环境
2. ⚠️ 更新前端筛选器UI，支持ETF领域多选
3. ⚠️ 更新新闻卡片，显示多领域标签
4. ⚠️ irrelevant新闻在UI中标记为"无影响"或隐藏情感标签

### 中期优化
1. 基于历史数据分析，优化关键词映射
2. 增加领域权重，反映相关度强弱
3. 支持用户自定义领域关注列表

### 长期规划
1. 领域与知识图谱节点关联
2. 跨领域影响分析（如半导体→AI→算力设备）
3. ETF组合推荐基于领域分布

---

## 文件清单

### 新增文件
- ✅ `src/config/etf-domains.ts` - ETF领域配置
- ✅ `scripts/test-new-classification.py` - 分类测试脚本
- ✅ `docs/ai-classification-optimization.md` - 本文档

### 修改文件
- ✅ `data-service/services/content_analyzer.py` - AI分析逻辑
- ✅ `data-service/services/fetch_service.py` - 数据处理逻辑
- ✅ `src/lib/services/event.service.ts` - 前端查询逻辑

---

## 总结

✅ **所有优化目标已完成**

1. ✅ 无影响新闻标注为irrelevant，不标注利好/利空/中性
2. ✅ 支持1-3个多领域标签
3. ✅ 领域对应主流ETF指数
4. ✅ 测试验证100%通过（6/6）
5. ✅ 向后兼容，无需数据迁移

**下一步**: 更新前端UI以展示新的领域标签系统。
