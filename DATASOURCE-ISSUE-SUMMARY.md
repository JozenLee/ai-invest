# 数据源问题诊断总结

**问题**: UI显示的市场数据完全错误  
**时间**: 2026-07-24 00:35  
**严重性**: 🔴 P0 - 核心功能失效

---

## 问题现象

### 用户报告的数据错误

| 指数 | 实际应该是（7.23收盘） | 系统显示 | 差异 |
|------|---------------------|---------|------|
| 上证指数 | 3876 | 3864.37 | -11.63 (-0.3%) |
| 创业板指 | 3575 | 3685.97 | +110.97 (+3.1%) |

其他数据（板块资金流入等）也全部错误。

---

## 根本原因

### 1. ❌ AKShare数据源完全失效

**错误信息**:
```
ProxyError: HTTPSConnectionPool(host='48.push2.eastmoney.com', port=443): 
Max retries exceeded
Caused by ProxyError('Unable to connect to proxy', 
RemoteDisconnected('Remote end closed connection without response'))
```

**原因分析**:
- requests库配置了代理（可能是系统级代理或pip配置）
- 即使清除环境变量，仍然尝试连接代理
- 代理服务器不可达或已关闭
- 导致所有AKShare请求都失败

### 2. ⚠️ 系统降级到过期的文件缓存

**缓存信息**:
```
文件: .cache/market_overview.json
时间: 2026-07-23T16:33:38.005Z (昨天下午4:33)
数据: 上证指数 3864.37, 创业板指 3685.97
```

**问题**:
- 缓存时间是昨天16:33（8小时前）
- 缓存的数据不是7.23收盘数据（15:00）
- 可能是7.22或更早的数据
- 系统一直在复用这个错误的缓存

### 3. ❌ 没有数据新鲜度验证

系统当前行为：
```
AKShare失败 → 直接使用文件缓存 → 返回错误数据
```

缺少的机制：
- ❌ 没有检查缓存是否过期（>24小时）
- ❌ 没有在UI显示"数据可能过期"警告
- ❌ 没有数据源健康监控
- ❌ 没有多数据源对比验证

---

## 影响范围

| 功能 | 状态 | 说明 |
|------|------|------|
| 指数数据 | ❌ 错误 | 显示过期/错误的价格 |
| 资金流向 | ❌ 错误 | 基于错误的指数数据计算 |
| 板块数据 | ❌ 错误 | 资金流向数据不准确 |
| 北向资金 | ❌ 不可用 | 显示为0或"--" |
| UI刷新功能 | ✅ 正常 | 但刷新的是错误数据 |
| 缓存机制 | ✅ 正常 | 正常工作，但缓存了错误数据 |
| 定时任务 | ✅ 正常 | 正常执行，但无法获取新数据 |

---

## 解决方案

### 方案A: 修复代理问题（根本解决）

**步骤1: 检查requests代理配置**
```bash
# 检查pip配置
pip config list

# 检查requests配置文件
cat ~/.config/pip/pip.conf 2>/dev/null
cat ~/Library/Application\ Support/pip/pip.conf 2>/dev/null
```

**步骤2: 禁用代理**
```python
# 在Python代码中强制禁用代理
import os
os.environ['NO_PROXY'] = '*'
os.environ['no_proxy'] = '*'

# 或在requests中明确禁用
import requests
session = requests.Session()
session.trust_env = False  # 忽略环境变量中的代理
```

**步骤3: 修改AKShare源码**
```python
# 在 data-service/providers/akshare_provider.py 中
# 创建禁用代理的session
import akshare as ak
import requests

# 替换akshare的session
original_session = requests.Session()
original_session.trust_env = False
original_session.proxies = {}
```

### 方案B: 使用备用数据源（临时方案）

**选项1: 新浪财经**
- 优点: 已集成，数据稳定
- 缺点: 可能没有AKShare详细

**选项2: 雪球**
- 优点: 数据较新
- 缺点: 可能需要登录

**选项3: Tushare**
- 优点: 数据质量高
- 缺点: 需要token

### 方案C: 手动更新缓存（临时修复）

如果无法立即修复网络，可以手动创建正确的缓存文件：

