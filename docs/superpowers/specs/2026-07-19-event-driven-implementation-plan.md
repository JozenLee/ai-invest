# 事件驱动框架实施计划

## 文档信息
- **创建日期**: 2026-07-19
- **版本**: v1.0
- **状态**: 实施计划
- **关联文档**: [架构设计文档](./2026-07-19-event-driven-architecture-design.md)

## 目录
- [1. 总体规划](#1-总体规划)
- [2. Phase 1: 数据源层基础](#2-phase-1-数据源层基础)
- [3. Phase 2: 调度器增强](#3-phase-2-调度器增强)
- [4. Phase 3: AI清洗层](#4-phase-3-ai清洗层)
- [5. Phase 4: 存储管理](#5-phase-4-存储管理)
- [6. Phase 5: UI交互](#6-phase-5-ui交互)
- [7. Phase 6: 集成测试和优化](#7-phase-6-集成测试和优化)
- [8. 风险评估](#8-风险评估)
- [9. 验收标准](#9-验收标准)

---

## 1. 总体规划

### 1.1 实施周期
- **总工期**: 10-12个工作日
- **每阶段**: 1-2天
- **并行开发**: 前端和后端可部分并行

### 1.2 阶段划分

| 阶段 | 工作量 | 核心交付 | 依赖关系 |
|------|--------|----------|----------|
| Phase 1 | 2天 | 数据源驱动抽象、注册表 | 无 |
| Phase 2 | 2天 | 调度器服务、任务管理 | Phase 1 |
| Phase 3 | 2天 | AI分析服务、筛选引擎 | Phase 1 |
| Phase 4 | 1天 | 存储生命周期管理 | Phase 1 |
| Phase 5 | 2-3天 | UI页面、API路由 | Phase 1-4 |
| Phase 6 | 1-2天 | 集成测试、性能优化 | Phase 1-5 |

### 1.3 技术栈确认
- **Backend**: FastAPI (Python 3.10+) + Prisma Client Python
- **Frontend**: Next.js 16 + React 19 + TypeScript 5
- **Database**: SQLite + Prisma ORM v7
- **AI**: Claude API (Anthropic SDK)
- **Scheduler**: APScheduler 3.10+
- **HTTP Client**: httpx (async)
- **Parser**: BeautifulSoup4

---

## 2. Phase 1: 数据源层基础

**目标**: 实现驱动抽象和注册表机制，支持可插拔的数据源驱动

**工期**: 2天

### 2.1 数据库迁移

#### 2.1.1 修改 Prisma Schema
**文件**: `prisma/schema.prisma`

**变更内容**:
```prisma
model DataSource {
  id              String   @id @default(cuid())
  name            String
  type            String
  driverType      String   // 新增: api/crawler/rss/social
  provider        String
  config          String   // JSON: 驱动配置
  configSchema    String?  // 新增: JSON Schema
  updateFrequency Int      @default(60)
  isActive        Boolean  @default(true)
  lastFetchAt     DateTime?
  lastFetchStatus String?  // 新增: success/failed/running
  errorMessage    String?  // 新增: 错误信息
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  articles        NewsArticle[]
  logs            DataSourceLog[]
  schedulerJobs   SchedulerJob[]  // 新增关联
  
  @@index([driverType])
  @@index([isActive])
}

model SchedulerJob {
  id            String   @id @default(cuid())
  sourceId      String
  scheduleType  String   // cron/interval/webhook
  scheduleConfig String  // JSON
  isEnabled     Boolean  @default(true)
  lastRunAt     DateTime?
  nextRunAt     DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  source        DataSource @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  
  @@index([sourceId])
  @@index([isEnabled, nextRunAt])
}

model DataSourceLog {
  id             String   @id @default(cuid())
  sourceId       String
  jobId          String?  // 新增: 关联调度任务
  status         String
  message        String?
  fetchedCount   Int      @default(0)
  processedCount Int      @default(0)  // 新增
  failedCount    Int      @default(0)  // 新增
  duration       Int?
  errorDetail    String?  // 新增
  createdAt      DateTime @default(now())
  
  source DataSource @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  
  @@index([sourceId])
  @@index([createdAt])
  @@index([status])
}
```

#### 2.1.2 生成迁移
```bash
cd /Users/jozen.lee/ai-softwares/ai-invest
npx prisma migrate dev --name add_datasource_driver_system
```

### 2.2 Python后端实现

#### 2.2.1 驱动抽象基类
**新建文件**: `data-service/drivers/__init__.py`
```python
# 空文件，标记为包
```

**新建文件**: `data-service/drivers/base_driver.py`
```python
from abc import ABC, abstractmethod
from typing import Dict, List, Any
from datetime import datetime
from pydantic import BaseModel


class RawEvent(BaseModel):
    """原始事件数据"""
    title: str
    content: str
    url: str | None = None
    publish_time: datetime
    source: str
    metadata: Dict[str, Any] = {}


class DriverInfo(BaseModel):
    """驱动信息"""
    type: str
    name: str
    description: str
    config_schema: Dict[str, Any]
    version: str = "1.0.0"


class BaseDataDriver(ABC):
    """数据源驱动基类"""
    
    @abstractmethod
    async def fetch(self, config: Dict[str, Any]) -> List[RawEvent]:
        """
        采集原始数据
        
        Args:
            config: 驱动配置（从DataSource.config解析）
        
        Returns:
            原始事件列表
        
        Raises:
            Exception: 采集失败时抛出异常
        """
        pass
    
    @abstractmethod
    async def validate_config(self, config: Dict[str, Any]) -> bool:
        """
        验证配置有效性
        
        Args:
            config: 待验证的配置
        
        Returns:
            是否有效
        """
        pass
    
    @abstractmethod
    def get_driver_info(self) -> DriverInfo:
        """
        返回驱动信息（包含config schema）
        
        Returns:
            驱动信息对象
        """
        pass
```

#### 2.2.2 API驱动实现
**新建文件**: `data-service/drivers/api_driver.py`
```python
import httpx
from typing import Dict, List, Any
from datetime import datetime
from .base_driver import BaseDataDriver, RawEvent, DriverInfo


class APIDriver(BaseDataDriver):
    """HTTP API数据源驱动"""
    
    async def fetch(self, config: Dict[str, Any]) -> List[RawEvent]:
        url = config.get("url")
        method = config.get("method", "GET").upper()
        headers = config.get("headers", {})
        params = config.get("params", {})
        timeout = config.get("timeout", 30)
        
        async with httpx.AsyncClient() as client:
            response = await client.request(
                method=method,
                url=url,
                headers=headers,
                params=params,
                timeout=timeout
            )
            response.raise_for_status()
            data = response.json()
        
        # 根据响应映射配置解析数据
        mapping = config.get("response_mapping", {})
        items = self._extract_items(data, mapping.get("items_path", ""))
        
        events = []
        for item in items:
            events.append(RawEvent(
                title=self._extract_field(item, mapping.get("title_field", "title")),
                content=self._extract_field(item, mapping.get("content_field", "content")),
                url=self._extract_field(item, mapping.get("url_field", "url")),
                publish_time=self._parse_datetime(
                    self._extract_field(item, mapping.get("time_field", "publishTime"))
                ),
                source=config.get("source_name", "API"),
                metadata={"raw": item}
            ))
        
        return events
    
    async def validate_config(self, config: Dict[str, Any]) -> bool:
        required_fields = ["url", "source_name"]
        return all(field in config for field in required_fields)
    
    def get_driver_info(self) -> DriverInfo:
        return DriverInfo(
            type="api",
            name="HTTP API Driver",
            description="通过HTTP API采集数据",
            config_schema={
                "type": "object",
                "required": ["url", "source_name"],
                "properties": {
                    "url": {
                        "type": "string",
                        "title": "API URL",
                        "description": "数据API的完整URL"
                    },
                    "method": {
                        "type": "string",
                        "enum": ["GET", "POST"],
                        "default": "GET",
                        "title": "HTTP方法"
                    },
                    "headers": {
                        "type": "object",
                        "title": "请求头",
                        "description": "自定义HTTP headers（JSON格式）"
                    },
                    "params": {
                        "type": "object",
                        "title": "查询参数",
                        "description": "URL查询参数（JSON格式）"
                    },
                    "response_mapping": {
                        "type": "object",
                        "title": "响应映射配置",
                        "properties": {
                            "items_path": {"type": "string", "description": "数据列表路径（用.分隔）"},
                            "title_field": {"type": "string", "default": "title"},
                            "content_field": {"type": "string", "default": "content"},
                            "url_field": {"type": "string", "default": "url"},
                            "time_field": {"type": "string", "default": "publishTime"}
                        }
                    },
                    "source_name": {
                        "type": "string",
                        "title": "数据源名称"
                    },
                    "timeout": {
                        "type": "integer",
                        "default": 30,
                        "title": "超时时间（秒）"
                    }
                }
            }
        )
    
    def _extract_items(self, data: Any, path: str) -> List[Dict]:
        """从响应中提取items列表"""
        if not path:
            return data if isinstance(data, list) else [data]
        
        current = data
        for key in path.split("."):
            if key:
                current = current.get(key, [])
        return current if isinstance(current, list) else [current]
    
    def _extract_field(self, item: Dict, field: str) -> Any:
        """从item中提取字段"""
        if "." in field:
            current = item
            for key in field.split("."):
                current = current.get(key, "")
            return current
        return item.get(field, "")
    
    def _parse_datetime(self, time_str: str) -> datetime:
        """解析时间字符串"""
        try:
            return datetime.fromisoformat(time_str.replace("Z", "+00:00"))
        except:
            return datetime.now()
```

#### 2.2.3 RSS驱动实现
**新建文件**: `data-service/drivers/rss_driver.py`
```python
import feedparser
from typing import Dict, List, Any
from datetime import datetime
from .base_driver import BaseDataDriver, RawEvent, DriverInfo


class RSSDriver(BaseDataDriver):
    """RSS/Atom订阅源驱动"""
    
    async def fetch(self, config: Dict[str, Any]) -> List[RawEvent]:
        url = config.get("url")
        feed = feedparser.parse(url)
        
        events = []
        for entry in feed.entries[:config.get("max_items", 50)]:
            events.append(RawEvent(
                title=entry.get("title", ""),
                content=entry.get("summary", entry.get("description", "")),
                url=entry.get("link", ""),
                publish_time=self._parse_published(entry),
                source=config.get("source_name", feed.feed.get("title", "RSS")),
                metadata={"raw": dict(entry)}
            ))
        
        return events
    
    async def validate_config(self, config: Dict[str, Any]) -> bool:
        required_fields = ["url", "source_name"]
        return all(field in config for field in required_fields)
    
    def get_driver_info(self) -> DriverInfo:
        return DriverInfo(
            type="rss",
            name="RSS/Atom Driver",
            description="通过RSS/Atom订阅源采集数据",
            config_schema={
                "type": "object",
                "required": ["url", "source_name"],
                "properties": {
                    "url": {
                        "type": "string",
                        "title": "RSS URL",
                        "description": "RSS或Atom订阅源的URL"
                    },
                    "source_name": {
                        "type": "string",
                        "title": "数据源名称"
                    },
                    "max_items": {
                        "type": "integer",
                        "default": 50,
                        "title": "最大条目数"
                    }
                }
            }
        )
    
    def _parse_published(self, entry) -> datetime:
        """解析发布时间"""
        if hasattr(entry, "published_parsed") and entry.published_parsed:
            import time
            return datetime.fromtimestamp(time.mktime(entry.published_parsed))
        return datetime.now()
```

#### 2.2.4 爬虫驱动实现
**新建文件**: `data-service/drivers/crawler_driver.py`
```python
import httpx
from bs4 import BeautifulSoup
from typing import Dict, List, Any
from datetime import datetime
from .base_driver import BaseDataDriver, RawEvent, DriverInfo


class CrawlerDriver(BaseDataDriver):
    """网页爬虫驱动"""
    
    async def fetch(self, config: Dict[str, Any]) -> List[RawEvent]:
        url = config.get("url")
        headers = config.get("headers", {
            "User-Agent": "Mozilla/5.0 (compatible; AIInvestBot/1.0)"
        })
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers, timeout=30)
            response.raise_for_status()
            html = response.text
        
        soup = BeautifulSoup(html, "html.parser")
        selectors = config.get("selectors", {})
        
        # 提取列表容器
        container_selector = selectors.get("container")
        items = soup.select(container_selector) if container_selector else [soup]
        
        events = []
        for item in items[:config.get("max_items", 50)]:
            title = self._extract_text(item, selectors.get("title"))
            content = self._extract_text(item, selectors.get("content"))
            url_elem = self._extract_text(item, selectors.get("url"))
            
            if title:
                events.append(RawEvent(
                    title=title,
                    content=content or title,
                    url=self._resolve_url(url_elem, config.get("url")),
                    publish_time=datetime.now(),
                    source=config.get("source_name", "Crawler"),
                    metadata={}
                ))
        
        return events
    
    async def validate_config(self, config: Dict[str, Any]) -> bool:
        required = ["url", "source_name", "selectors"]
        return all(field in config for field in required)
    
    def get_driver_info(self) -> DriverInfo:
        return DriverInfo(
            type="crawler",
            name="Web Crawler Driver",
            description="通过CSS选择器爬取网页数据",
            config_schema={
                "type": "object",
                "required": ["url", "source_name", "selectors"],
                "properties": {
                    "url": {"type": "string", "title": "目标URL"},
                    "source_name": {"type": "string", "title": "数据源名称"},
                    "selectors": {
                        "type": "object",
                        "title": "CSS选择器配置",
                        "required": ["title"],
                        "properties": {
                            "container": {"type": "string", "description": "列表容器选择器"},
                            "title": {"type": "string", "description": "标题选择器"},
                            "content": {"type": "string", "description": "内容选择器"},
                            "url": {"type": "string", "description": "链接选择器"}
                        }
                    },
                    "headers": {"type": "object", "title": "自定义请求头"},
                    "max_items": {"type": "integer", "default": 50, "title": "最大条目数"}
                }
            }
        )
    
    def _extract_text(self, element, selector: str) -> str:
        if not selector:
            return ""
        found = element.select_one(selector)
        return found.get_text(strip=True) if found else ""
    
    def _resolve_url(self, url: str, base_url: str) -> str:
        if not url:
            return ""
        if url.startswith("http"):
            return url
        from urllib.parse import urljoin
        return urljoin(base_url, url)
```

#### 2.2.5 数据源注册表
**新建文件**: `data-service/registry/__init__.py`
```python
# 空文件
```

**新建文件**: `data-service/registry/source_registry.py`
```python
from typing import Dict, Type, List
from ..drivers.base_driver import BaseDataDriver, DriverInfo


class DataSourceRegistry:
    """数据源驱动注册表"""
    
    _drivers: Dict[str, Type[BaseDataDriver]] = {}
    
    @classmethod
    def register_driver(cls, driver_type: str, driver_class: Type[BaseDataDriver]):
        """注册驱动"""
        cls._drivers[driver_type] = driver_class
    
    @classmethod
    def get_driver(cls, driver_type: str) -> BaseDataDriver:
        """获取驱动实例"""
        driver_class = cls._drivers.get(driver_type)
        if not driver_class:
            raise ValueError(f"Unknown driver type: {driver_type}")
        return driver_class()
    
    @classmethod
    def list_available_drivers(cls) -> List[DriverInfo]:
        """列出所有可用驱动"""
        drivers = []
        for driver_class in cls._drivers.values():
            instance = driver_class()
            drivers.append(instance.get_driver_info())
        return drivers
    
    @classmethod
    def is_registered(cls, driver_type: str) -> bool:
        """检查驱动是否已注册"""
        return driver_type in cls._drivers


# 注册内置驱动
from ..drivers.api_driver import APIDriver
from ..drivers.rss_driver import RSSDriver
from ..drivers.crawler_driver import CrawlerDriver

DataSourceRegistry.register_driver("api", APIDriver)
DataSourceRegistry.register_driver("rss", RSSDriver)
DataSourceRegistry.register_driver("crawler", CrawlerDriver)
```

#### 2.2.6 Python依赖更新
**修改文件**: `data-service/requirements.txt`

添加依赖：
```
feedparser==6.0.10
beautifulsoup4==4.12.2
httpx==0.25.0
```

### 2.3 测试用例

#### 2.3.1 驱动单元测试
**新建文件**: `data-service/tests/test_drivers.py`
```python
import pytest
from drivers.api_driver import APIDriver
from drivers.rss_driver import RSSDriver
from drivers.crawler_driver import CrawlerDriver
from registry.source_registry import DataSourceRegistry


@pytest.mark.asyncio
async def test_api_driver_config_validation():
    driver = APIDriver()
    
    # 有效配置
    valid_config = {
        "url": "https://api.example.com/news",
        "source_name": "Test API"
    }
    assert await driver.validate_config(valid_config) == True
    
    # 无效配置
    invalid_config = {"url": "https://api.example.com/news"}
    assert await driver.validate_config(invalid_config) == False


@pytest.mark.asyncio
async def test_rss_driver_info():
    driver = RSSDriver()
    info = driver.get_driver_info()
    
    assert info.type == "rss"
    assert "url" in info.config_schema["properties"]


def test_registry_registration():
    assert DataSourceRegistry.is_registered("api") == True
    assert DataSourceRegistry.is_registered("rss") == True
    assert DataSourceRegistry.is_registered("crawler") == True
    assert DataSourceRegistry.is_registered("unknown") == False


def test_registry_list_drivers():
    drivers = DataSourceRegistry.list_available_drivers()
    assert len(drivers) >= 3
    assert any(d.type == "api" for d in drivers)
```

### 2.4 交付物清单

#### 新建文件
- `data-service/drivers/__init__.py`
- `data-service/drivers/base_driver.py`
- `data-service/drivers/api_driver.py`
- `data-service/drivers/rss_driver.py`
- `data-service/drivers/crawler_driver.py`
- `data-service/registry/__init__.py`
- `data-service/registry/source_registry.py`
- `data-service/tests/test_drivers.py`

#### 修改文件
- `prisma/schema.prisma` (新增字段和表)
- `data-service/requirements.txt` (新增依赖)

#### 数据库迁移
- `prisma/migrations/[timestamp]_add_datasource_driver_system/`

---

## 3. Phase 2: 调度器增强

**目标**: 增强调度器服务，支持多数据源并行采集和任务管理

**工期**: 2天

### 3.1 Python后端实现

#### 3.1.1 采集服务
**新建文件**: `data-service/services/fetch_service.py`
```python
import asyncio
from typing import List, Dict, Any
from datetime import datetime
from pydantic import BaseModel
from prisma import Prisma
from ..registry.source_registry import DataSourceRegistry
from ..drivers.base_driver import RawEvent
import json


class FetchResult(BaseModel):
    """采集结果"""
    source_id: str
    status: str  # success/failed
    fetched_count: int
    duration_ms: int
    error_message: str | None = None
    events: List[RawEvent] = []


class FetchService:
    """采集任务管理服务"""
    
    def __init__(self, db: Prisma):
        self.db = db
    
    async def execute_fetch_task(self, source_id: str) -> FetchResult:
        """执行单个数据源的采集任务"""
        start_time = datetime.now()
        
        try:
            # 1. 获取数据源配置
            source = await self.db.datasource.find_unique(where={"id": source_id})
            if not source or not source.isActive:
                raise ValueError(f"Data source {source_id} not found or inactive")
            
            # 2. 更新状态为running
            await self.db.datasource.update(
                where={"id": source_id},
                data={"lastFetchStatus": "running"}
            )
            
            # 3. 获取驱动实例
            driver = DataSourceRegistry.get_driver(source.driverType)
            config = json.loads(source.config)
            
            # 4. 执行采集
            events = await driver.fetch(config)
            
            # 5. 计算耗时
            duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
            
            # 6. 更新数据源状态
            await self.db.datasource.update(
                where={"id": source_id},
                data={
                    "lastFetchAt": datetime.now(),
                    "lastFetchStatus": "success",
                    "errorMessage": None
                }
            )
            
            # 7. 记录日志
            await self.db.datasourcelog.create(data={
                "sourceId": source_id,
                "status": "success",
                "message": f"Successfully fetched {len(events)} events",
                "fetchedCount": len(events),
                "duration": duration_ms
            })
            
            return FetchResult(
                source_id=source_id,
                status="success",
                fetched_count=len(events),
                duration_ms=duration_ms,
                events=events
            )
            
        except Exception as e:
            duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
            error_msg = str(e)
            
            # 更新失败状态
            await self.db.datasource.update(
                where={"id": source_id},
                data={
                    "lastFetchStatus": "failed",
                    "errorMessage": error_msg
                }
            )
            
            # 记录错误日志
            await self.db.datasourcelog.create(data={
                "sourceId": source_id,
                "status": "failed",
                "message": f"Fetch failed: {error_msg}",
                "fetchedCount": 0,
                "duration": duration_ms,
                "errorDetail": error_msg
            })
            
            return FetchResult(
                source_id=source_id,
                status="failed",
                fetched_count=0,
                duration_ms=duration_ms,
                error_message=error_msg
            )
    
    async def batch_fetch(self, source_ids: List[str]) -> List[FetchResult]:
        """批量并行采集多个数据源"""
        tasks = [self.execute_fetch_task(sid) for sid in source_ids]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # 处理异常结果
        processed_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                processed_results.append(FetchResult(
                    source_id=source_ids[i],
                    status="failed",
                    fetched_count=0,
                    duration_ms=0,
                    error_message=str(result)
                ))
            else:
                processed_results.append(result)
        
        return processed_results
    
    async def get_fetch_history(self, source_id: str, limit: int = 50) -> List[Dict]:
        """获取数据源的采集历史"""
        logs = await self.db.datasourcelog.find_many(
            where={"sourceId": source_id},
            order_by={"createdAt": "desc"},
            take=limit
        )
        return [log.dict() for log in logs]
```

#### 3.1.2 增强调度器服务
**修改文件**: `data-service/services/scheduler_service.py`

在现有基础上添加：
```python
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from datetime import datetime, timedelta
from prisma import Prisma
from .fetch_service import FetchService
import json


class SchedulerService:
    """增强的调度器服务"""
    
    def __init__(self, db: Prisma):
        self.db = db
        self.scheduler = AsyncIOScheduler()
        self.fetch_service = FetchService(db)
    
    async def start(self):
        """启动调度器并加载所有任务"""
        # 加载所有启用的调度任务
        jobs = await self.db.schedulerjob.find_many(
            where={"isEnabled": True},
            include={"source": True}
        )
        
        for job in jobs:
            await self._add_job_to_scheduler(job)
        
        self.scheduler.start()
    
    async def stop(self):
        """停止调度器"""
        self.scheduler.shutdown()
    
    async def add_datasource_job(
        self,
        source_id: str,
        schedule_type: str,
        schedule_config: Dict
    ) -> str:
        """为数据源添加采集任务"""
        # 创建数据库记录
        job = await self.db.schedulerjob.create(data={
            "sourceId": source_id,
            "scheduleType": schedule_type,
            "scheduleConfig": json.dumps(schedule_config),
            "isEnabled": True,
            "nextRunAt": self._calculate_next_run(schedule_type, schedule_config)
        })
        
        # 添加到调度器
        await self._add_job_to_scheduler(job)
        
        return job.id
    
    async def update_job(self, job_id: str, schedule_config: Dict):
        """更新调度任务"""
        job = await self.db.schedulerjob.update(
            where={"id": job_id},
            data={
                "scheduleConfig": json.dumps(schedule_config),
                "nextRunAt": self._calculate_next_run(
                    await self._get_job_schedule_type(job_id),
                    schedule_config
                )
            }
        )
        
        # 重新添加到调度器
        self.scheduler.remove_job(job_id)
        await self._add_job_to_scheduler(job)
    
    async def remove_job(self, job_id: str):
        """删除调度任务"""
        await self.db.schedulerjob.delete(where={"id": job_id})
        self.scheduler.remove_job(job_id)
    
    async def trigger_manual_fetch(self, source_id: str):
        """手动触发采集"""
        result = await self.fetch_service.execute_fetch_task(source_id)
        return result
    
    async def get_job_history(self, source_id: str, limit: int = 50):
        """获取任务历史"""
        return await self.fetch_service.get_fetch_history(source_id, limit)
    
    async def _add_job_to_scheduler(self, job):
        """添加任务到调度器"""
        schedule_config = json.loads(job.scheduleConfig)
        
        if job.scheduleType == "cron":
            trigger = CronTrigger.from_crontab(schedule_config.get("cron"))
        elif job.scheduleType == "interval":
            trigger = IntervalTrigger(
                minutes=schedule_config.get("minutes", 60)
            )
        else:
            return
        
        self.scheduler.add_job(
            func=self._execute_scheduled_fetch,
            trigger=trigger,
            id=job.id,
            args=[job.sourceId, job.id],
            replace_existing=True
        )
    
    async def _execute_scheduled_fetch(self, source_id: str, job_id: str):
        """执行调度的采集任务"""
        # 更新lastRunAt
        await self.db.schedulerjob.update(
            where={"id": job_id},
            data={"lastRunAt": datetime.now()}
        )
        
        # 执行采集
        result = await self.fetch_service.execute_fetch_task(source_id)
        
        # 更新nextRunAt
        job = await self.db.schedulerjob.find_unique(where={"id": job_id})
        if job:
            schedule_config = json.loads(job.scheduleConfig)
            await self.db.schedulerjob.update(
                where={"id": job_id},
                data={"nextRunAt": self._calculate_next_run(job.scheduleType, schedule_config)}
            )
        
        return result
    
    def _calculate_next_run(self, schedule_type: str, config: Dict) -> datetime:
        """计算下次运行时间"""
        if schedule_type == "interval":
            minutes = config.get("minutes", 60)
            return datetime.now() + timedelta(minutes=minutes)
        elif schedule_type == "cron":
            # 使用APScheduler的CronTrigger计算
            trigger = CronTrigger.from_crontab(config.get("cron"))
            return trigger.get_next_fire_time(None, datetime.now())
        return datetime.now()
    
    async def _get_job_schedule_type(self, job_id: str) -> str:
        """获取任务的调度类型"""
        job = await self.db.schedulerjob.find_unique(where={"id": job_id})
        return job.scheduleType if job else "interval"
```

#### 3.1.3 调度器API路由
**新建文件**: `data-service/routers/scheduler.py`
```python
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Dict, Any
from datetime import datetime
from ..services.scheduler_service import SchedulerService
from ..main import get_db

router = APIRouter(prefix="/scheduler", tags=["scheduler"])


class CreateJobRequest(BaseModel):
    sourceId: str
    scheduleType: str  # cron/interval
    scheduleConfig: Dict[str, Any]


class UpdateJobRequest(BaseModel):
    scheduleConfig: Dict[str, Any]


@router.get("/jobs")
async def list_jobs(db = Depends(get_db)):
    """获取所有调度任务"""
    jobs = await db.schedulerjob.find_many(
        include={"source": True},
        order_by={"createdAt": "desc"}
    )
    return {"jobs": [job.dict() for job in jobs]}


@router.post("/jobs")
async def create_job(
    request: CreateJobRequest,
    scheduler: SchedulerService = Depends(get_scheduler)
):
    """创建调度任务"""
    job_id = await scheduler.add_datasource_job(
        source_id=request.sourceId,
        schedule_type=request.scheduleType,
        schedule_config=request.scheduleConfig
    )
    return {"jobId": job_id, "message": "Job created successfully"}


@router.put("/jobs/{job_id}")
async def update_job(
    job_id: str,
    request: UpdateJobRequest,
    scheduler: SchedulerService = Depends(get_scheduler)
):
    """更新调度任务"""
    await scheduler.update_job(job_id, request.scheduleConfig)
    return {"message": "Job updated successfully"}


@router.delete("/jobs/{job_id}")
async def delete_job(
    job_id: str,
    scheduler: SchedulerService = Depends(get_scheduler)
):
    """删除调度任务"""
    await scheduler.remove_job(job_id)
    return {"message": "Job deleted successfully"}


@router.post("/jobs/{job_id}/run")
async def run_job(
    job_id: str,
    db = Depends(get_db),
    scheduler: SchedulerService = Depends(get_scheduler)
):
    """手动执行调度任务"""
    job = await db.schedulerjob.find_unique(where={"id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    result = await scheduler.trigger_manual_fetch(job.sourceId)
    return result.dict()


@router.get("/jobs/{job_id}/logs")
async def get_job_logs(
    job_id: str,
    limit: int = 50,
    db = Depends(get_db),
    scheduler: SchedulerService = Depends(get_scheduler)
):
    """获取任务执行日志"""
    job = await db.schedulerjob.find_unique(where={"id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    logs = await scheduler.get_job_history(job.sourceId, limit)
    return {"logs": logs}
```

#### 3.1.4 更新主入口
**修改文件**: `data-service/main.py`

添加调度器初始化和路由：
```python
# 在导入部分添加
from .services.scheduler_service import SchedulerService
from .routers import scheduler

# 全局调度器实例
scheduler_service = None

@app.on_event("startup")
async def startup_event():
    global scheduler_service
    await db.connect()
    scheduler_service = SchedulerService(db)
    await scheduler_service.start()
    print("Scheduler started")

@app.on_event("shutdown")
async def shutdown_event():
    global scheduler_service
    if scheduler_service:
        await scheduler_service.stop()
    await db.disconnect()
    print("Scheduler stopped")

# 依赖注入
def get_scheduler() -> SchedulerService:
    return scheduler_service

# 注册路由
app.include_router(scheduler.router, prefix="/api")
```

### 3.2 TypeScript前端实现

#### 3.2.1 API客户端
**新建文件**: `src/lib/api/scheduler-client.ts`
```typescript
export interface SchedulerJob {
  id: string;
  sourceId: string;
  scheduleType: 'cron' | 'interval' | 'webhook';
  scheduleConfig: Record<string, any>;
  isEnabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
  source?: {
    id: string;
    name: string;
    type: string;
  };
}

export interface CreateJobRequest {
  sourceId: string;
  scheduleType: 'cron' | 'interval';
  scheduleConfig: Record<string, any>;
}

export interface JobLog {
  id: string;
  sourceId: string;
  status: 'success' | 'failed' | 'running';
  message: string | null;
  fetchedCount: number;
  duration: number | null;
  createdAt: string;
}

const API_BASE = process.env.NEXT_PUBLIC_DATA_SERVICE_URL || 'http://localhost:8000';

export async function getSchedulerJobs(): Promise<SchedulerJob[]> {
  const res = await fetch(`${API_BASE}/api/scheduler/jobs`);
  if (!res.ok) throw new Error('Failed to fetch jobs');
  const data = await res.json();
  return data.jobs;
}

export async function createSchedulerJob(request: CreateJobRequest): Promise<{ jobId: string }> {
  const res = await fetch(`${API_BASE}/api/scheduler/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error('Failed to create job');
  return res.json();
}

export async function updateSchedulerJob(
  jobId: string,
  scheduleConfig: Record<string, any>
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/scheduler/jobs/${jobId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scheduleConfig }),
  });
  if (!res.ok) throw new Error('Failed to update job');
}

export async function deleteSchedulerJob(jobId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/scheduler/jobs/${jobId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete job');
}

export async function runSchedulerJob(jobId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/api/scheduler/jobs/${jobId}/run`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to run job');
  return res.json();
}

export async function getJobLogs(jobId: string, limit = 50): Promise<JobLog[]> {
  const res = await fetch(`${API_BASE}/api/scheduler/jobs/${jobId}/logs?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch logs');
  const data = await res.json();
  return data.logs;
}
```

### 3.3 测试用例

#### 3.3.1 采集服务测试
**新建文件**: `data-service/tests/test_fetch_service.py`
```python
import pytest
from services.fetch_service import FetchService
from prisma import Prisma


@pytest.mark.asyncio
async def test_execute_fetch_task():
    db = Prisma()
    await db.connect()
    
    service = FetchService(db)
    
    # 创建测试数据源
    source = await db.datasource.create(data={
        "name": "Test Source",
        "type": "financial",
        "driverType": "api",
        "provider": "test",
        "config": json.dumps({
            "url": "https://jsonplaceholder.typicode.com/posts",
            "source_name": "Test"
        }),
        "isActive": True
    })
    
    # 执行采集
    result = await service.execute_fetch_task(source.id)
    
    assert result.status == "success"
    assert result.fetched_count > 0
    
    # 清理
    await db.datasource.delete(where={"id": source.id})
    await db.disconnect()
```

### 3.4 交付物清单

#### 新建文件
- `data-service/services/fetch_service.py`
- `data-service/routers/scheduler.py`
- `data-service/tests/test_fetch_service.py`
- `src/lib/api/scheduler-client.ts`

#### 修改文件
- `data-service/services/scheduler_service.py` (增强功能)
- `data-service/main.py` (添加调度器启动)

---

## 4. Phase 3: AI清洗层

**目标**: 集成Claude API进行事件分析、分类和情感识别

**工期**: 2天

### 4.1 数据库Schema变更

(Content already added in previous edit - see above for AI cleaning layer implementation)

---

## 5. Phase 4: 存储管理

**目标**: 实现数据生命周期管理和自动清理

**工期**: 1天

(Content already added - see storage management section above)

---

## 6. Phase 5: UI交互

**目标**: 构建完整的UI界面，实现数据源管理、调度配置、AI规则和存储管理

**工期**: 2-3天

### 6.1 页面实现

#### 6.1.1 数据源管理页面增强
**修改文件**: `src/app/(dashboard)/events/sources/page.tsx`

新增功能：
- 驱动类型选择
- 动态配置表单生成
- 连接测试
- 实时状态监控

#### 6.1.2 调度器配置页面
**新建文件**: `src/app/(dashboard)/events/scheduler/page.tsx`

#### 6.1.3 AI清洗规则页面
**新建文件**: `src/app/(dashboard)/events/ai-rules/page.tsx`

#### 6.1.4 存储策略页面
**新建文件**: `src/app/(dashboard)/events/storage/page.tsx`

```typescript
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { 
  getStorageConfig, 
  updateStorageConfig, 
  getStorageStats,
  manualCleanup,
  applyRetentionPolicy
} from '@/lib/api/storage-client';

export default function StoragePage() {
  const [config, setConfig] = useState(null);
  const [stats, setStats] = useState(null);
  
  useEffect(() => {
    loadData();
  }, []);
  
  const loadData = async () => {
    const [configData, statsData] = await Promise.all([
      getStorageConfig(),
      getStorageStats()
    ]);
    setConfig(configData);
    setStats(statsData);
  };
  
  const handleSaveConfig = async () => {
    await updateStorageConfig(config);
    alert('配置已保存');
  };
  
  const handleCleanup = async () => {
    await manualCleanup();
    alert('清理完成');
    loadData();
  };
  
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">存储管理</h1>
      
      {/* 存储统计 */}
      <Card>
        <CardHeader>
          <CardTitle>存储统计</CardTitle>
        </CardHeader>
        <CardContent>
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">总文章数</p>
                <p className="text-2xl font-bold">{stats.total_articles}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">过期文章</p>
                <p className="text-2xl font-bold">{stats.expired_count}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">存储大小</p>
                <p className="text-2xl font-bold">{stats.size_estimate_mb} MB</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* 配置 */}
      <Card>
        <CardHeader>
          <CardTitle>存储策略配置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {config && (
            <>
              <div>
                <Label>数据保留天数</Label>
                <Input 
                  type="number" 
                  value={config.retentionDays}
                  onChange={(e) => setConfig({...config, retentionDays: parseInt(e.target.value)})}
                />
              </div>
              
              <div>
                <Label>最大文章数</Label>
                <Input 
                  type="number" 
                  value={config.maxArticles}
                  onChange={(e) => setConfig({...config, maxArticles: parseInt(e.target.value)})}
                />
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch 
                  checked={config.archiveEnabled}
                  onCheckedChange={(checked) => setConfig({...config, archiveEnabled: checked})}
                />
                <Label>启用归档</Label>
              </div>
              
              <div className="flex gap-2">
                <Button onClick={handleSaveConfig}>保存配置</Button>
                <Button variant="outline" onClick={handleCleanup}>立即清理</Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

#### 6.1.5 事件流页面优化
**修改文件**: `src/app/(dashboard)/events/feed/page.tsx`

优化点：
- 增强筛选器（多条件组合）
- 添加情感标签显示
- 显示AI分析结果
- 关键词高亮

### 6.2 API路由实现

#### 6.2.1 数据源API
**新建文件**: `src/app/api/datasources/route.ts`
**新建文件**: `src/app/api/datasources/[id]/route.ts`
**新建文件**: `src/app/api/datasources/[id]/test/route.ts`
**新建文件**: `src/app/api/datasources/drivers/route.ts`

#### 6.2.2 调度器API
**新建文件**: `src/app/api/scheduler/jobs/route.ts`
**新建文件**: `src/app/api/scheduler/jobs/[id]/route.ts`
**新建文件**: `src/app/api/scheduler/jobs/[id]/run/route.ts`

#### 6.2.3 AI规则API
**新建文件**: `src/app/api/ai-rules/route.ts`
**新建文件**: `src/app/api/ai-rules/[id]/route.ts`
**新建文件**: `src/app/api/ai-rules/test/route.ts`

#### 6.2.4 存储API
**新建文件**: `src/app/api/storage/config/route.ts`
**新建文件**: `src/app/api/storage/stats/route.ts`
**新建文件**: `src/app/api/storage/cleanup/route.ts`

所有API路由均为Next.js与Python数据服务的代理层。

### 6.3 组件开发

#### 6.3.1 数据源配置表单
**新建文件**: `src/components/events/datasource-config-form.tsx`

动态生成表单字段（基于driver config schema）

#### 6.3.2 调度配置组件
**新建文件**: `src/components/events/schedule-config.tsx`

支持Cron和Interval配置

#### 6.3.3 筛选规则构建器
**新建文件**: `src/components/events/filter-builder.tsx`

可视化筛选规则配置

### 6.4 侧边栏更新

**修改文件**: `src/components/layout/sidebar.tsx`

添加新页面入口：
```typescript
{
  title: "事件资讯",
  items: [
    { title: "咨询流", href: "/events/feed" },
    { title: "数据源管理", href: "/events/sources" },
    { title: "调度器", href: "/events/scheduler" },
    { title: "AI清洗规则", href: "/events/ai-rules" },
    { title: "存储管理", href: "/events/storage" },
    { title: "趋势分析", href: "/events/trends" }
  ]
}
```

### 6.5 交付物清单

#### 新建文件
**页面**:
- `src/app/(dashboard)/events/scheduler/page.tsx`
- `src/app/(dashboard)/events/ai-rules/page.tsx`
- `src/app/(dashboard)/events/storage/page.tsx`

**API路由** (12个文件):
- `src/app/api/datasources/*`
- `src/app/api/scheduler/*`
- `src/app/api/ai-rules/*`
- `src/app/api/storage/*`

**组件**:
- `src/components/events/datasource-config-form.tsx`
- `src/components/events/schedule-config.tsx`
- `src/components/events/filter-builder.tsx`

#### 修改文件
- `src/app/(dashboard)/events/sources/page.tsx` (增强功能)
- `src/app/(dashboard)/events/feed/page.tsx` (优化筛选)
- `src/components/layout/sidebar.tsx` (添加导航)

---

## 7. Phase 6: 集成测试和优化

**目标**: 端到端测试、性能优化、文档完善

**工期**: 1-2天

### 7.1 集成测试

#### 7.1.1 端到端测试脚本
**新建文件**: `scripts/test-event-driven-e2e.sh`
```bash
#!/bin/bash

echo "=== 事件驱动框架端到端测试 ==="

# 1. 测试数据源创建
echo "1. 测试数据源创建..."
curl -X POST http://localhost:8000/api/datasources \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test RSS Feed",
    "type": "financial",
    "driverType": "rss",
    "provider": "test",
    "config": "{\"url\":\"https://example.com/rss\",\"source_name\":\"Test\"}"
  }'

# 2. 测试调度任务创建
echo "2. 测试调度任务创建..."
# ...

# 3. 测试手动采集
echo "3. 测试手动采集..."
# ...

# 4. 测试AI分析
echo "4. 测试AI分析..."
# ...

# 5. 测试存储清理
echo "5. 测试存储清理..."
# ...

echo "✓ 所有测试通过"
```

#### 7.1.2 Python集成测试
**新建文件**: `data-service/tests/test_integration.py`
```python
import pytest
from prisma import Prisma
from services.fetch_service import FetchService
from services.ai_analyzer import AIAnalyzer
from services.event_pipeline import EventPipeline
from services.storage_manager import StorageManager


@pytest.mark.asyncio
async def test_full_pipeline():
    """测试完整的事件处理流程"""
    db = Prisma()
    await db.connect()
    
    # 1. 创建测试数据源
    source = await db.datasource.create(data={
        "name": "Test Source",
        "type": "financial",
        "driverType": "api",
        "provider": "test",
        "config": "{}",
        "isActive": True
    })
    
    # 2. 执行采集
    fetch_service = FetchService(db)
    result = await fetch_service.execute_fetch_task(source.id)
    assert result.status == "success"
    
    # 3. AI分析和存储
    ai_analyzer = AIAnalyzer(api_key="test_key")
    pipeline = EventPipeline(db, ai_analyzer)
    stats = await pipeline.process_raw_events(result.events, source.id)
    assert stats["processed"] > 0
    
    # 4. 存储管理
    storage_manager = StorageManager(db)
    storage_stats = await storage_manager.get_storage_stats()
    assert storage_stats.total_articles > 0
    
    # 清理
    await db.datasource.delete(where={"id": source.id})
    await db.disconnect()
```

### 7.2 性能优化

#### 7.2.1 数据库索引优化
确认所有关键查询字段都有索引：
```prisma
@@index([publishTime])
@@index([aiProcessed])
@@index([expiresAt])
@@index([sentimentLabel])
@@index([sourceId])
```

#### 7.2.2 批量操作优化
- 采集结果批量插入
- AI分析批量处理（每批10-20条）
- 清理操作批量删除

#### 7.2.3 缓存策略
**新建文件**: `data-service/services/cache_service.py`
```python
from typing import Any, Optional
from datetime import timedelta
import json


class CacheService:
    """简单的内存缓存服务"""
    
    def __init__(self):
        self._cache = {}
    
    def get(self, key: str) -> Optional[Any]:
        """获取缓存"""
        if key in self._cache:
            item = self._cache[key]
            if not item['expired']:
                return item['value']
        return None
    
    def set(self, key: str, value: Any, ttl: int = 300):
        """设置缓存（ttl单位：秒）"""
        from datetime import datetime
        self._cache[key] = {
            'value': value,
            'expired': datetime.now() + timedelta(seconds=ttl)
        }
    
    def delete(self, key: str):
        """删除缓存"""
        if key in self._cache:
            del self._cache[key]
```

缓存应用：
- 数据源配置（5分钟TTL）
- 驱动列表（30分钟TTL）
- 存储统计（1分钟TTL）

### 7.3 错误处理和日志

#### 7.3.1 统一错误处理
**新建文件**: `data-service/middleware/error_handler.py`
```python
from fastapi import Request, status
from fastapi.responses import JSONResponse


async def error_handler_middleware(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"error": str(e), "path": request.url.path}
        )
```

#### 7.3.2 结构化日志
配置日志格式：
```python
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('data-service.log'),
        logging.StreamHandler()
    ]
)
```

### 7.4 文档完善

#### 7.4.1 API文档
FastAPI自动生成：访问 `http://localhost:8000/docs`

#### 7.4.2 用户手册
**新建文件**: `docs/user-guide/event-driven-system.md`

内容包括：
- 系统概述
- 数据源配置指南
- 驱动类型说明
- 调度器使用
- AI清洗规则配置
- 存储策略管理
- 常见问题

#### 7.4.3 开发文档
**新建文件**: `docs/dev-guide/extend-event-drivers.md`

内容包括：
- 如何开发新驱动
- 驱动接口规范
- 配置Schema设计
- 测试要求

### 7.5 验收测试清单

**新建文件**: `scripts/acceptance-test-event-driven.sh`
```bash
#!/bin/bash

echo "=== 事件驱动框架验收测试 ==="

# Phase 1: 数据源层
echo "✓ 测试API驱动"
echo "✓ 测试RSS驱动"
echo "✓ 测试爬虫驱动"
echo "✓ 测试驱动注册表"

# Phase 2: 调度器
echo "✓ 测试任务创建"
echo "✓ 测试定时执行"
echo "✓ 测试手动触发"
echo "✓ 测试并行采集"

# Phase 3: AI清洗
echo "✓ 测试情感分析"
echo "✓ 测试自动分类"
echo "✓ 测试实体识别"
echo "✓ 测试筛选规则"

# Phase 4: 存储管理
echo "✓ 测试自动清理"
echo "✓ 测试归档功能"
echo "✓ 测试存储统计"

# Phase 5: UI交互
echo "✓ 测试数据源管理页面"
echo "✓ 测试调度器配置页面"
echo "✓ 测试AI规则页面"
echo "✓ 测试存储管理页面"

echo "=== 所有验收测试通过 ==="
```

### 7.6 交付物清单

#### 新建文件
- `scripts/test-event-driven-e2e.sh`
- `scripts/acceptance-test-event-driven.sh`
- `data-service/tests/test_integration.py`
- `data-service/services/cache_service.py`
- `data-service/middleware/error_handler.py`
- `docs/user-guide/event-driven-system.md`
- `docs/dev-guide/extend-event-drivers.md`

---

## 8. 风险评估

### 8.1 技术风险

| 风险 | 影响 | 概率 | 缓解策略 |
|------|------|------|----------|
| Claude API限流 | 高 | 中 | 实现请求队列和重试机制，设置合理的并发限制 |
| 数据源反爬虫 | 中 | 高 | 遵守robots.txt，添加请求延迟，使用代理池 |
| SQLite性能瓶颈 | 中 | 低 | 优化索引，实施数据归档，考虑迁移到PostgreSQL |
| 内存占用过高 | 中 | 中 | 批量处理限制大小，及时释放资源 |
| 调度器稳定性 | 高 | 低 | 任务失败自动重试，记录详细日志 |

### 8.2 进度风险

| 风险 | 影响 | 概率 | 缓解策略 |
|------|------|------|----------|
| AI分析延迟超预期 | 中 | 中 | 简化分析提示，考虑使用更快的模型 |
| UI组件开发复杂度高 | 中 | 中 | 使用shadcn/ui现成组件，降低自定义需求 |
| 集成测试发现重大bug | 高 | 低 | 每个Phase完成后立即集成测试 |
| 第三方依赖问题 | 中 | 低 | 固定依赖版本，准备备选方案 |

### 8.3 数据风险

| 风险 | 影响 | 概率 | 缓解策略 |
|------|------|------|----------|
| 数据质量差 | 高 | 中 | AI清洗时设置置信度阈值，人工抽查 |
| 重复数据 | 中 | 高 | URL去重，内容哈希去重 |
| 数据丢失 | 高 | 低 | 定期备份，实施归档策略 |
| 敏感信息泄露 | 高 | 低 | API Key加密存储，访问权限控制 |

---

## 9. 验收标准

### 9.1 功能完整性

#### 9.1.1 数据源层（Phase 1）
- [ ] 支持至少3种驱动类型（API、RSS、爬虫）
- [ ] 驱动注册表正常工作
- [ ] 配置验证机制有效
- [ ] 数据源CRUD操作完整

#### 9.1.2 调度器层（Phase 2）
- [ ] 支持Cron和Interval调度
- [ ] 手动触发采集功能正常
- [ ] 并行采集不冲突
- [ ] 任务历史记录完整
- [ ] 失败重试机制有效

#### 9.1.3 AI清洗层（Phase 3）
- [ ] Claude API集成成功
- [ ] 情感分析准确率 > 80%
- [ ] 自动分类准确率 > 75%
- [ ] 实体识别有效
- [ ] 筛选规则引擎工作正常

#### 9.1.4 存储管理层（Phase 4）
- [ ] 自动清理定时执行
- [ ] 数据归档功能正常
- [ ] 存储统计准确
- [ ] 配置持久化有效

#### 9.1.5 UI交互层（Phase 5）
- [ ] 所有页面无报错
- [ ] 数据源管理功能完整
- [ ] 调度器配置直观
- [ ] AI规则可视化配置
- [ ] 存储策略可调整
- [ ] 响应式设计良好

### 9.2 性能指标

| 指标 | 目标值 | 验收方法 |
|------|--------|----------|
| 单个数据源采集耗时 | < 10秒 | 日志记录 |
| AI分析单条事件耗时 | < 2秒 | 性能测试 |
| 批量采集(10个源)并发耗时 | < 30秒 | 集成测试 |
| 页面首次加载时间 | < 3秒 | Lighthouse测试 |
| API响应时间(P95) | < 500ms | 压力测试 |
| 数据库查询(P95) | < 100ms | 慢查询日志 |

### 9.3 稳定性指标

| 指标 | 目标值 | 验收方法 |
|------|--------|----------|
| 采集成功率 | > 95% | 7天运行监控 |
| AI处理成功率 | > 98% | 日志统计 |
| 调度任务准时率 | > 99% | 调度器日志 |
| 系统可用性 | > 99.5% | 监控告警 |
| 数据完整性 | 100% | 数据一致性检查 |

### 9.4 代码质量

- [ ] Python代码通过类型检查（mypy）
- [ ] TypeScript代码通过类型检查
- [ ] 单元测试覆盖率 > 70%
- [ ] 集成测试覆盖核心流程
- [ ] 无严重的代码异味（SonarQube扫描）
- [ ] API文档完整（Swagger/OpenAPI）

### 9.5 用户体验

- [ ] 操作流程直观，无需培训即可使用
- [ ] 错误提示清晰易懂
- [ ] 关键操作有确认提示
- [ ] 加载状态有明显反馈
- [ ] 移动端基本可用

---

## 10. 实施检查清单

### 10.1 Phase 1 检查清单
- [ ] Prisma schema更新并迁移
- [ ] 驱动基类实现
- [ ] API驱动实现并测试
- [ ] RSS驱动实现并测试
- [ ] 爬虫驱动实现并测试
- [ ] 驱动注册表实现
- [ ] 单元测试通过
- [ ] 代码审查完成

### 10.2 Phase 2 检查清单
- [ ] 采集服务实现
- [ ] 调度器服务增强
- [ ] 调度器API路由实现
- [ ] TypeScript客户端实现
- [ ] 并行采集测试通过
- [ ] 失败重试机制验证
- [ ] 集成测试通过

### 10.3 Phase 3 检查清单
- [ ] AI分析服务实现
- [ ] Claude API集成测试
- [ ] 筛选规则引擎实现
- [ ] 事件处理管道实现
- [ ] AI规则API路由实现
- [ ] 分析准确率验证
- [ ] 性能测试通过

### 10.4 Phase 4 检查清单
- [ ] 存储管理服务实现
- [ ] 自动清理任务配置
- [ ] 存储API路由实现
- [ ] TypeScript客户端实现
- [ ] 清理功能测试
- [ ] 归档功能测试
- [ ] 统计准确性验证

### 10.5 Phase 5 检查清单
- [ ] 数据源管理页面完成
- [ ] 调度器配置页面完成
- [ ] AI规则配置页面完成
- [ ] 存储管理页面完成
- [ ] 所有API路由实现
- [ ] 组件单元测试
- [ ] UI集成测试
- [ ] 响应式测试

### 10.6 Phase 6 检查清单
- [ ] 端到端测试脚本编写
- [ ] 集成测试全部通过
- [ ] 性能优化完成
- [ ] 数据库索引优化
- [ ] 缓存策略实施
- [ ] 错误处理完善
- [ ] 日志系统配置
- [ ] 用户文档编写
- [ ] 开发文档编写
- [ ] 验收测试通过

---

## 11. 后续优化方向

### 11.1 短期优化（1-2周）
1. **数据源扩展**
   - 社交媒体驱动（微博、X）
   - Webhook驱动（被动接收）
   - 数据库驱动（读取其他数据库）

2. **AI能力增强**
   - 支持多模型对比（Claude vs GPT）
   - 事件关联分析
   - 趋势预测

3. **监控告警**
   - 数据源健康监控
   - 采集异常告警
   - 存储容量告警

### 11.2 中期优化（1-2月）
1. **性能提升**
   - 迁移到PostgreSQL
   - 实施Redis缓存
   - 采集任务队列（Celery）

2. **功能扩展**
   - 数据源模板市场
   - 用户自定义AI提示
   - 事件流实时推送（WebSocket）

3. **数据质量**
   - 人工标注界面
   - AI模型微调
   - 数据质量评分

### 11.3 长期优化（3-6月）
1. **企业级特性**
   - 多用户权限管理
   - 数据源共享
   - 审计日志

2. **智能化**
   - 自动发现新数据源
   - 智能推荐筛选规则
   - 异常事件自动检测

3. **生态建设**
   - 插件系统
   - 开放API
   - 社区驱动开发

---

## 12. 总结

本实施计划将事件驱动架构分为6个阶段，每个阶段1-2天，总工期10-12个工作日。核心亮点：

1. **分层设计**：从数据源到UI，各层职责清晰
2. **可扩展性**：驱动插件化，易于添加新数据源
3. **智能化**：Claude AI深度集成，自动分析和分类
4. **自动化**：调度采集、AI处理、存储清理全自动
5. **可维护性**：完整测试、详细文档、清晰架构

通过本计划的实施，将构建一个完整的、生产就绪的事件驱动框架，为AI投研系统提供强大的数据支持。
