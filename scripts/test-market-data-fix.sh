#!/bin/bash
# 测试市场数据修复效果

echo "========================================="
echo "测试市场数据是否显示最新收盘价"
echo "========================================="
echo ""

# 1. 测试数据服务API
echo "1. 测试数据服务 (http://localhost:8000)"
echo "-------------------------------------------"
curl -s http://localhost:8000/api/market/overview | python3 -c "
import sys, json
data = json.load(sys.stdin)
if data['success']:
    print('✓ 数据服务正常')
    print('\n主要指数价格:')
    for idx in data['data']['indices']:
        if idx['code'] in ['sh000001', 'sz399001', 'sz399006', 'sh000688', 'sh000300']:
            print(f\"  {idx['name']:8s}: {idx['price']:>10.2f}  ({idx['changePct']:>6.2f}%)\")
    print(f"\n数据时间: {data['data']['timestamp']}")
    print(f"市场状态: {data['data']['meta']['statusText']}")
else:
    print('✗ 数据服务失败:', data.get('error'))
"
echo ""

# 2. 对比日线数据（真实收盘价）
echo "2. 对比日线收盘价（真实数据）"
echo "-------------------------------------------"
python3 << 'EOF'
import akshare as ak
from datetime import datetime

codes = {
    'sh000001': '上证指数',
    'sz399001': '深证成指',
    'sz399006': '创业板指'
}

print('最新日线收盘价:')
for code, name in codes.items():
    try:
        df = ak.stock_zh_index_daily(symbol=code)
        if not df.empty:
            latest = df.iloc[-1]
            close_price = float(latest['close'])
            date = str(latest['date'])
            print(f"  {name:8s}: {close_price:>10.2f}  (日期: {date})")
    except Exception as e:
        print(f"  {name:8s}: 获取失败 ({e})")
EOF
echo ""

# 3. 测试Next.js API
echo "3. 测试Next.js API (http://localhost:3000)"
echo "-------------------------------------------"
curl -s http://localhost:3000/api/market/overview | python3 -c "
import sys, json
data = json.load(sys.stdin)
if data['success']:
    print('✓ Next.js API正常')
    print('\n主要指数价格:')
    for idx in data['data']['indices']:
        if idx['code'] in ['sh000001', 'sz399001', 'sz399006']:
            print(f\"  {idx['name']:8s}: {idx['price']:>10.2f}\")
else:
    print('✗ Next.js API失败')
"
echo ""

echo "========================================="
echo "测试完成"
echo "========================================="
