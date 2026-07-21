# NewsNow API 集成文档

## 概述

已成功集成 NewsNow API 作为新的新闻数据源，提供多平台财经资讯聚合能力。

**集成时间**: 2026-07-22  
**数据源**: https://github.com/ourongxing/newsnow (MIT License)  
**优势**: 
- 避免 TrendRadar 的 GPL-3.0 许可证限制
- 直接访问 NewsNow API，无需额外依赖
- 支持多个主流财经平台的热榜数据

## 技术架构

### 1. Provider 实现

**文件**: `data-service/providers/newsnow_provider.py`

继承 `DataProvider` 基类，实现 `get_news()` 方法：

```python
class NewsNowProvider(DataProvider):
    name = "newsnow"
    BASE_URL = "https://newsnow.busiyi.world/api/s"
    
    async def get_news(self, keyword: str, limit: int, api: str) -> pd.DataFrame:
        # keyword: 平台ID (wallstreetcn-hot, cls-hot等)
        # 返回标准化的 DataFrame
```

### 2. 支持的平台

| 平台ID | 名称 | 类别 | 更新频率 |
|--------|------|------|---------|
| `wallstreetcn-hot` | 华尔街见闻 | 综合财经媒体 | 30分钟 |
| `cls-hot` | 财联社 | 综合财经媒体 | 30分钟 |
| `thepaper` | 澎湃财经 | 综合财经媒体 | 60分钟 |
| `36kr` | 36氪 | 科技创投媒体 | 60分钟 |

### 3. API 响应格式

```json
{
  "status": "success",
  "id": "wallstreetcn-hot",
  "updatedTime": 1784653554945,
  "items": [
    {
      "id": "3777500",
      "title": "新闻标题",
      "url": "https://wallstreetcn.com/articles/3777500"
    }
  ]
}
```

### 4. 数据流

```
NewsNow API
    ↓
NewsNowProvider (标准化为 DataFrame)
    ↓
DataService (通过 Registry 路由)
    ↓
FetchService (定时采集 + AI处理)
    ↓
Prisma Database (NewsArticle表)
    ↓
Next.js API (/api/events/feed)
    ↓
前端展示
```

## 数据源配置

已在数据库中创建以下数据源记录：

```typescript
// prisma/seed.ts
{
  id: 'ds_newsnow_wallstreet',
  name: '华尔街见闻-NewsNow',
  type: 'financial',
  driverType: 'api',
  provider: 'newsnow',
  config: '{"keyword":"wallstreetcn-hot","limit":50}',
  updateFrequency: 30,
  isActive: true,
}
```

## 使用方法

### 1. 直接调用 Provider

```python
from providers.newsnow_provider import NewsNowProvider

provider = NewsNowProvider()
df = await provider.get_news(keyword="wallstreetcn-hot", limit=20)
```

### 2. 通过 DataService

```python
from services.data_service import data_service

data_service.initialize()
df = await data_service.get_news(keyword="cls-hot", limit=30)
```

### 3. 定时采集任务

```python
from services.fetch_service import fetch_service

result = await fetch_service.execute_fetch_task(
    source_id="ds_newsnow_wallstreet",
    source_config={
        "provider": "newsnow",
        "keyword": "wallstreetcn-hot",
        "limit": 50
    }
)
```

## 优先级配置

NewsNow 在新闻类别中优先级最高：

```python
# providers/registry.py
"news": CategoryConfig(
    sources=["newsnow", "akshare", "xueqiu"],  # NewsNow优先
    cache_ttl=300,
),
```

降级策略：
1. 优先尝试 NewsNow
2. NewsNow 失败则使用 AKShare
3. AKShare 失败则使用雪球

## 测试验证

运行测试脚本：

```bash
cd data-service
python3 test_newsnow.py
```

**测试结果**：
- ✅ 华尔街见闻热榜：成功获取数据
- ✅ 财联社热榜：成功获取数据
- ✅ 澎湃财经：成功获取数据
- ✅ DataService 集成：正常工作

## API 限制

### 请求头要求

NewsNow API 需要完整的浏览器请求头，否则返回 403：

```python
headers = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ...",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://newsnow.busiyi.world/",
}
```

### 数据特点

- **仅提供标题**: NewsNow API 只返回新闻标题和链接，无正文
- **热榜数据**: 返回的是各平台的热门/置顶新闻
- **实时性**: 通常 30-60 分钟更新一次
- **无时间戳**: API 不提供发布时间，使用采集时间作为 `publishTime`

## 与 TrendRadar 对比

| 特性 | NewsNow (已集成) | TrendRadar (未集成) |
|------|------------------|-------------------|
| 许可证 | MIT | GPL-3.0 |
| 集成方式 | 直接 API 调用 | 需要部署独立服务 |
| 数据源 | 相同 (都使用 NewsNow API) | 相同 |
| 功能 | 新闻聚合 | 新闻聚合 + AI过滤 |
| 复杂度 | 低 | 高 |
| 维护成本 | 低 | 高 |

**选择 NewsNow 的原因**：
1. MIT 许可证，无传染性
2. 实现简单，直接调用 API
3. 功能满足需求（热榜聚合）
4. AI 处理由系统统一完成，无需依赖外部服务

## 后续优化方向

### 1. 扩展更多平台

NewsNow 支持 30+ 平台，可按需添加：

```python
FINANCIAL_PLATFORMS = {
    "jinse": {"name": "金色财经", "category": "加密货币媒体"},
    "gelonghui": {"name": "格隆汇", "category": "港股资讯"},
    # ... 更多平台
}
```

### 2. 时间戳推断

通过爬取目标页面获取真实发布时间：

```python
async def _fetch_publish_time(self, url: str) -> datetime:
    # 访问原文页面，提取发布时间
    pass
```

### 3. 正文抓取

对于高优先级新闻，可以抓取正文内容：

```python
async def _fetch_content(self, url: str) -> str:
    # 通过 newspaper3k 或 readability 提取正文
    pass
```

### 4. 智能去重

NewsNow 不同平台可能报道相同新闻，需要标题相似度去重：

```python
from difflib import SequenceMatcher

def is_duplicate(title1: str, title2: str) -> bool:
    similarity = SequenceMatcher(None, title1, title2).ratio()
    return similarity > 0.85
```

## 故障排查

### 问题 1: 403 Forbidden

**原因**: 请求头不完整  
**解决**: 确保包含完整的浏览器请求头（见上方"API限制"章节）

### 问题 2: 返回空数据

**原因**: 平台ID错误或API暂时不可用  
**解决**: 
```python
# 检查平台ID是否正确
print(NewsNowProvider.FINANCIAL_PLATFORMS.keys())

# 访问 API 测试
python3 debug_newsnow_api.py
```

### 问题 3: 数据未进入数据库

**原因**: FetchService 未配置或调度器未启动  
**解决**:
```bash
# 检查数据源配置
npx prisma studio

# 手动触发采集
python3 -c "
import asyncio
from services.fetch_service import fetch_service
asyncio.run(fetch_service.execute_fetch_task(
    'ds_newsnow_wallstreet', 
    {'provider': 'newsnow', 'keyword': 'wallstreetcn-hot', 'limit': 50}
))
"
```

## 参考资料

- [NewsNow 项目](https://github.com/ourongxing/newsnow) - MIT License
- [TrendRadar 项目](https://github.com/sansan0/TrendRadar) - GPL-3.0 License  
- [NewsNow API 文档](https://newsnow.busiyi.world/)
