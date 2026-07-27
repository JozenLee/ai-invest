#!/bin/bash
# 快速测试增强版资金流向功能

echo "🧪 测试增强版资金流向功能"
echo "================================"
echo ""

# 测试1: Python分析函数
echo "1️⃣ 测试Python分析函数..."
cd data-service
python3 << 'PYEOF'
from routers.advanced_capital_flow import (
    _analyze_consecutive_trend,
    _analyze_volume_amplification,
    _analyze_price_flow_divergence
)

# 模拟数据
mock_sectors = [
    {"sector": "半导体", "mainForceNet": 15.5, "changePct": 2.3},
    {"sector": "新能源", "mainForceNet": 12.8, "changePct": 1.8},
    {"sector": "人工智能", "mainForceNet": -8.2, "changePct": -1.5},
]

print("📊 测试数据:")
for s in mock_sectors:
    print(f"  {s['sector']}: 净流入{s['mainForceNet']}亿, 涨跌{s['changePct']}%")

print("\n📈 分析结果:")

# 持续流入趋势
trend = _analyze_consecutive_trend(mock_sectors)
print(f"  ✓ 持续流入趋势: {trend['direction']}, 强度: {trend['strength']}, 累计: {trend['totalNet']}亿")

# 成交量放大
volume = _analyze_volume_amplification(mock_sectors)
print(f"  ✓ 成交量放大: {volume['amplification']}x, {'已放大' if volume['isAmplified'] else '正常'}")

# 价格资金背离
divergence = _analyze_price_flow_divergence(mock_sectors)
print(f"  ✓ 价格资金背离: {divergence['divergenceType']}, {'有背离' if divergence['isDivergent'] else '无背离'}")
print(f"    信号: {divergence['signal']}")
PYEOF

cd ..
echo ""

# 测试2: TypeScript类型检查
echo "2️⃣ TypeScript类型检查..."
if npm run typecheck 2>&1 | grep -q "error"; then
    echo "  ❌ 类型检查失败"
else
    echo "  ✅ 类型检查通过"
fi

echo ""
echo "================================"
echo "✅ 测试完成！"
echo ""
echo "📝 下一步:"
echo "  1. 启动Python服务: cd data-service && python main.py"
echo "  2. 启动Next.js: npm run dev"
echo "  3. 访问: http://localhost:3000/dashboard"
echo "  4. 运行完整验证: ./scripts/verify-capital-flow-enhancement.sh"
