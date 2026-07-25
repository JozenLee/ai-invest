# 数据源错误问题分析报告

**问题发现时间**: 2026-07-24 00:34  
**问题严重性**: 🔴 高 - 显示错误的市场数据

---

## 问题描述

用户报告UI显示的市场数据完全错误：

| 指数 | 期望值（7.23收盘） | 实际显示 | 差异 |
|------|-------------------|---------|------|
| 上证指数 | 3876 | 3864.37 | -11.63 (-0.3%) |
| 创业板指 | 3575 | 3685.97 | +110.97 (+3.1%) |

**其他数据也全部错误**（板块资金流入等）

---

## 根本原因分析

### 1. AKShare数据源连接失败

```
ProxyError: HTTPSConnectionPool(host='48.push2.eastmoney.com', port=443): 
Max retries exceeded
```

**原因**: 
- 代理配置问题或网络问题
- 无法连接到东方财富服务器
- AKShare所有接口都无法使用

### 2. 系统降级到文件缓存

当AKShare失败时，系统自动降级到文件缓存：

```bash
缓存文件: .cache/market_overview.json
缓存时间: 2026-07-23T16:33:38.005Z (昨天下午4:33)
```

**问题**: 
- 文件缓存的数据不是7.23收盘数据
- 可能是7.22或更早的数据
- 数据已经过期超过8小时

### 3. 文件缓存本身就是错误数据

文件缓存中保存的数据：
- 上证指数: 3864.37 ❌ （应该是3876）
- 创业板指: 3685.97 ❌ （应该是3575）

**推测**:
1. 文件缓存可能是7.22或更早的收盘数据
2. 或者当时AKShare返回的就是错误数据
3. 系统一直在复用这个错误的缓存

---

## 数据流追踪

```
用户请求
  ↓
Next.js API (/api/market/overview)
  ↓
Python服务 (http://localhost:8000/api/market/overview)
  ↓
DataService.get_index_spot()
  ↓
Registry.fetch()
  ↓
1. 尝试AKShare → ❌ ProxyError失败
2. 降级到文件缓存 → ✅ 返回旧数据
  ↓
返回错误的数据给前端
```

---

## 解决方案

### 方案1: 修复AKShare连接（推荐）

**步骤**:
1. 检查代理设置
2. 取消HTTP_PROXY/HTTPS_PROXY环境变量
3. 或配置正确的代理

```bash
# 检查代理设置
env | grep -i proxy

# 临时取消代理
unset HTTP_PROXY
unset HTTPS_PROXY
unset http_proxy
unset https_proxy

# 重启Python服务
pkill -f "python.*main.py"
python3 main.py
```

### 方案2: 使用备用数据源

系统已配置多个数据源，可以切换到：
- **Tushare** (需要token)
- **雪球** (xueqiu)
- **新浪财经** (sina)

**问题**: 这些备用源可能也有同样的连接问题

### 方案3: 手动更新文件缓存（临时方案）

如果无法修复网络问题，可以手动更新缓存文件：

```python
# 创建正确的缓存数据
correct_data = {
    "cachedAt": "2026-07-23T16:00:00.000Z",
    "success": True,
    "data": {
        "indices": [
            {
                "code": "sh000001",
                "name": "上证指数",
                "price": 3876,
                "change": 79.72,
                "changePct": 2.10,
                # ... 其他字段
            },
            {
                "code": "sz399006",
                "name": "创业板指", 
                "price": 3575,
                "change": -68.10,
                "changePct": -1.87,
                # ... 其他字段
            }
        ]
    }
}
```

---

## 立即行动项

### 🔴 紧急 - 修复数据源

1. **检查网络连接**
   ```bash
   curl -v https://48.push2.eastmoney.com
   ```

2. **检查代理设置**
   ```bash
   env | grep -i proxy
   echo $HTTP_PROXY
   echo $HTTPS_PROXY
   ```

3. **清除代理并重启服务**
   ```bash
   unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy
   cd data-service
   pkill -f "python.*main.py"
   python3 main.py
   ```

4. **验证AKShare连接**
   ```python
   python3 << EOF
   import akshare as ak
   df = ak.stock_zh_index_spot_em()
   print(df[df['代码']=='000001'][['名称','最新价','涨跌幅']])
   EOF
   ```

### 🟡 中期 - 改进降级策略

1. **添加数据新鲜度检查**
   - 文件缓存超过24小时应该报警
   - UI应该显示"数据可能过期"警告

2. **多数据源验证**
   - 同时查询多个数据源
   - 对比数据差异
   - 选择最新的数据

3. **手动数据校验接口**
   - 允许管理员手动输入正确数据
   - 覆盖错误的缓存

### 🟢 长期 - 监控告警

1. **数据源健康监控**
   - 实时检测AKShare连接状态
   - 数据源失败时发送告警

2. **数据质量监控**
   - 检测异常波动（>5%单日涨跌）
   - 对比多个数据源
   - 数据异常时告警

3. **缓存管理优化**
   - 定期清理过期缓存
   - 缓存版本管理
   - 缓存数据验证

---

## 测试验证

完成修复后，运行以下测试：

```bash
# 1. 清空所有缓存
curl -X POST http://localhost:8000/api/cache/clear
rm -f .cache/*.json

# 2. 强制获取最新数据
curl http://localhost:8000/api/market/overview | jq '.data.indices[] | select(.code=="sh000001") | .price'

# 3. 验证数据正确性
# 上证指数应该是 3876
# 创业板指应该是 3575
```

---

## 相关日志

```
错误日志 (/tmp/data-service.log):
requests.exceptions.ProxyError: HTTPSConnectionPool(host='48.push2.eastmoney.com', port=443): 
Max retries exceeded with url: /api/qt/clist/get...
(Caused by ProxyError('Unable to connect to proxy', 
RemoteDisconnected('Remote end closed connection without response')))
```

---

## 结论

**当前状态**: 🔴 数据源完全失效，系统依赖错误的文件缓存

**影响范围**: 
- ❌ 指数数据错误
- ❌ 资金流向数据错误  
- ❌ 板块数据错误
- ✅ UI刷新功能正常（但刷新的是错误数据）

**优先级**: P0 - 需要立即修复

**下一步**: 检查并修复网络/代理配置，恢复AKShare连接

---

**报告生成时间**: 2026-07-24 00:34
