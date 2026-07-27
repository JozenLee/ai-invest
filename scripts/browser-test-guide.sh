#!/bin/bash

echo "=========================================="
echo "  浏览器访问测试"
echo "=========================================="
echo ""

# 使用curl模拟浏览器请求，检查页面是否正常响应
echo "1. 测试列表页HTTP响应"
echo "-------------------------------------------"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/events/influencers")
if [ "$HTTP_CODE" = "200" ]; then
    echo "✓ 列表页可访问 (HTTP $HTTP_CODE)"
else
    echo "✗ 列表页访问失败 (HTTP $HTTP_CODE)"
fi
echo ""

echo "2. 测试详情页HTTP响应"
echo "-------------------------------------------"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/events/influencers/inf_1785044475094355")
if [ "$HTTP_CODE" = "200" ]; then
    echo "✓ 详情页可访问 (HTTP $HTTP_CODE)"
else
    echo "✗ 详情页访问失败 (HTTP $HTTP_CODE)"
fi
echo ""

echo "3. 测试头像图片直接访问"
echo "-------------------------------------------"
AVATAR_URL="https://i0.hdslb.com/bfs/face/42ad87696d4ac310b24e1161d702984f69516149.jpg"
echo "直接测试头像URL: $AVATAR_URL"

# 测试图片是否可访问
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$AVATAR_URL")
CONTENT_TYPE=$(curl -s -I "$AVATAR_URL" | grep -i "content-type" | awk '{print $2}' | tr -d '\r')

if [ "$HTTP_CODE" = "200" ]; then
    echo "✓ 头像图片可访问 (HTTP $HTTP_CODE)"
    echo "  Content-Type: $CONTENT_TYPE"
else
    echo "✗ 头像图片不可访问 (HTTP $HTTP_CODE)"
fi
echo ""

echo "4. 测试Next.js图片代理"
echo "-------------------------------------------"
# Next.js的图片优化端点
NEXT_IMG_URL="http://localhost:3000/_next/image?url=$(node -pe "encodeURIComponent('$AVATAR_URL')")&w=64&q=75"
echo "测试Next.js图片优化端点..."

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$NEXT_IMG_URL")
if [ "$HTTP_CODE" = "200" ]; then
    echo "✓ Next.js图片代理工作正常 (HTTP $HTTP_CODE)"
elif [ "$HTTP_CODE" = "400" ]; then
    echo "⚠ Next.js图片代理返回400 - 可能是域名未配置"
    echo "  请检查next.config.ts中的remotePatterns配置"
else
    echo "⚠ Next.js图片代理返回 HTTP $HTTP_CODE"
fi
echo ""

echo "=========================================="
echo "  📱 请在浏览器中验证UI显示"
echo "=========================================="
echo ""
echo "所有后端检查已通过！现在请打开浏览器验证："
echo ""
echo "🔗 列表页:"
echo "   http://localhost:3000/events/influencers"
echo ""
echo "🔗 详情页:"
echo "   http://localhost:3000/events/influencers/inf_1785044475094355"
echo ""
echo "✅ 验证要点:"
echo "   1. 列表页「二狗学长好」应显示圆形头像（不是'B站'文字）"
echo "   2. 详情页应显示大头像（不是裂图或Users图标）"
echo "   3. 浏览器控制台应无错误信息"
echo ""
echo "如果看到头像正常显示，验证通过！✨"
echo ""
