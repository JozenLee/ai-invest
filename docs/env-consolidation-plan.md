# 环境变量文件整合方案

## 当前状况分析

### 文件清单
```
ai-invest/
├── .env                          # 根目录开发环境配置
├── .env.production              # 根目录生产环境配置（完整版）
├── .env.production.example      # 生产环境模板
└── data-service/
    ├── .env                      # Python服务配置
    └── .env.example              # Python服务模板
```

### 实际使用的环境变量

#### Next.js 应用使用
```bash
# 核心配置（必需）
ANTHROPIC_API_KEY
ANTHROPIC_BASE_URL
CLAUDE_MODEL
DATABASE_URL

# 服务端口（可选）
DATA_SERVICE_URL
PYTHON_API_URL

# 其他（可选）
NODE_ENV
APP_NAME
APP_URL
CRON_SECRET_KEY
```

#### Python 数据服务使用
```bash
# 核心配置（必需）
ANTHROPIC_API_KEY
ANTHROPIC_BASE_URL
CLAUDE_MODEL

# 可选配置
REDIS_URL
TUSHARE_TOKEN
```

### 问题诊断

1. **冗余配置**: `.env.production` 中有大量配置项在代码中未实际使用
2. **重复维护**: `data-service/.env` 与根目录 `.env` 内容重复
3. **环境混淆**: `.env` 实际是生产配置，但按照 Next.js 约定应该是开发环境

## 推荐方案：统一配置 + 符号链接

### 方案优点
✅ **单一数据源**: 只维护一个配置文件  
✅ **避免同步**: Python 服务通过符号链接读取根目录配置  
✅ **符合约定**: 遵循 Next.js 环境变量最佳实践  
✅ **易于维护**: 减少配置漂移风险

### 文件结构（推荐）
```
ai-invest/
├── .env.local                    # 本地开发/生产配置（不提交）
├── .env.example                  # 配置模板（提交到Git）
└── data-service/
    └── .env -> ../.env.local     # 符号链接指向根目录
```

### 配置内容

#### `.env.local` (新建，不提交到Git)
```bash
# ==================== AI 服务配置 ====================
ANTHROPIC_API_KEY=sk-d65f4c3e3c4849fb168f0450491e7f070f1eafb7f6ee64abb874db661fe4cf2f
ANTHROPIC_BASE_URL=https://apiclaude.cc
CLAUDE_MODEL=claude-opus-4-8

# ==================== 数据库配置 ====================
DATABASE_URL=file:./prisma/dev.db

# ==================== 服务端口配置 ====================
DATA_SERVICE_URL=http://localhost:8000
PYTHON_API_URL=http://localhost:8000

# ==================== 可选配置 ====================
# Redis（可选）
# REDIS_URL=redis://localhost:6379/0

# Tushare（可选）
# TUSHARE_TOKEN=

# ==================== 环境配置 ====================
NODE_ENV=production
TZ=Asia/Shanghai
LOG_LEVEL=info
```

#### `.env.example` (提交到Git，作为模板)
```bash
# ==================== AI 服务配置 ====================
# Anthropic API Key（必需）
# 官方: https://console.anthropic.com/
# 第三方: https://apiclaude.cc
ANTHROPIC_API_KEY=your-api-key-here
ANTHROPIC_BASE_URL=https://api.anthropic.com
CLAUDE_MODEL=claude-sonnet-4-20250514

# ==================== 数据库配置 ====================
DATABASE_URL=file:./prisma/dev.db

# ==================== 服务端口配置 ====================
DATA_SERVICE_URL=http://localhost:8000
PYTHON_API_URL=http://localhost:8000

# ==================== 可选配置 ====================
# Redis 缓存（可选）
# REDIS_URL=redis://localhost:6379/0

# Tushare Token（可选，用于获取 A 股数据）
# 获取地址: https://tushare.pro/
# TUSHARE_TOKEN=

# ==================== 环境配置 ====================
NODE_ENV=development
TZ=Asia/Shanghai
LOG_LEVEL=info
```

