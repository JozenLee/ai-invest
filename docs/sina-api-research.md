# 新浪财经大盘资金流向API调研报告

**调研日期**: 2026-07-21  
**调研对象**: 新浪财经网站资金流向数据接口  
**调研目标**: 寻找大盘资金流向的直接API接口

---

## 一、调研结论

**新浪财经不提供大盘资金流向的直接API接口**，仅提供板块（行业/概念）资金流向接口。

---

## 二、新浪财经现有API接口

### 2.1 板块资金流向接口

**接口地址**:
```
https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/MoneyFlow.ssl_bkzj_bk
```

**请求方式**: GET

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | int | 是 | 页码，从1开始 |
| num | int | 是 | 每页数量，建议100 |
| sort | string | 是 | 排序字段，如 `netamount`（净流入额） |
| asc | int | 是 | 排序方向，0=降序，1=升序 |
| fenlei | int | 是 | 分类类型，0=行业板块，1=概念板块 |

**完整示例**:
```
https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/MoneyFlow.ssl_bkzj_bk?page=1&num=100&sort=netamount&asc=0&fenlei=0
```

### 2.2 响应格式

**Content-Type**: application/json

**数据结构**: JSON数组，每个元素为一个板块的资金流向数据

**字段说明**:
```json
[
  {
    "symbol": "new_xxxx",           // 板块代码
    "name": "电子信息",              // 板块名称
    "category": "new_blhy",          // 分类标识
    "netamount": "12345678.90",     // 净流入金额（元）
    "inamount": "98765432.10",      // 流入金额（元）
    "outamount": "86419753.20",     // 流出金额（元）
    "avg_changeratio": "0.0234",    // 平均涨跌幅（小数，需乘100转百分比）
    "trade": "456789012.34"         // 成交额（元）
  }
]
```

**行业板块识别**:
- `fenlei=0` 返回行业板块
- 行业板块的 `category` 字段以 `new_` 开头
- 概念板块的 `category` 字段不以 `new_` 开头

### 2.3 接口特点

**优点**:
- ✅ 无需认证，公开访问
- ✅ 响应速度快（通常 < 1秒）
- ✅ 数据实时更新（交易时间内）
- ✅ 返回JSON格式，易于解析

**缺点**:
- ❌ **无大盘资金流向直接接口**
- ❌ 仅提供板块级别数据
- ❌ 无历史数据接口（仅当日数据）
- ❌ 无API文档（需反向工程）

---

## 三、大盘资金流向替代方案

### 方案1：使用东方财富API（推荐）

**数据源**: 东方财富网 (push2his.eastmoney.com)  
**接口地址**:
```
https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get
```

**请求参数**:
```
lmt=0                                    // 数据条数限制（0=全部）
klt=101                                  // K线类型（101=日线）
secid=1.000001                          // 上证指数
secid2=0.399001                         // 深证成指
fields1=f1,f2,f3,f7                     // 字段组1
fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65  // 字段组2
ut=b2884a393a59ad64002292a3e90d46a5    // 客户端标识
_=1737504000000                         // 时间戳（毫秒）
```

**响应数据**:
- 包含历史日线数据（近期大盘资金流）
- 数据维度：主力净流入、超大单、大单、中单、小单
- 同时包含上证/深证指数行情数据
- 数据单位：净额（元）、净占比（%）

**数据字段**（CSV格式）:
```
日期,主力净流入-净额,小单净流入-净额,中单净流入-净额,大单净流入-净额,超大单净流入-净额,主力净流入-净占比,小单净流入-净占比,中单净流入-净占比,大单净流入-净占比,超大单净流入-净占比,上证-收盘价,上证-涨跌幅,深证-收盘价,深证-涨跌幅
```

**AKShare封装**:
```python
import akshare as ak

# 直接调用，无需手动构造API
df = ak.stock_market_fund_flow()
print(df)
```

**优点**:
- ✅ 提供大盘资金流向直接数据
- ✅ 包含历史数据（可回溯）
- ✅ 数据维度完整（5个层级）
- ✅ 同时提供指数行情
- ✅ 已被 AKShare 封装（易用）

**缺点**:
- ⚠️ 无官方API文档
- ⚠️ 可能存在反爬限制（需设置User-Agent）
- ⚠️ API稳定性依赖东方财富网站

### 方案2：新浪板块汇总估算（已实现）

**实现方式**: 汇总所有行业板块的资金流向，估算大盘总体情况

**优点**:
- ✅ 利用新浪现有接口
- ✅ 无需额外依赖
- ✅ 已在项目中实现（`sina_provider.py`）

**缺点**:
- ❌ 数据质量标记为 `estimated`（估算值）
- ❌ 存在覆盖盲区（部分个股不在行业板块中）
- ❌ 准确性低于直接大盘数据

