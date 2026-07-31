# AI投资分析系统

面向个人投资者的智能投研分析平台，聚焦AI硬件产业链，投资标的为指数ETF。

## 快速开始

```bash
# 安装依赖
npm install
cd data-service && pip install -r requirements.txt

# 启动开发服务
npm run dev                    # Next.js (http://localhost:3000)
cd data-service && python3 main.py  # Python API (http://localhost:8000)

# 数据库操作
npm run db:migrate             # 运行迁移
npm run db:seed                # 填充数据
```

## 技术栈

- **前端**: Next.js 16 + React 19 + TypeScript
- **UI**: shadcn/ui + Tailwind CSS v4
- **数据库**: SQLite + Prisma ORM v7
- **AI**: Claude API (Anthropic)
- **数据服务**: FastAPI + AKShare (Python)

## 核心功能

- 📊 市场数据监控（指数、ETF、资金流向）
- 📰 AI驱动的新闻事件分析
- 🕸️ 产业链知识图谱
- 🤖 智能投资分析报告
- 📈 投资组合管理

## 知识图谱构建器

Phase 1已完成，支持AI辅助的图谱构建：

```bash
# 访问审核工作台
open http://localhost:3000/graph/review

# 触发抽取任务（API）
curl -X POST http://localhost:3000/api/graph/extract \
  -H "Content-Type: application/json" \
  -d '{"text": "...", "type": "news"}'
```

详细文档: [docs/graph-builder-usage.md](docs/graph-builder-usage.md)

## 大V管理增强功能

### 自动化添加
支持Bilibili平台账号自动验证和信息获取，只需输入UID即可自动填充名称、头像、领域等信息。

### 灵活调度
支持轮询模式（固定周期）和定时模式（每日特定时间），可根据大V活跃规律配置。

### 数据生命周期
可配置动态数据保留天数，系统自动清理过期数据，节省存储空间。

详见：[大V管理增强功能使用指南](./docs/INFLUENCER_ENHANCEMENT_GUIDE.md)

## 评分系统 (Phase 1)

跨行业知识图谱评分系统，覆盖10个热门行业方向：

- **三维评分**: 市场基本面(50%) + 新闻舆情(30%) + 图谱结构(20%)
- **增量更新**: 根据新闻、市场、结构变化自动更新
- **Dashboard集成**: 热度TOP10、子图健康度可视化
- **API接口**: 节点评分、排行榜、洞察数据

详见 [评分系统使用指南](docs/scoring-system-usage.md)

## 文档

- [项目说明](CLAUDE.md) - 项目概览和常用命令
- [快速开始](QUICK_START.md) - 详细启动指南
- [部署指南](DEPLOYMENT.md) - 生产环境部署
- [开发指南](NEXT_SESSION_GUIDE.md) - 新会话启动和开发路径
- [开发计划](docs/DEVELOPMENT-PLAN.md) - 详细技术规划
- [进度追踪](docs/PROGRESS.md) - 当前开发进度

## 项目状态

当前进度: **40% 完成**

- ✅ Phase 1: 基础框架搭建 (100%)
- ✅ Phase 2: 管理增强 (100%)
- ⏸️ Phase 3: 功能扩展 (0%)
- ⏸️ Phase 4: 架构优化 (0%)

## License

MIT
