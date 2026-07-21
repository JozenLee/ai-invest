#!/bin/bash

# 验证修复脚本
# 用于验证三个问题的修复情况

echo "==================================="
echo "修复验证脚本 - 2026-07-21"
echo "==================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查项目根目录
if [ ! -f "package.json" ]; then
    echo -e "${RED}错误: 请在项目根目录运行此脚本${NC}"
    exit 1
fi

echo "1. 检查 TypeScript 类型..."
if npm run typecheck > /dev/null 2>&1; then
    echo -e "${GREEN}✓ TypeScript 类型检查通过${NC}"
else
    echo -e "${RED}✗ TypeScript 类型检查失败${NC}"
    exit 1
fi

echo ""
echo "2. 检查关键文件修改..."

# 检查 MarketContext 修复
if grep -q "// 初始加载" src/contexts/MarketContext.tsx && \
   grep -q "// 自动刷新定时器" src/contexts/MarketContext.tsx; then
    echo -e "${GREEN}✓ MarketContext 自动刷新逻辑已修复${NC}"
else
    echo -e "${RED}✗ MarketContext 修改未找到${NC}"
fi

# 检查数据源筛选 API
if grep -q "sourceIds" src/app/api/events/feed/route.ts && \
   grep -q "sourceIds" src/lib/services/event.service.ts; then
    echo -e "${GREEN}✓ 数据源筛选 API 已添加${NC}"
else
    echo -e "${RED}✗ 数据源筛选 API 未找到${NC}"
fi

# 检查前端数据源筛选
if grep -q "selectedSourceIds" src/app/\(dashboard\)/events/feed/page.tsx && \
   grep -q "fetchDataSources" src/app/\(dashboard\)/events/feed/page.tsx; then
    echo -e "${GREEN}✓ 资讯流数据源筛选 UI 已添加${NC}"
else
    echo -e "${RED}✗ 资讯流数据源筛选 UI 未找到${NC}"
fi

# 检查 SchedulerDialog 优化
if ! grep -q "数据源ID" src/components/events/SchedulerDialog.tsx; then
    echo -e "${GREEN}✓ 数据源ID已移除${NC}"
else
    echo -e "${YELLOW}⚠ 数据源ID仍然存在${NC}"
fi

if grep -q "scheduleTypeLabel" src/components/events/SchedulerDialog.tsx && \
   grep -q "常用示例" src/components/events/SchedulerDialog.tsx; then
    echo -e "${GREEN}✓ SchedulerDialog 已优化（中文标签 + 示例）${NC}"
else
    echo -e "${RED}✗ SchedulerDialog 优化未完成${NC}"
fi

echo ""
echo "3. 检查文档..."
if [ -f "docs/bug-fixes-2026-07-21.md" ]; then
    echo -e "${GREEN}✓ 修复文档已创建${NC}"
else
    echo -e "${YELLOW}⚠ 修复文档未找到${NC}"
fi

echo ""
echo "==================================="
echo "验证完成！"
echo "==================================="
echo ""
echo "下一步："
echo "1. 启动开发服务器: npm run dev"
echo "2. 访问 http://localhost:3000/dashboard 测试仪表盘刷新"
echo "3. 访问 http://localhost:3000/events/feed 测试数据源筛选"
echo "4. 访问 http://localhost:3000/events/sources 测试数据源设置"
echo ""
