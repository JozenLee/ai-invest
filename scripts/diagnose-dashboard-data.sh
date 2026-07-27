#!/bin/bash

echo "=========================================="
echo "仪表盘数据链路诊断"
echo "=========================================="
echo ""

# 检查 Python 数据服务
echo "1. 检查 Python 数据服务状态"
echo "------------------------------------------"
if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo "✅ Python 数据服务运行正常 (端口 8000)"
    curl -s http://localhost:8000/health | python3 -m json.tool
else
    echo "❌ Python 数据服务未响应"
    exit 1
fi
echo ""

# 检查 Next.js 服务
echo "2. 检查 Next.js 服务状态"
echo "------------------------------------------"
if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "✅ Next.js 服务运行正常 (端口 3000)"
else
    echo "❌ Next.js 服务未响应"
    exit 1
fi
echo ""

# 测试市场指数数据
echo "3. 测试市场指数数据 (Python 服务)"
echo "------------------------------------------"
OVERVIEW_PYTHON=$(curl -s http://localhost:8000/api/market/overview)
echo "$OVERVIEW_PYTHON" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if data.get('success') and data.get('data', {}).get('indices'):
    indices = data['data']['indices']
    print(f'✅ 返回 {len(indices)} 个指数')
    for idx in indices[:3]:
        print(f\"  - {idx['name']}: 价格={idx['price']}, 涨跌幅={idx['changePct']}%\")
else:
    print('❌ 数据格式异常')
    print(json.dumps(data, indent=2, ensure_ascii=False))
"
echo ""

# 测试市场指数数据 (Next.js API)
echo "4. 测试市场指数数据 (Next.js API)"
echo "------------------------------------------"
OVERVIEW_NEXTJS=$(curl -s http://localhost:3000/api/market/overview)
echo "$OVERVIEW_NEXTJS" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if data.get('success') and data.get('data', {}).get('indices'):
    indices = data['data']['indices']
    print(f'✅ 返回 {len(indices)} 个指数')
    for idx in indices[:3]:
        print(f\"  - {idx['name']}: 价格={idx['price']}, 涨跌幅={idx['changePct']}%\")
else:
    print('❌ 数据格式异常')
    print(json.dumps(data, indent=2, ensure_ascii=False))
"
echo ""

# 测试资金流向数据
echo "5. 测试资金流向数据 (Python 服务)"
echo "------------------------------------------"
CAPITAL_PYTHON=$(curl -s http://localhost:8000/api/capital-flow/macro)
echo "$CAPITAL_PYTHON" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if data.get('success') and data.get('data'):
    market = data['data'].get('market', {})
    northbound = data['data'].get('northbound', {})
    print(f\"✅ 资金流向数据正常\")
    print(f\"  - 机构资金: {market.get('institutionalNet', 0)}亿 ({market.get('institutionalPct', 0)}%)\")
    print(f\"  - 散户资金: {market.get('retailNet', 0)}亿 ({market.get('retailPct', 0)}%)\")
    print(f\"  - 北向资金: {northbound.get('net', 0)}亿\")
    print(f\"  - 市场情绪: {market.get('sentiment', 50)}\")
    print(f\"  - 数据质量: {data['data'].get('dataQuality', 'unknown')}\")
else:
    print('❌ 数据格式异常')
    print(json.dumps(data, indent=2, ensure_ascii=False))
"
echo ""

# 测试资金流向数据 (Next.js API)
echo "6. 测试资金流向数据 (Next.js API)"
echo "------------------------------------------"
CAPITAL_NEXTJS=$(curl -s http://localhost:3000/api/market/capital-flow)
echo "$CAPITAL_NEXTJS" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if data.get('success') and data.get('data'):
    market = data['data'].get('market', {})
    northbound = data['data'].get('northbound', {})
    print(f\"✅ 资金流向数据正常\")
    print(f\"  - 机构资金: {market.get('institutionalNet', 0)}亿 ({market.get('institutionalPct', 0)}%)\")
    print(f\"  - 散户资金: {market.get('retailNet', 0)}亿 ({market.get('retailPct', 0)}%)\")
    print(f\"  - 北向资金: {northbound.get('net', 0)}亿\")
    print(f\"  - 市场情绪: {market.get('sentiment', 50)}\")
    print(f\"  - 数据质量: {data['data'].get('dataQuality', 'unknown')}\")
else:
    print('❌ 数据格式异常')
    print(json.dumps(data, indent=2, ensure_ascii=False))
"
echo ""

# 测试板块资金流向
echo "7. 测试板块资金流向"
echo "------------------------------------------"
echo "$CAPITAL_NEXTJS" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if data.get('success') and data.get('data'):
    inflow = data['data'].get('topInflowSectors', [])
    outflow = data['data'].get('topOutflowSectors', [])
    print(f\"✅ 板块数据正常\")
    print(f\"  流入板块: {len(inflow)} 个\")
    if inflow:
        print(f\"    Top3: {inflow[0]['sector']} ({inflow[0]['netFlow']}亿, {inflow[0]['changePct']}%)\")
    print(f\"  流出板块: {len(outflow)} 个\")
else:
    print('❌ 板块数据异常')
"
echo ""

echo "=========================================="
echo "诊断完成"
echo "=========================================="
