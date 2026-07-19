#!/bin/bash

echo "=========================================="
echo "事件资讯UI筛选框修复验证"
echo "=========================================="
echo ""

# 检查开发服务器
echo "1. 检查开发服务器状态..."
if curl -s http://localhost:3000 > /dev/null; then
    echo "   ✅ 开发服务器运行正常"
else
    echo "   ❌ 开发服务器未运行，请先执行: npm run dev"
    exit 1
fi
echo ""

# 检查分类API
echo "2. 检查分类数据API..."
CATEGORIES=$(curl -s http://localhost:3000/api/events/categories)
if echo "$CATEGORIES" | jq -e '.success' > /dev/null 2>&1; then
    echo "   ✅ 分类API正常"

    # 检查子分类
    FINANCE_CHILDREN=$(echo "$CATEGORIES" | jq -r '.data[] | select(.code == "finance") | .children | length')
    echo "   ✅ 财经分类包含 $FINANCE_CHILDREN 个子分类"

    # 显示财经子分类
    echo "   财经子分类："
    echo "$CATEGORIES" | jq -r '.data[] | select(.code == "finance") | .children[] | "     - \(.name) (\(.id))"'
else
    echo "   ❌ 分类API异常"
fi
echo ""

# 检查领域API
echo "3. 检查领域数据API..."
DOMAINS=$(curl -s http://localhost:3000/api/events/domains)
if echo "$DOMAINS" | jq -e '.success' > /dev/null 2>&1; then
    echo "   ✅ 领域API正常"
    DOMAIN_COUNT=$(echo "$DOMAINS" | jq -r '.data | length')
    echo "   ✅ 共有 $DOMAIN_COUNT 个领域"
else
    echo "   ❌ 领域API异常"
fi
echo ""

# 验证TypeScript编译
echo "4. 验证TypeScript类型检查..."
if npm run typecheck 2>&1 | grep -q "error TS"; then
    echo "   ❌ TypeScript类型检查失败"
else
    echo "   ✅ TypeScript类型检查通过"
fi
echo ""

echo "=========================================="
echo "手动UI测试步骤："
echo "=========================================="
echo ""
echo "请在浏览器中打开: http://localhost:3000/events/feed"
echo ""
echo "测试项 1: 筛选框显示"
echo "  ✓ 选择「利好」情感筛选，显示框应显示「利好」"
echo "  ✓ 选择「AI芯片」领域，显示框应显示「AI芯片」"
echo "  ✓ 选择「按情感排序」，显示框应显示对应中文"
echo ""
echo "测试项 2: 板块二级分类"
echo "  ✓ 点击「财经」分类，应展开子分类下拉菜单"
echo "  ✓ 下拉菜单应显示：财报业绩、合作并购、资本市场、宏观经济"
echo "  ✓ 下拉菜单不应被其他组件遮挡"
echo "  ✓ 点击「财报业绩」，下方「当前筛选」应显示「分类: 财报业绩」"
echo ""
echo "测试项 3: 当前筛选条件显示"
echo "  ✓ 所有筛选条件应显示为中文"
echo "  ✓ 不应出现 cat_earnings 等技术ID"
echo "  ✓ 点击筛选条件的 × 应正确清除"
echo ""
echo "=========================================="
