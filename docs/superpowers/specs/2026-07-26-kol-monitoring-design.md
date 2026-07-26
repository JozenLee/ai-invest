# 大V监控系统 - 详细设计文档

**版本**: 1.0  
**日期**: 2026-07-26  
**状态**: 设计完成，待审核

---

## 一、项目概述

### 1.1 背景

为AI投资分析系统增加大V监控功能，通过追踪主流平台（微博、B站、小红书、知乎、抖音、支付宝）上的行业大V动态，实时收集和分析他们的观点，为投资决策提供更多维度的参考信息。

### 1.2 目标

- **多平台支持**: 覆盖6大主流平台的大V监控
- **智能分析**: 使用Claude AI深度分析大V观点，提取结构化信息
- **观点聚合**: 按领域聚合观点，生成趋势分析、共识和分歧点
- **无缝集成**: 与现有的新闻趋势分析系统深度集成，增强AI分析能力

### 1.3 核心价值

1. **信息维度扩展**: 从传统媒体新闻扩展到KOL观点
2. **市场情绪洞察**: 通过大V观点分布了解市场真实情绪
3. **决策参考增强**: 为AI投资分析提供更丰富的数据输入

---

## 二、系统架构

### 2.1 整体架构图

```
┌──────────────────────────────────────────────────────────────────┐
│                         前端层 (Next.js)                          │
│  ┌─────────────────┐  ┌──────────────────┐  ┌─────────────────┐ │
│  │ 大V监控列表页    │  │ 大V详情页         │  │ 领域趋势页增强   │ │
│  │ /events/        │  │ /events/         │  │ /events/trends/ │ │
│  │ influencers     │  │ influencers/[id] │  │ [domain]        │ │
│  └─────────────────┘  └──────────────────┘  └─────────────────┘ │
└────────────────────────────┬─────────────────────────────────────┘
                             │ REST API
┌────────────────────────────┴─────────────────────────────────────┐
│                      API层 (Next.js + FastAPI)                    │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │ Next.js API Routes: /api/influencers/*                       ││
│  │ - 查询接口：列表、详情、动态、观点统计                         ││
│  └──────────────────────────────────────────────────────────────┘│
│  ┌──────────────────────────────────────────────────────────────┐│
│  │ FastAPI Routes: /api/influencers/*                           ││
│  │ - 管理接口：CRUD、采集触发、配置管理                           ││
│  └──────────────────────────────────────────────────────────────┘│
└────────────────────────────┬─────────────────────────────────────┘
                             │
┌────────────────────────────┴─────────────────────────────────────┐
│                    业务逻辑层 (Python Services)                    │
│  ┌─────────────────┐  ┌──────────────────┐  ┌─────────────────┐ │
│  │ProviderManager  │  │InfluencerFetch   │  │InfluencerAnalysis│ │
│  │ 平台Provider管理 │  │ Service          │  │ Service          │ │
│  │ - API/Crawler   │  │ 采集调度服务      │  │ AI分析服务        │ │
│  └─────────────────┘  └──────────────────┘  └─────────────────┘ │
│  ┌─────────────────┐  ┌──────────────────┐  ┌─────────────────┐ │
│  │OpinionAggregation│ │InfluencerAI      │  │SchedulerService │ │
│  │ Service          │  │ Queue            │  │ 定时任务调度      │ │
│  │ 观点聚合分析      │  │ 独立AI队列        │  │                  │ │
│  └─────────────────┘  └──────────────────┘  └─────────────────┘ │
└────────────────────────────┬─────────────────────────────────────┘
                             │
┌────────────────────────────┴─────────────────────────────────────┐
│                   数据访问层 (Prisma + SQLite)                     │
│  Influencer | InfluencerPost | DomainInfluencer                  │
│  DataSource | SchedulerJob | Domain                              │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 数据流

1. **采集流程**: 定时任务 → Provider → 数据清洗 → 数据库 → AI队列
2. **分析流程**: AI队列 → Worker → Claude分析 → 结构化存储
3. **聚合流程**: 用户请求 → 查询数据库 → 聚合计算 → 返回结果
4. **展示流程**: 前端 → API → 聚合服务 → 渲染组件

---

## 三、核心模块设计

### 3.1 Provider插件系统

#### 3.1.1 设计理念

采用插件化架构，每个平台实现统一接口，支持API和爬虫两种驱动模式。

#### 3.1.2 基类定义

```python
class BaseInfluencerProvider(ABC):
    """大V Provider基类"""
    
    @abstractmethod
    async def fetch_user_info(self, account_id: str) -> Dict:
        """获取用户信息"""
        pass
    
    @abstractmethod
    async def fetch_user_posts(
        self, 
        account_id: str, 
        since: Optional[datetime] = None,
        limit: int = 20
    ) -> List[Dict]:
        """获取用户动态列表"""
        pass
    
    @abstractmethod
    async def validate_account(self, account_id: str) -> bool:
        """验证账号是否存在"""
        pass
