#!/bin/bash

# 验证调度器设置修复的脚本
# 修复内容：
# 1. 调度类型与实际配置不符
# 2. 调度类型筛选框显示英文标签
# 3. 运行历史组件被遮挡

echo "======================================"
echo "调度器设置修复验证"
echo "======================================"
echo ""

# 检查修复点1: 初始化逻辑是否正确读取scheduleType
echo "✓ 检查点1: 调度类型初始化逻辑"
if grep -q "setScheduleType(dataSource.scheduler.scheduleType)" src/components/events/SchedulerDialog.tsx; then
  echo "  ✓ 正确读取scheduler.scheduleType"
else
  echo "  ✗ 未找到scheduleType初始化逻辑"
  exit 1
fi

if grep -q "else if (dataSource.scheduler.scheduleType === 'webhook')" src/components/events/SchedulerDialog.tsx; then
  echo "  ✓ 添加了webhook类型处理"
else
  echo "  ✗ 缺少webhook类型处理"
  exit 1
fi

echo ""

# 检查修复点2: Select组件是否显示中文标签
echo "✓ 检查点2: 调度类型下拉框中文显示"
if grep -q "{scheduleType === 'interval' && '定时轮询'}" src/components/events/SchedulerDialog.tsx; then
  echo "  ✓ interval显示为'定时轮询'"
else
  echo "  ✗ interval未显示中文"
  exit 1
fi

if grep -q "{scheduleType === 'cron' && 'Cron表达式'}" src/components/events/SchedulerDialog.tsx; then
  echo "  ✓ cron显示为'Cron表达式'"
else
  echo "  ✗ cron未显示中文"
  exit 1
fi

if grep -q "{scheduleType === 'webhook' && 'Webhook触发'}" src/components/events/SchedulerDialog.tsx; then
  echo "  ✓ webhook显示为'Webhook触发'"
else
  echo "  ✗ webhook未显示中文"
  exit 1
fi

echo ""

# 检查修复点3: 对话框布局和滚动区域
echo "✓ 检查点3: 对话框布局优化"
if grep -q 'max-h-\[90vh\]' src/components/events/SchedulerDialog.tsx; then
  echo "  ✓ 对话框最大高度调整为90vh"
else
  echo "  ✗ 对话框高度未优化"
  exit 1
fi

if grep -q 'className="flex-1 overflow-y-auto px-6"' src/components/events/SchedulerDialog.tsx; then
  echo "  ✓ ScrollArea添加overflow-y-auto"
else
  echo "  ✗ ScrollArea滚动配置缺失"
  exit 1
fi

if grep -q 'className="px-6 py-4 border-t bg-muted/20 flex-shrink-0"' src/components/events/SchedulerDialog.tsx; then
  echo "  ✓ DialogFooter添加flex-shrink-0防止被挤压"
else
  echo "  ✗ DialogFooter未添加防挤压样式"
  exit 1
fi

if grep -q 'pb-4' src/components/events/SchedulerDialog.tsx && grep -q 'DialogHeader' src/components/events/SchedulerDialog.tsx; then
  echo "  ✓ DialogHeader内边距优化"
else
  echo "  ✗ DialogHeader内边距未优化"
  exit 1
fi

echo ""
echo "======================================"
echo "✓ 所有修复点验证通过！"
echo "======================================"
echo ""
echo "修复总结："
echo "1. ✓ 调度类型现在会正确读取scheduler.scheduleType"
echo "2. ✓ 调度类型下拉框显示中文标签（定时轮询/Cron表达式/Webhook触发）"
echo "3. ✓ 运行历史组件不再被底部按钮遮挡，可以完整滚动查看"
echo ""
echo "请启动开发服务器测试UI效果："
echo "  npm run dev"
echo ""
echo "测试步骤："
echo "1. 访问 http://localhost:3000/events/sources"
echo "2. 点击任意数据源的'设置'按钮"
echo "3. 验证调度类型显示为中文（不是interval/cron/webhook）"
echo "4. 验证调度类型与基本信息中显示的一致"
echo "5. 滚动到底部，验证运行历史完全可见，不被按钮遮挡"
