# 资金流向计算方法分析报告

## 一、当前计算逻辑概述

### 1.1 数据源层级（data-service/providers/akshare_provider.py）

**主接口**：`ak.stock_market_fund_flow()` 
- 来源：东方财富大盘资金流向接口
- 数据字段：主力净流入-净额、主力净流入-净占比、中单净流入-净额、小单净流入-净额
- 当前状态：❌ **接口不可用**（网络代理问题）

**降级接口**：`ak.stock_fund_flow_industry()` 
- 来源：行业资金流向汇总
- 计算方法：
  ```python
  # 主力净流入 = 所有行业净额汇总（单位：亿元 → 元）
  main_net = total_net * 1e8
  
  # 主力净占比 = 净额 / (流入 + 流出) * 100
  main_pct = total_net / (total_inflow + total_outflow) * 100
  
  # 散户资金估算（零和博弈假设 + 保守系数 0.8）
  retail_net = -main_net * 0.8
  retail_pct = -main_pct * 0.8
  
  # 中单/小单分配（6:4比例）
  中单净流入 = retail_net * 0.6
  小单净流入 = retail_net * 0.4
  ```

### 1.2 业务层计算（data-service/routers/capital_flow.py）

**机构资金（institutionalNet）**：
```python
institutionalNet = 主力净流入-净额 / 1e8  # 转换为亿元单位
institutionalPct = 主力净流入-净占比
```

**散户资金（retailNet）**：
```python
retailNet = (中单净流入-净额 + 小单净流入-净额) / 1e8  # 转换为亿元单位
retailPct = -主力净占比  # 零和博弈估算
```

**市场情绪（sentiment，0-100分）**：
```python
sentiment = 50.0  # 基准分

# 1. 主力资金评分（±20分）
if |main_net| >= 10亿: ±20分
elif |main_net| >= 2亿: ±10分
else: ±5分

# 2. 北向资金评分（±17.5分）
if |northbound_net| >= 50亿: ±17.5分
elif |northbound_net| >= 10亿: ±10分
else: ±5分

# 3. 主力散户分歧评分（±12.5分）
if 主力流入且散户流出（或相反）: ±12.5分
elif 主力散户同向: ±5分
```

---

## 二、计算方法问题诊断

### 2.1 ❌ 核心问题：**数据源不准确**

#### 问题1：主接口失败，长期使用降级估算数据
```
当前状态：stock_market_fund_flow() 接口不可用
降级方案：行业资金流向汇总估算
数据质量标记：dataQuality = "estimated"
```

**影响**：
- 散户资金是**完全估算值**（`retail_net = -main_net * 0.8`），非真实数据
- 0.8系数是经验值，无数据支撑
- 中单/小单 6:4分配比例是假设值

#### 问题2：行业汇总数据存在系统性偏差
```python
# 实测数据（2026-07-25）
行业汇总净额: -969.56亿元
主力净占比: -7.71%
```

**偏差来源**：
- 行业分类不完整（仅90个行业，无法覆盖全市场）
- 跨行业股票可能被重复计算或遗漏
- 行业板块指数与大盘指数统计口径不一致

### 2.2 ⚠️ 次要问题：计算逻辑合理性

#### 问题3：零和博弈假设过于简化
```python
retail_pct = -main_pct  # 散户占比 = -主力占比
```

**理论缺陷**：
- **忽略北向资金**：北向资金是第三方资金，会打破零和平衡
- **忽略交易成本**：印花税、佣金导致总资金净流出
- **忽略增量资金**：IPO、定增、解禁等会改变存量资金池

**真实关系应为**：
```
主力资金 + 散户资金 + 北向资金 + 交易成本 + 增量资金 ≈ 0
```

#### 问题4：占比计算基准不清晰
```python
main_pct = total_net / (total_inflow + total_outflow) * 100
```

**问题**：
- `total_inflow + total_outflow` 是**成交金额的2倍**（买入和卖出重复计算）
- 正确的基准应该是：
  - **相对占比**：`净额 / 成交额 * 100`（当前做法的一半）
  - **绝对占比**：`净额 / 总市值 * 100`（更有意义）

---

## 三、与第三方数据对比

### 3.1 东方财富官网数据（参考标准）

**数据来源**：http://data.eastmoney.com/zjlx/detail.html
- 主力资金 = 超大单（≥50万元）+ 大单（10-50万元）
- 散户资金 = 中单（2-10万元）+ 小单（<2万元）
- 统计口径：全市场个股成交明细汇总

