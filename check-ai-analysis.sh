#!/bin/bash
# 监控AI分析执行情况

echo "等待30秒让任务执行..."
for i in {1..30}; do
    sleep 1
    echo -n "."
done
echo ""

echo ""
echo "=== 检查AI分析日志 ==="
tail -100 /tmp/data-service-new.log | grep -E "AI分析|AI批量|AI处理|ENABLE_AI|开始采集"

echo ""
echo "=== 检查最近5分钟新增的新闻 ==="
cd /Users/jozen.lee/ai-softwares/ai-invest
sqlite3 prisma/dev.db "
SELECT
    id,
    substr(title, 1, 50) as title,
    substr(summary, 1, 40) as summary,
    categoryId,
    sentimentLabel,
    impact,
    aiProcessed,
    datetime(publishTime) as pubTime
FROM NewsArticle
WHERE publishTime > datetime('now', '-5 minutes')
ORDER BY publishTime DESC
LIMIT 5;
"

echo ""
echo "=== AI处理统计 ==="
sqlite3 prisma/dev.db "
SELECT
    COUNT(*) as total,
    SUM(CASE WHEN aiProcessed = 1 THEN 1 ELSE 0 END) as ai_processed,
    SUM(CASE WHEN aiProcessed = 0 THEN 1 ELSE 0 END) as not_processed
FROM NewsArticle
WHERE publishTime > datetime('now', '-5 minutes');
"
