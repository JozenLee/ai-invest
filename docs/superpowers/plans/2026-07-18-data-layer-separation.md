# Data Layer Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将数据源→统一接口封装→UI页面调用进行分层分离，稳定基础数据层

**Architecture:** 三层架构：Python数据服务（Provider→Registry→DataService→Router）+ 前端统一数据客户端（DataClient）+ 业务服务层

**Tech Stack:** Python 3.9+, FastAPI, AKShare, Tushare, Pandas, Next.js, TypeScript

## Global Constraints

- Python 3.9+ 兼容
- 所有数据接口必须有单元测试覆盖
- 删除遗留客户端代码，不保留废弃标记
- 前端数据获取统一通过 DataClient
- Yahoo Finance 仅作为前端降级方案

---

## File Structure

### Python Backend (data-service/)

| File | Action | Responsibility |
|------|--------|----------------|
| `services/akshare_client.py` | Delete | 遗留客户端，已被 Provider 替代 |
| `services/multi_source_client.py` | Delete | 遗留客户端，已被 Provider 替代 |
| `services/xueqiu_client.py` | Delete | 遗留客户端，已被 Provider 替代 |
| `providers/registry.py` | Modify | 添加 CategoryConfig 支持可配置优先级 |
| `services/data_service.py` | Modify | 确保所有方法通过 registry 调用 |
| `routers/market.py` | Modify | 精简为薄层，只做参数校验和响应格式化 |
| `routers/capital_flow.py` | Modify | 同上 |
| `routers/etf.py` | Modify | 同上 |
| `routers/macro_flow.py` | Modify | 同上 |
| `routers/news.py` | Modify | 同上 |
| `tests/conftest.py` | Create | 测试配置和 fixtures |
| `tests/test_interfaces/__init__.py` | Create | 测试包 |
| `tests/test_interfaces/test_index_spot.py` | Create | 指数实时行情接口测试 |
| `tests/test_interfaces/test_index_daily.py` | Create | 指数日K数据接口测试 |
| `tests/test_interfaces/test_northbound_flow.py` | Create | 北向资金接口测试 |
| `tests/test_interfaces/test_market_capital_flow.py` | Create | 大盘资金流向接口测试 |
| `tests/test_interfaces/test_sector_capital_flow.py` | Create | 板块资金流向接口测试 |
| `tests/test_interfaces/test_news.py` | Create | 新闻数据接口测试 |
| `tests/test_registry.py` | Create | Registry 降级调度测试 |
| `tests/test_cache.py` | Create | 缓存管理器测试 |

### Frontend (src/)

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/data-client.ts` | Create | 统一数据客户端 |
| `src/lib/services/market.service.ts` | Create | 市场数据服务 |
| `src/lib/services/capital-flow.service.ts` | Create | 资金流向服务 |
| `src/lib/services/etf.service.ts` | Create | ETF 数据服务 |
| `src/lib/services/news.service.ts` | Create | 新闻数据服务 |
| `src/lib/__tests__/data-client.test.ts` | Create | DataClient 单元测试 |

---

## Phase 1: Python Backend Refactoring

### Task 1: 删除遗留客户端

**Files:**
- Delete: `data-service/services/akshare_client.py`
- Delete: `data-service/services/multi_source_client.py`
- Delete: `data-service/services/xueqiu_client.py`

**Interfaces:**
- Produces: 清理后的 services/ 目录，只保留 data_service.py

- [ ] **Step 1: 检查遗留客户端是否被引用**

```bash
cd /Users/jozen.lee/ai-softwares/ai-invest/data-service
grep -r "akshare_client\|multi_source_client\|xueqiu_client" . --include="*.py" || echo "No references found"
```

- [ ] **Step 2: 删除遗留客户端文件**

```bash
rm services/akshare_client.py
rm services/multi_source_client.py
rm services/xueqiu_client.py
```

- [ ] **Step 3: 验证服务仍可启动**

```bash
python -c "from services.data_service import data_service; print('Import OK')"
```

- [ ] **Step 4: Commit**

```bash
git add -A data-service/services/
git commit -m "refactor: remove legacy client files (akshare_client, multi_source_client, xueqiu_client)"
```

---

### Task 2: 增强 Registry 配置

**Files:**
- Modify: `data-service/providers/registry.py`

**Interfaces:**
- Consumes: 现有的 `CATEGORY_SOURCES` 配置
- Produces: `CategoryConfig` dataclass, `DEFAULT_CATEGORY_CONFIG` 字典

- [ ] **Step 1: 添加 CategoryConfig dataclass**

在 `registry.py` 文件顶部添加：

```python
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

@dataclass
class CategoryConfig:
    """数据类别配置"""
    sources: List[str]           # 数据源优先级列表
    cache_ttl: int = 600         # 缓存TTL（秒）
    fallback_to_file: bool = True  # 是否降级到文件缓存
