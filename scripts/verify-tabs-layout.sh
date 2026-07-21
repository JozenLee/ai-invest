#!/bin/bash

echo "🔍 验证调度器对话框 Tabs 布局重构..."
echo ""

# 1. 检查是否导入了 Tabs 组件
echo "1️⃣ 检查 Tabs 组件导入..."
if grep -q "import.*Tabs.*from.*tabs" src/components/events/SchedulerDialog.tsx; then
    echo "   ✅ 已导入 Tabs 组件"
else
    echo "   ❌ 未找到 Tabs 组件导入"
    exit 1
fi

# 2. 检查是否使用了 Tabs 结构
echo ""
echo "2️⃣ 检查 Tabs 使用..."
if grep -q "<Tabs" src/components/events/SchedulerDialog.tsx; then
    echo "   ✅ 使用了 Tabs 组件"
else
    echo "   ❌ 未使用 Tabs 组件"
    exit 1
fi

# 3. 检查是否有两个标签页
echo ""
echo "3️⃣ 检查标签页定义..."
CONFIG_TAB=$(grep -c 'value="config"' src/components/events/SchedulerDialog.tsx)
HISTORY_TAB=$(grep -c 'value="history"' src/components/events/SchedulerDialog.tsx)

if [ "$CONFIG_TAB" -ge 2 ] && [ "$HISTORY_TAB" -ge 2 ]; then
    echo "   ✅ 配置管理标签: $CONFIG_TAB 处"
    echo "   ✅ 运行历史标签: $HISTORY_TAB 处"
else
    echo "   ⚠️  标签页定义可能不完整"
fi

# 4. 检查是否移除了全局滚动
echo ""
echo "4️⃣ 检查全局滚动移除..."
if grep -q 'max-h-\[90vh\]' src/components/events/SchedulerDialog.tsx; then
    echo "   ⚠️  仍存在 max-h-[90vh]"
else
    echo "   ✅ 已移除 max-h-[90vh]"
fi

# 5. 检查运行历史是否只定义一次
echo ""
echo "5️⃣ 检查运行历史定义..."
HISTORY_SECTION=$(grep -c "executionLogs.map" src/components/events/SchedulerDialog.tsx)
if [ "$HISTORY_SECTION" -eq 1 ]; then
    echo "   ✅ 运行历史只定义了 1 次"
else
    echo "   ⚠️  运行历史定义了 $HISTORY_SECTION 次"
fi

# 6. 检查是否添加了图标
echo ""
echo "6️⃣ 检查图标导入..."
if grep -q "Settings" src/components/events/SchedulerDialog.tsx && grep -q "History" src/components/events/SchedulerDialog.tsx; then
    echo "   ✅ 已导入 Settings 和 History 图标"
else
    echo "   ⚠️  图标导入可能不完整"
fi

# 7. TypeScript 类型检查
echo ""
echo "7️⃣ 运行 TypeScript 类型检查..."
if npm run typecheck > /tmp/typecheck.log 2>&1; then
    echo "   ✅ TypeScript 类型检查通过"
else
    echo "   ❌ TypeScript 类型检查失败"
    cat /tmp/typecheck.log
    exit 1
fi

# 8. 检查开发服务器
echo ""
echo "8️⃣ 检查开发服务器..."
if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "   ✅ 开发服务器运行中"
else
    echo "   ⚠️  开发服务器未运行"
fi

echo ""
echo "✅ 自动验证完成！"
echo ""
echo "📋 手动验证步骤："
echo "   1. 访问 http://localhost:3000/events/sources"
echo "   2. 点击任意数据源的'设置'按钮"
echo "   3. 查看对话框是否显示两个标签页："
echo "      - [配置管理] 标签（默认激活）"
echo "      - [运行历史] 标签"
echo "   4. 点击[运行历史]标签，确认只显示一个历史列表"
echo "   5. 确认对话框无全局滚动，只有历史列表内部滚动"
echo ""
echo "🎯 预期效果："
echo "   ✅ 使用 Tabs 分页布局"
echo "   ✅ 配置页无需滚动"
echo "   ✅ 运行历史只显示一次"
echo "   ✅ 整体布局清晰，交互流畅"
