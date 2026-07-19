# 生产环境部署指南

## 🚀 部署准备

### 1. 环境要求

**服务器配置**:
- CPU: 2 核心以上
- 内存: 4GB 以上
- 磁盘: 20GB 以上
- 操作系统: Ubuntu 20.04+ / macOS

**运行时环境**:
- Python 3.9+
- Node.js 18+
- SQLite 3.35+
- Redis 6+ (可选，用于缓存)

### 2. 环境变量配置

创建 `.env.production` 文件：

```bash
# 数据库配置
DATABASE_URL="file:./prisma/dev.db"

# Python 数据服务
PYTHON_API_URL="http://localhost:8000"
DATA_SERVICE_URL="http://localhost:8000"

# AI 服务配置（必需）
ANTHROPIC_API_KEY="your-anthropic-api-key-here"
CLAUDE_MODEL="claude-sonnet-4-20250514"

# Redis 配置（可选，用于缓存）
REDIS_URL="redis://localhost:6379/0"

# Tushare 配置（可选，用于市场数据）
TUSHARE_TOKEN="your-tushare-token-here"

# Next.js 配置
NEXT_PUBLIC_API_URL="http://localhost:3000"

# 日志级别
LOG_LEVEL="info"

# 采集间隔（分钟）
FETCH_INTERVAL=60
```

### 3. 部署步骤

#### Step 1: 克隆代码并安装依赖

```bash
# 1. 克隆仓库（如果是远程）
# git clone <repository-url>
# cd ai-invest

# 2. 安装 Node.js 依赖
npm install

# 3. 安装 Python 依赖
cd data-service
pip3 install -r requirements.txt
cd ..
```

#### Step 2: 数据库初始化

```bash
# 1. 生成 Prisma Client
npx prisma generate

# 2. 运行数据库迁移
npx prisma migrate deploy

# 3. 执行性能优化脚本
sqlite3 prisma/dev.db < prisma/migrations/add_performance_indexes.sql
sqlite3 prisma/dev.db < prisma/migrations/create_fts5_index.sql

# 4. 初始化种子数据
npx prisma db seed
```

#### Step 3: 构建前端应用

```bash
# 生产环境构建
npm run build

# 验证构建
ls -lh .next/
```

#### Step 4: 启动服务

##### 方式 1: 使用 PM2（推荐）

```bash
# 安装 PM2
npm install -g pm2

# 启动 Python 数据服务
pm2 start data-service/main.py --name ai-invest-data --interpreter python3

# 启动 Next.js 服务
pm2 start npm --name ai-invest-web -- start

# 查看服务状态
pm2 status

# 查看日志
pm2 logs

# 设置开机自启
pm2 startup
pm2 save
```

##### 方式 2: 使用 Systemd

创建 `/etc/systemd/system/ai-invest-data.service`:

```ini
[Unit]
Description=AI Invest Data Service
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/path/to/ai-invest/data-service
Environment="ANTHROPIC_API_KEY=your-key"
ExecStart=/usr/bin/python3 main.py
Restart=always

[Install]
WantedBy=multi-user.target
```

创建 `/etc/systemd/system/ai-invest-web.service`:

```ini
[Unit]
Description=AI Invest Web Service
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/path/to/ai-invest
Environment="NODE_ENV=production"
ExecStart=/usr/bin/npm start
Restart=always

[Install]
WantedBy=multi-user.target
```

启动服务：

```bash
sudo systemctl daemon-reload
sudo systemctl start ai-invest-data
sudo systemctl start ai-invest-web
sudo systemctl enable ai-invest-data
sudo systemctl enable ai-invest-web
```

##### 方式 3: Docker（推荐生产环境）

参考 `DEPLOYMENT.docker.md`

### 4. 验证部署

```bash
# 检查 Python 数据服务
curl http://localhost:8000/health

# 检查 Next.js 服务
curl http://localhost:3000/api/health

# 检查 AI 服务
curl http://localhost:8000/api/ai/health

# 检查搜索服务
curl http://localhost:8000/api/search/stats

# 检查缓存服务
curl http://localhost:8000/api/cache/health
```

### 5. Nginx 反向代理（推荐）

创建 `/etc/nginx/sites-available/ai-invest`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Next.js 前端
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Python 数据服务 API
    location /api/data/ {
        rewrite ^/api/data/(.*)$ /api/$1 break;
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # 静态资源缓存
    location /_next/static/ {
        proxy_pass http://localhost:3000;
        proxy_cache_valid 200 365d;
        add_header Cache-Control "public, immutable";
    }
}
```

启用配置：

```bash
sudo ln -s /etc/nginx/sites-available/ai-invest /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 6. SSL 证书（HTTPS）

