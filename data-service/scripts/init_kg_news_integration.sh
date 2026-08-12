#!/bin/bash
# 知识图谱与资讯流联动 - 数据初始化脚本

set -e  # 遇到错误立即退出

echo "=========================================="
echo "知识图谱与资讯流联动 - 数据初始化"
echo "=========================================="
echo ""

# 检查是否在data-service目录
if [ ! -f "main.py" ]; then
    echo "✗ 错误: 请在data-service目录下运行此脚本"
    exit 1
fi

# 检查Python环境
if ! command -v python3 &> /dev/null; then
    echo "✗ 错误: 未找到python3"
    exit 1
fi

# 检查环境变量
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "⚠ 警告: ANTHROPIC_API_KEY未设置，将跳过AI关键词生成"
    SKIP_AI=true
else
    SKIP_AI=false
fi

echo "步骤 1/2: 初始化Segment关键词"
echo "------------------------------------------"
if [ "$SKIP_AI" = true ]; then
    echo "跳过（ANTHROPIC_API_KEY未设置）"
else
    python3 scripts/init_segment_keywords.py
fi
echo ""

echo "步骤 2/2: 映射Tags到Segments"
echo "------------------------------------------"
python3 scripts/map_tags_to_segments.py
echo ""

echo "=========================================="
echo "初始化完成！"
echo "=========================================="
echo ""
echo "接下来您可以："
echo "1. 运行 'npm run dev' 启动前端应用"
echo "2. 访问资讯流页面，使用新的产业筛选功能"
echo "3. 测试新闻分类功能"
echo ""
