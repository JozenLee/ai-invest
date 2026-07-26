#!/bin/bash

# 面包屑显示修复验证脚本

echo "======================================"
echo "面包屑显示修复验证"
echo "======================================"
echo ""

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo "修复内容:"
echo "面包屑导航显示中文领域名称（而非英文代码）"
echo ""

echo "代码验证:"
echo "-----------------------------------"
echo ""

# 检查导入
if grep -q "getDomainByCode" /Users/jozen.lee/ai-softwares/ai-invest/src/components/layout/header.tsx; then
    echo -e "${GREEN}✓${NC} getDomainByCode 已导入到header.tsx"
else
    echo -e "${RED}✗${NC} getDomainByCode 未导入"
fi

# 检查getBreadcrumbName函数是否更新
if grep -q "const domain = getDomainByCode(segment)" /Users/jozen.lee/ai-softwares/ai-invest/src/components/layout/header.tsx; then
    echo -e "${GREEN}✓${NC} getBreadcrumbName 函数已更新"
else
    echo -e "${RED}✗${NC} getBreadcrumbName 函数未更新"
fi

echo ""
echo "手动验证步骤:"
echo "-----------------------------------"
echo ""
echo "1. 打开浏览器访问: http://localhost:3000/events/trends"
echo ""
echo "2. 点击'半导体'卡片"
echo ""
echo "3. 检查顶部面包屑导航，应显示:"
echo "   ✓ 首页 / 事件驱动 / 领域趋势 / 半导体"
echo "   ✗ 首页 / 事件驱动 / 领域趋势 / semiconductor"
echo ""
echo "4. 测试其他领域:"
echo "   - 人工智能: 应显示 '人工智能' 而非 'ai'"
echo "   - 电池储能: 应显示 '电池储能' 而非 'battery'"
echo "   - 机器人: 应显示 '机器人' 而非 'robotics'"
echo ""
echo "5. 确认所有20个领域的面包屑都显示中文"
echo ""

echo "======================================"
echo "请在浏览器中验证面包屑显示"
echo "======================================"
