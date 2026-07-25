# KOL监控系统 - 运维监控指南

## 概述

本文档提供KOL（大V）系统的监控指标、日志查询和告警规则，用于日常运维和问题排查。

## 关键指标

### 1. 数据获取指标

#### Influencer Fetch Success Rate（获取成功率）
- **定义**: 成功获取次数 / 总获取次数
- **目标**: > 95%
- **告警阈值**: < 80%
- **数据源**: `InfluencerFetchLog` 表的 `status` 字段
- **影响**: 获取失败会导致数据缺失，影响分析完整性

#### Average Fetch Latency（平均获取耗时）
- **定义**: 单次获取操作的平均耗时
- **目标**: < 5秒
- **告警阈值**: > 10秒
- **数据源**: `InfluencerFetchLog` 表的 `durationMs` 字段
- **影响**: 耗时过长可能导致获取队列积压

#### Posts Per Fetch（每次获取的帖子数）
- **定义**: 每次获取操作返回的平均帖子数
- **正常范围**: 5-50条
- **告警阈值**: 连续3次 < 1条
- **数据源**: `InfluencerFetchLog` 表的 `postsFetched` 字段
- **影响**: 获取数量异常可能表示数据源问题或配置错误

#### New Posts Rate（新帖子比例）
- **定义**: 新保存帖子数 / 总获取帖子数
- **正常范围**: 50-100%
- **数据源**: `InfluencerFetchLog` 表的 `postsNew` / `postsFetched`
- **影响**: 比例过低可能表示重复获取或时间窗口配置不当

### 2. AI分析指标

#### AI Queue Length（AI队列长度）
- **定义**: 等待AI分析的帖子数量
- **正常范围**: < 100
- **告警阈值**: > 500（持续30分钟）
- **数据源**: `InfluencerPost` 表中 `aiProcessed = 0` 的记录数
- **影响**: 队列过长导致分析延迟，影响实时性

#### AI Processing Success Rate（AI处理成功率）
- **定义**: 成功分析数 / 总尝试分析数
- **目标**: > 98%
- **告警阈值**: < 90%
- **数据源**: `InfluencerPost` 表的 `aiProcessed` 和 `aiError` 字段
- **影响**: 失败率高会导致无法获取观点分析

#### Average Analysis Time（平均分析耗时）
- **定义**: 单个帖子AI分析的平均耗时
- **目标**: < 10秒
- **告警阈值**: > 30秒
- **数据源**: 应用日志中的分析耗时记录
- **影响**: 耗时过长降低处理吞吐量

#### AI Worker Utilization（Worker利用率）
- **定义**: 活跃Worker数 / 总Worker数
- **正常范围**: 队列有任务时应接近100%
- **数据源**: 应用日志中的Worker处理记录
- **影响**: 利用率低可能表示Worker配置不足或任务分配问题

### 3. 数据质量指标

#### Duplicate Rate（重复帖子比例）
- **定义**: 被去重跳过的帖子数 / 总获取帖子数
- **正常范围**: < 5%
- **告警阈值**: > 20%
- **数据源**: 应用日志中的 "Skipped duplicate" 记录
- **影响**: 比例过高可能表示去重逻辑异常或时间窗口重叠

#### AI Processed Coverage（AI分析覆盖率）
- **定义**: 已分析帖子数 / 总帖子数
- **目标**: > 90%
- **告警阈值**: < 70%
- **数据源**: `InfluencerPost` 表的 `aiProcessed` 字段
- **影响**: 覆盖率低导致可用观点数据不足

#### Data Freshness（数据新鲜度）
- **定义**: 最新帖子的发布时间距离当前时间
- **正常范围**: < 24小时
- **告警阈值**: > 48小时
- **数据源**: `InfluencerPost` 表的 `publishTime` 字段
- **影响**: 数据不新鲜会降低系统价值

#### Active Influencer Count（活跃大V数量）
- **定义**: 最近24小时内有新帖子的大V数量
- **正常范围**: 根据配置的大V数量
- **告警阈值**: < 50% 配置数量
- **数据源**: `Influencer` 表和 `InfluencerPost` 表
- **影响**: 活跃数过少可能表示获取服务异常

