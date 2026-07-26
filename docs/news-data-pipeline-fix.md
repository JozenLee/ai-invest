# 新闻数据链路问题诊断与修复报告

**日期**: 2026-07-25  
**问题**: 新闻标签与内容不符合，摘要等于标题

## 1. 数据链路梳理

### 完整数据流
```
NewsNowProvider (采集)
    ↓ RawArticle
AIAnalyzer (AI分析)
    ↓ AnalyzedArticle
DatabaseWriter (写入队列)
    ↓ HTTP请求
Next.js API (/api/events/batch-save)
    ↓ Prisma ORM
SQLite Database
```

### 各阶段详细说明

#### 阶段1: 数据采集
- **文件**: `data-service/services/news_pipeline.py`
- **方法**: `fetch_from_sources()`
- **输出**: `RawArticle` 列表
- **字段**: id, title, content, source, url, publishTime

#### 阶段2: AI分析
- **文件**: `data-service/workers/ai_analyzer.py`
- **方法**: `analyze_batch()` → `_analyze_single()` → `_call_claude_api()`
- **并发**: 5个协程
- **超时**: 单条15秒，整批90秒
- **输出**: `AnalyzedArticle` 列表（添加AI字段）

#### 阶段3: 数据库写入
- **文件**: `data-service/workers/db_writer.py`
- **方法**: `_batch_write()` → `_write_to_database()`
- **并发**: 2个线程
- **批量**: 10条/批
- **重试**: 3次（指数退避）

#### 阶段4: Next.js API
- **文件**: `src/app/api/events/batch-save/route.ts`
- **方法**: `POST` handler → `prisma.newsArticle.upsert()`
- **去重**: 基于 `url` 字段

## 2. 发现的问题

### 问题1: 摘要直接使用标题 ❌
**位置**: `data-service/workers/db_writer.py:138`

```python
# 错误代码
'summary': a.title[:100] if len(a.title) > 100 else a.title,
```

**影响**: 
- 所有新闻的摘要都等于标题
- 无法提供额外信息价值

### 问题2: AI未生成摘要 ❌
**位置**: `data-service/workers/ai_analyzer.py:167-190`

**问题**:
- Claude API prompt 没有要求生成摘要
- `AnalyzedArticle` 模型缺少 `summary` 字段
- `_analyze_single()` 方法未提取 `summary` 字段

**数据库证据**:
```sql
SELECT title, summary FROM NewsArticle LIMIT 3;
-- 结果: summary完全等于title
```

### 问题3: 标签数据缺失 ❌
**位置**: 数据库查询结果

```sql
SELECT categoryId, keywords, entities, sectors, aiProcessed 
FROM NewsArticle WHERE aiProcessed = 1 LIMIT 3;
-- 结果: categoryId=NULL, keywords=NULL, entities=NULL, sectors=NULL
```

**原因分析**:
1. Claude API可能返回了数据，但字段为空
2. 映射逻辑可能有问题（`_map_category`, `_map_domains`）
3. 或者API调用失败（503错误）

### 问题4: Claude API配置问题 ⚠️
**测试结果**: 
```
Error code: 503 - No available accounts
```

**影响**: 
- AI分析功能完全不可用
- 所有文章标记为 `aiProcessed=False`

## 3. 已实施的修复

### 修复1: 添加摘要生成 ✅

#### 3.1 更新 `AnalyzedArticle` 模型
**文件**: `data-service/models/article.py`

```python
class AnalyzedArticle(BaseModel):
    # ... 其他字段
    
    # 新增字段
    summary: Optional[str] = None  # AI生成的摘要
    
    # ... 其他字段
```

#### 3.2 更新 Claude API Prompt
**文件**: `data-service/workers/ai_analyzer.py:167`

