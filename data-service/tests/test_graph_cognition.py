from models.industry_models import IndustryStructure
from services.graph_cognition import assess_structure_cognition, build_cognition_repair_prompt


def test_cognition_gate_accepts_connected_evidenced_topology():
    structure = IndustryStructure(**{
        "industry": {"name": "测试产业", "code": "test"},
        "structure": [
            {"stage": "上游", "stage_code": "upstream", "description": "供给", "segments": [
                {"name": "原料", "code": "material", "description": "提供核心原材料并影响成本", "key_categories": ["材料"]},
                {"name": "设备", "code": "equipment", "description": "提供生产设备并影响产能", "key_categories": ["设备"]},
            ]},
            {"stage": "中游", "stage_code": "midstream", "description": "制造", "segments": [
                {"name": "部件", "code": "component", "description": "制造关键部件并决定性能", "key_categories": ["部件"]},
                {"name": "整机", "code": "system", "description": "完成系统集成并形成供给", "key_categories": ["整机"]},
            ]},
            {"stage": "下游", "stage_code": "downstream", "description": "应用", "segments": [
                {"name": "运营", "code": "operator", "description": "采购整机并提供运营服务", "key_categories": ["运营"]},
                {"name": "应用", "code": "application", "description": "形成终端需求并验证价值", "key_categories": ["应用"]},
            ]},
        ],
        "relationships": [
            {"from": "material", "to": "component", "type": "SUPPLIES", "description": "材料进入部件制造", "evidence_urls": ["https://example.com/1"]},
            {"from": "equipment", "to": "component", "type": "SUPPLIES", "description": "设备支撑部件产能", "evidence_urls": ["https://example.com/2"]},
            {"from": "component", "to": "system", "type": "SUPPLIES", "description": "部件进入整机", "evidence_urls": ["https://example.com/3"]},
            {"from": "system", "to": "operator", "type": "SUPPLIES", "description": "整机交付运营方", "evidence_urls": ["https://example.com/4"]},
            {"from": "operator", "to": "application", "type": "INFLUENCES", "description": "运营能力影响应用", "evidence_urls": ["https://example.com/5"]},
        ],
    })
    result = assess_structure_cognition(structure)
    assert result["passed"] is True
    assert result["score"] >= 80


def test_cognition_gate_explains_disconnected_structure():
    structure = IndustryStructure(**{
        "industry": {"name": "测试产业", "code": "test"},
        "structure": [{"stage": "上游", "stage_code": "upstream", "description": "", "segments": [
            {"name": "材料", "code": "material", "description": "短", "key_categories": []},
        ]}],
    })
    result = assess_structure_cognition(structure)
    assert result["passed"] is False
    assert "缺少标准上游/中游/下游阶段" in result["issues"]
    prompt = build_cognition_repair_prompt("测试产业", "industry: {}", result)
    assert "不得伪造证据链接" in prompt