```

- [ ] **Step 2: 将 CATEGORY_SOURCES 转换为 CategoryConfig 格式**

```python
DEFAULT_CATEGORY_CONFIG: Dict[str, CategoryConfig] = {
    # 指数
    "index_spot": CategoryConfig(
        sources=["akshare", "tushare", "xueqiu"],
        cache_ttl=30,
    ),
    "index_daily": CategoryConfig(
        sources=["akshare", "tushare"],
        cache_ttl=300,
    ),
    "index_realtime": CategoryConfig(
        sources=["akshare", "tushare", "xueqiu"],
        cache_ttl=30,
    ),
    # 个股
    "stock_spot": CategoryConfig(
        sources=["akshare", "tushare", "xueqiu"],
        cache_ttl=30,
    ),
    "stock_daily": CategoryConfig(
        sources=["akshare", "tushare"],
        cache_ttl=300,
    ),
    # ETF
    "etf_realtime": CategoryConfig(
        sources=["akshare", "xueqiu", "tushare"],
        cache_ttl=30,
    ),
    "etf_daily": CategoryConfig(
        sources=["akshare", "tushare"],
        cache_ttl=300,
    ),
    "etf_nav": CategoryConfig(
        sources=["akshare", "tushare"],
        cache_ttl=300,
    ),
    # 资金流向
    "market_capital_flow": CategoryConfig(
        sources=["akshare", "tushare"],
        cache_ttl=600,
    ),
    "sector_capital_flow": CategoryConfig(
        sources=["akshare", "tushare"],
        cache_ttl=600,
    ),
    "northbound_flow": CategoryConfig(
        sources=["akshare", "tushare"],
        cache_ttl=600,
    ),
    "northbound_history": CategoryConfig(
        sources=["akshare", "tushare"],
        cache_ttl=600,
    ),
    "stock_capital_flow": CategoryConfig(
        sources=["akshare", "tushare"],
        cache_ttl=600,
    ),
    "margin_data": CategoryConfig(
        sources=["akshare", "tushare"],
        cache_ttl=600,
    ),
    "market_fund_flow_rank": CategoryConfig(
        sources=["akshare", "tushare"],
        cache_ttl=600,
    ),
    "market_sentiment": CategoryConfig(
        sources=["akshare", "tushare"],
        cache_ttl=60,
    ),
    # 新闻
    "news": CategoryConfig(
        sources=["akshare"],
        cache_ttl=300,
    ),
}
```

- [ ] **Step 3: 修改 ProviderRegistry 使用 CategoryConfig**

```python
class ProviderRegistry:
    """数据源注册表

    管理所有 provider 实例，按 CATEGORY_SOURCES 配置的优先级自动降级。
    同时提供带缓存的 fetch 方法，路由层通过 DataService 调用。
    """

    def __init__(self, custom_config: Optional[Dict[str, CategoryConfig]] = None):
        self._providers: Dict[str, DataProvider] = {}
        self.cache = CacheManager()
        self._config = {**DEFAULT_CATEGORY_CONFIG}
        if custom_config:
            self._config.update(custom_config)

    async def fetch(self, category: str, method: str, cache_key: Optional[str] = None,
                    cache_ttl: Optional[int] = None, **kwargs) -> Any:
        """按优先级尝试各数据源，自动降级

        Args:
            category: 数据类别（对应 _config 的 key）
            method: provider 上的方法名
            cache_key: 缓存 key（None 则不使用缓存）
            cache_ttl: 内存缓存 TTL（秒），None 则使用 CategoryConfig 默认值
            **kwargs: 传递给 provider 方法的参数

        Returns:
            第一个成功返回的数据

        Raises:
            Exception: 所有数据源都失败时，抛出最后一个异常
        """
        config = self._config.get(category)
        if not config:
            raise ValueError(f"未知的数据类别: {category}")

        sources = config.sources
        ttl = cache_ttl or config.cache_ttl

        # 先检查缓存
        if cache_key:
            cached = self.cache.get_memory(cache_key)
            if cached is not None:
                return cached

        last_error = None

        for source_name in sources:
            provider = self._providers.get(source_name)
            if not provider:
                continue

            try:
                result = await getattr(provider, method)(**kwargs)

                # 判断结果是否有效
                if self._is_valid_result(result):
                    # 写入缓存
                    if cache_key:
                        serializable = self._to_serializable(result)
                        if serializable is not None:
                            self.cache.set(cache_key, serializable, memory_ttl=ttl)
                    return result
                else:
                    print(f"[Registry] {source_name}.{method} 返回空数据，尝试下一个源")
            except NotImplementedError:
                # 该 provider 不支持此方法，跳过
                continue
            except Exception as e:
                print(f"[Registry] {source_name}.{method} 失败: {e}")
                last_error = e
                continue

        # 所有源都失败，尝试文件缓存降级
        if cache_key and config.fallback_to_file:
            cached = self.cache.get_file(cache_key)
            if cached is not None:
                print(f"[Registry] 所有数据源失败，使用文件缓存: {cache_key}")
                self.cache.set_memory(cache_key, cached, ttl_seconds=ttl)
                return cached

        raise last_error or Exception(f"无可用数据源: {category}")
