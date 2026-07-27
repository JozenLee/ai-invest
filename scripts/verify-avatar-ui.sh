#!/bin/bash

echo "=========================================="
echo "  大V监控头像显示 - UI验证"
echo "=========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 检查函数
check_pass() {
    echo -e "${GREEN}✓${NC} $1"
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

echo "1. 检查服务状态"
echo "-------------------------------------------"

# 检查Next.js
if lsof -i:3000 > /dev/null 2>&1; then
    check_pass "Next.js服务运行中 (端口3000)"
else
    check_fail "Next.js服务未运行"
    echo "   请运行: npm run dev"
    exit 1
fi

# 检查FastAPI
if lsof -i:8000 > /dev/null 2>&1; then
    check_pass "FastAPI服务运行中 (端口8000)"
else
    check_fail "FastAPI服务未运行"
    echo "   请运行: cd data-service && python3 main.py"
    exit 1
fi
echo ""

echo "2. 检查数据库数据"
echo "-------------------------------------------"
ERGOU_DATA=$(sqlite3 -json prisma/dev.db "SELECT id, name, avatarUrl FROM Influencer WHERE name = '二狗学长好';")
if [ -n "$ERGOU_DATA" ]; then
    AVATAR_URL=$(echo "$ERGOU_DATA" | jq -r '.[0].avatarUrl')
    if [ "$AVATAR_URL" != "null" ] && [ -n "$AVATAR_URL" ]; then
        check_pass "数据库中有头像URL"
        echo "   URL: $AVATAR_URL"
    else
        check_fail "数据库中avatarUrl为空"
    fi
else
    check_fail "未找到'二狗学长好'"
fi
echo ""

echo "3. 检查API响应"
echo "-------------------------------------------"

# 检查FastAPI
FASTAPI_AVATAR=$(curl -sL "http://localhost:8000/api/influencers?page=1&pageSize=20" | jq -r '.items[] | select(.name=="二狗学长好") | .avatarUrl')
if [ "$FASTAPI_AVATAR" != "null" ] && [ -n "$FASTAPI_AVATAR" ]; then
    check_pass "FastAPI返回头像URL"
    echo "   URL: $FASTAPI_AVATAR"
else
    check_fail "FastAPI未返回头像URL"
fi

# 检查Next.js API
NEXTJS_AVATAR=$(curl -s "http://localhost:3000/api/influencers?page=1&pageSize=20" | jq -r '.items[] | select(.name=="二狗学长好") | .avatarUrl')
if [ "$NEXTJS_AVATAR" != "null" ] && [ -n "$NEXTJS_AVATAR" ]; then
    check_pass "Next.js API返回头像URL"
    echo "   URL: $NEXTJS_AVATAR"
else
    check_fail "Next.js API未返回头像URL"
fi
echo ""

echo "4. 检查头像URL可访问性"
echo "-------------------------------------------"
if [ -n "$AVATAR_URL" ] && [ "$AVATAR_URL" != "null" ]; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$AVATAR_URL")
    if [ "$HTTP_CODE" = "200" ]; then
        check_pass "头像URL可访问 (HTTP $HTTP_CODE)"
    else
        check_fail "头像URL不可访问 (HTTP $HTTP_CODE)"
    fi
else
    check_warn "跳过检查（无头像URL）"
fi
echo ""

echo "5. 检查Next.js图片配置"
echo "-------------------------------------------"
if grep -q "i0.hdslb.com" next.config.ts; then
    check_pass "B站图片域名已配置 (i0.hdslb.com)"
else
    check_fail "B站图片域名未配置"
fi

if grep -q "i1.hdslb.com" next.config.ts; then
    check_pass "B站图片域名已配置 (i1.hdslb.com)"
fi

if grep -q "i2.hdslb.com" next.config.ts; then
    check_pass "B站图片域名已配置 (i2.hdslb.com)"
fi
echo ""

echo "6. 检查详情页API"
echo "-------------------------------------------"
DETAIL_AVATAR=$(curl -s "http://localhost:3000/api/influencers/inf_1785044475094355" | jq -r '.data.avatarUrl')
if [ "$DETAIL_AVATAR" != "null" ] && [ -n "$DETAIL_AVATAR" ]; then
    check_pass "详情页API返回头像URL"
    echo "   URL: $DETAIL_AVATAR"
else
    check_fail "详情页API未返回头像URL"
fi
echo ""

echo "=========================================="
echo "  验证摘要"
echo "=========================================="
echo ""

# 计算通过的检查数
CHECKS_PASSED=0
CHECKS_TOTAL=8

# 重新执行关键检查
lsof -i:3000 > /dev/null 2>&1 && ((CHECKS_PASSED++))
lsof -i:8000 > /dev/null 2>&1 && ((CHECKS_PASSED++))
[ -n "$ERGOU_DATA" ] && [ "$AVATAR_URL" != "null" ] && ((CHECKS_PASSED++))
[ "$FASTAPI_AVATAR" != "null" ] && [ -n "$FASTAPI_AVATAR" ] && ((CHECKS_PASSED++))
[ "$NEXTJS_AVATAR" != "null" ] && [ -n "$NEXTJS_AVATAR" ] && ((CHECKS_PASSED++))
[ "$HTTP_CODE" = "200" ] && ((CHECKS_PASSED++))
grep -q "i0.hdslb.com" next.config.ts && ((CHECKS_PASSED++))
[ "$DETAIL_AVATAR" != "null" ] && [ -n "$DETAIL_AVATAR" ] && ((CHECKS_PASSED++))

echo "检查结果: $CHECKS_PASSED/$CHECKS_TOTAL 通过"
echo ""

if [ $CHECKS_PASSED -eq $CHECKS_TOTAL ]; then
    check_pass "所有检查通过！"
    echo ""
    info "请在浏览器中验证UI显示："
    echo ""
    echo "   列表页: http://localhost:3000/events/influencers"
    echo "   详情页: http://localhost:3000/events/influencers/inf_1785044475094355"
    echo ""
    echo "应该看到："
    echo "   - 列表页显示圆形头像（不是'B站'文字）"
    echo "   - 详情页显示大头像（不是裂图）"
else
    check_warn "有 $((CHECKS_TOTAL - CHECKS_PASSED)) 个检查未通过"
    echo ""
    echo "请根据上面的错误信息进行修复"
fi

echo ""
echo "=========================================="
