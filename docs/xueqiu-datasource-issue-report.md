# 雪球数据源问题诊断报告

**日期**: 2026-07-21  
**问题**: 雪球数据源显示采集10条数据，处理成功10条，但实际存储0条，导致资讯流页面无数据

---

## 📊 问题现象

### 运行历史显示
- ✅ 采集数量: 10条
- ✅ AI处理成功: 10条
- ❌ 实际存储: 0条
- ❌ 资讯流页面: 无雪球数据

### 数据库状态
```sql
-- 雪球数据源配置存在且已激活
SELECT * FROM DataSource WHERE provider = 'xueqiu';
-- ID: ds_xueqiu, 激活状态: true

-- 但数据库中没有任何雪球新闻
SELECT COUNT(*) FROM NewsArticle WHERE sourceId = 'ds_xueqiu';
-- 结果: 0条
```

---

## 🔍 问题根因分析

### 1. 雪球Provider功能定位错误

**文件**: `data-service/providers/xueqiu_provider.py`

```python
class XueqiuProvider(DataProvider):
    """雪球数据提供者
    
    通过雪球公开 API 获取实时行情数据。
    仅支持实时行情查询，不支持历史数据和资金流向。
    """
```

**问题**:
- ❌ 雪球Provider设计为**行情数据提供者**，不是新闻数据源
- ❌ 没有实现 `get_news()` 方法
- ❌ 只有 `get_index_spot()`, `get_stock_spot()`, `get_etf_realtime()` 等行情方法

### 2. fetch_service硬编码财联社新闻

**文件**: `data-service/services/fetch_service.py:168-189`

```python
async def _fetch_data(self, provider, config: Dict[str, Any]) -> List[Dict]:
    """执行数据采集"""
    try:
        # 目前使用财联社新闻作为示例  ← 硬编码！
        import pandas as pd
        df = await provider.get_news(keyword="财联社", limit=50)
        
        if df.empty:
            return []
        
        # 转换为字典列表
        news_list = []
        for idx, row in df.iterrows():
            news_list.append({
                "title": str(row.get("新闻标题", "")),
                "content": str(row.get("新闻内容", "")),
                "url": str(row.get("新闻链接", "")),
                "publishTime": str(row.get("发布时间", "")),
                "source": "财联社"  # ← 硬编码财联社
            })
        
        return news_list
```

**问题**:
- ❌ 无论触发哪个数据源，都采集财联社新闻
- ❌ 没有根据 `source_id` 或 `config` 动态选择数据源
- ❌ 雪球数据源实际采集的是财联社新闻

### 3. 数据被URL去重过滤

**文件**: `data-service/services/fetch_service.py:417-422`

```python
# 检查是否已存在（根据URL去重）
if article_data["url"]:
    exists = await db.check_article_exists(article_data["url"])
    if exists:
        logger.debug(f"文章已存在，跳过: {article_data['url']}")
        continue  # ← 跳过插入
```

**问题**:
- ✅ 去重逻辑本身正确
- ❌ 但雪球采集的财联社新闻URL已存在于数据库
- ❌ 导致所有10条数据都被跳过
- ❌ 最终 `stored_count = 0`

---

## 🎯 问题链路图

```
用户触发雪球数据源采集
    ↓
fetch_service.execute_fetch_task(source_id='ds_xueqiu')
    ↓
_fetch_data() 硬编码调用 get_news(keyword="财联社")
    ↓
采集到10条财联社新闻（不是雪球新闻）
    ↓
AI处理成功10条
    ↓
_store_to_database() 尝试存储
    ↓
每条数据的URL都已存在（之前财联社数据源采集过）
    ↓
全部被 check_article_exists() 过滤
    ↓
stored_count = 0
    ↓
数据库无记录 → 资讯流页面无数据
```

---

## ✅ 解决方案

### 方案1: 实现雪球新闻采集（推荐）

如果雪球确实有新闻/帖子数据需要采集：

1. **扩展 XueqiuProvider**
```python
# data-service/providers/xueqiu_provider.py

async def get_news(self, keyword: str = "", limit: int = 50) -> pd.DataFrame:
    """获取雪球热门帖子/新闻
    
    Args:
        keyword: 搜索关键词
        limit: 返回数量
    """
    cookies = await self._ensure_cookie()
    
    # 雪球热门API
    url = f"{XUEQIU_BASE}/statuses/hot/listV2.json"
    params = {
        "category": -1,
        "count": limit,
        "_": int(time.time() * 1000)
    }
    
    async with httpx.AsyncClient(
        timeout=15,
        headers=XUEQIU_HEADERS,
        cookies=cookies
    ) as client:
        resp = await client.get(url, params=params)
    
    if resp.status_code != 200:
        raise Exception(f"雪球API错误: {resp.status_code}")
    
    data = resp.json()
    items = data.get("list", [])
    
    records = []
    for item in items:
        records.append({
            "新闻标题": item.get("title", item.get("text", ""))[:100],
            "新闻内容": item.get("text", ""),
            "新闻链接": f"https://xueqiu.com{item.get('target', '')}",
            "发布时间": datetime.fromtimestamp(item.get("created_at", 0) / 1000).strftime("%Y-%m-%d %H:%M:%S"),
            "来源": "雪球"
        })
    
    return pd.DataFrame(records)
```

