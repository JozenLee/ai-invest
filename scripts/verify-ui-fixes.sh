#!/bin/bash

# UI显示修复验证脚本

echo "======================================"
echo "UI显示修复验证"
echo "======================================"
echo ""

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo "修复内容:"
echo "1. 详情页面标题显示中文名称（而非英文代码）"
echo "2. AI分析提示文案更新为'点击上方按钮生成AI智能趋势分析报告'"
echo ""

echo "代码验证:"
echo "-----------------------------------"
echo ""

# 检查导入是否添加
if grep -q "getDomainByCode" /Users/jozen.lee/ai-softwares/ai-invest/src/app/\(dashboard\)/events/trends/\[domain\]/page.tsx; then
    echo -e "${GREEN}✓${NC} getDomainByCode 已导入"
else
    echo -e "${RED}✗${NC} getDomainByCode 未导入"
fi

# 检查错误处理是否使用getDomainByCode
if grep -q "getDomainByCode(domain)" /Users/jozen.lee/ai-softwares/ai-invest/src/app/\(dashboard\)/events/trends/\[domain\]/page.tsx; then
    echo -e "${GREEN}✓${NC} 错误状态使用中文名称"
else
    echo -e "${RED}✗${NC} 错误状态未修复"
fi

# 检查AI分析文案
if grep -q "点击上方按钮生成AI智能趋势分析报告" /Users/jozen.lee/ai-softwares/ai-invest/src/components/trends/AIInsightSection.tsx; then
    echo -e "${GREEN}✓${NC} AI分析文案已更新"
else
    echo -e "${RED}✗${NC} AI分析文案未更新"
fi

echo ""
echo "手动验证步骤:"
echo "-----------------------------------"
echo ""
echo "1. 打开浏览器访问: http://localhost:3000/events/trends"
echo ""
echo "2. 点击任意领域卡片（如'半导体'）"
echo ""
echo "3. 验证页面标题显示:"
echo "   ✓ 预期: '半导体领域深度分析'"
echo "   ✗ 错误: 'semiconductor领域深度分析'"
echo ""
echo "4. 滚动到'AI趋势分析'区块，验证提示文案:"
echo "   ✓ 预期: '点击上方按钮生成AI智能趋势分析报告'"
echo "   ✗ 错误: '点击上方按钮生成基于Claude的智能投资分析报告'"
echo ""
echo "5. 点击'生成AI分析'按钮，验证功能正常"
echo ""

echo "======================================"
echo "请在浏览器中手动验证UI显示"
echo "======================================"