## 迁移步骤

### 1. 备份当前配置
```bash
cp .env .env.backup
cp .env.production .env.production.backup
cp data-service/.env data-service/.env.backup
```

### 2. 创建新的配置文件
```bash
# 创建 .env.local（从当前 .env 复制）
cp .env .env.local

# 创建 .env.example 模板
cp .env.production.example .env.example
```

### 3. 删除旧文件
```bash
rm .env
rm .env.production
rm .env.production.example
rm data-service/.env
rm data-service/.env.example
```

### 4. 创建符号链接
```bash
cd data-service
ln -s ../.env.local .env
cd ..
```

### 5. 更新 .gitignore
```bash
# 确保 .env.local 不被提交
echo ".env.local" >> .gitignore
```

### 6. 验证配置
```bash
# 测试 Next.js
npm run dev

# 测试 Python 服务
cd data-service && python main.py
```

## Next.js 环境变量加载顺序

Next.js 按以下优先级加载环境变量：
1. `.env.$(NODE_ENV).local` (优先级最高)
2. `.env.local` (开发/生产通用)
3. `.env.$(NODE_ENV)` (环境特定)
4. `.env` (默认)

我们使用 `.env.local` 的优点：
- ✅ 不会被 Git 提交（Next.js 默认忽略）
- ✅ 开发和生产都可以使用同一文件
- ✅ 可以覆盖 `.env` 中的默认值

## 替代方案：保留独立配置

如果不想使用符号链接（某些系统可能不支持），可以保留独立文件但精简内容：

### 方案B：精简版独立配置

#### 根目录 `.env.local`
```bash
# Next.js + Python 通用配置
ANTHROPIC_API_KEY=sk-d65f4c3e3c4849fb168f0450491e7f070f1eafb7f6ee64abb874db661fe4cf2f
ANTHROPIC_BASE_URL=https://apiclaude.cc
CLAUDE_MODEL=claude-opus-4-8
DATABASE_URL=file:./prisma/dev.db

# Next.js 特定
DATA_SERVICE_URL=http://localhost:8000
PYTHON_API_URL=http://localhost:8000
NODE_ENV=production
TZ=Asia/Shanghai
LOG_LEVEL=info
```

#### `data-service/.env`
```bash
# 从根目录复制核心配置，或手动同步
ANTHROPIC_API_KEY=sk-d65f4c3e3c4849fb168f0450491e7f070f1eafb7f6ee64abb874db661fe4cf2f
ANTHROPIC_BASE_URL=https://apiclaude.cc
CLAUDE_MODEL=claude-opus-4-8
DATABASE_URL=file:../prisma/dev.db
```

**缺点**: 需要手动同步两个文件

## 推荐选择

🎯 **推荐使用方案A（符号链接）**

理由：
1. **维护成本最低**: 只需维护一个配置文件
2. **符合 Next.js 最佳实践**: 使用 `.env.local` 
3. **避免配置漂移**: Python 服务自动使用最新配置
4. **简单直观**: 配置集中在一个地方

## 注意事项

1. **DATABASE_URL 路径差异**:
   - Next.js: `file:./prisma/dev.db` (相对根目录)
   - Python: `file:../prisma/dev.db` (相对 data-service/)
   - 解决方案: 使用绝对路径或在 Python 代码中处理相对路径

2. **符号链接在 Windows 上**:
   - 需要管理员权限创建符号链接
   - 替代方案: 使用方案B的独立配置

3. **环境变量优先级**:
   - `.env.local` 优先级高于 `.env`
   - 可以在 `.env` 中设置默认值，`.env.local` 中覆盖

## 后续维护

- 新增环境变量时更新 `.env.example`
- 团队成员首次克隆项目时：`cp .env.example .env.local`
- 定期检查 `.env.example` 与实际使用的变量是否同步
