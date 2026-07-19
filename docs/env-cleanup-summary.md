# 环境变量清理总结

## 清理日期
2026-07-20

## 问题描述
项目中存在多个 `.env` 文件，其中包含重复的环境变量：
- `ANTHROPIC_API_KEY` 和 `ANTHROPIC_AUTH_TOKEN` 实际上是相同的值
- 这两个变量在代码中作为备选项使用，造成配置冗余

## 清理方案
统一使用 `ANTHROPIC_API_KEY`，移除 `ANTHROPIC_AUTH_TOKEN`。

### 理由
1. **官方推荐**: Anthropic SDK 官方文档主要使用 `ANTHROPIC_API_KEY`
2. **减少混淆**: 单一变量名更清晰
3. **兼容性**: SDK 内部仍然支持 `ANTHROPIC_AUTH_TOKEN` 作为备用，但我们的应用代码统一使用 `ANTHROPIC_API_KEY`

## 修改文件清单

### 环境变量文件
1. ✅ `/ai-invest/.env` - 移除 `ANTHROPIC_AUTH_TOKEN`
2. ✅ `/ai-invest/.env.production` - 移除 `ANTHROPIC_AUTH_TOKEN`
3. ⚠️  `/ai-invest/.env.production.example` - 保持模板格式（仅包含 `ANTHROPIC_API_KEY`）
4. ✅ `/ai-invest/data-service/.env` - 移除 `ANTHROPIC_AUTH_TOKEN`
5. ⚠️  `/ai-invest/data-service/.env.example` - 保持模板格式（仅包含 `ANTHROPIC_API_KEY`）

### 代码文件
1. ✅ `/data-service/routers/ai.py` - 移除备用读取逻辑
   - 第30行: `os.getenv("ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_AUTH_TOKEN")` → `os.getenv("ANTHROPIC_API_KEY")`
   - 第132行: 同样修改

## 当前环境变量配置

### Next.js 应用 (根目录 .env)
```bash
# AI 服务配置
ANTHROPIC_API_KEY=sk-d65f4c3e3c4849fb168f0450491e7f070f1eafb7f6ee64abb874db661fe4cf2f
ANTHROPIC_BASE_URL=https://apiclaude.cc
CLAUDE_MODEL=claude-opus-4-8

# 数据库配置
DATABASE_URL=file:../prisma/dev.db

# 日志配置
LOG_LEVEL=info

# 环境配置
NODE_ENV=production
TZ=Asia/Shanghai
```

### Python 数据服务 (data-service/.env)
```bash
# AI 服务配置
ANTHROPIC_API_KEY=sk-d65f4c3e3c4849fb168f0450491e7f070f1eafb7f6ee64abb874db661fe4cf2f
ANTHROPIC_BASE_URL=https://apiclaude.cc
CLAUDE_MODEL=claude-opus-4-8

# 数据库配置
DATABASE_URL=file:../prisma/dev.db

# 日志配置
LOG_LEVEL=info

# 环境配置
NODE_ENV=production
TZ=Asia/Shanghai
```

## 验证步骤

### 1. 检查 Next.js 服务
```bash
npm run dev
# 访问 http://localhost:3000 验证 AI 功能正常
```

### 2. 检查 Python 数据服务
```bash
cd data-service
python main.py
# 访问 http://localhost:8000/docs 测试 /ai/health 接口
```

### 3. 运行完整验收测试
```bash
bash scripts/acceptance-test.sh
```

## 注意事项

1. **环境变量优先级**: 仅使用 `ANTHROPIC_API_KEY`
2. **第三方 API**: 使用 `ANTHROPIC_BASE_URL` 配置自定义端点
3. **模型版本**: 通过 `CLAUDE_MODEL` 指定使用的 Claude 模型
4. **安全性**: `.env` 文件已在 `.gitignore` 中，不会提交到版本控制

## 后续维护

- 新增环境变量时，同步更新 `.env.example` 模板文件
- 仅使用 `ANTHROPIC_API_KEY`，不再引入 `ANTHROPIC_AUTH_TOKEN`
- 定期检查环境变量配置的一致性
