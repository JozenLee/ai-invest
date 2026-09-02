# 数据源配置指南

## 当前状态

系统目前使用**模拟数据**，原因如下：
1. Python数据服务未启动
2. Yahoo Finance API在中国大陆可能无法访问

## 数据源优先级

```
1. Yahoo Finance (国际数据) → 如果可用，优先使用
2. Python数据服务 (AKShare) → 如果启动，作为备选
3. 模拟数据 → 降级方案
```

## 如何接入真实数据

### 方案一：启动Python数据服务（推荐）

1. 安装Python依赖：
```bash
cd data-service
pip3 install -r requirements.txt
```

2. 启动数据服务：
```bash
python3 main.py
```

3. 验证服务：
```bash
curl http://localhost:8000/health
```

### 方案二：使用代理访问Yahoo Finance

如果需要访问Yahoo Finance，可以配置代理：

```bash
# .env
HTTP_PROXY=http://your-proxy:port
HTTPS_PROXY=http://your-proxy:port
```

### 方案三：接入其他数据源

可以接入以下数据源：

| 数据源 | 类型 | 说明 |
|--------|------|------|
| AKShare | A股 | 免费，需要Python |
| Tushare | A股 | 需要注册获取token |
| 新浪财经 | A股 | 免费，接口不稳定 |
| 东方财富 | A股 | 免费，需要解析 |
| Yahoo Finance | 全球 | 需要代理 |

## 数据源配置

在 `.env` 文件中配置：

```bash
# 数据服务地址
DATA_SERVICE_URL=http://localhost:8000

# Yahoo Finance代理（可选）
YAHOO_FINANCE_PROXY=http://your-proxy:port

# Tushare Promax（可选）
TUSHARE_API_URL=https://your-promax-host/tushare/pro
TUSHARE_API_KEY=your_api_key_here
```

## 验证数据源

运行 API 测试：

```bash
npm run test:api
```

检查输出中的 `source` 字段：
- `yahoo` → 使用Yahoo Finance
- `python` → 使用Python数据服务
- `mock` → 使用模拟数据

## 模拟数据说明

当真实数据不可用时，系统会使用模拟数据。模拟数据具有以下特点：

1. **数据格式一致** - 与真实数据格式完全相同
2. **数值合理** - 在真实市场范围内
3. **实时更新** - 每次请求生成新的时间戳
4. **功能完整** - 支持所有UI展示和交互

## 常见问题

### Q: 为什么看到的是模拟数据？

A: 检查以下几点：
1. Python数据服务是否启动（`curl http://localhost:8000/health`）
2. 网络是否正常
3. 数据源API是否可用

### Q: 如何切换数据源？

A: 系统会自动尝试所有数据源，无需手动切换。如果需要强制使用某个数据源，可以修改API路由中的优先级。

### Q: 模拟数据准确吗？

A: 模拟数据仅用于展示和测试，不代表真实市场数据。投资决策请参考真实数据。
