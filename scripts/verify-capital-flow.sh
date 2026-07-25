#!/bin/bash
# 资金流向数据验证工具
# 验证机构资金和散户资金的计算逻辑

set -e

echo "================================"
echo "资金流向数据验证"
echo "================================"
echo ""

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 1. 获取原始数据
echo -e "${BLUE}[1/4] 获取Python服务原始数据${NC}"
PY_RAW=$(curl -s --max-time 10 http://localhost:8000/api/capital-flow/macro)
if [ $? -ne 0 ]; then
    echo -e "  ${RED}✗${NC} Python服务无响应"
    exit 1
fi

MAIN_NET=$(echo $PY_RAW | jq -r '.data.market.institutionalNet')
MAIN_PCT=$(echo $PY_RAW | jq -r '.data.market.institutionalPct')
RETAIL_NET=$(echo $PY_RAW | jq -r '.data.market.retailNet')
RETAIL_PCT=$(echo $PY_RAW | jq -r '.data.market.retailPct')
TOTAL_NET=$(echo $PY_RAW | jq -r '.data.market.totalNet')
DATA_QUALITY=$(echo $PY_RAW | jq -r '.data.dataQuality')

echo "  机构净流入: ${MAIN_NET}亿元 (${MAIN_PCT}%)"
echo "  散户净流入: ${RETAIL_NET}亿元 (${RETAIL_PCT}%)"
echo "  市场总净流入: ${TOTAL_NET}亿元"
echo "  数据质量: ${DATA_QUALITY}"
echo ""

# 2. 验证数据逻辑
echo -e "${BLUE}[2/4] 验证数据逻辑${NC}"

# 检查是否数值完全相同
if [ "$MAIN_NET" = "$RETAIL_NET" ]; then
    echo -e "  ${RED}✗ 错误${NC}: 机构资金和散户资金数值完全相同 ($MAIN_NET)"
    echo "  这是不正常的，应该是相反数"
elif [ "$(echo "$MAIN_NET + $RETAIL_NET" | bc | sed 's/^-//')" = "0" ] || [ "$(echo "$MAIN_NET + $RETAIL_NET" | bc)" = "0.00" ]; then
    echo -e "  ${GREEN}✓ 正确${NC}: 机构和散户资金是零和关系"
    echo "  主力流出 = 散户流入（符合预期）"
else
    SUM=$(echo "$MAIN_NET + $RETAIL_NET" | bc)
    echo -e "  ${YELLOW}⚠ 警告${NC}: 机构+散户 = ${SUM}亿 (应接近0)"
    echo "  可能是估算数据或数据源不完整"
fi

# 检查占比
if [ "$MAIN_PCT" = "$RETAIL_PCT" ]; then
    echo -e "  ${RED}✗ 错误${NC}: 机构占比和散户占比完全相同 ($MAIN_PCT%)"
    echo "  这是异常的，占比应该相反"
elif [ "$(echo "$MAIN_PCT + $RETAIL_PCT" | bc | sed 's/^-//')" = "0" ] || [ "$(echo "$MAIN_PCT + $RETAIL_PCT" | bc)" = "0.00" ]; then
    echo -e "  ${GREEN}✓ 正确${NC}: 机构和散户占比是零和关系"
else
    PCT_SUM=$(echo "$MAIN_PCT + $RETAIL_PCT" | bc)
    echo -e "  ${YELLOW}⚠ 警告${NC}: 机构占比+散户占比 = ${PCT_SUM}% (应接近0)"
fi
echo ""

# 3. 检查Next.js返回的数据
echo -e "${BLUE}[3/4] 检查Next.js API数据${NC}"
NEXT_DATA=$(curl -s --max-time 10 "http://localhost:3000/api/market/capital-flow?refresh=true")
if [ $? -ne 0 ]; then
    echo -e "  ${RED}✗${NC} Next.js服务无响应"
    exit 1
fi

NEXT_MAIN=$(echo $NEXT_DATA | jq -r '.data.market.institutionalNet')
NEXT_RETAIL=$(echo $NEXT_DATA | jq -r '.data.market.retailNet')

echo "  机构净流入: ${NEXT_MAIN}亿元"
echo "  散户净流入: ${NEXT_RETAIL}亿元"

if [ "$NEXT_MAIN" = "$MAIN_NET" ] && [ "$NEXT_RETAIL" = "$RETAIL_NET" ]; then
    echo -e "  ${GREEN}✓${NC} Next.js数据与Python服务一致"
else
    echo -e "  ${YELLOW}⚠${NC} Next.js数据与Python服务不一致"
    echo "  可能存在缓存问题"
fi
echo ""

# 4. 检查缓存文件
echo -e "${BLUE}[4/4] 检查缓存文件${NC}"
CACHE_FILE="data-service/.cache/market_capital_flow.json"
if [ -f "$CACHE_FILE" ]; then
    CACHE_MAIN=$(jq -r '."主力净流入-净额"' "$CACHE_FILE")
    CACHE_MID=$(jq -r '."中单净流入-净额"' "$CACHE_FILE")
    CACHE_SMALL=$(jq -r '."小单净流入-净额"' "$CACHE_FILE")
    CACHE_SOURCE=$(jq -r '.source' "$CACHE_FILE")
    CACHE_QUALITY=$(jq -r '.dataQuality' "$CACHE_FILE")

    echo "  缓存数据源: ${CACHE_SOURCE}"
    echo "  数据质量: ${CACHE_QUALITY}"
    echo "  主力净流入: $(echo "scale=2; $CACHE_MAIN / 100000000" | bc)亿元"
    echo "  中单净流入: $(echo "scale=2; $CACHE_MID / 100000000" | bc)亿元"
    echo "  小单净流入: $(echo "scale=2; $CACHE_SMALL / 100000000" | bc)亿元"

    CACHE_RETAIL=$(echo "scale=2; ($CACHE_MID + $CACHE_SMALL) / 100000000" | bc)
    echo "  散户合计: ${CACHE_RETAIL}亿元"

    if [ "$CACHE_QUALITY" = "estimated" ]; then
        echo -e "  ${YELLOW}⚠${NC} 当前使用估算数据（可能不够准确）"
        echo "  建议: 检查AKShare API是否可用"
    fi
else
    echo -e "  ${YELLOW}⚠${NC} 缓存文件不存在"
fi
echo ""

# 5. 总结
echo "================================"
echo -e "${BLUE}验证总结${NC}"
echo "================================"
echo ""

if [ "$MAIN_NET" = "$RETAIL_NET" ] && [ "$MAIN_PCT" = "$RETAIL_PCT" ]; then
    echo -e "${RED}发现问题：机构和散户数据完全相同${NC}"
    echo ""
    echo "可能原因："
    echo "  1. 数据计算逻辑错误"
    echo "  2. 数据源返回异常数据"
    echo "  3. 缓存了错误的数据"
    echo ""
    echo "建议操作："
    echo "  1. 清理所有缓存: ./scripts/refresh-market-data.sh"
    echo "  2. 重启Python服务: cd data-service && python3 main.py"
    echo "  3. 检查数据源: 运行 python3 test-capital-flow.py"
elif [ "$DATA_QUALITY" = "estimated" ]; then
    echo -e "${YELLOW}使用估算数据${NC}"
    echo ""
    echo "当前数据是基于行业资金流向估算的，可能与真实值有偏差。"
    echo ""
    echo "建议："
    echo "  检查东方财富API是否可用（可能被代理阻止）"
else
    echo -e "${GREEN}数据验证通过${NC}"
    echo ""
    echo "机构和散户资金数据符合零和博弈规律。"
fi
