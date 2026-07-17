# 市场数据优化实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 优化AI投资分析系统的市场数据展示，包括北向资金降级策略、指数显示完善和新闻数据源页面重构。

**Architecture:** 采用分层架构，后端（Python FastAPI）负责数据获取和降级策略，前端（Next.js）负责数据展示和用户交互。通过缓存机制和智能降级确保数据可用性。

**Tech Stack:** Next.js 16, React 19, TypeScript, FastAPI, AKShare, Tailwind CSS, shadcn/ui

## Global Constraints

- 所有数据展示需考虑非交易时段的降级处理
- 北向资金数据需标记数据新鲜度（实时/历史）
- 指数显示需支持响应式布局
- 数据源页面仅展示新闻相关数据源
- 代码需遵循现有项目的命名规范和代码风格

---

## Task 1: 北向资金数据降级优化

**Files:**
- Modify: `data-service/services/akshare_client.py:391-549`
- Modify: `data-service/routers/capital_flow.py:138-164`
- Modify: `src/app/(dashboard)/dashboard/page.tsx:240-264`

**Interfaces:**
- Consumes: `akshare_client.get_northbound_flow()` 返回 Dict
- Produces: 北向资金数据包含 `stale` 和 `dataDate` 字段

- [ ] **Step 1: 优化 akshare_client.py 的降级逻辑**

修改 `get_northbound_flow()` 方法，确保当汇总数据为0时，优先从历史数据获取最近交易日的有效数据：

