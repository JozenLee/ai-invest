# 🚀 快速开始 - AI节点创建与市场数据

## ✅ 当前状态

```
✅ 真实市场数据: 88条ETF + 7条板块资金流
✅ AI节点创建: 完全自动化
✅ 数据服务: 运行正常
```

---

## 📊 查看数据状态

```bash
cd /Users/jozen.lee/ai-softwares/ai-invest
./scripts/check-market-data-status.sh
```

---

## 🔄 同步市场数据

### 手动同步
```bash
npx tsx scripts/sync-market-data-cron.ts
```

### 设置定时任务
```bash
crontab -e

# 添加：每个交易日17:00同步
0 17 * * 1-5 cd /Users/jozen.lee/ai-softwares/ai-invest && npx tsx scripts/sync-market-data-cron.ts >> /tmp/market-sync.log 2>&1
```

---

## 🤖 AI创建节点

### 方法1: API调用
```bash
curl -X POST http://localhost:3000/api/graph/ai/create-node \
  -H "Content-Type: application/json" \
  -d '{
    "name": "液冷散热",
    "description": "AI服务器液冷散热解决方案",
    "context": "随着AI算力需求增长，液冷技术成为关键"
  }'
```

### 方法2: 使用测试脚本
```bash
chmod +x scripts/test-ai-node-creation.sh
./scripts/test-ai-node-creation.sh
```

### 方法3: 代码中调用
```typescript
import { aiNodeCreationService } from '@/lib/services/ai-node-creation.service'

const result = await aiNodeCreationService.createNodeWithAI({
  name: '液冷散热',
  description: 'AI服务器液冷散热解决方案'
})
```

---

## 📖 完整文档

| 文档 | 位置 | 内容 |
|------|------|------|
| AI节点创建 | `docs/AI_NODE_CREATION_GUIDE.md` | 完整使用指南 |
| 市场数据同步 | `docs/MARKET_DATA_SYNC_GUIDE.md` | 数据同步说明 |
| 实施报告 | `docs/MARKET_DATA_IMPLEMENTATION_REPORT.md` | 改造详情 |
| 完成报告 | `docs/FINAL_COMPLETION_REPORT.md` | 最终总结 |

---

## 🔧 常用命令

### 启动数据服务
```bash
cd data-service
python3 -m uvicorn main:app --port 8000
```

### 检查服务状态
```bash
curl http://localhost:8000/health
```

### 查看数据库
```bash
sqlite3 prisma/dev.db "
  SELECT COUNT(*) as ETF数据 FROM ETFDaily
  UNION ALL
  SELECT COUNT(*) as 板块数据 FROM SectorCapitalFlow;
"
```

---

## 💡 AI节点创建示例

### 创建单个节点
```json
{
  "name": "HBM3E存储",
  "description": "第三代高带宽存储器，用于AI加速芯片",
  "context": "HBM是AI芯片的关键组件，提供高速数据传输"
}
```

**AI自动完成**:
- ✅ 匹配ETF: 半导体ETF
- ✅ 推断类型: memory
- ✅ 推断层级: Level 3
- ✅ 创建关系: 与GPU芯片供应链关系

### 批量创建节点
```json
{
  "nodes": [
    {"name": "液冷散热"},
    {"name": "HBM3E存储"},
    {"name": "800G光模块"}
  ]
}
```

---

## ⚠️ 注意事项

1. **ANTHROPIC_API_KEY**: 确保在 `.env.local` 中配置
2. **数据服务**: AI节点创建前需启动数据服务
3. **网络**: 某些数据同步需要稳定网络

---

## 🆘 遇到问题？

### 数据服务无法启动
```bash
# 检查端口占用
lsof -i :8000

# 查看日志
tail -f /tmp/data-service.log
```

### AI创建失败
- 检查 API Key 配置
- 查看返回的 `reasoning` 字段
- 提供更详细的 `description` 和 `context`

### 数据同步失败
- 确认数据服务运行
- 检查网络连接
- 查看同步日志

---

## 📞 快速联系

- **文档位置**: `/Users/jozen.lee/ai-softwares/ai-invest/docs/`
- **脚本位置**: `/Users/jozen.lee/ai-softwares/ai-invest/scripts/`
- **日志位置**: `/tmp/data-service.log`, `/tmp/market-sync.log`

---

**最后更新**: 2026-08-01