```

- [ ] **Step 4: 删除旧的 CATEGORY_SOURCES**

```python
# 删除以下内容
CATEGORY_SOURCES: Dict[str, List[str]] = {
    # ...
}
```

- [ ] **Step 5: Commit**

```bash
git add data-service/providers/registry.py
git commit -m "feat: add CategoryConfig for configurable data source priority"
```

---

### Task 3: 清理 DataService

**Files:**
- Modify: `data-service/services/data_service.py`

**Interfaces:**
- Consumes: `ProviderRegistry` with `CategoryConfig`
- Produces: 清晰的 `DataService` 类，所有方法通过 registry 调用

- [ ] **Step 1: 检查 data_service.py 是否有遗留引用**

```bash
cd /Users/jozen.lee/ai-softwares/ai-invest/data-service
grep -n "akshare_client\|multi_source_client\|xueqiu_client" services/data_service.py || echo "No legacy references"
```

- [ ] **Step 2: 确保所有方法通过 registry 调用**

当前 `data_service.py` 已经通过 registry 调用，只需确认没有直接导入遗留客户端。

- [ ] **Step 3: 添加注释说明分层架构**

在文件顶部添加：

```python
# 统一数据服务入口
# 路由层的唯一数据依赖，内部通过 ProviderRegistry 调度数据源
# 支持按类别配置数据源优先级，自动降级
```

- [ ] **Step 4: Commit**

```bash
git add data-service/services/data_service.py
git commit -m "refactor: clean up DataService, ensure all calls go through registry"
```

---

### Task 4: 精简 Routers

**Files:**
- Modify: `data-service/routers/market.py`
- Modify: `data-service/routers/capital_flow.py`
- Modify: `data-service/routers/etf.py`
- Modify: `data-service/routers/macro_flow.py`
- Modify: `data-service/routers/news.py`

**Interfaces:**
- Consumes: `DataService` 单例
- Produces: 薄路由层，只做参数校验和响应格式化

- [ ] **Step 1: 检查 routers/market.py 是否有业务逻辑**

```bash
cd /Users/jozen.lee/ai-softwares/ai-invest/data-service
grep -n "import\|from" routers/market.py
```

- [ ] **Step 2: 确保 market.py 只通过 data_service 获取数据**

当前 `market.py` 已经通过 `data_service` 获取数据，只需确认没有直接调用遗留客户端。

- [ ] **Step 3: 为其他 routers 添加注释说明薄层职责**

在每个 router 文件顶部添加：

```python
# [模块名]路由
# 提供 [功能列表] 接口
# 通过统一数据服务入口获取数据，支持多源自动降级
```

- [ ] **Step 4: Commit**

```bash
git add data-service/routers/
git commit -m "refactor: ensure routers are thin layer, only validation and formatting"
```

---

### Task 5: 创建测试基础设施

**Files:**
- Create: `data-service/tests/__init__.py`
- Create: `data-service/tests/conftest.py`
- Create: `data-service/tests/test_interfaces/__init__.py`

**Interfaces:**
- Produces: 测试配置和公共 fixtures

- [ ] **Step 1: 创建 tests 目录结构**

```bash
cd /Users/jozen.lee/ai-softwares/ai-invest/data-service
mkdir -p tests/test_interfaces
touch tests/__init__.py
touch tests/test_interfaces/__init__.py
```

- [ ] **Step 2: 创建 conftest.py**

```python
# tests/conftest.py
import pytest
import pandas as pd
from unittest.mock import AsyncMock, MagicMock
from providers.registry import ProviderRegistry, CategoryConfig
from services.data_service import DataService


@pytest.fixture
def mock_akshare():
    """Mock AKShare provider"""
    return AsyncMock()


@pytest.fixture
def mock_tushare():
    """Mock Tushare provider"""
    return AsyncMock()


@pytest.fixture
def mock_xueqiu():
    """Mock Xueqiu provider"""
    return AsyncMock()


@pytest.fixture
def registry(mock_akshare, mock_tushare, mock_xueqiu):
    """创建配置好的 ProviderRegistry"""
    reg = ProviderRegistry()
    reg._providers = {
        "akshare": mock_akshare,
        "tushare": mock_tushare,
        "xueqiu": mock_xueqiu,
    }
    return reg


@pytest.fixture
def data_service(registry):
    """创建配置好的 DataService"""
    return DataService(reg=registry)


@pytest.fixture
def sample_index_df():
    """示例指数数据 DataFrame"""
    return pd.DataFrame({
        "代码": ["000001", "399001", "399006", "000688", "000300"],
        "名称": ["上证指数", "深证成指", "创业板指", "科创50", "沪深300"],
        "最新价": [3000.0, 10000.0, 2000.0, 1000.0, 4000.0],
        "涨跌额": [10.0, 50.0, 20.0, 5.0, 15.0],
        "涨跌幅": [0.33, 0.50, 1.00, 0.50, 0.38],
        "成交量": [1000000, 2000000, 500000, 300000, 800000],
        "成交额": [3000000000, 20000000000, 1000000000, 300000000, 3200000000],
    })


@pytest.fixture
def sample_northbound_dict():
    """示例北向资金数据"""
    return {
        "date": "2026-07-18",
        "value": 50.5,
        "shConnect": 30.2,
        "szConnect": 20.3,
        "source": "akshare",
        "unit": "亿元",
    }
```

- [ ] **Step 3: 安装 pytest 依赖**

```bash
cd /Users/jozen.lee/ai-softwares/ai-invest/data-service
pip install pytest pytest-asyncio --quiet
```

- [ ] **Step 4: Commit**

```bash
git add data-service/tests/
git commit -m "test: create test infrastructure with conftest.py"
```

---

### Task 6: 测试 Registry 降级调度

**Files:**
- Create: `data-service/tests/test_registry.py`

**Interfaces:**
- Consumes: `ProviderRegistry`, `CategoryConfig`
- Produces: Registry 降级调度的完整测试

- [ ] **Step 1: 编写 test_registry.py**

```python
# tests/test_registry.py
import pytest
import pandas as pd
from unittest.mock import AsyncMock
from providers.registry import ProviderRegistry, CategoryConfig