```python
def get_northbound_flow(self) -> Dict:
    """获取北向资金流向（单位：亿元）

    降级策略：
    1. 东方财富 stock_hsgt_fund_flow_summary_em()
    2. 东方财富 stock_hsgt_hist_em() (历史数据取最新)
    3. 返回缓存数据
    """
    cache_key = "northbound_flow"

    # 尝试东方财富汇总接口
    try:
        df = self._retry_call(ak.stock_hsgt_fund_flow_summary_em)
        if not df.empty:
            # 打印列名和数据以便调试
            print(f"北向资金汇总列名: {list(df.columns)}")
            print(f"北向资金汇总数据前3行:\n{df.head(3).to_string()}")

            # 尝试多种匹配方式
            northbound = None
            for col_name in ['资金方向', '类型', '方向']:
                if col_name in df.columns:
                    for keyword in ['北向', '北上', '沪港通', '陆股通']:
                        matched = df[df[col_name].str.contains(keyword, na=False)]
                        if not matched.empty:
                            northbound = matched
                            print(f"北向资金通过 '{col_name}' 匹配 '{keyword}' 成功")
                            break
                if northbound is not None:
                    break

            if northbound is not None and not northbound.empty:
                # 查找净买额列（优先资金净流入，再成交净买额）
                net_col = None
                for col in ['资金净流入', '成交净买额', '净买额', '当日净买入', '净流入']:
                    if col in northbound.columns:
                        net_col = col
                        break

                if net_col:
                    total_net = northbound[net_col].sum()
                    # AKShare返回单位为亿元，直接使用
                    value_yi = float(total_net) if pd.notna(total_net) else 0

                    # 如果汇总数据为0，尝试从历史数据获取最近交易日的有效数据
                    if value_yi == 0:
                        print("北向资金汇总数据为0，尝试从历史数据获取最近交易日收盘数据")
                        try:
                            sh_hist = self._retry_call(ak.stock_hsgt_hist_em, symbol="沪股通")
                            sz_hist = self._retry_call(ak.stock_hsgt_hist_em, symbol="深股通")
                            net_col_names = ['当日成交净买额', '当日净买入', '净流入', '成交净买额']
                            sh_val, sh_date = self._find_latest_valid_in_hist(sh_hist, net_col_names)
                            sz_val, sz_date = self._find_latest_valid_in_hist(sz_hist, net_col_names)
                            if sh_val != 0 or sz_val != 0:
                                data_date = sh_date or sz_date or str(northbound.iloc[0].get('交易日', datetime.now().strftime("%Y-%m-%d")))
                                data = {
                                    "date": data_date,
                                    "value": sh_val + sz_val,
                                    "shConnect": sh_val,
                                    "szConnect": sz_val,
                                    "source": "hsgt_hist",
                                    "unit": "亿元",
                                    "stale": True
                                }
                                self._set(cache_key, data, memory_ttl=600)
                                return data
                        except Exception as hist_e:
                            print(f"北向资金历史降级也失败: {hist_e}")

                    # 如果汇总数据有效（非0），尝试获取沪股通/深股通拆分并返回
                    if value_yi != 0:
                        sh_net = 0.0
                        sz_net = 0.0
                        for _, row in northbound.iterrows():
                            direction = str(row.get('资金方向', '')) + str(row.get('类型', ''))
                            net_val = float(row.get(net_col, 0)) if pd.notna(row.get(net_col, 0)) else 0
                            if '沪' in direction:
                                sh_net = net_val
                            elif '深' in direction:
                                sz_net = net_val

                        data = {
                            "date": str(northbound.iloc[0].get('交易日', datetime.now().strftime("%Y-%m-%d"))),
                            "value": value_yi,
                            "shConnect": sh_net,
                            "szConnect": sz_net,
                            "source": "hsgt_summary",
                            "unit": "亿元"
                        }
                        self._set(cache_key, data, memory_ttl=600)
                        return data

                    # 汇总数据和历史数据都为0，继续降级到下一个try块
                    print("北向资金汇总和历史数据都为0，继续降级")

            print("北向资金汇总接口未匹配到北向数据，尝试历史接口")
    except Exception as e:
        print(f"北向资金汇总接口失败: {e}")

    # 降级：从历史数据获取最新有效值（搜索更广范围）
    try:
        sh_df = self._retry_call(ak.stock_hsgt_hist_em, symbol="沪股通")
        sz_df = self._retry_call(ak.stock_hsgt_hist_em, symbol="深股通")

        sh_net = 0.0
        sz_net = 0.0
        date_str = datetime.now().strftime("%Y-%m-%d")

        # 查找净流入列名
        net_col_names = ['当日成交净买额', '当日净买入', '净流入', '成交净买额']

        def find_latest_valid(df, col_names, label):
            """从DataFrame中查找最近的有效数据"""
            if df.empty:
                return 0.0, None
            for col in col_names:
                if col in df.columns:
                    # 搜索最近60行（约2个月交易日）
                    for idx in range(len(df) - 1, max(len(df) - 60, -1), -1):
                        val = df.iloc[idx][col]
                        if pd.notna(val) and float(val) != 0:
                            date_val = str(df.iloc[idx].get('日期', ''))
                            print(f"{label}历史数据: {col}={float(val)} (日期: {date_val}, 行{idx})")
                            return float(val), date_val
            return 0.0, None

        sh_net, sh_date = find_latest_valid(sh_df, net_col_names, "沪股通")
        sz_net, sz_date = find_latest_valid(sz_df, net_col_names, "深股通")

        # 使用最新的有效日期
        if sh_date or sz_date:
            date_str = sh_date or sz_date

        total = sh_net + sz_net
        if total != 0:
            data = {
                "date": date_str,
                "value": total,
                "shConnect": sh_net,
                "szConnect": sz_net,
                "source": "hsgt_hist_fallback",
                "unit": "亿元",
                "stale": True  # 标记为历史数据
            }
            self._set(cache_key, data, memory_ttl=600)
            return data
        else:
            print("北向资金历史数据60行内全部为NaN/0")
    except Exception as e:
        print(f"北向资金历史接口也失败: {e}")

    # 降级：返回文件缓存（最可靠的长期存储）
    cached = self._get(cache_key)
    if cached:
        print(f"使用缓存的北向资金数据: date={cached.get('date')}, value={cached.get('value')}")
        cached["stale"] = True
        return cached

    return {}
```

- [ ] **Step 2: 更新 capital_flow.py 路由**

确保路由正确传递 `stale` 和 `dataDate` 字段：

