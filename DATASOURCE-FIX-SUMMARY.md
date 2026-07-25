# 数据源管理修复总结

**日期**: 2026-07-24  
**执行时间**: 01:42  
**状态**: ✅ 修复完成，部分成功

---

## 修复内容

### 1. 启用调度器数据库同步 ✅

**修改文件**: `data-service/main.py:44-50`

**修改前**:
```python
# 从数据库同步调度任务（临时禁用，避免AI API故障阻塞服务）
# try:
#     sync_stats = await scheduler_service.sync_schedulers_from_database()
# ...
logger.info("数据库调度任务同步已禁用（避免AI API故障阻塞服务）")
```

**修改后**:
```python
# 从数据库同步调度任务（启用 + 错误容错）
try:
    sync_stats = await scheduler_service.sync_schedulers_from_database()
    logger.info(f"✅ 调度任务同步成功: {sync_stats}")
except Exception as e:
    # 记录错误但不阻塞服务启动，确保服务可用性
    logger.error(f"⚠️ 调度任务同步失败，服务继续运行: {e}")
    logger.error(f"可以稍后通过API手动触发采集任务")
```

### 2. 重启Python数据服务 ✅

```bash
# 停止旧服务
pkill -f "python.*main.py"

# 启动新服务
cd data-service
nohup python3 main.py > /tmp/data-service.log 2>&1 &

# 确认服务运行
curl http://localhost:8000/schedulers/health
```

---

## 修复结果

### 调度器状态 ✅

**同步结果**: 
```
loaded: 9个任务
failed: 0个任务
skipped: 11个任务
```

**当前活跃任务**: 10个
- 9个数据源采集任务 (interval: 30分钟)
- 1个每日缓存刷新任务 (cron: 15:30)

**任务列表**:
1. `ds_akshare_caixin` - 财新网 (30分钟)
2. `ds_newsnow_wallstreet` - 华尔街见闻 (30分钟)
3. `ds_newsnow_cailian` - 财联社 (30分钟)
4. `ds_newsnow_thepaper` - 澎湃新闻 (30分钟)
5. `ds_newsnow_36kr` - 36氪 (30分钟)
6. `ds_akshare_ai` - AI资讯 (30分钟)
7-9. (其他数据源)
10. `daily_cache_refresh` - 缓存刷新 (每天15:30)

### 采集任务执行 ✅

**启动时立即触发**: 所有9个数据源任务立即开始执行

**执行日志**:
```
INFO:services.fetch_service:开始采集任务: source_id=ds_newsnow_cailian
INFO:providers.newsnow_provider:[NewsNow] 开始获取新闻: platform=cls-hot, limit=50
INFO:providers.newsnow_provider:[NewsNow] 成功获取 13 条新闻
INFO:services.fetch_service:采集完成: source_id=ds_newsnow_cailian, count=13
```

**采集成功**: ✅ 数据源能够正常获取新闻内容

---

## 遇到的问题

### AI API不可用 ⚠️

**问题描述**: Claude API返回503错误

**错误日志**:
```
ERROR:services.content_analyzer:AI情感分析失败: 
Error code: 503 - {'error': {'message': 'No available accounts: no available accounts', 'type': 'api_error'}}

ERROR:services.content_analyzer:AI分类失败: 
Error code: 503 - {'error': {'message': 'No available accounts: no available accounts', 'type': 'api_error'}}
```

**影响**:
- ❌ 文章无法进行AI分类 (category)
- ❌ 文章无法进行情感分析 (sentiment)
- ❌ 文章无法提取关键词 (keywords)
- ❌ 采集的新闻可能无法保存到数据库（如果代码要求AI处理成功）

**根本原因**: 
- AI API服务端账号不可用
- API配置的代理地址 `https://apiclaude.cc` 可能存在问题

### 新闻数据未更新 ⚠️

**数据库状态**:
```
总数: 55条
最新: 2026-07-21 18:56:08 (3天前)
```

**来源分布**:
```
财联社: 30条
财新网: 10条
东方财富: 4条
界面新闻: 2条
每日经济新闻: 2条
```

**分析**:
- ✅ 调度器已正常运行并触发采集任务
- ✅ 数据源能够成功获取新闻内容
- ❌ 新闻未保存到数据库（AI处理失败导致）

---

## 数据链路状态总结

```
┌─────────────────────────────────────────┐
│ 1. 数据源配置                            │
│ Status: ✅ 10个数据源，全部激活          │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│ 2. 调度任务                              │
│ Status: ✅ 10个任务，全部启用            │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│ 3. Python调度器 (APScheduler)            │
│ Status: ✅ 已同步9个任务，正常调度       │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│ 4. 采集执行                              │
│ Status: ✅ 采集任务正常执行              │
│ Result: 成功获取13条财联社新闻            │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│ 5. AI分析                                │
│ Status: ❌ Claude API 503错误            │
│ Error: No available accounts             │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│ 6. 数据存储                              │
│ Status: ⚠️ 新闻未保存（AI处理失败）      │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│ 7. 前端展示                              │
│ Status: ⚠️ 显示旧数据（3天前）          │
└─────────────────────────────────────────┘
```

---

## 下一步行动

### 紧急修复（必须）

#### 1. 修复AI处理的容错逻辑 🔴

**问题**: 当前AI处理失败会导致整个采集任务失败，新闻无法保存

**解决方案**: 修改 `fetch_service.py`，AI失败时仍保存原始文章

