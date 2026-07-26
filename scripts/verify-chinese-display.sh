#!/bin/bash

echo "=========================================="
echo "验证中文显示修复"
echo "=========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查开发服务器
echo "1. 检查开发服务器状态..."
if curl -s http://localhost:3000/api/influencers > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} 开发服务器运行正常"
else
    echo -e "${RED}✗${NC} 开发服务器未运行，请先执行 npm run dev"
    exit 1
fi

echo ""
echo "2. 验证修复内容..."
echo ""

# 检查1: 平台选择器中文映射函数
echo "  [检查1] 平台选择器中文映射..."
if grep -q "getPlatformLabel" src/app/\(dashboard\)/events/influencers/page.tsx; then
    echo -e "  ${GREEN}✓${NC} getPlatformLabel 函数已添加"
else
    echo -e "  ${RED}✗${NC} getPlatformLabel 函数未找到"
fi

# 检查2: SelectValue 使用中文标签
if grep -q "SelectValue>{getPlatformLabel" src/app/\(dashboard\)/events/influencers/page.tsx; then
    echo -e "  ${GREEN}✓${NC} SelectValue 正确使用中文标签"
else
    echo -e "  ${RED}✗${NC} SelectValue 未使用中文标签"
fi

# 检查3: 面包屑导航包含 influencers 映射
echo ""
echo "  [检查2] 面包屑导航中文映射..."
if grep -q "influencers: '大V监控'" src/components/layout/header.tsx; then
    echo -e "  ${GREEN}✓${NC} influencers 路由已映射为'大V监控'"
else
    echo -e "  ${RED}✗${NC} influencers 路由未正确映射"
fi

# 检查4: 动态路由处理
if grep -q "dynamicNames" src/components/layout/header.tsx; then
    echo -e "  ${GREEN}✓${NC} 动态路由名称加载逻辑已添加"
else
    echo -e "  ${RED}✗${NC} 动态路由处理逻辑未找到"
fi

# 检查5: ID 格式识别
if grep -q "startsWith('inf_')" src/components/layout/header.tsx; then
    echo -e "  ${GREEN}✓${NC} ID 格式识别逻辑已添加"
else
    echo -e "  ${RED}✗${NC} ID 格式识别逻辑未找到"
fi

# 检查6: new 路由映射
if grep -q "new: '新建'" src/components/layout/header.tsx; then
    echo -e "  ${GREEN}✓${NC} 'new' 路由已映射为'新建'"
else
    echo -e "  ${YELLOW}⚠${NC} 'new' 路由未映射（可选）"
fi

echo ""
echo "  [检查3] 开发规范文档..."
if [ -f "docs/development-guidelines.md" ]; then
    echo -e "  ${GREEN}✓${NC} 开发规范文档已创建"

    if grep -q "中文优先" docs/development-guidelines.md; then
        echo -e "  ${GREEN}✓${NC} 包含中文优先原则"
    fi

    if grep -q "动态路由" docs/development-guidelines.md; then
        echo -e "  ${GREEN}✓${NC} 包含动态路由处理说明"
    fi
else
    echo -e "  ${RED}✗${NC} 开发规范文档未找到"
fi

echo ""
echo "=========================================="
echo "3. 功能测试建议"
echo "=========================================="
echo ""
echo "请在浏览器中手动验证以下内容："
echo ""
echo "  1. 访问 http://localhost:3000/events/influencers"
echo "     - 页面标题显示: 大V监控 ✓"
echo "     - 面包屑显示: 首页 / 事件驱动 / 大V监控 ✓"
echo "     - 平台选择器默认显示: 全部平台 ✓"
echo ""
echo "  2. 点击平台选择器下拉菜单"
echo "     - 选项显示: 全部平台、微博、B站等 ✓"
echo "     - 选择后显示对应中文 ✓"
echo ""
echo "  3. 点击任意大V卡片进入详情页"
echo "     - 面包屑显示: 首页 / 事件驱动 / 大V监控 / 详情 ✓"
echo "     - 或显示实际大V名称（如果加载成功）✓"
echo ""
echo "=========================================="
echo "验证完成"
echo "=========================================="