class TestRegistryFetch:
    """Registry.fetch() 降级调度测试"""

    @pytest.fixture
    def setup(self):
        self.akshare = AsyncMock()
        self.tushare = AsyncMock()
        self.xueqiu = AsyncMock()
        self.registry = ProviderRegistry()
        self.registry._providers = {
            "akshare": self.akshare,
            "tushare": self.tushare,
            "xueqiu": self.xueqiu,
        }

    @pytest.mark.asyncio
    async def test_success_first_source(self, setup):
        """第一个数据源成功，直接返回"""
        self.akshare.get_index_spot.return_value = pd.DataFrame({"code": ["000001"]})

        result = await self.registry.fetch(
            category="index_spot",
            method="get_index_spot",
            cache_key="test",
        )

        assert not result.empty
        self.akshare.get_index_spot.assert_called_once()
        self.tushare.get_index_spot.assert_not_called()

    @pytest.mark.asyncio
    async def test_fallback_to_second_source(self, setup):
        """第一个源失败，降级到第二个源"""
        self.akshare.get_index_spot.side_effect = Exception("AKShare失败")
        self.tushare.get_index_spot.return_value = pd.DataFrame({"code": ["000001"]})

        result = await self.registry.fetch(
            category="index_spot",
            method="get_index_spot",
            cache_key="test",
        )

        assert not result.empty
        self.akshare.get_index_spot.assert_called_once()
        self.tushare.get_index_spot.assert_called_once()

    @pytest.mark.asyncio
    async def test_fallback_to_third_source(self, setup):
        """前两个源失败，降级到第三个源"""
        self.akshare.get_index_spot.side_effect = Exception("失败")
        self.tushare.get_index_spot.side_effect = Exception("失败")
        self.xueqiu.get_index_spot.return_value = pd.DataFrame({"code": ["000001"]})

        result = await self.registry.fetch(
            category="index_spot",
            method="get_index_spot",
            cache_key="test",
        )

        assert not result.empty

    @pytest.mark.asyncio
    async def test_all_sources_failed(self, setup):
        """所有数据源失败，抛出异常"""
        self.akshare.get_index_spot.side_effect = Exception("失败")
        self.tushare.get_index_spot.side_effect = Exception("失败")
        self.xueqiu.get_index_spot.side_effect = Exception("失败")

        with pytest.raises(Exception):
            await self.registry.fetch(
                category="index_spot",
                method="get_index_spot",
                cache_key="test",
            )

    @pytest.mark.asyncio
    async def test_empty_dataframe_fallback(self, setup):
        """第一个源返回空 DataFrame，尝试下一个源"""
        self.akshare.get_index_spot.return_value = pd.DataFrame()
        self.tushare.get_index_spot.return_value = pd.DataFrame({"code": ["000001"]})

        result = await self.registry.fetch(
            category="index_spot",
            method="get_index_spot",
            cache_key="test",
        )

        assert not result.empty

    @pytest.mark.asyncio
    async def test_not_implemented_skip(self, setup):
        """provider 不支持该方法，跳过"""
        self.akshare.get_index_spot.side_effect = NotImplementedError()
        self.tushare.get_index_spot.return_value = pd.DataFrame({"code": ["000001"]})

        result = await self.registry.fetch(
            category="index_spot",
            method="get_index_spot",
            cache_key="test",
        )

        assert not result.empty


class TestCategoryConfig:
    """CategoryConfig 配置测试"""

    def test_custom_config_override(self):
        """自定义配置可以覆盖默认配置"""
        custom = {
            "index_spot": CategoryConfig(
                sources=["xueqiu", "akshare"],
                cache_ttl=15,
            ),
        }
        registry = ProviderRegistry(custom_config=custom)

        assert registry._config["index_spot"].sources == ["xueqiu", "akshare"]
        assert registry._config["index_spot"].cache_ttl == 15

    def test_default_config_preserved(self):
        """未覆盖的类别保留默认配置"""
        custom = {"index_spot": CategoryConfig(sources=["xueqiu"])}
        registry = ProviderRegistry(custom_config=custom)

        assert registry._config["index_daily"].sources == ["akshare", "tushare"]

    def test_unknown_category_raises(self):
        """未知的数据类别抛出异常"""
        registry = ProviderRegistry()
        with pytest.raises(ValueError):
            # 需要在 fetch 中添加这个检查
            pass
```

- [ ] **Step 2: 运行测试**

```bash
cd /Users/jozen.lee/ai-softwares/ai-invest/data-service
python -m pytest tests/test_registry.py -v
```

Expected: 所有测试通过

- [ ] **Step 3: Commit**

```bash
git add data-service/tests/test_registry.py
git commit -m "test: add Registry fallback and CategoryConfig tests"
```

---

### Task 7: 测试缓存管理器

**Files:**
- Create: `data-service/tests/test_cache.py`

**Interfaces:**
- Consumes: `CacheManager`
- Produces: 缓存管理器的完整测试

- [ ] **Step 1: 编写 test_cache.py**

```python
# tests/test_cache.py
import pytest
import time
from providers.registry import CacheManager


class TestCacheManager:
    """CacheManager 测试"""

    @pytest.fixture
    def cache(self):
        return CacheManager()

    def test_memory_cache_set_get(self, cache):
        """内存缓存写入和读取"""
        cache.set_memory("key1", {"data": "value1"}, ttl_seconds=60)
        result = cache.get_memory("key1")
        assert result == {"data": "value1"}

    def test_memory_cache_expired(self, cache):
        """内存缓存过期后返回 None"""
        cache.set_memory("key1", {"data": "value1"}, ttl_seconds=0)
        time.sleep(0.1)
        result = cache.get_memory("key1")
        assert result is None

    def test_memory_cache_miss(self, cache):
        """内存缓存未命中返回 None"""
        result = cache.get_memory("nonexistent")
        assert result is None

    def test_file_cache_set_get(self, cache):
        """文件缓存写入和读取"""
        cache.set_file("key2", {"data": "value2"})
        result = cache.get_file("key2")
        assert result == {"data": "value2"}

    def test_file_cache_miss(self, cache):
        """文件缓存未命中返回 None"""
        result = cache.get_file("nonexistent")
        assert result is None

    def test_invalidate(self, cache):
        """清除缓存"""
        cache.set_memory("key3", {"data": "value3"}, ttl_seconds=60)
        cache.invalidate("key3")
        assert cache.get_memory("key3") is None

    def test_set_both_memory_and_file(self, cache):
        """set 方法同时写入内存和文件"""
        cache.set("key4", {"data": "value4"}, memory_ttl=60)
        assert cache.get_memory("key4") == {"data": "value4"}
        assert cache.get_file("key4") == {"data": "value4"}
```

- [ ] **Step 2: 运行测试**

```bash
cd /Users/jozen.lee/ai-softwares/ai-invest/data-service
python -m pytest tests/test_cache.py -v
```

Expected: 所有测试通过

- [ ] **Step 3: Commit**

```bash
git add data-service/tests/test_cache.py
git commit -m "test: add CacheManager tests"
```

---

### Task 8: 测试指数实时行情接口

**Files:**
- Create: `data-service/tests/test_interfaces/test_index_spot.py`

**Interfaces:**
- Consumes: `DataService`, fixtures from `conftest.py`
- Produces: 指数实时行情接口的完整测试

- [ ] **Step 1: 编写 test_index_spot.py**

```python
# tests/test_interfaces/test_index_spot.py
import pytest
import pandas as pd
from unittest.mock import AsyncMock


