# 多数据源资金流向系统设计文档

**项目：** AI投资分析系统  
**设计日期：** 2026-07-22  
**设计目标：** 实现备用数据源以解决大盘资金流向数据不准确问题

## 1. 背景与问题

### 1.1 当前问题
- 东方财富API服务器 `push2his.eastmoney.com` 无法访问
- AKShare的 `stock_market_fund_flow` 接口连接失败
- 系统降级使用行业汇总估算，数据准确性降低至70-80%
- 用户无法获取真实的大盘资金流向数据

### 1.2 目标
1. 实现新浪财经作为备用数据源
2. 优化数据源优先级和降级策略
3. 提供用户配置开关控制估算数据显示
4. 保证系统稳定性和可扩展性

### 1.3 成功标准
- 数据获取成功率 > 95%
- 真实数据获取率 > 80%（如果新浪有直接API）
- 系统响应时间 < 3秒
- 用户可自主选择是否显示估算数据

## 2. 系统架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                      用户浏览器                              │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ↓
┌─────────────────────────────────────────────────────────────┐
│                   Next.js Frontend                           │
│  - Dashboard (显示数据 + 质量标识)                           │
│  - Settings (用户偏好配置)                                   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ↓
┌─────────────────────────────────────────────────────────────┐
│                Next.js API Routes                            │
│  - /api/market/capital-flow (携带用户配置)                   │
│  - /api/settings/preferences (CRUD)                          │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ↓
┌─────────────────────────────────────────────────────────────┐
│              Python FastAPI Data Service                     │
│  - capital_flow router (处理配置逻辑)                        │
│  - DataService (统一调度)                                    │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ↓
┌─────────────────────────────────────────────────────────────┐
│                  ProviderRegistry                            │
│  - 按优先级调度: sina → akshare → cache                     │
│  - 自动降级和错误处理                                        │
└──────────┬────────────────────────┬─────────────────────────┘
           │                        │
           ↓                        ↓
┌──────────────────┐    ┌──────────────────┐
│  SinaProvider    │    │ AKShareProvider  │
│  (优先级1)       │    │  (优先级2)       │
│  - 真实API?      │    │  - 降级估算      │
│  - 改进估算      │    │  - 文件缓存      │
└──────────────────┘    └──────────────────┘
```

### 2.2 数据流程

**正常流程（获取真实数据）：**
```
用户请求 → API → DataService → Registry → SinaProvider.get_market_capital_flow()
                                              ↓
                                          真实API成功
                                              ↓
                                    返回 dataQuality: "realtime"
```

**降级流程1（新浪失败，AKShare成功）：**
```
用户请求 → API → DataService → Registry → SinaProvider (失败)
                                              ↓
                                          AKShareProvider
                                              ↓
                                          真实API或估算
                                              ↓
                                    返回 dataQuality: "realtime" 或 "estimated"
```

**降级流程2（全部失败，使用缓存）：**
```
用户请求 → API → DataService → Registry → 所有Provider失败
                                              ↓
                                          文件缓存
                                              ↓
                                    返回 dataQuality: "cached"
```

**用户禁用估算数据：**
```
用户请求(showEstimated=false) → API → 检查dataQuality
                                         ↓
                                  如果是"estimated"
                                         ↓
                               返回 success: false, error: "数据不可用"