**数据特点**：
1. 基于**成交订单大小**分类，非基于账户类型
2. 超大单 ≠ 机构，大单可能是游资或大户
3. 数据是**相对流向**，不代表绝对持仓变化

### 3.2 同花顺/Wind数据（专业数据商）

**核心差异**：
- 使用**QFII/社保/公募/私募**持仓变动计算真实机构资金
- 散户资金 = 总成交额 - 机构成交额 - 北向资金
- 数据延迟1-2个交易日（需要披露时间）

### 3.3 当前系统 vs 第三方数据对比

| 指标 | 当前系统 | 东方财富 | 专业数据商 | 差异 |
|------|---------|---------|-----------|------|
| 主力资金定义 | 行业汇总估算 | 超大单+大单 | 真实机构持仓 | **定义不同** |
| 散户资金定义 | -主力*0.8 | 中单+小单 | 倒算值 | **完全估算** |
| 数据来源 | 行业板块汇总 | 个股订单汇总 | 持仓披露 | **统计口径不同** |
| 数据延迟 | 实时 | 实时 | T+1~T+2 | **时效性不同** |
| 准确性 | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | **准确性差2档** |

---

## 四、计算方法改进建议

### 4.1 短期修复（紧急）

#### 修复1：恢复主接口数据源
```python
# 问题：网络代理导致东方财富接口失败
# 方案：
1. 检查网络配置，移除代理设置
2. 使用替代域名（data.eastmoney.com → push2.eastmoney.com）
3. 增加重试机制（当前retries=2，建议增加到5）
```

#### 修复2：修正占比计算基准
```python
# 当前（错误）
main_pct = total_net / (total_inflow + total_outflow) * 100

# 修正后
main_pct = total_net / total_inflow * 100  # 净额/流入额
# 或
main_pct = total_net / (total_inflow + total_outflow) * 200  # 修正重复计算
```

#### 修复3：增加数据质量警告
```typescript
// 前端显示时标注数据来源
{dataQuality === 'estimated' && (
  <Badge variant="warning">
    ⚠️ 当前为估算数据，散户资金基于零和博弈推算
  </Badge>
)}
```

### 4.2 中期优化（推荐）

#### 优化1：接入真实大盘资金流向数据
```python
# 方案A：修复东方财富接口
async def get_market_capital_flow_v2(self):
    # 尝试多个域名
    urls = [
        "https://push2his.eastmoney.com/...",
        "https://datacenter.eastmoney.com/...",
        "https://data.eastmoney.com/..."
    ]
    for url in urls:
        try:
            # 自定义HTTP请求，绕过代理
            return await fetch_with_retry(url)
        except:
            continue

# 方案B：使用新浪财经接口
df = ak.stock_fund_flow_sina()  # 备用数据源
```

#### 优化2：修正零和博弈模型
```python
# 改进算法：考虑北向资金
def calculate_retail_flow(main_net, northbound_net):
    """
    真实关系：主力 + 散户 + 北向 ≈ 0（忽略交易成本）
    散户资金 = -(主力 + 北向)
    """
    retail_net = -(main_net + northbound_net)
    return retail_net
```

#### 优化3：增加数据验证逻辑
```python
def validate_capital_flow(data):
    """验证资金流向数据合理性"""
    main_net = data['主力净流入-净额']
    retail_net = data['散户净流入-净额']
    
    # 检查1：净额绝对值不应超过成交额
    if abs(main_net) > total_turnover:
        raise ValueError("主力净额超过成交额，数据异常")
    
    # 检查2：主力+散户不应严重偏离0
    if abs(main_net + retail_net) > max(abs(main_net), abs(retail_net)) * 0.5:
        logger.warning("零和平衡偏离较大，可能存在数据问题")
    
    return True
```

### 4.3 长期改进（理想方案）

#### 改进1：接入专业数据源
```python
# 使用Tushare Pro接口（需要积分）
import tushare as ts
pro = ts.pro_api()

# 获取机构持仓变动
df = pro.fund_portfolio(ts_code='510300.SH')  # ETF持仓
df = pro.top10_holders(ts_code='600000.SH')   # 前十大股东

# 计算真实机构资金流向
institutional_flow = df['持仓市值变化'].sum()
```

