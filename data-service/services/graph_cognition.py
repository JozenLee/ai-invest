"""Deterministic cognition gates for AI-generated industry structures.

The model proposes a graph; this module decides whether the proposal is coherent
enough to enter human review. It never invents missing facts or relationships.
"""
from collections import Counter, defaultdict, deque
from typing import Any, Dict, List

from models.industry_models import IndustryStructure


EXPECTED_STAGES = ("upstream", "midstream", "downstream")


def assess_structure_cognition(structure: IndustryStructure) -> Dict[str, Any]:
    stages = structure.structure
    segments = [segment for stage in stages for segment in stage.segments]
    codes = [segment.code for segment in segments]
    names = [segment.name.strip() for segment in segments]
    code_set = set(codes)
    relations = structure.relationships
    evidenced = [relation for relation in relations if relation.evidence_urls]
    valid_relations = [
        relation for relation in relations
        if relation.from_segment in code_set
        and relation.to_segment in code_set
        and relation.from_segment != relation.to_segment
    ]

    stage_codes = [stage.stage_code for stage in stages]
    stage_of = {
        segment.code: stage.stage_code
        for stage in stages
        for segment in stage.segments
    }
    cross_stage_pairs = {
        (stage_of.get(relation.from_segment), stage_of.get(relation.to_segment))
        for relation in valid_relations
    }

    adjacency: Dict[str, List[str]] = defaultdict(list)
    for relation in valid_relations:
        adjacency[relation.from_segment].append(relation.to_segment)
        adjacency[relation.to_segment].append(relation.from_segment)
    visited = set()
    if codes:
        queue = deque([codes[0]])
        while queue:
            code = queue.popleft()
            if code in visited:
                continue
            visited.add(code)
            queue.extend(adjacency.get(code, []))

    described = [segment for segment in segments if len(segment.description.strip()) >= 8]
    categorized = [segment for segment in segments if segment.key_categories]
    duplicate_relation_keys = Counter(
        (relation.from_segment, relation.to_segment, relation.type)
        for relation in valid_relations
    )

    issues: List[str] = []
    if set(EXPECTED_STAGES) - set(stage_codes):
        issues.append("缺少标准上游/中游/下游阶段")
    if len(stages) != len(set(stage_codes)):
        issues.append("阶段代码重复")
    if len(segments) < 6:
        issues.append("产业环节少于6个")
    if len(codes) != len(code_set):
        issues.append("产业环节代码重复")
    if len(names) != len(set(names)):
        issues.append("产业环节名称重复")
    if segments and len(described) / len(segments) < 0.8:
        issues.append("至少20%的环节缺少明确价值功能描述")
    if segments and len(categorized) / len(segments) < 0.8:
        issues.append("至少20%的环节缺少核心产品或技术类别")
    relation_target = max(2, len(segments) // 2)
    if len(valid_relations) < relation_target:
        issues.append(f"有效传导关系少于{relation_target}条")
    if valid_relations and len(evidenced) / len(valid_relations) < 0.5:
        issues.append("关系证据覆盖低于50%")
    if any(count > 1 for count in duplicate_relation_keys.values()):
        issues.append("存在重复传导关系")
    if segments and len(visited) / len(segments) < 0.7:
        issues.append("产业拓扑中孤立环节过多")
    if "upstream" in stage_codes and "midstream" in stage_codes and not any(
        source == "upstream" and target == "midstream" for source, target in cross_stage_pairs
    ):
        issues.append("缺少上游到中游的主干传导关系")
    if "midstream" in stage_codes and "downstream" in stage_codes and not any(
        source == "midstream" and target == "downstream" for source, target in cross_stage_pairs
    ):
        issues.append("缺少中游到下游的主干传导关系")

    dimension_scores = {
        "structure": min(1.0, len(segments) / 8) * (1.0 if set(EXPECTED_STAGES).issubset(stage_codes) else 0.6),
        "definition": ((len(described) + len(categorized)) / (2 * len(segments))) if segments else 0.0,
        "topology": min(1.0, len(valid_relations) / relation_target) * ((len(visited) / len(segments)) if segments else 0.0),
        "evidence": (len(evidenced) / len(valid_relations)) if valid_relations else 0.0,
    }
    score = round(sum(dimension_scores.values()) / len(dimension_scores) * 100, 1)
    return {
        "passed": not issues,
        "score": score,
        "issues": issues,
        "dimensions": {key: round(value * 100, 1) for key, value in dimension_scores.items()},
        "metrics": {
            "stages": len(stages),
            "segments": len(segments),
            "relations": len(valid_relations),
            "connected_segments": len(visited),
            "evidenced_relations": len(evidenced),
        },
    }


def build_cognition_repair_prompt(
    industry_name: str,
    current_yaml: str,
    assessment: Dict[str, Any],
) -> str:
    issues = "\n".join(f"- {item}" for item in assessment.get("issues", []))
    return f"""你是一位产业知识工程师。以下「{industry_name}」产业拓扑未通过确定性质量门禁。

当前结构：
```yaml
{current_yaml}
```

必须修复的问题：
{issues}

修复原则：
1. 保持产业研究边界，不为凑数量添加无价值环节。
2. 环节按价值创造角色划分，避免把产品、企业和应用场景混为同一层级。
3. 关系必须表达“来源环节的什么变化，通过何种机制，影响目标环节的什么变量”。
4. 主干至少覆盖上游→中游→下游；允许跨阶段影响，但禁止自环和重复边。
5. 不得伪造证据链接；证据不足的关系应删除，不得用常识补齐来源。
6. 保持已有语义未变化环节的 code 稳定。

输出与输入相同结构的完整 YAML，只输出 YAML。"""
