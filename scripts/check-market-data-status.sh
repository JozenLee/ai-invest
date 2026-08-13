#!/bin/bash
# 快速检查市场数据状态

echo "=================================================="
echo "           市场数据状态检查"
echo "=================================================="
echo ""

# 1. 检查数据服务
echo "📊 1. 检查数据服务状态..."
if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo "   ✅ 数据服务运行正常"
    curl -s http://localhost:8000/health | grep -o '"status":"[^"]*"' || true
else
    echo "   ❌ 数据服务未运行或无法访问"
    echo "   启动命令: cd data-service && python3 -m uvicorn main:app --port 8000"
fi
echo ""

# 2. 检查数据库数据
echo "📈 2. 检查数据库中的数据..."
cd "$(dirname "$0")/.."

ETF_COUNT=$(sqlite3 prisma/dev.db "SELECT COUNT(*) FROM ETFDaily;" 2>/dev/null || echo "0")
SECTOR_COUNT=$(sqlite3 prisma/dev.db "SELECT COUNT(*) FROM SectorCapitalFlow;" 2>/dev/null || echo "0")
INDEX_COUNT=$(sqlite3 prisma/dev.db "SELECT COUNT(*) FROM IndexDaily;" 2>/dev/null || echo "0")

echo "   ETF数据:        $ETF_COUNT 条"
echo "   板块资金流向:   $SECTOR_COUNT 条"
echo "   指数数据:       $INDEX_COUNT 条"
echo ""

if [ "$ETF_COUNT" -gt 0 ]; then
    echo "   ✅ ETF数据已同步"
else
    echo "   ❌ ETF数据为空，需要同步"
fi

if [ "$SECTOR_COUNT" -gt 0 ]; then
    echo "   ✅ 板块资金流向已同步"
else
    echo "   ⚠️  板块资金流向为空"
fi

if [ "$INDEX_COUNT" -gt 0 ]; then
    echo "   ✅ 指数数据已同步"
else
    echo "   ⚠️  指数数据为空（已知问题）"
fi
echo ""

# 3. 检查最新数据日期
echo "📅 3. 检查数据新鲜度..."
LATEST_ETF=$(sqlite3 prisma/dev.db "SELECT MAX(date) FROM ETFDaily;" 2>/dev/null || echo "无数据")
LATEST_SECTOR=$(sqlite3 prisma/dev.db "SELECT MAX(date) FROM SectorCapitalFlow;" 2>/dev/null || echo "无数据")

echo "   ETF最新日期:           $LATEST_ETF"
echo "   板块资金流最新日期:     $LATEST_SECTOR"
echo ""

TODAY=$(date +%Y-%m-%d)
if [[ "$LATEST_ETF" == *"$TODAY"* ]] || [[ "$LATEST_ETF" == *"$(date -v-1d +%Y-%m-%d)"* ]]; then
    echo "   ✅ 数据较新（今日或昨日）"
else
    echo "   ⚠️  数据可能过期，建议重新同步"
fi
echo ""

# 4. 同步建议
echo "=================================================="
echo "           操作建议"
echo "=================================================="
echo ""

if [ "$ETF_COUNT" -eq 0 ] && [ "$SECTOR_COUNT" -eq 0 ]; then
    echo "❌ 无市场数据，需要立即同步："
    echo "   npx tsx scripts/sync-real-market-data.ts"
elif [ "$ETF_COUNT" -gt 0 ] && [ "$SECTOR_COUNT" -gt 0 ]; then
    echo "✅ 市场数据已就绪"
    echo ""
    echo "设置定时任务（可选）："
    echo "   crontab -e"
    echo "   添加: 0 17 * * 1-5 cd /path/to/ai-invest && npx tsx scripts/sync-real-market-data.ts >> /tmp/market-sync.log 2>&1"
else
    echo "⚠️  数据部分同步，建议重新同步："
    echo "   cd /Users/jozen.lee/ai-softwares/ai-invest"
    echo "   npx tsx scripts/sync-real-market-data.ts"
fi
echo ""

echo "📖 完整文档: docs/MARKET_DATA_SYNC_GUIDE.md"
echo ""
