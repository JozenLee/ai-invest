#!/bin/bash
# 知识图谱与资讯流联动 - 快速启动脚本

set -e

echo "=========================================="
echo "AI投资分析系统 - 快速启动"
echo "=========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 检查是否在项目根目录
if [ ! -f "package.json" ]; then
    echo -e "${RED}✗ 错误: 请在项目根目录运行此脚本${NC}"
    exit 1
fi

echo "== 环境检查 =="
echo ""

# 检查 Neo4j
echo -n "检查 Neo4j ... "
if nc -z localhost 7687 2>/dev/null; then
    echo -e "${GREEN}✓ 运行中${NC}"
else
    echo -e "${YELLOW}⚠ 未运行${NC}"
    echo "请先启动 Neo4j: neo4j start"
    exit 1
fi

# 检查依赖
echo -n "检查 Node.js 依赖 ... "
if [ -d "node_modules" ]; then
    echo -e "${GREEN}✓ 已安装${NC}"
else
    echo -e "${YELLOW}⚠ 未安装${NC}"
    echo "正在安装依赖..."
    npm install
fi

echo ""
echo "== 启动服务 =="
echo ""

# 创建日志目录
mkdir -p logs

# 启动 Python 数据服务
echo -e "${GREEN}启动 Python 数据服务...${NC}"
cd data-service
python main.py > ../logs/data-service.log 2>&1 &
DATA_SERVICE_PID=$!
echo "  PID: $DATA_SERVICE_PID"
cd ..

# 等待数据服务启动
echo -n "等待数据服务就绪 ... "
for i in {1..30}; do
    if curl -s http://localhost:8000/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}✗ 超时${NC}"
        echo "数据服务启动失败，请查看日志: logs/data-service.log"
        kill $DATA_SERVICE_PID 2>/dev/null || true
        exit 1
    fi
    sleep 1
done

# 启动 Next.js 开发服务器
echo -e "${GREEN}启动 Next.js 开发服务器...${NC}"
npm run dev > logs/nextjs.log 2>&1 &
NEXTJS_PID=$!
echo "  PID: $NEXTJS_PID"

# 等待 Next.js 启动
echo -n "等待 Next.js 就绪 ... "
for i in {1..60}; do
    if curl -s http://localhost:3000 > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
        break
    fi
    if [ $i -eq 60 ]; then
        echo -e "${YELLOW}⚠ 超时（但可能正常）${NC}"
        break
    fi
    sleep 1
done

echo ""
echo "=========================================="
echo -e "${GREEN}✓ 服务启动完成！${NC}"
echo "=========================================="
echo ""
echo "访问应用："
echo "  - 主页: http://localhost:3000"
echo "  - 资讯流: http://localhost:3000/events/feed"
echo "  - 知识图谱: http://localhost:3000/graph"
echo ""
echo "API 服务："
echo "  - Python 数据服务: http://localhost:8000"
echo "  - API 文档: http://localhost:8000/docs"
echo ""
echo "进程信息："
echo "  - 数据服务 PID: $DATA_SERVICE_PID"
echo "  - Next.js PID: $NEXTJS_PID"
echo ""
echo "日志文件："
echo "  - 数据服务: logs/data-service.log"
echo "  - Next.js: logs/nextjs.log"
echo ""
echo "停止服务："
echo "  kill $DATA_SERVICE_PID $NEXTJS_PID"
echo "  或运行: ./scripts/stop-services.sh"
echo ""

# 保存 PID 到文件
echo "$DATA_SERVICE_PID" > logs/data-service.pid
echo "$NEXTJS_PID" > logs/nextjs.pid

echo -e "${YELLOW}提示: 按 Ctrl+C 不会停止后台服务，请使用上述命令停止${NC}"
echo ""

# 可选：打开浏览器
if command -v open &> /dev/null; then
    echo "正在打开浏览器..."
    sleep 2
    open http://localhost:3000/events/feed
fi
