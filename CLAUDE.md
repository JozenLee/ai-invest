# AI投资分析系统

## 项目概述
面向个人投资者的智能投研分析平台，聚焦AI硬件产业链，投资标的为指数ETF。

## 技术栈
- **前端**: Next.js 16 (App Router) + React 19 + TypeScript
- **UI**: shadcn/ui + Tailwind CSS v4
- **数据库**: SQLite + Prisma ORM v7 + better-sqlite3适配器
- **AI**: Claude API (Anthropic SDK)
- **数据服务**: FastAPI + AKShare (Python)

## 环境配置
1. 复制环境变量模板：`cp .env.example .env`
2. 编辑 `.env` 文件，填写 `ANTHROPIC_API_KEY` 等配置

## 常用命令
```bash
# Next.js应用
npm run dev          # 启动开发服务器
npm run build        # 构建生产版本
npm run db:migrate   # 运行数据库迁移
npm run db:seed      # 填充种子数据
npm run typecheck    # TypeScript类型检查

# Python数据服务
cd data-service
pip install -r requirements.txt
python main.py       # 启动数据服务 (端口8000)

# AI功能测试
python3 test-ai-classification.py

# 验收测试
bash scripts/acceptance-test.sh
```

## 项目结构
```
ai-invest/
├── src/
│   ├── app/                    # Next.js App Router页面
│   │   ├── (dashboard)/        # 主应用页面
│   │   │   ├── dashboard/      # 仪表盘
│   │   │   ├── events/         # 事件资讯
│   │   │   ├── graph/          # 知识图谱
│   │   │   └── analysis/       # AI分析
│   │   └── api/                # API路由
│   │       ├── market/         # 市场数据
│   │       ├── events/         # 事件分析
│   │       ├── graph/          # 图谱操作
│   │       └── analysis/       # ETF分析
│   ├── components/             # React组件
│   ├── lib/                    # 核心库
│   │   ├── ai/                 # Claude API封装
│   │   ├── db/                 # 数据库连接
│   │   ├── indicators/         # 技术指标计算
│   │   └── services/           # 业务服务
│   └── hooks/                  # React Hooks
├── prisma/                     # 数据库Schema和迁移
├── data-service/               # Python数据服务
│   ├── main.py                 # FastAPI入口
│   ├── routers/                # API路由
│   └── services/               # 业务逻辑
├── scripts/                    # 工具脚本
└── docs/                       # 项目文档
```

## 开发阶段 (已完成)
- [x] Phase 1: 基础框架搭建 - Next.js + Prisma + shadcn/ui
- [x] Phase 2: 基础数据层 - 市场数据API、技术指标引擎
- [x] Phase 3: 事件驱动层 - 新闻采集、Claude API集成
- [x] Phase 4: 知识图谱层 - 图谱数据、传导路径分析
- [x] Phase 5: 决策层 - ETF评分系统、AI分析报告
- [x] Phase 6: 集成优化 - 端到端测试、验收

## API接口

### 市场数据
- `GET /api/market/overview` - 市场概览（指数行情）
- `GET /api/market/capital-flow` - 资金流向

### 事件驱动
- `GET /api/events/feed` - 新闻列表
- `POST /api/events/analyze` - 事件分析
- `GET /api/events/trends/[sector]` - 领域趋势

### 知识图谱
- `GET /api/graph/nodes` - 图谱节点
- `GET /api/graph/edges` - 图谱边
- `GET /api/graph/tree` - 树形结构
- `GET /api/graph/full` - 完整图谱
- `POST /api/graph/propagation` - 传导路径分析
- `GET /api/graph/changelog` - 变更日志

### 决策分析
- `POST /api/analysis/etf` - ETF AI分析

## 验收测试
运行 `bash scripts/acceptance-test.sh` 执行自动化验收测试，覆盖所有API接口。

## 注意事项
- MVP阶段仅支持A股ETF，不直接推荐个股
- 所有分析结果不构成投资建议
- Python数据服务需要单独启动
- API服务不可用时会自动降级到模拟数据
