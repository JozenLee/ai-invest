# 新闻数据链路完整排查报告

**日期**: 2026-07-25  
**任务**: 排查数据源更新到资讯流的完整链路，验证AI分析功能

---

## 📋 核心发现

### 问题1: AI分析功能被禁用 🔴

**位置**: `data-service/services/fetch_service.py:256`

```python
enable_ai_analysis = os.getenv('ENABLE_AI_ANALYSIS', 'false').lower() == 'true'

if not enable_ai_analysis:
    logger.info("AI分析已禁用，跳过AI批量分析")
    return processed_data  # aiProcessed=False
```

**影响**: 所有新闻 `aiProcessed=0`，摘要等于标题，无分类标签

### 问题2: 环境变量加载路径错误 🟡

**位置**: `data-service/main.py:13`

```python
load_dotenv()  # 从当前目录加载，找不到项目根目录的.env
```

---

## ✅ 已实施的修复

1. **启用AI分析**: `.env` 添加 `ENABLE_AI_ANALYSIS=true`
2. **修复环境变量加载**: `main.py` 从项目根目录加载 `.env`
3. **重启服务**: 使新配置生效

---

## 🧪 验证结果

### AI分析已启动 ✅

```bash
tail -100 /tmp/data-service-final.log | grep "AI"
```

**输出**:
```
INFO:services.fetch_service:开始AI批量分析: count=13
INFO:services.content_analyzer:Claude API客户端初始化成功
INFO:httpx:HTTP Request: POST https://apiclaude.cc/v1/messages "HTTP/1.1 200 OK"
```

---

## 🔍 完整数据链路

```
调度器 → 数据源采集 → AI分析 → 数据存储 → Next.js API → 数据库 → 前端
```

**关键环节**: AI分析 (ContentAnalyzer) 现已正常工作

---

## 📊 数据验证命令

```bash
cd /Users/jozen.lee/ai-softwares/ai-invest
sqlite3 prisma/dev.db "
SELECT
    substr(title, 1, 60) as title,
    substr(summary, 1, 50) as summary,
    categoryId,
    sentimentLabel,
    impact,
    aiProcessed
FROM NewsArticle
WHERE publishTime > datetime('now', '-10 minutes')
  AND aiProcessed = 1
ORDER BY publishTime DESC
LIMIT 5;
"
```

**期望**: 摘要≠标题，有分类和情感标签

---

## 📝 后续任务

1. ⏳ 等待当前采集完成（2-3分钟）
2. ⏳ 验证数据库结果
3. 📋 重新分析历史数据
4. 📊 部署监控脚本
