# 新闻分类问题修复报告

日期：2026-07-25

## 问题发现

用户报告了两个分类问题：

### 问题1：宁德时代新闻没有显示领域标签
**新闻**: "宁德时代回应中东订单变化：不会参与储能价格内卷，看好下半年及明年需求|直击业绩会"

**现象**: 只显示"利好"标签，没有领域类别

**原因**: 
- 数据库中 `domainIds` 为 `["new_energy"]`
- 前端ETF领域配置中没有 `new_energy` 这个代码
- AI Prompt中的旧category代码 `new_energy` 与新的领域代码不一致

### 问题2：暴雨红警新闻显示"重大影响"标签
**新闻**: "最高级别预警！中央气象台发布暴雨红警"

**现象**: 标记为"无影响"，但同时显示"重大影响"徽章

**原因**:
- `domainIds` 为 `["irrelevant"]` ✅
- `sentiment` 为 `NULL` ✅
- `impact` 为 `4` ❌（应该为1）
- 前端代码：`{article.impact && article.impact >= 4 && <Badge>重大影响</Badge>}`

---

## 根本原因分析

### 1. 领域代码不一致

**AI Prompt中**:
- 旧的category代码包含 `new_energy`（产业类）
- 新的领域代码：`new_energy_vehicle`, `battery`, `photovoltaic`, `wind_power`

**问题**: AI分析时可能返回 `new_energy`，但前端找不到对应的领域配置

### 2. irrelevant新闻的impact未强制为1

**逻辑缺陷**: 
- AI分析 irrelevant 新闻时，可能根据事件本身的严重性给出较高的impact
- 例如"暴雨红警"确实是重大事件（impact=4），但对投资无影响
- 代码没有强制 irrelevant 新闻的 impact=1

---

## 修复方案

### 修复1：优化AI Prompt

**文件**: `data-service/services/content_analyzer.py`

**变更**:
```python
重要规则：
1. 如果新闻与股市投资完全无关（纯娱乐、体育、社会民生等），
   domains返回["irrelevant"]，sentiment返回null，impact返回1  # 新增impact=1要求
2. 对于irrelevant新闻，不要标注利好/利空/中性，影响力必须为1  # 强调
3. domains应按相关度从高到低排序，最多3个
4. 多个领域相关的新闻应打上所有相关标签
5. 新能源相关新闻应根据具体内容选择：new_energy_vehicle(新能源车)、
   battery(电池储能)、photovoltaic(光伏)、wind_power(风电)，
   不要使用new_energy  # 新增规则
```

### 修复2：添加领域代码映射

**文件**: `data-service/services/content_analyzer.py`

**变更**:
```python
# 修正常见的领域代码错误
domain_mapping = {
    "new_energy": "battery",  # 新能源 → 电池储能（宁德时代等）
    "医药": "innovative_drug",
    "医疗": "medical_device",
}
domains = [domain_mapping.get(d, d) for d in domains]
```

### 修复3：强制irrelevant新闻的impact=1

**文件**: `data-service/services/content_analyzer.py`

**变更**:
```python
impact = int(analysis.get("impact", 3))

# irrelevant新闻强制impact=1
if is_irrelevant:
    impact = 1
else:
    impact = max(1, min(5, impact))
```

---

## 数据修复

### 批量修复脚本

**文件**: `scripts/fix-domain-issues.py`

**功能**:
1. 修复 `new_energy` → `battery`（6条新闻）
2. 修复 irrelevant 新闻的 impact>1 → 1（9条新闻）

**执行结果**:

```
📊 修复问题1: new_energy → battery
   找到 6 条需要修复的new_energy新闻
   ✅ 宁德时代回应中东订单变化...
      ['new_energy'] → ['battery']
   ... (其他5条)

📊 修复问题2: irrelevant新闻的impact强制为1
   找到 9 条irrelevant新闻但impact>1
   ✅ 最高级别预警！中央气象台发布暴雨红警...
      impact: 4 → 1
   ✅ 主办方通报李权哲高铁座位争议...
      impact: 2 → 1
   ... (其他7条)
```