2. **修复 fetch_service 动态路由**
```python
# data-service/services/fetch_service.py

async def _get_provider(self, driver_type: str, config: Dict[str, Any]):
    """根据驱动类型获取对应的 Provider"""
    provider_name = config.get("provider", "akshare")
    
    if provider_name == "xueqiu":
        from providers.xueqiu_provider import XueqiuProvider
        return XueqiuProvider()
    elif provider_name == "akshare":
        from services.data_service import data_service
        return data_service
    else:
        raise ValueError(f"未知的provider: {provider_name}")

async def _fetch_data(self, provider, config: Dict[str, Any]) -> List[Dict]:
    """执行数据采集"""
    try:
        # 动态使用配置中的关键词和限制
        keyword = config.get("keywords", [""])[0] if config.get("keywords") else ""
        limit = config.get("limit", 50)
        
        df = await provider.get_news(keyword=keyword, limit=limit)
        
        if df.empty:
            return []
        
        # 转换为字典列表
        news_list = []
        for idx, row in df.iterrows():
            news_list.append({
                "title": str(row.get("新闻标题", "")),
                "content": str(row.get("新闻内容", "")),
                "url": str(row.get("新闻链接", "")),
                "publishTime": str(row.get("发布时间", "")),
                "source": str(row.get("来源", "未知"))  # 动态获取来源
            })
        
        return news_list
```

3. **更新数据源配置**
```json
{
  "provider": "xueqiu",
  "keywords": ["AI算力", "新能源"],
  "limit": 100
}
```

### 方案2: 禁用雪球新闻采集（临时方案）

如果雪球主要用于行情数据，不需要新闻：

```sql
-- 禁用雪球数据源的新闻采集
UPDATE DataSource 
SET isActive = 0, 
    type = 'market_data'  -- 标记为行情数据源
WHERE id = 'ds_xueqiu';
```

**同时修改数据源分类**：
- 将雪球移到"行情数据"分类
- 不在"新闻数据源"中展示

### 方案3: 重新定位雪球数据源

将雪球定位为**补充行情源**，而不是新闻源：

1. 修改数据源类型：`social` → `market_data`
2. 更新前端UI，区分"新闻源"和"行情源"
3. 雪球只用于实时行情查询，不参与定时新闻采集

---

## 🔧 立即修复步骤（推荐方案1）

### 1. 实现雪球新闻采集
```bash
# 编辑文件
vim data-service/providers/xueqiu_provider.py
# 添加 get_news() 方法（见上文代码）
```

### 2. 修复fetch_service
```bash
vim data-service/services/fetch_service.py
# 修改 _get_provider() 和 _fetch_data()（见上文代码）
```

### 3. 更新数据源配置
```bash
# 在数据库中更新配置
npm run db:studio

# 或通过SQL
sqlite3 prisma/dev.db
UPDATE DataSource 
SET config = '{"provider":"xueqiu","keywords":["AI算力","新能源"],"limit":100}'
WHERE id = 'ds_xueqiu';
```

### 4. 重启服务并测试
```bash
# 重启data-service
cd data-service
python main.py

# 触发立即采集
curl -X POST http://localhost:8000/api/datasources/ds_xueqiu/fetch

# 检查结果
npm run dev
# 访问资讯流页面，筛选雪球数据源
```

---

## 📈 预期效果

修复后：
- ✅ 雪球数据源采集真正的雪球热门内容
- ✅ 不再与财联社新闻冲突
- ✅ `stored_count > 0`
- ✅ 资讯流页面可以看到雪球数据
- ✅ 可以按"雪球"数据源筛选

---

## 🚀 后续优化建议

1. **Provider注册机制**
   - 实现 ProviderRegistry，避免硬编码
   - 支持动态加载和注册Provider

2. **数据源配置验证**
   - 创建数据源时验证Provider是否支持该类型
   - 行情Provider不允许配置为新闻源

3. **监控和告警**
   - 当 `stored_count = 0` 时发送告警
   - 区分"无新数据"和"存储失败"

4. **日志增强**
   - 记录每条数据被过滤的原因
   - 区分"URL重复"、"数据格式错误"等不同情况

---

## 📝 总结

**问题本质**: 系统架构设计与实际实现不匹配
- 雪球Provider定位为行情源，但被配置为新闻源
- fetch_service硬编码导致所有数据源都采集财联社新闻
- URL去重机制正常工作，但暴露了上游数据源混乱的问题

**关键教训**:
1. Provider的功能边界要明确
2. 数据源配置要与Provider能力匹配
3. 日志要记录关键决策点（如"为什么跳过"）
4. 监控要覆盖端到端指标（不只是中间状态）
