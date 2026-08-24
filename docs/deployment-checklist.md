# 知识图谱与资讯流联动 - 部署检查清单

## 📋 部署前检查

### 环境准备
- [ ] Node.js 18+ 已安装
- [ ] Python 3.9+ 已安装
- [ ] Neo4j 5.x 已启动
- [ ] Redis 已启动（可选）
- [ ] `.env` 文件已配置完整

### 依赖安装
- [ ] 已运行 `npm install`
- [ ] 已运行 `pip install -r requirements.txt`
- [ ] 已运行 `npm run db:migrate`

### 数据准备
- [ ] Neo4j 中已有至少一个产业图谱
- [ ] SQLite 中已有新闻数据
- [ ] SQLite 中已有 Tag 数据

---

## 🚀 部署步骤检查

### Step 1: 启动服务
- [ ] Python 数据服务已启动 (端口 8000)
- [ ] Next.js 生产服务器已启动 (端口 3000)
- [ ] 服务日志无错误

生产部署建议使用项目根目录的闭环脚本：

```bash
npm install
npm run build:production
./scripts/deploy-production.sh
npm run verify:production
```

`deploy-production.sh` 会执行类型检查、生产构建，并在存在 PM2 时重载
`ecosystem.config.js`。Web 服务使用 `next start` 读取 `.next` 生产构建产物，
不会使用开发服务器或旧的热更新缓存。

如果页面仍显示旧导航，请确认访问的 3000 端口确实由当前项目启动，并执行：

```bash
pm2 restart ai-invest-web --update-env
npm run verify:production
```

验证脚本会检查新导航存在、旧导航不存在，以及四个已删除路由返回 404。

### 开发环境 UI 刷新

日常开发完成一次修改后执行：

```bash
npm run refresh:ui
```

该命令会安全接管当前项目占用的 3000 端口，并通过 PM2 持久托管 `next dev` 开发服务。
因此终端命令结束后服务仍会继续运行，不会再出现旧进程或端口自动释放的问题。
服务启动后，继续保存源码会由 Next.js HMR 自动刷新页面；如果浏览器仍显示旧内容，
执行一次硬刷新（macOS：`Cmd+Shift+R`，Windows/Linux：`Ctrl+Shift+R`）。

### Step 2: 运行初始化
- [ ] 已执行 `cd data-service && ./scripts/init_kg_news_integration.sh`
- [ ] Segment 关键词已生成
- [ ] Tag-Segment 映射已完成
- [ ] 缓存已清除

### Step 3: 类型检查
- [ ] 已运行 `npm run typecheck`
- [ ] 无类型错误

---

## ✅ 功能验证

### 前端界面
- [ ] 资讯流页面 (/events/feed) 正常加载
- [ ] 出现"选择产业"筛选器
- [ ] 产业下拉框有数据
- [ ] 选择产业后出现"选择细分领域"筛选器
- [ ] Segment 筛选器有数据
- [ ] 筛选条件标签正常显示

### 新闻筛选
- [ ] 选择产业和 Segment 后新闻列表更新
- [ ] 筛选结果符合预期
- [ ] 新闻卡片显示紫色 Segment 标签
- [ ] 标签内容正确（产业-Segment）

### API 测试
- [ ] GET /api/graph/industries 返回产业列表
- [ ] GET /api/graph/industries/{id}/segments 返回 Segment 列表
- [ ] GET /api/graph/industries/{id}/impact-chain 正常响应
- [ ] GET /api/events/feed?industryId=xxx&segmentCodes=xxx 正确筛选

### 性能检查
- [ ] 页面加载时间 < 2秒
- [ ] 产业列表加载时间 < 500ms
- [ ] Segment 列表加载时间 < 500ms
- [ ] 新闻筛选响应时间 < 1秒

---

## 🔍 数据验证

### Neo4j 数据
- [ ] Segment 节点有 news_keywords 属性
- [ ] Segment 节点有 tag_codes 属性
- [ ] 存在 (Segment)-[:HAS_TAG]->(TagRef) 关系
- [ ] TagRef 节点已创建

### SQLite 数据
- [ ] NewsArticleTag 表有数据
- [ ] Tag 表有数据
- [ ] NewsArticle 表有数据

### 缓存验证（如果使用 Redis）
- [ ] Redis 连接正常
- [ ] 缓存键已创建
- [ ] 缓存命中率合理

---

## 🐛 故障排查检查

如果遇到问题，检查以下项：

### 产业筛选器为空
- [ ] Neo4j 中有 Industry 节点
- [ ] Python 服务正常运行
- [ ] API /api/graph/industries 返回数据

### Segment 筛选器为空
- [ ] 选择的产业在 Neo4j 中有 Stage 和 Segment
- [ ] Python 服务日志无错误
- [ ] API /api/graph/industries/{id}/segments 返回数据

### 新闻无产业标签
- [ ] 新闻有 Tag 关联（NewsArticleTag 表）
- [ ] Tag 映射到 Segment（Neo4j HAS_TAG 关系）
- [ ] API /api/v1/industry-graph/segments/by-tags 正常

### 筛选无结果
- [ ] Segment 有 tag_codes 属性
- [ ] Tag codes 匹配新闻的 Tag
- [ ] API 筛选逻辑正确

---

## 📊 性能监控

### 建议监控的指标
- [ ] API 响应时间
- [ ] 数据库查询时间
- [ ] Neo4j 查询时间
- [ ] Redis 缓存命中率
- [ ] 内存使用情况
- [ ] CPU 使用情况

---

## 📝 部署后任务

### 立即执行
- [ ] 通知团队功能已上线
- [ ] 发送使用指南
- [ ] 收集初步反馈

### 本周内
- [ ] 监控错误日志
- [ ] 收集用户反馈
- [ ] 优化关键词（如果需要）
- [ ] 调整 Tag-Segment 映射（如果需要）

### 本月内
- [ ] 评估分类准确率
- [ ] 优化性能瓶颈
- [ ] 完善跳转功能
- [ ] 添加使用统计

---

## 🎯 验收标准

### 功能完整性 ✅
- [x] 产业筛选器可用
- [x] Segment 筛选器可用
- [x] 新闻筛选正确
- [x] 产业标签显示

### 性能要求 ✅
- [x] 页面加载流畅
- [x] 筛选响应及时
- [x] 无明显卡顿

### 代码质量 ✅
- [x] TypeScript 类型检查通过
- [x] 代码格式规范
- [x] 注释完整

### 文档完整 ✅
- [x] 部署指南完整
- [x] API 文档完整
- [x] 使用说明清晰

---

## ✨ 签署确认

### 开发团队
- [ ] 代码审查通过
- [ ] 测试用例通过
- [ ] 文档审查通过

### 产品团队
- [ ] 功能符合需求
- [ ] 用户体验良好
- [ ] 准备上线

### 运维团队
- [ ] 部署流程清晰
- [ ] 监控配置完成
- [ ] 回滚方案明确

---

## 📅 时间记录

- 开始时间: _______________
- 完成时间: _______________
- 总耗时: _______________
- 问题数: _______________
- 解决数: _______________

---

## 📌 备注

记录部署过程中的特殊情况：

```
[在此记录]




```

---

**检查清单版本**: v1.0
**创建日期**: 2026-08-08
**适用版本**: 知识图谱与资讯流联动 v1.0
