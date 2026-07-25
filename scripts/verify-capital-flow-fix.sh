#!/bin/bash
# 资金流向数据修复验证脚本
# 测试所有API接口和数据质量

set -e

echo "======================================"
echo "  资金流向数据修复 - 部署验证"
echo "======================================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 计数器
PASS=0
FAIL=0

# 测试函数
test_api() {
    local name=$1
    local url=$2
    local expected_field=$3

    echo -n "测试 ${name}... "

    response=$(curl -s "${url}")

    if echo "${response}" | grep -q "\"success\":true"; then
        if [ -n "${expected_field}" ]; then
            if echo "${response}" | grep -q "${expected_field}"; then
                echo -e "${GREEN}✓ 通过${NC}"
                PASS=$((PASS + 1))
                return 0
            else
                echo -e "${RED}✗ 失败 (缺少字段: ${expected_field})${NC}"
                FAIL=$((FAIL + 1))
                return 1
            fi
        else
            echo -e "${GREEN}✓ 通过${NC}"
            PASS=$((PASS + 1))
            return 0
        fi
    else
        echo -e "${RED}✗ 失败${NC}"
        echo "响应: ${response}" | head -3
        FAIL=$((FAIL + 1))
        return 1
    fi
}

# 检查服务状态
echo "1. 检查服务状态"
echo "----------------------------------------"

if lsof -ti:8000 > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Python数据服务运行中 (端口8000)${NC}"
    PASS=$((PASS + 1))
else
    echo -e "${RED}✗ Python数据服务未运行${NC}"
    FAIL=$((FAIL + 1))
    echo "请先启动数据服务: cd data-service && python main.py"
    exit 1
fi

if lsof -ti:3000 > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Next.js应用运行中 (端口3000)${NC}"
    PASS=$((PASS + 1))
else
    echo -e "${YELLOW}⚠ Next.js应用未运行 (端口3000)${NC}"
    echo "  提示: npm run dev"
fi

echo ""

# 测试Python数据服务API
echo "2. 测试Python数据服务API"
echo "----------------------------------------"

test_api "北向资金流向" "http://localhost:8000/api/capital-flow/northbound" "northboundNet"
test_api "大盘资金流向汇总" "http://localhost:8000/api/capital-flow/macro" "institutionalNet"
test_api "板块资金流向" "http://localhost:8000/api/capital-flow/sector" "mainForceNet"
test_api "市场资金流向" "http://localhost:8000/api/capital-flow/market" "totalMainNet"

echo ""

# 测试Next.js前端API
echo "3. 测试Next.js前端API"
echo "----------------------------------------"

if lsof -ti:3000 > /dev/null 2>&1; then
    test_api "市场概览" "http://localhost:3000/api/market/overview" "indices"
    test_api "资金流向" "http://localhost:3000/api/market/capital-flow" "institutionalNet"
else
    echo -e "${YELLOW}⚠ 跳过 (Next.js未运行)${NC}"
fi

echo ""

# 数据质量检查
echo "4. 数据质量验证"
echo "----------------------------------------"

echo -n "检查数据源标识... "
response=$(curl -s "http://localhost:8000/api/capital-flow/northbound")
if echo "${response}" | grep -q "\"source\":\"eastmoney_direct"; then
    echo -e "${GREEN}✓ 使用东财直连API${NC}"
    PASS=$((PASS + 1))
else
    echo -e "${YELLOW}⚠ 使用降级数据源${NC}"
    echo "  $(echo ${response} | grep -o '\"source\":\"[^\"]*\"')"
fi

echo -n "检查数据质量标记... "
response=$(curl -s "http://localhost:8000/api/capital-flow/macro")
if echo "${response}" | grep -q "\"dataQuality\""; then
    echo -e "${GREEN}✓ 存在dataQuality字段${NC}"
    quality=$(echo ${response} | grep -o '\"dataQuality\":\"[^\"]*\"')
    echo "  ${quality}"
    PASS=$((PASS + 1))
