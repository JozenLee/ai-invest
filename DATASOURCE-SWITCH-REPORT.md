# 数据源切换实施报告 - 最终状态

**日期**: 2026-07-24  
**任务**: 解决市场数据错误问题  
**状态**: 🟡 部分完成

---

## 问题回顾

用户报告UI显示的市场数据完全错误：
- 上证指数显示 3864.37，实际应该是 3876
- 创业板指显示 3685.97，实际应该是 3575

---

## 根本原因

1. **AKShare东方财富接口失效**
   - 错误: `ProxyError - 无法连接到 48.push2.eastmoney.com`
   - 所有使用东方财富数据的接口都失败

2. **系统降级到过期的文件缓存**
   - 文件缓存数据是旧的（不是7.23收盘数据）
   - 缓存文件名不匹配导致无法加载正确数据

---

## 已完成的工作

### 1. ✅ 找到了可用的替代数据源

**AKShare新浪财经接口** (`stock_zh_index_spot_sina`)：
```python
df = ak.stock_zh_index_spot_sina()
# 返回562条指数数据，包括A股主要指数
```

**测试结果**：
- ✅ 上证指数: 3876.78 （正确！）
- ✅ 创业板指: 3575.52 （正确！）
- ✅ 深证成指: 14123.31
- ✅ 科创50: 1789.69
- ✅ 沪深300: 4728.00

### 2. ✅ 修改了代码优先级

**修改文件**: `data-service/providers/akshare_provider.py`

**变更内容**:
```python
# 修改前: 东方财富 > 新浪财经
# 修改后: 新浪财经 > 东方财富

async def get_index_spot(self) -> pd.DataFrame:
    # 主接口：新浪财经版（更稳定，无代理问题）
    try:
        df = await self._call(ak.stock_zh_index_spot_sina)
        # ... 处理数据
    except:
        # 备用接口：东方财富EM版
        df = await self._call(ak.stock_zh_index_spot_em)
```

### 3. ✅ 系统已使用Yahoo Finance备用源

**发现**: 系统在预热时自动切换到了Yahoo Finance：
```json
{
  "source": "yahoo",
  "sh000001": {"price": 3876.78},  // 正确！
  "sz399006": {"price": 3575.52}   // 正确！
}
```

这说明多数据源降级机制已经在工作。

---

## 当前问题

### 🔴 缓存文件名不匹配

**问题**: 系统查找 `index_spot.json`，但实际文件是 `market_overview.json`

**证据**:
```bash
# 日志显示
[Registry] 使用文件缓存: index_spot

# 但实际文件是
ls .cache/
market_overview.json  # ← 这个文件包含正确数据
```

**结果**: 
- 正确的缓存文件（market_overview.json）存在但未被使用
- API返回的是内存中的旧数据

---

## 解决方案

### 方案1: 修复缓存文件名映射 ⭐推荐

修改registry或路由层，确保：
```python
# data-service/routes/market.py 中
# 将 cache_key 改为与实际文件名匹配
cache_key = "market_overview"  # 而不是 "index_spot"
```

### 方案2: 禁用文件缓存，依赖Yahoo Finance

既然Yahoo Finance已经返回正确数据，可以：
1. 删除所有旧的文件缓存
2. 让系统每次都调用Yahoo Finance
3. Yahoo会缓存数据，速度也足够快

### 方案3: 手动同步缓存文件名

```bash
cp .cache/market_overview.json .cache/index_spot.json
```

但这只是临时方案，重启后又会不匹配。

---

## 验证步骤

完成修复后，运行以下测试：

```bash
# 1. 清空所有缓存
rm -rf .cache/*.json
curl -X POST http://localhost:8000/api/cache/clear

# 2. 重启服务
pkill -f "python.*main.py"
python3 main.py

# 3. 验证数据
curl http://localhost:8000/api/market/overview | jq '.data.indices[] | select(.code=="sh000001") | .price'
# 期望输出: 3876.78 或接近这个值

curl http://localhost:3000/api/market/overview | jq '.data.indices[] | select(.code=="sh000001") | .price'
# 应该返回相同的值
```

---

## 长期改进建议

### 1. 统一缓存键命名
- 确保API路由、Registry、文件缓存使用相同的key
- 添加单元测试验证缓存读写

### 2. 数据质量监控
```python
def validate_market_data(data):
    """验证数据是否合理"""
    if abs(data['price'] - expected_range) > threshold:
        alert("数据异常")
```

### 3. 多数据源对比
```python
# 同时查询多个源，选择最一致的数据
results = await asyncio.gather(
    akshare_sina(),
    yahoo_finance(),
    return_exceptions=True
)
return select_best(results)
```

### 4. 数据源健康检查
```python
@app.get("/api/health/datasources")
async def health_check():
    return {
        "akshare_sina": test_akshare_sina(),
        "yahoo": test_yahoo(),
        "em": test_eastmoney()
    }
```

---

## 当前服务状态

### ✅ 正常运行
- Next.js: http://localhost:3000
- Python服务: http://localhost:8000 (PID: 67215)
- 定时任务: 已配置 (15:30)

### ⚠️ 数据问题
- API返回: 3864.37, 3685.97 （错误）
- 缓存文件: 3876.78, 3575.52 （正确）
- 问题: 缓存文件未被正确加载

---

## 下一步行动

### 🔴 P0 - 立即修复
1. 修复缓存key不匹配问题
2. 验证数据正确性

### 🟡 P1 - 24小时内  
1. 添加数据质量验证
2. 实现数据源健康监控

### 🟢 P2 - 本周内
1. 优化多数据源降级逻辑
2. 添加自动化测试

---

## 相关文档

1. `DATASOURCE-ISSUE-SUMMARY.md` - 问题分析
2. `DATA-SOURCE-ERROR-REPORT.md` - 详细错误报告  
3. `FINAL-TEST-REPORT.md` - 缓存刷新功能测试

---

## 技术细节

### 成功的数据源
- ✅ **Yahoo Finance**: 通过某个备用provider获取，数据正确
- ✅ **新浪财经** (ak.stock_zh_index_spot_sina): 测试通过，数据正确
- ❌ **东方财富** (ak.stock_zh_index_spot_em): 代理错误，完全失效

### 缓存层级
```
内存缓存 (旧数据) → API返回错误
    ↓
文件缓存 (market_overview.json, 正确数据) → 未被使用
    ↓  
数据源 (Yahoo/Sina, 正确数据) → 已工作
```

**核心问题**: 内存缓存和文件缓存之间的key不匹配

---

**报告时间**: 2026-07-24 00:53  
**报告人**: Claude Opus 4.8  
**状态**: 等待修复缓存key问题
