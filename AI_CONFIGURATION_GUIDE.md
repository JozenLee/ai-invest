# AI 服务配置指南

## ⚠️ 当前状态

**代码已准备就绪，但需要正确配置环境变量**

- ✅ 代码支持第三方 Anthropic API
- ✅ 延迟初始化功能已实现
- ✅ 支持自定义 base_url
- ❌ PM2 环境变量传递存在问题
- ✅ 手动测试验证代码工作正常

## 📋 配置信息

### 第三方 API 配置

```bash
ANTHROPIC_API_KEY=sk-d65f4c3e3c4849fb168f0450491e7f070f1eafb7f6ee64abb874db661fe4cf2f
ANTHROPIC_BASE_URL=https://apiclaude.cc
CLAUDE_MODEL=claude-opus-4-8
```

## ✅ 验证成功的启动方式

### 方式 1: 直接设置环境变量并启动（推荐）

```bash
cd data-service

export ANTHROPIC_API_KEY="sk-d65f4c3e3c4849fb168f0450491e7f070f1eafb7f6ee64abb874db661fe4cf2f"
export ANTHROPIC_BASE_URL="https://apiclaude.cc"
export CLAUDE_MODEL="claude-opus-4-8"

python3 main.py
```

**验证结果**: ✅ 成功
- 环境变量正确加载
- 延迟初始化正常工作
- Anthropic 客户端成功创建
- 第三方 API 正常识别

## 🧪 测试验证

### 1. 测试健康检查

```bash
curl http://localhost:8000/api/ai/health | python3 -m json.tool
```

期望输出：
```json
{
  "status": "healthy",
  "api_key_configured": true,
  "model": "claude-opus-4-8",
  "base_url": "https://apiclaude.cc"
}
```

### 2. 测试事件分析

```bash
curl -X POST http://localhost:8000/api/ai/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "title": "英伟达发布H200芯片",
    "content": "英伟达发布新一代AI芯片H200，性能提升50%",
    "source": "测试",
    "publishTime": "2026-07-20T08:00:00"
  }'
```

## 🎯 快速启动（用于测试）

```bash
# 1. 停止所有现有服务
pkill -f "python3 main.py"

# 2. 启动 Python 数据服务（在新终端）
cd data-service
export ANTHROPIC_API_KEY="sk-d65f4c3e3c4849fb168f0450491e7f070f1eafb7f6ee64abb874db661fe4cf2f"
export ANTHROPIC_BASE_URL="https://apiclaude.cc"
export CLAUDE_MODEL="claude-opus-4-8"
python3 main.py

# 3. 启动 Next.js 服务（在另一个终端）
npm run dev

# 4. 测试 AI 服务
curl http://localhost:8000/api/ai/health | python3 -m json.tool
```

## 📝 代码修改总结

### 已修改的文件

1. **data-service/main.py**
   - 添加 `from dotenv import load_dotenv`
   - 在导入路由前调用 `load_dotenv()`

2. **data-service/routers/ai.py**
   - 实现 `get_anthropic_client()` 延迟初始化函数
   - 支持 `ANTHROPIC_BASE_URL` 配置
   - 支持 `ANTHROPIC_AUTH_TOKEN` 作为备选 API key
   - 更新所有端点使用延迟初始化

3. **ecosystem.config.js**
   - 添加完整的环境变量配置

4. **data-service/start.sh**
   - 创建启动脚本，包含环境变量设置

---

**最后更新**: 2026-07-20  
**状态**: 代码就绪，等待环境配置