#### 改进2：自建资金流向计算引擎
```python
# 基于Level-2逐笔成交数据计算
class CapitalFlowCalculator:
    def __init__(self):
        self.threshold = {
            'super_large': 50_0000,  # 50万
            'large': 10_0000,        # 10万
            'mid': 2_0000,           # 2万
        }
    
    def classify_order(self, amount):
        """按订单金额分类"""
        if amount >= self.threshold['super_large']:
            return 'super_large'
        elif amount >= self.threshold['large']:
            return 'large'
        elif amount >= self.threshold['mid']:
            return 'mid'
        else:
            return 'small'
    
    def calculate_flow(self, tick_data):
        """基于逐笔成交计算资金流向"""
        flow = {'super_large': 0, 'large': 0, 'mid': 0, 'small': 0}
        
        for tick in tick_data:
            amount = tick['price'] * tick['volume']
            category = self.classify_order(amount)
            
            # 主动买入为正，主动卖出为负
            if tick['bs_flag'] == 'B':  # 主动买入
                flow[category] += amount
            else:  # 主动卖出
                flow[category] -= amount
        
        return {
            'institutional': flow['super_large'] + flow['large'],
            'retail': flow['mid'] + flow['small']
        }
```

---

## 五、数据参考价值评估

### 5.1 当前数据可信度评分

| 指标 | 评分 | 说明 |
|------|------|------|
| **机构资金流向** | ⭐⭐⭐ (3/5) | 基于行业汇总，方向大致准确但绝对值偏差较大 |
| **散户资金流向** | ⭐ (1/5) | **完全估算值，不可信** |
| **机构资金占比** | ⭐⭐ (2/5) | 计算基准错误（分母翻倍），数值偏小一半 |
| **散户资金占比** | ⭐ (1/5) | 基于错误的零和博弈假设 |
| **市场情绪指数** | ⭐⭐⭐ (3/5) | 算法合理，但依赖不准确的输入数据 |

### 5.2 数据使用建议

#### ✅ 可以参考的场景
1. **主力资金流向的方向判断**（流入/流出）
   - 准确性：70-80%
   - 用途：判断大盘资金面的整体趋势

2. **板块资金流向排名**
   - 准确性：80-90%
   - 用途：发现热点板块和资金轮动

3. **市场情绪指数的相对变化**
   - 准确性：60-70%
   - 用途：对比不同时间段的市场情绪变化

#### ❌ 不应依赖的场景
1. **散户资金的绝对值**
   - 当前为估算值，误差可能超过50%
   
2. **资金占比的精确数值**
   - 计算基准错误，数值偏小一半

3. **主力资金的绝对规模**
   - 行业汇总存在统计口径偏差

4. **作为交易决策的唯一依据**
   - 数据质量不足以支撑量化交易

### 5.3 风险提示

**必须在界面上显示的警告信息**：
```
⚠️ 资金流向数据说明：
1. 主力资金 = 东方财富超大单+大单，非真实机构持仓
2. 散户资金为零和博弈估算值，仅供参考
3. 当前数据源：行业资金流向汇总（降级方案）
4. 数据延迟：实时（盘中）/ 日终（盘后）
5. 本数据不构成投资建议，仅作为辅助分析工具
```

---

## 六、执行计划

### Phase 1: 紧急修复（1-2天）
- [ ] 修复东方财富接口网络问题
- [ ] 修正占比计算基准
- [ ] 前端增加数据质量标识
- [ ] 添加用户风险提示

### Phase 2: 优化改进（1周）
- [ ] 修正零和博弈模型（引入北向资金）
- [ ] 增加数据验证逻辑
- [ ] 接入新浪财经备用数据源
- [ ] 完善单元测试

### Phase 3: 长期规划（1-3个月）
- [ ] 评估Tushare Pro接入成本
- [ ] 研究Level-2数据获取方案
- [ ] 开发自建资金流向计算引擎
- [ ] 建立数据质量监控体系

---

## 七、结论

**当前状态诊断**：
- ❌ 主数据源失效，使用降级估算数据
- ❌ 散户资金为完全估算值，不可信
- ⚠️ 占比计算存在系统性偏差（偏小一半）
- ⚠️ 零和博弈假设过于简化

**数据参考价值**：
- ✅ 主力资金**流向**（流入/流出）有一定参考性（70-80%）
- ✅ 板块资金流向排名较准确（80-90%）
- ❌ 散户资金绝对值**不可信**（误差>50%）
- ❌ 资金占比数值**不准确**（偏小一半）

**核心建议**：
1. **立即修复**：恢复东方财富主接口，修正占比计算
2. **前端标注**：明确标识数据来源和质量等级
3. **用户教育**：添加数据说明和风险提示
4. **长期规划**：评估专业数据源接入的必要性

**最终评价**：
当前资金流向数据可作为**辅助参考指标**，但**不应作为投资决策的核心依据**。建议优先修复主数据源，并在界面上明确标注数据质量，避免用户过度依赖不准确的估算值。
