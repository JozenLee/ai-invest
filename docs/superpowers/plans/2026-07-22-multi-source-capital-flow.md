# 多数据源资金流向系统实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现新浪财经作为备用数据源，优化数据源优先级和降级策略，提供用户配置开关控制估算数据显示

**Architecture:** 采用多源降级架构，Sina优先→AKShare备用→文件缓存兜底。新增UserPreferences表存储用户配置，API层根据配置过滤估算数据。前端增加数据质量标识和设置页面。

**Tech Stack:** Python (FastAPI, requests, asyncio), TypeScript (Next.js 16, React 19), Prisma ORM, SQLite

## Global Constraints

- Next.js 版本: 16.x
- React 版本: 19.x
- Prisma 版本: 7.x
- Python 版本: 3.9+
- 数据获取超时: 15秒
- API响应时间目标: <3秒
- 所有数据源失败时必须有明确错误提示
- 用户配置变更必须立即生效（无需刷新页面）

---

## 文件结构映射

### Python后端
- `data-service/providers/sina_provider.py` - 新浪财经Provider改进（调研API、实现/改进估算）
- `data-service/providers/registry.py` - Registry配置更新（调整优先级）
- `data-service/services/health_monitor.py` - 新增健康监控服务
- `data-service/tests/test_sina_provider.py` - SinaProvider单元测试
- `data-service/tests/test_registry_fallback.py` - Registry降级测试

### Next.js前端
- `prisma/schema.prisma` - 添加UserPreferences模型
- `src/app/api/settings/preferences/route.ts` - 用户偏好API（新建）
- `src/app/api/market/capital-flow/route.ts` - 修改以集成用户配置
- `src/app/(dashboard)/settings/page.tsx` - 设置页面增强
- `src/app/(dashboard)/dashboard/page.tsx` - 仪表盘数据质量标识增强
- `src/types/market.ts` - 类型定义扩展（DataQuality等）
- `src/hooks/usePreferences.ts` - 用户偏好Hook（新建）

---