```

#### 3.1.3 平台实现

| 平台 | API支持 | 爬虫支持 | 实施优先级 | 说明 |
|------|---------|----------|-----------|------|
| 微博 | ✅ 开放平台API | ✅ 移动端API | P0（第1周） | API成熟，文档完善 |
| B站 | ✅ 公开API | ❌ | P0（第1周） | API稳定，易实现 |
| 小红书 | ❌ | ✅ 需签名 | P1（第2周） | 需要逆向签名算法 |
| 知乎 | ✅ 半公开API | ✅ | P1（第2周） | API相对稳定 |
| 抖音 | ❌ | ✅ 需逆向 | P2（第3周） | 技术难度高，后续实现 |
| 支付宝 | ✅ 企业API | ❌ | P2（第3周） | 需要企业认证 |

**实施建议**: 第一阶段先完成微博和B站（P0），快速验证系统可行性；第二阶段添加小红书和知乎（P1）；第三阶段补充抖音和支付宝（P2）。

#### 3.1.4 注册中心

```python
class InfluencerProviderRegistry:
    """Provider注册中心"""
    
    _providers = {
        'weibo_api': WeiboProvider,
        'weibo_crawler': WeiboCrawlerProvider,
        'xiaohongshu_crawler': XiaohongshuCrawlerProvider,
        'bilibili_api': BilibiliProvider,
        'zhihu_api': ZhihuProvider,
        'douyin_crawler': DouyinCrawlerProvider,
        'alipay_api': AlipayProvider,
    }
```

---

### 3.2 采集服务

#### 3.2.1 核心功能

- 单个大V采集
- 批量采集（按优先级分组）
- 数据去重
- 快速入库
- 任务发布到AI队列

#### 3.2.2 采集策略

**按优先级分层**:
- **高优先级**: 每15分钟采集一次
- **中优先级**: 每1小时采集一次
- **低优先级**: 每4小时采集一次

**优先级判定标准**:
- 大V影响力（粉丝数、互动量）
- 发布频率
- 领域相关性
- 手动设置

#### 3.2.3 流程图

```
采集触发 → 获取大V配置 → 选择Provider → 调用API/爬虫
    ↓
数据标准化 → 去重检查 → 批量入库 → 发布到AI队列 → 返回结果
```

---

### 3.3 AI分析服务

#### 3.3.1 分析维度

**观点分析**:
- 核心摘要（50字以内）
- 立场判断（看多/看空/中性）
- 置信度评分（0-1）
- 主要论点提取

**论据分析**:
- 论据列表
- 数据来源
- 可信度评分（0-1）

**领域匹配**:
- 主要领域
- 次要领域
- 相关度评分

**情感分析**:
- 整体情感（-1到1）
- 短期/长期情感

**风险识别**:
- 风险点列表
- 投资影响描述

**一致性检查**:
- 与历史观点对比
- 观点变化识别

#### 3.3.2 提示词设计

```
你是一位专业的投资分析师，需要分析以下大V的观点动态。

【大V信息】
- 姓名：{name}
- 平台：{platform}
- 擅长领域：{category}

【动态内容】
{content}

