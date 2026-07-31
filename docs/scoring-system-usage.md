# 评分系统使用指南

## 概述

跨行业知识图谱评分系统为每个节点提供0-100分的综合评分，基于三个维度：
- 市场基本面 (50%)
- 新闻舆情面 (30%)
- 图谱结构面 (20%)

## 子图结构

系统包含10个行业子图：
1. AI算力 (`ai_compute`)
2. 新能源汽车 (`new_energy_vehicle`)
3. 创新药/医疗器械 (`biotech_medical`)
4. 消费电子 (`consumer_electronics`)
5. 军工航天 (`defense_aerospace`)
6. 储能/电力设备 (`energy_storage`)
7. 机器人/自动化 (`robotics`)
8. 数字经济 (`digital_economy`)
9. 先进材料 (`advanced_materials`)
10. 消费 (`consumer`)

## API接口

### 获取节点评分详情

```bash
GET /api/graph/nodes/[id]/score
```

返回节点的完整评分信息，包括历史记录和关联ETF。

### 获取评分排行榜

```bash
GET /api/graph/scores/ranking?subGraphId=ai_compute&limit=10&trend=up
```

参数：
- `subGraphId`: 过滤指定子图
- `limit`: 返回数量 (最大50)
- `sortBy`: `totalScore` 或 `scoreUpdatedAt`
- `trend`: `up`, `down`, 或 `stable`

### 触发评分更新

```bash
POST /api/graph/scores/update
Content-Type: application/json

{
  "nodeIds": ["node1", "node2"],
  "trigger": "news"
}
```

触发类型: `news`, `market`, `structure`, `manual`

### Dashboard洞察数据

```bash
GET /api/dashboard/graph-insights
```

返回热度TOP10、子图健康度、跨行业传导热力图。

## 前端组件

### Dashboard集成

访问 `/dashboard` 查看"知识图谱洞察"区块，包含：
- 热度上升TOP10表格
- 子图健康度卡片
- 实时数据刷新

## 评分计算

### 初始化评分

```bash
npm run calc-scores
```

为所有节点计算初始评分。

### 增量更新

评分系统支持增量更新：
- **新闻接入**: 自动触发新闻面评分更新
- **市场数据刷新**: 每日收盘后更新市场面
- **图谱结构变化**: 节点/边修改时更新结构面

## 评分解读

- **80-100分**: 强势板块，高度关注
- **60-79分**: 活跃板块，持续关注
- **40-59分**: 平稳板块，选择性关注
- **0-39分**: 冷门板块，低优先级

## 故障排查

### 评分为0

检查节点是否有：
- 关联的新闻链接 (NewsGraphLink)
- 图谱连接 (GraphEdge)
- 市场数据映射

### API响应慢

- 检查数据库索引
- 考虑增加缓存层
- 减少返回的历史记录数量

---

**版本**: Phase 1
**更新时间**: 2026-07-31
