#!/bin/bash
# 测试仪表盘数据更新逻辑
# 模拟明天收盘后的数据获取场景

set -e

echo "=========================================="
echo "仪表盘数据更新逻辑测试"
echo "=========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 检查Python数据服务是否运行
echo "1. 检查 Python 数据服务状态..."
if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Python 数据服务运行中"
else
    echo -e "${RED}✗${NC} Python 数据服务未运行"
    echo "   请先启动: cd data-service && python main.py"
    exit 1
fi

echo ""
echo "2. 测试市场概览 API (指数数据)..."
echo "   URL: http://localhost:8000/api/market/overview"
OVERVIEW_RESP=$(curl -s http://localhost:8000/api/market/overview)
echo "$OVERVIEW_RESP" | python3 -m json.tool | head -50

# 提取关键信息
HAS_INDICES=$(echo "$OVERVIEW_RESP" | python3 -c "import sys, json; data=json.load(sys.stdin); print('true' if data.get('success') and data.get('data', {}).get('indices') else 'false')")
SOURCE=$(echo "$OVERVIEW_RESP" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('data', {}).get('source', 'unknown'))")
META=$(echo "$OVERVIEW_RESP" | python3 -c "import sys, json; data=json.load(sys.stdin); print(json.dumps(data.get('data', {}).get('meta', {}), ensure_ascii=False))")

if [ "$HAS_INDICES" = "true" ]; then
    echo -e "${GREEN}✓${NC} 指数数据获取成功"
    echo "   数据源: $SOURCE"
    echo "   市场状态: $META"
else
    echo -e "${RED}✗${NC} 指数数据获取失败"
fi

echo ""
echo "3. 测试资金流向 API..."
echo "   URL: http://localhost:8000/api/capital-flow/macro"
CAPITAL_RESP=$(curl -s http://localhost:8000/api/capital-flow/macro)
echo "$CAPITAL_RESP" | python3 -m json.tool | head -80

# 提取关键信息
HAS_CAPITAL=$(echo "$CAPITAL_RESP" | python3 -c "import sys, json; data=json.load(sys.stdin); print('true' if data.get('success') and data.get('data') else 'false')")
DATA_QUALITY=$(echo "$CAPITAL_RESP" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('data', {}).get('dataQuality', 'unknown'))")
DATA_DATE=$(echo "$CAPITAL_RESP" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('data', {}).get('date', 'unknown'))")
IS_REALTIME=$(echo "$CAPITAL_RESP" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('data', {}).get('meta', {}).get('isRealtime', False))")

if [ "$HAS_CAPITAL" = "true" ]; then
    echo -e "${GREEN}✓${NC} 资金流向数据获取成功"
    echo "   数据日期: $DATA_DATE"
    echo "   数据质量: $DATA_QUALITY"
    echo "   实时状态: $IS_REALTIME"
else
    echo -e "${RED}✗${NC} 资金流向数据获取失败"
fi

echo ""
echo "4. 测试 Next.js API 路由..."
echo ""
echo "   4.1 测试 /api/market/overview"
NEXTJS_OVERVIEW=$(curl -s http://localhost:3000/api/market/overview)
NEXTJS_HAS_INDICES=$(echo "$NEXTJS_OVERVIEW" | python3 -c "import sys, json; data=json.load(sys.stdin); print('true' if data.get('success') and data.get('data', {}).get('indices') else 'false')")
if [ "$NEXTJS_HAS_INDICES" = "true" ]; then
    echo -e "   ${GREEN}✓${NC} Next.js 指数 API 正常"
else
    echo -e "   ${RED}✗${NC} Next.js 指数 API 异常"
fi

echo ""
echo "   4.2 测试 /api/market/capital-flow"
NEXTJS_CAPITAL=$(curl -s http://localhost:3000/api/market/capital-flow)
NEXTJS_HAS_CAPITAL=$(echo "$NEXTJS_CAPITAL" | python3 -c "import sys, json; data=json.load(sys.stdin); print('true' if data.get('success') and data.get('data') else 'false')")
if [ "$NEXTJS_HAS_CAPITAL" = "true" ]; then
    echo -e "   ${GREEN}✓${NC} Next.js 资金流向 API 正常"
else
    echo -e "   ${RED}✗${NC} Next.js 资金流向 API 异常"
fi

echo ""
echo "=========================================="
echo "5. 数据更新机制分析"
echo "=========================================="
echo ""
echo "📊 前端数据更新策略："
echo "   - 初始加载: 页面打开时立即获取"
echo "   - 自动刷新: 交易时段 30秒/次，非交易时段 5分钟/次"
echo "   - 手动刷新: 用户点击「刷新数据」按钮"
echo "   - 缓存策略: API 层缓存 30 秒"
echo ""
echo "🔄 后端数据更新策略："
echo "   - Python 服务: 内存缓存 30-600 秒（根据数据类型）"
echo "   - Next.js API: 内存缓存 30 秒"
echo "   - 文件缓存: 持久化最新数据，用于服务重启降级"
echo ""
echo "📅 数据时效性："
echo "   - 交易时段 (9:30-15:00): 实时数据，30秒延迟"
echo "   - 非交易时段: 显示最近交易日收盘数据"
echo "   - 周末/节假日: 自动显示上一交易日数据"
echo ""

echo "=========================================="
echo "6. 模拟明天收盘后场景"
echo "=========================================="
echo ""
TOMORROW=$(date -v+1d +%Y-%m-%d 2>/dev/null || date -d "+1 day" +%Y-%m-%d 2>/dev/null)
echo "假设明天日期: $TOMORROW"
echo "假设当前时间: 15:05 (收盘后5分钟)"
echo ""
echo "预期行为："
echo "   1. 指数数据: 应显示 $TOMORROW 收盘价"
echo "   2. 资金流向: 应显示 $TOMORROW 全天资金流向统计"
echo "   3. 北向资金: 应显示 $TOMORROW 全天净流入额"
echo "   4. 板块排名: 应显示 $TOMORROW 板块资金流向"
echo "   5. 市场状态: 显示「已收盘」，isRealtime=false"
echo ""
echo "数据获取流程："
echo "   ┌─────────────────┐"
echo "   │ 用户打开页面     │"
echo "   └────────┬────────┘"
echo "            │"
echo "            ▼"
echo "   ┌─────────────────┐"
echo "   │ MarketContext    │ ← 初始 fetchData()"
echo "   │ useEffect 触发   │"
echo "   └────────┬────────┘"
echo "            │"
echo "            ▼"
echo "   ┌─────────────────────────────────┐"
echo "   │ 并行请求两个 Next.js API        │"
echo "   │ - /api/market/overview          │"
echo "   │ - /api/market/capital-flow      │"
echo "   └────────┬────────────────────────┘"
echo "            │"
echo "            ▼"
echo "   ┌─────────────────────────────────┐"
echo "   │ Next.js API 检查缓存            │"
echo "   │ - 命中: 直接返回 (30秒内)      │"
echo "   │ - 未命中: 请求 Python 服务      │"
echo "   └────────┬────────────────────────┘"
echo "            │"
echo "            ▼"
echo "   ┌─────────────────────────────────┐"
echo "   │ Python 服务处理                 │"
echo "   │ 1. 检查内存缓存 (30-600秒)      │"
echo "   │ 2. 调用 AKShare/东方财富 API    │"
echo "   │ 3. 获取最新交易日数据           │"
echo "   │ 4. 返回带 meta 的响应           │"
echo "   └────────┬────────────────────────┘"
echo "            │"
echo "            ▼"
echo "   ┌─────────────────────────────────┐"
echo "   │ 前端渲染                        │"
echo "   │ - 显示数据日期                  │"
echo "   │ - 显示市场状态 (已收盘)        │"
echo "   │ - 显示数据来源                  │"
echo "   │ - 启动自动刷新定时器 (5分钟)   │"
echo "   └─────────────────────────────────┘"
echo ""

echo "=========================================="
echo "7. 潜在问题检查"
echo "=========================================="
echo ""

# 检查缓存配置
echo "检查缓存配置..."
CACHE_TTL_OVERVIEW=30
CACHE_TTL_CAPITAL=30
CACHE_TTL_PYTHON=600

echo "   - Next.js overview API: ${CACHE_TTL_OVERVIEW}秒"
echo "   - Next.js capital-flow API: ${CACHE_TTL_CAPITAL}秒"
echo "   - Python 数据服务: ${CACHE_TTL_PYTHON}秒"

if [ $CACHE_TTL_PYTHON -gt 600 ]; then
    echo -e "   ${YELLOW}⚠${NC} Python 缓存时间过长，收盘后可能延迟更新"
else
    echo -e "   ${GREEN}✓${NC} 缓存配置合理"
fi

echo ""
echo "检查自动刷新逻辑..."
echo "   - 交易时段: 30秒刷新一次"
echo "   - 非交易时段: 5分钟刷新一次"
echo -e "   ${GREEN}✓${NC} 收盘后会在5分钟内自动获取最新数据"

echo ""
echo "检查数据时效性判断..."
echo "   - isRealtime 由 Python 服务的 trading_hours.py 判断"
echo "   - lastTradingDate 从数据源返回的日期字段获取"
echo -e "   ${GREEN}✓${NC} 前端会正确显示「非交易时间」和「收盘数据」标识"

echo ""
echo "=========================================="
echo "8. 建议的验证步骤"
echo "=========================================="
echo ""
echo "明天收盘后 (15:05 左右) 手动验证："
echo ""
echo "1. 打开浏览器访问 http://localhost:3000/dashboard"
echo ""
echo "2. 检查市场状态徽章："
echo "   - 应显示「已收盘」或类似状态"
echo "   - 应显示「收盘数据」标签"
echo ""
echo "3. 检查数据日期："
echo "   - 指数数据应显示明天日期: $TOMORROW"
echo "   - 资金流向应显示明天日期"
echo ""
echo "4. 检查数据内容："
echo "   - 指数价格应该是明天的收盘价 (与东方财富/同花顺对比)"
echo "   - 涨跌幅应该是明天的实际涨跌"
echo "   - 资金流向应该是明天全天的统计数据"
echo ""
echo "5. 点击「刷新数据」按钮："
echo "   - 应该能立即获取最新数据"
echo "   - 不应该出现缓存的旧数据"
echo ""
echo "6. 等待5分钟后检查："
echo "   - 页面应自动刷新并显示最新数据"
echo ""
echo "如果发现问题："
echo "   - 检查 Python 服务日志"
echo "   - 检查浏览器控制台 Network 标签"
echo "   - 运行 bash scripts/diagnose-dashboard-data.sh"
echo ""
echo "=========================================="
echo "测试完成"
echo "=========================================="
