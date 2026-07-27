#!/bin/bash
# 明天收盘后数据验证脚本
# 运行时间: 2026-07-29 15:05, 15:10, 15:15

set -e

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

TOMORROW="2026-07-29"
CURRENT_TIME=$(date +"%H:%M:%S")

echo "=========================================="
echo "明天收盘后数据验证"
echo "=========================================="
echo "执行时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "目标日期: $TOMORROW"
echo ""

# 检查是否是明天
TODAY=$(date +%Y-%m-%d)
if [ "$TODAY" != "$TOMORROW" ]; then
    echo -e "${YELLOW}⚠ 注意: 当前日期 ($TODAY) 不是目标日期 ($TOMORROW)${NC}"
    echo "   这是一个预演测试"
    echo ""
fi

# 检查当前时间
HOUR=$(date +%H)
MINUTE=$(date +%M)
TIME_NUM=$((HOUR * 60 + MINUTE))
MARKET_CLOSE=$((15 * 60))  # 15:00
MINUTES_AFTER_CLOSE=$((TIME_NUM - MARKET_CLOSE))

if [ $TIME_NUM -lt $MARKET_CLOSE ]; then
    echo -e "${YELLOW}⚠ 当前时间 ($CURRENT_TIME) 早于收盘时间 (15:00)${NC}"
    echo "   建议在 15:05, 15:10, 15:15 分别运行此脚本"
    echo ""
elif [ $MINUTES_AFTER_CLOSE -le 20 ]; then
    echo -e "${BLUE}ℹ 当前时间 ($CURRENT_TIME) 是收盘后 $MINUTES_AFTER_CLOSE 分钟${NC}"
    echo "   这是验证数据更新的关键时间窗口"
    echo ""
else
    echo -e "${GREEN}✓ 当前时间 ($CURRENT_TIME) 是收盘后 $MINUTES_AFTER_CLOSE 分钟${NC}"
    echo "   数据应该已完全更新"
    echo ""
fi

# 1. 检查服务状态
echo "=========================================="
echo "1. 检查服务状态"
echo "=========================================="
echo ""

echo "检查 Python 数据服务..."
if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Python 数据服务运行中"
else
    echo -e "${RED}✗${NC} Python 数据服务未运行"
    exit 1
fi

echo "检查 Next.js 应用..."
if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Next.js 应用运行中"
else
    echo -e "${RED}✗${NC} Next.js 应用未运行"
    exit 1
fi

# 2. 获取指数数据
echo ""
echo "=========================================="
echo "2. 验证指数数据"
echo "=========================================="
echo ""