```

## 3. 核心组件设计

### 3.1 SinaProvider 改进

**文件：** `data-service/providers/sina_provider.py`

**改进内容：**

1. **调研新浪财经大盘资金流向API**
   - 逆向分析新浪财经网页（如：https://finance.sina.com.cn/realstock/company/klc_zs.html）
   - 查找大盘资金流向的直接API接口
   - 测试API稳定性、数据格式、更新频率

2. **实现方案A：如果找到真实API**
   ```python
   async def get_market_capital_flow(self) -> Dict:
       """获取大盘资金流向（真实API）"""
       url = "https://vip.stock.finance.sina.com.cn/api/..." # 调研后填写
       r = requests.get(url, headers=self.HEADERS, timeout=self.TIMEOUT)
       data = r.json()
       
       return {
           "主力净流入-净额": float(data["main_net"]),
           "主力净流入-净占比": float(data["main_pct"]),
           "中单净流入-净额": float(data["mid_net"]),
           "小单净流入-净额": float(data["small_net"]),
           "日期": data["date"],
           "source": "sina_realtime",
           "dataQuality": "realtime",
       }
   ```

3. **实现方案B：如果没有真实API，改进估算**
   ```python
   async def get_market_capital_flow(self) -> Dict:
       """获取大盘资金流向（改进估算）"""
       # 获取行业资金流向
       sectors = await self._call(self._fetch_sector_flow, num=100)
       
       # 改进点1：使用历史比例（如果有缓存）
       historical_ratio = self._get_historical_ratio()  # 从缓存读取30日均值
       retail_ratio = historical_ratio if historical_ratio else 0.8
       
       # 改进点2：多日平滑
       recent_days = self._get_recent_days_estimation(3)  # 获取最近3天估算
       if recent_days:
           # 使用移动平均
           main_net = np.mean([d["main_net"] for d in recent_days])
       else:
           total_net = sum(float(d["netamount"]) for d in sectors)
           main_net = total_net
       
       retail_net = -main_net * retail_ratio
       
       return {
           "主力净流入-净额": main_net,
           "主力净流入-净占比": self._calculate_pct(main_net, sectors),
           "中单净流入-净额": retail_net * 0.6,
           "小单净流入-净额": retail_net * 0.4,
           "日期": datetime.now().strftime("%Y-%m-%d"),
           "source": "sina_estimated",
           "dataQuality": "estimated",
           "confidence": 0.75,  # 置信度评分
       }
   ```

4. **添加辅助方法**
   ```python
   def _get_historical_ratio(self) -> Optional[float]:
       """从缓存读取历史主力/散户比例均值"""
       # 读取最近30天的真实数据（如果有）
       # 计算平均比例
       pass
   
   def _get_recent_days_estimation(self, days: int) -> List[Dict]:
       """获取最近N天的估算数据，用于平滑"""
       # 从文件缓存读取
       pass
   
   def _calculate_pct(self, main_net: float, sectors: List[Dict]) -> float:
       """计算主力净占比"""
       total_in = sum(float(d["inamount"]) for d in sectors)
       total_out = sum(float(d["outamount"]) for d in sectors)
       return round(main_net / (total_in + total_out) * 100, 2) if (total_in + total_out) > 0 else 0
   ```

### 3.2 Registry 配置更新

**文件：** `data-service/providers/registry.py`

**改进内容：**

```python
DEFAULT_CATEGORY_CONFIG: Dict[str, CategoryConfig] = {
    # ... 其他配置保持不变
    
    "market_capital_flow": CategoryConfig(
        sources=["sina", "akshare"],  # ← 新浪优先
        cache_ttl=600,
        fallback_to_file=True,  # 允许降级到文件缓存
    ),
    
    # 其他资金流向接口保持AKShare优先（因为新浪不支持）
    "sector_capital_flow": CategoryConfig(
        sources=["akshare", "sina"],
        cache_ttl=600,
    ),
    "northbound_flow": CategoryConfig(
        sources=["akshare", "sina", "tushare"],
        cache_ttl=600,
    ),
}
```

### 3.3 用户配置系统

#### 3.3.1 数据库Schema

**文件：** `prisma/schema.prisma`

```prisma
model UserPreferences {
  id                  String   @id @default(cuid())
  userId              String?  @unique  // 可选：如果有用户系统
  
  // 数据显示偏好
  showEstimatedData   Boolean  @default(true)   // 是否显示估算数据
  showDataQualityBadge Boolean @default(true)   // 是否显示数据质量标识
  
  // 数据刷新偏好
  autoRefreshInterval Int      @default(300000) // 自动刷新间隔(毫秒)，默认5分钟
  
  // 时间戳
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
  
  @@map("user_preferences")
}
```

#### 3.3.2 API接口

**文件：** `src/app/api/settings/preferences/route.ts`

```typescript
// GET /api/settings/preferences
export async function GET() {
  const preferences = await prisma.userPreferences.findFirst({
    // 如果有用户系统：where: { userId: session.user.id }
  })
  
  // 如果没有配置，返回默认值
  if (!preferences) {
    return NextResponse.json({
      showEstimatedData: true,
      showDataQualityBadge: true,
      autoRefreshInterval: 300000,
    })
  }
  
  return NextResponse.json(preferences)
}

