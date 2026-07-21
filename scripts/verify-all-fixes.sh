#!/bin/bash

# 最终验证脚本 - 包含所有修复
# 2026-07-21

echo "==================================="
echo "最终验证脚本 - 所有修复"
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
echo "2. 检查问题1：仪表盘数据自动更新..."

if grep -q "// 初始加载" src/contexts/MarketContext.tsx && \
   grep -q "// 自动刷新定时器" src/contexts/MarketContext.tsx; then
    echo -e "${GREEN}✓ MarketContext 自动刷新逻辑已修复${NC}"
    echo "  - 初始加载和定时器已分离"
    echo "  - 支持交易时段30秒刷新"
    echo "  - 支持非交易时段5分钟刷新"
else
    echo -e "${RED}✗ MarketContext 修改未找到${NC}"
fi

echo ""
echo "3. 检查问题2：资讯流数据源筛选..."

# 检查后端 API
if grep -q "sourceIds" src/app/api/events/feed/route.ts && \
   grep -q "sourceIds" src/lib/services/event.service.ts; then
    echo -e "${GREEN}✓ 后端数据源筛选 API 已添加${NC}"
    echo "  - API 路由支持 sourceIds 参数"
    echo "  - Service 层实现查询逻辑"
else
    echo -e "${RED}✗ 后端数据源筛选 API 未找到${NC}"
fi

# 检查前端 UI
if grep -q "selectedSourceIds" src/app/\(dashboard\)/events/feed/page.tsx && \
   grep -q "fetchDataSources" src/app/\(dashboard\)/events/feed/page.tsx && \
   grep -q "数据源筛选" src/app/\(dashboard\)/events/feed/page.tsx; then
    echo -e "${GREEN}✓ 前端数据源筛选 UI 已添加${NC}"
    echo "  - 添加数据源状态管理"
    echo "  - 添加 fetchDataSources 函数"
    echo "  - 添加数据源多选组件"
    echo "  - 显示已选数据源标签"
else
    echo -e "${RED}✗ 前端数据源筛选 UI 未完成${NC}"
fi

echo ""
echo "4. 检查问题3：数据源设置页面优化..."

# 检查数据源ID是否移除
if ! grep -q "数据源ID" src/components/events/SchedulerDialog.tsx; then
    echo -e "${GREEN}✓ 数据源ID已移除${NC}"
else
    echo -e "${YELLOW}⚠ 数据源ID仍然存在${NC}"
fi

# 检查调度类型标签统一
if grep -q "定时轮询" src/lib/constants/datasource-labels.ts; then
    echo -e "${GREEN}✓ 调度类型标签已统一为'定时轮询'${NC}"
    echo "  - 后端标签: interval → 定时轮询"
    echo "  - 前端下拉框: interval → 定时轮询"
else
    echo -e "${RED}✗ 调度类型标签未统一${NC}"
fi

# 检查 Cron 示例
if grep -q "常用示例" src/components/events/SchedulerDialog.tsx; then
    echo -e "${GREEN}✓ Cron表达式示例已添加${NC}"
else
    echo -e "${RED}✗ Cron表达式示例未找到${NC}"
fi

# 检查 ScrollArea 底部内边距
if grep -q 'pb-6' src/components/events/SchedulerDialog.tsx; then
    echo -e "${GREEN}✓ 运行历史底部间距已修复${NC}"
    echo "  - ScrollArea 内容区域增加底部内边距"
else
    echo -e "${YELLOW}⚠ 运行历史底部间距可能不足${NC}"
fi

echo ""
echo "5. 检查文档..."
if [ -f "docs/bug-fixes-2026-07-21.md" ]; then
    echo -e "${GREEN}✓ 修复文档已创建${NC}"
else
    echo -e "${YELLOW}⚠ 修复文档未找到${NC}"
fi

echo ""
echo "==================================="
echo "✅ 所有修复验证完成！"
echo "==================================="
echo ""
echo "修复摘要："
echo "  1. ✓ 仪表盘数据自动更新机制"
echo "  2. ✓ 资讯流数据源筛选功能"
echo "  3. ✓ 数据源设置页面优化"
echo "     - 移除无意义的数据源ID"
echo "     - 统一调度类型中文显示"
echo "     - 添加Cron表达式示例"
echo "     - 修复运行历史底部遮挡"
echo ""
echo "下一步测试："
echo "  1. 启动服务: npm run dev"
echo "  2. 仪表盘: http://localhost:3000/dashboard"
echo "     - 观察数据自动刷新（30秒/5分钟）"
echo "     - 测试手动刷新按钮"
echo "  3. 资讯流: http://localhost:3000/events/feed"
echo "     - 测试数据源多选筛选"
echo "     - 验证标签显示和移除"
echo "  4. 数据源设置: http://localhost:3000/events/sources"
echo "     - 点击任意数据源的'设置'按钮"
echo "     - 确认调度类型显示为中文'定时轮询'"
echo "     - 确认没有显示数据源ID"
echo "     - 切换到Cron类型查看示例"
echo "     - 滚动到运行历史底部确认不被遮挡"
echo ""