请按以下JSON格式进行深度分析：
{
  "opinion": {...},
  "evidence": {...},
  "domains": {...},
  "sentiment": {...},
  "risks": [...],
  "investment_implications": "...",
  "consistency_check": {...}
}
```

#### 3.3.3 输出结构

所有分析结果以结构化JSON存储在数据库中，便于后续聚合和查询。

---

### 3.4 独立AI队列

#### 3.4.1 设计原因

- 大V观点价值高，需要独立保证处理质量
- 采集频率和数量与新闻不同
- 便于单独监控和调优

#### 3.4.2 队列参数

- **Worker数量**: 3个并发Worker
- **批量大小**: 每次处理5条
- **队列容量**: 最大500条任务
- **超时设置**: 单个分析60秒超时

#### 3.4.3 处理流程

```
任务入队 → Worker获取 → 基础分析 → 一致性检查 → 更新数据库 → 完成
```

---

### 3.5 观点聚合服务

#### 3.5.1 聚合维度

**按领域聚合**:
- 统计看多/看空/中性比例
- 计算平均置信度和情感分数
- 提取高质量观点（Top 10）
- 识别共识和分歧点
- 生成观点时间线

**按大V对比**:
- 对比多个大V的观点
- 计算共识水平
- 识别观点差异

**时间维度**:
- 近3天
- 近7天
- 近30天

#### 3.5.2 质量评分

综合评分 = 置信度 × 0.4 + 论据可信度 × 0.3 + 互动量归一化 × 0.3

#### 3.5.3 共识分析

使用关键词聚类识别相似论点，统计出现频率，提取共识观点。

---

## 四、数据库设计

### 4.1 Schema扩展

#### Influencer表扩展

```prisma
model Influencer {
  id           String   @id @default(cuid())
  name         String
  platform     String   // weibo/bilibili/xiaohongshu/zhihu/douyin/alipay
  accountId    String
  profileUrl   String?
  avatarUrl    String?
  category     String?
  tags         String?  // JSON: 标签数组
  priority     String   @default("medium") // high/medium/low 采集优先级
  fetchInterval Int     @default(60) // 采集间隔（分钟）
  driverType   String   @default("api") // api/crawler
  providerConfig String? // JSON: Provider配置
  isActive     Boolean  @default(true)
  lastFetchAt  DateTime?
  lastFetchStatus String?
  lastFetchError String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  posts   InfluencerPost[]
  domains DomainInfluencer[]

  @@unique([platform, accountId])
  @@index([priority, isActive])
  @@index([lastFetchAt])
}
```

#### InfluencerPost表扩展

```prisma
model InfluencerPost {
  id              String    @id @default(cuid())
  influencerId    String
  content         String
  originalUrl     String?
  publishTime     DateTime
  mediaType       String    @default("text") // text/image/video
  mediaUrls       String?   // JSON: 媒体文件URL数组
  engagement      String?   // JSON: {likes, comments, shares}
  
  // AI分析结果（结构化JSON）
  aiProcessed     Boolean   @default(false)
  aiProcessedAt   DateTime?
  aiError         String?
  
  // 观点分析
  opinionSummary  String?
  opinionStance   String?   // bullish/bearish/neutral
  opinionConfidence Float?  @default(0)
  mainPoints      String?   // JSON
  
  // 论据分析
  arguments       String?   // JSON
  credibilityScore Float?   @default(0)
  
  // 领域关联
  primaryDomain   String?
  secondaryDomains String?  // JSON
  domainScores    String?   // JSON
  
  // 情感分析
  sentiment       Float?
  sentimentAspects String?  // JSON
  
  // 风险与影响
  risks           String?   // JSON
  investmentImplications String?
  
  // 一致性分析
  consistencyChecked Boolean @default(false)
  consistencyData    String? // JSON
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  influencer Influencer @relation(fields: [influencerId], references: [id], onDelete: Cascade)

  @@index([influencerId, publishTime])
  @@index([aiProcessed])
  @@index([primaryDomain, publishTime])
  @@index([opinionStance])
}
```

#### 日志表

```prisma
// 采集日志
model InfluencerFetchLog {
  id             String   @id @default(cuid())
  influencerId   String
  platform       String
  status         String   // success/failed/rate_limited
  postsFetched   Int      @default(0)
  postsNew       Int      @default(0)
  durationMs     Int
  errorMessage   String?
  createdAt      DateTime @default(now())
  
  @@index([influencerId])
  @@index([createdAt])
  @@index([status])
}

// AI分析日志
model InfluencerAnalysisLog {
  id             String   @id @default(cuid())
  postId         String
  influencerId   String
  status         String   // success/failed
  durationMs     Int
  tokensUsed     Int      @default(0)
  errorMessage   String?
  createdAt      DateTime @default(now())
  
  @@index([postId])
  @@index([createdAt])
}
```

---

## 五、API接口设计

### 5.1 管理接口（FastAPI）

#### 大V管理

```
POST   /api/influencers/                  创建大V
GET    /api/influencers/                  获取大V列表
GET    /api/influencers/{id}              获取大V详情
PUT    /api/influencers/{id}              更新大V信息
DELETE /api/influencers/{id}              删除大V
```

#### 采集管理

```
POST   /api/influencers/{id}/fetch        手动触发采集
POST   /api/influencers/batch/fetch       批量采集
```

### 5.2 查询接口（Next.js + FastAPI）

#### 动态查询

```
GET    /api/influencers/{id}/posts        获取大V动态列表
GET    /api/influencers/{id}/timeline     获取观点时间线
```

#### 观点聚合

```
GET    /api/influencers/opinions/domain/{code}?time_window=7d
       获取领域观点聚合

