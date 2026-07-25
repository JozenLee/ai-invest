# 市场数据UI - CI测试报告

## 测试概览
- **测试时间**: 2026-07-24 23:54:00 CST
- **测试范围**: 前端市场数据API + Python数据服务
- **测试目的**: 验证市场数据是否正常显示，数据源是否可用

---

## 测试环境

### 服务状态
| 服务 | 端口 | 状态 | 备注 |
|------|------|------|------|
| Next.js (主服务) | 3000 | ✅ 运行中 | PID: 75922 |
| Next.js (新进程) | 3002 | ❌ 已终止 | 启动时端口冲突 |
| Python数据服务 | 8000 | ⚠️ 响应缓慢 | PID: 96502, 健康检查超时 |

### 数据源配置
根据启动日志，当前激活的数据源：
- ✅ **AKShare**: 财联社、AI快讯、芯片快讯、财新
- ✅ **NewsNow**: 华尔街见闻、财联社、澎湃、36氪
- ✅ **雪球**: 20分钟间隔
- ❌ **东方财富**: 未激活
- ❌ **新浪财经**: 未激活
- ❌ **其他社交媒体**: 未激活

---

## 测试结果

### ✅ 测试1: Next.js 市场概览API
**端点**: `GET /api/market/overview`

**测试结果**: ✅ **通过**

**响应数据**:
```json
{
  "success": true,
  "data": {
    "indices": [
      {
        "code": "sh000001",
        "name": "上证指数",
        "price": 3814.2,
        "change": 0,
        "changePct": 0,
        "source": "yahoo"
      },
      {
        "code": "sz399001",
        "name": "深证成指",
        "price": 13774.68,
        "change": 0,
        "changePct": 0,
        "source": "yahoo"
      },
      {
        "code": "sz399006",
        "name": "创业板指",
        "price": 3480.87,
        "change": 0,
        "changePct": 0,
        "source": "yahoo"
      },
      {
        "code": "sh000688",
        "name": "科创50",
        "price": 1787.2,
        "change": 0,
        "changePct": 0,
        "source": "yahoo"
      },
      {
        "code": "sh000300",
        "name": "沪深300",
        "price": 4649.19,
        "change": 0,
        "changePct": 0,
        "source": "yahoo"
      }
    ],
    "source": "yahoo",
    "timestamp": "2026-07-24T15:54:43.115Z"
  },
  "source": "yahoo"
}
```

**数据质量分析**:
- ✅ 所有5个主要指数数据完整
- ✅ 价格数据有效（非零值）
- ⚠️ `change` 和 `changePct` 均为0（可能是非交易时段）
- ✅ 数据源为Yahoo Finance（Python服务降级）

**发现问题**:
1. **数据源降级**: Python数据服务（AKShare/新浪）不可用，自动降级到Yahoo Finance
2. **涨跌幅为0**: 当前时间可能为非交易时段，或Yahoo Finance数据未更新

---

### ❌ 测试2: Next.js 资金流向API
**端点**: `GET /api/market/capital-flow`

**测试结果**: ❌ **失败**

**响应数据**:
```json
{
  "success": false,
  "error": "数据服务不可用，请确认 data-service 已启动",
  "data": null,
  "source": "unavailable"
}
```

**问题分析**:
- ❌ Python数据服务连接失败
- ❌ 无降级方案（资金流向数据只能从Python服务获取）
- ❌ UI将显示错误状态

---

### ❌ 测试3: Python数据服务健康检查
**端点**: `GET http://localhost:8000/health`

**测试结果**: ❌ **完全阻塞，无响应**

**问题描述**:
- 进程存在（PID 96502）
- 端口监听正常（8000）
- HTTP请求完全无响应（超时）

**根本原因** (已确认):
🔴 **Python服务被Claude API调用阻塞**

从日志文件发现：
```log
ERROR:services.content_analyzer:实体识别失败: Error code: 503 - 
  {'error': {'message': 'No available accounts: no available accounts', 'type': 'api_error'}}
ERROR:services.content_analyzer:AI情感分析失败: Error code: 503
ERROR:services.content_analyzer:AI分类失败: Error code: 503
ERROR:services.content_analyzer:关键词提取失败: Error code: 503
```

**问题分析**:
1. 服务启动时执行"缓存预热"任务
2. 预热过程中调用大量AI内容分析（实体识别、情感分析、分类、关键词提取）
3. Claude API代理（apiclaude.cc）返回503错误："No available accounts"
4. 每次失败都触发重试机制（0.4-1秒间隔）
5. 大量重试请求**阻塞了整个Python事件循环**
6. HTTP服务器无法响应任何请求（包括/health）