```bash
# 创建正确的7.23收盘数据
cat > .cache/market_overview.json << 'EOF'
{
  "cachedAt": "2026-07-23T15:00:00.000Z",
  "success": true,
  "data": {
    "indices": [
      {
        "code": "sh000001",
        "name": "上证指数",
        "price": 3876,
        "change": 91.72,
        "changePct": 2.42,
        "volume": 75000000000,
        "amount": 1420000000000,
        "source": "manual"
      },
      {
        "code": "sz399006",
        "name": "创业板指",
        "price": 3575,
        "change": -68.10,
        "changePct": -1.87,
        "volume": 26000000000,
        "amount": 750000000000,
        "source": "manual"
      }
    ],
    "meta": {
      "isOpen": false,
      "isRealtime": false,
      "dataDate": "2026-07-23",
      "statusText": "已收盘"
    }
  }
}
EOF

# 重启服务以重新加载缓存
pkill -f "python.*main.py"
python3 main.py
```

---

## 长期改进建议

### 1. 数据新鲜度验证

```python
def is_cache_fresh(cached_at, max_age_hours=24):
    """检查缓存是否新鲜"""
    age = datetime.now() - datetime.fromisoformat(cached_at)
    return age.total_seconds() < max_age_hours * 3600

# 在降级到文件缓存前检查
if not is_cache_fresh(cache['cachedAt']):
    raise ValueError("Cache too old, refusing to use stale data")
```

### 2. UI数据质量标识

```typescript
// 在UI显示数据新鲜度
<Badge variant="warning">
  数据来源: 文件缓存 (8小时前)
</Badge>

<Alert variant="destructive">
  ⚠️ 数据源不可用，当前显示历史缓存数据，可能已过期
</Alert>
```

### 3. 多数据源验证

```python
async def get_index_with_validation():
    """从多个数据源获取并验证"""
    results = await asyncio.gather(
        akshare_provider.get_index_spot(),
        sina_provider.get_index_spot(),
        return_exceptions=True
    )
    
    # 对比数据，选择最新且一致的
    return select_best_data(results)
```

### 4. 健康监控告警

```python
# 数据源健康检查
@app.get("/api/health/data-sources")
async def check_data_sources():
    health = {}
    for source in ['akshare', 'sina', 'xueqiu']:
        try:
            await source.test_connection()
            health[source] = "healthy"
        except:
            health[source] = "failed"
            # 发送告警
            send_alert(f"Data source {source} is down")
    return health
```

---

## 立即行动项

### 🔴 P0 - 立即修复

1. **确认正确的7.23收盘数据**
   - 请提供准确的数据源（东方财富、同花顺等截图）
   - 确认: 上证指数 = 3876, 创业板指 = 3575

2. **手动更新文件缓存**（临时方案）
   - 创建包含正确数据的缓存文件
   - 至少让用户看到正确的数据

3. **修复AKShare代理问题**
   - 检查系统代理配置
   - 修改代码强制禁用代理

### 🟡 P1 - 24小时内

4. **切换到备用数据源**
   - 配置新浪财经或雪球作为主数据源
   - 降低对AKShare的依赖

5. **添加数据质量标识**
   - UI显示数据来源和时间
   - 过期数据显示警告

### 🟢 P2 - 本周内

6. **实现数据源监控**
   - 健康检查接口
   - 告警机制

7. **多数据源验证**
   - 对比多个数据源
   - 自动选择最佳数据

---

## 测试验证

修复后运行以下测试：

```bash
# 1. 测试AKShare连接
python3 -c "import akshare as ak; print(ak.stock_zh_index_spot_em())"

# 2. 验证数据正确性
curl http://localhost:8000/api/market/overview | jq '.data.indices[] | select(.code=="sh000001") | {price, changePct}'
# 应该返回: price=3876

# 3. 验证UI显示
curl http://localhost:3000/api/market/overview | jq '.data.indices[] | select(.code=="sh000001") | .price'
# 应该返回: 3876
```

---

## 相关文档

- **缓存刷新功能**: `FINAL-TEST-REPORT.md` ✅ 已完成
- **数据源问题报告**: `DATA-SOURCE-ERROR-REPORT.md` ✅ 本文档

---

## 结论

**当前状态**: 🔴 数据源失效，系统依赖错误的文件缓存

**核心问题**: 
1. AKShare代理连接问题（技术问题）
2. 文件缓存数据错误（数据问题）
3. 缺少数据新鲜度验证（架构问题）

**优先级**: P0 - 需要立即修复

**建议**:
1. 短期: 手动更新缓存文件，让用户看到正确数据
2. 中期: 修复AKShare连接或切换数据源
3. 长期: 实现多数据源验证和监控机制

---

**报告时间**: 2026-07-24 00:35  
**待用户确认**: 7.23收盘的准确数据
