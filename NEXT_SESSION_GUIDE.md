# 项目当前状态与开发路径

**更新日期**: 2026-07-19  
**项目**: AI投资分析系统 - 事件驱动系统重构  
**当前进度**: 40% (Phase 1 + Phase 2 完成)  
**服务状态**: ✅ Next.js (端口 3000) 和 Python (端口 8000) 已启动

---

## 📊 当前完成情况

### ✅ Phase 1: 基础框架搭建 (100%)
- Python SQLite 数据库集成 (db.py)
- 自动化采集任务 (调度器 + fetch_service.py)
- AI 数据清洗流程 (content_analyzer.py)
- 数据持久化功能
- 数据源动态管理 API

**关键文件**:
- `data-service/db.py` - SQLite 数据库访问层
- `data-service/services/fetch_service.py` - 采集服务
- `data-service/services/content_analyzer.py` - AI 清洗服务

### ✅ Phase 2: 管理增强 (100%)

#### R5: 采集日志和监控
- ✅ 采集日志 API (`GET /api/datasources/logs`)
- ✅ LogViewer 组件（实时刷新、状态筛选）
- ✅ HealthMonitor 组件（健康度评分、趋势图表）
- ✅ 数据源详情页 (`/events/sources/[id]`)

**关键文件**:
- `src/app/api/datasources/logs/route.ts`
- `src/components/datasources/LogViewer.tsx`
- `src/components/datasources/HealthMonitor.tsx`
- `src/app/(dashboard)/events/sources/[id]/page.tsx`

#### R6: 分类体系与 AI 清洗集成
- ✅ NewsCategory API（扁平列表 + 树形结构）
- ✅ Domain API（关键词解析）
- ✅ CategoryTreeSelect 组件（递归树形、多选）
- ✅ AI 分类映射逻辑

**关键文件**:
- `src/app/api/events/categories/route.ts`
- `src/app/api/events/categories/tree/route.ts`
- `src/app/api/events/domains/route.ts`
- `src/components/events/CategoryTreeSelect.tsx`
- `src/lib/services/event.service.ts` (mapAICategoryToDatabase, mapAIKeywordsToDomains)

#### R7: 大V监控功能
- ✅ B站 Provider (bilibili-api-python v17.4.1)
- ✅ 微博 Provider (模拟版)
- ✅ 小红书 Provider (模拟版)
- ✅ Provider 加载器
- ✅ 大V API（列表、详情、动态、手动采集）
- ✅ 大V监控 UI（主页 + 详情页）

**关键文件**:
- `data-service/providers/bilibili_provider.py`
- `data-service/providers/weibo_provider.py`
- `data-service/providers/xiaohongshu_provider.py`
- `data-service/providers/loader.py`
- `src/app/api/influencers/route.ts`
- `src/app/(dashboard)/events/influencers/page.tsx`
- `src/app/(dashboard)/events/influencers/[id]/page.tsx`

---

## 🎯 接下来的开发路径

### Phase 3: 功能扩展（预计 2 天）

#### 任务 1: Provider Schema 定义
**优先级**: P2  
**工作量**: 0.5 天

**目标**:
- 为每个 Provider 定义完整的 JSON Schema
- 包含字段验证规则和类型定义
- 支持前端动态表单生成

**文件创建**:
- `data-service/providers/schemas.py`

**实现内容**:
```python
PROVIDER_SCHEMAS = {
    'akshare': {
        'displayName': 'AKShare财经数据',
        'description': '获取A股市场数据',
        'configSchema': {
            'type': 'object',
            'properties': {
                'interval': {'type': 'integer', 'default': 60},
                'categories': {'type': 'array', 'items': {'type': 'string'}}
            }
        }
    },
    'bilibili': {...},
    'weibo': {...},
    'xiaohongshu': {...}
}
```

#### 任务 2: Provider 动态加载器增强
**优先级**: P2  
**工作量**: 0.5 天

**目标**:
- 增强 ProviderLoader 功能
- 支持配置验证
- 支持 Provider 实例缓存

**文件修改**:
- `data-service/providers/loader.py`

#### 任务 3: Provider 管理 API
**优先级**: P2  
**工作量**: 0.5 天

**目标**:
- 创建 Provider 管理 API
- 支持列出、查询、测试 Provider

**文件创建**:
- `data-service/routers/providers.py`
- `src/app/api/providers/route.ts`

**API 端点**:
- `GET /api/providers/list` - 列出所有可用 Provider
- `GET /api/providers/[name]/schema` - 获取 Provider Schema
- `POST /api/providers/[name]/test` - 测试 Provider 配置

#### 任务 4: 动态表单生成组件
**优先级**: P2  
**工作量**: 0.5 天

**目标**:
- 根据 JSON Schema 生成表单
- 支持字段验证
- 用于新增/编辑数据源

