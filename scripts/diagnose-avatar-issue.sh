#!/bin/bash

echo "=========================================="
echo "  大V监控头像显示诊断工具"
echo "=========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
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

# 1. 检查数据库中的大V数据
echo "1. 检查数据库中的大V数据"
echo "-------------------------------------------"
INFLUENCER_COUNT=$(sqlite3 prisma/dev.db "SELECT COUNT(*) FROM Influencer;")
echo "   大V总数: $INFLUENCER_COUNT"

if [ "$INFLUENCER_COUNT" -gt 0 ]; then
    check_pass "数据库中有大V数据"
    echo ""
    echo "   大V列表:"
    sqlite3 -header -column prisma/dev.db "SELECT id, name, platform, avatarUrl FROM Influencer;" | head -20
else
    check_fail "数据库中没有大V数据"
fi
echo ""

# 2. 检查"二狗学长好"的数据
echo "2. 检查'二狗学长好'的数据"
echo "-------------------------------------------"
ERGOU_EXISTS=$(sqlite3 prisma/dev.db "SELECT COUNT(*) FROM Influencer WHERE name = '二狗学长好';")
if [ "$ERGOU_EXISTS" -eq 1 ]; then
    check_pass "找到'二狗学长好'"
    ERGOU_DATA=$(sqlite3 -json prisma/dev.db "SELECT id, name, avatarUrl, platform FROM Influencer WHERE name = '二狗学长好';")
    echo "$ERGOU_DATA" | jq '.'
else
    check_fail "未找到'二狗学长好'"
fi
echo ""

# 3. 检查Next.js服务器状态
echo "3. 检查Next.js服务器状态"
echo "-------------------------------------------"
if lsof -i:3000 > /dev/null 2>&1; then
    check_pass "Next.js服务器正在运行 (端口3000)"

    # 测试API
    API_RESPONSE=$(curl -s http://localhost:3000/api/influencers/inf_1785044475094355)
    if [ $? -eq 0 ]; then
        check_pass "API接口可访问"
        echo ""
        echo "   API返回数据:"
        echo "$API_RESPONSE" | jq '{success, data: {name: .data.name, avatarUrl: .data.avatarUrl, platform: .data.platform}}'
    else
        check_fail "API接口不可访问"
    fi
else
    check_fail "Next.js服务器未运行"
    echo "   请先运行: npm run dev"
fi
echo ""

# 4. 检查头像URL可访问性
echo "4. 检查头像URL可访问性"
echo "-------------------------------------------"
AVATAR_URL="https://i0.hdslb.com/bfs/face/42ad87696d4ac310b24e1161d702984f69516149.jpg"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$AVATAR_URL")

if [ "$HTTP_CODE" = "200" ]; then
    check_pass "头像URL可访问 (HTTP $HTTP_CODE)"

    # 获取图片大小
    CONTENT_LENGTH=$(curl -s -I "$AVATAR_URL" | grep -i content-length | awk '{print $2}' | tr -d '\r')
    if [ -n "$CONTENT_LENGTH" ]; then
        SIZE_KB=$((CONTENT_LENGTH / 1024))
        echo "   图片大小: ${SIZE_KB}KB"
    fi
else
    check_fail "头像URL不可访问 (HTTP $HTTP_CODE)"
fi
echo ""

# 5. 检查Next.js图片配置
echo "5. 检查Next.js图片配置"
echo "-------------------------------------------"
if [ -f "next.config.ts" ]; then
    check_pass "next.config.ts 存在"

    if grep -q "i0.hdslb.com" next.config.ts; then
        check_pass "B站图片域名已配置 (i0.hdslb.com)"
    else
        check_fail "B站图片域名未配置"
        echo "   需要在 next.config.ts 中添加 remotePatterns 配置"
    fi

    if grep -q "i1.hdslb.com" next.config.ts; then
        check_pass "B站图片域名已配置 (i1.hdslb.com)"
    fi

    if grep -q "i2.hdslb.com" next.config.ts; then
        check_pass "B站图片域名已配置 (i2.hdslb.com)"
    fi
else
    check_fail "next.config.ts 不存在"
fi
echo ""

# 6. 检查页面组件
echo "6. 检查页面组件"
echo "-------------------------------------------"
DETAIL_PAGE="src/app/(dashboard)/events/influencers/[id]/page.tsx"
if [ -f "$DETAIL_PAGE" ]; then
    check_pass "详情页面组件存在"

    if grep -q "unoptimized" "$DETAIL_PAGE"; then
        check_warn "Image组件使用了 unoptimized 属性"
        echo "   这会跳过Next.js的图片优化，但可以解决某些加载问题"
    fi

    if grep -q "avatarUrl" "$DETAIL_PAGE"; then
        check_pass "页面组件包含头像URL处理逻辑"
    fi
else
    check_fail "详情页面组件不存在"
fi
echo ""

# 7. 浏览器访问测试建议
echo "7. 浏览器测试建议"
echo "-------------------------------------------"
echo "   请在浏览器中访问以下URL进行测试:"
echo ""
echo "   大V列表页: http://localhost:3000/events/influencers"
echo "   二狗学长好详情页: http://localhost:3000/events/influencers/inf_1785044475094355"
echo ""
echo "   如果头像仍不显示，请检查浏览器控制台的错误信息"
echo ""

# 8. 常见问题及解决方案
echo "8. 常见问题及解决方案"
echo "-------------------------------------------"
echo "   问题1: Next.js Image组件报错 'Invalid src prop'"
echo "   解决: 确保在 next.config.ts 中配置了 remotePatterns"
echo ""
echo "   问题2: 图片加载失败 (403/404)"
echo "   解决: 检查头像URL是否正确，是否需要特殊请求头"
echo ""
echo "   问题3: 配置修改后不生效"
echo "   解决: 重启Next.js开发服务器 (Ctrl+C 然后 npm run dev)"
echo ""
echo "   问题4: CORS跨域问题"
echo "   解决: 使用 unoptimized 属性或配置代理"
echo ""

echo "=========================================="
echo "  诊断完成"
echo "=========================================="
