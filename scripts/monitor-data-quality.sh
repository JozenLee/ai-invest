#!/bin/bash
# 新闻数据质量实时监控脚本
# 每30秒刷新一次，显示数据质量指标

PROJECT_ROOT="/Users/jozen.lee/ai-softwares/ai-invest"
DB_PATH="$PROJECT_ROOT/prisma/dev.db"

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 清屏
clear

echo "================================================================================"
echo "                       新闻数据质量实时监控"
echo "================================================================================"
echo ""

while true; do
    # 移动光标到顶部
    tput cup 4 0

    echo "刷新时间: $(date '+%Y-%m-%d %H:%M:%S')"
    echo ""

    # 1. 最近1小时统计
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "【最近1小时】"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    sqlite3 "$DB_PATH" <<SQL
.mode column
.headers on
SELECT
    COUNT(*) as '总数',
    SUM(CASE WHEN aiProcessed = 1 THEN 1 ELSE 0 END) as 'AI已处理',
    ROUND(100.0 * SUM(CASE WHEN aiProcessed = 1 THEN 1 ELSE 0 END) / COUNT(*), 1) || '%' as '处理率',
    SUM(CASE WHEN aiProcessed = 1 AND summary != title THEN 1 ELSE 0 END) as '摘要质量',
    SUM(CASE WHEN category IS NOT NULL THEN 1 ELSE 0 END) as '有分类',
    SUM(CASE WHEN impact IS NOT NULL THEN 1 ELSE 0 END) as '有影响力'
FROM NewsArticle
WHERE publishTime > datetime('now', '-1 hour');
SQL

    echo ""

    # 2. 最近5条AI处理的新闻
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "【最新5条AI处理的新闻】"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    sqlite3 "$DB_PATH" <<SQL
.mode column
.width 40 10 10 8
.headers on
SELECT
    substr(title, 1, 40) as '标题',
    category as '分类',
    sentimentLabel as '情感',
    impact as '影响力'
FROM NewsArticle
WHERE aiProcessed = 1
ORDER BY aiProcessedAt DESC
LIMIT 5;
SQL

    echo ""

    # 3. 数据质量告警
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "【数据质量告警】"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # 检查AI处理率
    AI_RATE=$(sqlite3 "$DB_PATH" "
        SELECT ROUND(100.0 * SUM(CASE WHEN aiProcessed = 1 THEN 1 ELSE 0 END) / COUNT(*), 1)
        FROM NewsArticle
        WHERE publishTime > datetime('now', '-1 hour');
    ")

    if [ -z "$AI_RATE" ]; then
        AI_RATE=0
    fi

    if (( $(echo "$AI_RATE < 80" | bc -l) )); then
        echo -e "${RED}⚠️  AI处理率过低: ${AI_RATE}% (目标: >80%)${NC}"
    else
        echo -e "${GREEN}✅ AI处理率正常: ${AI_RATE}%${NC}"
    fi

    # 检查摘要质量
    SUMMARY_RATE=$(sqlite3 "$DB_PATH" "
        SELECT ROUND(100.0 * SUM(CASE WHEN summary != title THEN 1 ELSE 0 END) / COUNT(*), 1)
        FROM NewsArticle
        WHERE publishTime > datetime('now', '-1 hour') AND aiProcessed = 1;
    ")

    if [ -z "$SUMMARY_RATE" ]; then
        SUMMARY_RATE=0
    fi

    if (( $(echo "$SUMMARY_RATE < 90" | bc -l) )); then
        echo -e "${RED}⚠️  摘要质量过低: ${SUMMARY_RATE}% (目标: >90%)${NC}"
    else
        echo -e "${GREEN}✅ 摘要质量正常: ${SUMMARY_RATE}%${NC}"
    fi

    # 检查分类覆盖率
    CATEGORY_RATE=$(sqlite3 "$DB_PATH" "
        SELECT ROUND(100.0 * SUM(CASE WHEN category IS NOT NULL THEN 1 ELSE 0 END) / COUNT(*), 1)
        FROM NewsArticle
        WHERE publishTime > datetime('now', '-1 hour') AND aiProcessed = 1;
    ")

    if [ -z "$CATEGORY_RATE" ]; then
        CATEGORY_RATE=0
    fi

    if (( $(echo "$CATEGORY_RATE < 90" | bc -l) )); then
        echo -e "${RED}⚠️  分类覆盖率过低: ${CATEGORY_RATE}% (目标: >90%)${NC}"
    else
        echo -e "${GREEN}✅ 分类覆盖率正常: ${CATEGORY_RATE}%${NC}"
    fi

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "按 Ctrl+C 退出监控"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # 等待30秒
    sleep 30
done