else
    echo -e "${RED}✗ 缺少dataQuality字段${NC}"
    FAIL=$((FAIL + 1))
fi

echo -n "验证零和关系... "
response=$(curl -s "http://localhost:8000/api/capital-flow/macro")
inst=$(echo ${response} | grep -o '\"institutionalNet\":[^,]*' | grep -o '[0-9.-]*')
retail=$(echo ${response} | grep -o '\"retailNet\":[^,]*' | grep -o '[0-9.-]*')

if [ -n "$inst" ] && [ -n "$retail" ]; then
    total=$(echo "$inst + $retail" | bc)
    abs_total=$(echo "$total" | tr -d '-')

    # 允许10%的误差
    threshold=$(echo "$inst * 0.1" | bc | tr -d '-')

    if (( $(echo "$abs_total < $threshold" | bc -l) )); then
        echo -e "${GREEN}✓ 零和关系合理${NC}"
        echo "  机构: ${inst}亿 + 散户: ${retail}亿 = ${total}亿"
        PASS=$((PASS + 1))
    else
        echo -e "${YELLOW}⚠ 零和关系偏离较大${NC}"
        echo "  机构: ${inst}亿 + 散户: ${retail}亿 = ${total}亿"
        echo "  提示: 散户数据为估算值"
    fi
else
    echo -e "${RED}✗ 无法获取数据${NC}"
    FAIL=$((FAIL + 1))
fi

echo ""

# 数据源优先级验证
echo "5. 数据源配置验证"
echo "----------------------------------------"

echo -n "检查provider注册... "
log_output=$(tail -100 /tmp/data-service.log 2>/dev/null || echo "")

if echo "${log_output}" | grep -q "注册数据源: eastmoney_direct"; then
    echo -e "${GREEN}✓ EastmoneyDirectProvider已注册${NC}"
    PASS=$((PASS + 1))
else
    echo -e "${RED}✗ EastmoneyDirectProvider未注册${NC}"
    FAIL=$((FAIL + 1))
fi

echo -n "检查数据源顺序... "
if echo "${log_output}" | grep -q "可用数据源.*eastmoney_direct.*akshare"; then
    echo -e "${GREEN}✓ 数据源优先级正确${NC}"
    PASS=$((PASS + 1))
else
    echo -e "${YELLOW}⚠ 无法确认数据源顺序${NC}"
fi

echo ""

# 性能测试
echo "6. 性能测试"
echo "----------------------------------------"

echo -n "北向资金接口响应时间... "
start_time=$(date +%s%N)
curl -s "http://localhost:8000/api/capital-flow/northbound" > /dev/null
end_time=$(date +%s%N)
response_time=$(( (end_time - start_time) / 1000000 ))

if [ $response_time -lt 2000 ]; then
    echo -e "${GREEN}✓ ${response_time}ms (优秀)${NC}"
    PASS=$((PASS + 1))
elif [ $response_time -lt 5000 ]; then
    echo -e "${YELLOW}⚠ ${response_time}ms (可接受)${NC}"
else
    echo -e "${RED}✗ ${response_time}ms (过慢)${NC}"
    FAIL=$((FAIL + 1))
fi

echo ""

# 输出总结
echo "======================================"
echo "  验证结果总结"
echo "======================================"
echo ""
echo -e "通过: ${GREEN}${PASS}${NC} 项"
echo -e "失败: ${RED}${FAIL}${NC} 项"
echo ""

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}✓ 所有测试通过！部署成功！${NC}"
    echo ""
    echo "建议后续操作："
    echo "1. 在前端增加数据质量标识 (estimated/realtime)"
    echo "2. 添加散户数据警告提示"
    echo "3. 监控数据源切换情况"
    exit 0
else
    echo -e "${RED}✗ 存在失败项，请检查日志${NC}"
    echo ""
    echo "查看日志命令："
    echo "  tail -f /tmp/data-service.log"
    exit 1
fi
