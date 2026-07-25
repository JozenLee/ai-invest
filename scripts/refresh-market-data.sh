#!/bin/bash
# 市场数据刷新工具
# 清理所有缓存并强制重新获取最新数据

set -e

echo "================================"
echo "市场数据刷新工具"
echo "================================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 1. 清理Next.js内存缓存
echo -e "${BLUE}[1/4] 清理Next.js内存缓存${NC}"
if curl -s --max-time 5 -X POST http://localhost:3000/api/cache/clear > /dev/null 2>&1; then
    RESULT=$(curl -s -X POST http://localhost:3000/api/cache/clear)
    echo -e "  ${GREEN}✓${NC} Next.js缓存已清理"
    echo "  响应: $(echo $RESULT | jq -r '.message // .')"
else
    echo -e "  ${YELLOW}⚠${NC} 无法连接到Next.js服务（可能未运行）"
fi
echo ""

# 2. 清理Python服务内存缓存
echo -e "${BLUE}[2/4] 清理Python服务内存缓存${NC}"
if curl -s --max-time 5 -X POST http://localhost:8000/api/cache/clear > /dev/null 2>&1; then
    RESULT=$(curl -s -X POST http://localhost:8000/api/cache/clear)
    echo -e "  ${GREEN}✓${NC} Python服务缓存已清理"
    echo "  响应: $(echo $RESULT | jq -r '.message // .')"
else
    echo -e "  ${YELLOW}⚠${NC} 无法连接到Python服务（可能未运行）"
fi
echo ""

# 3. 清理本地文件缓存
echo -e "${BLUE}[3/4] 清理本地文件缓存${NC}"
if [ -d ".cache" ]; then
    CACHE_COUNT=$(find .cache -name "*.json" -type f | wc -l | xargs)
    if [ "$CACHE_COUNT" -gt 0 ]; then
        rm -f .cache/*.json
        echo -e "  ${GREEN}✓${NC} 已删除 $CACHE_COUNT 个缓存文件"
    else
        echo "  没有需要清理的缓存文件"
    fi
else
    echo "  缓存目录不存在"
fi
echo ""

# 4. 强制刷新数据
echo -e "${BLUE}[4/4] 强制刷新数据${NC}"
echo "  正在从数据源获取最新数据..."

# 刷新市场概览
if curl -s --max-time 15 "http://localhost:3000/api/market/overview?refresh=true" > /tmp/refresh_overview.json 2>&1; then
    TIMESTAMP=$(jq -r '.data.timestamp // "N/A"' /tmp/refresh_overview.json)
    SOURCE=$(jq -r '.source // "N/A"' /tmp/refresh_overview.json)
    DATA_DATE=$(jq -r '.data.meta.dataDate // "N/A"' /tmp/refresh_overview.json)

    echo -e "  ${GREEN}✓${NC} 市场概览数据已刷新"
    echo "    时间戳: $TIMESTAMP"
    echo "    数据源: $SOURCE"
    echo "    交易日: $DATA_DATE"

    # 显示上证指数样本
    SH_INDEX=$(jq -r '.data.indices[] | select(.code=="sh000001") | "    上证指数: \(.price) (\(.changePct)%)"' /tmp/refresh_overview.json 2>/dev/null)
    if [ ! -z "$SH_INDEX" ]; then
        echo "$SH_INDEX"
    fi
else
    echo -e "  ${YELLOW}⚠${NC} 刷新失败（请检查服务状态）"
fi

# 刷新资金流向
if curl -s --max-time 15 "http://localhost:3000/api/market/capital-flow?refresh=true" > /tmp/refresh_capital.json 2>&1; then
    SUCCESS=$(jq -r '.success // false' /tmp/refresh_capital.json)
    if [ "$SUCCESS" == "true" ]; then
        echo -e "  ${GREEN}✓${NC} 资金流向数据已刷新"
    fi
fi

echo ""
echo "================================"
echo -e "${GREEN}刷新完成${NC}"
echo "================================"
echo ""
echo "建议："
echo "  1. 刷新浏览器页面查看最新数据"
echo "  2. 运行诊断工具确认: ./scripts/diagnose-data-freshness.sh"
echo ""

# 清理临时文件
rm -f /tmp/refresh_overview.json /tmp/refresh_capital.json
