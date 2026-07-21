# 远程访问问题排查与解决

## 问题描述
其他电脑通过 `http://100.80.210.104:3000/` 访问项目时，页面可以显示但无法加载数据。

## 根本原因

### 1. Next.js 默认只监听 localhost
**问题**：Next.js 开发服务器默认绑定到 `127.0.0.1`（localhost），不接受来自其他设备的连接。

**解决方案**：修改 `package.json` 中的 `dev` 脚本，添加 `-H 0.0.0.0` 参数使其监听所有网络接口。

```json
{
  "scripts": {
    "dev": "next dev -H 0.0.0.0"
  }
}
```

### 2. Python 数据服务未启动
**问题**：前端页面依赖 Python FastAPI 服务（端口 8000）提供市场数据，但该服务未运行。

**现象**：
- 页面框架正常显示
- 数据区域显示"暂无数据"或错误提示
- API 返回 `{"success":false,"error":"数据服务不可用"}`

**解决方案**：启动 Python 数据服务
```bash
cd data-service
python3 main.py
```

### 3. CORS 跨域限制
**问题**：Python 服务的 CORS 配置只允许 `http://localhost:3000`，阻止了来自内网IP的请求。

**解决方案**：在 `data-service/main.py` 中添加内网IP到允许列表：

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://100.80.210.104:3000",  # 内网访问
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

## 验证步骤

### 1. 检查服务监听状态
```bash
# 检查 Next.js (端口 3000)
lsof -nP -iTCP:3000 -sTCP:LISTEN
# 应该显示: TCP *:3000 (LISTEN)

# 检查 Python 服务 (端口 8000)
lsof -nP -iTCP:8000 -sTCP:LISTEN
# 应该显示: TCP *:8000 (LISTEN)
```

### 2. 测试API访问
```bash
# 测试市场概览API
curl http://100.80.210.104:3000/api/market/overview

# 测试资金流向API
curl http://100.80.210.104:3000/api/market/capital-flow

# 测试Python服务健康检查
curl http://100.80.210.104:8000/health
```

### 3. 测试CORS配置
```bash
curl -I -H "Origin: http://100.80.210.104:3000" http://100.80.210.104:8000/health
# 应该包含: access-control-allow-origin: http://100.80.210.104:3000
```

## 完整启动流程

```bash
# 1. 启动 Python 数据服务
cd data-service
python3 main.py > /tmp/python-service.log 2>&1 &

# 2. 启动 Next.js 应用
cd ..
npm run dev

# 3. 验证服务状态
lsof -nP -iTCP:3000,8000 -sTCP:LISTEN
```

## 其他注意事项

### macOS 防火墙
如果仍然无法访问，检查 macOS 防火墙设置：
- 系统偏好设置 → 安全性与隐私 → 防火墙
- 确保允许 node 和 Python 接受传入连接

### 网络配置
- 确保两台电脑在同一局域网内
- 验证IP地址：`ifconfig | grep "inet 100.80.210.104"`

### 浏览器缓存
- 在其他电脑上使用无痕模式访问
- 或清除浏览器缓存后重试

## 当前服务状态

✅ Next.js: `http://0.0.0.0:3000` (监听所有网络接口)
✅ Python 数据服务: `http://0.0.0.0:8000` (监听所有网络接口)
✅ CORS: 已配置允许内网IP访问
✅ API 数据: 正常返回市场数据

## 日期
2026-07-20
