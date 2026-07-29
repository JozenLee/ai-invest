# 市场数据实时更新问题排查与修复报告

**日期**: 2026-07-28  
**问题**: 交易时段市场数据显示昨天收盘数据，未实时更新

---

## 问题现象

1. **前端显示**: 上证指数显示 3858.24（昨天收盘价）
2. **实际行情**: 上证指数当前 3831.27（下跌0.7%）
3. **时间**: 交易时段 10:08-10:14

---

## 问题排查过程

### 1. 检查数据链路

```
前端页面 → Next.js API (/api/market/overview) → Python数据服务 (/api/market/overview) → AKShare → 东方财富/新浪财经
```

### 2. 逐层排查

#### 第一层：Python数据服务
- **状态**: ✅ 运行正常（端口8000）
- **市场状态识别**: ✅ 正确识别为"交易中"
- **数据时间戳**: ✅ 实时更新

#### 第二层：数据源调用
- **AKShare主接口**: ❌ 代理连接失败
  ```
  HTTPSConnectionPool(host='48.push2.eastmoney.com', port=443): 
  Max retries exceeded... ProxyError
  ```
- **AKShare降级接口**: ✅ 新浪财经接口成功
  - 成功获取562条指数数据
  - 数据实时且准确

#### 第三层：数据缓存逻辑
- **问题根源**: Registry降级逻辑错误
  - 在检查内存缓存失败后，**立即读取文件缓存**（旧数据）
  - 没有先尝试实时数据源
  - 导致即使实时API可用，也返回昨天的缓存数据

### 3. 定位核心问题

**文件**: `data-service/providers/registry.py:269-275`

**错误逻辑**:
```python
# 先检查内存缓存
if cache_key:
    cached = self.cache.get_memory(cache_key)
    if cached is not None:
        return cached
    
    # ❌ 错误：内存缓存失败后立即使用文件缓存
    if config.fallback_to_file:
        cached = self.cache.get_file(cache_key)
        if cached is not None:
            print(f"[Registry] 使用文件缓存: {cache_key}")
            return cached  # 直接返回昨天的数据
```

**正确逻辑**:
```python
# 先检查内存缓存
if cache_key:
    cached = self.cache.get_memory(cache_key)
    if cached is not None:
        return cached

# ✅ 正确：先尝试所有实时数据源
for source_name in sources:
    # 尝试获取实时数据...
    
# ✅ 所有数据源失败后，才降级到文件缓存
if cache_key and config.fallback_to_file:
    cached = self.cache.get_file(cache_key)
    if cached is not None:
        print(f"[Registry] 所有数据源失败，使用文件缓存: {cache_key}")
        return cached
```

---

## 修复方案

### 1. 修复Registry降级逻辑
**文件**: `data-service/providers/registry.py:263-276`

**修改内容**:
- 删除在尝试实时数据源**之前**读取文件缓存的代码
- 保留在所有数据源失败**之后**降级到文件缓存的逻辑

### 2. 修复导入错误
**文件**: `data-service/providers/loader.py:8,19`

**问题**: `XiaohongshuProvider` 类名不匹配  
**修复**: 改为 `XiaohongshuAPIProvider`

### 3. 优化缓存策略

#### 后端（Next.js API）
**文件**: `src/app/api/market/overview/route.ts:7-9`

**优化**:
```typescript
// 动态缓存TTL：交易时段5秒，非交易时段30秒
const CACHE_TTL_TRADING = 5    // 交易中缓存5秒
const CACHE_TTL_CLOSED = 30    // 非交易时段缓存30秒
```

#### 前端（自动刷新）
**文件**: `src/contexts/MarketContext.tsx:184-192`

**优化**:
```typescript
// 交易时段每10秒刷新（后端缓存5秒），非交易时段每1分钟刷新
const refreshInterval = marketMeta?.isOpen ? 10 * 1000 : 60 * 1000
```

---

## 修复验证

### 1. 服务重启
```bash
# 停止旧服务
lsof -ti:8000 | xargs kill -9

# 启动新服务
cd data-service && python3 main.py
```

### 2. 数据验证

**修复前**:
```json
{
  "code": "sh000001",
  "name": "上证指数",
  "price": 3858.24,  // ❌ 昨天收盘价
  "change": 44.05,
  "changePct": 1.15
}
```

**修复后**:
```json
{
  "code": "sh000001",
  "name": "上证指数",
  "price": 3831.27,   // ✅ 实时价格
  "change": -26.97,
  "changePct": -0.7
}
```

### 3. 缓存行为验证

**交易时段**:
- 后端缓存: 5秒 ✅
- 前端刷新: 10秒 ✅
- 数据时间戳: 每次请求更新 ✅

**非交易时段**:
- 后端缓存: 30秒 ✅
- 前端刷新: 60秒 ✅

---

## 数据源降级链路

### 修复后的正确流程

```
1. 检查内存缓存 → 命中则返回
   ↓ 未命中
   
2. 尝试 AKShare 东方财富接口
   ↓ 失败（代理问题）
   
3. 尝试 AKShare 新浪财经接口
   ✅ 成功获取实时数据
   ↓ 写入缓存
   
4. 返回实时数据

如果所有数据源都失败：
   ↓
5. 读取文件缓存（昨天数据）
   ↓
6. 返回缓存数据 + 标记为 stale
```

---

## 总结

### 问题根因
1. **主要原因**: Registry降级逻辑错误，过早使用文件缓存
2. **次要原因**: 导入错误导致服务无法启动，无法应用修复

### 影响范围
- **受影响时段**: 服务启动后至手动刷新前
- **受影响数据**: 所有通过Registry获取的缓存数据
- **用户体验**: 交易时段看到过时数据，可能错过行情变化

### 修复效果
- ✅ 实时数据正常更新
- ✅ 缓存降级逻辑正确
- ✅ 交易时段数据延迟 < 10秒
- ✅ 服务稳定运行

### 预防措施
1. **代码审查**: Registry缓存逻辑需要仔细审查降级顺序
2. **集成测试**: 添加数据源降级链路测试
3. **监控告警**: 添加数据时效性监控
4. **文档更新**: 记录降级策略和缓存行为

---

## 相关文件

- `data-service/providers/registry.py` - Registry降级逻辑
- `data-service/providers/loader.py` - Provider加载器
- `src/app/api/market/overview/route.ts` - Next.js市场数据API
- `src/contexts/MarketContext.tsx` - 前端数据管理
- `scripts/test-realtime-data.sh` - 实时数据测试脚本

---

**修复人员**: Claude (Kiro AI Assistant)  
**审核状态**: ✅ 已验证  
**部署状态**: ✅ 已上线
