#!/bin/bash
# 市场数据验证工具 - 验证数据准确性

set -e

echo "================================"
echo "市场数据准确性验证"
echo "================================"
echo ""

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 1. 从AKShare直接获取数据作为基准
echo -e "${BLUE}[1/4] 获取AKShare基准数据${NC}"
AKSHARE_DATA=$(python3 << 'EOF'
import akshare as ak
import json

try:
    df = ak.stock_zh_index_spot_sina()
    sh_index = df[df['代码'].str.contains('000001')].iloc[0]
    sz_index = df[df['代码'].str.contains('399001')].iloc[0]

    result = {
        "sh000001": {
            "price": float(sh_index['最新价']),
            "change": float(sh_index['涨跌额']),
            "changePct": float(sh_index['涨跌幅'])
        },
        "sz399001": {
            "price": float(sz_index['最新价']),
            "change": float(sz_index['涨跌额']),
            "changePct": float(sz_index['涨跌幅'])
        }
    }
    print(json.dumps(result))
except Exception as e:
    print(json.dumps({"error": str(e)}))
EOF
)

if echo "$AKSHARE_DATA" | jq -e '.error' > /dev/null 2>&1; then
    echo -e "  ${RED}✗${NC} AKShare数据获取失败"
    exit 1
fi

SH_PRICE_AKSHARE=$(echo $AKSHARE_DATA | jq -r '.sh000001.price')
SZ_PRICE_AKSHARE=$(echo $AKSHARE_DATA | jq -r '.sz399001.price')

echo "  上证指数 (AKShare): $SH_PRICE_AKSHARE"
echo "  深证成指 (AKShare): $SZ_PRICE_AKSHARE"
echo ""

# 2. 检查Python数据服务
echo -e "${BLUE}[2/4] 检查Python数据服务${NC}"
PY_DATA=$(curl -s --max-time 10 http://localhost:8000/api/market/overview)
if [ $? -ne 0 ]; then
    echo -e "  ${RED}✗${NC} Python服务无响应"
    exit 1
fi

SH_PRICE_PY=$(echo $PY_DATA | jq -r '.data.indices[] | select(.code=="sh000001") | .price')
SZ_PRICE_PY=$(echo $PY_DATA | jq -r '.data.indices[] | select(.code=="sz399001") | .price')

echo "  上证指数 (Python): $SH_PRICE_PY"
echo "  深证成指 (Python): $SZ_PRICE_PY"

# 比较差异
SH_DIFF=$(echo "scale=2; ($SH_PRICE_PY - $SH_PRICE_AKSHARE) * 100 / $SH_PRICE_AKSHARE" | bc 2>/dev/null || echo "0")
SZ_DIFF=$(echo "scale=2; ($SZ_PRICE_PY - $SZ_PRICE_AKSHARE) * 100 / $SZ_PRICE_AKSHARE" | bc 2>/dev/null || echo "0")

if [ "${SH_DIFF#-}" = "0.00" ] || [ "${SH_DIFF}" = "0" ]; then
    echo -e "  ${GREEN}✓${NC} 上证指数数据一致"
else
    echo -e "  ${YELLOW}⚠${NC} 上证指数差异: ${SH_DIFF}%"
fi

if [ "${SZ_DIFF#-}" = "0.00" ] || [ "${SZ_DIFF}" = "0" ]; then
    echo -e "  ${GREEN}✓${NC} 深证成指数据一致"
else
    echo -e "  ${YELLOW}⚠${NC} 深证成指差异: ${SZ_DIFF}%"
fi
echo ""

# 3. 检查Next.js服务
echo -e "${BLUE}[3/4] 检查Next.js服务${NC}"
NEXT_DATA=$(curl -s --max-time 10 "http://localhost:3000/api/market/overview?refresh=true")
if [ $? -ne 0 ]; then
    echo -e "  ${RED}✗${NC} Next.js服务无响应"
    exit 1
fi

SH_PRICE_NEXT=$(echo $NEXT_DATA | jq -r '.data.indices[] | select(.code=="sh000001") | .price')
SZ_PRICE_NEXT=$(echo $NEXT_DATA | jq -r '.data.indices[] | select(.code=="sz399001") | .price')

echo "  上证指数 (Next.js): $SH_PRICE_NEXT"
echo "  深证成指 (Next.js): $SZ_PRICE_NEXT"

# 比较差异
SH_DIFF_NEXT=$(echo "scale=2; ($SH_PRICE_NEXT - $SH_PRICE_AKSHARE) * 100 / $SH_PRICE_AKSHARE" | bc 2>/dev/null || echo "0")
SZ_DIFF_NEXT=$(echo "scale=2; ($SZ_PRICE_NEXT - $SZ_PRICE_AKSHARE) * 100 / $SZ_PRICE_AKSHARE" | bc 2>/dev/null || echo "0")

if [ "${SH_DIFF_NEXT#-}" = "0.00" ] || [ "${SH_DIFF_NEXT}" = "0" ]; then
    echo -e "  ${GREEN}✓${NC} 上证指数数据一致"
else
    echo -e "  ${YELLOW}⚠${NC} 上证指数差异: ${SH_DIFF_NEXT}%"
fi

if [ "${SZ_DIFF_NEXT#-}" = "0.00" ] || [ "${SZ_DIFF_NEXT}" = "0" ]; then
    echo -e "  ${GREEN}✓${NC} 深证成指数据一致"
else
    echo -e "  ${YELLOW}⚠${NC} 深证成指差异: ${SZ_DIFF_NEXT}%"
fi
echo ""

# 4. 汇总报告
echo -e "${BLUE}[4/4] 验证汇总${NC}"
echo "数据源对比："
echo "┌─────────────┬──────────┬──────────┬────────┐"
echo "│   指数      │  AKShare │  Python  │ Next.js│"
echo "├─────────────┼──────────┼──────────┼────────┤"
printf "│ 上证指数    │ %8.2f │ %8.2f │ %7.2f│\n" $SH_PRICE_AKSHARE $SH_PRICE_PY $SH_PRICE_NEXT
printf "│ 深证成指    │ %8.2f │ %8.2f │ %7.2f│\n" $SZ_PRICE_AKSHARE $SZ_PRICE_PY $SZ_PRICE_NEXT
echo "└─────────────┴──────────┴──────────┴────────┘"
echo ""

echo "================================"
echo -e "${GREEN}验证完成${NC}"
echo "================================"
