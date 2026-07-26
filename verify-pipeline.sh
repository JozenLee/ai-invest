#!/bin/bash
# 新闻数据链路完整验证工具
# 用于验证从数据采集到AI分析再到存储的完整链路

set -e

PROJECT_ROOT="/Users/jozen.lee/ai-softwares/ai-invest"
DB_PATH="$PROJECT_ROOT/prisma/dev.db"
LOG_FILE="/tmp/data-service-final.log"

echo "================================================================================"
echo "新闻数据链路完整验证工具"
echo "================================================================================"
echo "执行时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# 1. 检查服务健康状态
echo "1. 检查数据服务健康状态..."
if curl -s --max-time 3 http://localhost:8000/health > /dev/null 2>&1; then
    echo "✅ 数据服务运行正常"
    curl -s http://localhost:8000/health | python3 -m json.tool | grep -E "status|scheduler_running|active_jobs"
else
    echo "❌ 数据服务未响应或未运行"
    echo "   请检查服务是否启动: ps aux | grep main.py"
    exit 1
fi

echo ""
echo "2. 检查AI分析日志..."
if [ -f "$LOG_FILE" ]; then
    echo "最近的AI分析日志:"
    tail -200 "$LOG_FILE" | grep -E "AI批量分析|AI分析完成|AI处理完成|Claude API客户端" | tail -5

    # 检查是否有错误
    ERROR_COUNT=$(tail -200 "$LOG_FILE" | grep -c "ERROR" || true)
    if [ $ERROR_COUNT -gt 0 ]; then
        echo "⚠️  发现 $ERROR_COUNT 个错误，最近的错误:"
        tail -200 "$LOG_FILE" | grep "ERROR" | tail -3
    else
        echo "✅ 未发现错误"
    fi
else
    echo "❌ 日志文件不存在: $LOG_FILE"
fi

echo ""
echo "3. 检查数据库统计..."
cd "$PROJECT_ROOT"

# 最近1小时统计
echo "最近1小时新闻统计:"
sqlite3 "$DB_PATH" "
SELECT
    '总数: ' || COUNT(*) || ' 条' as metric
FROM NewsArticle
WHERE publishTime > datetime('now', '-1 hour')
UNION ALL
SELECT
    'AI已处理: ' || COUNT(*) || ' 条 (' ||
    ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM NewsArticle WHERE publishTime > datetime('now', '-1 hour')), 1) || '%)' as metric
FROM NewsArticle
WHERE publishTime > datetime('now', '-1 hour')
  AND aiProcessed = 1
UNION ALL
SELECT
    '摘要≠标题: ' || COUNT(*) || ' 条' as metric
FROM NewsArticle
WHERE publishTime > datetime('now', '-1 hour')
  AND aiProcessed = 1
  AND summary != title
UNION ALL
SELECT
    '有分类标签: ' || COUNT(*) || ' 条' as metric
FROM NewsArticle
WHERE publishTime > datetime('now', '-1 hour')
  AND aiProcessed = 1
  AND categoryId IS NOT NULL;
"

echo ""
echo "4. 检查最新AI处理的新闻..."
echo "最新3条AI处理的新闻:"
sqlite3 "$DB_PATH" "
SELECT
    '标题: ' || substr(title, 1, 60) as line1,
    '摘要: ' || substr(summary, 1, 50) as line2,
    '分类: ' || COALESCE(categoryId, 'NULL') || ', 情感: ' || COALESCE(sentimentLabel, 'NULL') || ', 影响: ' || COALESCE(CAST(impact AS TEXT), 'NULL') as line3,
    '时间: ' || datetime(aiProcessedAt) as line4,
    '---' as separator
FROM NewsArticle
WHERE aiProcessed = 1
ORDER BY aiProcessedAt DESC
LIMIT 3;
" | sed 's/|/\n  /g'

# 检查是否有AI处理的数据
AI_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM NewsArticle WHERE aiProcessed = 1")

echo ""
echo "================================================================================"
echo "验证结果总结"
echo "================================================================================"

if [ $AI_COUNT -gt 0 ]; then
    echo "✅ AI分析链路正常工作"
    echo "✅ 数据成功存储到数据库"
    echo "✅ AI处理的新闻总数: $AI_COUNT 条"
    echo ""
    echo "数据示例:"
    sqlite3 "$DB_PATH" "
    SELECT
        '  - ' || substr(title, 1, 50) || '...'
    FROM NewsArticle
    WHERE aiProcessed = 1
    ORDER BY aiProcessedAt DESC
    LIMIT 5;
    "
else
    echo "⚠️  数据库中暂无AI处理过的新闻"
    echo ""
    echo "可能原因:"
    echo "  1. AI分析刚启动，还未完成第一批"
    echo "  2. 所有新闻都已存在（URL去重）"
    echo "  3. 存储阶段出现问题"
    echo ""
    echo "建议操作:"
    echo "  1. 等待2-3分钟让AI分析完成"
    echo "  2. 检查日志: tail -100 $LOG_FILE | grep -E 'AI|ERROR'"
    echo "  3. 手动触发采集: curl -X POST http://localhost:8000/api/scheduler/run/scheduler_cmruz2n0y00051bvpfz2m3af4"
fi

echo ""
echo "5. 实用命令..."
echo ""
echo "查看实时日志:"
echo "  tail -f $LOG_FILE"
echo ""
echo "触发财联社新闻采集:"
echo "  curl -X POST http://localhost:8000/api/scheduler/run/scheduler_cmruz2n0y00051bvpfz2m3af4"
echo ""
echo "查询最新新闻:"
echo "  sqlite3 $DB_PATH \"SELECT title, categoryId, aiProcessed FROM NewsArticle ORDER BY publishTime DESC LIMIT 10;\""
echo ""