POST   /api/influencers/opinions/compare
       对比多个大V观点
```

#### 监控接口

```
GET    /api/monitoring/influencers/health      健康状态
GET    /api/monitoring/influencers/metrics     监控指标
GET    /api/monitoring/influencers/platforms   平台统计
GET    /api/monitoring/influencers/errors      错误日志
```

---

## 六、前端设计

### 6.1 页面结构

#### 大V监控列表页

- 路径: `/events/influencers`
- 功能: 展示所有大V，支持筛选（平台、分类）、搜索
- 卡片展示: 头像、名称、平台、标签、动态数量

#### 大V详情页

- 路径: `/events/influencers/[id]`
- 功能: 展示大V信息、动态列表、观点统计

#### 领域趋势页集成

- 路径: `/events/trends/[domain]`
- 新增Tab: "大V观点"
- AI分析增强: 融入大V观点数据

### 6.2 核心组件

#### InfluencerOpinionsSection

**功能**:
- 时间窗口切换（3天/7天/30天）
- 观点分布统计可视化
- 观点时间线图表
- 高质量观点列表
- 共识与分歧分析

**数据展示**:
- 看多/看空/中性比例
- 平均置信度
- 参与大V数量
- 观点趋势变化

#### AIInsightSection增强

融入大V观点数据，生成更全面的AI分析报告。

---

## 七、错误处理

### 7.1 重试策略

**指数退避重试**:
- 最大重试次数: 3次
- 基础延迟: 1秒
- 最大延迟: 60秒
- 随机抖动: 启用

### 7.2 异常分类

| 异常类型 | 处理策略 |
|----------|----------|
| 账号不存在 | 停用大V，记录日志 |
| 触发限流 | 延长采集间隔，等待后重试 |
| 认证失败 | 停用大V，通知管理员 |
| 需要验证码 | 通知管理员人工处理 |
| 网络错误 | 重试3次，记录失败 |

### 7.3 限流处理

**各平台限流配置**:
- 微博: 150次/小时
- B站: 100次/分钟
- 小红书: 60次/分钟
- 知乎: 50次/分钟
- 抖音: 30次/分钟

**限流器实现**: 滑动窗口算法

### 7.4 反爬策略

- User-Agent轮换
- 代理池支持
- 随机延迟（1-3秒）
- 请求头随机化
- Cookie定期更新

---

## 八、监控与告警

### 8.1 监控指标

**采集指标**:
- 采集成功率
- 平均采集耗时
- 新增动态数量
- 各平台采集状态

**分析指标**:
- AI分析成功率
- 平均分析耗时
- Token消耗量
- 队列积压情况

**业务指标**:
- 活跃大V数量
- 动态总数
- 各领域覆盖度

### 8.2 告警规则

**采集失败率过高**:
- 条件: 1小时内失败率 > 30%
- 冷却期: 60分钟

**AI队列积压**:
- 条件: 队列大小 > 500
- 冷却期: 30分钟

**认证失败**:
- 条件: 发现认证失败
- 冷却期: 120分钟

### 8.3 日志系统

**日志文件**:
- `influencer.log`: 主日志（按大小轮转）
- `error.log`: 错误日志（按天轮转）
- `fetch.log`: 采集日志（保留7天）
- `analysis.log`: 分析日志（保留7天）

**日志级别**: DEBUG/INFO/WARNING/ERROR

---

## 九、测试策略

### 9.1 单元测试

**覆盖范围**:
- Provider实现
- AI分析服务
- 重试处理器
- 限流器
- 观点聚合逻辑

**测试框架**: pytest + pytest-asyncio

### 9.2 集成测试

**测试场景**:
- 采集流程（Provider → 数据库 → AI队列）
- AI分析流程（队列 → Worker → Claude → 存储）
- 观点聚合流程（查询 → 计算 → 返回）

### 9.3 端到端测试

**完整流程**:
添加大V → 触发采集 → 等待分析 → 获取聚合结果 → 验证数据

### 9.4 测试覆盖率目标

- 核心业务逻辑: > 80%
- Provider实现: > 70%
- 工具类: > 90%

---

## 十、部署指南

### 10.1 环境要求

- Python 3.11+
- Node.js 18+
- SQLite 3.35+

### 10.2 依赖安装

```bash
# Python依赖
pip install -r data-service/requirements.txt

# Node.js依赖
npm install

# 生成Prisma Client
npm run db:generate
```

### 10.3 数据库初始化

```bash
# 运行迁移
npm run db:migrate