echo "请求 Python 服务指数数据..."
OVERVIEW_DATA=$(curl -s http://localhost:8000/api/market/overview)
echo "$OVERVIEW_DATA" | python3 -m json.tool > /tmp/overview_data.json

# 提取关键字段
DATA_DATE=$(echo "$OVERVIEW_DATA" | python3 -c "
import sys, json
data = json.load(sys.stdin)
meta = data.get('data', {}).get('meta', {})
print(meta.get('dataDate', meta.get('lastTradingDate', 'unknown')))
" 2>/dev/null || echo "unknown")

IS_REALTIME=$(echo "$OVERVIEW_DATA" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('data', {}).get('meta', {}).get('isRealtime', False))
" 2>/dev/null || echo "False")

STATUS=$(echo "$OVERVIEW_DATA" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('data', {}).get('meta', {}).get('statusText', 'unknown'))
" 2>/dev/null || echo "unknown")

SH000001_PRICE=$(echo "$OVERVIEW_DATA" | python3 -c "
import sys, json
data = json.load(sys.stdin)
indices = data.get('data', {}).get('indices', [])
for idx in indices:
    if idx.get('code') == 'sh000001':
        print(idx.get('price', 0))
        break
" 2>/dev/null || echo "0")

echo "数据日期: $DATA_DATE"
echo "实时状态: $IS_REALTIME"
echo "市场状态: $STATUS"
echo "上证指数: $SH000001_PRICE"
echo ""

# 验证数据日期
if [ "$DATA_DATE" = "$TOMORROW" ] || [ "$DATA_DATE" = "$TODAY" ]; then
    echo -e "${GREEN}✓${NC} 指数数据日期正确"
else
    echo -e "${RED}✗${NC} 指数数据日期错误，期望 $TOMORROW，实际 $DATA_DATE"
fi

# 验证市场状态
if [ "$IS_REALTIME" = "False" ]; then
    echo -e "${GREEN}✓${NC} 市场状态正确 (非实时，收盘后)"
else
    echo -e "${YELLOW}⚠${NC} 市场状态异常 (显示为实时)"
fi

# 3. 获取资金流向数据
echo ""
echo "=========================================="
echo "3. 验证资金流向数据"
echo "=========================================="
echo ""

echo "请求 Python 服务资金流向数据..."
CAPITAL_DATA=$(curl -s http://localhost:8000/api/capital-flow/macro)
echo "$CAPITAL_DATA" | python3 -m json.tool > /tmp/capital_data.json

CAPITAL_DATE=$(echo "$CAPITAL_DATA" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('data', {}).get('date', 'unknown'))
" 2>/dev/null || echo "unknown")

DATA_QUALITY=$(echo "$CAPITAL_DATA" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('data', {}).get('dataQuality', 'unknown'))
" 2>/dev/null || echo "unknown")

INSTITUTIONAL_NET=$(echo "$CAPITAL_DATA" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('data', {}).get('market', {}).get('institutionalNet', 0))
" 2>/dev/null || echo "0")

NORTHBOUND_NET=$(echo "$CAPITAL_DATA" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('data', {}).get('northbound', {}).get('net', 0))
" 2>/dev/null || echo "0")

echo "数据日期: $CAPITAL_DATE"
echo "数据质量: $DATA_QUALITY"
echo "主力净流入: $INSTITUTIONAL_NET 亿"
echo "北向净流入: $NORTHBOUND_NET 亿"
echo ""

# 验证资金流向日期
if [ "$CAPITAL_DATE" = "$TOMORROW" ] || [ "$CAPITAL_DATE" = "$TODAY" ]; then
    echo -e "${GREEN}✓${NC} 资金流向数据日期正确"
else
    echo -e "${RED}✗${NC} 资金流向数据日期错误，期望 $TOMORROW，实际 $CAPITAL_DATE"
fi

# 4. 测试 Next.js API
echo ""
echo "=========================================="
echo "4. 验证 Next.js API"
echo "=========================================="
echo ""

echo "测试 /api/market/overview..."
NEXTJS_OVERVIEW=$(curl -s http://localhost:3000/api/market/overview)
NEXTJS_DATE=$(echo "$NEXTJS_OVERVIEW" | python3 -c "
import sys, json
data = json.load(sys.stdin)
meta = data.get('data', {}).get('meta', {})
print(meta.get('dataDate', meta.get('lastTradingDate', 'unknown')))
" 2>/dev/null || echo "unknown")

if [ "$NEXTJS_DATE" = "$TOMORROW" ] || [ "$NEXTJS_DATE" = "$TODAY" ]; then
    echo -e "${GREEN}✓${NC} Next.js overview API 数据日期正确"
else
    echo -e "${RED}✗${NC} Next.js overview API 数据日期错误: $NEXTJS_DATE"
fi

echo ""
echo "测试 /api/market/capital-flow..."
NEXTJS_CAPITAL=$(curl -s http://localhost:3000/api/market/capital-flow)
NEXTJS_CAPITAL_DATE=$(echo "$NEXTJS_CAPITAL" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('data', {}).get('date', 'unknown'))
" 2>/dev/null || echo "unknown")

if [ "$NEXTJS_CAPITAL_DATE" = "$TOMORROW" ] || [ "$NEXTJS_CAPITAL_DATE" = "$TODAY" ]; then
    echo -e "${GREEN}✓${NC} Next.js capital-flow API 数据日期正确"
else
    echo -e "${RED}✗${NC} Next.js capital-flow API 数据日期错误: $NEXTJS_CAPITAL_DATE"
fi

# 5. 测试强制刷新
echo ""
echo "=========================================="
echo "5. 测试强制刷新功能"
echo "=========================================="
echo ""

echo "测试带 ?refresh=true 参数的请求..."
REFRESH_OVERVIEW=$(curl -s "http://localhost:3000/api/market/overview?refresh=true")
REFRESH_DATE=$(echo "$REFRESH_OVERVIEW" | python3 -c "
import sys, json
data = json.load(sys.stdin)
meta = data.get('data', {}).get('meta', {})
print(meta.get('dataDate', meta.get('lastTradingDate', 'unknown')))
" 2>/dev/null || echo "unknown")

if [ "$REFRESH_DATE" = "$TOMORROW" ] || [ "$REFRESH_DATE" = "$TODAY" ]; then
    echo -e "${GREEN}✓${NC} 强制刷新功能正常"
else
    echo -e "${YELLOW}⚠${NC} 强制刷新后数据日期: $REFRESH_DATE"
fi

# 6. 数据一致性检查
echo ""
echo "=========================================="
echo "6. 数据一致性检查"
echo "=========================================="
echo ""

if [ "$DATA_DATE" = "$CAPITAL_DATE" ]; then
    echo -e "${GREEN}✓${NC} 指数数据和资金流向数据日期一致"
else
    echo -e "${RED}✗${NC} 数据日期不一致:"
    echo "   指数数据: $DATA_DATE"
    echo "   资金流向: $CAPITAL_DATE"
fi

if [ "$NEXTJS_DATE" = "$NEXTJS_CAPITAL_DATE" ]; then
    echo -e "${GREEN}✓${NC} Next.js API 数据日期一致"
else
    echo -e "${YELLOW}⚠${NC} Next.js API 数据日期不一致"
fi

# 7. 生成验证报告
echo ""
echo "=========================================="
echo "7. 验证总结"
echo "=========================================="
echo ""

REPORT_FILE="/tmp/dashboard-verification-$(date +%H%M).txt"

{
    echo "仪表盘数据验证报告"
    echo "===================="
    echo "验证时间: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "收盘后: $MINUTES_AFTER_CLOSE 分钟"
    echo ""
    echo "指数数据:"
    echo "  日期: $DATA_DATE"
    echo "  上证指数: $SH000001_PRICE"
    echo "  市场状态: $STATUS"
    echo ""
    echo "资金流向:"
    echo "  日期: $CAPITAL_DATE"
    echo "  数据质量: $DATA_QUALITY"
    echo "  主力净流入: $INSTITUTIONAL_NET 亿"
    echo "  北向净流入: $NORTHBOUND_NET 亿"
    echo ""
    echo "Next.js API:"
    echo "  Overview 日期: $NEXTJS_DATE"
    echo "  Capital-flow 日期: $NEXTJS_CAPITAL_DATE"
    echo ""
} > "$REPORT_FILE"

echo "验证报告已保存到: $REPORT_FILE"
cat "$REPORT_FILE"

# 8. 建议操作
echo ""
echo "=========================================="
echo "8. 建议操作"
echo "=========================================="
echo ""

if [ $MINUTES_AFTER_CLOSE -lt 5 ]; then
    echo -e "${YELLOW}建议操作:${NC}"
    echo "  - 收盘后 5 分钟内，数据可能尚未完全更新"
    echo "  - 建议在 15:10 和 15:15 再次运行此脚本"
    echo "  - 命令: bash scripts/verify-tomorrow-data.sh"
elif [ $MINUTES_AFTER_CLOSE -lt 15 ]; then
    echo -e "${YELLOW}建议操作:${NC}"
    echo "  - 打开浏览器访问 http://localhost:3000/dashboard"
    echo "  - 检查页面显示的数据日期和市场状态"
    echo "  - 点击「刷新数据」按钮测试手动刷新"
    echo "  - 如果看到旧数据，等待自动刷新或手动刷新"
else
    echo -e "${GREEN}建议操作:${NC}"
    echo "  - 数据应该已完全更新"
    echo "  - 打开浏览器验证最终结果"
    echo "  - 对比东方财富网数据确认准确性"
    echo "  - 如果数据正确，验证通过 ✓"
fi

echo ""
echo "=========================================="
echo "验证完成"
echo "=========================================="
echo ""
echo "详细数据已保存:"
echo "  - /tmp/overview_data.json (指数数据)"
echo "  - /tmp/capital_data.json (资金流向)"
echo "  - $REPORT_FILE (验证报告)"
echo ""
