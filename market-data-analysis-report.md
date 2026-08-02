# 图谱探索页面市场数据源分析报告

## 执行时间
2026-08-01

## 一、数据现状总结

### ⚠️ 核心发现：当前使用的是**模拟数据**，非真实市场数据

---

## 二、数据源详细分析

### 1. 指数数据（IndexDaily表）

**数据状态：** ✅ 存在数据（90条记录）

**数据来源：** 🔴 **模拟数据** - 由脚本 `generate-mock-market-data.ts` 生成

**数据特征：**
- 包含3个指数：
  - 930713 - 中证人工智能主题指数
  - 931865 - 中证全指半导体指数  
  - 931160 - 中证全指通信设备指数
- 每个指数30天的模拟K线数据
- 价格波动使用随机算法生成（-1.5% ~ +1.5%）
- 最新数据日期：2026-07-31

**生成逻辑（来自 generate-mock-market-data.ts）：**
```typescript
const dayChange = (Math.random() - 0.48) * 0.03; // -1.5% ~ +1.5%
const price = basePrice * (1 + dayChange * (30 - i) / 30);
const open = price * (1 + (Math.random() - 0.5) * 0.01);
const close = price * (1 + (Math.random() - 0.5) * 0.01);
```

**问题：**
- ❌ 不反映真实市场走势
- ❌ 无法用于真实投资决策
- ❌ 技术指标分析结果不可靠

---

### 2. ETF数据（ETFDaily表）

**数据状态：** ✅ 存在数据（120条记录）

**数据来源：** 🔴 **模拟数据** - 由脚本 `generate-mock-market-data.ts` 生成

**数据特征：**
- 包含4个ETF：
  - 515070 - AI ETF
  - 512480 - 半导体ETF
  - 159995 - 芯片ETF
  - 515880 - 通信ETF
- 每个ETF 30天的模拟数据
- 溢折价率（premium）也是随机生成

**生成逻辑：**
```typescript
const nav = close * (1 + (Math.random() - 0.5) * 0.002);
const premium = ((close - nav) / nav) * 100;
```

**问题：**
- ❌ ETF净值与市价关系不真实
- ❌ 资金流向估算不准确
- ❌ 无法反映真实的申购/赎回情况

---

### 3. 板块资金流向（SectorCapitalFlow表）

**数据状态：** ✅ 存在数据（210条记录）

**数据来源：** 🔴 **模拟数据** - 由脚本 `generate-mock-market-data.ts` 生成

**数据特征：**
- 涵盖7个板块：芯片、存储芯片、服务器、散热、数据中心、光模块、通信设备
- 每个板块30天的资金流向数据
- 主力资金和散户资金流向呈相反关系（代码硬编码）

**生成逻辑：**
```typescript
const mainForceNet = (Math.random() - 0.5) * 100000; // -50000 ~ +50000万
const retailNet = -mainForceNet * 0.8; // 散户与主力相反
```

**问题：**
- ❌ 主力与散户资金流向关系过于简化
- ❌ 不反映真实市场资金博弈
- ❌ 连续流入/流出天数是随机生成的

---

### 4. 新闻关联数据（NewsGraphLink表）

**数据状态：** ✅ 存在数据（111条记录）

**数据来源：** 🟡 **半真实** - 新闻本身可能是真实的，但与图谱节点的关联是随机生成的

**生成逻辑：**
```typescript
// 为每条新闻随机关联1-3个AI节点
const numLinks = Math.floor(Math.random() * 3) + 1;
const selectedNodes = aiNodes.sort(() => 0.5 - Math.random()).slice(0, numLinks);
```

**问题：**
- ❌ 新闻与节点的相关性（relevance）是随机的（0.5~1.0）
- ❌ 情感标签可能与新闻内容不匹配
- ❌ 影响类型（直接/间接）是随机分配的

---

## 三、数据服务架构分析

### 市场数据服务层级

```
前端（graph/explore/page.tsx）
    ↓
API层（/api/graph/nodes/[id]/market-data）
    ↓
GraphMarketDataService（增强服务）
    ↓
数据库（IndexDaily, ETFDaily, SectorCapitalFlow, NewsGraphLink）
    ↑
generate-mock-market-data.ts（模拟数据生成器）❌
```

### 关键发现

1. **数据获取路径**：
   - `graph-market-data.service.ts` 直接从数据库读取
   - 没有调用外部真实数据API
   - 没有集成 AKShare、Tushare、Yahoo Finance 等真实数据源

2. **market-data.service.ts 的真实数据源**：
   - 该服务确实有调用外部API的能力
   - `DATA_SERVICE_URL = http://localhost:8000` - Python数据服务
   - 但**图谱探索页面没有使用这个服务**
   - 它只用于指标分析页面

---

## 四、真实数据源集成情况

### 已有的真实数据能力（未应用于图谱）

在 `market-data.service.ts` 中发现：

