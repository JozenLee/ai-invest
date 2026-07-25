#!/bin/bash
# 市场数据新鲜度诊断工具
# 检查数据获取流程、缓存状态、时间戳等

set -e

echo "================================"
echo "市场数据新鲜度诊断工具"
echo "================================"
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 1. 检查当前时间
echo -e "${BLUE}[1/8] 系统时间检查${NC}"
CURRENT_TIME=$(date "+%Y-%m-%d %H:%M:%S %A")
echo "  当前时间: $CURRENT_TIME"
echo ""

# 2. 检查Python数据服务状态
echo -e "${BLUE}[2/8] Python数据服务状态${NC}"
if curl -s --max-time 3 http://localhost:8000/health > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} Python服务运行正常"
    HEALTH=$(curl -s http://localhost:8000/health)
    echo "  服务信息: $(echo $HEALTH | jq -r '.version, .scheduler_running, .active_jobs' | xargs)"
else
    echo -e "  ${RED}✗${NC} Python服务未运行或无响应"
    echo "  请运行: cd data-service && python main.py"
fi
echo ""

# 3. 检查Next.js服务状态
echo -e "${BLUE}[3/8] Next.js服务状态${NC}"
if curl -s --max-time 3 http://localhost:3000/api/market/overview > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} Next.js服务运行正常"
else
    echo -e "  ${RED}✗${NC} Next.js服务未运行或无响应"
    echo "  请运行: npm run dev"
fi
echo ""

# 4. 检查Python服务返回的数据时间戳
echo -e "${BLUE}[4/8] Python服务数据时间戳${NC}"
if curl -s --max-time 5 http://localhost:8000/api/market/overview > /tmp/py_data.json 2>&1; then
    PY_TIMESTAMP=$(jq -r '.data.timestamp // "N/A"' /tmp/py_data.json)
    PY_DATA_DATE=$(jq -r '.data.meta.dataDate // "N/A"' /tmp/py_data.json)
    PY_STATUS=$(jq -r '.data.meta.statusText // "N/A"' /tmp/py_data.json)

    echo "  数据时间戳: $PY_TIMESTAMP"
    echo "  交易日期: $PY_DATA_DATE"
    echo "  市场状态: $PY_STATUS"

    # 检查时间戳是否是今天
    TODAY=$(date "+%Y-%m-%d")
    if [[ "$PY_TIMESTAMP" == "$TODAY"* ]]; then
        echo -e "  ${GREEN}✓${NC} 时间戳是今天的数据"
    else
        echo -e "  ${YELLOW}⚠${NC} 时间戳不是今天（可能是缓存数据）"
    fi
else
    echo -e "  ${RED}✗${NC} 无法获取Python服务数据"
fi
echo ""

# 5. 检查Next.js服务返回的数据时间戳
echo -e "${BLUE}[5/8] Next.js服务数据时间戳${NC}"
if curl -s --max-time 5 http://localhost:3000/api/market/overview > /tmp/next_data.json 2>&1; then
    NEXT_TIMESTAMP=$(jq -r '.data.timestamp // "N/A"' /tmp/next_data.json)
    NEXT_SOURCE=$(jq -r '.source // "N/A"' /tmp/next_data.json)

    echo "  数据时间戳: $NEXT_TIMESTAMP"
    echo "  数据源: $NEXT_SOURCE"

    # 检查是否是缓存数据
    if [[ "$NEXT_SOURCE" == *"cached"* ]] || [[ "$NEXT_SOURCE" == *"stale"* ]]; then
        echo -e "  ${YELLOW}⚠${NC} 使用的是缓存数据"
    else
        echo -e "  ${GREEN}✓${NC} 使用的是实时数据"
    fi
else
    echo -e "  ${RED}✗${NC} 无法获取Next.js服务数据"
fi
echo ""

# 6. 检查本地文件缓存
echo -e "${BLUE}[6/8] 本地文件缓存检查${NC}"
CACHE_FILE=".cache/market_overview.json"
if [ -f "$CACHE_FILE" ]; then
    CACHE_TIMESTAMP=$(jq -r '.timestamp // .cachedAt // "N/A"' "$CACHE_FILE")
    CACHE_SIZE=$(ls -lh "$CACHE_FILE" | awk '{print $5}')
    CACHE_MTIME=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "$CACHE_FILE" 2>/dev/null || stat -c "%y" "$CACHE_FILE" 2>/dev/null | cut -d. -f1)

    echo "  缓存文件: $CACHE_FILE"
    echo "  文件大小: $CACHE_SIZE"
    echo "  修改时间: $CACHE_MTIME"
    echo "  数据时间戳: $CACHE_TIMESTAMP"

    # 检查缓存是否太旧（超过1天）
    CACHE_AGE_HOURS=$(echo "($(date +%s) - $(stat -f "%m" "$CACHE_FILE" 2>/dev/null || stat -c "%Y" "$CACHE_FILE")) / 3600" | bc 2>/dev/null || echo "N/A")
    if [ "$CACHE_AGE_HOURS" != "N/A" ]; then
        echo "  缓存年龄: ${CACHE_AGE_HOURS}小时"
        if [ "$CACHE_AGE_HOURS" -gt 24 ]; then
            echo -e "  ${YELLOW}⚠${NC} 缓存已超过24小时"
        else
            echo -e "  ${GREEN}✓${NC} 缓存在有效期内"
        fi
    fi
else
    echo -e "  ${YELLOW}⚠${NC} 缓存文件不存在"
fi
echo ""

# 7. 检查Python服务缓存统计
echo -e "${BLUE}[7/8] Python服务缓存统计${NC}"
if curl -s --max-time 3 http://localhost:8000/api/cache/stats > /dev/null 2>&1; then
    CACHE_STATS=$(curl -s http://localhost:8000/api/cache/stats)
    CACHE_BACKEND=$(echo $CACHE_STATS | jq -r '.data.backend // "N/A"')
    CACHE_HIT_RATE=$(echo $CACHE_STATS | jq -r '.data.hit_rate // "N/A"')
    CACHE_SIZE=$(echo $CACHE_STATS | jq -r '.data.memory_cache_size // "N/A"')

    echo "  缓存后端: $CACHE_BACKEND"
    echo "  命中率: ${CACHE_HIT_RATE}%"
    echo "  缓存条目: $CACHE_SIZE"
else
    echo -e "  ${YELLOW}⚠${NC} 无法获取缓存统计"
fi
echo ""

# 8. 数据样本检查
echo -e "${BLUE}[8/8] 数据样本检查${NC}"
if [ -f /tmp/next_data.json ]; then
    echo "  上证指数数据:"
    jq -r '.data.indices[0] | "    代码: \(.code)\n    名称: \(.name)\n    价格: \(.price)\n    涨跌: \(.change) (\(.changePct)%)\n    数据源: \(.source)"' /tmp/next_data.json 2>/dev/null || echo "    解析失败"
fi
echo ""

# 总结
echo "================================"
echo -e "${BLUE}诊断完成${NC}"
echo "================================"
echo ""
echo "建议操作："
echo "  1. 如果时间戳是旧数据，运行: ./scripts/refresh-market-data.sh"
echo "  2. 如果Python服务未运行，运行: cd data-service && python main.py"
echo "  3. 如果缓存太旧，手动清理: rm -rf .cache/*.json"
echo ""

# 清理临时文件
rm -f /tmp/py_data.json /tmp/next_data.json
