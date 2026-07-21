#!/bin/bash
# 市场数据验证工具 - 快速检查UI显示是否为最新收盘价

echo "========================================="
echo "市场数据验证工具"
echo "========================================="
echo ""

# 获取当前市场状态
echo "1. 当前市场状态"
echo "-------------------------------------------"
python3 << 'EOF'
import sys
sys.path.insert(0, '/Users/jozen.lee/ai-softwares/ai-invest/data-service')
from utils.trading_hours import get_market_status
from datetime import datetime

status = get_market_status()
print(f"当前时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print(f"市场状态: {status['statusText']}")
print(f"最近交易日: {status['lastTradingDate']}")
print(f"是否实时: {'是' if status['isRealtime'] else '否'}")
EOF
echo ""

# 检查数据服务
echo "2. 数据服务健康检查"
echo "-------------------------------------------"
if curl -s --max-time 3 http://localhost:8000/health > /dev/null 2>&1; then
    echo "✓ 数据服务运行正常 (http://localhost:8000)"
else
    echo "✗ 数据服务不可用"
    exit 1
fi
echo ""

# 检查UI显示的数据
echo "3. UI显示的指数数据"
echo "-------------------------------------------"
curl -s http://localhost:3000/api/market/overview | python3 -c "
import sys, json
data = json.load(sys.stdin)
if data['success']:
    print('主要指数:')
    for idx in data['data']['indices']:
        if idx['code'] in ['sh000001', 'sz399001', 'sz399006']:
            print(f\"  {idx['name']:8s}: {idx['price']:>10.2f}  ({idx['changePct']:>6.2f}%)\")

    # 检查数据新鲜度
    meta = data['data'].get('meta', {})
    if meta.get('isRealtime'):
        print('\n数据状态: ✓ 实时数据')
    else:
        print(f\"\n数据状态: ⚠️  非实时（{meta.get('statusText', '未知')}）\")
else:
    print('✗ 获取数据失败')
"
echo ""

# 对比真实收盘价
echo "4. 对比真实收盘价（日线数据）"
echo "-------------------------------------------"
python3 << 'EOF'
import akshare as ak
import warnings
warnings.filterwarnings('ignore')

codes = {
    'sh000001': '上证指数',
    'sz399001': '深证成指',
    'sz399006': '创业板指'
}

print('真实收盘价:')
for code, name in codes.items():
    try:
        df = ak.stock_zh_index_daily(symbol=code)
        if not df.empty:
            latest = df.iloc[-1]
            close_price = float(latest['close'])
            date = str(latest['date'])
            print(f"  {name:8s}: {close_price:>10.2f}  (日期: {date})")
    except:
        print(f"  {name:8s}: 获取失败")
EOF
echo ""

echo "========================================="
echo "验证完成"
echo "========================================="