**影响范围**:
- ❌ 所有市场数据API不可用
- ❌ 资金流向功能失效
- ❌ 事件采集和分析停止
- ⚠️ Next.js被迫使用降级数据源（Yahoo Finance）

---

## 数据完整性分析

### 市场概览数据
| 指数代码 | 指数名称 | 价格 | 涨跌额 | 涨跌幅 | 数据源 | 状态 |
|---------|---------|------|-------|-------|--------|------|
| sh000001 | 上证指数 | 3814.2 | 0 | 0% | yahoo | ✅ |
| sz399001 | 深证成指 | 13774.68 | 0 | 0% | yahoo | ✅ |
| sz399006 | 创业板指 | 3480.87 | 0 | 0% | yahoo | ✅ |
| sh000688 | 科创50 | 1787.2 | 0 | 0% | yahoo | ✅ |
| sh000300 | 沪深300 | 4649.19 | 0 | 0% | yahoo | ✅ |

**数据质量评分**: 7/10
- ✅ 价格数据有效
- ✅ 所有指数覆盖完整
- ⚠️ 涨跌数据全为0（可能是时段问题）
- ⚠️ 使用降级数据源

### 资金流向数据
**状态**: ❌ **不可用**

无法获取资金流向数据，UI功能受影响。

---

## 问题汇总

### 🔴 严重问题 - 根本原因已确认

#### 1. Python数据服务被Claude API阻塞（主要问题）
**影响**: 
- 🔴 资金流向功能完全不可用
- 🔴 AI内容分析功能失效
- 🔴 事件采集和调度停止
- ⚠️ 市场概览被迫使用降级数据源（Yahoo Finance）

**根本原因**:
服务启动时执行"缓存预热"，其中包含大量AI内容分析任务（实体识别、情感分析、分类、关键词提取）。Claude API代理（apiclaude.cc）返回503错误 "No available accounts"，导致：
1. 每个AI调用失败后触发多次重试（0.4-1秒间隔）
2. 大量失败请求阻塞Python异步事件循环
3. HTTP服务器无法响应任何请求

**日志证据**:
```log
ERROR:services.content_analyzer:实体识别失败: Error code: 503
ERROR:services.content_analyzer:AI情感分析失败: Error code: 503
ERROR:services.content_analyzer:AI分类失败: Error code: 503
ERROR:services.content_analyzer:关键词提取失败: Error code: 503
INFO:anthropic._base_client:Retrying request to /v1/messages in 0.xxx seconds
(重复数百次...)
```

**立即修复方案**:

**方案A: 禁用AI分析功能（推荐）**
```python
# 修改 data-service/main.py
# 找到缓存预热部分，注释掉AI分析调用
@app.on_event("startup")
async def startup():
    logger.info("数据服务启动中...")
    # ... 调度器启动代码 ...
    
    # 临时禁用：避免AI API故障阻塞服务
    # await preload_content_analysis()  # <-- 注释掉这行
    
    logger.info("缓存预热完成（AI分析已禁用）")
```

**方案B: 修复Claude API配置**
```bash
# 检查环境变量
cat .env | grep ANTHROPIC_API_KEY

# 如果使用代理，验证代理服务
curl -X POST https://apiclaude.cc/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-3-haiku-20240307","max_tokens":10,"messages":[{"role":"user","content":"hi"}]}'
```

**方案C: 异步非阻塞启动**
```python
# 将缓存预热改为后台任务，不阻塞HTTP服务
@app.on_event("startup")
async def startup():
    logger.info("数据服务启动中...")
    
    # 先启动HTTP服务
    await init_scheduler()
    
    # 后台执行缓存预热（不等待）
    asyncio.create_task(preload_content_analysis())
    
    logger.info("服务已启动，缓存预热在后台执行")
```

#### 2. 资金流向API无降级方案
**影响**: 当Python服务不可用时，此功能完全失效

**建议修复**:
- 添加本地缓存降级机制（参考市场概览的实现）
- 在UI层优雅降级（显示"数据暂不可用"而非错误）

### ⚠️ 警告问题

#### 3. 涨跌幅数据全为0
**可能原因**:
- 当前为非交易时段（周末/节假日）
- Yahoo Finance数据未更新
- 数据解析问题

**验证方法**:
```bash
# 检查交易日历
curl "http://localhost:8000/api/market/overview" | jq '.data.indices[0]'
```

#### 4. 多个Next.js进程运行
**影响**: 可能导致端口冲突和资源浪费

**建议修复**:
```bash
# 清理旧进程
pkill -f "next dev"
npm run dev
```

---

## 数据源健康度

### Yahoo Finance
- **状态**: ✅ 正常
- **响应速度**: < 1秒
- **数据完整性**: 100% (5/5指数)
- **数据新鲜度**: ⚠️ 待验证（涨跌幅为0）

