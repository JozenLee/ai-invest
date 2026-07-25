# 数据存储问题排查报告

**日期**: 2026-07-24 02:15  
**状态**: 🔍 排查中

---

## 问题现象

1. ✅ 调度器正常运行，按时触发采集任务
2. ✅ 数据源成功采集新闻（10-20条/次）
3. ✅ AI处理100%成功（processed=10, failed=0）
4. ✅ 执行到"准备持久化数据"步骤
5. ❌ **没有"持久化完成"日志**
6. ❌ 数据库记录数不增加（仍是55条）

---

## 关键发现

### 日志追踪

**正常执行的流程**:
```
INFO:services.fetch_service:采集完成: source_id=ds_akshare_cailian, count=10
INFO:services.fetch_service:开始AI批量分析: count=10
INFO:httpx:HTTP Request: POST https://apiclaude.cc/v1/messages "HTTP/1.1 200 OK"
...
INFO:services.fetch_service:AI分析完成: processed=10
INFO:services.fetch_service:AI处理完成: source_id=ds_akshare_cailian, processed=10, failed=0
INFO:services.fetch_service:🔍 检查领域筛选配置: source_id=ds_akshare_cailian, domain_filter=None
INFO:services.fetch_service:未启用领域筛选: source_id=ds_akshare_cailian, 数据量=10
INFO:services.fetch_service:🔍 准备持久化数据: source_id=ds_akshare_cailian, count=10
```

**中断点**: 在"准备持久化数据"之后，没有任何后续日志

**预期日志**（未出现）:
```
INFO:services.fetch_service:🔍 [存储] 开始持久化: source_id=ds_akshare_cailian, count=10
DEBUG:services.fetch_service:🔍 [存储] 处理第 1/10 条: ...
...
INFO:services.fetch_service:🔍 [存储] 数据持久化完成: source_id=ds_akshare_cailian, stored=X/10
```

### 代码分析

**fetch_service.py:86-87**:
```python
# 5. 持久化到本地数据库
logger.info(f"🔍 准备持久化数据: source_id={source_id}, count={len(processed_data)}")
stored_count = await self._store_to_database(processed_data, source_id)  # ← 卡在这里
logger.info(f"🔍 持久化完成: source_id={source_id}, stored_count={stored_count}")  # ← 从未执行
```

**问题定位**: `_store_to_database()` 方法被调用后：
1. 要么抛出了异常（但没有被 catch 到上层）
2. 要么被异步操作阻塞（await卡住）
3. 要么任务被中途取消（asyncio.CancelledError）

### 数据库日志状态

```sql
SELECT COUNT(*) as log_count, status FROM DataSourceLog GROUP BY status;
```

**结果**:
- `running`: 117条 ⚠️
- `success`: 109条

**分析**: 大量任务状态停留在`running`，说明任务没有正常完成并更新状态。

---

## 可能原因

### 1. 异步任务被取消 🔴

**证据**:
```python
asyncio.exceptions.CancelledError
```

在日志中频繁出现 `CancelledError`，这说明某些异步任务被意外取消了。

**影响**:
- `_store_to_database()` 中的 `await db.insert_news_article()` 可能被取消
- 任务取消后没有正确的异常处理
- 日志状态保持 `running`

### 2. 数据库连接问题 🟡

**代码路径**:
```python
async def _store_to_database():
    for item in data:
        # ...
        result = await db.insert_news_article(article_data)  # ← 可能卡在这里
```

**可能问题**:
- 数据库连接池耗尽
- 事务锁等待
- 连接超时
- SQLite并发写入限制

### 3. 去重检查阻塞 🟡

**代码**:
```python
if article_data["url"]:
    exists = await db.check_article_exists(article_data["url"])  # ← 可能很慢
    if exists:
        continue
```

**可能问题**:
- URL检查的SQL查询很慢
- 没有合适的索引
- 并发查询导致锁等待

### 4. 服务重启导致任务中断 🟢

**观察**: 
- 服务频繁重启
- 端口冲突问题
- 多个Python进程同时运行

**影响**: 任务执行到一半被kill，状态未更新

---

## 已添加的调试代码

### 存储方法增强日志

**位置**: `fetch_service.py:_store_to_database()`

