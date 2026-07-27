#!/bin/bash

echo "======================================"
echo "头像显示修复快速验证"
echo "======================================"
echo ""

echo "1. 检查代码修改..."
echo ""

# 检查添加页面
echo "📄 添加大V页面 (new/page.tsx):"
if grep -q "import Image from 'next/image'" src/app/\(dashboard\)/events/influencers/new/page.tsx; then
    echo "   ✅ 已导入 Image 组件"
else
    echo "   ❌ 未导入 Image 组件"
    exit 1
fi

if grep -q "<Image" src/app/\(dashboard\)/events/influencers/new/page.tsx; then
    IMAGE_COUNT=$(grep -c "<Image" src/app/\(dashboard\)/events/influencers/new/page.tsx)
    echo "   ✅ 使用了 Image 组件 (${IMAGE_COUNT}处)"
else
    echo "   ❌ 未使用 Image 组件"
    exit 1
fi

if grep -q "unoptimized" src/app/\(dashboard\)/events/influencers/new/page.tsx; then
    echo "   ✅ 设置了 unoptimized 属性"
else
    echo "   ❌ 未设置 unoptimized 属性"
    exit 1
fi

echo ""

# 检查编辑页面
echo "📄 编辑大V页面 (edit/page.tsx):"
if grep -q "import Image from 'next/image'" src/app/\(dashboard\)/events/influencers/\[id\]/edit/page.tsx; then
    echo "   ✅ 已导入 Image 组件"
else
    echo "   ❌ 未导入 Image 组件"
    exit 1
fi

if grep -q "<Image" src/app/\(dashboard\)/events/influencers/\[id\]/edit/page.tsx; then
    IMAGE_COUNT=$(grep -c "<Image" src/app/\(dashboard\)/events/influencers/\[id\]/edit/page.tsx)
    echo "   ✅ 使用了 Image 组件 (${IMAGE_COUNT}处)"
else
    echo "   ❌ 未使用 Image 组件"
    exit 1
fi

if grep -q "unoptimized" src/app/\(dashboard\)/events/influencers/\[id\]/edit/page.tsx; then
    echo "   ✅ 设置了 unoptimized 属性"
else
    echo "   ❌ 未设置 unoptimized 属性"
    exit 1
fi

echo ""
echo "2. 检查开发服务器..."
if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "   ✅ 开发服务器运行中 (http://localhost:3000)"
else
    echo "   ❌ 开发服务器未运行"
    echo "   提示: 运行 'npm run dev' 启动服务器"
    exit 1
fi

echo ""
echo "======================================"
echo "✅ 代码修复验证通过！"
echo "======================================"
echo ""
echo "接下来请在浏览器中测试："
echo ""
echo "1. 添加大V页面测试："
echo "   http://localhost:3000/events/influencers/new"
echo "   - 选择 bilibili 平台"
echo "   - 输入账号 ID: 1958881925"
echo "   - 验证后检查头像显示"
echo ""
echo "2. 编辑大V页面测试："
echo "   http://localhost:3000/events/influencers"
echo "   - 点击任意大V进入详情"
echo "   - 点击编辑按钮"
echo "   - 检查头像显示"
echo ""
echo "⚠️  如果头像仍然不显示，请："
echo "   1. 按 Cmd+Shift+R 强制刷新浏览器"
echo "   2. 打开开发者工具检查控制台错误"
echo "   3. 查看 Network 面板检查图片请求状态"
echo ""
