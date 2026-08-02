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
│   │   │   ├── events/         # 事件资讯（含影响者管理）
│   │   │   ├── graph/          # 知识图谱
│   │   │   └── analysis/       # AI分析
│   │   └── api/                # API路由
│   │       ├── market/         # 市场数据
│   │       ├── events/         # 事件分析
│   │       ├── influencers/    # 影响者管理
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
│   ├── core/                   # 基础设施层 ⭐ 新增
│   │   ├── http_client.py      # 统一HTTP客户端
│   │   ├── rate_limiter.py     # 令牌桶限流器
│   │   ├── config_manager.py   # 平台配置管理
│   │   ├── user_agent.py       # User-Agent轮换
│   │   └── parsers.py          # 数据解析工具
│   ├── providers/              # 数据提供者
│   │   ├── akshare_provider.py     # AKShare数据源
│   │   ├── tushare_provider.py     # Tushare数据源
│   │   ├── newsnow_provider.py     # NewsNow新闻聚合
│   │   ├── zhihu_provider.py       # 知乎 ⭐ 新增
│   │   ├── weibo_provider.py       # 微博 ⭐ 新增
│   │   ├── bilibili_provider.py    # Bilibili ⭐ 新增
│   │   ├── douyin_provider.py      # 抖音 ⭐ 新增
│   │   ├── xiaohongshu_provider.py # 小红书 ⭐ 新增
│   │   └── alipay_provider.py      # 支付宝生活号 ⭐ 新增
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
- [x] Phase 7: 多平台数据采集 - 基础设施层、影响者管理 ⭐ 新增

## API接口

### 市场数据
- `GET /api/market/overview` - 市场概览（指数行情）
- `GET /api/market/capital-flow` - 资金流向

### 事件驱动
- `GET /api/events/feed` - 新闻列表
- `POST /api/events/analyze` - 事件分析
- `GET /api/events/trends/[sector]` - 领域趋势

### 影响者管理 ⭐ 新增
- `GET /api/influencers` - 影响者列表
- `GET /api/influencers/[id]` - 影响者详情
- `POST /api/influencers` - 创建影响者
- `PUT /api/influencers/[id]` - 更新影响者
- `DELETE /api/influencers/[id]` - 删除影响者
- `POST /api/influencers/[id]/fetch` - 手动触发内容采集

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

## 多平台数据采集 ⭐ 新增
系统支持从多个社交媒体和内容平台采集影响者动态：
- **支持平台**: 知乎、微博、Bilibili、抖音、小红书、支付宝生活号
- **核心能力**: 用户信息获取、内容列表采集、增量更新
- **基础设施**: HTTP客户端、限流器、配置管理、数据解析
- **详细文档**: 
  - 实施报告: `docs/multi-platform-implementation-report.md`
  - 配置指南: `docs/platform-provider-guide.md`
  - 使用手册: `data-service/core/USAGE.md`

---

## Claude Code工作偏好
- **不输出任务总结**: 完成任务后无需提供总结或回顾，直接结束即可