// POST /api/settings/preferences
export async function POST(request: Request) {
  const body = await request.json()
  
  const preferences = await prisma.userPreferences.upsert({
    where: { id: body.id || 'default' },
    update: body,
    create: { ...body, id: 'default' },
  })
  
  return NextResponse.json(preferences)
}
```

#### 3.3.3 资金流向API集成配置

**文件：** `src/app/api/market/capital-flow/route.ts`

```typescript
export async function GET(request: Request) {
  // 1. 获取用户配置
  const preferences = await prisma.userPreferences.findFirst()
  const showEstimatedData = preferences?.showEstimatedData ?? true
  
  // 2. 从Python服务获取数据
  const response = await fetch(`${DATA_SERVICE_URL}/api/capital-flow/macro`, {
    signal: AbortSignal.timeout(15000),
  })
  
  const result = await response.json()
  
  // 3. 根据配置过滤估算数据
  if (!showEstimatedData && result.data?.dataQuality === 'estimated') {
    return NextResponse.json({
      success: false,
      error: '真实数据暂时不可用，您已禁用估算数据显示',
      data: null,
      source: 'unavailable',
      meta: result.meta,
    })
  }
  
  // 4. 正常返回数据
  return NextResponse.json(result)
}
```

### 3.4 前端设置页面

**文件：** `src/app/(dashboard)/settings/page.tsx`

新增"数据显示偏好"设置项：

```typescript
<Card>
  <CardHeader>
    <CardTitle>数据显示偏好</CardTitle>
    <CardDescription>
      控制数据质量和显示方式
    </CardDescription>
  </CardHeader>
  <CardContent className="space-y-4">
    <div className="flex items-center justify-between">
      <div className="space-y-0.5">
        <Label>显示估算数据</Label>
        <p className="text-sm text-muted-foreground">
          当真实数据不可用时，是否显示基于行业汇总的估算值
        </p>
      </div>
      <Switch
        checked={preferences.showEstimatedData}
        onCheckedChange={(checked) => 
          updatePreferences({ showEstimatedData: checked })
        }
      />
    </div>
    
    <div className="flex items-center justify-between">
      <div className="space-y-0.5">
        <Label>显示数据质量标识</Label>
        <p className="text-sm text-muted-foreground">
          显示"真实数据"、"估算数据"等质量标识
        </p>
      </div>
      <Switch
        checked={preferences.showDataQualityBadge}
        onCheckedChange={(checked) => 
          updatePreferences({ showDataQualityBadge: checked })
        }
      />
    </div>
  </CardContent>
</Card>
```

## 4. 数据质量标识系统

### 4.1 数据质量等级

```typescript
type DataQuality = 
  | 'realtime'      // 真实数据，直接来自交易所或权威数据源
  | 'estimated'     // 估算数据，基于行业汇总或历史比例
  | 'cached'        // 缓存数据，所有实时源不可用时的降级
  | 'unavailable'   // 完全不可用
```

### 4.2 前端显示策略

**仪表盘页面增强：**

```typescript
// 根据dataQuality显示不同的标识
{capitalFlow.dataQuality === 'realtime' && (
  <Badge variant="default" className="text-xs">
    ✓ 真实数据
  </Badge>
)}

{capitalFlow.dataQuality === 'estimated' && (
  <Tooltip>
    <TooltipTrigger>
      <Badge variant="outline" className="text-xs text-yellow-600">
        ⚠️ 估算数据
      </Badge>
    </TooltipTrigger>
    <TooltipContent>
      数据源暂时不可用，当前显示基于行业汇总的估算值。
      可在设置中关闭估算数据显示。
    </TooltipContent>
  </Tooltip>
)}

{capitalFlow.dataQuality === 'cached' && (
  <Badge variant="secondary" className="text-xs">
    📦 缓存数据 ({cacheAge})
  </Badge>
)}
```

## 5. 错误处理和降级策略

### 5.1 降级策略

```
Level 1: SinaProvider.get_market_capital_flow()
         ↓ (失败)
Level 2: AKShareProvider.get_market_capital_flow()
         ↓ (失败，自动降级到行业估算)
Level 3: AKShareProvider.get_market_capital_flow() with industry estimation
         ↓ (失败)
Level 4: Registry file cache (last successful data)
         ↓ (失败或用户禁用估算)
Level 5: Return error: "数据不可用"
```

### 5.2 错误处理

**Python层（capital_flow.py）：**

```python
@router.get("/macro")
async def get_macro_capital_flow():
    try:
        # 尝试获取数据
        market_data = await data_service.get_market_capital_flow()
        
        # 检查数据质量
        data_quality = market_data.get("dataQuality", "unknown")
        
        return {
            "success": True,
            "data": {
                "market": {...},
                "dataQuality": data_quality,
                "confidence": market_data.get("confidence", 1.0),
            },
        }
    except Exception as e:
        logger.error(f"获取资金流向失败: {e}")
        return {
            "success": False,
            "error": "所有数据源均不可用",
            "data": None,
        }
