# 数据更新链路诊断报告

生成时间：2026-07-22  
诊断对象：仪表盘数据与实际市场数据不符问题

## 问题现象

仪表盘显示的以下数据与实际市场数据不一致：
1. 指数数据（上证指数、深证成指等）
2. 资金流向数据（主力资金、散户资金）
3. 板块资金流向数据（Top10流入/流出）

## 数据流向追踪

```
用户浏览器 
  ↓ (fetch)
Next.js API (/api/market/overview, /api/market/capital-flow)
  ↓ (HTTP请求)
Python FastAPI服务 (localhost:8000)
  ↓
DataService (统一数据服务层)
  ↓
ProviderRegistry (数据源调度器)
  ↓
AKShareProvider (AKShare数据提供者)
  ↓
AKShare库 → 东方财富API
```

## 诊断结果

### 1. **根本原因：AKShare网络连接问题**

**现象：**
- `stock_zh_index_spot_em` (指数行情) - **连接失败**
- `stock_market_fund_flow` (大盘资金流向) - **连接失败**  
- `stock_fund_flow_industry` (板块资金流向) - **正常工作**

**错误信息：**
```
HTTPSConnectionPool(host='48.push2.eastmoney.com', port=443): 
Max retries exceeded... (Caused by ProxyError('Unable to connect to proxy'))
```

**原因分析：**
- 系统存在代理配置问题，导致部分东方财富API无法访问
- 不是所有AKShare接口都失败，板块资金流向接口正常

### 2. **降级机制触发**

#### 2.1 指数数据降级路径

**配置的降级链：** AKShare → Tushare → 雪球 → 本地缓存

**实际执行：**
1. ✅ AKShare主接口失败（网络错误）
2. ✅ 备用接口也失败
3. ✅ 通过日K数据获取收盘价成功
4. ✅ 返回7月21日收盘数据

**数据来源：** AKShare日线数据（`stock_zh_index_daily`）
**数据时效性：** 上一交易日收盘价（2026-07-21）

#### 2.2 资金流向数据降级路径

**配置的降级链：** 大盘接口 → 行业汇总估算

**实际执行：**
1. ❌ `stock_market_fund_flow` 失败（网络错误）
2. ✅ 降级到 `stock_fund_flow_industry` 成功
3. ✅ 通过行业资金流向汇总估算大盘数据

**数据来源：** 行业资金流向汇总估算
**数据质量：** `"dataQuality": "estimated"` （估算值）

**估算逻辑问题：**
```python
# akshare_provider.py:311-332
total_net = df["净额"].astype(float).sum()
main_net = total_net * 1e8  # 将亿元转为元

# 问题：散户资金按比例估算，而非真实数据
retail_ratio = min(0.4, max(0.2, 1 - (total_net / total_inflow)))
retail_net = -main_net * retail_ratio
```

这个估算逻辑可能导致：
- 主力资金数值不准确（基于行业汇总，非实际大盘数据）
- 散户资金是反向估算的（非真实流向）
- 比例关系不准确

### 3. **缓存机制**

**缓存文件时间戳：**
- `index_spot.json` - Jul 21 02:39（22小时前）
- `market_capital_flow.json` - Jul 21 02:46（22小时前）
- `sector_capital_flow_今日.json` - Jul 21 02:35（22小时前）

**缓存内容：**
```json
{
  "主力净流入-净额": 36875999999.99999,  // 368.76亿
  "主力净流入-净占比": 2.09,
  "中单净流入-净额": -8850239999.999998, // -88.5亿
  "小单净流入-净额": -5900160000.0,     // -59亿
  "日期": "2026-07-21",
  "source": "fund_flow_industry",
  "dataQuality": "estimated"
}
```

**问题：**
- 缓存TTL设置为600秒（10分钟），但实际使用了22小时前的数据
- 说明新的数据获取一直在失败，系统持续使用陈旧缓存

### 4. **前端数据展示**

**MarketContext自动刷新机制：**
```typescript
// 交易时段每30秒刷新，非交易时段每5分钟刷新
const refreshInterval = marketMeta?.isOpen ? 30 * 1000 : 5 * 60 * 1000
```

