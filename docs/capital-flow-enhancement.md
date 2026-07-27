# 资金流向增强更新文档

## 更新概述

本次更新将前端仪表盘的资金流向指标从传统的"机构/散户/北向/大盘资金/市场情绪"替换为更具参考价值的指标：

### 新增指标

1. **持续多日大单净流入趋势**
   - 分析Top板块的主力资金连续流入情况
   - 比单日数据更能反映市场持续性方向
   - 强度分级：强势(≥10亿/天)、温和(≥3亿/天)、弱势(<3亿/天)

2. **成交量放大分析**
   - 当日成交量与近期均量对比
   - 放大倍数≥1.5x表示资金活跃度显著提升
   - 结合资金流向判断：放量+流入=强势，放量+流出=恐慌

3. **股价与资金流向背离**
   - 看多背离：资金流入>5亿但股价跌>1%
   - 看空背离：资金流出>5亿但股价涨>1%
   - 背离后往往有反转或加速

4. **龙虎榜数据**
   - 异常波动个股的买卖席位数据
   - 统计当日上榜股票数量
   - 机构席位净买入反映聪明钱动向

5. **北向资金（保留）**
   - 沪深港通流入的境外资金
   - 被称为"聪明钱"
   - 对市场趋势有领先指示作用

## 技术实现

### 1. 后端更新

#### 新增文件
- `data-service/routers/advanced_capital_flow.py` - 增强版资金流向API路由

#### 新增API端点
- `GET /api/capital-flow/advanced/enhanced` - 获取增强版资金流向数据
- `GET /api/capital-flow/advanced/lhb/latest` - 获取最新龙虎榜数据
- `GET /api/capital-flow/advanced/lhb/{date}` - 获取指定日期龙虎榜数据

#### 新增数据服务方法
- `data_service.get_lhb_data()` - 获取龙虎榜数据
- `data_service.get_lhb_detail(date)` - 获取龙虎榜详情
- `data_service.get_individual_capital_flow_rank(indicator)` - 获取个股资金流向排名

#### 新增AKShare Provider方法
- `akshare_provider.get_lhb_data()` - 龙虎榜数据（新浪财经）
- `akshare_provider.get_lhb_detail(date)` - 龙虎榜详细数据
- `akshare_provider.get_individual_capital_flow_rank(indicator)` - 个股资金流向排名（东方财富）

### 2. 前端更新

#### 类型定义更新 (`src/types/market.ts`)
新增接口：
- `ConsecutiveTrend` - 持续流入趋势
- `VolumeAmplification` - 成交量放大
- `PriceFlowDivergence` - 价格资金背离
- `InstitutionalBehavior` - 机构行为数据

更新接口：
- `CapitalFlowData` - 添加新字段，保留旧字段以兼容过渡期

#### API路由更新 (`src/app/api/market/capital-flow/route.ts`)
- 更改数据源从 `/api/capital-flow/macro` 到 `/api/capital-flow/advanced/enhanced`
- 保持缓存策略和用户配置过滤逻辑

#### UI组件更新 (`src/app/(dashboard)/dashboard/page.tsx`)
- 替换5个资金流向卡片为新指标卡片
- 更新数据说明和风险提示文案
- 添加新的InfoButton工具提示

#### 兼容性处理
- 其他页面（`market/capital/page.tsx`, `market/overview/page.tsx`）使用可选链操作符访问 `capitalFlow.market`
- 保证数据结构变更期间系统稳定运行

## 数据说明

### 持续流入趋势
- **数据来源**: 东方财富行业资金流向
- **计算方法**: 统计Top5板块的主力资金净流入平均值
- **更新频率**: 交易时段每30秒，非交易时段每5分钟
- **局限性**: 当前仅支持单日数据，后续可扩展为真正的多日连续分析

### 成交量放大
- **数据来源**: 行业板块主力资金净流入绝对值作为成交活跃度代理指标
- **计算方法**: 放大倍数 = 当日成交量 / 近期均量
- **判断阈值**: ≥1.5x为显著放大

### 价格资金背离
- **数据来源**: 板块涨跌幅 + 主力资金净流入
- **判断标准**:
  - 看多背离: 资金流入>5亿 且 股价跌>1%
  - 看空背离: 资金流出>5亿 且 股价涨>1%

### 龙虎榜
- **数据来源**: 新浪财经龙虎榜数据（AKShare: `stock_lhb_detail_daily_sina`）
- **更新频率**: 交易日收盘后更新
- **数据延迟**: T+0（当日数据当日收盘后可查）

### 北向资金
- **数据来源**: 东方财富互联互通数据
- **更新频率**: 交易时段实时，非交易时段显示上一交易日数据
- **注意事项**: 非交易时段数据会标记为"stale"

