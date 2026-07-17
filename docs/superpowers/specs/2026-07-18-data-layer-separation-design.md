# Data Layer Separation Design

## Overview

将数据源→统一接口封装→UI页面调用这几个层级进行分离和封装，稳定基础数据层。

**Scope:** 前后端都重构，先后端再前端

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    UI Layer (Next.js)                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │   Dashboard  │  │   Events    │  │   Analysis  │     │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘     │
│         └────────────────┼────────────────┘             │
│                          ▼                              │
│              ┌───────────────────────┐                  │
│              │   Unified Data Client │                  │
│              │   (data-client.ts)    │                  │
│              └───────────┬───────────┘                  │
└──────────────────────────┼──────────────────────────────┘
                           │ HTTP
┌──────────────────────────┼──────────────────────────────┐
│                    API Layer (FastAPI)                   │
│              ┌───────────▼───────────┐                  │
│              │      Routers          │                  │
│              │  (薄层，只做参数校验)   │                  │
│              └───────────┬───────────┘                  │
│                          ▼                              │
│              ┌───────────────────────┐                  │
│              │    Unified Service    │                  │
│              │   (data_service.py)   │                  │
│              └───────────┬───────────┘                  │
└──────────────────────────┼──────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────┐
│                  Data Source Layer                       │
│              ┌───────────▼───────────┐                  │
│              │   Provider Registry   │                  │
│              │   (registry.py)       │                  │
│              └───────────┬───────────┘                  │
│                          │                              │
│    ┌─────────────┬───────┴───────┐                     │
│    ▼             ▼               ▼                     │
│ ┌──────┐   ┌──────┐       ┌──────┐                    │
│ │AKShare│   │Tushare│      │Xueqiu│                    │
│ └──────┘   └──────┘       └──────┘                    │
│                                                        │
│  Note: Yahoo Finance 仅作为前端降级方案，不纳入Python   │
│  数据服务的Provider体系                                 │
└─────────────────────────────────────────────────────────┘
```

---

## Layer 1: Python Data Service

### 1.1 Data Source Layer (providers/)

**保留现有结构：**

```
providers/
├── __init__.py
├── base.py              # DataProvider 抽象基类
├── registry.py          # ProviderRegistry + CacheManager
├── akshare_provider.py  # AKShare 实现
├── tushare_provider.py  # Tushare 实现
└── xueqiu_provider.py   # Xueqiu 实现
```

**删除遗留文件：**
- `services/akshare_client.py`
- `services/multi_source_client.py`
- `services/xueqiu_client.py`

**关于 Yahoo Finance：**
- Yahoo Finance 仅作为前端降级方案（当 Python 数据服务不可用时）
- 不纳入 Python Provider 体系，保留在 `src/lib/data-clients/yahoo.ts`

### 1.2 Configurable Priority

```python
from dataclasses import dataclass

@dataclass
class CategoryConfig:
    """数据类别配置"""
    sources: List[str]           # 数据源优先级列表
    cache_ttl: int = 600         # 缓存TTL（秒）
    fallback_to_file: bool = True  # 是否降级到文件缓存

DEFAULT_CATEGORY_CONFIG: Dict[str, CategoryConfig] = {
    "index_spot": CategoryConfig(
        sources=["akshare", "tushare", "xueqiu"],
        cache_ttl=30,
    ),
    "index_daily": CategoryConfig(
        sources=["akshare", "tushare"],
        cache_ttl=300,
    ),
    "northbound_flow": CategoryConfig(
        sources=["akshare", "tushare"],
        cache_ttl=600,
    ),
    "news": CategoryConfig(
        sources=["akshare"],
        cache_ttl=300,
    ),
    # ... 其他类别
}

class ProviderRegistry:
    def __init__(self, custom_config: Optional[Dict[str, CategoryConfig]] = None):
        self._providers: Dict[str, DataProvider] = {}
        self.cache = CacheManager()
        self._config = {**DEFAULT_CATEGORY_CONFIG}
        if custom_config:
            self._config.update(custom_config)
```

### 1.3 Unified Service Layer (services/)

```python
class DataService:
    """统一数据服务入口，路由层的唯一数据依赖"""
    
    def __init__(self, reg: Optional[ProviderRegistry] = None):
        self.registry = reg or registry
    
    async def get_index_spot(self) -> pd.DataFrame:
        """获取指数实时行情"""
        return await self.registry.fetch(
            category="index_spot",
            method="get_index_spot",
            cache_key="index_spot",
            cache_ttl=30,
        )
    
    # ... 其他方法