class TestIndexSpot:
    """指数实时行情接口测试"""

    @pytest.mark.asyncio
    async def test_success(self, data_service, mock_akshare, sample_index_df):
        """正常返回数据"""
        mock_akshare.get_index_spot.return_value = sample_index_df

        result = await data_service.get_index_spot()

        assert not result.empty
        assert len(result) == 5
        mock_akshare.get_index_spot.assert_called_once()

    @pytest.mark.asyncio
    async def test_fallback_to_tushare(self, data_service, mock_akshare, mock_tushare, sample_index_df):
        """AKShare 失败，降级到 Tushare"""
        mock_akshare.get_index_spot.side_effect = Exception("AKShare失败")
        mock_tushare.get_index_spot.return_value = sample_index_df

        result = await data_service.get_index_spot()

        assert not result.empty
        mock_akshare.get_index_spot.assert_called_once()
        mock_tushare.get_index_spot.assert_called_once()

    @pytest.mark.asyncio
    async def test_fallback_to_xueqiu(self, data_service, mock_akshare, mock_tushare, mock_xueqiu, sample_index_df):
        """前两个源失败，降级到雪球"""
        mock_akshare.get_index_spot.side_effect = Exception("失败")
        mock_tushare.get_index_spot.side_effect = Exception("失败")
        mock_xueqiu.get_index_spot.return_value = sample_index_df

        result = await data_service.get_index_spot()

        assert not result.empty

    @pytest.mark.asyncio
    async def test_all_sources_failed(self, data_service, mock_akshare, mock_tushare, mock_xueqiu):
        """所有数据源失败"""
        mock_akshare.get_index_spot.side_effect = Exception("失败")
        mock_tushare.get_index_spot.side_effect = Exception("失败")
        mock_xueqiu.get_index_spot.side_effect = Exception("失败")

        with pytest.raises(Exception):
            await data_service.get_index_spot()

    @pytest.mark.asyncio
    async def test_empty_dataframe_fallback(self, data_service, mock_akshare, mock_tushare, sample_index_df):
        """第一个源返回空 DataFrame，尝试下一个源"""
        mock_akshare.get_index_spot.return_value = pd.DataFrame()
        mock_tushare.get_index_spot.return_value = sample_index_df

        result = await data_service.get_index_spot()

        assert not result.empty

    @pytest.mark.asyncio
    async def test_returns_dataframe(self, data_service, mock_akshare, sample_index_df):
        """确保返回 DataFrame 类型"""
        mock_akshare.get_index_spot.return_value = sample_index_df

        result = await data_service.get_index_spot()

        assert isinstance(result, pd.DataFrame)
```

- [ ] **Step 2: 运行测试**

```bash
cd /Users/jozen.lee/ai-softwares/ai-invest/data-service
python -m pytest tests/test_interfaces/test_index_spot.py -v
```

Expected: 所有测试通过

- [ ] **Step 3: Commit**

```bash
git add data-service/tests/test_interfaces/test_index_spot.py
git commit -m "test: add index_spot interface tests"
```

---

### Task 9: 测试其他数据接口

**Files:**
- Create: `data-service/tests/test_interfaces/test_index_daily.py`
- Create: `data-service/tests/test_interfaces/test_northbound_flow.py`
- Create: `data-service/tests/test_interfaces/test_market_capital_flow.py`
- Create: `data-service/tests/test_interfaces/test_sector_capital_flow.py`
- Create: `data-service/tests/test_interfaces/test_news.py`

**Interfaces:**
- Consumes: `DataService`, fixtures from `conftest.py`
- Produces: 所有数据接口的完整测试覆盖

- [ ] **Step 1: 编写 test_index_daily.py**

```python
# tests/test_interfaces/test_index_daily.py
import pytest
import pandas as pd


class TestIndexDaily:
    """指数日K数据接口测试"""

    @pytest.fixture
    def sample_daily_df(self):
        return pd.DataFrame({
            "date": ["2026-07-15", "2026-07-16", "2026-07-17"],
            "open": [2990.0, 3000.0, 3010.0],
            "high": [3010.0, 3020.0, 3030.0],
            "low": [2980.0, 2990.0, 3000.0],
            "close": [3000.0, 3010.0, 3020.0],
            "volume": [1000000, 1100000, 1200000],
        })

    @pytest.mark.asyncio
    async def test_success(self, data_service, mock_akshare, sample_daily_df):
        mock_akshare.get_index_daily.return_value = sample_daily_df

        result = await data_service.get_index_daily("sh000001", "20260701", "20260718")

        assert not result.empty
        assert len(result) == 3

    @pytest.mark.asyncio
    async def test_fallback(self, data_service, mock_akshare, mock_tushare, sample_daily_df):
        mock_akshare.get_index_daily.side_effect = Exception("失败")
        mock_tushare.get_index_daily.return_value = sample_daily_df

        result = await data_service.get_index_daily("sh000001", "20260701", "20260718")

        assert not result.empty

    @pytest.mark.asyncio
    async def test_all_failed(self, data_service, mock_akshare, mock_tushare):
        mock_akshare.get_index_daily.side_effect = Exception("失败")
        mock_tushare.get_index_daily.side_effect = Exception("失败")

        with pytest.raises(Exception):
            await data_service.get_index_daily("sh000001", "20260701", "20260718")
```

- [ ] **Step 2: 编写 test_northbound_flow.py**

```python
# tests/test_interfaces/test_northbound_flow.py
import pytest