**文件创建**:
- `src/components/datasources/DynamicConfigForm.tsx`

**使用场景**:
```tsx
<DynamicConfigForm
  schema={providerSchema}
  value={config}
  onChange={setConfig}
/>
```

---

### Phase 4: 架构优化（预计 5.5 天）

#### 任务 1: AI 逻辑统一（1.5 天）

**目标**: 将前端的 AI 调用统一迁移到后端

**子任务**:
1. **创建 Python AI 统一入口** (0.5 天)
   - 文件: `data-service/routers/ai.py`
   - 端点:
     - `POST /api/ai/analyze` - 分析单篇文章
     - `POST /api/ai/analyze-batch` - 批量分析
     - `POST /api/ai/investment-ideas` - 提取投资理念
     - `GET /api/ai/health` - AI 服务健康检查

2. **Next.js AI 服务封装** (0.5 天)
   - 文件: `src/lib/services/ai-analysis.service.ts`
   - 封装所有 AI 调用
   - 统一错误处理

3. **前端迁移** (0.5 天)
   - 更新所有调用 AI 的地方
   - 删除前端 Anthropic SDK 依赖
   - 测试所有 AI 功能

**验收标准**:
- ✅ 前端不再直接调用 Claude API
- ✅ 所有 AI 分析通过后端统一处理
- ✅ API 调用成本降低

#### 任务 2: 全文搜索实现（2 天）

**目标**: 使用 SQLite FTS5 实现全文搜索

**子任务**:
1. **FTS5 数据库迁移** (0.5 天)
   - 创建 FTS5 虚拟表
   - 创建同步触发器
   - 初始化现有数据
   
   ```sql
   CREATE VIRTUAL TABLE NewsArticle_fts USING fts5(
       title, content, summary, keywords,
       content=NewsArticle,
       tokenize='unicode61 remove_diacritics 2'
   );
   ```

2. **搜索服务实现** (0.5 天)
   - 文件: `src/lib/services/search.service.ts`
   - FTS5 查询构建
   - 搜索建议功能

3. **搜索 API** (0.5 天)
   - 文件: `src/app/api/search/route.ts`
   - 文件: `src/app/api/search/suggestions/route.ts`
   - 结果高亮处理

4. **搜索 UI 组件** (0.5 天)
   - 文件: `src/components/events/SearchBar.tsx`
   - 自动完成下拉框
   - 搜索历史
   - 搜索结果页面增强

**验收标准**:
- ✅ 支持中文全文搜索
- ✅ 搜索结果正确高亮关键词
- ✅ 搜索建议功能可用
- ✅ 搜索性能 < 200ms

#### 任务 3: 性能优化（2 天）

**目标**: 提升系统整体性能

**子任务**:
1. **数据库查询优化** (0.5 天)
   - 使用 select 减少数据传输
   - 批量查询减少 N+1 问题
   - 索引优化

2. **缓存策略** (0.5 天)
   - 实现内存缓存层
   - API 响应缓存（5分钟）
   - 缓存失效策略

3. **Python 后端优化** (0.5 天)
   - 批量插入优化（executemany）
   - 数据库连接池
   - 异步并发优化

4. **前端性能优化** (0.5 天)
   - 实现虚拟滚动（长列表）
   - 无限滚动（分页加载）
   - 防抖节流优化

**验收标准**:
- ✅ 资讯流加载时间 < 1秒
- ✅ 长列表（>1000条）滚动流畅
- ✅ API 响应时间 < 500ms
- ✅ 内存占用合理

---

## 🗂️ 项目结构概览

