#!/bin/bash
# 资金流向增强功能验证脚本

echo "=========================================="
echo "资金流向增强功能验证"
echo "=========================================="
echo ""

# 1. 检查Python服务是否运行
echo "1. 检查Python数据服务..."
if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo "   ✅ Python数据服务运行中"
else
    echo "   ❌ Python数据服务未启动"
    echo "   请先启动: cd data-service && python main.py"
    exit 1
fi

echo ""

# 2. 测试新增API端点
echo "2. 测试增强版资金流向API..."
response=$(curl -s http://localhost:8000/api/capital-flow/advanced/enhanced)
if echo "$response" | jq -e '.success' > /dev/null 2>&1; then
    echo "   ✅ API响应正常"

    # 检查数据结构
    if echo "$response" | jq -e '.data.consecutiveTrend' > /dev/null 2>&1; then
        echo "   ✅ 持续流入趋势数据存在"
    fi

    if echo "$response" | jq -e '.data.volumeAmplification' > /dev/null 2>&1; then
        echo "   ✅ 成交量放大数据存在"
    fi

    if echo "$response" | jq -e '.data.priceFlowDivergence' > /dev/null 2>&1; then
        echo "   ✅ 价格资金背离数据存在"
    fi

    if echo "$response" | jq -e '.data.institutionalBehavior' > /dev/null 2>&1; then
        echo "   ✅ 机构行为数据存在"
        lhb_count=$(echo "$response" | jq -r '.data.institutionalBehavior.dragonTiger.count')
        echo "   📊 龙虎榜上榜股票: ${lhb_count}只"
    fi
else
    echo "   ❌ API响应异常"
    echo "$response" | jq '.' 2>/dev/null || echo "$response"
fi

echo ""

# 3. 测试龙虎榜API
echo "3. 测试龙虎榜API..."
lhb_response=$(curl -s http://localhost:8000/api/capital-flow/advanced/lhb/latest)
if echo "$lhb_response" | jq -e '.success' > /dev/null 2>&1; then
    count=$(echo "$lhb_response" | jq -r '.count')
    echo "   ✅ 龙虎榜API响应正常"
    echo "   📊 今日上榜股票: ${count}只"
else
    echo "   ⚠️  龙虎榜API响应异常（可能非交易日）"
fi

echo ""

# 4. 检查Next.js服务
echo "4. 检查Next.js服务..."
if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "   ✅ Next.js服务运行中"

    # 测试资金流向API路由
    echo "   测试Next.js API路由..."
    next_response=$(curl -s http://localhost:3000/api/market/capital-flow)
    if echo "$next_response" | jq -e '.success' > /dev/null 2>&1; then
        echo "   ✅ Next.js资金流向API正常"
    else
        echo "   ⚠️  Next.js资金流向API响应异常"
    fi
else
    echo "   ❌ Next.js服务未启动"
    echo "   请先启动: npm run dev"
fi

echo ""

# 5. TypeScript类型检查
echo "5. TypeScript类型检查..."
if npm run typecheck 2>&1 | grep -q "error"; then
    echo "   ❌ TypeScript编译失败"
    npm run typecheck 2>&1 | grep "error" | head -5
else
    echo "   ✅ TypeScript编译通过"
fi

echo ""
echo "=========================================="
echo "验证完成！"
echo "=========================================="
echo ""
echo "📝 后续步骤:"
echo "1. 访问 http://localhost:3000/dashboard 查看新的资金流向指标"
echo "2. 点击刷新按钮测试数据更新"
echo "3. 查看文档: docs/capital-flow-enhancement.md"
echo ""