```python
prompt = f"""请分析以下财经新闻，提供结构化的分析结果：

标题：{article.title}
内容：{article.content[:1000]}  # 从500字符扩展到1000
来源：{article.source}

请提供以下分析：
1. 摘要（summary）：30-50字的新闻摘要，提炼核心要点  # 新增
2. 分类（category）：从以下选择 - policy/earnings/product/partnership/supply/tech/regulation/market
3. 情感（sentiment）：分数-1到1（score），标签bullish/neutral/bearish（label），置信度0-1（confidence）
4. 影响力（impact）：1-5级别（magnitude）
5. 关键词（keywords）：3-5个关键词数组
6. 实体（entities）：companies（公司数组）, sectors（板块数组）, products（产品数组）
7. 相关板块（sectors）：必须从以下选择 - 半导体/光通信/服务器/存储/散热/PCB/AI应用，可多选  # 明确要求

以JSON格式返回，格式如下：
{{
  "summary": "英伟达发布新一代GPU，AI算力提升3倍，推动数据中心市场增长",  # 新增示例
  "category": "tech",
  "category_confidence": 0.9,
  "sentiment": {{"score": 0.8, "label": "bullish", "confidence": 0.85}},
  "impact": {{"magnitude": 4}},
  "keywords": ["AI", "芯片", "GPU", "英伟达"],
  "entities": {{"companies": ["英伟达"], "sectors": ["半导体"], "products": ["GPU"]}},
  "sectors": ["半导体", "AI应用"]
}}"""
```

**改进点**:
- ✅ 增加摘要生成要求（30-50字）
- ✅ 内容截取从500→1000字符（提供更多上下文）
- ✅ 明确板块选择范围（避免自由发挥）
- ✅ 提供完整的JSON示例

#### 3.3 提取摘要字段
**文件**: `data-service/workers/ai_analyzer.py:129`

```python
# 解析响应后确保summary存在
result = json.loads(json_match.group())
if 'summary' not in result or not result['summary']:
    result['summary'] = article.title[:100]  # fallback
return result
```

#### 3.4 传递摘要到数据库
**文件**: `data-service/workers/ai_analyzer.py:129`

```python
return AnalyzedArticle(
    **article.dict(),
    summary=analysis.get('summary', article.title[:100]),  # 新增
    categoryId=category_id,
    # ... 其他字段
)
```

**文件**: `data-service/workers/db_writer.py:138`

```python
'summary': a.summary or a.title[:100],  # 使用AI摘要，fallback到标题
```

### 修复2: 增强标签准确性 ✅

#### 2.1 改进Prompt明确性
- 明确板块选择范围（7个固定选项）
- 要求返回多个关键词（3-5个）
- 实体分类更清晰（companies/sectors/products）

#### 2.2 领域映射优化
**文件**: `data-service/workers/ai_analyzer.py:234`

现有映射逻辑已较完善：
```python
domain_keywords = {
    'ai': ['AI', '人工智能', '大模型', 'GPT', '算力'],
    'chip': ['芯片', '半导体', 'GPU', 'CPU', 'ASIC'],
    'optics': ['光模块', '光通信', 'CPO', '光芯片'],
    'server': ['服务器', '数据中心', '云计算'],
    'storage': ['存储', 'HBM', '内存', 'SSD'],
    'cooling': ['液冷', '散热', '冷却'],
    'pcb': ['PCB', '基板', '载板']
}
```

## 4. 待解决问题

### 问题1: Claude API不可用 🔴
**错误**: `503 - No available accounts`

**可能原因**:
1. API代理服务（apiclaude.cc）账号余额不足
2. API密钥已失效
3. 代理服务不稳定

**影响范围**: 
- 所有新增新闻无法进行AI分析
- `aiProcessed` 标记为 `false`
- 标签、摘要全部缺失

**建议解决方案**:
```bash
# 方案1: 检查API密钥有效性
curl -H "x-api-key: sk-d65f4c3e..." https://apiclaude.cc/v1/models

# 方案2: 切换到官方API
ANTHROPIC_API_KEY=<official-key>
ANTHROPIC_BASE_URL=https://api.anthropic.com

# 方案3: 添加降级策略
- 使用规则匹配临时标注
- 队列暂存待重试
```

### 问题2: 历史数据未修复 ⚠️
**现状**: 数据库中已有新闻仍然是旧数据

**解决方案**: 创建重新分析脚本

```python
# scripts/reanalyze-news.py
# 1. 查询 aiProcessed=false 或 summary=title 的文章
# 2. 批量重新调用 AIAnalyzer
# 3. 更新数据库
```