```
ai-invest/
├── data-service/                  # Python 数据服务
│   ├── db.py                      # ✅ SQLite 数据库访问层
│   ├── main.py                    # FastAPI 主入口
│   ├── providers/                 # ✅ 数据源 Providers
│   │   ├── bilibili_provider.py   # ✅ B站
│   │   ├── weibo_provider.py      # ✅ 微博
│   │   ├── xiaohongshu_provider.py # ✅ 小红书
│   │   ├── loader.py              # ✅ Provider 加载器
│   │   └── schemas.py             # ⏸️ Provider Schema (Phase 3)
│   ├── routers/                   # API 路由
│   │   ├── datasources.py         # 数据源管理
│   │   ├── ai.py                  # ⏸️ AI 统一入口 (Phase 4)
│   │   └── providers.py           # ⏸️ Provider 管理 (Phase 3)
│   └── services/                  # 业务服务
│       ├── fetch_service.py       # ✅ 采集服务
│       └── content_analyzer.py    # ✅ AI 清洗服务
│
├── src/
│   ├── app/
│   │   ├── (dashboard)/events/
│   │   │   ├── sources/[id]/      # ✅ 数据源详情页
│   │   │   └── influencers/       # ✅ 大V监控页面
│   │   └── api/
│   │       ├── datasources/       # ✅ 数据源 API
│   │       ├── events/            # ✅ 事件相关 API
│   │       ├── influencers/       # ✅ 大V监控 API
│   │       ├── search/            # ⏸️ 搜索 API (Phase 4)
│   │       └── providers/         # ⏸️ Provider API (Phase 3)
│   ├── components/
│   │   ├── datasources/           # ✅ 数据源组件
│   │   │   ├── LogViewer.tsx      # ✅ 日志查看器
│   │   │   ├── HealthMonitor.tsx  # ✅ 健康监控
│   │   │   └── DynamicConfigForm.tsx # ⏸️ 动态表单 (Phase 3)
│   │   └── events/
│   │       ├── CategoryTreeSelect.tsx # ✅ 分类树选择器
│   │       └── SearchBar.tsx      # ⏸️ 搜索栏 (Phase 4)
│   └── lib/services/
│       ├── event.service.ts       # ✅ 事件服务
│       ├── ai-analysis.service.ts # ⏸️ AI 分析服务 (Phase 4)
│       └── search.service.ts      # ⏸️ 搜索服务 (Phase 4)
│
└── docs/
    ├── PROGRESS.md                # ✅ 总体进度
    ├── superpowers/specs/
    │   └── 2026-07-19-event-driven-design.md # ✅ 完整设计文档
    └── reports/
        ├── R5-completion-report.md    # ✅
        ├── R6-completion-report.md    # ✅
        ├── R7-completion-report.md    # ✅
        └── phase2-completion-summary.md # ✅
```

---

## 🚀 新会话快速启动指南

### 1. 环境检查

```bash
# 检查服务是否运行
curl http://localhost:3000/api/influencers
curl http://localhost:8000/health

# 如果没运行，启动服务
npm run dev
cd data-service && python3 main.py
```

### 2. 查看文档

```bash
# 查看总体进度
cat docs/PROGRESS.md

# 查看完整设计文档
cat docs/superpowers/specs/2026-07-19-event-driven-design.md

# 查看 Phase 2 总结
cat docs/reports/phase2-completion-summary.md
```

### 3. 开发路径建议

**选项 A: 继续 Phase 3（功能扩展）**
- 更快看到成果（预计 2 天）
- 完善数据源管理功能
- 提升用户体验

**开始命令**:
```
继续实施 Phase 3: 数据源插件化架构
优先级: Provider Schema 定义 → 动态表单生成
参考文档: docs/superpowers/specs/2026-07-19-event-driven-design.md
从任务 1 开始: 创建 data-service/providers/schemas.py
```

**选项 B: 跳到 Phase 4（架构优化）**
- 更大的技术挑战
- 显著提升性能
- 统一 AI 调用

**开始命令**:
```
开始实施 Phase 4: 架构优化
优先级: AI 逻辑统一 → 全文搜索 → 性能优化
参考文档: docs/superpowers/specs/2026-07-19-event-driven-design.md
从任务 1 开始: 创建 data-service/routers/ai.py
```

### 4. 代码质量检查

```bash
# TypeScript 类型检查
npm run typecheck

# 查看 Git 状态
git status
git log --oneline -10
```

---

## 📊 技术债务和注意事项

### 当前已知问题
1. ✅ bilibili-api-python 已安装（v17.4.1）
2. ✅ 所有 TypeScript 类型检查通过
3. ✅ 所有代码已提交到 Git

### 需要注意的点
1. **SQLite 并发写入**: 仅 Python 写入，Next.js 只读
2. **B站 API 限流**: 已实现降级机制
3. **数据清理策略**: 默认保留 7 天
4. **AI API 成本**: Phase 4 统一后可降低

---

## 🎯 推荐的开发顺序

**如果追求快速迭代**:
1. Phase 3 任务 1-2（1 天）
2. Phase 4 任务 1（1.5 天）
3. Phase 3 任务 3-4（1 天）
4. Phase 4 任务 2-3（4 天）

**如果追求系统完整性**:
1. 完整完成 Phase 3（2 天）
2. 完整完成 Phase 4（5.5 天）
3. 集成测试和优化（1 天）

---

## 📝 Git 分支策略

**当前分支**: `feature/event-driven-refactoring-phase1`

**建议**:
- Phase 3 可以继续在当前分支
- Phase 4 建议创建新分支: `feature/phase4-optimization`
- 完成后合并到 `main`

```bash
# Phase 3 继续当前分支
git status
git log --oneline -5

# Phase 4 创建新分支
git checkout -b feature/phase4-optimization
```

---

**文档版本**: v1.0  
**创建时间**: 2026-07-19  
**服务状态**: ✅ 运行中  
**下次会话**: 选择 Phase 3 或 Phase 4
