#!/bin/bash

echo "=== 测试多选筛选框交互Bug修复 ==="
echo ""

echo "测试场景1: 选择科技类分类"
echo "预期: 只返回科技类相关新闻"
curl -s "http://localhost:3000/api/events/feed?categoryIds=cat_ai,cat_chip&limit=3" | jq -r '.data.total as $total | "结果数量: \($total)"'
echo ""

echo "测试场景2: 跨组选择（科技+财经）"
echo "预期: 返回科技和财经类新闻"
curl -s "http://localhost:3000/api/events/feed?categoryIds=cat_ai,cat_capital&limit=3" | jq -r '.data.total as $total | "结果数量: \($total)"'
echo ""

echo "测试场景3: 只选财经类"
echo "预期: 只返回财经类新闻"
curl -s "http://localhost:3000/api/events/feed?categoryIds=cat_capital,cat_macro&limit=3" | jq -r '.data.total as $total | "结果数量: \($total)"'
echo ""

echo "✅ 后端API测试完成"
echo ""
echo "前端测试步骤:"
echo "1. 访问 http://localhost:3000/events/feed"
echo "2. 点击'科技类'筛选框，选择'人工智能'"
echo "3. 验证: 科技类显示'已选 1 项'，财经类无'清空'按钮"
echo "4. 点击'财经类'筛选框，选择'资本市场'"
echo "5. 验证: 两个筛选框都显示'已选 1 项'，都有'清空'按钮"
echo "6. 在'科技类'点击'清空'"
echo "7. 验证: 科技类清空，财经类保持选中状态"