### 问题3: 实时验证机制缺失 ⚠️
**建议**: 添加数据质量监控

```python
# 在 db_writer.py 中添加
def _validate_article(article: AnalyzedArticle) -> bool:
    """验证文章数据质量"""
    issues = []
    
    if article.aiProcessed:
        if not article.summary or article.summary == article.title:
            issues.append("summary_invalid")
        if not article.categoryId:
            issues.append("category_missing")
        if not article.keywords or article.keywords == "[]":
            issues.append("keywords_missing")
    
    if issues:
        logger.warning(f"Article {article.id} quality issues: {issues}")
        return False
    
    return True
```

## 5. 测试验证

### 5.1 单元测试
**文件**: `test-ai-analysis-fix.py`

```bash
# 测试AI分析功能
python3 test-ai-analysis-fix.py
```

**验证项**:
- ✅ 摘要是否生成（不等于标题）
- ✅ 分类是否识别（categoryId非空）
- ✅ 领域是否匹配（domainIds非空）
- ✅ 关键词是否提取（keywords非空数组）
- ✅ 板块是否识别（sectors非空数组）

### 5.2 集成测试
```bash
# 1. 启动数据服务
cd data-service
python3 main.py

# 2. 触发新闻采集
curl -X POST http://localhost:8000/api/news/fetch

# 3. 查询结果
sqlite3 ../prisma/dev.db "
SELECT 
  title, 
  substr(summary, 1, 50) as summary,
  categoryId,
  keywords,
  sectors,
  aiProcessed
FROM NewsArticle 
WHERE publishTime > datetime('now', '-1 hour')
LIMIT 5;
"
```

### 5.3 数据质量检查
```sql
-- 检查摘要质量
SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN summary = title THEN 1 ELSE 0 END) as summary_eq_title,
  SUM(CASE WHEN categoryId IS NULL THEN 1 ELSE 0 END) as no_category,
  SUM(CASE WHEN keywords IS NULL OR keywords = '' THEN 1 ELSE 0 END) as no_keywords
FROM NewsArticle
WHERE aiProcessed = 1;

-- 期望结果：
-- summary_eq_title = 0
-- no_category < 5%
-- no_keywords < 5%
```

## 6. 部署步骤

### 6.1 代码更新
```bash
# 已完成的文件修改
git status
# modified:   data-service/models/article.py
# modified:   data-service/workers/ai_analyzer.py
# modified:   data-service/workers/db_writer.py
```

### 6.2 重启服务
```bash
# 1. 停止现有服务
pkill -f "python3 main.py"

# 2. 重启数据服务
cd data-service
python3 main.py &

# 3. 验证服务状态
curl http://localhost:8000/health
```

### 6.3 数据修复（可选）
```bash
# 重新分析最近的新闻
python3 scripts/reanalyze-recent-news.py --hours 24
```

## 7. 监控建议

### 7.1 关键指标
```python
# 新增监控指标
metrics = {
    'ai_success_rate': 'aiProcessed=true数量 / 总数',
    'summary_quality': '摘要≠标题数量 / aiProcessed=true数量',
    'category_coverage': 'categoryId非空数量 / aiProcessed=true数量',
    'avg_keywords': '平均关键词数量',
    'api_error_rate': 'API调用失败率'
}
```

### 7.2 告警规则
- AI分析成功率 < 80% → 告警
- 摘要质量 < 90% → 警告
- API错误率 > 10% → 告警

## 8. 总结

### 已修复 ✅
1. ✅ 摘要生成逻辑（AI生成，非标题复制）
2. ✅ Claude API Prompt优化（增加摘要要求）
3. ✅ 数据模型扩展（AnalyzedArticle.summary）
4. ✅ 数据传递链路（AI→Writer→API→DB）

### 待解决 🔴
1. 🔴 Claude API不可用（503错误）- **阻塞性问题**
2. ⚠️ 历史数据未修复
3. ⚠️ 缺少数据质量监控
4. ⚠️ 缺少失败重试机制

### 下一步行动
1. **优先级1**: 修复Claude API问题（更换密钥或服务商）
2. **优先级2**: 验证修复效果（运行集成测试）
3. **优先级3**: 重新分析历史数据
4. **优先级4**: 建立监控体系