## 日志查询示例

### 查看最近fetch失败记录
```sql
SELECT 
    l.id,
    l.influencerId,
    i.name as influencerName,
    l.platform,
    l.status,
    l.errorMessage,
    l.durationMs,
    l.createdAt
FROM InfluencerFetchLog l
LEFT JOIN Influencer i ON l.influencerId = i.id
WHERE l.status = 'error'
ORDER BY l.createdAt DESC
LIMIT 10;
```

### 统计今日fetch成功率
```sql
SELECT 
    COUNT(*) as total,
    SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
    SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors,
    ROUND(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as success_rate
FROM InfluencerFetchLog
WHERE DATE(createdAt) = DATE('now');
```

### 查看未分析帖子数量
```sql
SELECT COUNT(*) as unprocessed_count
FROM InfluencerPost
WHERE aiProcessed = 0;
```

### 查看AI分析错误统计
```sql
SELECT 
    aiError,
    COUNT(*) as count
FROM InfluencerPost
WHERE aiError IS NOT NULL
GROUP BY aiError
ORDER BY count DESC
LIMIT 10;
```

### 统计各大V的数据量
```sql
SELECT 
    i.name,
    i.platform,
    COUNT(p.id) as total_posts,
    SUM(CASE WHEN p.aiProcessed = 1 THEN 1 ELSE 0 END) as processed_posts,
    ROUND(SUM(CASE WHEN p.aiProcessed = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(p.id), 2) as processed_rate,
    MAX(p.publishTime) as latest_post_time
FROM Influencer i
LEFT JOIN InfluencerPost p ON i.id = p.influencerId
WHERE i.isActive = 1
GROUP BY i.id
ORDER BY total_posts DESC;
```

### 查看平均fetch耗时趋势
```sql
SELECT 
    DATE(createdAt) as date,
    platform,
    COUNT(*) as fetch_count,
    ROUND(AVG(durationMs), 0) as avg_duration_ms,
    ROUND(AVG(postsFetched), 1) as avg_posts_fetched,
    ROUND(AVG(postsNew), 1) as avg_posts_new
FROM InfluencerFetchLog
WHERE createdAt >= datetime('now', '-7 days')
GROUP BY DATE(createdAt), platform
ORDER BY date DESC, platform;
```

### 查看AI分析耗时分布（需从日志提取）
从应用日志中提取分析耗时：
```bash
# 提取最近100条分析完成日志，统计耗时
grep "Analysis completed for post" data-service.log | tail -100 | \
  grep -oP "total \K[0-9.]+(?=s)" | \
  awk '{sum+=$1; count++; if($1>max)max=$1; if(min=="" || $1<min)min=$1} 
       END {print "Count:", count, "Avg:", sum/count, "Min:", min, "Max:", max}'
```

### 查看队列积压情况
```sql
SELECT 
    COUNT(*) as total_unprocessed,
    COUNT(CASE WHEN datetime(createdAt) < datetime('now', '-1 hour') THEN 1 END) as older_than_1h,
    COUNT(CASE WHEN datetime(createdAt) < datetime('now', '-6 hours') THEN 1 END) as older_than_6h,
    COUNT(CASE WHEN datetime(createdAt) < datetime('now', '-24 hours') THEN 1 END) as older_than_24h,
    MIN(createdAt) as oldest_unprocessed
FROM InfluencerPost
WHERE aiProcessed = 0;
```

### 查看重复率统计（从日志）
```bash
# 统计最近100次fetch的重复率
grep "Skipped.*duplicate posts" data-service.log | tail -100 | \
  grep -oP "Skipped \K[0-9]+" | \
  awk '{sum+=$1; count++} END {print "Avg duplicates per fetch:", sum/count}'
```

## 告警规则建议

### 1. 高优先级告警（P1 - 立即响应）

#### Fetch服务完全停止
- **条件**: 60分钟内无任何fetch记录
- **检查**:
  ```sql
  SELECT COUNT(*) FROM InfluencerFetchLog 
  WHERE createdAt >= datetime('now', '-60 minutes');
  ```
- **阈值**: = 0
- **影响**: 数据获取完全中断