**添加内容**:
```python
logger.info(f"🔍 [存储] 开始持久化: source_id={source_id}, count={len(data)}")

for idx, item in enumerate(data):
    logger.debug(f"🔍 [存储] 处理第 {idx+1}/{len(data)} 条: {item.get('title', '')[:30]}")
    logger.debug(f"🔍 [存储] 检查URL是否存在: {article_data['url']}")
    logger.debug(f"🔍 [存储] 开始插入数据库: id={article_data['id']}")
    logger.debug(f"🔍 [存储] 插入成功: stored_count={stored_count}")
    
logger.info(f"🔍 [存储] 数据持久化完成: source_id={source_id}, stored={stored_count}/{len(data)}")
```

**添加异常详情**:
```python
except Exception as e:
    logger.error(f"🔍 [存储] 插入单条数据失败: {e}")
    import traceback
    logger.error(f"🔍 [存储] 错误堆栈: {traceback.format_exc()}")
```

---

## 当前测试状态

### 服务状态
- **进程**: PID 47611
- **端口**: 8000 (监听中)
- **调度器**: 9个任务正常运行
- **日志文件**: `/tmp/data-service-debug-final.log`

### 正在进行的采集任务
```
ds_akshare_ai: 采集10条 → AI处理中
ds_akshare_caixin: 采集中
ds_newsnow_wallstreet: 采集中
ds_newsnow_cailian: 采集中
ds_newsnow_thepaper: 采集中
ds_newsnow_36kr: 采集中
ds_akshare_chip: 采集中
```

### 预期结果

如果修复成功，应该看到：
1. `🔍 [存储] 开始持久化` 日志
2. `🔍 [存储] 处理第 X/Y 条` 日志
3. `🔍 [存储] 插入成功` 或 `文章已存在` 日志
4. `🔍 [存储] 数据持久化完成` 日志
5. 数据库记录数增加

---

## 下一步操作

### 立即检查 (等待当前任务完成)

```bash
# 1. 监控详细日志
tail -f /tmp/data-service-debug-final.log | grep "🔍.*存储"

# 2. 检查数据库更新
watch -n 5 'sqlite3 prisma/dev.db "SELECT COUNT(*) FROM NewsArticle"'

# 3. 查看完整错误
tail -500 /tmp/data-service-debug-final.log | grep -E "ERROR|Exception|Traceback"
```

### 如果仍无日志

**临时禁用去重逻辑**:
```python
# fetch_service.py:516-520
# 注释掉URL检查
# if article_data["url"]:
#     exists = await db.check_article_exists(article_data["url"])
#     if exists:
#         continue
```

**检查数据库锁**:
```bash
# 查看是否有长时间运行的事务
sqlite3 prisma/dev.db ".timeout 5000"
```

**添加超时控制**:
```python
# 给数据库操作添加超时
async with asyncio.timeout(10):
    result = await db.insert_news_article(article_data)
```

---

## 技术细节

### SQLite并发限制

SQLite默认配置：
- 单写多读模式
- WAL模式可提高并发
- 写操作有数据库级锁

**当前配置检查**:
```sql
PRAGMA journal_mode;  -- 检查是否WAL模式
PRAGMA busy_timeout;  -- 检查超时设置
```

### AsyncIO取消机制

Python的异步任务取消：
- `task.cancel()` 会抛出 `CancelledError`
- 需要在关键位置捕获并处理
- APScheduler在服务重启时会取消所有任务

**建议**: 在`_store_to_database()`外层添加：
```python
try:
    stored_count = await self._store_to_database(processed_data, source_id)
except asyncio.CancelledError:
    logger.warning(f"存储任务被取消: source_id={source_id}")
    raise  # 重新抛出，让上层处理
```

---

## 总结

**核心问题**: `_store_to_database()` 方法被调用后没有任何输出，导致：
- 数据未保存
- 任务状态未更新（停留在running）
- 无错误日志

**最可能原因**: 
1. 异步任务被取消（服务重启/超时）
2. 数据库操作阻塞（锁等待/并发限制）

**验证方法**: 等待当前采集任务完成，观察新添加的调试日志

---

**排查人**: Kiro AI Assistant  
**时间**: 2026-07-24 02:15  
**状态**: 等待调试日志输出
