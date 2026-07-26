# 新闻数据链路排查完整总结

**日期**: 2026-07-25 20:20  
**任务**: 排查数据源更新新闻到资讯流的数据链路，验证AI分析是否正常

---

## ✅ 排查结论

### AI分析链路已正常工作

**证据**:
1. ✅ 环境变量 `ENABLE_AI_ANALYSIS=true` 已配置
2. ✅ 环境变量加载路径已修复（从项目根目录加载）
3. ✅ 服务已重启并加载新配置
4. ✅ AI分析已启动执行
5. ✅ Claude API调用成功（大量200 OK响应）

---

## 🔍 发现的问题和修复

### 问题1: AI分析功能被禁用 🔴

**位置**: `data-service/services/fetch_service.py:256`

```python
enable_ai_analysis = os.getenv('ENABLE_AI_ANALYSIS', 'false').lower() == 'true'
```

**原因**: 环境变量 `ENABLE_AI_ANALYSIS` 未配置，默认为 `false`

**影响**: 所有新闻采集后跳过AI分析，导致：
- `aiProcessed = 0`
- `summary = title`（摘要等于标题）
- `categoryId = NULL`
- `sentimentLabel = 'neutral'`
- `keywords = NULL`

**修复**: 在 `.env` 文件添加 `ENABLE_AI_ANALYSIS=true`

---

### 问题2: 环境变量加载路径错误 🟡

**位置**: `data-service/main.py:13`

**原因**: `load_dotenv()` 默认从当前目录加载，找不到项目根目录的 `.env`

**修复**:
```python
from pathlib import Path
project_root = Path(__file__).parent.parent
env_path = project_root / '.env'
load_dotenv(env_path)
```

---

### 问题3: 历史数据未经AI分析 🟡

**现状**: 数据库中约15000+条历史新闻都是 `aiProcessed=0`

**原因**: AI分析功能之前被禁用，历史数据不会自动重新分析

**建议**: 创建重新分析脚本处理历史数据（非紧急）

---

## 📊 当前执行状态

### 日志显示（最新100条）

```bash
tail -100 /tmp/data-service-final.log | grep -E "AI|HTTP Request"
```

**输出**:
```
INFO:services.fetch_service:开始AI批量分析: count=13
INFO:services.content_analyzer:Claude API客户端初始化成功 (base_url: https://apiclaude.cc)
INFO:httpx:HTTP Request: POST https://apiclaude.cc/v1/messages "HTTP/1.1 200 OK"
INFO:httpx:HTTP Request: POST https://apiclaude.cc/v1/messages "HTTP/1.1 200 OK"
... (20+ 次成功调用)
INFO:services.fetch_service:AI分析完成: processed=13
INFO:services.fetch_service:AI处理完成: source_id=ds_newsnow_cailian, processed=13, failed=0
```

**状态**: ✅ AI分析正在正常执行

---

## 🔄 完整数据链路

```
1. 调度器触发 (SchedulerService)
   └─ 每30分钟执行一次

2. 数据源采集 (FetchService)
   └─ NewsNowProvider / AKShareProvider
   └─ 获取原始新闻列表

3. AI分析 (ContentAnalyzer) ← 关键修复点
   └─ 批量调用 Claude API
   └─ 生成摘要、分类、情感、关键词、实体
   └─ 标记 aiProcessed=1

4. 数据存储 (FetchService._store_to_database)
   └─ URL去重检查
   └─ HTTP POST到 Next.js API

5. Next.js API (/api/events/batch-save)
   └─ Prisma ORM
   └─ upsert 到 SQLite

6. 前端资讯流 (/events/feed)
   └─ 显示新闻列表
```

**当前状态**: 第3步AI分析已正常工作 ✅

---

## 🎯 AI分析输出字段

修复后，新采集的新闻应该包含：

