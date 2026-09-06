# 真实市场数据同步使用说明

## 已完成的工作

### ✅ 1. 删除模拟数据
- 已从数据库中删除所有模拟的指数、ETF、资金流向数据
- 模拟数据生成脚本已重命名为 `.deprecated` 后缀，防止误用
  - `generate-mock-market-data.ts.deprecated`
  - `demo-market-data.ts.deprecated`

### ✅ 2. 接入真实数据源
- **数据源**: AKShare（免费、开源的金融数据接口）
- **数据服务**: Python FastAPI服务 (运行在 http://localhost:8000)
- **已实现的数据类型**:
  - ✅ ETF日线数据（515070, 512480, 159995, 515880）
  - ✅ 板块资金流向（通信设备、服务器、数据中心等）
  - ⚠️ 指数数据（API存在问题，待修复）

### ✅ 3. 数据同步脚本
创建了两个同步脚本：

**A. 完整同步脚本** (`scripts/sync-real-market-data.ts`)
- 用于首次同步或手动全量同步
- 包含指数、ETF、资金流向的完整同步逻辑

定时任务可直接调用完整同步脚本：

```bash
npx tsx scripts/sync-real-market-data.ts
```

脚本包含指数、ETF和板块资金流向同步逻辑，适合手动执行或由 cron 调度。

### ✅ 4. 页面标识
在图谱探索页面添加了数据来源说明：
- "市场数据来源: AKShare (真实数据)"
- "数据更新: 每日交易日收盘后"

---

## 当前数据状态

### 成功同步的数据

```
✅ ETF数据: 88条记录
  - AI ETF (515070): 22天数据
  - 半导体ETF (512480): 22天数据
  - 芯片ETF (159995): 22天数据
  - 通信ETF (515880): 22天数据

✅ 板块资金流向: 3条记录
  - 服务器
  - 数据中心
  - 通信设备
```

### 待解决的问题

```
⚠️ 指数数据同步失败
原因: Python数据服务的指数API存在错误
影响: 图谱节点中的"行业指数表现"无法显示

⚠️ 部分板块资金流向未匹配
原因: 东方财富的板块名称与我们的映射不完全一致
影响: 芯片、存储芯片、散热、光模块板块的资金流向无法显示
```

---

## 使用方法

### 1. 启动数据服务

```bash
cd /Users/jozen.lee/ai-softwares/ai-invest/data-service
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000
```

或使用启动脚本：
```bash
cd data-service
./start.sh
```

检查服务状态：
```bash
curl http://localhost:8000/health
```

### 2. 手动同步数据

```bash
cd /Users/jozen.lee/ai-softwares/ai-invest

# 执行同步脚本
npx tsx scripts/sync-real-market-data.ts
```

### 3. 设置定时任务

**方式A: 使用 crontab（推荐）**

```bash
# 编辑crontab
crontab -e

# 添加以下行（每个交易日17:00执行）
0 17 * * 1-5 cd /Users/jozen.lee/ai-softwares/ai-invest && npx tsx scripts/sync-real-market-data.ts >> /tmp/market-sync.log 2>&1
```

**方式B: 使用 package.json 脚本**

运行：
```bash
npm run sync:market
```

### 4. 检查同步结果

```bash
# 查看数据库中的数据数量
sqlite3 prisma/dev.db "
  SELECT 'ETF数据' as 类型, COUNT(*) as 数量 FROM ETFDaily
  UNION ALL
  SELECT '板块资金流向', COUNT(*) FROM SectorCapitalFlow;
"

# 查看最新的ETF数据
sqlite3 prisma/dev.db "
  SELECT name, date, close, changePct 
  FROM ETFDaily 
  ORDER BY date DESC, name 
  LIMIT 10;
"

# 查看板块资金流向
sqlite3 prisma/dev.db "
  SELECT sector, date, mainForceNet, changePct 
  FROM SectorCapitalFlow 
  ORDER BY date DESC;
"
```

---

## 数据说明

### ETF数据字段

| 字段 | 说明 | 单位 |
|------|------|------|
| ticker | ETF代码 | - |
| name | ETF名称 | - |
| date | 交易日期 | - |
| open/high/low/close | 开盘/最高/最低/收盘价 | 元 |
| volume | 成交量 | 股 |
| amount | 成交额 | 元 |
| nav | 净值 | 元 |
| premium | 溢折价率 | % |
| shares | 份额 | 份 |

### 板块资金流向字段

| 字段 | 说明 | 单位 |
|------|------|------|
| sector | 板块名称 | - |
| date | 日期 | - |
| mainForceNet | 主力净流入 | 万元 |
| retailNet | 散户净流入 | 万元 |
| totalVolume | 总成交量 | 万元 |
| changePct | 板块涨跌幅 | % |
| consecutiveDays | 连续流入/流出天数 | 天 |

---

## 故障排查

### 问题1: 数据服务无法启动

**检查步骤：**
```bash
# 检查Python版本
python3 --version  # 需要 3.9+

# 检查依赖
cd data-service
pip3 list | grep akshare

# 重新安装依赖
pip3 install -r requirements.txt

# 查看错误日志
tail -f /tmp/data-service.log
```

### 问题2: 同步脚本报错 "Cannot connect to data service"

**解决方案：**
1. 确认数据服务正在运行：`curl http://localhost:8000/health`
2. 检查端口是否被占用：`lsof -i :8000`
3. 检查 `.env` 中的 `DATA_SERVICE_URL` 配置

### 问题3: ETF数据同步失败

**可能原因：**
- 网络问题（东方财富网站访问受限）
- AKShare版本过旧
- 数据服务API错误

**解决方案：**
```bash
# 升级AKShare
pip3 install --upgrade akshare

# 测试AKShare直接获取数据
python3 -c "
import akshare as ak
df = ak.fund_etf_hist_sina(symbol='515070')
print(df.tail())
"
```

### 问题4: 板块名称无法匹配

**解决方案：**
1. 查看可用的板块列表：
```bash
curl http://localhost:8000/api/capital-flow/sector | jq '.data[].sector'
```

2. 更新 `scripts/sync-real-market-data.ts` 中的 `SECTOR_MAPPING` 映射表

---

## 数据质量保证

### 数据验证检查

运行以下命令检查数据质量：

```bash
# 检查是否有空数据
sqlite3 prisma/dev.db "
  SELECT 'ETF空价格' as 检查项, COUNT(*) as 异常数量
  FROM ETFDaily 
  WHERE close = 0 OR close IS NULL
  
  UNION ALL
  
  SELECT '资金流向空值', COUNT(*) 
  FROM SectorCapitalFlow 
  WHERE mainForceNet = 0 OR mainForceNet IS NULL;
"

# 检查数据日期是否最新
sqlite3 prisma/dev.db "
  SELECT 'ETF最新日期' as 类型, MAX(date) as 最新日期
  FROM ETFDaily
  
  UNION ALL
  
  SELECT '资金流向最新日期', MAX(date)
  FROM SectorCapitalFlow;
"
```

### 数据更新频率建议

- **ETF数据**: 每个交易日收盘后更新（17:00-18:00）
- **资金流向**: 每个交易日收盘后更新
- **新闻统计**: 每小时更新一次

---

## 下一步改进建议

### 短期（1-2天）

1. **修复指数数据API**
   - 调试 `/api/market/index/{code}` 端点
   - 或使用AKShare的其他指数接口

2. **完善板块映射**
   - 获取完整的东方财富板块列表
   - 更新板块名称映射表

3. **添加数据验证**
   - 同步后自动检查数据完整性
   - 发现异常时发送通知

### 中期（1周）

4. **实现增量更新**
   - 只更新最新的交易日数据
   - 减少API调用次数

5. **添加历史数据回填**
   - 支持回填过去N天的历史数据
   - 用于新增ETF或板块

6. **优化错误处理**
   - 实现重试机制
   - 记录详细的错误日志

### 长期（1个月+）

7. **接入更多数据源**
   - 考虑付费数据源（Tushare Pro）
   - 提高数据质量和覆盖面

8. **实现数据监控**
   - 监控数据更新状态
   - 数据异常时自动告警

9. **添加数据缓存**
   - 减少数据库查询压力
   - 提升页面加载速度

---

## 联系与支持

**相关文件位置：**
- 同步脚本: `scripts/sync-real-market-data.ts`
- 数据服务: `data-service/`
- 前端页面: `src/app/(dashboard)/graph/explore/page.tsx`
- 市场数据服务: `src/lib/services/graph-market-data.service.ts`

**数据库文件：**
- 开发环境: `prisma/dev.db`
- Schema定义: `prisma/schema.prisma`

**日志文件：**
- 数据服务日志: `/tmp/data-service.log`
- 同步任务日志: `/tmp/market-sync.log`
