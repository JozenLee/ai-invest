# KOL监控系统 - 快速开始

## 🎯 5分钟上手指南

### 步骤1: 启动服务

```bash
# 终端1: 启动后端服务
cd data-service
python main.py

# 终端2: 启动前端服务
npm run dev
```

### 步骤2: 添加第一个KOL

访问 http://localhost:3000/events/influencers，点击"添加大V"按钮

**推荐KOL示例**:

#### 微博平台
- **名称**: 半导体行业观察
- **平台**: weibo
- **账号ID**: 从微博用户主页URL提取
- **分类**: tech
- **标签**: 半导体, 芯片, AI

#### B站平台
- **名称**: 科技宅小明
- **平台**: bilibili  
- **账号ID**: 从B站空间URL提取
- **分类**: tech
- **标签**: AI, 消费电子, 科技

### 步骤3: 触发内容抓取

在KOL列表页面，点击任意KOL的"抓取"按钮，系统将：
1. 调用对应平台的Provider获取最新内容
2. MD5去重避免重复
3. 存储到InfluencerPost表
4. 返回抓取统计

### 步骤4: 查看AI分析

系统自动启动后台Worker进行AI分析：
- 3个Worker并发处理
- 14维度深度分析
- 结果存储到InfluencerOpinion表

访问KOL详情页查看：
- 最新观点列表
- 情感倾向分布
- 置信度评分

### 步骤5: 观点聚合查询

```bash
# 查看芯片领域最近7天的观点聚合
curl 'http://localhost:8000/api/influencers/opinions/aggregated?domain=chip&window=7d'

# 查看显示屏领域最近30天的观点
curl 'http://localhost:8000/api/influencers/opinions/aggregated?domain=display&window=30d'
```

## 📖 常用操作

### 批量抓取所有活跃KOL
```bash
curl -X POST http://localhost:8000/api/influencers/batch/fetch
```

### 查询KOL统计信息
```bash
curl http://localhost:8000/api/influencers/stats
```

### 获取特定KOL的内容列表
```bash
curl 'http://localhost:8000/api/influencers/{id}/posts?limit=20'
```

## 🔧 配置调优

### 调整抓取频率

编辑KOL的`fetchInterval`字段（单位：分钟）：
- 高优先级KOL: 15-30分钟
- 中优先级KOL: 60分钟
- 低优先级KOL: 120-240分钟

### 调整AI Worker数量

编辑 `data-service/workers/influencer_ai_queue.py`:
```python
# 修改worker数量（默认3）
self.num_workers = 5  # 增加到5个并发worker
```

### 配置Claude API

编辑项目根目录的 `.env` 文件:
```bash
ANTHROPIC_API_KEY=your_api_key_here
ENABLE_AI_ANALYSIS=true
```

## 🎨 前端界面说明

### KOL列表页
- **搜索**: 按名称或账号ID搜索
- **筛选**: 按平台筛选（全部/微博/B站）
- **分页**: 默认每页20条
- **状态**: 显示最后抓取时间和状态

### KOL详情页
- **基本信息**: 名称、平台、账号、分类
- **抓取记录**: 历史抓取日志
- **内容列表**: 已抓取的内容
- **观点分析**: AI分析结果

### 添加KOL页
- **表单验证**: 必填字段检查
- **平台选择**: 微博/B站
- **高级配置**: 抓取间隔、优先级

## 🐛 常见问题

### Q: 抓取失败怎么办？
A: 检查以下几点：
1. 账号ID是否正确
2. 平台API是否可访问
3. 查看后端日志: `data-service/logs/`
4. 检查InfluencerFetchLog表的错误信息

### Q: AI分析太慢？
A: 优化方案：
1. 增加Worker数量
2. 使用更快的Claude模型
3. 启用批量分析模式

### Q: 如何添加新平台支持？
A: 步骤：
1. 在`data-service/providers/`创建新Provider
2. 实现`fetch_posts()`方法
3. 在`InfluencerFetchService`注册
4. 添加单元测试

### Q: 数据库文件在哪？
A: `prisma/dev.db`，使用SQLite Browser可视化查看

## 📊 监控指标

访问健康检查端点查看系统状态：
```bash
curl http://localhost:8000/health
```

返回信息：
- `status`: 服务状态
- `scheduler_running`: 调度器状态
- `active_jobs`: 活跃任务数

查看数据库统计：
```bash
sqlite3 prisma/dev.db "
SELECT 
  (SELECT COUNT(*) FROM Influencer) as total_kols,
  (SELECT COUNT(*) FROM InfluencerPost) as total_posts,
  (SELECT COUNT(*) FROM InfluencerOpinion) as total_opinions;
"
```

## 🚀 生产部署

### 环境变量配置
```bash
# .env.production
DATABASE_URL="file:./prod.db"
ANTHROPIC_API_KEY="sk-ant-..."
ENABLE_AI_ANALYSIS="true"
LOG_LEVEL="INFO"
```

### 使用systemd管理服务
```bash
# /etc/systemd/system/kol-backend.service
[Unit]
Description=KOL Monitoring Backend
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/ai-invest/data-service
ExecStart=/usr/bin/python3 main.py
Restart=always

[Install]
WantedBy=multi-user.target
```

### Nginx反向代理
```nginx
location /api/influencers {
    proxy_pass http://localhost:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

## 📚 进阶阅读

- [完整系统文档](./kol-monitoring-system.md)
- [API接口文档](http://localhost:8000/docs)
- [数据模型设计](../prisma/schema.prisma)

---

**需要帮助？** 查看日志文件或提issue到项目仓库