```

### 1.4 Router Layer (routers/)

```python
@router.get("/overview")
async def get_market_overview():
    """获取市场概览（薄层，只做参数校验和响应格式化）"""
    try:
        df = await data_service.get_index_spot()
        if df.empty:
            return {"success": False, "error": "无法获取指数数据"}
        indices = format_indices(df)
        return {"success": True, "data": {"indices": indices}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

---

## Layer 2: Frontend Unified Data Client

### 2.1 DataClient Implementation

```typescript
// src/lib/data-client.ts

interface DataClientConfig {
  baseUrl: string
  timeout: number
  retryCount: number
  cacheTTL: number
}

class DataClient {
  private config: DataClientConfig
  private cache: Map<string, { data: any; expiry: number }>

  constructor(config?: Partial<DataClientConfig>) {
    this.config = {
      baseUrl: process.env.DATA_SERVICE_URL || 'http://localhost:8000',
      timeout: 15000,
      retryCount: 2,
      cacheTTL: 30,
      ...config,
    }
    this.cache = new Map()
  }

  async get<T>(endpoint: string, params?: Record<string, string>): Promise<ApiResponse<T>> {
    const url = this.buildUrl(endpoint, params)
    const cacheKey = url.toString()

    // 检查缓存
    const cached = this.getFromCache(cacheKey)
    if (cached) return cached

    // 带重试的请求
    const response = await this.fetchWithRetry(url)

    // 写入缓存
    if (response.success) {
      this.setCache(cacheKey, response, this.config.cacheTTL)
    }

    return response
  }
}

export const dataClient = new DataClient()
```

### 2.2 Service Layer Integration

```typescript
// src/lib/services/market.service.ts
import { dataClient } from '@/lib/data-client'

export const marketService = {
  async getOverview() {
    return dataClient.get('/api/market/overview')
  },
  async getIndexData(code: string, days: number = 30) {
    return dataClient.get(`/api/market/index/${code}`, { days: String(days) })
  },
}
```

---

## Data Flow

```
UI Component
    │
    ▼
marketService.getOverview()
    │
    ▼
dataClient.get('/api/market/overview')
    │
    ├─ 检查前端缓存 → 命中则返回
    │
    ▼
fetch(DATA_SERVICE_URL + endpoint)
    │
    ▼
FastAPI Router
    │
    ▼
data_service.get_index_spot()
    │
    ▼
registry.fetch(category="index_spot", ...)
    │
    ├─ 检查内存缓存 → 命中则返回
    ├─ 尝试 AKShare → 成功则写缓存并返回
    ├─ 尝试 Tushare → 成功则写缓存并返回
    ├─ 尝试 Xueqiu → 成功则写缓存并返回
    └─ 检查文件缓存 → 命中则返回
    │
    ▼
返回数据（或抛出异常）
```

---

## Error Handling

**Python Service:**
- Provider 级别: 捕获异常，尝试下一个 provider
- Registry 级别: 所有 provider 失败后，尝试文件缓存
- Router 级别: 返回 `{success: false, error: message}`

**Frontend:**
- DataClient: 带重试的请求，失败返回 `{success: false, error: message}`

---

## Cache Strategy

| Layer | Type | TTL | Purpose |
|-------|------|-----|---------|
| Python Registry | Memory | 30-600s | 热数据快速响应 |
| Python Registry | File | 持久化 | 降级备选 |
| Frontend DataClient | Memory | 30s | 减少重复请求 |

---

## Testing Strategy

### Test Coverage Matrix

每个数据接口必须覆盖以下测试场景：

| Test Type | Description |
|-----------|-------------|
| **Success** | 正常数据返回 |
| **Fallback** | 数据源降级 |
| **All Failed** | 所有源失败 |
| **Empty Data** | 空数据处理 |
| **Cache Hit** | 缓存命中 |
| **Cache Expire** | 缓存过期 |

### Test File Structure

```
tests/
├── test_interfaces/
│   ├── test_index_spot.py
│   ├── test_index_daily.py
│   ├── test_index_realtime.py
│   ├── test_stock_spot.py
│   ├── test_stock_daily.py
│   ├── test_etf_realtime.py
│   ├── test_etf_daily.py
│   ├── test_etf_nav.py
│   ├── test_market_capital_flow.py
│   ├── test_sector_capital_flow.py
│   ├── test_northbound_flow.py
│   ├── test_northbound_history.py
│   ├── test_stock_capital_flow.py
│   ├── test_margin_data.py
│   ├── test_market_fund_flow_rank.py
│   ├── test_market_sentiment.py
│   └── test_news.py
├── test_registry.py
└── test_cache.py
```

---

## Implementation Plan

### Phase 1: Python Backend Refactoring

| Step | Task | Description |
|------|------|-------------|
| 1.1 | 删除遗留客户端 | 移除 akshare_client.py, multi_source_client.py, xueqiu_client.py |
| 1.2 | 增强 Registry 配置 | 添加 CategoryConfig 支持 |
| 1.3 | 清理 DataService | 确保所有方法通过 registry 调用 |
| 1.4 | 精简 Routers | 路由层只做参数校验和响应格式化 |
| 1.5 | 添加单元测试 | 每个数据接口的完整测试 |

### Phase 2: Frontend Refactoring

| Step | Task | Description |
|------|------|-------------|
| 2.1 | 创建 DataClient | 实现带缓存和重试的统一客户端 |
| 2.2 | 重构 Service 层 | 所有服务使用 dataClient |
| 2.3 | 清理 API Routes | 移除重复的 fetch 和降级逻辑 |
| 2.4 | 添加单元测试 | DataClient 的缓存、重试、错误处理测试 |

### Phase 3: Integration & Verification

| Step | Task | Description |
|------|------|-------------|
| 3.1 | 运行验收测试 | `bash scripts/acceptance-test.sh` |
| 3.2 | 手动测试 | 验证各页面数据加载正常 |
| 3.3 | 性能检查 | 确认缓存生效，响应时间合理 |

---

## Success Criteria

1. 所有数据接口通过单元测试
2. 验收测试全部通过
3. 前端页面数据加载正常
4. 代码结构清晰，职责分明