| 字段 | 说明 | 示例 |
|------|------|------|
| `summary` | AI生成摘要(30-50字) | "英伟达发布H200 GPU，AI算力提升3倍" |
| `categoryId` | 分类 | product / earnings / tech / partnership |
| `categoryConfidence` | 分类置信度 | 0.85 |
| `sentimentLabel` | 情感标签 | bullish / neutral / bearish |
| `sentiment` | 情感分数 | 0.75 (范围: -1到1) |
| `sentimentConfidence` | 情感置信度 | 0.88 |
| `impact` | 影响力等级 | 5 (范围: 1-5) |
| `keywords` | 关键词数组 | ["H200", "AI算力", "GPU"] |
| `entities` | 实体识别 | companies/products/sectors |
| `domainIds` | 领域标签 | ["ai", "chip"] |
| `sectors` | 板块标签 | ["半导体", "AI应用"] |
| `aiProcessed` | AI处理标记 | 1 |
| `aiProcessedAt` | 处理时间 | 2026-07-25T20:15:30Z |

---

## ⏳ 等待验证的项目

1. **AI分析完整执行** - 当前正在执行中（20+ API调用）
2. **数据正确存储** - 等待存储阶段完成
3. **数据库记录验证** - 检查 `aiProcessed=1` 的新闻
4. **前端显示验证** - 前端是否显示AI分析结果

---

## 📝 验证命令

### 1. 检查AI分析日志

```bash
tail -100 /tmp/data-service-final.log | grep -E "AI批量分析|AI分析完成|AI处理完成"
```

### 2. 检查数据库中AI处理的新闻

```bash
cd /Users/jozen.lee/ai-softwares/ai-invest
sqlite3 prisma/dev.db "
SELECT
    substr(title, 1, 60) as title,
    substr(summary, 1, 50) as summary,
    categoryId,
    sentimentLabel,
    sentiment,
    impact,
    aiProcessed,
    datetime(aiProcessedAt) as aiProcessedAt
FROM NewsArticle
WHERE aiProcessed = 1
ORDER BY aiProcessedAt DESC
LIMIT 5;
"
```

### 3. 统计AI处理率

```bash
sqlite3 prisma/dev.db "
SELECT
    COUNT(*) as total,
    SUM(CASE WHEN aiProcessed = 1 THEN 1 ELSE 0 END) as ai_processed,
    ROUND(100.0 * SUM(CASE WHEN aiProcessed = 1 THEN 1 ELSE 0 END) / COUNT(*), 2) as rate
FROM NewsArticle
WHERE publishTime > datetime('now', '-1 hour');
"
```

---

## 🔧 故障排查

### 如果数据库中仍然没有 `aiProcessed=1` 的记录

**可能原因**:

1. **URL去重** - 所有新闻都已存在，被跳过存储
   ```bash
   tail -100 /tmp/data-service-final.log | grep "文章已存在"
   ```

2. **存储阶段错误** - HTTP POST到Next.js失败
   ```bash
   tail -100 /tmp/data-service-final.log | grep -E "ERROR|存储失败"
   ```

3. **AI分析返回数据格式错误** - 解析失败
   ```bash
   tail -100 /tmp/data-service-final.log | grep -E "解析失败|JSON"
   ```

4. **Next.js服务未运行** - API无法访问
   ```bash
   curl http://localhost:3000/api/events/batch-save
   ```

---

## ✅ 已完成的修复

1. ✅ `.env` 添加 `ENABLE_AI_ANALYSIS=true`
2. ✅ `main.py` 修复环境变量加载路径
3. ✅ `ai_analyzer.py` 支持 `ANTHROPIC_BASE_URL` 和 `CLAUDE_MODEL`
4. ✅ 服务重启并加载新配置
5. ✅ 手动触发采集任务
6. ✅ AI分析开始执行
7. ✅ Claude API调用成功

---

## 📊 预期效果

修复完成后，新采集的每条新闻：

- ✅ 摘要不等于标题，有实际内容提炼
- ✅ 有准确的分类标签（8大类）
- ✅ 有情感判断（不只是默认neutral）
- ✅ 有影响力评分（1-5级）
- ✅ 有3-5个关键词
- ✅ 识别出相关公司、产品、板块
- ✅ 匹配AI/芯片/光通信等领域

---

## 🎉 总结

**核心问题**: AI分析功能被环境变量 `ENABLE_AI_ANALYSIS=false` 禁用

**解决方案**: 
1. 在 `.env` 启用AI分析
2. 修复环境变量加载路径
3. 重启服务

**当前状态**: ✅ AI分析链路已正常工作，正在执行中

**下一步**: 等待当前批次完成（约2-3分钟），然后验证数据库结果
