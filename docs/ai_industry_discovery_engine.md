# AI Industry Discovery Engine（产业探索引擎）设计方案

**Version 1.0**  
**目标**：利用 AI + Web Search + Knowledge Graph，自动探索任意产业，持续构建并更新产业知识图谱，最终生成产业全景图，并支持投资分析。

---

## 一、项目背景

当前产业图谱多依赖人工整理，更新缓慢、验证困难。  
本项目目标是构建一个能够**自动发现、验证、更新**产业知识，并生成产业全景图的系统。

---

## 二、总体目标

打造 **Industry Discovery Engine**，而非静态产业图生成器。  
支持任意产业输入，自动输出：

- 产业结构
- 上下游关系
- 龙头企业
- 供应链
- 投资映射
- 动态图谱

---

## 三、总体架构

采用 **四层架构**：

1. **Discovery（发现）**
2. **Validation（验证）**
3. **Knowledge Graph（知识图谱）**
4. **Visualization（可视化）**

---

## 四、标准 Pipeline

产业输入 → 定义边界 → 探索产业结构 → 细分赛道 → 龙头企业 → 上下游关系 → 新闻政策 → 资金流 → 多来源验证 → 知识图谱 → 自动生成产业图。

---

## 五、Discovery Layer（发现层）

包含以下发现模块，均采用 **AI + 网页搜索** 进行持续递归探索：

- Scope Discovery（边界发现）
- Segment Discovery（赛道发现）
- Company Discovery（企业发现）
- Relation Discovery（关系发现）
- Event Discovery（事件发现）
- Investment Discovery（投资发现）

---

## 六、Recursive Search（递归搜索）

不是一次性搜索，而是循环执行：  
**搜索 → 总结 → 发现遗漏 → 再搜索**，直到覆盖率达到预设目标。

---

## 七、Validation Layer（验证层）

- 多来源交叉验证
- 证据保存
- 可信度评分（Confidence）
- 每条关系均保留来源与时间戳

---

## 八、Knowledge Graph（知识图谱）

统一管理以下节点类型：

- Industry（产业）
- Segment（细分领域）
- Technology（技术）
- Product（产品）
- Company（企业）
- Stock（股票）
- Policy（政策）
- News（新闻）
- Patent（专利）
- Event（事件）

以及它们之间的各类关系。

---

## 九、Graph Schema（关系模式）

支持的关系类型包括（但不限于）：

- `contains`
- `includes`
- `develops`
- `produces`
- `supplies`
- `customer_of`
- `competes_with`
- `affects`
- `belongs_to`

---

## 十、Visualization（可视化）

支持多种视图展示：

- 产业全景图
- 知识图谱
- 投资分析视图

可选技术栈：

- Neo4j
- AntV G6
- React Flow

---

## 十一、AI Agent（智能代理）

系统拆分为多个专用 Agent：

- Scope Agent
- Structure Agent
- Segment Agent
- Company Agent
- Relation Agent
- Event Agent
- Validation Agent
- Graph Agent

---

## 十二、Coverage（覆盖率）

为每个产业节点计算**探索完成度**，根据覆盖率自动决定是否继续搜索。
