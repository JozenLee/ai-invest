#!/bin/bash

# 验证调度器设置最终修复的脚本

echo "======================================"
echo "调度器设置最终修复验证"
echo "======================================"
echo ""

# 检查基本信息中的调度类型是否使用state
echo "✓ 检查点1: 基本信息调度类型显示"
if grep -A 5 "调度类型" src/components/events/SchedulerDialog.tsx | grep -q "scheduleType === 'interval'"; then
  echo "  ✓ 基本信息使用scheduleType state显示调度类型"
else
  echo "  ✗ 基本信息未使用scheduleType state"
  exit 1
fi

echo ""

# 检查是否有重复的运行历史组件
echo "✓ 检查点2: 运行历史组件数量"
history_count=$(grep -c "{/\* 运行历史 \*/}" src/components/events/SchedulerDialog.tsx)
if [ "$history_count" -eq 1 ]; then
  echo "  ✓ 只有1个运行历史组件（正确）"
elif [ "$history_count" -eq 0 ]; then
  # 尝试另一种方式检查
  history_count=$(grep "运行历史" src/components/events/SchedulerDialog.tsx | grep -c "h3")
  if [ "$history_count" -eq 1 ]; then
    echo "  ✓ 只有1个运行历史组件（正确）"
  else
    echo "  ✗ 运行历史组件数量异常: $history_count"
    exit 1
  fi
else
  echo "  ✗ 发现 $history_count 个运行历史组件"
  exit 1
fi

echo ""

# 验证调度类型在两个地方显示一致
echo "✓ 检查点3: 调度类型显示一致性"
basic_info=$(grep -A 3 "span className=\"text-xs text-muted-foreground\">调度类型" src/components/events/SchedulerDialog.tsx | grep "scheduleType === 'interval'")
config_section=$(grep -A 5 "Label htmlFor=\"scheduleType\">调度类型" src/components/events/SchedulerDialog.tsx | grep "scheduleType === 'interval'")

if [ -n "$basic_info" ] && [ -n "$config_section" ]; then
  echo "  ✓ 基本信息和调度配置都使用相同的scheduleType state"
else
  echo "  ✗ 调度类型显示不一致"
  exit 1
fi

echo ""
echo "======================================"
echo "✓ 所有修复点验证通过！"
echo "======================================"
echo ""
echo "修复总结："
echo "1. ✓ 基本信息中的调度类型现在与调度配置中的一致"
echo "2. ✓ 确认只有一个运行历史组件"
echo "3. ✓ 调度类型在编辑时实时更新显示"
echo ""
echo "请启动开发服务器测试UI效果："
echo "  npm run dev"
echo ""
echo "测试步骤："
echo "1. 访问 http://localhost:3000/events/sources"
echo "2. 点击任意数据源的'设置'按钮"
echo "3. 查看基本信息中的调度类型"
echo "4. 修改调度配置中的调度类型"
echo "5. 确认基本信息中的调度类型同步更新"
echo "6. 滚动到底部，确认只有一个运行历史组件"
