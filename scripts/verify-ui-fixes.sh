#!/bin/bash
# UI修复验证脚本
# 测试超时优化、错误处理和日志改进

echo "================================================"
echo "UI修复验证测试"
echo "================================================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试计数
PASSED=0
FAILED=0

# 测试1: 检查TypeScript编译
echo "📋 测试1: TypeScript类型检查"
if npm run typecheck > /dev/null 2>&1; then
    echo -e "${GREEN}✓ 通过${NC} - 无TypeScript错误"
    ((PASSED++))
else
    echo -e "${RED}✗ 失败${NC} - 存在TypeScript错误"
    ((FAILED++))
fi
echo ""

# 测试2: 检查超时配置
echo "📋 测试2: 超时配置验证"
TIMEOUT_CLIENT=$(grep -o "AbortSignal.timeout([0-9]*)" src/contexts/MarketContext.tsx | grep -o "[0-9]*")
TIMEOUT_CAPITAL=$(grep -o "AbortSignal.timeout([0-9]*)" src/app/api/market/capital-flow/route.ts | grep -o "[0-9]*")
TIMEOUT_OVERVIEW=$(grep -o "AbortSignal.timeout([0-9]*)" src/app/api/market/overview/route.ts | grep -o "[0-9]*")

if [ "$TIMEOUT_CLIENT" -le 10000 ] && [ "$TIMEOUT_CAPITAL" -le 15000 ] && [ "$TIMEOUT_OVERVIEW" -le 15000 ]; then
    echo -e "${GREEN}✓ 通过${NC} - 超时配置已优化"
    echo "  - 客户端: ${TIMEOUT_CLIENT}ms (≤10000ms)"
    echo "  - Capital Flow API: ${TIMEOUT_CAPITAL}ms (≤15000ms)"
    echo "  - Overview API: ${TIMEOUT_OVERVIEW}ms (≤15000ms)"
    ((PASSED++))
else
    echo -e "${RED}✗ 失败${NC} - 超时配置未优化"
    ((FAILED++))
fi
echo ""

# 测试3: 检查条件日志
echo "📋 测试3: 条件日志验证"
DEV_LOGS=$(grep -c "process.env.NODE_ENV === 'development'" src/contexts/MarketContext.tsx)
if [ "$DEV_LOGS" -gt 0 ]; then
    echo -e "${GREEN}✓ 通过${NC} - 已实现条件日志 (${DEV_LOGS} 处)"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠ 警告${NC} - 未检测到条件日志"
    ((FAILED++))
fi
echo ""

# 测试4: 检查错误处理
echo "📋 测试4: 错误处理验证"
ERROR_MESSAGES=$(grep -c "数据请求超时\|网络请求失败" src/contexts/MarketContext.tsx)
if [ "$ERROR_MESSAGES" -gt 0 ]; then
    echo -e "${GREEN}✓ 通过${NC} - 已实现友好错误提示"
    ((PASSED++))
else
    echo -e "${RED}✗ 失败${NC} - 缺少友好错误提示"
    ((FAILED++))
fi
echo ""

# 测试5: 检查数据服务
echo "📋 测试5: 数据服务健康检查"
if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ 通过${NC} - 数据服务运行正常"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠ 警告${NC} - 数据服务未运行 (端口8000)"
fi
echo ""

# 总结
echo "================================================"
echo "测试总结"
echo "================================================"
echo -e "通过: ${GREEN}${PASSED}${NC}"
echo -e "失败: ${RED}${FAILED}${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ 所有测试通过！UI修复验证成功。${NC}"
    exit 0
else
    echo -e "${YELLOW}⚠ 部分测试未通过，请检查上述详情。${NC}"
    exit 1
fi
