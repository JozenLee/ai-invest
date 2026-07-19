# 事件驱动框架重构 - 完整规划文档

**生成日期**: 2026-07-19  
**项目**: AI投资分析系统 (ai-invest)  
**版本**: v1.0

---

## 📚 文档索引

### 核心文档（按阅读顺序）

1. **📊 综合摘要** 【推荐首读】
   - 文件: `2026-07-19-event-driven-SUMMARY.md`
   - 内容: 现状评估、重构目标、实施计划概览、快速开始
   - 适合: 所有人，快速了解整体方案

2. **🔍 需求分析报告**
   - 文件: `2026-07-19-event-driven-refactoring-requirements.md`
   - 内容: 五层架构现状评估、功能缺口分析、需求清单
   - 适合: 了解现有系统问题和改进方向

3. **🏗️ 架构设计文档**
   - 文件: `2026-07-19-event-driven-architecture-design.md`
   - 内容: 五层架构详细设计、组件接口、Schema变更、API设计
   - 适合: 技术架构师、开发人员

4. **📋 实施计划**
   - 文件: `2026-07-19-event-driven-implementation-plan.md`
   - 内容: 6个阶段详细任务、文件清单、验收标准、风险评估
   - 适合: 项目管理、开发团队

5. **⚡ 快速参考指南**
   - 文件: `2026-07-19-event-driven-quick-reference.md`
   - 内容: 关键改进点速览、文件清单、API列表
   - 适合: 日常开发查阅

---

## 🎯 核心发现

### 系统现状
- **整体完成度**: 59%
- **关键问题**: 4个Critical级别缺口
  1. 数据采集未真正自动化
  2. AI清洗未集成到数据流
  3. 本地存储与Python服务未打通
  4. 数据源管理缺失

### 重构目标
实现完整的五层事件驱动架构：
```
Layer 5: UI交互层 (数据源管理、调度配置、规则配置)
Layer 4: 存储管理层 (生命周期管理、自动清理)
Layer 3: AI清洗层 (情感分析、智能分类、筛选规则)
Layer 2: 事件输入层 (多种调度、并行采集、任务管理)
Layer 1: 数据源层 (驱动抽象、插件化架构)
```

---

## 📅 实施时间线

### Phase 1: 核心补全 (P0) - 1-2周 ⭐
**目标**: 打通完整数据流，实现自动化采集和AI清洗

- Week 1: 数据采集自动化 + AI清洗集成
- Week 2: 数据持久化 + 数据源管理API

**关键成果**:
- ✅ 调度器自动执行采集任务
- ✅ 新闻自动AI分析和分类
- ✅ 数据持久化到本地数据库
- ✅ 可通过UI管理数据源

### Phase 2: 功能增强 (P1) - 1周
- 采集日志和监控
- 分类体系集成
- 大V监控功能

### Phase 3: 架构优化 (P2) - 持续
- 前后端AI逻辑统一
- 数据源插件化架构
- 高级功能（全文搜索、规则引擎、归档）

---

## 🗂️ 关键变更

### 数据库Schema
**新增表** (3个):
- `SchedulerJob` - 调度任务管理
- `FilterRule` - 筛选规则配置
- `StorageConfig` - 存储策略配置

**增强字段**:
- `DataSource`: +5个字段 (driverType, configSchema, lastFetchStatus, etc.)
- `NewsArticle`: +9个字段 (AI处理状态、置信度、过期时间等)
- `DataSourceLog`: +4个字段 (任务关联、处理计数、错误详情)

### 代码文件
**新增**: ~50个文件
- Python后端: 15个 (drivers, registry, services)
- TypeScript前端: 35个 (pages, API routes, components)

**修改**: ~10个核心文件

---

## 🚀 快速开始