```

**Next.js层（route.ts）：**

```typescript
// 已在3.3.3节实现
```

### 5.3 超时和重试

**Registry层优化：**

```python
async def fetch(self, category: str, method: str, ...):
    for source_name in sources:
        try:
            # 每个数据源独立超时
            result = await asyncio.wait_for(
                getattr(provider, method)(**kwargs),
                timeout=10.0  # 10秒超时
            )
            
            if self._is_valid_result(result):
                return result
        except asyncio.TimeoutError:
            logger.warning(f"{source_name} 超时，尝试下一个源")
            continue
        except Exception as e:
            logger.warning(f"{source_name} 失败: {e}")
            continue
```

## 6. 测试策略

### 6.1 单元测试

**SinaProvider测试：**

```python
# data-service/tests/test_sina_provider.py

async def test_sina_market_capital_flow_realtime():
    """测试新浪真实API（如果有）"""
    provider = SinaProvider()
    result = await provider.get_market_capital_flow()
    
    assert result["dataQuality"] == "realtime"
    assert "主力净流入-净额" in result
    assert result["source"] == "sina_realtime"

async def test_sina_market_capital_flow_estimated():
    """测试新浪估算逻辑"""
    provider = SinaProvider()
    # Mock _fetch_sector_flow 返回测试数据
    result = await provider.get_market_capital_flow()
    
    assert result["dataQuality"] == "estimated"
    assert 0 <= result["confidence"] <= 1
```

**Registry测试：**

```python
# data-service/tests/test_registry_fallback.py

async def test_fallback_sina_to_akshare():
    """测试新浪失败时降级到AKShare"""
    registry = ProviderRegistry()
    
    # Mock SinaProvider 抛出异常
    sina = MagicMock()
    sina.get_market_capital_flow.side_effect = Exception("API失败")
    registry.register(sina)
    
    # Mock AKShareProvider 成功
    akshare = MagicMock()
    akshare.get_market_capital_flow.return_value = {...}
    registry.register(akshare)
    
    result = await registry.fetch("market_capital_flow", "get_market_capital_flow")
    
    # 验证调用了两个provider
    sina.get_market_capital_flow.assert_called_once()
    akshare.get_market_capital_flow.assert_called_once()
```

### 6.2 集成测试

```python
# data-service/tests/test_integration.py

async def test_full_capital_flow_pipeline():
    """测试完整的数据获取流程"""
    # 1. 调用FastAPI endpoint
    response = client.get("/api/capital-flow/macro")
    
    # 2. 验证响应
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["data"]["dataQuality"] in ["realtime", "estimated", "cached"]
```

### 6.3 前端测试

```typescript
// src/app/(dashboard)/settings/__tests__/preferences.test.tsx

describe('Data Preferences', () => {
  it('should hide estimated data when disabled', async () => {
    // 1. 设置禁用估算数据
    await updatePreferences({ showEstimatedData: false })
    
    // 2. 获取资金流向数据
    const response = await fetch('/api/market/capital-flow')
    const data = await response.json()
    
    // 3. 验证估算数据被过滤
    if (data.dataQuality === 'estimated') {
      expect(data.success).toBe(false)
      expect(data.error).toContain('禁用估算数据')
    }
  })
})
```

## 7. 监控和日志

### 7.1 数据源健康监控

```python
# data-service/services/health_monitor.py

class HealthMonitor:
    def __init__(self):
        self.metrics = {
            "sina": {"success": 0, "failure": 0, "avg_time": 0},
            "akshare": {"success": 0, "failure": 0, "avg_time": 0},
        }
    
    def record_success(self, provider: str, duration: float):
        self.metrics[provider]["success"] += 1
        self._update_avg_time(provider, duration)
    
    def record_failure(self, provider: str):
        self.metrics[provider]["failure"] += 1
    
    def get_health_report(self) -> Dict:
        """生成健康报告"""
        return {
            provider: {
                "success_rate": m["success"] / (m["success"] + m["failure"]) if (m["success"] + m["failure"]) > 0 else 0,
                "avg_time_ms": m["avg_time"],
                "status": "healthy" if m["success"] > m["failure"] else "degraded",
            }
            for provider, m in self.metrics.items()
        }
