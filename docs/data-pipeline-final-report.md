# 新闻数据链路排查最终报告

**日期**: 2026-07-25  
**执行人**: AI Assistant  
**任务**: 排查数据源更新新闻到资讯流的完整链路，验证AI分析功能

---

## 🎯 排查结论

### ✅ AI分析链路已正常启动并执行

**验证结果**:
- ✅ 环境变量 `ENABLE_AI_ANALYSIS=true` 已配置
- ✅ 服务已加载新配置并重启
- ✅ AI分析功能已启动（日志显示 "开始AI批量分析"）
- ✅ Claude API调用成功（大量 200 OK 响应）
- ✅ AI分析完成（日志显示 "AI分析完成: processed=20"）
- ✅ 数据库中已有 128 条 AI 处理过的新闻

### ⚠️ 但发现数据质量问题

**问题**: 虽然 `aiProcessed=1`，但数据不完整：
- ❌ 摘要仍然等于标题
- ❌ `categoryId = NULL`
- ❌ `impact = NULL`
- ✅ `sentimentLabel` 有值（bullish/neutral/bearish）

**可能原因**:
1. AI分析返回的数据结构不完整
2. 数据合并逻辑有问题
3. 字段映射错误

---

## 🔍 核心问题分析

### 问题1: AI分析被禁用（已修复）✅

**位置**: `data-service/services/fetch_service.py:258`

**原因**: 环境变量 `ENABLE_AI_ANALYSIS` 未配置

**修复**: 
```bash
# .env
ENABLE_AI_ANALYSIS=true
```

**验证**: ✅ 日志显示 "开始AI批量分析"

---

### 问题2: 环境变量加载路径错误（已修复）✅

**位置**: `data-service/main.py:13`

**原因**: `load_dotenv()` 从当前目录加载

**修复**:
```python
from pathlib import Path
project_root = Path(__file__).parent.parent
env_path = project_root / '.env'
load_dotenv(env_path)
```

**验证**: ✅ 服务重启后AI分析启动

---

### 问题3: AI返回数据不完整（待修复）⚠️

**现象**: 数据库中的AI处理新闻
```sql
SELECT title, summary, categoryId, impact, sentimentLabel
FROM NewsArticle WHERE aiProcessed = 1 LIMIT 1;

结果:
title: "中东局势加剧！硫磺断供、磷矿资源收紧，磷化工板块再度走强"
summary: "中东局势加剧！硫磺断供、磷矿资源收紧，磷化工板块再度走强"  ← 等于标题
categoryId: NULL  ← 应该有值
impact: NULL  ← 应该有值
sentimentLabel: "bullish"  ← 正常
```

**可能原因**:
1. `ContentAnalyzer` 返回的数据结构缺少某些字段
2. `FetchService._process_with_ai()` 数据合并逻辑有问题
3. AI Prompt 返回的 JSON 格式不正确

**建议排查**:
- 检查 `services/content_analyzer.py` 的返回数据结构
- 检查 AI 返回的原始 JSON 数据
- 验证字段映射逻辑

---

## 📊 完整数据链路

```
┌─────────────────────────────────────────────────────────────┐
│ 1. 调度器 (SchedulerService)                                │
│    - 定时触发（30分钟/60分钟）                              │
│    - 从数据库加载调度任务                                    │
└─────────────────┬───────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. 数据采集 (FetchService.execute_fetch_task)              │
│    - 调用 Provider 获取原始新闻                             │
│    - NewsNowProvider / AKShareProvider                      │
└─────────────────┬───────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. AI分析 (ContentAnalyzer.analyze_news_batch)  ← 已修复  │
│    ✅ ENABLE_AI_ANALYSIS=true 已启用                        │
│    ✅ 批量调用 Claude API                                    │
│    ✅ 返回分析结果                                           │
│    ⚠️  但数据不完整（缺少 summary, categoryId, impact）    │
└─────────────────┬───────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. 数据合并 (FetchService._process_with_ai)                │
│    ⚠️  可能在这里出问题                                      │
│    - 合并 AI 分析结果到原始数据                             │
│    - 标记 aiProcessed=1                                      │
└─────────────────┬───────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. 数据存储 (_store_to_database)                           │
│    ✅ URL 去重检查                                           │
│    ✅ HTTP POST 到 Next.js API                              │
└─────────────────┬───────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. Next.js API (/api/events/batch-save)                    │
│    ✅ Prisma ORM upsert                                      │
│    ✅ 存储到 SQLite                                          │
└─────────────────┬───────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────────────────┐
│ 7. 前端资讯流 (/events/feed)                               │
│    ⚠️  显示的数据不完整                                      │
└─────────────────────────────────────────────────────────────┘
```

**当前状态**: 
- 步骤 1-3 ✅ 正常工作
- 步骤 4 ⚠️ 数据合并可能有问题
- 步骤 5-7 ✅ 正常工作

---

## 🧪 验证测试结果

### 测试1: 服务健康检查 ✅
```bash
curl http://localhost:8000/health
```
**结果**: `status: healthy, scheduler_running: true`

