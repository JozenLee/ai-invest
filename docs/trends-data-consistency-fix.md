# 领域趋势数据一致性修复

## 问题描述

用户报告领域趋势页面存在数据不一致问题：
1. 概览页面筛选最近100条新闻进行分析
2. 点进各个领域的详情页面，新闻数量与筛选数量不对应
3. 底下相关新闻列表的数量也不对应
4. 理论上概览页面和详情页面的数据应该一一对应

## 问题根源

### 原有逻辑

**概览页面** (`analyze_all_domains_lightweight`):
```python
# 获取最近N条新闻
news_list = await self._get_recent_news_with_domains(news_count)

# 从这N条新闻中统计各领域
for domain_config in ETF_DOMAINS:
    filtered_news = [news for news in news_list if domain_code in news['domainIds']]
```

**详情页面** (`analyze_domain_detailed` - 修复前):
```python
# 直接查询该领域的最近N条新闻（不是从同一批数据筛选）
filtered_news = await self._get_news_by_domain(domain_code, news_count)
```

**问题**: 两个页面使用的数据源不同：
- 概览：从最近100条新闻中筛选各领域
- 详情：直接查询该领域的最近N条新闻
- 结果：数据不一致

## 解决方案

### 后端修复

修改 `data-service/services/trend_analysis_service_v2.py` 中的 `analyze_domain_detailed` 方法：

```python
async def analyze_domain_detailed(
    self, domain_code: str, news_count: int = 50, include_ai: bool = False
) -> Optional[Dict[str, Any]]:
    # 1. 获取领域配置
    domain_config = self._get_domain_config(domain_code)
    
    # 2. 获取最近的N条新闻（与概览页面使用相同的数据源）
    all_news = await self._get_recent_news_with_domains(news_count)
    
    # 3. 从这N条新闻中筛选出该领域的新闻
    filtered_news = [
        news for news in all_news
        if domain_code in news.get('domainIds', [])
    ]
    
    # ... 后续处理
```

**关键改动**: 
- 详情页面也先获取最近N条新闻（与概览相同）
- 然后从这N条中筛选该领域的新闻
- 保证两个页面使用完全相同的数据源

### 前端修复

#### 1. 概览页面 (`src/app/(dashboard)/events/trends/page.tsx`)

保存用户选择的新闻数量到localStorage：

```typescript
const handleNewsCountChange = (count: number) => {
  setNewsCount(count)
  // 保存到localStorage，供详情页面使用
  if (typeof window !== 'undefined') {
    localStorage.setItem('trendNewsCount', count.toString())
  }
}
```

#### 2. 详情页面 (`src/app/(dashboard)/events/trends/[domain]/page.tsx`)

从URL参数或localStorage读取newsCount，确保与概览页面一致：

```typescript
export default function TrendDetailPage() {
  const params = useParams()
  const domain = params.domain as string

  // 从URL参数或localStorage读取newsCount
  const searchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
  const urlNewsCount = searchParams.get('newsCount')
  const storedNewsCount = typeof window !== 'undefined' ? localStorage.getItem('trendNewsCount') : null
  const initialNewsCount = urlNewsCount ? parseInt(urlNewsCount) : (storedNewsCount ? parseInt(storedNewsCount) : 50)

  const [newsCount] = useState(initialNewsCount)
  // ...
}
```

#### 3. 趋势卡片组件 (`src/components/trends/DomainTrendCard.tsx`)

确保点击跳转时localStorage已设置：

```typescript
<Link
  href={`/events/trends/${trend.domainCode}`}
  onClick={() => {
    // 确保localStorage已更新（作为备用方案）
    if (typeof window !== 'undefined') {
      const storedCount = localStorage.getItem('trendNewsCount')
      if (!storedCount) {
        const searchParams = new URLSearchParams(window.location.search)
        const newsCount = searchParams.get('newsCount') || '50'
        localStorage.setItem('trendNewsCount', newsCount)
      }
    }
  }}
>
```

## 测试验证

创建测试脚本 `data-service/test_trend_consistency.py` 验证修复效果：

```bash
cd data-service
python3 test_trend_consistency.py
```

测试结果：
```
✅ 成功获取 17 个领域的趋势摘要

测试领域: 半导体 (semiconductor)
  概览页面显示: 44 条新闻
  详情页面显示: 44 条新闻
  ✅ 新闻数量一致
  ✅ 情绪分布一致

测试领域: 人工智能 (ai)
  概览页面显示: 47 条新闻
  详情页面显示: 47 条新闻
  ✅ 新闻数量一致
  ✅ 情绪分布一致

✅ 所有测试通过！概览和详情数据完全一致
```

## 修复效果

### 修复前
- 概览显示"半导体领域：44条新闻"
- 点进详情页可能显示"50条新闻"（因为是独立查询）
- 数据不一致，用户困惑

### 修复后
- 概览显示"半导体领域：44条新闻"
- 点进详情页显示"44条新闻"（从相同的100条中筛选）
- 情绪分布、新闻列表完全一致
- 数据完全对应

## 相关文件

- `data-service/services/trend_analysis_service_v2.py` - 后端趋势分析服务
- `src/app/(dashboard)/events/trends/page.tsx` - 概览页面
- `src/app/(dashboard)/events/trends/[domain]/page.tsx` - 详情页面
- `src/components/trends/DomainTrendCard.tsx` - 趋势卡片组件
- `data-service/test_trend_consistency.py` - 数据一致性测试

## 技术要点

1. **数据源一致性**: 确保概览和详情使用相同的数据集
2. **状态同步**: 使用localStorage在页面间传递用户选择
3. **向后兼容**: 提供默认值（50条），不影响现有功能
4. **完整测试**: 验证新闻数量、情绪分布、新闻列表的一致性

## 注意事项

- newsCount参数需要在概览和详情页面保持一致
- localStorage用于页面间状态传递
- 测试脚本可用于回归测试，确保后续修改不破坏数据一致性
