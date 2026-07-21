#!/bin/bash

# 数据源可用性检查脚本
# 检查所有数据源是否可以正常工作

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 计数器
TOTAL=0
SUCCESS=0
FAILED=0

# 检查服务是否运行
check_service() {
    local service_name=$1
    local url=$2

    echo -e "${BLUE}检查 ${service_name}...${NC}"

    if curl -s -f "$url" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ ${service_name} 运行正常${NC}"
        return 0
    else
        echo -e "${RED}✗ ${service_name} 未运行${NC}"
        return 1
    fi
}

# 检查数据源
check_datasource() {
    local ds_id=$1
    local ds_name=$2

    TOTAL=$((TOTAL + 1))
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}检查数据源 #${TOTAL}: ${ds_name} (${ds_id})${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    # 触发采集测试
    local response=$(curl -s -X POST "http://localhost:8000/api/datasources/${ds_id}/fetch" \
        -H "Content-Type: application/json" 2>&1)

    local http_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
        "http://localhost:8000/api/datasources/${ds_id}/fetch" \
        -H "Content-Type: application/json" 2>&1)

    echo "HTTP状态码: ${http_code}"

    if [ "$http_code" = "200" ]; then
        echo -e "${GREEN}✓ ${ds_name} - 可用${NC}"
        echo "响应: ${response}"
        SUCCESS=$((SUCCESS + 1))
        return 0
    else
        echo -e "${RED}✗ ${ds_name} - 不可用${NC}"
        echo "错误响应: ${response}"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

# 主函数
main() {
    echo "================================================"
    echo "  AI投资分析系统 - 数据源可用性检查"
    echo "================================================"
    echo ""

    # 检查Next.js服务
    if ! check_service "Next.js应用" "http://localhost:3000/api/datasources"; then
        echo -e "${RED}错误: Next.js应用未运行，请先启动: npm run dev${NC}"
        exit 1
    fi
    echo ""

    # 检查Python数据服务
    if ! check_service "Python数据服务" "http://localhost:8000/health"; then
        echo -e "${RED}错误: Python数据服务未运行，请先启动: cd data-service && python main.py${NC}"
        exit 1
    fi
    echo ""

    echo -e "${YELLOW}开始检查数据源...${NC}"
    sleep 2

    # 综合财经媒体
    check_datasource "ds_cls" "财联社"
    sleep 1
    check_datasource "ds_eastmoney" "东方财富"
    sleep 1
    check_datasource "ds_sina_finance" "新浪财经"
    sleep 1
    check_datasource "ds_jiemian" "界面新闻"
    sleep 1
    check_datasource "ds_caixin" "财新网"
    sleep 1

    # 科技媒体
    check_datasource "ds_36kr" "36氪"
    sleep 1
    check_datasource "ds_pingwest" "品玩"
    sleep 1
    check_datasource "ds_geekpark" "极客公园"
    sleep 1
    check_datasource "ds_leiphone" "雷锋网"
    sleep 1

    # 社交媒体
    check_datasource "ds_weibo_tech" "微博-科技"
    sleep 1
    check_datasource "ds_zhihu_finance" "知乎-财经"
    sleep 1
    check_datasource "ds_xueqiu" "雪球"
    sleep 1

    # 视频平台
    check_datasource "ds_bilibili_tech" "B站-科技区"
    sleep 1
    check_datasource "ds_youtube_tech" "YouTube-科技"
    sleep 1
    check_datasource "ds_douyin_finance" "抖音-财经"

    # 总结
    echo ""
    echo ""
    echo "================================================"
    echo -e "${BLUE}检查完成${NC}"
    echo "================================================"
    echo -e "总数: ${TOTAL}"
    echo -e "${GREEN}成功: ${SUCCESS}${NC}"
    echo -e "${RED}失败: ${FAILED}${NC}"

    if [ $FAILED -eq 0 ]; then
        echo ""
        echo -e "${GREEN}🎉 所有数据源都可用！${NC}"
        exit 0
    else
        echo ""
        echo -e "${YELLOW}⚠️  部分数据源不可用，需要检查配置${NC}"
        exit 1
    fi
}

# 执行主函数
main