class TestNorthboundFlow:
    """北向资金接口测试"""

    @pytest.mark.asyncio
    async def test_success(self, data_service, mock_akshare, sample_northbound_dict):
        mock_akshare.get_northbound_flow.return_value = sample_northbound_dict

        result = await data_service.get_northbound_flow()

        assert isinstance(result, dict)
        assert "value" in result
        assert "shConnect" in result
        assert "szConnect" in result

    @pytest.mark.asyncio
    async def test_fallback(self, data_service, mock_akshare, mock_tushare, sample_northbound_dict):
        mock_akshare.get_northbound_flow.side_effect = Exception("失败")
        mock_tushare.get_northbound_flow.return_value = sample_northbound_dict

        result = await data_service.get_northbound_flow()

        assert isinstance(result, dict)

    @pytest.mark.asyncio
    async def test_all_failed(self, data_service, mock_akshare, mock_tushare):
        mock_akshare.get_northbound_flow.side_effect = Exception("失败")
        mock_tushare.get_northbound_flow.side_effect = Exception("失败")

        with pytest.raises(Exception):
            await data_service.get_northbound_flow()
```

- [ ] **Step 3: 编写 test_market_capital_flow.py**

```python
# tests/test_interfaces/test_market_capital_flow.py
import pytest


class TestMarketCapitalFlow:
    """大盘资金流向接口测试"""

    @pytest.fixture
    def sample_flow_dict(self):
        return {
            "主力净流入-净额": 1000000000.0,
            "主力净流入-净占比": 5.5,
            "中单净流入-净额": -500000000.0,
            "小单净流入-净额": -500000000.0,
            "日期": "2026-07-18",
            "source": "akshare",
        }

    @pytest.mark.asyncio
    async def test_success(self, data_service, mock_akshare, sample_flow_dict):
        mock_akshare.get_market_capital_flow.return_value = sample_flow_dict

        result = await data_service.get_market_capital_flow()

        assert isinstance(result, dict)
        assert "主力净流入-净额" in result

    @pytest.mark.asyncio
    async def test_fallback(self, data_service, mock_akshare, mock_tushare, sample_flow_dict):
        mock_akshare.get_market_capital_flow.side_effect = Exception("失败")
        mock_tushare.get_market_capital_flow.return_value = sample_flow_dict

        result = await data_service.get_market_capital_flow()

        assert isinstance(result, dict)

    @pytest.mark.asyncio
    async def test_all_failed(self, data_service, mock_akshare, mock_tushare):
        mock_akshare.get_market_capital_flow.side_effect = Exception("失败")
        mock_tushare.get_market_capital_flow.side_effect = Exception("失败")

        with pytest.raises(Exception):
            await data_service.get_market_capital_flow()
```

- [ ] **Step 4: 编写 test_sector_capital_flow.py**

```python
# tests/test_interfaces/test_sector_capital_flow.py
import pytest


class TestSectorCapitalFlow:
    """板块资金流向接口测试"""

    @pytest.fixture
    def sample_sector_list(self):
        return [
            {"名称": "半导体", "今日涨跌幅": 2.5, "今日主力净流入-净额": 500000000},
            {"名称": "消费电子", "今日涨跌幅": 1.8, "今日主力净流入-净额": 300000000},
        ]

    @pytest.mark.asyncio
    async def test_success(self, data_service, mock_akshare, sample_sector_list):
        mock_akshare.get_sector_capital_flow.return_value = sample_sector_list

        result = await data_service.get_sector_capital_flow("今日")

        assert isinstance(result, list)
        assert len(result) == 2

    @pytest.mark.asyncio
    async def test_fallback(self, data_service, mock_akshare, mock_tushare, sample_sector_list):
        mock_akshare.get_sector_capital_flow.side_effect = Exception("失败")
        mock_tushare.get_sector_capital_flow.return_value = sample_sector_list

        result = await data_service.get_sector_capital_flow("今日")

        assert isinstance(result, list)

    @pytest.mark.asyncio
    async def test_all_failed(self, data_service, mock_akshare, mock_tushare):
        mock_akshare.get_sector_capital_flow.side_effect = Exception("失败")
        mock_tushare.get_sector_capital_flow.side_effect = Exception("失败")

        with pytest.raises(Exception):
            await data_service.get_sector_capital_flow("今日")
```

- [ ] **Step 5: 编写 test_news.py**

```python
# tests/test_interfaces/test_news.py
import pytest
import pandas as pd


class TestNews:
    """新闻数据接口测试"""

    @pytest.fixture
    def sample_news_df(self):
        return pd.DataFrame({
            "title": ["新闻1", "新闻2"],
            "content": ["内容1", "内容2"],
            "source": ["财联社", "财联社"],
            "publishTime": ["2026-07-18 10:00:00", "2026-07-18 11:00:00"],
        })

    @pytest.mark.asyncio
    async def test_success(self, data_service, mock_akshare, sample_news_df):
        mock_akshare.get_news.return_value = sample_news_df

        result = await data_service.get_news("财联社", 50)

        assert not result.empty
        assert len(result) == 2

    @pytest.mark.asyncio
    async def test_not_implemented_fallback(self, data_service, mock_akshare, mock_tushare, sample_news_df):
        """AKShare 不支持，尝试下一个源"""
        mock_akshare.get_news.side_effect = NotImplementedError()
        # news 配置只有 akshare，所以会抛出异常
        with pytest.raises(Exception):
            await data_service.get_news("财联社", 50)
```

- [ ] **Step 6: 运行所有接口测试**

```bash
cd /Users/jozen.lee/ai-softwares/ai-invest/data-service
python -m pytest tests/test_interfaces/ -v
```

Expected: 所有测试通过

- [ ] **Step 7: Commit**

```bash
git add data-service/tests/test_interfaces/
git commit -m "test: add all data interface tests (index_daily, northbound, capital_flow, news)"
```

---

## Phase 2: Frontend Refactoring

### Task 10: 创建统一数据客户端

**Files:**
- Create: `src/lib/data-client.ts`

**Interfaces:**
- Produces: `DataClient` class, `dataClient` singleton, `ApiResponse<T>` type

- [ ] **Step 1: 编写 data-client.ts**

```typescript
// src/lib/data-client.ts
// 统一数据客户端
// 所有前端数据获取通过此客户端，自动处理缓存、重试、错误

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  source?: string
}

