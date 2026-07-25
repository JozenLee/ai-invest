# 数据准确性修复记录

**日期**: 2024-07-24  
**问题**: 市场数据和资金流向数据显示不准确

## 问题1: 指数行情数据错误

### 现象
- 上证指数显示 3864.37，实际应为 3876.78
- 创业板指显示 3685.97，实际应为 3575.52
- 所有指数数据均不正确

### 根因分析
缓存key不匹配导致缓存未命中：
- 代码中使用 `cache_key="index_spot"`
- 文件缓存名称为 `market_overview.json`
- 导致系统无法读取正确的缓存文件

### 修复方案
**文件**: `data-service/services/data_service.py:69`

```python
# 修改前
async def get_index_spot(self) -> pd.DataFrame:
    result = await self.registry.fetch(
        category="index_spot",
        method="get_index_spot",
        cache_key="index_spot",  # ❌ 错误
        cache_ttl=30,
    )

# 修改后
async def get_index_spot(self) -> pd.DataFrame:
    result = await self.registry.fetch(
        category="index_spot",
        method="get_index_spot",
        cache_key="market_overview",  # ✅ 正确
        cache_ttl=30,
    )
```

## 问题2: 资金流向日期错误

### 现象
- 7月24日盘前（9:30前），资金流向显示7月24日数据
- 实际应该显示上一个交易日（7月23日）的数据
- 市场未开盘时不应该有当天数据

### 根因分析
两个Provider使用 `datetime.now()` 作为日期，没有考虑交易时间：
- `providers/akshare_provider.py:342` - AKShare估算数据
- `providers/sina_provider.py:120` - Sina估算数据

### 修复方案

**文件1**: `data-service/providers/akshare_provider.py`

```python
# 修改前
async def get_market_capital_flow(self) -> Dict:
    # ... 降级估算逻辑
    return {
        "日期": datetime.now().strftime("%Y-%m-%d"),  # ❌ 错误
        # ...
    }

# 修改后
async def get_market_capital_flow(self) -> Dict:
    from utils.trading_hours import get_last_trading_date
    # ... 降级估算逻辑
    return {
        "日期": get_last_trading_date(),  # ✅ 正确
        # ...
    }
```

**文件2**: `data-service/providers/sina_provider.py`

```python
# 修改前
async def get_market_capital_flow(self) -> Dict:
    from utils.trading_hours import get_last_trading_date  # ✅ 新增
    # ... 估算逻辑
    return {
        "日期": datetime.now().strftime("%Y-%m-%d"),  # ❌ 错误
        # ...
    }

# 修改后  
async def get_market_capital_flow(self) -> Dict:
    from utils.trading_hours import get_last_trading_date
    # ... 估算逻辑
    return {
        "日期": get_last_trading_date(),  # ✅ 正确
        # ...
    }
```

## 问题3: 数据源优先级配置不当

### 现象
- AKShare有真实大盘资金流向数据
- 但系统优先使用Sina的估算数据

### 修复方案
**文件**: `data-service/providers/registry.py:73-77`

```python
# 修改前
"market_capital_flow": CategoryConfig(
    sources=["sina", "akshare"],  # ❌ Sina优先
    cache_ttl=600,
    fallback_to_file=True,
),

# 修改后
"market_capital_flow": CategoryConfig(
    sources=["akshare", "sina"],  # ✅ AKShare优先
    cache_ttl=600,
    fallback_to_file=True,
),
```

## 验证结果

### 指数数据
```bash
curl -s http://localhost:8000/api/market/overview | jq '.data.indices[] | select(.code=="sh000001" or .code=="sz399006")'
```

**预期输出**:
- 上证指数: 3876.78
- 创业板指: 3575.52

### 资金流向数据
```bash
curl -s http://localhost:8000/api/capital-flow/market | jq '{date: .data.date, mainNet: .data.market.totalMainNet}'
```

**预期输出**:
- 盘前时间：返回上一交易日
- 交易时间：返回当日
- 盘后时间：返回当日

## 教训总结

1. **缓存key命名规范**: 代码中的cache_key应与文件名保持一致
2. **交易时间处理**: 涉及日期的数据必须使用 `get_last_trading_date()` 而不是 `datetime.now()`
3. **数据源选择**: 真实数据优先级应高于估算数据
4. **测试覆盖**: 需要增加CI测试验证数据准确性

## 相关文件

- `data-service/services/data_service.py`
- `data-service/providers/akshare_provider.py`
- `data-service/providers/sina_provider.py`
- `data-service/providers/registry.py`
- `data-service/utils/trading_hours.py`
