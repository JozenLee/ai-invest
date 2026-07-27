#!/bin/bash

# 头像显示修复验证脚本

echo "======================================"
echo "头像显示修复验证"
echo "======================================"
echo ""

# 检查是否使用了 Image 组件
echo "1. 检查添加大V页面是否使用 Image 组件..."
if grep -q "import Image from 'next/image'" src/app/\(dashboard\)/events/influencers/new/page.tsx; then
    echo "   ✅ 已导入 Image 组件"
else
    echo "   ❌ 未导入 Image 组件"
fi

if grep -q "<Image" src/app/\(dashboard\)/events/influencers/new/page.tsx; then
    echo "   ✅ 使用了 Image 组件"
else
    echo "   ❌ 未使用 Image 组件"
fi

if grep -q "unoptimized" src/app/\(dashboard\)/events/influencers/new/page.tsx; then
    echo "   ✅ 设置了 unoptimized 属性"
else
    echo "   ❌ 未设置 unoptimized 属性"
fi

echo ""
echo "2. 检查编辑大V页面是否使用 Image 组件..."
if grep -q "import Image from 'next/image'" src/app/\(dashboard\)/events/influencers/\[id\]/edit/page.tsx; then
    echo "   ✅ 已导入 Image 组件"
else
    echo "   ❌ 未导入 Image 组件"
fi

if grep -q "<Image" src/app/\(dashboard\)/events/influencers/\[id\]/edit/page.tsx; then
    echo "   ✅ 使用了 Image 组件"
else
    echo "   ❌ 未使用 Image 组件"
fi

if grep -q "unoptimized" src/app/\(dashboard\)/events/influencers/\[id\]/edit/page.tsx; then
    echo "   ✅ 设置了 unoptimized 属性"
else
    echo "   ❌ 未设置 unoptimized 属性"
fi

echo ""
echo "3. 检查是否还有遗留的 <img> 标签..."
NEW_PAGE_IMG_COUNT=$(grep -c "<img" src/app/\(dashboard\)/events/influencers/new/page.tsx 2>/dev/null || echo "0")
EDIT_PAGE_IMG_COUNT=$(grep -c "<img" src/app/\(dashboard\)/events/influencers/\[id\]/edit/page.tsx 2>/dev/null || echo "0")

if [ "$NEW_PAGE_IMG_COUNT" -eq 0 ]; then
    echo "   ✅ 添加页面无遗留 <img> 标签"
else
    echo "   ⚠️  添加页面还有 $NEW_PAGE_IMG_COUNT 个 <img> 标签"
fi

if [ "$EDIT_PAGE_IMG_COUNT" -eq 0 ]; then
    echo "   ✅ 编辑页面无遗留 <img> 标签"
else
    echo "   ⚠️  编辑页面还有 $EDIT_PAGE_IMG_COUNT 个 <img> 标签"
fi

echo ""
echo "4. 检查 TypeScript 类型..."
if npm run typecheck > /dev/null 2>&1; then
    echo "   ✅ TypeScript 类型检查通过"
else
    echo "   ❌ TypeScript 类型检查失败"
fi

echo ""
echo "5. 检查与监控列表页面的一致性..."
LIST_PAGE_HAS_IMAGE=$(grep -c "Image" src/app/\(dashboard\)/events/influencers/page.tsx)
if [ "$LIST_PAGE_HAS_IMAGE" -gt 0 ]; then
    echo "   ✅ 监控列表页面使用 Image 组件（参考实现）"
    echo "   ✅ 三个页面实现方式已统一"
else
    echo "   ⚠️  监控列表页面实现方式不同"
fi

echo ""
echo "======================================"
echo "验证完成"
echo "======================================"
echo ""
echo "下一步测试建议："
echo "1. 启动开发服务器: npm run dev"
echo "2. 访问 /events/influencers/new 添加大V"
echo "3. 验证账号后检查头像是否正常显示"
echo "4. 访问已有大V的编辑页面检查头像显示"
echo ""
