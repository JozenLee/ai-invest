#!/bin/bash

# CI测试快速运行脚本

set -e

echo "======================================"
echo "  AI投资分析系统 - CI测试套件"
echo "======================================"
echo ""

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 检查服务是否运行
check_service() {
    local port=$1
    local name=$2

    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} $name 正在运行 (端口 $port)"
        return 0
    else
        echo -e "${RED}✗${NC} $name 未运行 (端口 $port)"
        return 1
    fi
}

# 启动服务
start_services() {
    echo "检查服务状态..."
    echo ""

    # 检查Next.js
    if ! check_service 3000 "Next.js应用"; then
        echo -e "${YELLOW}启动 Next.js 应用...${NC}"
        npm run dev &
        NEXTJS_PID=$!
        sleep 5
    fi

    # 检查Python数据服务
    if ! check_service 8000 "Python数据服务"; then
        echo -e "${YELLOW}启动 Python 数据服务...${NC}"
        cd data-service && python main.py &
        PYTHON_PID=$!
        cd ..
        sleep 3
    fi

    echo ""
    echo -e "${GREEN}服务已就绪${NC}"
    echo ""
}

# 运行测试
run_tests() {
    local test_type=$1

    case $test_type in
        api)
            echo "======================================"
            echo "  运行 API 层测试"
            echo "======================================"
            npm run test:api
            ;;
        e2e)
            echo "======================================"
            echo "  运行 E2E 测试"
            echo "======================================"
            npm run test:e2e
            ;;
        market)
            echo "======================================"
            echo "  运行市场数据模块测试"
            echo "======================================"
            echo "API测试..."
            npm run test:api tests/api/market
            echo ""
            echo "E2E测试..."
            npm run test:e2e:market
            ;;
        events)
            echo "======================================"
            echo "  运行资讯流模块测试"
            echo "======================================"
            echo "API测试..."
            npm run test:api tests/api/events
            echo ""
            echo "E2E测试..."
            npm run test:e2e:events
            ;;
        trends)
            echo "======================================"
            echo "  运行领域趋势模块测试"
            echo "======================================"
            echo "API测试..."
            npm run test:api tests/api/trends
            echo ""
            echo "E2E测试..."
            npm run test:e2e:trends
            ;;
        datasources)
            echo "======================================"
            echo "  运行数据源模块测试"
            echo "======================================"
            echo "API测试..."
            npm run test:api tests/api/datasources
            echo ""
            echo "E2E测试..."
            npm run test:e2e:datasources
            ;;
        all)
            echo "======================================"
            echo "  运行所有测试"
            echo "======================================"
            npm run test:ci
            ;;
        *)
            echo -e "${RED}未知的测试类型: $test_type${NC}"
            show_usage
            exit 1
            ;;
    esac
}

# 显示使用说明
show_usage() {
    echo "使用方法: $0 [测试类型] [选项]"
    echo ""
    echo "测试类型:"
    echo "  api          - 运行所有API层测试"
    echo "  e2e          - 运行所有E2E测试"
    echo "  market       - 运行市场数据模块测试"
    echo "  events       - 运行资讯流模块测试"
    echo "  trends       - 运行领域趋势模块测试"
    echo "  datasources  - 运行数据源模块测试"
    echo "  all          - 运行所有测试（默认）"
    echo ""
    echo "选项:"
    echo "  --no-start   - 不自动启动服务（假设服务已运行）"
    echo "  --help       - 显示此帮助信息"
    echo ""
    echo "示例:"
    echo "  $0 api                    # 运行API测试"
    echo "  $0 market                 # 运行市场数据模块测试"
    echo "  $0 all --no-start         # 运行所有测试（服务已运行）"
}

# 清理函数
cleanup() {
    echo ""
    echo "清理中..."

    if [ ! -z "$NEXTJS_PID" ]; then
        kill $NEXTJS_PID 2>/dev/null || true
    fi

    if [ ! -z "$PYTHON_PID" ]; then
        kill $PYTHON_PID 2>/dev/null || true
    fi
}

# 设置清理陷阱
trap cleanup EXIT

# 主函数
main() {
    local test_type="all"
    local start_services=true

    # 解析参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            --help)
                show_usage
                exit 0
                ;;
            --no-start)
                start_services=false
                shift
                ;;
            *)
                test_type=$1
                shift
                ;;
        esac
    done

    # 启动服务（如果需要）
    if [ "$start_services" = true ]; then
        start_services
    fi

    # 运行测试
    run_tests $test_type

    echo ""
    echo -e "${GREEN}======================================"
    echo "  测试完成！"
    echo "======================================${NC}"
}

# 运行主函数
main "$@"
