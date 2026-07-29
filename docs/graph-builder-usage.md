# 知识图谱构建器使用指南

## 概述

知识图谱构建器是一个AI辅助的图谱构建工具，可以从研报、新闻等文本中自动提取实体和关系，经过人工审核后应用到知识图谱。

## 工作流程

```
文本输入 → AI抽取 → 规则验证 → 生成建议 → 人工审核 → 应用到图谱
```

## 使用步骤

### 1. 触发抽取任务

**API方式**:

```bash
curl -X POST http://localhost:3000/api/graph/extract \
  -H "Content-Type: application/json" \
  -d '{
    "text": "NVIDIA是GPU设计领域的领导者...",
    "type": "news",
    "metadata": {
      "title": "新闻标题",
      "source": "来源"
    }
  }'
```

**响应**:

```json
{
  "success": true,
  "data": {
    "jobId": "clx...",
    "suggestionsCreated": 5,
    "tokensUsed": 1234,
    "durationMs": 3456
  }
}
```

### 2. 审核建议

访问审核工作台: `http://localhost:3000/graph/review`

**功能**:
- 查看AI生成的建议列表
- 按类型、来源、置信度筛选
- 查看详细信息和支撑证据
- 批准或拒绝建议
- 批量操作

### 3. 查看抽取任务

**API方式**:

```bash
curl http://localhost:3000/api/graph/extraction-jobs?status=completed
```

## AI抽取规则

### 实体类型

- **产业链环节**: chip_design, wafer_foundry, packaging, equipment, material等
- **技术领域**: HBM, CPO, 液冷, 光模块等
- **公司和产品**: 相关企业

### 关系类型

- **supply_chain**: 供应链关系（上下游）
- **demand_driver**: 需求驱动
- **tech_evolution**: 技术演进
- **competition**: 竞争关系
- **complement**: 互补关系
- **policy_impact**: 政策影响

### 置信度阈值

- **≥0.9**: 很高 - 可自动批准
- **0.7-0.9**: 高 - 建议批准
- **0.5-0.7**: 中等 - 需仔细审核
- **<0.5**: 低 - 建议拒绝

## 规则引擎

系统内置验证和推理规则：

### 验证规则

1. **供应链方向检查**: supply_chain关系不应为负向
2. **层级一致性**: 父节点层级必须小于子节点
3. **置信度范围**: 0-1之间
4. **权重范围**: 0-1之间

### 推理规则

1. **间接关系推断**: 如果A→B→C，自动推断A→C的间接关系

## 最佳实践

### 审核建议

1. **优先审核高置信度建议** (≥0.8)
2. **检查支撑证据** - 确保有明确的文本依据
3. **批量操作** - 提高效率
4. **定期清理** - 及时处理pending状态的建议

### 抽取优化

1. **文本预处理** - 去除无关内容
2. **提供上下文** - 在metadata中包含标题、来源等
3. **控制长度** - 过长文本建议分段抽取
4. **监控成本** - 查看tokensUsed，控制API调用

## 故障排查

### 抽取失败

**问题**: Job状态为failed

**解决**:
1. 检查errorMessage字段
2. 确认ANTHROPIC_API_KEY已配置
3. 验证文本格式是否正确
4. 检查API限额

### 建议应用失败

**问题**: 批准后未创建节点/边

**解决**:
1. 检查数据库约束
2. 验证节点名称是否唯一
3. 确认边的source/target节点存在
4. 查看GraphChangeLog中的错误

### 置信度过低

**问题**: 大量低置信度建议

**解决**:
1. 改进文本质量
2. 提供更多上下文信息
3. 调整prompt（需修改代码）
4. 增加专家规则

## API参考

### POST /api/graph/extract

触发AI抽取任务

**请求**:
```json
{
  "text": "string (required)",
  "type": "report | news | article",
  "metadata": {
    "title": "string",
    "source": "string",
    "publishDate": "ISO date"
  }
}
```

### GET /api/graph/suggestions

获取建议列表

**Query Params**:
- `status`: pending | approved | rejected | applied
- `source`: ai_extraction | rule_inference | market_data
- `type`: add_node | add_edge | update_node | update_edge
- `minConfidence`: 0-1
- `limit`: number

### POST /api/graph/suggestions/batch

批量审核

**请求**:
```json
{
  "action": "approve | reject",
  "suggestionIds": ["string"],
  "reviewedBy": "string",
  "note": "string (optional)"
}
```

### PATCH /api/graph/suggestions/[id]

单个审核

**请求**:
```json
{
  "action": "approve | reject",
  "reviewedBy": "string",
  "note": "string (optional)"
}
```

### GET /api/graph/extraction-jobs

获取抽取任务列表

**Query Params**:
- `status`: pending | processing | completed | failed
- `sourceType`: report | news | article
- `limit`: number

---

**更新日期**: 2026-07-30
**版本**: Phase 1
