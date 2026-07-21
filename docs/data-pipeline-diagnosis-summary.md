# 数据更新链路问题总结与解决方案

生成时间：2026-07-22 00:05  
问题：仪表盘数据与实际市场数据不符

## 问题根因

### 1. 网络连接问题（主因）

东方财富不同API服务器的连接状态：

| API服务器 | 用途 | 状态 | 影响 |
|----------|------|------|------|
| `48.push2.eastmoney.com` | 指数行情 | ✅ 可访问 | 指数数据正常 |
| `push2his.eastmoney.com` | 大盘资金流向 | ❌ 无法访问 | **导致资金流向数据异常** |
| API (板块资金流向) | 板块数据 | ✅ 可访问 | 板块数据正常 |

**核心问题：**
- `stock_market_fund_flow` API依赖的 `push2his.eastmoney.com` 服务器无法连接
- 连接失败原因：`RemoteDisconnected('Remote end closed connection without response')`
- 这不是代理问题，而是该服务器本身的网络问题

### 2. 降级机制带来的数据质量问题

当大盘资金流向API失败时，系统降级到"行业汇总估算"：

```python
# akshare_provider.py 第311-332行
df = await self._call(ak.stock_fund_flow_industry)  # 获取行业资金流向
total_net = df["净额"].astype(float).sum()  # 汇总所有行业净额
main_net = total_net * 1e8  # 作为主力资金

# 问题：散户资金是反向估算的，不准确
retail_ratio = min(0.4, max(0.2, 1 - (total_net / total_inflow)))
retail_net = -main_net * retail_ratio
```

**数据质量问题：**
- ✅ 主力资金方向大致正确（基于行业汇总）
- ❌ 主力资金数值不准确（行业汇总 ≠ 大盘总和）
- ❌ 散户资金完全是估算值（简单反向计算）
- ❌ 比例关系不准确

### 3. 缓存陈旧但持续使用

```bash
# 缓存文件时间戳
market_capital_flow.json - Jul 21 02:46 (22小时前)
sector_capital_flow_今日.json - Jul 21 02:35 (22小时前)
```

- 缓存TTL设置：600秒（10分钟）
- 实际使用：22小时前的数据
- 原因：新数据获取一直失败，持续使用陈旧缓存

## 当前数据状态

### 指数数据：✅ 基本正常
- **来源：** AKShare日线数据（`stock_zh_index_daily`）
- **时效：** 2026-07-21收盘价
- **质量：** 真实数据（非估算）
- **问题：** 非交易时段显示上一交易日收盘价（符合预期）

### 资金流向数据：⚠️ 降级估算
- **来源：** 行业资金流向汇总估算
- **时效：** 2026-07-21
- **质量：** `"dataQuality": "estimated"`
- **问题：** 
  - 主力资金：368.76亿（估算值，可能偏差±20%）
  - 散户资金：-147.5亿（反向估算，仅供参考）
  - 比例关系不准确

### 板块资金流向：✅ 正常
- **来源：** AKShare行业资金流向
- **时效：** 2026-07-21
- **质量：** 真实数据
- **状态：** Top10流入/流出板块数据准确

## 解决方案

### 方案A：使用替代数据源（推荐）

**优点：** 可立即实施，不依赖问题服务器恢复

**实施步骤：**

1. **新浪财经作为备用源**
```python
# providers/sina_provider.py
async def get_market_capital_flow(self) -> Dict:
    # 使用新浪财经接口获取大盘资金流向
    pass
```

2. **Tushare作为备用源**（需要token）
```python
# providers/tushare_provider.py  
async def get_market_capital_flow(self) -> Dict:
    # 使用Tushare接口
    pass
```

3. **调整优先级配置**
```python
"market_capital_flow": CategoryConfig(
    sources=["sina", "tushare", "akshare"],  # 将可用源提前
    cache_ttl=600,
),
```

### 方案B：改进降级逻辑

**优点：** 即使无备用源也能提供更准确的数据

**实施方向：**

1. **更准确的估算算法**
```python
# 基于历史比例关系，而非固定公式
async def get_market_capital_flow(self) -> Dict:
    try:
        # 正常逻辑
        df = await self._call(ak.stock_market_fund_flow)
        # ...
    except Exception as e:
        # 改进的降级逻辑
        df = await self._call(ak.stock_fund_flow_industry)
        
        # 使用历史平均比例
        cached_ratio = self._get_historical_ratio()  # 从缓存读取
        
        total_net = df["净额"].astype(float).sum()
        main_net = total_net * 1e8
        retail_net = -main_net * cached_ratio  # 使用历史比例
        
        return {
            "主力净流入-净额": main_net,
            "中单净流入-净额": retail_net * 0.6,
            "小单净流入-净额": retail_net * 0.4,
            "dataQuality": "estimated_improved",  # 标记为改进估算
        }
```

2. **明确标注数据质量**
```python
# 前端明确区分
if (dataQuality === 'estimated') {
  return (
    <Badge variant="warning">
      估算数据 (实际数据源不可用)
    </Badge>
  )
}
```

### 方案C：放弃估算，明确标记不可用

**优点：** 避免误导用户

**实施：**
```python
async def get_market_capital_flow(self) -> Dict:
    try:
        df = await self._call(ak.stock_market_fund_flow)
        # ... 正常逻辑
    except Exception as e:
        # 不降级，直接抛出异常
        raise Exception("大盘资金流向数据暂时不可用")
```

前端显示：
```tsx
{!capitalFlow && (
  <Alert variant="warning">
    <AlertCircle className="h-4 w-4" />
    <AlertTitle>数据源暂时不可用</AlertTitle>
    <AlertDescription>
      大盘资金流向数据源维护中，请稍后刷新
    </AlertDescription>
  </Alert>
)}
```

## 立即行动计划

### 短期（今天）

1. ✅ **清除陈旧缓存**
```bash
rm data-service/.cache/market_capital_flow.json
```

2. ⏳ **前端UI改进** - 明确标注数据质量
```tsx
{capitalFlow && capitalFlow.dataQuality === 'estimated' && (
  <Badge variant="outline" className="text-yellow-600">
    ⚠️ 估算数据
  </Badge>
)}
```

3. ⏳ **监控日志** - 观察服务器是否恢复
```bash
tail -f /tmp/data-service.log | grep "stock_market_fund_flow"
```

### 中期（本周）

1. **实现Sina Provider** 或 **配置Tushare**
2. **测试备用数据源的准确性**
3. **调整数据源优先级配置**

### 长期

1. **实现数据源健康检查**
2. **自动切换到可用数据源**
3. **数据质量监控告警**

## 验证命令

```bash
# 1. 测试当前数据状态
curl http://localhost:8000/api/capital-flow/macro | jq '.data.dataQuality'

# 2. 查看板块数据（验证可用接口）
curl http://localhost:8000/api/capital-flow/sector | jq '.data[0:3]'

# 3. 清除缓存重新获取
rm data-service/.cache/*.json
curl http://localhost:8000/api/capital-flow/macro | jq '.data'

# 4. 检查服务日志
tail -100 /tmp/data-service.log | grep -E "(stock_market_fund_flow|降级)"
```

## 结论

**问题根因：** 东方财富 `push2his.eastmoney.com` 服务器无法访问

**影响范围：** 大盘资金流向数据不准确（估算值）

**其他数据：** 指数数据、板块数据基本正常

**推荐方案：** 
1. 短期：前端明确标注"估算数据"
2. 中期：实现备用数据源（新浪财经/Tushare）
3. 长期：自动数据源切换机制

**紧急程度：** 中等（数据可用但不准确，不影响系统运行）