## API数据格式

### 增强版资金流向响应

```json
{
  "success": true,
  "data": {
    "consecutiveTrend": {
      "days": 1,
      "totalNet": 6.7,
      "avgDaily": 6.7,
      "direction": "inflow",
      "strength": "moderate"
    },
    "volumeAmplification": {
      "currentVolume": 15.5,
      "avgVolume": 12.2,
      "amplification": 1.27,
      "isAmplified": false
    },
    "priceFlowDivergence": {
      "priceChange": 2.3,
      "flowNet": 15.5,
      "isDivergent": false,
      "divergenceType": "none",
      "signal": "价格与资金流向同步"
    },
    "institutionalBehavior": {
      "dragonTiger": {
        "count": 82,
        "netBuy": 0,
        "topStocks": [
          {"name": "合百集团", "netBuy": 4.29},
          {"name": "上峰材料", "netBuy": 6.18}
        ]
      },
      "institutionalSeats": {
        "buySeats": 0,
        "sellSeats": 0,
        "netBuy": 0
      },
      "northboundCapital": {
        "net": 12.5,
        "shConnect": 8.3,
        "szConnect": 4.2,
        "stale": false,
        "dataDate": "2026-07-28",
        "source": "eastmoney_direct"
      }
    },
    "topInflowSectors": [...],
    "topOutflowSectors": [...],
    "source": "realtime",
    "dataDate": "2026-07-28",
    "dataQuality": "realtime",
    "timestamp": "2026-07-28T10:30:00"
  }
}
```

## 测试验证

### 1. 后端测试

```bash
cd data-service

# 测试分析函数
python3 << 'EOF'
from routers.advanced_capital_flow import _analyze_consecutive_trend
mock_data = [{"sector": "半导体", "mainForceNet": 15.5, "changePct": 2.3}]
result = _analyze_consecutive_trend(mock_data)
print(result)
EOF

# 启动服务测试
python3 main.py
# 访问 http://localhost:8000/docs 查看新增API文档
```

### 2. 前端测试

```bash
# TypeScript类型检查
npm run typecheck

# 启动开发服务器
npm run dev

# 访问 http://localhost:3000/dashboard
# 刷新数据，验证新指标卡片显示正常
```

### 3. API测试

```bash
# 测试增强版资金流向API
curl http://localhost:8000/api/capital-flow/advanced/enhanced | jq

# 测试龙虎榜API
curl http://localhost:8000/api/capital-flow/advanced/lhb/latest | jq
```

## 已知问题和后续优化

### 当前局限性

1. **持续流入趋势**: 目前仅支持单日数据，未实现真正的多日连续分析
   - **原因**: 需要历史数据存储和时序分析
   - **计划**: Phase 2实现数据库存储历史资金流向数据

2. **机构席位数据**: 目前占位为0，未实现
   - **原因**: AKShare的个股资金流向API依赖东方财富，网络问题频发
   - **计划**: 寻找更稳定的数据源或实现本地缓存

3. **成交量数据精度**: 使用板块资金流入绝对值作为代理指标
   - **原因**: 缺少直接的板块成交量数据
   - **影响**: 指标趋势正确但绝对值可能有偏差

### 后续优化方向

1. **数据持久化**
   - 将每日资金流向数据存入数据库
   - 实现真正的多日连续流入趋势分析
   - 支持历史回测和趋势图表

2. **更多机构行为指标**
   - 机构持仓变化（季报数据）
   - 融资融券余额变化
   - 大宗交易数据
   - ETF申赎数据

3. **智能预警**
   - 连续3日以上大单流入预警
   - 价格资金背离预警
   - 龙虎榜机构集中买入预警

4. **个股级别分析**
   - 支持查看单个个股的资金流向趋势
   - 个股龙虎榜历史
   - 个股北向资金持仓变化

## 风险提示

⚠️ **重要提醒**

1. 资金流向数据基于成交订单大小分类，不等同于真实机构/散户持仓变化
2. 龙虎榜仅反映异常波动个股，不代表所有机构行为
3. 北向资金虽被称为"聪明钱"，但也会有判断失误
4. 以上数据为技术分析指标，不构成投资建议
5. 实际投资需结合基本面、市场环境等多方面因素综合判断

## 更新日志

- **2026-07-28**: 
  - ✅ 完成后端API开发
  - ✅ 完成前端UI更新
  - ✅ 完成类型定义和兼容性处理
  - ✅ 通过TypeScript编译检查
  - ✅ 完成分析函数单元测试
  - 📝 完成技术文档编写
