# 集成测试快速参考

## 测试脚本

### 数据库验证
```bash
# 添加缺失的调度器
npx tsx scripts/add-missing-schedulers.ts

# 完整数据库验证
npx tsx scripts/verify-integration.ts

# 数据库完整性测试
npx tsx scripts/test-database-integrity.ts

# 修复AKShare间隔配置
npx tsx scripts/fix-akshare-interval.ts
```

### 服务启动
```bash
# 启动Next.js服务
npm run dev

# 启动Python服务
cd data-service
python3 main.py
```

### API测试
```bash
# 测试领域列表
curl http://localhost:3000/api/domains | jq .

# 测试调度器健康检查（需要Python服务）
curl http://localhost:8000/schedulers/health | jq .
```

## 测试结果总结

### ✅ 通过的测试 (22项)

**数据库层 (6项)**
- ✅ 所有20个数据源配置了调度器
- ✅ NewsNow: 4/4 符合30分钟标准
- ✅ AKShare: 5/5 符合60分钟标准
- ✅ 配置格式100%有效
- ✅ 关键字段完整
- ✅ 6个领域配置完整

**API层 (2项)**
- ✅ GET /api/domains 正常工作
- ✅ PATCH /api/datasources/[id]/schedule 实现完整

**调度器 (4项)**
- ✅ 调度器服务启动成功
- ✅ 从数据库同步任务成功
- ✅ APScheduler正常工作
- ✅ 任务执行正常

**领域筛选 (4项)**
- ✅ 领域数据完整
- ✅ API支持domainFilter
- ✅ domainId验证正确
- ✅ 筛选模式支持完整

**前端UI (6项)**
- ✅ SchedulerDialog组件存在
- ✅ 领域筛选UI实现
- ✅ Cron选项已移除
- ✅ Webhook选项已移除
- ✅ 调度配置API路由存在
- ✅ 健康检查API路由存在

### ⚠️ 部分通过 (1项)

- ⚠️ Python服务健康检查（HTTP超时）

### ⏭️ 跳过 (2项)

- ⏭️ 运行时UI测试（需要服务运行）
- ⏭️ 时间显示验证（需要服务运行）

## 遗留问题

### 🔴 高优先级

**Python服务启动阻塞**
```python
# 问题代码
await warmup()  # 阻塞HTTP服务

# 修复方案
asyncio.create_task(warmup())  # 异步非阻塞
```

**Claude API配置**
- 错误: 503 "No available accounts"
- 检查: ANTHROPIC_API_KEY 环境变量
- 或添加快速失败机制

## 快速验证命令

```bash
# 一键验证所有数据库配置
npx tsx scripts/verify-integration.ts

# 检查配置符合性
npx tsx scripts/verify-integration.ts 2>/dev/null | grep "符合.*标准"

# 测试数据库完整性
npx tsx scripts/test-database-integrity.ts
```

## 文件位置

- 主测试报告: `integration-test-report.md`
- 最终总结: `docs/integration-test-final-summary.md`
- 验证脚本: `scripts/verify-integration.ts`
- 完整性测试: `scripts/test-database-integrity.ts`
- 配置修复: `scripts/fix-akshare-interval.ts`

## 关键指标

| 指标 | 数值 | 目标 | 状态 |
|------|------|------|------|
| 调度器配置 | 20/20 | 100% | ✅ |
| NewsNow符合率 | 4/4 | 100% | ✅ |
| AKShare符合率 | 5/5 | 100% | ✅ |
| 配置有效性 | 20/20 | 100% | ✅ |
| 领域配置 | 6/6 | 100% | ✅ |
| API可用性 | 2/3 | 67% | ⚠️ |
| 测试通过率 | 22/25 | 88% | ✅ |

## 下一步行动

1. 修复Python服务启动流程
2. 解决Claude API配置问题
3. 执行完整运行时测试
4. 更新文档

---
最后更新: 2026-07-22