interface DataClientConfig {
  baseUrl: string
  timeout: number
  retryCount: number
  cacheTTL: number
}

export class DataClient {
  private config: DataClientConfig
  private cache: Map<string, { data: ApiResponse<any>; expiry: number }>

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
    if (cached) return cached as ApiResponse<T>

    // 带重试的请求
    const response = await this.fetchWithRetry<T>(url)

    // 写入缓存
    if (response.success) {
      this.setCache(cacheKey, response, this.config.cacheTTL)
    }

    return response
  }

  private buildUrl(endpoint: string, params?: Record<string, string>): URL {
    const url = new URL(endpoint, this.config.baseUrl)
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value)
      })
    }
    return url
  }

  private getFromCache(key: string): ApiResponse<any> | null {
    const cached = this.cache.get(key)
    if (cached && cached.expiry > Date.now()) {
      return cached.data
    }
    if (cached) {
      this.cache.delete(key)
    }
    return null
  }

  private setCache(key: string, data: ApiResponse<any>, ttlSeconds: number): void {
    this.cache.set(key, {
      data,
      expiry: Date.now() + ttlSeconds * 1000,
    })
  }

  private async fetchWithRetry<T>(url: URL, attempt = 0): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(url.toString(), {
        signal: AbortSignal.timeout(this.config.timeout),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      if (attempt < this.config.retryCount) {
        return this.fetchWithRetry<T>(url, attempt + 1)
      }
      return {
        success: false,
        error: `数据服务不可用: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  clearCache(): void {
    this.cache.clear()
  }
}

export const dataClient = new DataClient()
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/data-client.ts
git commit -m "feat: create unified DataClient with cache and retry"
```

---

### Task 11: 创建市场数据服务

**Files:**
- Create: `src/lib/services/market.service.ts`

**Interfaces:**
- Consumes: `dataClient` from `data-client.ts`
- Produces: `marketService` with `getOverview()`, `getIndexData()`, `getCapitalFlow()`

- [ ] **Step 1: 编写 market.service.ts**

```typescript
// src/lib/services/market.service.ts
// 市场数据服务
// 通过统一数据客户端获取市场数据

import { dataClient, ApiResponse } from '@/lib/data-client'

export interface IndexData {
  code: string
  name: string
  price: number
  change: number
  changePct: number
  volume: number
  amount: number
}

export interface MarketOverview {
  indices: IndexData[]
  source: string
  timestamp: string
}

export interface CapitalFlowData {
  mainNetInflow: number
  mainNetInflowPct: number
  midNetInflow: number
  smallNetInflow: number
  date: string
}

export interface SectorFlow {
  name: string
  changePct: number
  mainNetInflow: number
}

export interface NorthboundFlow {
  date: string
  value: number
  shConnect: number
  szConnect: number
}

export const marketService = {
  async getOverview(): Promise<ApiResponse<MarketOverview>> {
    return dataClient.get<MarketOverview>('/api/market/overview')
  },

  async getIndexData(code: string, days: number = 30): Promise<ApiResponse<any>> {
    return dataClient.get(`/api/market/index/${code}`, { days: String(days) })
  },

  async getCapitalFlow(): Promise<ApiResponse<CapitalFlowData>> {
    return dataClient.get<CapitalFlowData>('/api/capital-flow/overview')
  },

  async getSectorFlow(indicator: string = '今日'): Promise<ApiResponse<SectorFlow[]>> {
    return dataClient.get<SectorFlow[]>('/api/capital-flow/sector', { indicator })
  },

  async getNorthboundFlow(): Promise<ApiResponse<NorthboundFlow>> {
    return dataClient.get<NorthboundFlow>('/api/capital-flow/northbound')
  },

  async getNorthboundHistory(days: number = 30): Promise<ApiResponse<NorthboundFlow[]>> {
    return dataClient.get<NorthboundFlow[]>('/api/capital-flow/northbound/history', { days: String(days) })
  },
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/services/market.service.ts
git commit -m "feat: create market data service"
```

---

### Task 12: 创建其他数据服务

**Files:**
- Create: `src/lib/services/etf.service.ts`
- Create: `src/lib/services/news.service.ts`

**Interfaces:**
- Consumes: `dataClient` from `data-client.ts`
- Produces: `etfService`, `newsService`

- [ ] **Step 1: 编写 etf.service.ts**

```typescript
// src/lib/services/etf.service.ts
// ETF 数据服务

import { dataClient, ApiResponse } from '@/lib/data-client'

export interface ETFRealtime {
  code: string
  name: string
  price: number
  change: number
  changePct: number
  volume: number
}

export interface ETFNav {
  ticker: string
  nav: number
  totalShares: number
  totalAssets: number
}

export const etfService = {
  async getRealtime(symbols: string[]): Promise<ApiResponse<ETFRealtime[]>> {
    return dataClient.get<ETFRealtime[]>('/api/etf/realtime', {
      symbols: symbols.join(','),
    })
  },

  async getDaily(ticker: string, days: number = 30): Promise<ApiResponse<any>> {
    return dataClient.get(`/api/etf/daily/${ticker}`, { days: String(days) })
  },

  async getNav(ticker: string): Promise<ApiResponse<ETFNav>> {
    return dataClient.get<ETFNav>(`/api/etf/nav/${ticker}`)
  },
}
```

- [ ] **Step 2: 编写 news.service.ts**

```typescript
// src/lib/services/news.service.ts
// 新闻数据服务

import { dataClient, ApiResponse } from '@/lib/data-client'

export interface NewsArticle {
  id: string
  title: string
  content: string
  summary?: string
  source: string
  url?: string
  publishTime: string
  category: string
  sentiment?: number
  impact?: number
}

export interface NewsFeed {
  total: number
  items: NewsArticle[]
}

export const newsService = {
  async getFeed(params?: {
    category?: string
    limit?: number
    offset?: number
  }): Promise<ApiResponse<NewsFeed>> {
    const queryParams: Record<string, string> = {}
    if (params?.category) queryParams.category = params.category
    if (params?.limit) queryParams.limit = String(params.limit)
    if (params?.offset) queryParams.offset = String(params.offset)

    return dataClient.get<NewsFeed>('/api/news/feed', queryParams)
  },

  async getAIHardwareNews(limit: number = 20): Promise<ApiResponse<NewsArticle[]>> {
    return dataClient.get<NewsArticle[]>('/api/news/ai-hardware', {
      limit: String(limit),
    })
  },
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/services/etf.service.ts src/lib/services/news.service.ts
git commit -m "feat: create ETF and news data services"
```

---

### Task 13: 创建 DataClient 单元测试

**Files:**
- Create: `src/lib/__tests__/data-client.test.ts`

**Interfaces:**
- Consumes: `DataClient`
- Produces: DataClient 缓存、重试、错误处理的完整测试

- [ ] **Step 1: 编写 data-client.test.ts**

```typescript
// src/lib/__tests__/data-client.test.ts
import { DataClient, ApiResponse } from '../data-client'

describe('DataClient', () => {
  let client: DataClient

  beforeEach(() => {
    client = new DataClient({
      baseUrl: 'http://localhost:8000',
      timeout: 1000,
      retryCount: 1,
      cacheTTL: 5,
    })
    client.clearCache()
    global.fetch = jest.fn()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('get()', () => {
    it('should return data on success', async () => {
      const mockData: ApiResponse<any> = {
        success: true,
        data: { indices: [] },
      }
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      })

      const result = await client.get('/api/test')

      expect(result.success).toBe(true)
      expect(result.data).toEqual({ indices: [] })
    })

    it('should return cached data on second call', async () => {
      const mockData: ApiResponse<any> = {
        success: true,
        data: { indices: [] },
      }
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      })

      await client.get('/api/test')
      const result = await client.get('/api/test')

      expect(global.fetch).toHaveBeenCalledTimes(1)
      expect(result).toEqual(mockData)
    })

    it('should retry on failure', async () => {
      ;(global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        })

      const result = await client.get('/api/test')

      expect(global.fetch).toHaveBeenCalledTimes(2)
      expect(result.success).toBe(true)
    })

    it('should return error after all retries failed', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'))

      const result = await client.get('/api/test')

      expect(result.success).toBe(false)
      expect(result.error).toContain('数据服务不可用')
    })

    it('should handle HTTP errors', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      const result = await client.get('/api/test')

      expect(result.success).toBe(false)
    })

    it('should pass params correctly', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })

      await client.get('/api/test', { key: 'value' })

      const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0]
      expect(calledUrl).toContain('key=value')
    })
  })

  describe('cache', () => {
    it('should expire after TTL', async () => {
      const client = new DataClient({ cacheTTL: 0 })
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })

      await client.get('/api/test')
      await new Promise(resolve => setTimeout(resolve, 100))
      await client.get('/api/test')

      expect(global.fetch).toHaveBeenCalledTimes(2)
    })

    it('should not cache failed responses', async () => {
      ;(global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: false, error: 'fail' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        })

      await client.get('/api/test')
      const result = await client.get('/api/test')

      expect(global.fetch).toHaveBeenCalledTimes(2)
      expect(result.success).toBe(true)
    })
  })

  describe('clearCache()', () => {
    it('should clear all cached data', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })

      await client.get('/api/test')
      client.clearCache()
      await client.get('/api/test')

      expect(global.fetch).toHaveBeenCalledTimes(2)
    })
  })
})
```

- [ ] **Step 2: 运行测试**

```bash
cd /Users/jozen.lee/ai-softwares/ai-invest
npm test -- src/lib/__tests__/data-client.test.ts
```

Expected: 所有测试通过

- [ ] **Step 3: Commit**

```bash
git add src/lib/__tests__/data-client.test.ts
git commit -m "test: add DataClient unit tests"
```

---

## Phase 3: Integration & Verification

### Task 14: 运行验收测试

**Files:**
- None (使用现有验收脚本)

- [ ] **Step 1: 启动 Python 数据服务**

```bash
cd /Users/jozen.lee/ai-softwares/ai-invest/data-service
python main.py &
```

- [ ] **Step 2: 运行验收测试**

```bash
cd /Users/jozen.lee/ai-softwares/ai-invest
bash scripts/acceptance-test.sh
```

Expected: 所有测试通过

- [ ] **Step 3: 检查测试覆盖率**

```bash
cd /Users/jozen.lee/ai-softwares/ai-invest/data-service
python -m pytest tests/ --cov=services --cov=providers --cov-report=term-missing
```

Expected: 所有数据接口都有测试覆盖

---

### Task 15: 手动测试

- [ ] **Step 1: 启动 Next.js 开发服务器**

```bash
cd /Users/jozen.lee/ai-softwares/ai-invest
npm run dev
```

- [ ] **Step 2: 测试仪表盘页面**

访问 http://localhost:3000/dashboard
- 确认指数数据加载正常
- 确认资金流向数据加载正常

- [ ] **Step 3: 测试事件资讯页面**

访问 http://localhost:3000/events
- 确认新闻列表加载正常

- [ ] **Step 4: 测试分析页面**

访问 http://localhost:3000/analysis
- 确认 ETF 数据加载正常

---

## Success Criteria

1. ✅ 所有遗留客户端代码已删除
2. ✅ Registry 支持 CategoryConfig 可配置优先级
3. ✅ 所有数据接口有单元测试覆盖
4. ✅ 前端统一使用 DataClient 获取数据
5. ✅ 验收测试全部通过
6. ✅ 前端页面数据加载正常