```bash
# 使用 Certbot 自动配置 SSL
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### 7. 监控与日志

#### 日志位置

- Python 服务日志: `pm2 logs ai-invest-data`
- Next.js 服务日志: `pm2 logs ai-invest-web`
- Nginx 日志: `/var/log/nginx/access.log` 和 `/var/log/nginx/error.log`

#### 监控端点

- 健康检查: `/health`
- 系统统计: `/api/stats/dashboard`
- 缓存统计: `/api/cache/stats`
- 搜索统计: `/api/search/stats`

### 8. 定期维护

#### 数据库维护

```bash
# 数据库优化（每周）
sqlite3 prisma/dev.db "VACUUM;"
sqlite3 prisma/dev.db "ANALYZE;"

# 清理过期新闻（每天，通过 API）
curl -X POST http://localhost:8000/api/news/cleanup

# 重建搜索索引（按需）
curl -X POST http://localhost:8000/api/search/rebuild
```

#### 日志清理

```bash
# PM2 日志清理
pm2 flush

# Nginx 日志轮转（自动配置）
sudo logrotate -f /etc/logrotate.d/nginx
```

### 9. 性能调优

#### Python 服务

编辑 `data-service/main.py`，调整 uvicorn 配置：

```python
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        workers=4,  # CPU 核心数
        log_level="info"
    )
```

#### Next.js 服务

编辑 `next.config.js`：

```javascript
module.exports = {
  reactStrictMode: true,
  compress: true,
  poweredByHeader: false,
  generateEtags: true,
  
  // 性能优化
  experimental: {
    optimizeCss: true,
  },
}
```

### 10. 备份策略

#### 数据库备份

```bash
# 创建备份脚本 /usr/local/bin/backup-ai-invest.sh
#!/bin/bash
BACKUP_DIR="/backups/ai-invest"
DATE=$(date +%Y%m%d-%H%M%S)
mkdir -p $BACKUP_DIR

# 备份数据库
cp /path/to/ai-invest/prisma/dev.db $BACKUP_DIR/dev.db.$DATE

# 保留最近 7 天的备份
find $BACKUP_DIR -name "dev.db.*" -mtime +7 -delete

echo "Backup completed: dev.db.$DATE"
```

```bash
# 添加到 crontab（每天凌晨 2 点）
0 2 * * * /usr/local/bin/backup-ai-invest.sh
```

### 11. 安全建议

1. **环境变量安全**
   - 不要提交 `.env.production` 到版本控制
   - 使用环境变量管理工具（如 Vault）

2. **API 安全**
   - 配置 CORS 白名单
   - 添加 API 请求限流
   - 使用 API 密钥认证

3. **数据库安全**
   - 定期备份
   - 设置文件权限（600）
   - 加密敏感数据

4. **网络安全**
   - 启用 HTTPS
   - 配置防火墙
   - 使用 fail2ban 防止暴力破解

### 12. 故障排查

#### Python 服务无法启动

```bash
# 查看详细错误
cd data-service
python3 main.py

# 检查端口占用
lsof -i :8000

# 检查依赖
pip3 list | grep -E "fastapi|uvicorn|anthropic"
```

#### Next.js 构建失败

```bash
# 清理缓存重新构建
rm -rf .next node_modules
npm install
npm run build
```

#### 数据库错误

```bash
# 检查数据库文件权限
ls -l prisma/dev.db

# 重新生成 Prisma Client
npx prisma generate

# 验证数据库结构
sqlite3 prisma/dev.db ".schema"
```

### 13. 扩展性建议

1. **水平扩展**
   - 使用 Nginx 负载均衡
   - 多个 Python 服务实例
   - Redis 共享缓存

2. **数据库迁移**
   - SQLite → PostgreSQL（大规模数据）
   - 读写分离
   - 分库分表

3. **性能监控**
   - 添加 APM（Application Performance Monitoring）
   - 使用 Prometheus + Grafana
   - 日志聚合（ELK Stack）

---

## 📝 部署检查清单

在部署前，确保完成以下检查：

- [ ] 所有测试通过
- [ ] 环境变量已配置
- [ ] 数据库已初始化
- [ ] 生产环境构建成功
- [ ] 服务已启动并运行
- [ ] 健康检查端点正常
- [ ] Nginx 反向代理配置
- [ ] SSL 证书已安装
- [ ] 日志系统正常
- [ ] 备份策略已设置
- [ ] 监控告警已配置

---

## 🆘 技术支持

- 文档: `docs/`
- 测试脚本: `scripts/`
- 问题追踪: GitHub Issues

---

**祝部署顺利！🚀**
