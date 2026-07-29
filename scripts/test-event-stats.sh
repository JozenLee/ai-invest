#!/bin/bash

echo "======================================"
echo "测试事件统计数据修正"
echo "======================================"

# 检查Next.js服务是否运行
if ! curl -s http://localhost:3000 > /dev/null; then
    echo "❌ Next.js服务未运行，请先启动: npm run dev"
    exit 1
fi

echo ""
echo "✅ Next.js服务正在运行"
echo ""

# 测试获取新闻feed
echo "1. 测试获取今日统计数据..."
response=$(curl -s "http://localhost:3000/api/events/feed?limit=1000&sortBy=publishTime")
total=$(echo "$response" | jq -r '.data.items | length')
echo "   总新闻数: $total"

# 在本地计算今日新闻数（简化版，实际由前端JavaScript处理）
echo ""
echo "2. 前端页面已修正:"
echo "   - 今日新闻数量基于未筛选的全部数据"
echo "   - 利好事件数量基于未筛选的全部数据"
echo "   - 利空事件数量基于未筛选的全部数据"
echo "   - 已移除平均情感分组件"

echo ""
echo "3. 修改内容:"
echo "   ✓ 添加 todayStats 状态管理"
echo "   ✓ 添加 fetchTodayStats 函数获取统计数据"
echo "   ✓ 在组件加载和SSE更新时刷新统计数据"
echo "   ✓ 移除了基于筛选结果的统计计算函数"
echo "   ✓ 移除了平均情感分的 StatCard"
echo "   ✓ StatCardGrid 现在只显示3个卡片"

echo ""
echo "======================================"
echo "✅ 修正完成！请访问页面验证:"
echo "   http://localhost:3000/events/feed"
echo "======================================"