#### AI队列严重积压
- **条件**: 队列长度 > 1000 且持续30分钟
- **检查**:
  ```sql
  SELECT COUNT(*) FROM InfluencerPost WHERE aiProcessed = 0;
  ```
- **阈值**: > 1000
- **影响**: AI分析严重延迟

#### Fetch失败率过高
- **条件**: 最近1小时内失败率 > 50%
- **检查**:
  ```sql
  SELECT 
    ROUND(SUM(CASE WHEN status = 'error' THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 2) as error_rate
  FROM InfluencerFetchLog
  WHERE createdAt >= datetime('now', '-60 minutes');
  ```
- **阈值**: > 50%
- **影响**: 大部分数据获取失败

### 2. 中优先级告警（P2 - 工作时间响应）

#### Fetch成功率下降
- **条件**: 最近6小时内成功率 < 80%
- **检查**: 同上查询，时间范围改为 `-6 hours`
- **阈值**: < 80%
- **影响**: 部分数据获取异常

#### AI分析成功率下降
- **条件**: 最近24小时内AI分析失败率 > 10%
- **检查**:
  ```sql
  SELECT 
    COUNT(*) as total,
    SUM(CASE WHEN aiError IS NOT NULL THEN 1 ELSE 0 END) as errors,
    ROUND(SUM(CASE WHEN aiError IS NOT NULL THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 2) as error_rate
  FROM InfluencerPost
  WHERE updatedAt >= datetime('now', '-24 hours')
    AND (aiProcessed = 1 OR aiError IS NOT NULL);
  ```
- **阈值**: error_rate > 10%
- **影响**: AI分析质量下降

#### 数据停滞
- **条件**: 24小时内无新帖子写入
- **检查**:
  ```sql
  SELECT COUNT(*) FROM InfluencerPost 
  WHERE createdAt >= datetime('now', '-24 hours');
  ```
- **阈值**: = 0
- **影响**: 可能获取服务异常或数据源问题

#### AI队列积压
- **条件**: 队列长度 > 500 且持续1小时
- **检查**: 同 P1 队列检查
- **阈值**: > 500
- **影响**: AI分析延迟

### 3. 低优先级告警（P3 - 每日检查）

#### Fetch耗时增加
- **条件**: 平均耗时 > 10秒
- **检查**:
  ```sql
  SELECT AVG(durationMs) as avg_ms 
  FROM InfluencerFetchLog 
  WHERE createdAt >= datetime('now', '-6 hours');
  ```
- **阈值**: > 10000ms
- **影响**: 获取效率下降

#### 重复率异常
- **条件**: 新帖子比例 < 30%
- **检查**:
  ```sql
  SELECT 
    SUM(postsNew) as new_posts,
    SUM(postsFetched) as total_fetched,
    ROUND(SUM(postsNew) * 100.0 / NULLIF(SUM(postsFetched), 0), 2) as new_rate
  FROM InfluencerFetchLog
  WHERE createdAt >= datetime('now', '-24 hours');
  ```
- **阈值**: < 30%
- **影响**: 可能配置不当或去重问题

#### AI分析覆盖率低
- **条件**: 7天以上旧帖子未分析比例 > 10%
- **检查**:
  ```sql
  SELECT 
    COUNT(*) as old_posts,
    SUM(CASE WHEN aiProcessed = 0 THEN 1 ELSE 0 END) as unprocessed,
    ROUND(SUM(CASE WHEN aiProcessed = 0 THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 2) as unprocessed_rate
  FROM InfluencerPost
  WHERE createdAt < datetime('now', '-7 days');
  ```
- **阈值**: unprocessed_rate > 10%
- **影响**: 历史数据未完整分析

## 日志级别说明

系统使用标准Python logging级别：

### DEBUG
- 详细的调试信息
- 去重跳过的具体帖子
- 队列大小变化
- 数据库操作详情

**用途**: 问题深度排查

### INFO
- 正常操作日志
- Fetch开始/完成
- AI分析开始/完成
- Worker处理统计
- 批量操作结果

**用途**: 日常监控、性能分析

### WARNING
- 可恢复的异常情况
- API调用超时
- 重试操作
- 配置缺失但有默认值

**用途**: 关注潜在问题

