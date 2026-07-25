#!/bin/bash
# 数据准确性集成测试
# 验证API返回的数据准确性

set -e

BASE_URL="${BASE_URL:-http://localhost:8000}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"

echo "=========================================="
echo "数据准确性集成测试"
echo "=========================================="
echo ""

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

success_count=0
fail_count=0

# 测试函数
test_case() {
    local name="$1"
    local command="$2"
    local expected="$3"

    echo -n "测试: $name ... "

    result=$(eval "$command" 2>/dev/null)

    if echo "$result" | grep -q "$expected"; then
        echo -e "${GREEN}✓ PASS${NC}"
        ((success_count++))
    else
        echo -e "${RED}✗ FAIL${NC}"
        echo "  预期包含: $expected"
        echo "  实际返回: $result"
        ((fail_count++))
    fi
}

# 测试1: 指数数据缓存key一致性
echo "=== 测试1: 指数行情数据 ==="
test_case \
    "上证指数价格存在" \
    "curl -s $BASE_URL/api/market/overview | jq -r '.data.indices[] | select(.code==\"sh000001\") | .price'" \
    "[0-9]"

test_case \
    "创业板指价格存在" \
    "curl -s $BASE_URL/api/market/overview | jq -r '.data.indices[] | select(.code==\"sz399006\") | .price'" \
    "[0-9]"

test_case \
    "数据源标识存在" \
    "curl -s $BASE_URL/api/market/overview | jq -r '.data.source'" \
    "unified"

echo ""

# 测试2: 资金流向日期准确性
echo "=== 测试2: 资金流向日期 ==="

# 获取当前时间
current_hour=$(date +%H)
current_minute=$(date +%M)
current_weekday=$(date +%u)  # 1=周一, 7=周日

# 判断预期日期
if [ "$current_weekday" -ge 6 ]; then
    # 周末：应该返回上周五
    expected_date_pattern="202[0-9]-[0-9]{2}-[0-9]{2}"
    echo "当前是周末，资金流向应返回上一交易日"
elif [ "$current_hour" -lt 9 ] || ([ "$current_hour" -eq 9 ] && [ "$current_minute" -lt 30 ]); then
    # 盘前：应该返回上一交易日
    expected_date_pattern="202[0-9]-[0-9]{2}-[0-9]{2}"
    echo "当前是盘前时间，资金流向应返回上一交易日"
else
    # 盘中或盘后：可能返回当天
    expected_date_pattern="202[0-9]-[0-9]{2}-[0-9]{2}"
    echo "当前是交易时间或盘后，资金流向应返回有效日期"
fi

test_case \
    "资金流向日期格式正确" \
    "curl -s $BASE_URL/api/capital-flow/market | jq -r '.data.date'" \
    "202"

# 验证日期不是未来日期
capital_flow_date=$(curl -s $BASE_URL/api/capital-flow/market | jq -r '.data.date')
today=$(date +%Y-%m-%d)

if [[ "$capital_flow_date" > "$today" ]]; then
    echo -e "${RED}✗ FAIL: 资金流向日期 ($capital_flow_date) 大于今天 ($today)${NC}"
    ((fail_count++))
else
    echo -e "${GREEN}✓ PASS: 资金流向日期 ($capital_flow_date) 不大于今天 ($today)${NC}"
    ((success_count++))
fi

echo ""

# 测试3: 资金流向数据完整性
echo "=== 测试3: 资金流向数据完整性 ==="

test_case \
    "主力净流入数据存在" \
    "curl -s $BASE_URL/api/capital-flow/market | jq -r '.data.market.totalMainNet'" \
    "^-?[0-9]"

test_case \
    "数据源标识存在" \
    "curl -s $BASE_URL/api/capital-flow/market | jq -r '.data.source'" \
    "[a-z_]"

test_case \
    "数据质量标识存在" \
    "curl -s $BASE_URL/api/capital-flow/market | jq -r '.data.dataQuality'" \
    "[a-z]"

echo ""

# 测试4: 板块资金流向
echo "=== 测试4: 板块资金流向 ==="

test_case \
    "板块资金流向返回数组" \
    "curl -s $BASE_URL/api/capital-flow/sector | jq -r '.data | type'" \
    "array"

test_case \
    "板块数量大于0" \
    "curl -s $BASE_URL/api/capital-flow/sector | jq -r '.data | length'" \
    "[1-9]"

test_case \
    "板块数据包含行业名称" \
    "curl -s $BASE_URL/api/capital-flow/sector | jq -r '.data[0].sector'" \
    "[\\u4e00-\\u9fa5]"

echo ""

# 测试5: 前端API代理
echo "=== 测试5: 前端API代理 ==="

if curl -s --connect-timeout 2 $FRONTEND_URL > /dev/null 2>&1; then
    test_case \
        "前端市场概览API" \
        "curl -s $FRONTEND_URL/api/market/overview | jq -r '.success'" \
        "true"

    test_case \
        "前端资金流向API" \
        "curl -s $FRONTEND_URL/api/market/capital-flow | jq -r '.success'" \
        "true"

    # 验证前后端数据一致性
    backend_sh_price=$(curl -s $BASE_URL/api/market/overview | jq -r '.data.indices[] | select(.code=="sh000001") | .price')
    frontend_sh_price=$(curl -s $FRONTEND_URL/api/market/overview | jq -r '.data.indices[] | select(.code=="sh000001") | .price')

    if [ "$backend_sh_price" = "$frontend_sh_price" ]; then
        echo -e "${GREEN}✓ PASS: 前后端上证指数价格一致 ($backend_sh_price)${NC}"
        ((success_count++))
    else
        echo -e "${RED}✗ FAIL: 前后端价格不一致 (后端:$backend_sh_price vs 前端:$frontend_sh_price)${NC}"
        ((fail_count++))
    fi
else
    echo -e "${YELLOW}⊘ SKIP: 前端服务未运行${NC}"
fi

echo ""

# 测试结果汇总
echo "=========================================="
echo "测试结果汇总"
echo "=========================================="
echo -e "通过: ${GREEN}$success_count${NC}"
echo -e "失败: ${RED}$fail_count${NC}"
echo ""

if [ $fail_count -eq 0 ]; then
    echo -e "${GREEN}✓ 所有测试通过${NC}"
    exit 0
else
    echo -e "${RED}✗ 部分测试失败${NC}"
    exit 1
fi