### 查看文档
```bash
cd docs/superpowers/specs

# 查看综合摘要（推荐首读）
cat 2026-07-19-event-driven-SUMMARY.md

# 查看需求分析
cat 2026-07-19-event-driven-refactoring-requirements.md

# 查看架构设计
cat 2026-07-19-event-driven-architecture-design.md

# 查看实施计划
cat 2026-07-19-event-driven-implementation-plan.md
```

### 开始实施 Phase 1

#### Step 1: 创建功能分支
```bash
git checkout -b feature/event-driven-refactoring-phase1
```

#### Step 2: 数据库迁移
```bash
# 修改 prisma/schema.prisma
# 参考: architecture-design.md 第5节

npm run db:migrate -- --name add_event_driven_phase1
```

#### Step 3: 安装Python依赖
```bash
cd data-service
pip install prisma-client-py anthropic
prisma generate --schema=../prisma/schema.prisma
```

#### Step 4: 实施核心功能
按照 `implementation-plan.md` Phase 1 的任务清单逐项实施

#### Step 5: 测试验收
```bash
# 启动服务
npm run dev
cd data-service && python main.py

# 验证功能
curl http://localhost:8000/api/scheduler/jobs
npm run db:studio  # 查看数据库
```

---

## 📊 文档统计

| 文档 | 页数 | 字数 | 核心内容 |
|------|------|------|----------|
| 综合摘要 | 8 | 3500+ | 现状+目标+快速开始 |
| 需求分析 | 12 | 6000+ | 五层评估+缺口分析 |
| 架构设计 | 15 | 8000+ | 详细设计+接口定义 |
| 实施计划 | 18 | 9000+ | 分阶段任务+文件清单 |
| 快速参考 | 6 | 3000+ | 速查+关键点摘要 |
| **合计** | **59** | **29500+** | **完整规划体系** |

---

## ✅ 验收标准

### Phase 1 (核心补全)
- [ ] 调度器自动执行财联社采集（每小时）
- [ ] 采集后自动AI情感分析和分类
- [ ] 数据持久化到本地SQLite
- [ ] Python服务离线后前端仍可用
- [ ] UI可创建/编辑/删除数据源
- [ ] 完整的采集日志记录

### Phase 2 (功能增强)
- [ ] UI展示采集统计和日志
- [ ] 新闻自动分类到NewsCategory
- [ ] 大V动态采集功能可用

### Phase 3 (架构优化)
- [ ] 用户可添加自定义数据源
- [ ] 数据7天后自动清理
- [ ] 全文搜索可用
- [ ] 完整测试覆盖

---

## ⚠️ 实施注意事项

### 技术风险
1. **Python-Prisma集成** (Medium) - 使用官方prisma-client-py
2. **Claude API限流** (Medium) - 实施批量处理和重试
3. **调度器稳定性** (Low) - 限制并发数

### 实施建议
1. **渐进式重构** - 保留旧代码，逐步替换
2. **功能开关** - 使用feature flag控制新功能上线
3. **充分测试** - 每个phase完成后进行集成测试
4. **及时提交** - 每完成一个子任务就提交代码

---

## 🔗 相关资源

### 项目文档
- `CLAUDE.md` - 项目说明
- `prisma/schema.prisma` - 数据库Schema

### 现有实现
- `data-service/providers/base.py` - Provider抽象
- `data-service/services/scheduler_service.py` - 调度器
- `src/app/(dashboard)/events/` - 事件驱动UI

### 外部资源
- [Prisma Client Python](https://prisma-client-py.readthedocs.io/)
- [APScheduler Documentation](https://apscheduler.readthedocs.io/)
- [Anthropic Claude API](https://docs.anthropic.com/claude/reference)

---

## 📞 问题反馈

实施过程中如有问题，请参考：
1. 先查阅 `SUMMARY.md` 了解整体方案
2. 详细问题查看对应的专项文档
3. 技术细节参考 `architecture-design.md`
4. 实施步骤参考 `implementation-plan.md`

---

**文档版本**: v1.0  
**最后更新**: 2026-07-19  
**维护者**: AI Investment Analysis Team