### ERROR
- 操作失败
- Fetch失败
- AI分析失败
- 数据库错误
- Worker异常

**用途**: 告警、问题排查

## 日志分析脚本示例

### 实时监控队列长度
```bash
#!/bin/bash
# monitor-queue.sh
while true; do
    queue_size=$(sqlite3 data/dev.db "SELECT COUNT(*) FROM InfluencerPost WHERE aiProcessed = 0;")
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "$timestamp - Queue size: $queue_size"
    
    if [ $queue_size -gt 500 ]; then
        echo "WARNING: Queue size exceeds 500!"
    fi
    
    sleep 60
done
```

### 分析fetch性能趋势
```bash
#!/bin/bash
# analyze-fetch-performance.sh
echo "Fetch Performance Analysis (Last 24h)"
echo "======================================"

sqlite3 -header -column data/dev.db <<EOF
SELECT 
    CASE 
        WHEN createdAt >= datetime('now', '-1 hours') THEN 'Last 1h'
        WHEN createdAt >= datetime('now', '-6 hours') THEN 'Last 6h'
        WHEN createdAt >= datetime('now', '-24 hours') THEN 'Last 24h'
    END as timerange,
    COUNT(*) as fetches,
    ROUND(AVG(durationMs)/1000.0, 2) as avg_seconds,
    ROUND(AVG(postsFetched), 1) as avg_posts,
    ROUND(SUM(CASE WHEN status='success' THEN 1.0 ELSE 0 END)/COUNT(*)*100, 1) as success_rate
FROM InfluencerFetchLog
WHERE createdAt >= datetime('now', '-24 hours')
GROUP BY timerange
ORDER BY timerange;
EOF
```

### 检查AI分析健康度
```bash
#!/bin/bash
# check-ai-health.sh
echo "AI Analysis Health Check"
echo "========================"

# 队列长度
queue=$(sqlite3 data/dev.db "SELECT COUNT(*) FROM InfluencerPost WHERE aiProcessed = 0;")
echo "Queue length: $queue"

# 24小时内分析统计
sqlite3 -header -column data/dev.db <<EOF
SELECT 
    COUNT(*) as total_attempts,
    SUM(CASE WHEN aiProcessed = 1 THEN 1 ELSE 0 END) as successful,
    SUM(CASE WHEN aiError IS NOT NULL THEN 1 ELSE 0 END) as failed,
    ROUND(SUM(CASE WHEN aiProcessed = 1 THEN 1.0 ELSE 0 END)/COUNT(*)*100, 1) as success_rate
FROM InfluencerPost
WHERE updatedAt >= datetime('now', '-24 hours')
    AND (aiProcessed = 1 OR aiError IS NOT NULL);
EOF

# 最老未处理帖子
echo ""
echo "Oldest unprocessed post:"
sqlite3 data/dev.db "SELECT createdAt FROM InfluencerPost WHERE aiProcessed = 0 ORDER BY createdAt LIMIT 1;"
```

## 健康检查端点（建议实现）

建议在FastAPI中添加 `/health/influencer` 端点：

```python
@router.get("/health/influencer")
async def influencer_health_check(db: Database = Depends(get_db)):
    """
    KOL系统健康检查端点
    
    返回:
    - status: healthy/degraded/unhealthy
    - fetch_service: 获取服务状态
    - ai_queue_length: AI队列长度
    - unprocessed_posts: 未处理帖子数
    - last_fetch_time: 最后获取时间
    - metrics: 关键指标
    """
    
    async with db.get_connection() as conn:
        # 队列长度
        cursor = await conn.execute(
            "SELECT COUNT(*) FROM InfluencerPost WHERE aiProcessed = 0"
        )
        queue_length = (await cursor.fetchone())[0]
        
        # 最后fetch时间
        cursor = await conn.execute(
            "SELECT MAX(createdAt) FROM InfluencerFetchLog"
        )
        last_fetch = (await cursor.fetchone())[0]
        
        # 最近1小时成功率
        cursor = await conn.execute("""
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success
            FROM InfluencerFetchLog
            WHERE createdAt >= datetime('now', '-60 minutes')
        """)
        row = await cursor.fetchone()
        fetch_total = row[0]
        fetch_success = row[1]
        fetch_rate = (fetch_success / fetch_total * 100) if fetch_total > 0 else 100
        
        # 判断健康状态
        status = "healthy"
        if queue_length > 500 or fetch_rate < 80:
            status = "degraded"
        if queue_length > 1000 or fetch_rate < 50:
            status = "unhealthy"
        
        return {
            "status": status,
            "fetch_service": "ok" if fetch_rate >= 80 else "degraded",
            "ai_queue_length": queue_length,
            "unprocessed_posts": queue_length,
            "last_fetch_time": last_fetch,
            "metrics": {
                "fetch_success_rate_1h": round(fetch_rate, 1),
                "queue_threshold": 500,
                "queue_critical": 1000
            }
        }
```