```

### 7.2 日志记录

**关键点日志：**

```python
# 数据源切换
logger.info(f"[Registry] {source_name} 成功，数据质量: {data_quality}")

# 降级事件
logger.warning(f"[Registry] {source_name} 失败，降级到下一个源")

# 用户配置变更
logger.info(f"[API] 用户禁用估算数据，过滤dataQuality=estimated的结果")

# 性能指标
logger.info(f"[Registry] 数据获取耗时: {duration_ms}ms, 数据源: {source}")
```

## 8. 部署和回滚

### 8.1 部署步骤

```bash
# 1. 数据库迁移
npm run db:migrate

# 2. 安装依赖（如果有新依赖）
cd data-service && pip install -r requirements.txt

# 3. 重启Python服务
pkill -f "python.*main.py"
nohup python main.py > /tmp/data-service.log 2>&1 &

# 4. 重启Next.js
npm run build
npm run start

# 5. 验证
curl http://localhost:8000/api/capital-flow/macro | jq '.data.dataQuality'
```

### 8.2 回滚策略

如果新版本有问题，回滚步骤：

```bash
# 1. Git回滚代码
git revert <commit-hash>

# 2. 数据库回滚（如果有Schema变更）
npx prisma migrate resolve --rolled-back <migration-name>

# 3. 重启服务
# （同部署步骤3-4）

# 4. 验证回滚成功
curl http://localhost:8000/health
```

## 9. 性能优化

### 9.1 缓存策略

```python
# Registry层两级缓存
"market_capital_flow": CategoryConfig(
    sources=["sina", "akshare"],
    cache_ttl=600,  # 内存缓存10分钟
    fallback_to_file=True,  # 文件缓存作为最终降级
)
```

### 9.2 并行请求优化

```python
# 如果多个数据源都需要尝试，可以并行请求
async def fetch_with_race(self, category: str, method: str, **kwargs):
    """并行请求多个数据源，返回最快的结果"""
    sources = self._config[category].sources
    
    tasks = [
        self._fetch_from_provider(source, method, **kwargs)
        for source in sources
    ]
    
    # 返回第一个成功的结果
    for coro in asyncio.as_completed(tasks):
        try:
            result = await coro
            if self._is_valid_result(result):
                return result
        except Exception:
            continue
```

## 10. 未来扩展

### 10.1 新数据源接入

框架已预留扩展接口，未来可以轻松接入：

1. **天天基金（Eastmoney Fund）**
   - 实现 `EastmoneyFundProvider`
   - 注册到Registry
   - 调整优先级配置

2. **同花顺（10jqka）**
   - 实现 `TonghuashunProvider`
   - 支持Level-2付费数据

3. **Tushare Pro（付费）**
   - 已有TushareProvider基础
   - 需要2000+积分的资金流向权限

### 10.2 多源数据融合

```python
class DataFusion:
    """多源数据融合，提高准确性"""
    
    async def fuse_capital_flow(self, sources: List[Dict]) -> Dict:
        """融合多个数据源的结果"""
        # 1. 加权平均（根据历史准确率）
        weights = {
            "sina": 0.4,
            "akshare": 0.3,
            "tushare": 0.3,
        }
        
        # 2. 异常值检测和过滤
        # 3. 计算融合结果
        # 4. 返回置信度更高的数据
```

## 11. 总结

### 11.1 设计亮点

1. **渐进式演进** - 不破坏现有功能，逐步增强
2. **用户可控** - 提供配置开关，尊重用户选择
3. **高可扩展** - 易于接入新数据源
4. **数据透明** - 明确标识数据质量
5. **故障隔离** - 单个数据源失败不影响系统

### 11.2 关键指标

| 指标 | 当前 | 目标 | 达成方式 |
|------|------|------|---------|
| 数据获取成功率 | 70% | 95% | 多源降级 |
| 真实数据比例 | 30% | 80% | 新浪真实API |
| 响应时间 | 5-10s | <3s | 并行请求、缓存 |
| 用户满意度 | 低 | 高 | 透明标识、可配置 |

### 11.3 风险和缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| 新浪也没有真实API | 高 | 中 | 改进估算算法 |
| 新浪API不稳定 | 中 | 中 | 多源降级 |
| 用户不理解估算数据 | 中 | 低 | 清晰的UI说明 |
| 数据库Schema变更失败 | 低 | 高 | 测试环境验证 |

---

**设计完成。下一步：自审并提交用户审阅。**