```python
# 伪代码
async def _process_with_ai(self, articles, source_id):
    processed = []
    for article in articles:
        try:
            # 尝试AI分析
            ai_result = await ai_service.analyze(article)
            article.update({
                'sentiment': ai_result.sentiment,
                'category': ai_result.category,
                'keywords': ai_result.keywords,
                'aiProcessed': True
            })
        except Exception as e:
            # AI失败时设置默认值
            logger.warning(f"AI处理失败，保存原始文章: {e}")
            article.update({
                'sentiment': None,
                'category': 'unknown',
                'keywords': [],
                'aiProcessed': False,
                'aiError': str(e)
            })
        processed.append(article)
    return processed
```

#### 2. 检查AI API配置 🔴

**当前配置**: 
```
ANTHROPIC_API_BASE=https://apiclaude.cc
```

**问题排查**:
```bash
# 测试API连接
curl -X POST https://apiclaude.cc/v1/messages \
  -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-3-haiku-20240307","messages":[{"role":"user","content":"test"}],"max_tokens":10}'

# 如果503，尝试官方地址
ANTHROPIC_API_BASE=https://api.anthropic.com
```

**可能原因**:
- 代理服务 `apiclaude.cc` 账号耗尽或不可用
- API密钥已过期或额度不足
- 网络连接问题

### 中期优化（推荐）

#### 3. 实现AI处理队列 🟡

**目标**: 解耦采集和AI处理，提高系统韧性

**架构**:
```
采集任务 → 保存原始文章到DB (aiProcessed=false)
          ↓
        后台AI队列 → 批量处理 → 更新文章AI字段
```

**优势**:
- ✅ 采集不受AI API影响
- ✅ AI失败可以重试
- ✅ 可以调整AI处理优先级

#### 4. 添加监控告警 🟡

**监控指标**:
- 调度器健康检查 (每5分钟)
- 最后采集时间 (超过2小时告警)
- AI处理成功率 (低于80%告警)
- 新闻数据量 (低于阈值告警)

**实现方式**:
```typescript
// src/app/api/health/datasources/route.ts
export async function GET() {
  const dataSources = await prisma.dataSource.findMany()
  const alerts = []
  
  for (const ds of dataSources) {
    if (ds.isActive && ds.lastFetchAt) {
      const hoursSinceLastFetch = 
        (Date.now() - ds.lastFetchAt.getTime()) / 3600000
      
      if (hoursSinceLastFetch > 2) {
        alerts.push({
          level: 'warning',
          source: ds.name,
          message: `${hoursSinceLastFetch.toFixed(1)}小时未采集`
        })
      }
    }
  }
  
  return Response.json({ alerts })
}
```

### 长期改进（建议）

#### 5. 多AI提供商支持 🟢

**目标**: 降低对单一AI API的依赖

**方案**:
- 主用: Claude API
- 备用1: OpenAI API
- 备用2: 本地模型 (Ollama)

#### 6. 增量更新机制 🟢

**目标**: 避免重复采集相同新闻

**方案**:
- 记录每个数据源的最后采集位置
- 基于时间戳或ID增量拉取
- 去重逻辑 (基于URL或title hash)

---

## 验证命令

### 1. 检查调度器健康
```bash
curl http://localhost:8000/schedulers/health | jq '.data | {total_jobs, active_jobs}'
# 期望: total_jobs=10, active_jobs=10
```

### 2. 查看最新采集日志
```bash
curl "http://localhost:3000/api/datasources/logs?limit=10" | jq '.data.items[0] | {sourceName, status, message, createdAt}'
```

### 3. 查看数据库新闻统计
```bash
sqlite3 prisma/dev.db "SELECT COUNT(*) as total, MAX(publishTime) as latest, COUNT(CASE WHEN aiProcessed=1 THEN 1 END) as ai_processed FROM NewsArticle;"
```

### 4. 测试单个数据源采集
```bash
curl -X POST http://localhost:3000/api/datasources/ds_newsnow_cailian/fetch
```

### 5. 监控服务日志
```bash
tail -f /tmp/data-service.log | grep -E "INFO|ERROR|WARNING"
```

---

## 文件清单

### 修改的文件
- ✅ `data-service/main.py` - 启用调度器同步

### 生成的文档
- ✅ `DATASOURCE-ISSUE-DIAGNOSIS.md` - 问题诊断报告
- ✅ `DATASOURCE-FIX-SUMMARY.md` - 本修复总结（当前文件）

### 待修改的文件
- ⏳ `data-service/services/fetch_service.py` - AI容错逻辑
- ⏳ `data-service/services/content_analyzer.py` - AI重试策略
- ⏳ `.env` - API配置检查

---

## 总结

### ✅ 已完成
1. 调度器数据库同步功能已恢复
2. Python数据服务正常运行
3. 9个数据源采集任务已激活并执行
4. 数据采集功能正常（成功获取新闻）

### ⚠️ 部分成功
1. AI API不可用导致文章无法完成分析
2. 新闻数据未更新到数据库
3. 前端资讯流仍显示旧数据

### ❌ 待解决
1. **紧急**: 修复AI处理容错，确保采集的新闻能保存
2. **紧急**: 检查并修复AI API配置
3. **重要**: 实现采集和AI处理解耦
4. **重要**: 添加监控告警机制

### 核心问题根源
之前开发者禁用调度器同步的原因已经暴露：**AI API不稳定会阻塞整个采集流程**。修复的关键是实现容错降级机制，而不是禁用整个调度器。

---

**修复人**: Kiro AI Assistant  
**修复时间**: 2026-07-24 01:42  
**下次检查**: 修复AI API配置后重新验证
