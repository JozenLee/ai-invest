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
    SegmentInfo
)

class IndustryExplorerService:
    """AI驱动的产业链探索引擎"""

    def __init__(self):
        self.anthropic = AsyncAnthropic(
            api_key=os.getenv("ANTHROPIC_API_KEY")
        )
        self.tavily = TavilyClient(
            api_key=os.getenv("TAVILY_API_KEY")
        )
        self.model = "claude-3-5-sonnet-20241022"

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

# 全局实例
_explorer_service: Optional[IndustryExplorerService] = None

def get_explorer_service() -> IndustryExplorerService:
    """获取探索服务单例"""
    global _explorer_service
    if _explorer_service is None:
        _explorer_service = IndustryExplorerService()
    return _explorer_service