# 填充初始数据
node scripts/seed-categories.js
node scripts/seed-domains.js
```

### 10.4 环境变量配置

必须配置:
- `ANTHROPIC_API_KEY`: Claude API密钥
- 至少一个平台的认证信息（Cookie或Token）

可选配置:
- 队列Worker数量
- 采集间隔
- 限流参数
- 日志级别

### 10.5 启动服务

```bash
# 启动数据服务
python data-service/main.py

# 启动Next.js应用
npm run dev
```

### 10.6 健康检查

```bash
# 检查服务健康状态
curl http://localhost:8000/health

# 检查监控指标
curl http://localhost:8000/api/monitoring/influencers/health
```

---

## 十一、性能指标

### 11.1 响应时间目标

| 操作 | 目标时间 | 说明 |
|------|----------|------|
| 单次采集 | < 5秒 | 包含API调用和数据入库 |
| AI分析 | < 30秒 | 单条动态的完整分析 |
| 观点聚合 | < 2秒 | 7天窗口的领域聚合 |
| 批量采集 | < 10分钟 | 100个大V的并发采集 |

### 11.2 吞吐量目标

- AI队列处理能力: 300-600条/小时（3 workers）
- 并发采集数: 最多20个同时进行
- 日处理动态量: 5000-10000条

### 11.3 资源消耗

- 内存占用: < 2GB（数据服务）
- 数据库大小增长: ~500MB/月（假设1000条/天）
- Claude API成本: ~$50-100/月（按5000条动态计）

---

## 十二、风险与挑战

### 11.1 技术风险

**平台API变更**:
- 影响: 采集功能失效
- 应对: 维护API/爬虫双模式，定期测试

**反爬封禁**:
- 影响: 账号被封，无法采集
- 应对: 代理池、限流、Cookie轮换

**AI分析成本**:
- 影响: Claude API费用增加
- 应对: 批量处理、结果缓存、优先级分级

### 11.2 业务风险

**数据质量**:
- 问题: 大V观点可能存在偏差
- 应对: 多样化大V来源，标注数据来源

**法律合规**:
- 问题: 爬虫可能违反平台ToS
- 应对: 优先使用官方API，爬虫仅备用

### 11.3 运维风险

**服务稳定性**:
- 问题: 单点故障
- 应对: 监控告警、自动重启、降级策略

**数据存储**:
- 问题: 数据量增长
- 应对: 定期清理（90天外数据）、归档机制

---

## 十二、后续优化方向

### 12.1 短期优化（1-3个月）

- [ ] 完善抖音和支付宝Provider实现
- [ ] 增加更多大V数据源
- [ ] 优化AI分析提示词
- [ ] 增强观点聚合算法

### 12.2 中期优化（3-6个月）

- [ ] 多模态分析（图片、视频内容理解）
- [ ] 观点关系图谱
- [ ] 大V影响力评分系统
- [ ] 实时推送重要观点

### 12.3 长期规划（6-12个月）

- [ ] 分布式采集架构
- [ ] 时序数据库存储
- [ ] 机器学习预测模型
- [ ] 自动化大V推荐

---

## 十三、总结

本设计文档详细阐述了大V监控系统的完整架构、核心模块、数据流程、接口设计、前端实现、错误处理、监控告警、测试策略和部署指南。

**核心特点**:
1. **插件化架构**: Provider系统易扩展
2. **异步处理**: 独立AI队列保证处理质量
3. **深度分析**: 结构化提取大V观点
4. **无缝集成**: 与现有系统深度融合

**预期效果**:
- 6大平台全覆盖
- 实时观点追踪
- 智能聚合分析
- 增强投资决策

**开发周期**: 4-6周

| 阶段 | 时间 | 任务 | 交付物 |
|------|------|------|--------|
| 第1周 | 1-7天 | Provider基础架构 + 微博/B站实现 | 可采集微博和B站数据 |
| 第2周 | 8-14天 | 小红书/知乎Provider + 数据入库 | 支持4个平台采集 |
| 第3周 | 15-21天 | AI分析服务 + 独立队列 | 动态自动分析 |
| 第4周 | 22-28天 | 观点聚合服务 + 定时调度 | 后端功能完整 |
| 第5周 | 29-35天 | 前端集成 + UI组件 | 用户可见功能 |
| 第6周 | 36-42天 | 测试、优化、文档 | 生产就绪 |

**里程碑检查点**:
- 第2周末: 可成功采集4个平台数据
- 第4周末: 后端核心功能验收测试通过
- 第6周末: 端到端测试通过，正式上线

---

**文档版本历史**:
- v1.0 (2026-07-26): 初始版本，设计完成
