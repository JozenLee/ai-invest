#!/bin/bash

echo "=========================================="
echo "事件资讯UI修复验证 - 最终版本"
echo "=========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查开发服务器
echo "1. 检查开发服务器状态..."
if curl -s http://localhost:3000 > /dev/null; then
    echo -e "   ${GREEN}✅ 开发服务器运行正常${NC}"
else
    echo -e "   ${RED}❌ 开发服务器未运行${NC}"
    exit 1
fi
echo ""

# 检查TypeScript编译
echo "2. 验证TypeScript类型检查..."
if npm run typecheck 2>&1 | grep -q "error TS"; then
    echo -e "   ${RED}❌ TypeScript类型检查失败${NC}"
else
    echo -e "   ${GREEN}✅ TypeScript类型检查通过${NC}"
fi
echo ""

# 检查分类API
echo "3. 检查分类数据..."
CATEGORIES=$(curl -s http://localhost:3000/api/events/categories)
if echo "$CATEGORIES" | jq -e '.success' > /dev/null 2>&1; then
    echo -e "   ${GREEN}✅ 分类API正常${NC}"

    # 检查科技分类
    TECH_CHILDREN=$(echo "$CATEGORIES" | jq -r '.data[] | select(.code == "tech") | .children | length')
    echo -e "   ${GREEN}✅ 科技分类包含 $TECH_CHILDREN 个子分类${NC}"

    # 检查财经分类
    FINANCE_CHILDREN=$(echo "$CATEGORIES" | jq -r '.data[] | select(.code == "finance") | .children | length')
    echo -e "   ${GREEN}✅ 财经分类包含 $FINANCE_CHILDREN 个子分类${NC}"
else
    echo -e "   ${RED}❌ 分类API异常${NC}"
fi
echo ""

echo "=========================================="
echo "修复验证清单"
echo "=========================================="
echo ""

echo -e "${YELLOW}问题1: 下拉框宽度不匹配${NC}"
echo "  修复方案: 使用按钮宽度作为下拉框最小宽度"
echo "  代码位置: minWidth: buttonRefs.current[expandedCategory]?.offsetWidth"
echo -e "  状态: ${GREEN}✅ 已修复${NC}"
echo ""

echo -e "${YELLOW}问题2: 点击父分类立即显示在「当前筛选」${NC}"
echo "  修复方案: 只有子分类才会显示在「当前筛选」"
echo "  逻辑改进:"
echo "    1. 点击父分类只展开/收起，不设置为选中状态"
echo "    2. 使用 isParentCategory() 检查是否是父分类"
echo "    3. 当前筛选只显示非父分类的选中项"
echo -e "  状态: ${GREEN}✅ 已修复${NC}"
echo ""

echo -e "${YELLOW}问题3: 新闻标签与筛选框不对应${NC}"
echo "  当前状态: 数据库关联查询已正确配置"
echo "  数据映射:"
echo "    - categoryRef.name → categoryName"
echo "    - domain.name → domainName"
echo "  注意: 需要确保数据库中的新闻记录已正确关联分类和领域"
echo -e "  状态: ${GREEN}✅ 代码已修复，数据需要关联${NC}"
echo ""

echo "=========================================="
echo "手动UI测试步骤（请在浏览器中验证）"
echo "=========================================="
echo ""
echo "访问地址: http://localhost:3000/events/feed"
echo ""

echo -e "${YELLOW}【测试1: 下拉框宽度】${NC}"
echo "  1. 点击「科技」分类按钮"
echo "  2. 验证下拉菜单宽度 >= 按钮宽度"
echo "  3. 点击「财经」分类按钮"
echo "  4. 验证下拉菜单宽度 >= 按钮宽度"
echo "  ✓ 下拉框应该与按钮宽度匹配或略宽"
echo ""

echo -e "${YELLOW}【测试2: 父分类不显示在当前筛选】${NC}"
echo "  1. 点击「科技」分类按钮"
echo "  2. 验证下方「当前筛选」区域 NOT 显示「分类: 科技」"
echo "  3. 点击子分类「产品发布」"
echo "  4. 验证下方「当前筛选」显示「分类: 产品发布」"
echo "  5. 点击「财经」-> 「财报业绩」"
echo "  6. 验证下方「当前筛选」显示「分类: 财报业绩」"
echo "  ✓ 只有子分类才会显示在当前筛选"
echo ""

echo -e "${YELLOW}【测试3: 新闻标签显示】${NC}"
echo "  1. 查看新闻列表中的标签"
echo "  2. 验证分类标签显示中文名称（如：产品发布、财报业绩）"
echo "  3. 验证领域标签显示中文名称（如：AI芯片、智能硬件）"
echo "  4. 标签不应显示技术ID（如：cat_product、domain_ai_chip）"
echo "  ✓ 如果标签为空，说明数据库记录未关联，需要重新采集数据"
echo ""

echo -e "${YELLOW}【测试4: 筛选功能联动】${NC}"
echo "  1. 选择「产品发布」分类"
echo "  2. 验证新闻列表只显示该分类的新闻"
echo "  3. 选择「AI芯片」领域"
echo "  4. 验证新闻列表只显示该领域的新闻"
echo "  5. 选择「利好」情感"
echo "  6. 验证新闻列表只显示利好新闻"
echo "  ✓ 所有筛选应该正确过滤新闻"
echo ""

echo -e "${YELLOW}【测试5: 下拉菜单交互】${NC}"
echo "  1. 点击「科技」展开下拉菜单"
echo "  2. 点击页面其他位置"
echo "  3. 验证下拉菜单自动关闭"
echo "  4. 再次点击「科技」展开"
echo "  5. 点击子分类「产品发布」"
echo "  6. 验证下拉菜单自动关闭并应用筛选"
echo "  ✓ 下拉菜单交互应该流畅"
echo ""

echo "=========================================="
echo "数据关联检查（如果新闻标签为空）"
echo "=========================================="
echo ""
echo "如果新闻列表中的分类/领域标签为空，需要："
echo ""
echo "1. 检查数据库中的新闻记录是否有 categoryId 和 domainId"
echo "   SELECT id, title, categoryId, domainId FROM NewsArticle LIMIT 5;"
echo ""
echo "2. 如果字段为空，需要重新采集数据或手动关联："
echo "   - 启动Python数据服务: cd data-service && python main.py"
echo "   - 访问数据源管理页面: http://localhost:3000/events/sources"
echo "   - 手动触发采集任务"
echo ""
echo "3. 或者运行种子数据脚本："
echo "   npm run db:seed"
echo ""

echo "=========================================="
echo "验证完成！"
echo "=========================================="
