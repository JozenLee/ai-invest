# 数据准确性检查清单

## 日常开发检查

### 修改缓存相关代码时
- [ ] cache_key与文件名一致
- [ ] 运行 `pytest tests/test_data_accuracy.py::TestCacheKeyConsistency -v`
- [ ] 检查缓存文件是否正确创建

### 修改日期处理逻辑时
- [ ] 使用 `get_last_trading_date()` 而非 `datetime.now()`
- [ ] 考虑盘前/盘中/盘后场景
- [ ] 运行 `pytest tests/test_data_accuracy.py::TestTradingDateLogic -v`

### 添加新数据源时
- [ ] 配置数据源优先级（真实数据 > 估算数据）
- [ ] 添加数据质量标识（realtime/estimated/cached）
- [ ] 运行 `pytest tests/test_data_accuracy.py::TestDataSourcePriority -v`

### 添加新API接口时
- [ ] 添加对应的单元测试
- [ ] 添加集成测试用例到 `test_data_accuracy_integration.sh`
- [ ] 验证数据结构完整性

## 提交前检查

### 1. 运行单元测试
```bash
cd data-service
python3 -m pytest tests/test_data_accuracy.py -v
```
**预期**: 10 passed, 2 skipped

### 2. 运行集成测试
```bash
cd data-service
bash tests/test_data_accuracy_integration.sh
```
**预期**: 所有测试通过

### 3. 静态代码检查
```bash
# 检查错误的cache_key
grep -r 'cache_key="index_spot"' data-service/services/

# 检查日期处理
grep -A 5 'get_market_capital_flow' data-service/providers/*_provider.py | grep 'datetime.now'
```
**预期**: 无输出

## 发布前检查

### 数据验证
```bash
# 验证指数数据
curl -s http://localhost:8000/api/market/overview | jq '.data.indices[] | select(.code=="sh000001" or .code=="sz399006") | {code, name, price}'

# 验证资金流向日期
curl -s http://localhost:8000/api/capital-flow/market | jq '{date: .data.date, today: (now | strftime("%Y-%m-%d"))}'

# 验证板块数据
curl -s http://localhost:8000/api/capital-flow/sector | jq '.data[0:3]'
```

### 对比第三方数据
1. 访问东方财富/新浪财经
2. 对比上证指数、创业板指
3. 对比板块资金流向Top3
4. 允许±0.5%误差

## 问题排查清单

### 指数数据不准确
- [ ] 检查 cache_key 是否为 "market_overview"
- [ ] 检查 .cache/market_overview.json 文件内容
- [ ] 清除缓存重新测试
- [ ] 查看服务日志确认数据源

### 资金流向日期错误
- [ ] 检查当前是否盘前时间（< 9:30）
- [ ] 验证使用了 `get_last_trading_date()`
- [ ] 测试 `get_last_trading_date()` 返回值
- [ ] 清除资金流向缓存

### 数据源错误
- [ ] 检查 registry.py 中的数据源优先级
- [ ] 查看日志确认实际使用的数据源
- [ ] 验证各数据源是否可用

## 快速命令参考

```bash
# 进入项目目录
cd /Users/jozen.lee/ai-softwares/ai-invest/data-service

# 运行所有测试
python3 -m pytest tests/test_data_accuracy.py -v && bash tests/test_data_accuracy_integration.sh

# 运行特定测试类
python3 -m pytest tests/test_data_accuracy.py::TestCacheKeyConsistency -v

# 清除所有缓存
rm -f .cache/*.json

# 重启服务
lsof -ti:8000 | xargs kill -9 && python3 main.py &

# 查看服务日志
tail -f /tmp/data-service-*.log

# 测试API
curl -s http://localhost:8000/api/market/overview | jq '.data.indices[0:2]'
curl -s http://localhost:8000/api/capital-flow/market | jq '{date, mainNet: .data.market.totalMainNet}'
```

## 时间节点检查

### 每日盘前（9:00）
- [ ] 验证资金流向显示昨日日期
- [ ] 验证指数显示昨日收盘价

### 每日开盘后（9:30-15:00）
- [ ] 验证指数实时更新
- [ ] 验证资金流向显示今日日期

### 每日收盘后（15:30）
- [ ] 验证缓存已刷新
- [ ] 验证数据为收盘价

### 周末
- [ ] 验证显示上周五数据
- [ ] 验证日期计算正确

## 测试覆盖检查

### 单元测试覆盖
- [x] 缓存key一致性（3个测试）
- [x] 交易日期逻辑（3个测试）
- [x] 数据源优先级（1个测试）
- [x] 数据完整性（3个测试）

### 集成测试覆盖
- [x] 指数数据准确性
- [x] 资金流向日期准确性
- [x] 板块数据完整性
- [x] 前后端数据一致性

### 待增加测试
- [ ] 午休时间（11:30-13:00）数据行为
- [ ] 网络异常时降级逻辑
- [ ] 缓存过期刷新逻辑
- [ ] 并发请求数据一致性

## 联系与反馈

发现问题或有改进建议时：
1. 查看 `docs/testing/data-accuracy-testing.md` 了解详情
2. 运行相关测试验证问题
3. 提交Issue描述问题和复现步骤
4. 更新测试用例防止问题复现

---

**记住**: 测试不是负担，而是质量保障和开发效率的倍增器。