### 测试2: AI分析日志 ✅
```bash
tail -100 /tmp/data-service-final.log | grep "AI"
```
**结果**: 
```
INFO:services.fetch_service:开始AI批量分析: count=20
INFO:services.content_analyzer:Claude API客户端初始化成功
INFO:httpx:HTTP Request: POST https://apiclaude.cc/v1/messages "HTTP/1.1 200 OK"
INFO:services.fetch_service:AI分析完成: processed=20
```

### 测试3: 数据库统计 ⚠️
```bash
sqlite3 prisma/dev.db "SELECT COUNT(*) FROM NewsArticle WHERE aiProcessed=1"
```
**结果**: 128 条（有AI处理的新闻）

但数据质量检查：
```bash
sqlite3 prisma/dev.db "
SELECT COUNT(*) FROM NewsArticle 
WHERE aiProcessed=1 AND summary=title
"
```
**结果**: 128 条（所有AI处理的新闻摘要都等于标题）❌

### 测试4: AI字段完整性 ❌
```sql
SELECT
    SUM(CASE WHEN categoryId IS NOT NULL THEN 1 ELSE 0 END) as has_category,
    SUM(CASE WHEN impact IS NOT NULL THEN 1 ELSE 0 END) as has_impact,
    SUM(CASE WHEN keywords IS NOT NULL THEN 1 ELSE 0 END) as has_keywords,
    COUNT(*) as total
FROM NewsArticle WHERE aiProcessed=1;
```

**结果**: 
- has_category: 0
- has_impact: 0  
- has_keywords: 未测试
- total: 128

---

## 📝 已完成的修复

### 修复清单

1. ✅ **启用AI分析**
   - 文件: `.env`
   - 添加: `ENABLE_AI_ANALYSIS=true`

2. ✅ **修复环境变量加载路径**
   - 文件: `data-service/main.py`
   - 从项目根目录加载 `.env`

3. ✅ **AIAnalyzer支持自定义API端点**
   - 文件: `data-service/workers/ai_analyzer.py`
   - 支持 `ANTHROPIC_BASE_URL`

4. ✅ **AIAnalyzer支持自定义模型**
   - 文件: `data-service/workers/ai_analyzer.py`
   - 支持 `CLAUDE_MODEL`

5. ✅ **服务重启**
   - 使新配置生效

6. ✅ **验证AI分析执行**
   - 日志确认 AI 分析正在工作

---

## ⚠️ 待修复的问题

### 问题: AI返回数据不完整

**优先级**: 高

**症状**:
- `aiProcessed=1` 但数据质量差
- `summary = title`
- `categoryId = NULL`
- `impact = NULL`

**排查建议**:
1. 检查 `services/content_analyzer.py` 返回的数据结构
2. 添加日志输出 AI 返回的原始 JSON
3. 检查 `fetch_service.py` 中的数据合并逻辑
4. 验证 AI Prompt 是否正确

**临时解决方案**:
- 当前AI分析虽然有问题，但至少标记了 `aiProcessed=1`
- 可以先修复数据质量问题，然后重新分析历史数据

---

## 🔧 下一步行动

### 优先级1: 修复AI返回数据问题 🔴

建议步骤:
1. 在 `content_analyzer.py` 添加调试日志，输出AI返回的原始数据
2. 检查返回的 JSON 格式是否符合预期
3. 验证字段映射是否正确
4. 修复后重新运行测试

### 优先级2: 重新分析历史数据 🟡

等AI数据问题修复后:
1. 创建重新分析脚本
2. 批量处理 `aiProcessed=1` 但数据不完整的新闻
3. 验证修复效果

### 优先级3: 部署监控 🟢

1. 部署数据质量监控脚本
2. 设置告警阈值
3. 定期检查AI分析质量

---

## 📊 数据质量指标

### 当前状态

| 指标 | 当前值 | 目标值 | 状态 |
|------|--------|--------|------|
| AI处理率 | 0% (最近1小时) | >90% | ⚠️ |
| 摘要质量 | 0% (摘要≠标题) | >95% | ❌ |
| 分类覆盖率 | 0% | >90% | ❌ |
| 情感标签 | 有值 | 有准确判断 | ⚠️ |
| 影响力评分 | 0% | >80% | ❌ |

### 历史数据统计

- 总新闻数: ~15000+
- AI处理过: 128 条
- AI处理率: <1%
- 数据质量: 差（字段不完整）

---

## 🎯 总结

### 已解决 ✅

1. ✅ AI分析功能已启用
2. ✅ 环境变量加载已修复
3. ✅ AI分析链路正常工作
4. ✅ Claude API调用成功

### 部分解决 ⚠️

1. ⚠️ AI分析虽然执行，但返回数据不完整
2. ⚠️ 数据库中有AI处理的记录，但质量差

### 待解决 ❌

1. ❌ 修复AI返回数据不完整的问题
2. ❌ 重新分析历史数据
3. ❌ 部署数据质量监控

---

## 📄 相关文档

- [新闻管道完整修复方案](./news-pipeline-complete-fix.md)
- [AI API问题排查报告](./ai-api-fix-report.md)
- [数据管道诊断](./data-pipeline-diagnosis.md)
