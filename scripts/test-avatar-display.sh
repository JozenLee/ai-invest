#!/bin/bash

echo "=== 测试二狗学长好头像显示 ==="
echo ""

# 1. 检查数据库中的头像URL
echo "1. 数据库中的头像URL:"
sqlite3 prisma/dev.db "SELECT name, avatarUrl FROM Influencer WHERE name = '二狗学长好';"
echo ""

# 2. 检查API返回
echo "2. API返回的头像URL:"
curl -s "http://localhost:3000/api/influencers/inf_1785044475094355" | jq -r '.data.avatarUrl'
echo ""

# 3. 测试头像URL可访问性
echo "3. 测试头像URL可访问性:"
AVATAR_URL=$(curl -s "http://localhost:3000/api/influencers/inf_1785044475094355" | jq -r '.data.avatarUrl')
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$AVATAR_URL")
if [ "$HTTP_CODE" = "200" ]; then
    echo "✓ 头像URL可访问 (HTTP $HTTP_CODE)"
else
    echo "✗ 头像URL不可访问 (HTTP $HTTP_CODE)"
fi
echo ""

# 4. 检查Next.js配置
echo "4. Next.js图片域名配置:"
if grep -q "i0.hdslb.com" next.config.ts; then
    echo "✓ B站图片域名已配置"
else
    echo "✗ B站图片域名未配置"
fi
echo ""

echo "=== 测试完成 ==="
echo ""
echo "请访问以下URL查看头像显示效果:"
echo "http://localhost:3000/events/influencers/inf_1785044475094355"
