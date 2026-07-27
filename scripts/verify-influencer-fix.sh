#!/bin/bash

echo "=========================================="
echo "   大V添加功能验证脚本"
echo "=========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. 检查服务状态
echo "1. 检查服务状态..."
echo ""

# 检查数据服务
if lsof -i :8000 > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} 数据服务运行中 (端口 8000)"
else
    echo -e "${RED}✗${NC} 数据服务未运行 (端口 8000)"
    echo "   请运行: cd data-service && python3 main.py"
    exit 1
fi

# 检查Next.js服务
if lsof -i :3000 > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Next.js服务运行中 (端口 3000)"
else
    echo -e "${RED}✗${NC} Next.js服务未运行 (端口 3000)"
    echo "   请运行: npm run dev"
    exit 1
fi

echo ""

# 2. 检查配置文件
echo "2. 检查B站配置..."
echo ""

CONFIG_FILE="data-service/config/bilibili_config.json"
if [ -f "$CONFIG_FILE" ]; then
    echo -e "${GREEN}✓${NC} 配置文件存在: $CONFIG_FILE"

    # 检查Cookie长度
    COOKIE_LENGTH=$(python3 -c "import json; f=open('$CONFIG_FILE'); c=json.load(f); print(len(c.get('cookie_str','')))")
    if [ "$COOKIE_LENGTH" -gt 100 ]; then
        echo -e "${GREEN}✓${NC} Cookie配置完整 (长度: $COOKIE_LENGTH)"
    else
        echo -e "${YELLOW}⚠${NC}  Cookie配置可能不完整 (长度: $COOKIE_LENGTH)"
    fi
else
    echo -e "${RED}✗${NC} 配置文件不存在: $CONFIG_FILE"
fi

echo ""

# 3. 测试验证接口（带超时）
echo "3. 测试验证接口（5秒超时）..."
echo ""

TEST_RESULT=$(timeout 6 curl -s -X POST http://localhost:8000/api/influencers/validate \
    -H "Content-Type: application/json" \
    -d '{"platform": "bilibili", "accountId": "21262795"}' 2>&1)

CURL_EXIT_CODE=$?

if [ $CURL_EXIT_CODE -eq 124 ]; then
    echo -e "${YELLOW}⚠${NC}  验证接口超时（超过6秒）"
    echo "   前端会在5秒后自动切换到手动模式"
elif echo "$TEST_RESULT" | grep -q '"success":true'; then
    echo -e "${GREEN}✓${NC} 验证成功"
    NAME=$(echo "$TEST_RESULT" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data['data']['name'])" 2>/dev/null)
    if [ -n "$NAME" ]; then
        echo "   用户名: $NAME"
    fi
else
    echo -e "${YELLOW}⚠${NC}  验证失败（API限制或其他错误）"
    echo "   错误信息: $(echo "$TEST_RESULT" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('detail','未知错误'))" 2>/dev/null)"
    echo "   前端会自动切换到手动模式"
fi

echo ""

# 4. 检查前端组件更新
echo "4. 检查前端组件..."
echo ""

VALIDATOR_FILE="src/components/influencers/PlatformValidator.tsx"
if grep -q "跳过验证，手动填写" "$VALIDATOR_FILE"; then
    echo -e "${GREEN}✓${NC} '跳过验证'按钮已添加"
else
    echo -e "${RED}✗${NC} '跳过验证'按钮未找到"
fi

if grep -q "AbortController" "$VALIDATOR_FILE"; then
    echo -e "${GREEN}✓${NC} 5秒超时机制已实现"
else
    echo -e "${RED}✗${NC} 超时机制未找到"
fi

echo ""

# 5. 生成测试报告
echo "=========================================="
echo "   验证完成"
echo "=========================================="
echo ""
echo "使用步骤："
echo ""
echo "1. 访问: ${YELLOW}http://localhost:3000/events/influencers/new${NC}"
echo ""
echo "2. 输入信息："
echo "   - 平台: B站"
echo "   - 账号ID: 21262795"
echo ""
echo "3. 两种方式："
echo ""
echo "   ${GREEN}方式A（推荐）:${NC}"
echo "   - 点击 '跳过验证，手动填写' 按钮"
echo "   - 手动输入:"
echo "     • 名称: 钞能力毛毛"
echo "     • 主页: https://space.bilibili.com/21262795"
echo "     • 领域: 财经"
echo ""
echo "   ${GREEN}方式B:${NC}"
echo "   - 点击 '验证并获取信息'"
echo "   - 如果验证失败或超时，会自动切换到手动模式"
echo "   - 等待提示后手动填写信息"
echo ""
echo "4. 配置监控参数后点击'添加大V'"
echo ""
echo "=========================================="