```python
@router.get("/northbound")
async def get_northbound_flow():
    """获取北向资金流向（单位：亿元）"""
    try:
        data = await asyncio.to_thread(client.get_northbound_flow)

        if not data:
            return {
                "success": False,
                "error": "无法获取北向资金数据",
                "data": None
            }

        # value 已经是亿元单位（在 akshare_client 中处理好了）
        return {
            "success": True,
            "data": {
                "date": str(data.get("date", datetime.now().strftime("%Y-%m-%d"))),
                "northboundNet": round(float(data.get("value", 0)), 2),
                "shConnect": round(float(data.get("shConnect", 0)), 2),
                "szConnect": round(float(data.get("szConnect", 0)), 2),
                "stale": data.get("stale", False),
                "dataDate": str(data.get("date", "")),
                "source": data.get("source", "unknown"),
                "timestamp": datetime.now().isoformat()
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

- [ ] **Step 3: 更新前端显示**

修改 `dashboard/page.tsx` 中的北向资金卡片，显示数据新鲜度提示：

```tsx
{/* 北向资金 */}
<Card className="hover:shadow-md transition-shadow">
  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
    <CardTitle className="text-sm font-medium">北向资金</CardTitle>
    <div className="flex items-center gap-1">
      <Globe className="h-4 w-4 text-muted-foreground" />
      <InfoButton tooltip="northbound" />
    </div>
  </CardHeader>
  <CardContent>
    <div className={`text-2xl font-bold ${getChangeColor(capitalFlow.northbound?.net || 0)}`}>
      {(capitalFlow.northbound?.net || 0) >= 0 ? '+' : ''}{formatNumber(capitalFlow.northbound?.net || 0)}亿
    </div>
    <p className="text-xs text-muted-foreground">
      沪股通 {formatNumber(capitalFlow.northbound?.shConnect || 0)}亿 · 深股通 {formatNumber(capitalFlow.northbound?.szConnect || 0)}亿
    </p>
    {capitalFlow.northbound?.stale && (
      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
        <Clock className="h-3 w-3" />
        {capitalFlow.northbound.dataDate || '上一交易日'}收盘数据
      </p>
    )}
  </CardContent>
