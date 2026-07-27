#!/bin/bash
# B站大V添加功能 - UI测试指南

echo "================================================"
echo "B站大V添加功能 - UI验证测试"
echo "================================================"
echo ""

# 检查服务状态
echo "📋 1. 检查服务状态"
echo "-------------------"

# 检查FastAPI
if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo "✅ FastAPI服务运行正常 (端口8000)"
else
    echo "❌ FastAPI服务未运行"
    exit 1
fi

# 检查Next.js
if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "✅ Next.js服务运行正常 (端口3000)"
else
    echo "❌ Next.js服务未运行"
    exit 1
fi

echo ""
echo "🧪 2. 测试API接口"
echo "-------------------"

# 测试验证接口
RESULT=$(curl -s -X POST 'http://localhost:3000/api/influencers/validate' \
  -H 'Content-Type: application/json' \
  -d '{"platform": "bilibili", "accountId": "21262795"}')

if echo "$RESULT" | jq -e '.success == true' > /dev/null 2>&1; then
    echo "✅ 验证接口工作正常"
    echo "   账号名称: $(echo $RESULT | jq -r '.data.name')"
    echo "   账号分类: $(echo $RESULT | jq -r '.data.category')"
else
    echo "❌ 验证接口测试失败"
    echo "$RESULT" | jq .
    exit 1
fi

echo ""
echo "🌐 3. 浏览器UI测试步骤"
echo "-------------------"
echo ""
echo "请在浏览器中执行以下步骤："
echo ""
echo "步骤1: 打开添加大V页面"
echo "   访问: http://localhost:3000/events/influencers/new"
echo ""
echo "步骤2: 填写平台信息"
echo "   - 平台: 选择 [B站]"
echo "   - 账号ID: 输入 [21262795]"
echo ""
echo "步骤3: 点击验证"
echo "   - 点击 [验证并获取信息] 按钮"
echo "   - 等待 5-15秒（可能有重试）"
echo ""
echo "步骤4: 检查验证结果"
echo "   预期结果："
echo "   ✅ 显示 '验证成功！已自动获取账号信息'"
echo "   ✅ 显示用户名称: 钞能力毛毛"
echo "   ✅ 显示头像图片"
echo "   ✅ 显示领域: 未分类"
echo "   ✅ 显示认证状态: 已认证"
echo ""
echo "步骤5: 配置监控参数"
echo "   - 添加标签（可选）: 如 '财经, 投资'"
echo "   - 选择抓取策略: 轮询 或 定时"
echo "   - 设置数据保留天数: 30"
echo ""
echo "步骤6: 提交添加"
echo "   - 点击 [添加大V] 按钮"
echo "   - 等待提交完成"
echo ""
echo "步骤7: 验证成功"
echo "   预期结果："
echo "   ✅ 显示 '添加成功' 提示"
echo "   ✅ 自动跳转到大V详情页"
echo ""
echo "================================================"
echo ""
echo "🔍 故障排查"
echo "-------------------"
echo ""
echo "如果验证失败，检查以下项目："
echo ""
echo "1. 查看浏览器控制台 (F12)"
echo "   - 是否有网络错误？"
echo "   - 是否有API调用失败？"
echo ""
echo "2. 检查API调用路径"
echo "   - 应该调用: /api/influencers/validate"
echo "   - 不应该调用: http://localhost:8000/..."
echo ""
echo "3. 查看后端日志"
echo "   tail -f data-service.log | grep -E 'Bilibili|validate|error'"
echo ""
echo "4. 测试API直接调用"
echo "   curl -X POST 'http://localhost:3000/api/influencers/validate' \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"platform\": \"bilibili\", \"accountId\": \"21262795\"}'"
echo ""
echo "================================================"
echo ""
echo "📝 测试记录表"
echo "-------------------"
echo ""
echo "请填写测试结果："
echo ""
echo "[ ] 步骤1: 页面打开正常"
echo "[ ] 步骤2: 表单填写正常"
echo "[ ] 步骤3: 验证按钮可点击"
echo "[ ] 步骤4: 验证成功，显示用户信息"
echo "[ ] 步骤5: 配置参数正常"
echo "[ ] 步骤6: 提交成功"
echo "[ ] 步骤7: 跳转到详情页"
echo ""
echo "================================================"
echo ""
echo "准备好后，请访问: http://localhost:3000/events/influencers/new"
echo ""

# 自动打开浏览器（macOS）
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "是否自动打开浏览器? (y/n)"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        open "http://localhost:3000/events/influencers/new"
        echo "✅ 已在浏览器中打开测试页面"
    fi
fi
