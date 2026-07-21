#!/bin/bash
# 远程访问修复脚本

set -e

echo "🔧 AI投资分析系统 - 远程访问修复"
echo "=================================="
echo ""

# 1. 检查服务状态
echo "📋 Step 1: 检查服务状态"
echo "-----------------------------------"

# 检查 Next.js 服务
if lsof -i :3000 > /dev/null 2>&1; then
    echo "✅ Next.js 服务正在运行 (端口 3000)"
    NEXTJS_PID=$(lsof -ti :3000)
    echo "   PID: $NEXTJS_PID"
else
    echo "❌ Next.js 服务未运行"
    echo "   请运行: npm run dev"
    exit 1
fi

# 检查 Python 数据服务
if lsof -i :8000 > /dev/null 2>&1; then
    echo "✅ Python 数据服务正在运行 (端口 8000)"
    PYTHON_PID=$(lsof -ti :8000)
    echo "   PID: $PYTHON_PID"
else
    echo "⚠️  Python 数据服务未运行"
    echo "   这可能导致数据加载失败"
    echo "   启动命令: cd data-service && python main.py"
fi

echo ""

# 2. 检查网络配置
echo "📡 Step 2: 检查网络配置"
echo "-----------------------------------"

# 获取本机 IP 地址
LOCAL_IPS=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}')
echo "本机 IP 地址:"
echo "$LOCAL_IPS" | while read ip; do
    echo "   - $ip"
done

echo ""

# 3. 测试本地 API 访问
echo "🧪 Step 3: 测试 API 访问"
echo "-----------------------------------"

# 测试 localhost
echo "测试 localhost:3000/api/market/overview ..."
if curl -s -f http://localhost:3000/api/market/overview > /dev/null 2>&1; then
    echo "✅ localhost 访问成功"
else
    echo "❌ localhost 访问失败"
fi

# 测试每个 IP 地址
echo "$LOCAL_IPS" | while read ip; do
    echo "测试 $ip:3000/api/market/overview ..."
    if curl -s -f -m 5 http://$ip:3000/api/market/overview > /dev/null 2>&1; then
        echo "✅ $ip 访问成功"
    else
        echo "❌ $ip 访问失败 (可能被防火墙拦截)"
    fi
done

echo ""

# 4. 重启 Next.js 服务
echo "🔄 Step 4: 重启 Next.js 服务"
echo "-----------------------------------"
echo "是否重启 Next.js 服务以应用新配置？(y/N)"
read -r RESTART

if [[ "$RESTART" =~ ^[Yy]$ ]]; then
    echo "正在重启 Next.js 服务..."

    # 杀死现有进程
    if [ ! -z "$NEXTJS_PID" ]; then
        echo "停止现有服务 (PID: $NEXTJS_PID)..."
        kill $NEXTJS_PID
        sleep 2
    fi

    echo ""
    echo "✅ 服务已停止"
    echo ""
    echo "请手动重新启动服务:"
    echo "   npm run dev"
    echo ""
else
    echo "⏭️  跳过重启"
fi

echo ""
echo "=================================="
echo "🎯 远程访问地址:"
echo "-----------------------------------"
echo "$LOCAL_IPS" | while read ip; do
    echo "   http://$ip:3000/dashboard"
done
echo ""
echo "💡 提示:"
echo "   - 如果远程访问失败，请检查防火墙设置"
echo "   - WebSocket 错误不影响功能，仅热更新不可用"
echo "   - 确保 Python 数据服务已启动"
echo "=================================="