---

## 修复验证

### 案例1：宁德时代新闻 ✅

**修复前**:
```
domainIds: ["new_energy"]
sentiment: 0.3
sentimentLabel: "bullish"
impact: 3

前端显示: [财联社] [利好]
         (无领域标签 - 因为找不到new_energy)
```

**修复后**:
```
domainIds: ["battery"]
sentiment: 0.3
sentimentLabel: "bullish"
impact: 3

前端显示: [财联社] [利好] [电池储能]
         ✅ 正确显示领域标签
```

### 案例2：暴雨红警新闻 ✅

**修复前**:
```
domainIds: ["irrelevant"]
sentiment: NULL
sentimentLabel: NULL
impact: 4

前端显示: [来源] [无影响] [重大影响]
         ❌ 矛盾显示
```

**修复后**:
```
domainIds: ["irrelevant"]
sentiment: NULL
sentimentLabel: NULL
impact: 1

前端显示: [来源] [无影响]
         ✅ 只显示无影响，不显示重大影响
```

---

## 预防措施

### 1. 代码层面

**AI分析时**:
- ✅ 领域代码映射（自动纠正常见错误）
- ✅ irrelevant强制impact=1
- ✅ 更明确的Prompt规则

**未来新增领域时**:
- 同步更新前端 `etf-domains.ts`
- 同步更新后端 AI Prompt
- 添加到 `domain_mapping` 映射表

### 2. 监控层面

**建议添加数据质量检查**:
```python
# 检查孤儿领域代码（数据库中有但配置中没有）
SELECT DISTINCT json_extract(value, '$') as domain_code
FROM NewsArticle, json_each(domainIds)
WHERE domain_code NOT IN (
  'semiconductor', 'ai', 'computing', 'robotics', 'communication',
  'software', 'new_energy_vehicle', 'battery', 'photovoltaic',
  'wind_power', 'innovative_drug', 'medical_device', 'equipment',
  'military', 'food_beverage', 'consumer_electronics', 'finance',
  'real_estate', 'agriculture', 'environment', 'irrelevant'
);
```

---

## 总结

### 修复内容

1. ✅ AI Prompt优化（强调impact=1和禁用new_energy）
2. ✅ 领域代码映射（自动纠正new_energy→battery）
3. ✅ 强制irrelevant的impact=1
4. ✅ 批量修复历史数据（15条新闻）

### 修复后状态

| 指标 | 修复前 | 修复后 |
|------|--------|--------|
| 宁德时代新闻领域标签 | 无显示（new_energy未定义） | ✅ [电池储能] |
| 暴雨红警重大影响标签 | ❌ 显示（impact=4） | ✅ 不显示（impact=1） |
| irrelevant新闻一致性 | ❌ 部分impact>1 | ✅ 全部impact=1 |
| 孤儿领域代码 | 6条new_energy | ✅ 0条 |

### 影响范围

- ✅ 未来新采集的新闻：自动应用新规则
- ✅ 历史数据：已批量修复
- ✅ 前端显示：立即生效

---

## 文件清单

### 修改文件
- ✅ `data-service/services/content_analyzer.py` - AI分析逻辑优化

### 新增文件
- ✅ `scripts/fix-domain-issues.py` - 数据修复脚本
- ✅ `docs/news-classification-fix-report.md` - 本报告

### 相关文件
- `src/config/etf-domains.ts` - ETF领域配置（无需修改）
- `src/app/(dashboard)/events/feed/page.tsx` - 前端显示逻辑（无需修改）

---

## 验证步骤

刷新浏览器页面后验证：

1. ✅ "宁德时代"新闻显示 [利好] [电池储能] 标签
2. ✅ "暴雨红警"新闻只显示 [无影响]，不显示"重大影响"
3. ✅ 所有irrelevant新闻不显示"重大影响"徽章

**修复完成！** 🎉