**代码实现**（已在项目中）:
```python
# 位置: data-service/providers/sina_provider.py
async def get_market_capital_flow(self) -> Dict:
    """获取大盘资金流向（通过行业汇总估算）"""
    data = await self._call(self._fetch_sector_flow, ascending=False, num=100)
    
    # 汇总所有行业板块
    total_net = sum(float(d.get("netamount", 0)) for d in data)
    total_in = sum(float(d.get("inamount", 0)) for d in data)
    total_out = sum(float(d.get("outamount", 0)) for d in data)
    
    # 估算散户资金（与主力相反）
    main_net = total_net
    retail_ratio = min(0.4, max(0.2, 1 - (total_net / total_in)))
    retail_net = -main_net * retail_ratio
    
    return {
        "主力净流入-净额": main_net,
        "主力净流入-净占比": round(total_net / (total_in + total_out) * 100, 2),
        "中单净流入-净额": retail_net * 0.6,
        "小单净流入-净额": retail_net * 0.4,
        "日期": datetime.now().strftime("%Y-%m-%d"),
        "source": "sina_industry",
        "dataQuality": "estimated"  # 标记为估算值
    }
```

### 方案3：原始网页URL（不推荐）

**原始目标URL**: `https://finance.sina.com.cn/realstock/company/klc_zs.html`

**调研结果**: 
- ❌ 该URL返回 404 错误（页面不存在或已迁移）
- ❌ 无法通过该入口找到API接口

---

## 四、API稳定性评估

### 东方财富API（推荐方案）

| 评估维度 | 评分 | 说明 |
|---------|------|------|
| 可用性 | ⭐⭐⭐⭐ | 接口稳定，响应快速 |
| 数据质量 | ⭐⭐⭐⭐⭐ | 官方金融数据，维度完整 |
| 历史数据 | ⭐⭐⭐⭐⭐ | 支持历史查询 |
| 文档支持 | ⭐⭐ | 无官方文档（社区维护） |
| 反爬风险 | ⭐⭐⭐ | 需设置User-Agent |
| 综合评分 | ⭐⭐⭐⭐ | **推荐使用** |

**稳定性建议**:
- 使用 AKShare 封装函数（已处理反爬）
- 设置合理请求间隔（避免频繁请求）
- 添加异常处理和重试机制
- 准备降级方案（如新浪估算）

### 新浪财经API（备用方案）

| 评估维度 | 评分 | 说明 |
|---------|------|------|
| 可用性 | ⭐⭐⭐⭐ | 接口稳定 |
| 数据质量 | ⭐⭐⭐ | 板块级别，需估算大盘 |
| 历史数据 | ⭐ | 仅当日数据 |
| 文档支持 | ⭐ | 无官方文档 |
| 反爬风险 | ⭐⭐⭐⭐ | 风险较低 |
| 综合评分 | ⭐⭐⭐ | 适合作为备用源 |

---

## 五、项目集成建议

### 当前集成状态

项目已实现**双数据源策略**（位于 `data-service/providers/`）:

1. **主数据源**: AKShare（封装东方财富API）
   - 文件: `akshare_provider.py`
   - 功能: 完整的大盘资金流向数据
   - 接口: `stock_market_fund_flow()`

2. **备用数据源**: 新浪财经
   - 文件: `sina_provider.py`
   - 功能: 板块资金流向 + 估算大盘
   - 接口: `get_market_capital_flow()` (估算)

3. **数据源注册器**: 
   - 文件: `registry.py`
   - 功能: 自动降级（AKShare → Sina → Mock）

### 使用建议

**保持当前架构**，无需额外开发：
- ✅ 优先使用 AKShare（东方财富数据）
- ✅ AKShare失败时自动降级到新浪估算
- ✅ 所有数据源失败时使用模拟数据

**不建议的做法**:
- ❌ 直接使用新浪API作为主数据源（数据质量较低）
- ❌ 废弃新浪数据源（作为备用仍有价值）
- ❌ 手动构造东方财富API请求（AKShare已封装）

---

## 六、总结

1. **新浪财经无大盘资金流向直接API**，仅提供板块级别接口
2. **东方财富API是最佳选择**（已通过AKShare集成）
3. **项目现有架构已足够完善**，无需修改
4. **新浪API适合作为备用数据源**，不建议作为主数据源

---

## 附录：相关文档

- AKShare官方文档: https://akshare.akfamily.xyz/
- 东方财富数据中心: https://data.eastmoney.com/zjlx/dpzjlx.html
- 项目数据服务目录: `data-service/providers/`

---

**报告完成时间**: 2026-07-21  
**调研人员**: Claude (AI Assistant)
