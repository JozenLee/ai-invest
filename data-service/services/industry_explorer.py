# data-service/services/industry_explorer.py
import os
import yaml
import json
import asyncio
from typing import Dict, List, Optional
from anthropic import AsyncAnthropic
from tavily import TavilyClient
from models.industry_models import (
    IndustryStructure,
    IndustryInfo,
    StageInfo,
    SegmentInfo,
    CompanyInfo,
    RelationshipInfo,
    SegmentDetail,
    ExplorationResult
)

class IndustryExplorerService:
    """AI驱动的产业链探索引擎"""

    def __init__(self):
        self.anthropic = AsyncAnthropic(
            api_key=os.getenv("ANTHROPIC_API_KEY"),
            base_url=os.getenv("ANTHROPIC_BASE_URL")
        )
        self.tavily = TavilyClient(
            api_key=os.getenv("TAVILY_API_KEY")
        )
        self.model = os.getenv("CLAUDE_MODEL", "claude-sonnet-5")

    async def explore_structure(self, industry_name: str) -> IndustryStructure:
        """
        第一轮：探索产业链结构

        Args:
            industry_name: 产业名称，如"AI算力硬件"

        Returns:
            IndustryStructure: 产业链骨架
        """
        # 1. 搜索产业研究资料
        search_context = await self._search_industry_info(industry_name)

        # 2. 生成结构化Prompt
        prompt = self._build_structure_prompt(industry_name, search_context)

        # 3. 调用Claude分析
        response = await self._call_claude_for_structure(prompt)

        # 4. 解析YAML响应
        structure = self._parse_structure_response(response, industry_name)

        return structure

    async def _search_industry_info(self, industry_name: str) -> str:
        """搜索产业链相关信息"""
        query = f"{industry_name} 产业链 上中下游 研究报告 结构分析"

        try:
            result = self.tavily.search(
                query=query,
                search_depth="advanced",
                max_results=8,
                include_answer=True
            )

            # 提取关键内容
            context_parts = []

            if result.get("answer"):
                context_parts.append(f"综述：{result['answer']}")

            for item in result.get("results", [])[:5]:
                context_parts.append(
                    f"来源：{item.get('title', '')}\n"
                    f"内容：{item.get('content', '')[:500]}"
                )

            return "\n\n".join(context_parts)

        except Exception as e:
            print(f"搜索失败: {e}")
            return ""

    def _build_structure_prompt(self, industry_name: str, context: str) -> str:
        """构建第一轮探索Prompt"""
        code = self._generate_industry_code(industry_name)

        prompt = f"""你是一位专业的产业分析师。请分析「{industry_name}」产业链结构。

**参考资料：**
{context}

**任务：**
1. 识别产业链的上游、中游、下游阶段
2. 列出每个阶段包含的关键环节（segment）
3. 每个环节需包含：名称、功能描述、核心技术/产品类别

**输出格式（YAML）：**
```yaml
industry:
  name: {industry_name}
  code: {code}
  description: 一句话描述这个产业

structure:
  - stage: 上游
    stage_code: upstream
    description: 产业链上游的核心功能（一句话）
    segments:
      - name: 环节名称（如：芯片设计）
        code: segment_code（英文下划线）
        description: 该环节的功能和价值
        key_categories: [类别1, 类别2]

  - stage: 中游
    stage_code: midstream
    description: 产业链中游的核心功能
    segments:
      - name: 环节名称
        code: segment_code
        description: 功能描述
        key_categories: []

  - stage: 下游
    stage_code: downstream
    description: 产业链下游的核心功能
    segments:
      - name: 环节名称
        code: segment_code
        description: 功能描述
        key_categories: []
```

**要求：**
- 基于最新产业研究和市场报告
- 聚焦A股/港股/美股上市公司相关领域
- 环节划分要清晰，避免重叠
- 每个阶段2-4个环节为宜
- code使用英文小写下划线格式
- 只输出YAML，不要其他解释

请输出符合格式的YAML：
"""
        return prompt

    def _generate_industry_code(self, industry_name: str) -> str:
        """生成产业代码"""
        # 简单映射，实际可用AI生成
        mapping = {
            "AI算力硬件": "ai_hardware",
            "新能源汽车": "new_energy_vehicle",
            "创新药": "innovative_drug",
            "半导体": "semiconductor"
        }
        return mapping.get(industry_name, f"industry_{abs(hash(industry_name)) % 100000000}")

    async def _call_claude_for_structure(self, prompt: str) -> str:
        """调用Claude API进行结构分析"""
        message = await self.anthropic.messages.create(
            model=self.model,
            max_tokens=4096,
            temperature=0.3,  # 较低温度保证稳定性
            messages=[{
                "role": "user",
                "content": prompt
            }]
        )

        response_text = message.content[0].text

        # 提取YAML（去除可能的markdown标记）
        if "```yaml" in response_text:
            yaml_start = response_text.find("```yaml") + 7
            yaml_end = response_text.find("```", yaml_start)
            response_text = response_text[yaml_start:yaml_end].strip()
        elif "```" in response_text:
            yaml_start = response_text.find("```") + 3
            yaml_end = response_text.find("```", yaml_start)
            response_text = response_text[yaml_start:yaml_end].strip()

        return response_text

    def _parse_structure_response(
        self,
        yaml_text: str,
        industry_name: str
    ) -> IndustryStructure:
        """解析YAML响应为IndustryStructure"""
        try:
            data = yaml.safe_load(yaml_text)

            # 验证必需字段
            if "industry" not in data or "structure" not in data:
                raise ValueError("YAML缺少必需字段")

            # 使用Pydantic解析和验证
            structure = IndustryStructure(**data)

            return structure

        except Exception as e:
            print(f"YAML解析失败: {e}")
            print(f"原始内容: {yaml_text}")

            # 返回基本结构作为后备
            return IndustryStructure(
                industry=IndustryInfo(
                    name=industry_name,
                    code=self._generate_industry_code(industry_name),
                    description="解析失败，使用默认结构"
                ),
                structure=[]
            )

    async def fill_companies(self, structure: IndustryStructure) -> ExplorationResult:
        """
        第二轮：填充企业和关系

        Args:
            structure: 第一轮探索的产业链骨架

        Returns:
            ExplorationResult: 完整探索结果
        """
        details = {}

        # 为每个segment并行填充
        tasks = []
        for stage in structure.structure:
            for segment in stage.segments:
                task = self._fill_segment(
                    industry_name=structure.industry.name,
                    stage_name=stage.stage,
                    segment=segment
                )
                tasks.append((segment.code, task))

        # 并行执行
        results = await asyncio.gather(*[task for _, task in tasks], return_exceptions=True)

        # 组织结果
        for (segment_code, _), result in zip(tasks, results):
            if isinstance(result, Exception):
                print(f"填充 {segment_code} 失败: {result}")
                details[segment_code] = SegmentDetail(companies=[], relationships=[])
            else:
                details[segment_code] = result

        return ExplorationResult(
            structure=structure,
            details=details,
            metadata={
                "total_companies": sum(len(d.companies) for d in details.values()),
                "total_relationships": sum(len(d.relationships) for d in details.values())
            }
        )

    async def _fill_segment(
        self,
        industry_name: str,
        stage_name: str,
        segment: SegmentInfo
    ) -> SegmentDetail:
        """填充单个segment的企业信息"""

        # 1. 搜索该segment的关键企业
        search_query = f"{segment.name} 上市公司 龙头企业 股票代码 {industry_name}"
        search_context = await self._search_segment_companies(search_query)

        # 2. 生成填充Prompt
        prompt = self._build_company_prompt(
            industry_name=industry_name,
            stage_name=stage_name,
            segment=segment,
            context=search_context
        )

        # 3. 调用Claude提取
        response = await self._call_claude_for_companies(prompt)

        # 4. 解析响应
        detail = self._parse_company_response(response, segment.code)

        return detail

    async def _search_segment_companies(self, query: str) -> str:
        """搜索环节企业信息"""
        try:
            result = self.tavily.search(
                query=query,
                search_depth="basic",
                max_results=5
            )

            context_parts = []
            for item in result.get("results", []):
                context_parts.append(
                    f"{item.get('title', '')}\n{item.get('content', '')[:400]}"
                )

            return "\n\n".join(context_parts)
        except Exception as e:
            print(f"搜索企业失败: {e}")
            return ""

    def _build_company_prompt(
        self,
        industry_name: str,
        stage_name: str,
        segment: SegmentInfo,
        context: str
    ) -> str:
        """构建企业填充Prompt"""
        prompt = f"""你是一位专业的产业研究员。请为「{segment.name}」环节填充详细信息。

**背景：**
- 产业：{industry_name}
- 阶段：{stage_name}
- 环节：{segment.name}
- 功能：{segment.description}
- 核心类别：{', '.join(segment.key_categories)}

**参考资料：**
{context}

**任务：**
1. 识别该环节的全球和中国关键企业（上市公司优先）
2. 提取企业基本信息
3. 识别企业间的供应/竞争关系

**输出格式（JSON）：**
```json
{{
  "companies": [
    {{
      "name": "企业中文名称",
      "name_en": "English Name",
      "ticker": "股票代码（如：NVDA, 000001.SZ）",
      "exchange": "交易所（NASDAQ/NYSE/SSE/SZSE/HKEX）",
      "country": "国家",
      "market_position": "leader/major/emerging",
      "key_products": ["产品1", "产品2"],
      "description": "一句话描述企业"
    }}
  ],
  "relationships": [
    {{
      "type": "SUPPLIES",
      "from": "企业A名称",
      "to": "企业B名称",
      "description": "供应关系描述",
      "confidence": 0.9
    }},
    {{
      "type": "COMPETES_WITH",
      "from": "企业C名称",
      "to": "企业D名称",
      "description": "竞争描述",
      "confidence": 0.85
    }}
  ]
}}
```

**要求：**
- 企业信息要准确（股票代码、交易所）
- 优先选择市值较大、影响力强的企业（5-10家）
- 关系要有明确依据
- 置信度基于信息来源可靠性
- 只输出JSON，不要其他解释

请输出JSON：
"""
        return prompt

    async def _call_claude_for_companies(self, prompt: str) -> str:
        """调用Claude API提取企业信息"""
        message = await self.anthropic.messages.create(
            model=self.model,
            max_tokens=4096,
            temperature=0.3,
            messages=[{
                "role": "user",
                "content": prompt
            }]
        )

        response_text = message.content[0].text

        # 提取JSON
        if "```json" in response_text:
            json_start = response_text.find("```json") + 7
            json_end = response_text.find("```", json_start)
            response_text = response_text[json_start:json_end].strip()
        elif "```" in response_text:
            json_start = response_text.find("```") + 3
            json_end = response_text.find("```", json_start)
            response_text = response_text[json_start:json_end].strip()

        return response_text

    def _parse_company_response(self, json_text: str, segment_code: str) -> SegmentDetail:
        """解析JSON响应"""
        try:
            data = json.loads(json_text)

            # 补充segment_code
            for company in data.get("companies", []):
                company["segment_code"] = segment_code

            # 使用Pydantic验证
            companies = [CompanyInfo(**c) for c in data.get("companies", [])]
            relationships = [RelationshipInfo(**r) for r in data.get("relationships", [])]

            return SegmentDetail(
                companies=companies,
                relationships=relationships
            )
        except Exception as e:
            print(f"解析企业JSON失败: {e}")
            print(f"原始内容: {json_text}")
            return SegmentDetail(companies=[], relationships=[])

# 全局实例
_explorer_service: Optional[IndustryExplorerService] = None

def get_explorer_service() -> IndustryExplorerService:
    """获取探索服务单例"""
    global _explorer_service
    if _explorer_service is None:
        _explorer_service = IndustryExplorerService()
    return _explorer_service