**当前状态：**
- 市场状态：盘前（pre_market）
- 刷新间隔：5分钟
- 数据来源标识：`"source": "cached"`, `"dataQuality": "estimated"`

**问题：**
- 前端持续刷新，但每次都从缓存获取陈旧数据
- 用户看到的是昨天的估算数据，而非今日真实数据

## 问题总结

| 数据类型 | 预期来源 | 实际来源 | 数据时效 | 数据质量 |
|---------|---------|---------|---------|---------|
| 指数行情 | AKShare实时API | AKShare日线数据 | 2026-07-21收盘 | ✅ 真实 |
| 大盘资金流向 | AKShare大盘接口 | 行业汇总估算 | 2026-07-21 | ⚠️ 估算 |
| 板块资金流向 | AKShare行业接口 | AKShare行业接口 | 2026-07-21 | ✅ 真实 |
| 北向资金 | AKShare北向接口 | 历史数据降级 | 上一交易日 | ⚠️ 陈旧 |

## 修复建议

### 方案1：修复网络连接（推荐）

**优先级：高**

检查并修复代理配置：

```bash
# 检查系统代理设置
env | grep -i proxy

# 检查Python代理设置
python3 -c "import os; print('HTTP_PROXY:', os.environ.get('HTTP_PROXY')); print('HTTPS_PROXY:', os.environ.get('HTTPS_PROXY'))"

# 临时禁用代理测试
unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy
cd data-service && python main.py
```

**预期效果：**
- AKShare所有接口恢复正常
- 获取真实的大盘资金流向数据
- 数据质量从"estimated"变为"realtime"

### 方案2：切换数据源

**优先级：中**

配置备用数据源优先级：

```python
# data-service/providers/registry.py
DEFAULT_CATEGORY_CONFIG = {
    "market_capital_flow": CategoryConfig(
        sources=["sina", "akshare", "tushare"],  # 将新浪财经提前
        cache_ttl=600,
    ),
}
```

**需要实现：**
- SinaProvider的 `get_market_capital_flow` 方法
- 数据格式统一转换

### 方案3：改进降级逻辑

**优先级：中**

优化行业汇总估算算法：

```python
# 当前问题：散户资金是简单反向估算
# 改进：使用更准确的比例关系或放弃估算，直接标记为不可用

async def get_market_capital_flow(self) -> Dict:
    try:
        df = await self._call(ak.stock_market_fund_flow)
        # ... 正常逻辑
    except Exception as e:
        print(f"[AKShare] 大盘资金流向接口失败: {e}")
        # 不降级到不准确的估算，直接返回失败
        raise Exception("大盘资金流向数据暂时不可用")
```

**预期效果：**
- 避免展示不准确的估算数据
- 前端明确显示"数据不可用"而非误导性数据

### 方案4：缓存策略优化

**优先级：低**

1. 区分"降级缓存"和"陈旧缓存"
2. 陈旧缓存（超过1天）应明确标记
3. 前端UI明确区分数据来源和时效性

```python
# 添加缓存新鲜度检查
if cached:
    cache_age = datetime.now() - cached_timestamp
    if cache_age > timedelta(hours=24):
        cached["dataQuality"] = "stale"
        cached["cacheAge"] = str(cache_age)
```

## 立即行动建议

1. **检查网络/代理配置**（5分钟）
2. **测试直接访问东方财富API**（10分钟）
3. **临时禁用代理重启数据服务**（5分钟）
4. **验证数据是否恢复正常**（5分钟）

如果网络问题无法快速解决：
- 考虑实现SinaProvider作为备用数据源
- 或在前端明确标注"数据降级为估算值"

## 验证命令

```bash
# 1. 测试AKShare直接连接
python3 -c "import akshare as ak; print(ak.stock_market_fund_flow().tail(1))"

# 2. 测试数据服务API
curl http://localhost:8000/api/capital-flow/macro | jq '.data.dataQuality'

# 3. 检查缓存时效
ls -lh data-service/.cache/*.json

# 4. 清除缓存重新获取
rm data-service/.cache/*.json
curl http://localhost:8000/api/capital-flow/macro
```
