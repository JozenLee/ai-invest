# 数据准确性测试指南

## 概述

本测试套件用于防止数据准确性问题再次发生，包括：
- 缓存key不匹配
- 交易日期计算错误
- 数据源优先级配置错误

## 测试文件

### 1. 单元测试
**文件**: `data-service/tests/test_data_accuracy.py`

**测试覆盖**:
- ✅ 缓存key一致性检查
- ✅ 交易日期逻辑验证
- ✅ 数据源优先级配置
- ✅ 数据结构完整性

**运行方式**:
```bash
cd data-service
python3 -m pytest tests/test_data_accuracy.py -v
```

**预期结果**: 10 passed, 2 skipped

### 2. 集成测试
**文件**: `data-service/tests/test_data_accuracy_integration.sh`

**测试覆盖**:
- ✅ API返回数据准确性
- ✅ 日期不能是未来日期
- ✅ 前后端数据一致性
- ✅ 数据完整性验证

**运行方式**:
```bash
cd data-service
bash tests/test_data_accuracy_integration.sh
```

**前置条件**:
- Python服务运行在 http://localhost:8000
- (可选) Next.js服务运行在 http://localhost:3000

### 3. GitHub Actions CI
**文件**: `.github/workflows/data-accuracy.yml`

**触发条件**:
- Push到 main/develop分支
- Pull Request到 main/develop分支
- 修改 data-service/** 路径下的文件

**包含任务**:
1. **unit-tests**: 运行单元测试
2. **integration-tests**: 启动服务并运行集成测试
3. **code-review**: 静态代码检查，防止错误模式

## 测试详情

### TestCacheKeyConsistency（缓存key一致性）

#### test_index_spot_cache_key_matches_file_name
**目的**: 防止 cache_key="index_spot" 导致缓存未命中

**检查内容**:
```python
# data-service/services/data_service.py
async def get_index_spot(self) -> pd.DataFrame:
    result = await self.registry.fetch(
        cache_key="market_overview",  # ✅ 必须是 market_overview
    )
```

**失败时**: 代码使用了错误的cache_key，导致无法读取缓存文件

#### test_market_capital_flow_cache_key_consistent
**目的**: 验证资金流向缓存key一致性

**检查内容**: cache_key应为 "market_capital_flow"

#### test_sector_capital_flow_cache_key_pattern
**目的**: 验证板块资金流向缓存key包含indicator参数

**检查内容**: cache_key应为 f"sector_capital_flow_{indicator}"

### TestTradingDateLogic（交易日期逻辑）

#### test_get_last_trading_date_logic
**目的**: 验证 get_last_trading_date() 在不同时间段的行为

**测试场景**:
- 周一盘前(9:00) → 返回上周五
- 周二盘前(9:00) → 返回周一
- 周六 → 返回周五

#### test_akshare_provider_uses_get_last_trading_date
**目的**: 防止 AKShare Provider 使用 datetime.now()

**检查内容**:
```python
# providers/akshare_provider.py
return {
    "日期": get_last_trading_date(),  # ✅ 正确
    # "日期": datetime.now().strftime("%Y-%m-%d"),  # ❌ 错误
}
```

#### test_sina_provider_uses_get_last_trading_date
**目的**: 防止 Sina Provider 使用 datetime.now()

**检查内容**: 同上

### TestDataSourcePriority（数据源优先级）

#### test_market_capital_flow_source_priority
**目的**: 验证真实数据优先于估算数据

**检查内容**:
```python
# providers/registry.py
"market_capital_flow": CategoryConfig(
    sources=["akshare", "sina"],  # ✅ akshare优先
    # sources=["sina", "akshare"],  # ❌ 错误
)
```

### TestDataIntegrity（数据完整性）

#### test_index_spot_data_structure
**目的**: 验证指数数据结构正确

**检查字段**: code, name, price, change, changePct

#### test_market_capital_flow_data_structure
**目的**: 验证资金流向数据结构正确

**检查字段**: 日期, 主力净流入-净额, source, dataQuality

#### test_capital_flow_date_before_market_open
**目的**: 验证盘前时间资金流向日期为上一交易日

## 本地开发测试流程

### 1. 修改代码后运行单元测试
```bash
cd data-service
python3 -m pytest tests/test_data_accuracy.py -v
```

### 2. 启动服务
```bash
# 终端1：启动Python服务
cd data-service
python3 main.py

# 终端2（可选）：启动Next.js服务
cd ..
npm run dev
```

### 3. 运行集成测试
```bash
cd data-service
bash tests/test_data_accuracy_integration.sh
```

### 4. 提交前检查
```bash
# 检查缓存key
grep -r 'cache_key=' data-service/services/data_service.py

# 检查日期处理
grep -A 5 'get_market_capital_flow' data-service/providers/akshare_provider.py | grep '日期'
grep -A 5 'get_market_capital_flow' data-service/providers/sina_provider.py | grep '日期'
```

## 快速命令

```bash
# 运行所有单元测试
cd data-service && python3 -m pytest tests/test_data_accuracy.py -v

# 运行特定测试类
cd data-service && python3 -m pytest tests/test_data_accuracy.py::TestCacheKeyConsistency -v

# 运行特定测试
cd data-service && python3 -m pytest tests/test_data_accuracy.py::TestTradingDateLogic::test_get_last_trading_date_logic -v

# 运行集成测试
cd data-service && bash tests/test_data_accuracy_integration.sh

# 静态代码检查
grep -r 'cache_key="index_spot"' data-service/services/
```

## 添加新测试

### 1. 单元测试
在 `tests/test_data_accuracy.py` 中添加新的测试类或测试方法：

```python
class TestNewFeature:
    """测试新功能的数据准确性"""

    @pytest.mark.asyncio
    async def test_new_feature_data(self):
        """测试新功能返回的数据"""
        # 测试逻辑
        assert condition, "错误信息"
```

### 2. 集成测试
在 `tests/test_data_accuracy_integration.sh` 中添加新的测试用例：

```bash
test_case \
    "新功能描述" \
    "curl -s $BASE_URL/api/new-endpoint | jq -r '.field'" \
    "expected_value"
```

## 故障排查

### 测试失败：cache_key不匹配
**症状**: `test_index_spot_cache_key_matches_file_name` 失败

**解决**:
1. 检查 `data-service/services/data_service.py`
2. 确认 cache_key 与文件名一致
3. 修改为正确的 cache_key

### 测试失败：使用了datetime.now()
**症状**: `test_akshare_provider_uses_get_last_trading_date` 失败

**解决**:
1. 检查 `data-service/providers/akshare_provider.py` 或 `sina_provider.py`
2. 将 `datetime.now().strftime("%Y-%m-%d")` 改为 `get_last_trading_date()`
3. 添加导入: `from utils.trading_hours import get_last_trading_date`

### 集成测试失败：API返回错误
**症状**: 集成测试无法连接到服务

**解决**:
1. 确认服务正在运行: `curl http://localhost:8000/health` 
2. 检查端口占用: `lsof -i:8000`
3. 查看服务日志

## 维护清单

- [ ] 修改缓存相关代码时运行单元测试
- [ ] 修改日期处理逻辑时运行单元测试
- [ ] 添加新API时添加对应的集成测试
- [ ] 提交PR前确保所有测试通过
- [ ] 每次发布前运行完整测试套件

## 相关文档

- [修复记录](./2024-07-24-data-accuracy-fix.md)
- [Trading Hours工具](../data-service/utils/trading_hours.py)
- [数据服务文档](../data-service/README.md)
