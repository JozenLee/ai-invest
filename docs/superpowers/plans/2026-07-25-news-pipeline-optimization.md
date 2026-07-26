# 新闻数据处理管道优化实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将AI分析集成到新闻采集链路，实现异步队列处理和SSE实时推送，提升数据质量和用户体验

**Architecture:** Python服务层实现协程池AI分析 + 独立线程存储 + SSE推送管理；Next.js层实现SSE代理；前端使用EventSource实现实时更新

**Tech Stack:** 
- Python: FastAPI, asyncio, threading, anthropic, sse-starlette
- Next.js: App Router, EventSource API
- Database: SQLite + Prisma

## Global Constraints

- Python版本: ≥ 3.9
- AI并发度: 5个协程
- 单条AI分析超时: 15秒
- 批量处理超时: 90秒
- 数据库批量写入: 10条/批
- 存储线程数: 2个
- 失败重试次数: 3次（指数退避）
- SSE心跳间隔: 30秒
- 前端重连延迟: 5秒

---

## 文件结构概览

### Python服务新增文件
- `data-service/models/article.py` - 数据模型定义
- `data-service/workers/ai_analyzer.py` - AI分析协程池
- `data-service/workers/db_writer.py` - 数据库写入线程池
- `data-service/services/news_pipeline.py` - 管道统筹
- `data-service/services/sse_manager.py` - SSE推送管理
- `data-service/services/metrics.py` - 指标收集

### Python服务修改文件
- `data-service/routers/news.py` - 新增refresh和stream端点
- `data-service/requirements.txt` - 添加sse-starlette依赖
- `data-service/main.py` - 初始化管道和SSE管理器

### Next.js新增文件
- `src/app/api/events/stream/route.ts` - SSE代理端点
- `src/hooks/useNewsStream.ts` - SSE连接Hook

### Next.js修改文件
- `src/app/api/events/cron/route.ts` - 简化为触发器
- `src/app/(dashboard)/events/page.tsx` - 集成实时更新

### 测试文件
- `data-service/tests/test_ai_analyzer.py` - AI分析测试
- `data-service/tests/test_db_writer.py` - 存储线程测试
- `data-service/tests/test_pipeline.py` - 端到端管道测试
- `data-service/tests/test_sse.py` - SSE推送测试

---
### Task 1: 数据模型定义

**Files:**
- Create: `data-service/models/article.py`

**Interfaces:**
- Consumes: 无（基础模型）
- Produces: 
  - `RawArticle` - 采集后的原始新闻数据模型
  - `AnalyzedArticle` - AI分析后的新闻数据模型
  - `PipelineResult` - 管道执行结果模型

- [ ] **Step 1: 编写数据模型测试**