### Python数据服务 (AKShare/新浪)
- **状态**: ❌ 不可用
- **响应速度**: 超时 (>3秒)
- **数据完整性**: 无法测试
- **影响功能**: 资金流向、实时行情

---

## UI功能影响评估

| 功能模块 | 状态 | 数据源 | 用户体验 |
|---------|------|--------|---------|
| 仪表盘 - 指数行情 | ✅ 可用 | Yahoo (降级) | 良好 |
| 仪表盘 - 资金流向 | ❌ 不可用 | Python服务 | 差 - 显示错误 |
| 市场概览页 | ✅ 可用 | Yahoo (降级) | 中等 - 涨跌幅异常 |
| 技术指标计算 | ✅ 可用 | 基于价格计算 | 良好 |

---

## 修复建议

### 立即修复（P0 - 必须立即处理）

#### 1. 禁用启动时的AI分析调用
**操作步骤**:
```bash
cd data-service

# 备份原文件
cp main.py main.py.backup

# 编辑 main.py，找到缓存预热代码并注释
# 或使用以下命令自动注释
sed -i.bak '/await.*preload_content_analysis/s/^/# DISABLED: /' main.py

# 重启服务
pkill -9 -f "python.*main.py"
python3 main.py > /tmp/data-service.log 2>&1 &

# 等待5秒并验证
sleep 5
curl http://localhost:8000/health
```

**预期结果**: 服务应在5秒内启动并响应/health请求

#### 2. 验证所有功能恢复
```bash
# 测试市场概览
curl http://localhost:3000/api/market/overview | jq '.success'

# 测试资金流向（应该恢复）
curl http://localhost:3000/api/market/capital-flow | jq '.success'

# 测试Python服务健康
curl http://localhost:8000/health | jq '.status'
```

### 短期优化（P1）

3. **为资金流向API添加降级缓存**
参考 `src/app/api/market/overview/route.ts:126-138`，添加文件缓存机制。

4. **清理冗余Next.js进程**
```bash
pkill -f "next dev"
npm run dev
```

### 长期改进（P2）

5. **添加数据源健康监控**
- 在 `/api/health` 端点返回各数据源状态
- 前端显示数据源状态指示器

6. **优化Python服务启动性能**
- 延迟缓存预热到后台任务
- 减少启动时的同步数据库查询

7. **增强错误处理和用户提示**
- 在UI层区分"加载中"和"数据不可用"
- 提供重试按钮

---

## 测试结论

### 整体评估
**状态**: 🔴 **严重故障 - Python服务完全阻塞**

**通过率**: 33% (1/3测试可验证，仅市场概览降级可用)

### 核心发现
1. 🔴 **Python服务启动阻塞**：Claude API调用失败（503错误）导致服务无法响应
2. ❌ **资金流向功能失效**：依赖Python服务，无降级方案
3. ✅ **市场概览降级可用**：Yahoo Finance数据源正常工作
4. 🔴 **AI分析功能全部停止**：实体识别、情感分析、分类、关键词提取全部失败

### 根本原因
**Claude API代理服务故障**：
- 代理地址: `https://apiclaude.cc`
- 错误信息: `503 - No available accounts: no available accounts`
- 影响: Python服务启动时大量AI调用失败，重试请求阻塞事件循环

### 用户影响
- **不可用功能**: 资金流向分析、板块热度、AI事件分析、情感分类
- **降级可用**: 指数价格查看、基本市场概览
- **体验评分**: 2/10（核心功能失效）

### 下一步行动
1. **立即** (P0): 禁用Python服务启动时的AI分析调用，恢复基础数据服务
2. **今日** (P0): 修复或更换Claude API配置，恢复AI功能
3. **本周** (P1): 实现AI调用的异步非阻塞模式，避免再次阻塞
4. **本周** (P1): 为资金流向API添加文件缓存降级机制

---

## 附录

### 测试命令
```bash
# 市场概览
curl -s http://localhost:3000/api/market/overview | python3 -m json.tool

# 资金流向
curl -s http://localhost:3000/api/market/capital-flow | python3 -m json.tool

# Python服务健康检查
curl -s http://localhost:8000/health | python3 -m json.tool
```

### 日志位置
- Next.js: `.next/dev/logs/next-development.log`
- Python服务: `/tmp/data-service.log` (如使用后台启动)
- 系统日志: `console.log` 输出到终端

### 相关文件
- 市场概览路由: `src/app/api/market/overview/route.ts`
- 资金流向路由: `src/app/api/market/capital-flow/route.ts`
- Python服务入口: `data-service/main.py`
- 数据提供者: `data-service/providers/`

---

**报告生成时间**: 2026-07-24 23:56:00 CST  
**测试执行者**: CI自动化测试  
**版本**: v2.0.0