```typescript
// 从Python数据服务获取历史K线数据
async function fetchKlineData(
  code: string,
  period: 'daily' | 'weekly' | 'monthly' = 'daily',
  count: number = 120
): Promise<DailyData[]> {
  const response = await fetch(
    `${DATA_SERVICE_URL}/api/market/kline?code=${code}&period=${period}&count=${count}`,
    { signal: AbortSignal.timeout(10000) }
  )
  // ...
}
```

**问题：** 这个服务只用于独立的指标分析功能，图谱探索页面没有调用它。

---

## 五、对用户的影响

### 当前图谱探索页面显示的数据：

1. **行业指数表现** - ❌ 模拟数据
   - 1日/5日/30日涨跌幅：随机生成，不反映真实走势

2. **ETF跟踪** - ❌ 模拟数据
   - 价格、涨跌幅、溢折价率：随机生成
   - 资金流入：基于模拟成交额计算

3. **资金流向** - ❌ 模拟数据
   - 主力资金、散户资金：随机数值
   - 资金情绪指数：基于模拟数据计算

4. **新闻热度** - 🟡 部分真实
   - 新闻数量：可能准确（如果新闻本身是真实的）
   - 情感分析：可能不准确（随机关联）
   - 热词提取：依赖于新闻质量

5. **投资参考信号** - ❌ 不可靠
   - 所有基于上述模拟数据计算的投资信号都不可靠

---

## 六、建议方案

### 方案A：接入真实数据源（推荐）

**优点：** 提供真实市场数据，可用于实际投资决策

**步骤：**

1. **集成AKShare（免费）**
   ```python
   # Python数据服务端
   import akshare as ak
   
   # 获取指数数据
   def get_index_data(code: str):
       df = ak.index_zh_a_hist(symbol=code, period="daily")
       return df
   
   # 获取ETF数据
   def get_etf_data(code: str):
       df = ak.fund_etf_hist_sina(symbol=code)
       return df
   
   # 获取资金流向
   def get_capital_flow(sector: str):
       df = ak.stock_sector_fund_flow_rank(sector=sector)
       return df
   ```

2. **定时更新数据**
   - 设置每日定时任务（交易日收盘后）
   - 更新 IndexDaily、ETFDaily、SectorCapitalFlow 表

3. **修改图谱服务**
   - `graph-market-data.service.ts` 保持不变（继续从数据库读取）
   - 数据源从模拟数据改为真实数据

**成本：** 开发时间 2-3天，免费数据源（AKShare）

---

### 方案B：使用付费数据源（高质量）

**数据源选项：**
- Tushare Pro（积分制，需要贡献或付费）
- Wind（专业级，价格高）
- Choice（东方财富，中等价格）

**优点：**
- 数据质量更高
- 更新更及时
- 提供更多维度的数据

**成本：** 根据数据源不同，每年几千到数万元

---

### 方案C：保持模拟数据（仅用于演示）

**适用场景：**
- 产品原型演示
- 功能测试
- 非投资决策场景

**要求：**
- **必须在页面明显位置标注"演示数据"或"模拟数据"**
- 避免用户误以为是真实数据进行投资决策
- 建议添加水印或标识

---

## 七、立即行动项

### 高优先级（必须）

1. **在页面添加数据来源说明**
   ```tsx
   <Badge variant="warning">⚠️ 当前为模拟演示数据，非真实市场数据</Badge>
   ```

2. **在数据展示区域添加免责声明**
   - 明确告知用户当前数据的性质
   - 避免误导投资决策

### 中优先级（建议）

3. **评估真实数据源接入成本**
   - 调研 AKShare、Tushare 等数据源的可用性
   - 评估开发和维护成本

4. **制定数据更新策略**
   - 确定更新频率（实时/日更/周更）
   - 设计数据质量监控机制

### 低优先级（可选）

5. **优化模拟数据质量**
   - 如果短期内无法接入真实数据
   - 可以改进模拟算法，使其更接近真实市场规律

---

## 八、结论

**当前状态：** 图谱探索页面展示的指数、ETF、资金流向数据**全部为模拟数据**，由 `generate-mock-market-data.ts` 脚本通过随机算法生成，不反映真实市场情况。

**风险评估：** 🔴 高风险
- 如果用户误以为是真实数据并据此做出投资决策，可能造成经济损失
- 缺乏明确的数据来源说明，存在误导用户的风险

**建议：**
1. **立即**在页面添加明确的"模拟数据"标识
2. **尽快**评估真实数据源接入方案
3. **制定**从模拟数据到真实数据的迁移计划

---

## 附录：相关文件清单

- 模拟数据生成：`scripts/generate-mock-market-data.ts`
- 图谱市场数据服务：`src/lib/services/graph-market-data.service.ts`
- 真实数据服务（未用于图谱）：`src/lib/services/market-data.service.ts`
- 图谱探索页面：`src/app/(dashboard)/graph/explore/page.tsx`
- 数据检查脚本：`scripts/check-market-data.ts`
