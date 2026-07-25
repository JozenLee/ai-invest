# 数据准确性测试套件

## 快速开始

```bash
# 单元测试
python3 -m pytest test_data_accuracy.py -v

# 集成测试（需要服务运行）
bash test_data_accuracy_integration.sh
```

## 测试文件说明

### test_data_accuracy.py
单元测试，验证代码层面的正确性：
- ✅ 缓存key命名规范
- ✅ 交易日期计算逻辑
- ✅ 数据源优先级配置
- ✅ 数据结构完整性

### test_data_accuracy_integration.sh
集成测试，验证实际API行为：
- ✅ API返回数据准确性
- ✅ 日期不能是未来
- ✅ 前后端数据一致性
- ✅ 数据完整性

## 防止的问题

### 1. 缓存key不匹配
**问题**: `cache_key="index_spot"` 但文件名为 `market_overview.json`  
**测试**: `TestCacheKeyConsistency::test_index_spot_cache_key_matches_file_name`

### 2. 盘前显示当天日期
**问题**: 使用 `datetime.now()` 导致盘前显示未来日期  
**测试**: `TestTradingDateLogic::test_akshare_provider_uses_get_last_trading_date`

### 3. 估算数据优先于真实数据
**问题**: Sina估算数据优先级高于AKShare真实数据  
**测试**: `TestDataSourcePriority::test_market_capital_flow_source_priority`

## CI集成

GitHub Actions会在以下情况自动运行测试：
- Push到 main/develop 分支
- 提交 Pull Request
- 修改 data-service/ 下的文件

查看CI状态：`.github/workflows/data-accuracy.yml`

## 详细文档

完整测试指南请查看：`docs/testing/data-accuracy-testing.md`