## 故障排查流程

### 问题: Fetch失败率高

1. 检查最近错误日志
   ```bash
   grep "Fetch failed" data-service.log | tail -20
   ```

2. 查看错误类型分布
   ```sql
   SELECT errorMessage, COUNT(*) as count
   FROM InfluencerFetchLog
   WHERE status = 'error' AND createdAt >= datetime('now', '-24 hours')
   GROUP BY errorMessage;
   ```

3. 可能原因:
   - API限流: 检查provider配置，调整请求间隔
   - 网络问题: 检查网络连接，考虑重试机制
   - 认证失败: 检查credentials配置
   - 数据源变更: 检查provider实现是否需要更新

### 问题: AI队列积压

1. 检查队列长度和积压时间
   ```sql
   SELECT 
       COUNT(*) as total,
       MIN(createdAt) as oldest,
       ROUND((julianday('now') - julianday(MIN(createdAt))) * 24, 1) as hours_old
   FROM InfluencerPost WHERE aiProcessed = 0;
   ```

2. 检查Worker状态
   ```bash
   grep "Worker.*started\|stopped" data-service.log | tail -10
   ```

3. 检查AI处理成功率
   ```bash
   grep "Analysis completed\|Analysis.*failed" data-service.log | tail -50
   ```

4. 可能原因:
   - Worker数量不足: 增加worker_count配置
   - API调用超时频繁: 检查网络或增加超时时间
   - AI分析失败率高: 检查prompt或模型配置
   - 队列服务未启动: 检查服务状态

### 问题: 数据停滞无新帖子

1. 检查是否有due influencers
   ```sql
   SELECT * FROM Influencer
   WHERE isActive = 1
   AND (lastFetchAt IS NULL OR 
        datetime(lastFetchAt, '+' || fetchInterval || ' minutes') <= datetime('now'));
   ```

2. 检查定时任务是否运行
   ```bash
   grep "Starting batch fetch" data-service.log | tail -5
   ```

3. 可能原因:
   - 定时任务未启动: 检查cron或scheduler配置
   - 所有influencer都不due: 检查fetchInterval配置
   - Fetch服务异常: 检查服务日志和状态
   - 数据源无新内容: 正常情况，等待新内容

## 性能优化建议

### 1. Fetch性能优化
- 合理配置fetchInterval，避免频繁获取
- 使用并发fetch（但注意API限流）
- 优化deduplication查询（添加索引）

### 2. AI分析性能优化
- 调整worker数量匹配负载
- 使用批量发布减少队列操作开销
- 考虑按优先级处理（高影响力大V优先）

### 3. 数据库性能优化
推荐索引：
```sql
CREATE INDEX idx_influencer_post_ai_processed 
ON InfluencerPost(aiProcessed, createdAt);

CREATE INDEX idx_influencer_fetch_log_created 
ON InfluencerFetchLog(createdAt, status);

CREATE INDEX idx_influencer_active_fetch 
ON Influencer(isActive, lastFetchAt);
```

## 总结

定期检查清单：
- [ ] 每小时: 检查队列长度
- [ ] 每天: 查看fetch成功率和AI分析覆盖率
- [ ] 每周: 分析性能趋势，优化配置
- [ ] 每月: 审查告警规则，调整阈值

关键成功指标：
- Fetch成功率 > 95%
- AI分析覆盖率 > 90%
- 队列长度 < 100
- 数据新鲜度 < 24h