</Card>
```

- [ ] **Step 4: 测试降级逻辑**

启动数据服务，测试非交易时段的降级行为：

```bash
cd data-service
python main.py
```

在另一个终端测试API：

```bash
curl http://localhost:8000/api/capital-flow/northbound
```

验证返回数据包含 `stale: true` 和正确的 `dataDate`。

- [ ] **Step 5: 提交代码**

```bash
git add data-service/services/akshare_client.py data-service/routers/capital_flow.py src/app/(dashboard)/dashboard/page.tsx
git commit -m "feat: 优化北向资金数据降级策略，非交易时段显示历史数据"
```

---

## Task 2: 指数显示优化

**Files:**
- Verify: `src/app/api/market/overview/route.ts:11`
- Verify: `src/app/(dashboard)/dashboard/page.tsx:163-196`
- Verify: `src/hooks/useMarketData.ts:70-83`

**Interfaces:**
- Consumes: `/api/market/overview` 返回指数数据数组
- Produces: 5个指数的显示（上证指数、深证成指、创业板指、科创50、沪深300）

- [ ] **Step 1: 验证指数配置**

检查 `src/app/api/market/overview/route.ts` 中的 `INDEX_CODES` 配置：

```typescript
// 主要指数配置（Yahoo Finance 格式）
const INDEX_CODES = ['sh000001', 'sz399001', 'sz399006', 'sh000688', 'sh000300']
```

确认包含：
- `sh000001` - 上证指数
- `sz399001` - 深证成指
- `sz399006` - 创业板指
- `sh000688` - 科创50
- `sh000300` - 沪深300

- [ ] **Step 2: 验证数据获取逻辑**

检查 `src/hooks/useMarketData.ts` 中的数据获取逻辑，确保正确处理指数数据：

```typescript
// 处理指数数据
if (overviewRes.ok) {
  const overviewData = await overviewRes.json()
  if (overviewData.success && overviewData.data?.indices) {
    setIndices(overviewData.data.indices)
    setSource(overviewData.source || 'unknown')
  } else {
    setIndices([])
    if (overviewData.error) {
      setError(overviewData.error)
    }
  }
} else {
  setIndices([])
}
```

- [ ] **Step 3: 验证前端显示**

检查 `src/app/(dashboard)/dashboard/page.tsx` 中的指数显示逻辑：

```tsx
{/* 第一区域：市场指数概览 */}
<section>
  <div className="flex items-center gap-2 mb-4">
    <h2 className="text-lg font-semibold">📊 市场指数</h2>
    <InfoButton tooltip="indexPrice" />
  </div>
  {indices.length > 0 ? (
    <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
      {indices.map((index) => (
        <Card key={index.code} className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{index.name}</CardTitle>
            {index.changePct >= 0 ? (
              <TrendingUp className="h-4 w-4 text-red-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-green-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(index.price)}</div>
            <p className={`text-xs ${getChangeColor(index.changePct)}`}>
              {getChangeSymbol(index.changePct)} {formatNumber(Math.abs(index.changePct))}%
              ({formatNumber(Math.abs(index.change))})
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  ) : (
    <Card>
      <CardContent className="flex items-center justify-center py-8">
        <div className="text-center text-muted-foreground">
          <AlertCircle className="h-8 w-8 mx-auto mb-2" />
          <p>暂无指数数据</p>
          <p className="text-xs mt-1">请确认数据服务已启动</p>
        </div>
      </CardContent>
    </Card>
  )}
</section>
```

- [ ] **Step 4: 测试指数显示**

启动开发服务器，访问仪表盘页面：

```bash
npm run dev
```

访问 `http://localhost:3000/dashboard`，验证：
1. 显示5个指数卡片
2. 每个指数显示名称、价格、涨跌幅
3. 响应式布局正常（移动端2列，桌面端5列）

- [ ] **Step 5: 提交代码**

如果配置正确，无需提交。如果发现并修复了问题：

```bash
git add src/app/api/market/overview/route.ts src/app/(dashboard)/dashboard/page.tsx src/hooks/useMarketData.ts
git commit -m "fix: 确保仪表盘显示5个主要指数"
```

---

## Task 3: 数据源页面重构

**Files:**
- Modify: `src/app/api/datasources/route.ts`
- Modify: `src/app/(dashboard)/events/sources/page.tsx`

**Interfaces:**
- Consumes: `/api/datasources` 返回新闻数据源列表
- Produces: 新闻数据源分类展示页面

- [ ] **Step 1: 重新设计数据源配置**

修改 `src/app/api/datasources/route.ts`，仅保留新闻数据源：

```typescript
import { NextResponse } from 'next/server'

// 新闻数据源配置
const NEWS_DATA_SOURCES = [
  // 综合财经媒体
  {
    id: 'cls_news',
    name: '财联社',
    description: '实时财经新闻资讯，覆盖A股、港股、美股市场动态',
    category: '综合财经媒体',
    provider: '财联社',
    website: 'https://www.cls.cn',
    updateFrequency: '实时',
    coverage: ['A股', '港股', '美股', '宏观经济'],
    dataQuality: 'high',
    status: 'active',
  },
  {
    id: 'eastmoney_news',
    name: '东方财富',
    description: '全面的财经资讯平台，提供股票、基金、债券等市场信息',
    category: '综合财经媒体',
    provider: '东方财富',
    website: 'https://www.eastmoney.com',
    updateFrequency: '实时',
    coverage: ['A股', '基金', '债券', '期货'],
    dataQuality: 'high',
    status: 'active',
  },
  {
    id: 'sina_finance',
    name: '新浪财经',
    description: '权威财经新闻门户，覆盖国内外金融市场',
    category: '综合财经媒体',
    provider: '新浪财经',
    website: 'https://finance.sina.com.cn',
    updateFrequency: '实时',
    coverage: ['A股', '港股', '美股', '宏观经济'],
    dataQuality: 'high',
    status: 'active',
  },

  // 行业专业媒体
  {
    id: 'semi_insight',
    name: '半导体行业观察',
    description: '专注于半导体、芯片产业的深度分析和新闻报道',
    category: '行业专业媒体',
    provider: '半导体行业观察',
    website: 'https://www.semiinsights.com',
    updateFrequency: '每日',
    coverage: ['半导体', '芯片', 'GPU', 'AI芯片'],
    dataQuality: 'high',
    status: 'active',
  },
  {
    id: 'optic_comm',
    name: '光通信之家',
    description: '光通信、光模块行业专业资讯平台',
    category: '行业专业媒体',
    provider: '光通信之家',
    website: 'https://www.ofweek.com',
    updateFrequency: '每日',
    coverage: ['光模块', '光通信', 'CPO', '光纤'],
    dataQuality: 'medium',
    status: 'active',
  },
  {
    id: 'datacenter_world',
    name: '数据中心世界',
    description: '数据中心、云计算、算力基础设施行业资讯',
    category: '行业专业媒体',
    provider: '数据中心世界',
    website: 'https://www.datacenterdynamics.com',
    updateFrequency: '每日',
    coverage: ['数据中心', '云计算', '算力', '服务器'],
    dataQuality: 'medium',
    status: 'active',
  },

  // 政策与监管
  {
    id: 'csrc_announcement',
    name: '证监会公告',
    description: '中国证券监督管理委员会官方公告和政策发布',
    category: '政策与监管',
    provider: '中国证监会',
    website: 'http://www.csrc.gov.cn',
    updateFrequency: '不定期',
    coverage: ['证券市场', '监管政策', 'IPO', '再融资'],
    dataQuality: 'high',
    status: 'active',
  },
  {
    id: 'miit_policy',
    name: '工信部政策',
    description: '工业和信息化部政策文件，涉及半导体、人工智能等产业政策',
    category: '政策与监管',
    provider: '工业和信息化部',
    website: 'https://www.miit.gov.cn',
    updateFrequency: '不定期',
    coverage: ['产业政策', '半导体', '人工智能', '新能源'],
    dataQuality: 'high',
    status: 'active',
  },

  // 国际视角
  {
    id: 'bloomberg',
    name: 'Bloomberg',
    description: '全球领先的商业、金融信息和新闻资讯提供商',
    category: '国际视角',
    provider: '彭博社',
    website: 'https://www.bloomberg.com',
    updateFrequency: '实时',
    coverage: ['全球市场', '宏观经济', '科技', '金融'],
    dataQuality: 'high',
    status: 'active',
  },
  {
    id: 'reuters',
    name: 'Reuters',
    description: '国际新闻机构，提供全球商业、金融、政治和科技新闻',
    category: '国际视角',
    provider: '路透社',
    website: 'https://www.reuters.com',
    updateFrequency: '实时',
    coverage: ['全球市场', '宏观经济', '政治', '科技'],
    dataQuality: 'high',
    status: 'active',
  },
]

export async function GET() {
  const categories = [...new Set(NEWS_DATA_SOURCES.map(s => s.category))]

  return NextResponse.json({
    success: true,
    data: {
      sources: NEWS_DATA_SOURCES,
      categories: categories,
      total: NEWS_DATA_SOURCES.length,
      activeCount: NEWS_DATA_SOURCES.filter(s => s.status === 'active').length,
    },
  })
}
```

- [ ] **Step 2: 重新设计数据源页面**

修改 `src/app/(dashboard)/events/sources/page.tsx`，优化页面布局：

```tsx
'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Newspaper,
  Globe,
  Building2,
  Scale,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Info,
  ExternalLink,
  Zap,
} from 'lucide-react'

interface NewsDataSource {
  id: string
  name: string
  description: string
  category: string
  provider: string
  website: string
  updateFrequency: string
  coverage: string[]
  dataQuality: string
  status: string
}

interface DataSourceResponse {
  sources: NewsDataSource[]
  categories: string[]
  total: number
  activeCount: number
}

const categoryIcons: Record<string, React.ReactNode> = {
  '综合财经媒体': <Newspaper className="h-5 w-5" />,
  '行业专业媒体': <Building2 className="h-5 w-5" />,
  '政策与监管': <Scale className="h-5 w-5" />,
  '国际视角': <Globe className="h-5 w-5" />,
}

const categoryColors: Record<string, string> = {
  '综合财经媒体': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  '行业专业媒体': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  '政策与监管': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  '国际视角': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
}

const qualityConfig: Record<string, { label: string; color: string }> = {
  high: { label: '高质量', color: 'text-green-600' },
  medium: { label: '中等质量', color: 'text-yellow-600' },
  low: { label: '低质量', color: 'text-red-600' },
}

export default function DataSourcesPage() {
  const [data, setData] = useState<DataSourceResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  const fetchDataSources = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/datasources')
      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          setData(result.data)
        }
      }
    } catch (error) {
      console.error('获取数据源信息失败:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchDataSources()
  }, [])

  const filteredSources = selectedCategory
    ? data?.sources.filter(s => s.category === selectedCategory)
    : data?.sources

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* 页面标题 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">新闻数据源</h1>
            <p className="text-muted-foreground mt-1">
              管理和查看新闻资讯数据来源
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchDataSources}
            disabled={isLoading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        </div>

        {/* 统计卡片 */}
        {data && (
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Newspaper className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{data.total}</p>
                    <p className="text-xs text-muted-foreground">数据源总数</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-600">{data.activeCount}</p>
                    <p className="text-xs text-muted-foreground">运行中</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                    <Globe className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{data.categories.length}</p>
                    <p className="text-xs text-muted-foreground">数据类别</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                    <Zap className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">实时</p>
                    <p className="text-xs text-muted-foreground">数据更新</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 分类筛选 */}
        {data && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant={selectedCategory === null ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory(null)}
            >
              全部
            </Button>
            {data.categories.map((category) => (
              <Button
                key={category}
                variant={selectedCategory === category ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedCategory(category)}
              >
                {categoryIcons[category]}<span className="ml-1">{category}</span>
              </Button>
            ))}
          </div>
        )}

        {/* 数据源列表 */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredSources && filteredSources.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredSources.map((source) => {
              const quality = qualityConfig[source.dataQuality] || qualityConfig.medium
              return (
                <Card key={source.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`p-2 rounded-lg ${categoryColors[source.category] || 'bg-gray-100'}`}>
                          {categoryIcons[source.category] || <Newspaper className="h-5 w-5" />}
                        </div>
                        <div>
                          <CardTitle className="text-base">{source.name}</CardTitle>
                          <p className="text-xs text-muted-foreground">{source.provider}</p>
                        </div>
                      </div>
                      <div className={`flex items-center gap-1 ${quality.color}`}>
                        <span className="text-xs font-medium">{quality.label}</span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">{source.description}</p>

                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{source.category}</Badge>
                      <Badge variant="outline">
                        <Zap className="h-3 w-3 mr-1" />
                        {source.updateFrequency}
                      </Badge>
                    </div>

                    <div className="pt-2 border-t">
                      <p className="text-xs text-muted-foreground mb-1">覆盖领域：</p>
                      <div className="flex flex-wrap gap-1">
                        {source.coverage.map((item, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {item}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="pt-2 border-t">
                      <a
                        href={source.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        访问官网
                      </a>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">暂无数据源信息</p>
            </CardContent>
          </Card>
        )}

        {/* 说明卡片 */}
        <Card className="bg-muted/50">
          <CardContent className="p-6">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div className="space-y-2">
                <h3 className="font-semibold">关于新闻数据源</h3>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• <strong>综合财经媒体</strong> 提供全面的市场新闻和财经资讯</li>
                  <li>• <strong>行业专业媒体</strong> 专注于特定行业的深度分析和报道</li>
                  <li>• <strong>政策与监管</strong> 发布官方政策文件和监管动态</li>
                  <li>• <strong>国际视角</strong> 提供全球市场的新闻和分析</li>
                  <li>• 所有数据仅供参考，不构成投资建议</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  )
}
```

- [ ] **Step 3: 测试数据源页面**

启动开发服务器，访问数据源页面：

```bash
npm run dev
```

访问 `http://localhost:3000/events/sources`，验证：
1. 页面标题显示"新闻数据源"
2. 统计卡片显示正确的数据源数量
3. 分类筛选按钮正常工作
4. 数据源卡片显示完整信息
5. 点击"访问官网"链接能正确跳转

- [ ] **Step 4: 提交代码**

```bash
git add src/app/api/datasources/route.ts src/app/(dashboard)/events/sources/page.tsx
git commit -m "feat: 重构数据源页面，仅展示新闻数据源并添加分类"
```

---

## Task 4: 集成测试

**Files:**
- Test: `scripts/acceptance-test.sh`

**Interfaces:**
- Consumes: 所有修改的API端点
- Produces: 测试报告

- [ ] **Step 1: 运行验收测试**

执行项目的验收测试脚本：

```bash
bash scripts/acceptance-test.sh
```

验证所有测试通过，包括：
- 市场概览API正常返回5个指数
- 资金流向API正常返回北向资金数据
- 数据源API正常返回新闻数据源

- [ ] **Step 2: 手动测试**

启动完整系统进行手动测试：

```bash
# 启动数据服务
cd data-service
python main.py

# 启动前端（新终端）
cd ..
npm run dev
```

访问以下页面进行验证：
1. 仪表盘页面 (`/dashboard`)
   - 验证显示5个指数卡片
   - 验证北向资金显示正确
   - 验证非交易时段显示历史数据提示

2. 数据源页面 (`/events/sources`)
   - 验证仅显示新闻数据源
   - 验证分类筛选功能正常
   - 验证数据源信息完整

- [ ] **Step 3: 最终提交**

```bash
git add .
git commit -m "feat: 完成市场数据优化 - 北向资金降级、指数显示、新闻数据源页面"
```

---

## 完成

所有任务完成后，系统将具备：
1. 北向资金在非交易时段自动显示历史数据，并标注数据新鲜度
2. 仪表盘显示5个主要指数（上证指数、深证成指、创业板指、科创50、沪深300）
3. 数据源页面仅展示新闻数据源，并按类别分类显示
