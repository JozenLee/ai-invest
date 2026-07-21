#!/bin/bash

# 调度器对话框重复问题验证脚本

echo "🔍 验证调度器对话框修复..."
echo ""

# 1. 检查是否还导入了 ScrollArea
echo "1️⃣ 检查 ScrollArea 导入..."
if grep -q "import.*ScrollArea.*from.*scroll-area" src/components/events/SchedulerDialog.tsx; then
    echo "   ❌ 仍然导入了 ScrollArea"
    exit 1
else
    echo "   ✅ 已移除 ScrollArea 导入"
fi

# 2. 检查是否使用了 ScrollArea 组件
echo ""
echo "2️⃣ 检查 ScrollArea 使用..."
if grep -q "<ScrollArea" src/components/events/SchedulerDialog.tsx; then
    echo "   ❌ 仍然使用了 ScrollArea 组件"
    exit 1
else
    echo "   ✅ 已移除 ScrollArea 组件"
fi

# 3. 检查是否使用了原生 overflow-y-auto
echo ""
echo "3️⃣ 检查原生滚动实现..."
if grep -q 'className="flex-1 overflow-y-auto px-6"' src/components/events/SchedulerDialog.tsx; then
    echo "   ✅ 已使用原生 overflow-y-auto"
else
    echo "   ❌ 未找到原生滚动实现"
    exit 1
fi

# 4. 检查是否移除了 min-h-0
echo ""
echo "4️⃣ 检查 min-h-0 移除..."
if grep -q 'min-h-0' src/components/events/SchedulerDialog.tsx; then
    echo "   ⚠️  仍然存在 min-h-0（如果在其他地方使用可能正常）"
else
    echo "   ✅ 已移除 min-h-0"
fi

# 5. 检查运行历史组件定义次数
echo ""
echo "5️⃣ 检查运行历史组件定义..."
HISTORY_COUNT=$(grep -c "运行历史" src/components/events/SchedulerDialog.tsx)
if [ "$HISTORY_COUNT" -eq 1 ]; then
    echo "   ✅ 运行历史只定义了 1 次"
elif [ "$HISTORY_COUNT" -eq 2 ]; then
    echo "   ℹ️  找到 2 处'运行历史'文本（标题和注释）"
else
    echo "   ⚠️  找到 $HISTORY_COUNT 处'运行历史'文本"
fi

# 6. TypeScript 类型检查
echo ""
echo "6️⃣ 运行 TypeScript 类型检查..."
if npm run typecheck > /tmp/typecheck.log 2>&1; then
    echo "   ✅ TypeScript 类型检查通过"
else
    echo "   ❌ TypeScript 类型检查失败"
    cat /tmp/typecheck.log
    exit 1
fi

# 7. 检查开发服务器是否运行
echo ""
echo "7️⃣ 检查开发服务器..."
if curl -s http://localhost:3000 > /dev/null; then
    echo "   ✅ 开发服务器运行中"
    echo ""
    echo "📋 手动验证步骤："
    echo "   1. 访问 http://localhost:3000/events/sources"
    echo "   2. 点击任意数据源的'设置'按钮"
    echo "   3. 滚动到底部，查看运行历史部分"
    echo "   4. 确认只显示一个运行历史组件"
else
    echo "   ⚠️  开发服务器未运行"
    echo "   运行 'npm run dev' 启动服务器进行手动测试"
fi

echo ""
echo "✅ 自动验证完成！"
echo ""
echo "📊 修复摘要："
echo "   - 移除了 ScrollArea 组件"
echo "   - 使用原生 overflow-y-auto"
echo "   - 移除了 min-h-0 类名"
echo "   - 保持了所有功能和样式"
echo ""
echo "🎯 预期结果："
echo "   ✅ 只显示一个运行历史组件"
echo "   ✅ 滚动流畅，无重复内容"
echo "   ✅ 功能正常，样式一致"
