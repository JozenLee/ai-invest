#!/bin/bash

echo "快速UI检查"
echo "=========================================="
echo ""

# 等待页面加载
sleep 3

echo "检查筛选框显示的映射表定义..."
echo ""

# 检查代码中的映射表
grep -A 5 "sentimentDisplayMap" src/app/\(dashboard\)/events/feed/page.tsx

echo ""
echo "检查SelectValue是否使用了映射表..."
echo ""

grep -B 2 -A 2 "SelectValue" src/app/\(dashboard\)/events/feed/page.tsx | head -20

echo ""
echo "=========================================="
echo "请手动访问 http://localhost:3000/events/feed"
echo "检查："
echo "1. 情感筛选框显示：全部情感 / 利好 / 中性 / 利空"
echo "2. 排序筛选框显示：最新发布 / 情感最强 / 影响力最高"
echo "3. 选择不同选项后，显示的是中文而不是英文"
echo "=========================================="
