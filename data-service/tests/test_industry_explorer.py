# data-service/tests/test_industry_explorer.py
import pytest
import os
from services.industry_explorer import IndustryExplorerService
from models.industry_models import (
    IndustryStructure,
    IndustryInfo,
    StageInfo,
    SegmentInfo,
    ExplorationResult
)


@pytest.fixture
def sample_structure():
    """创建测试用的产业链结构"""
    return IndustryStructure(
        industry=IndustryInfo(
            name="AI算力硬件",
            code="ai_hardware",
            description="人工智能算力硬件产业链"
        ),
        structure=[
            StageInfo(
                stage="上游",
                stage_code="upstream",
                description="核心硬件设计与制造",
                segments=[
                    SegmentInfo(
                        name="AI芯片设计",
                        code="ai_chip_design",
                        description="专用AI加速芯片的设计研发",
                        key_categories=["GPU", "TPU", "NPU"]
                    )
                ]
            )
        ]
    )


@pytest.mark.skipif(
    not os.getenv("ANTHROPIC_API_KEY"),
    reason="需要ANTHROPIC_API_KEY"
)
@pytest.mark.asyncio
async def test_explore_structure():
    """测试第一轮：产业链结构探索"""
    explorer = IndustryExplorerService()

    structure = await explorer.explore_structure("AI算力硬件")

    assert structure.industry.name == "AI算力硬件"
    assert len(structure.structure) >= 2  # 至少有上游和下游

    # 验证有环节
    has_segments = any(len(stage.segments) > 0 for stage in structure.structure)
    assert has_segments

    print(f"探索到 {len(structure.structure)} 个阶段")
    for stage in structure.structure:
        print(f"  {stage.stage}: {len(stage.segments)} 个环节")


@pytest.mark.skipif(
    not os.getenv("ANTHROPIC_API_KEY") or not os.getenv("TAVILY_API_KEY"),
    reason="需要ANTHROPIC_API_KEY和TAVILY_API_KEY"
)
@pytest.mark.asyncio
async def test_fill_companies(sample_structure):
    """测试第二轮：企业信息填充"""
    explorer = IndustryExplorerService()

    result = await explorer.fill_companies(sample_structure)

    # 验证结果结构
    assert isinstance(result, ExplorationResult)
    assert result.structure == sample_structure
    assert isinstance(result.details, dict)
    assert isinstance(result.metadata, dict)

    # 验证metadata
    assert "total_companies" in result.metadata
    assert "total_relationships" in result.metadata

    print(f"\n填充结果：")
    print(f"填充环节数：{len(result.details)}")
    print(f"总企业数：{result.metadata['total_companies']}")
    print(f"总关系数：{result.metadata['total_relationships']}")


@pytest.mark.skipif(
    not os.getenv("ANTHROPIC_API_KEY") or not os.getenv("TAVILY_API_KEY"),
    reason="需要ANTHROPIC_API_KEY和TAVILY_API_KEY"
)
@pytest.mark.asyncio
async def test_fill_segment(sample_structure):
    """测试单个环节填充"""
    explorer = IndustryExplorerService()

    stage = sample_structure.structure[0]
    segment = stage.segments[0]

    detail = await explorer._fill_segment(
        industry_name=sample_structure.industry.name,
        stage_name=stage.stage,
        segment=segment
    )

    # 验证返回的详情
    assert isinstance(detail.companies, list)
    assert isinstance(detail.relationships, list)

    print(f"\n单环节填充结果（{segment.name}）：")
    print(f"企业数：{len(detail.companies)}")
    print(f"关系数：{len(detail.relationships)}")


def test_parse_company_response():
    """测试JSON响应解析"""
    explorer = IndustryExplorerService()

    json_text = """
    {
      "companies": [
        {
          "name": "英伟达",
          "name_en": "NVIDIA Corporation",
          "ticker": "NVDA",
          "exchange": "NASDAQ",
          "country": "美国",
          "market_position": "leader",
          "key_products": ["GPU", "AI加速器"],
          "description": "全球领先的AI芯片设计公司"
        }
      ],
      "relationships": [
        {
          "type": "SUPPLIES",
          "from": "英伟达",
          "to": "微软",
          "description": "为Azure提供GPU",
          "confidence": 0.95
        }
      ]
    }
    """

    detail = explorer._parse_company_response(json_text, "ai_chip_design")

    # 验证解析结果
    assert len(detail.companies) == 1
    assert len(detail.relationships) == 1

    company = detail.companies[0]
    assert company.name == "英伟达"
    assert company.ticker == "NVDA"
    assert company.segment_code == "ai_chip_design"

    rel = detail.relationships[0]
    assert rel.type == "SUPPLIES"
    assert rel.from_company == "英伟达"
    assert rel.to_company == "微软"
    assert rel.confidence == 0.95


def test_parse_invalid_json():
    """测试解析无效JSON"""
    explorer = IndustryExplorerService()

    invalid_json = "这不是有效的JSON"

    detail = explorer._parse_company_response(invalid_json, "test_code")

    # 应该返回空的SegmentDetail
    assert len(detail.companies) == 0
    assert len(detail.relationships) == 0


def test_build_company_prompt(sample_structure):
    """测试企业填充Prompt构建"""
    explorer = IndustryExplorerService()

    stage = sample_structure.structure[0]
    segment = stage.segments[0]
    context = "示例搜索结果"

    prompt = explorer._build_company_prompt(
        industry_name=sample_structure.industry.name,
        stage_name=stage.stage,
        segment=segment,
        context=context
    )

    # 验证prompt包含关键信息
    assert sample_structure.industry.name in prompt
    assert stage.stage in prompt
    assert segment.name in prompt
    assert segment.description in prompt
    assert "JSON" in prompt
    assert "companies" in prompt
    assert "relationships" in prompt

