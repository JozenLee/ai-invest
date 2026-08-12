# data-service/services/recursive_explorer.py
import os
import json
import yaml
import asyncio
import logging
from typing import Tuple, List, Dict, Any
from anthropic import AsyncAnthropic

from models.industry_models import IndustryStructure, IndustryInfo, StageInfo, SegmentInfo
from models.coverage_models import CoverageAssessment, ExplorationContext
from services.claude_search_service import ClaudeSearchService

logger = logging.getLogger(__name__)


class RecursiveExplorer:
    """递归深度探索引擎"""

    def __init__(self, search_service: ClaudeSearchService):
        """
        初始化递归探索引擎

        Args:
            search_service: Claude搜索服务实例
        """
        self.search = search_service
        self.anthropic = search_service.anthropic
        self.model = search_service.model

    async def explore_until_adequate(
        self,
        industry_name: str,
        max_iterations: int = 3
    ) -> Tuple[IndustryStructure, ExplorationContext]:
        """
        递归探索直到覆盖度达标

        Args:
            industry_name: 产业名称
            max_iterations: 最大迭代次数

        Returns:
            (产业结构, 探索上下文)
        """

        context = ExplorationContext(
            iteration=0,
            previous_results=[],
            identified_gaps=[],
            search_queries=[]
        )

        all_search_results = []

        for i in range(max_iterations):
            context.iteration = i + 1
            logger.info(f"开始第 {context.iteration} 轮探索：{industry_name}")

            # 1. 搜索阶段
            search_results = await self._search_phase(
                industry_name,
                context
            )
            all_search_results.append(search_results)

            # 2. 总结阶段
            summary = await self._summarize_phase(
                search_results,
                context
            )

            # 3. 评估覆盖度
            coverage = await self._assess_coverage(
                summary,
                context,
                all_search_results
            )

            logger.info(
                f"第 {context.iteration} 轮覆盖度评估: "
                f"得分={coverage.score:.2f}, 达标={coverage.is_adequate}"
            )

            if coverage.is_adequate:
                # 达标，生成最终结构
                logger.info(f"覆盖度达标，生成最终结构")
                structure = await self._generate_structure(
                    summary,
                    context
                )
                return structure, context

            # 4. 记录gaps，继续下一轮
            context.identified_gaps.extend(coverage.gaps)
            context.previous_results.append(summary)

            logger.info(f"发现 {len(coverage.gaps)} 个遗漏点，继续下一轮探索")

        # 达到最大迭代次数，返回当前最佳结果
        logger.warning(f"达到最大迭代次数 {max_iterations}，返回当前最佳结果")
        structure = await self._generate_structure(summary, context)
        return structure, context

    async def _search_phase(
        self,
        industry_name: str,
        context: ExplorationContext
    ) -> str:
        """
        搜索阶段

        Args:
            industry_name: 产业名称
            context: 探索上下文

        Returns:
            搜索结果文本
        """

        if context.iteration == 1:
            # 第一轮：综合搜索
            prompt = f"""搜索「{industry_name}」产业链的综合信息：
- 产业链全景图
- 上中下游结构
- 主要环节和技术

请执行2-3次搜索，获取全面信息。"""
        else:
            # 后续轮次：针对性搜索
            gaps_str = "\n".join(f"- {gap}" for gap in context.identified_gaps[-3:])
            prompt = f"""针对「{industry_name}」产业链的以下遗漏点进行搜索：
{gaps_str}

请执行1-2次精准搜索，补充缺失信息。"""

        result = await self.search.search_with_tools(prompt)

        # 记录搜索查询
        context.search_queries.append(f"第{context.iteration}轮搜索")

        return result

    async def _summarize_phase(
        self,
        search_results: str,
        context: ExplorationContext
    ) -> str:
        """
        总结阶段

        Args:
            search_results: 搜索结果
            context: 探索上下文

        Returns:
            结构化的产业链摘要
        """

        # 构建上下文提示（如果有之前的结果）
        context_prompt = ""
        if context.previous_results:
            context_prompt = f"""

之前已探索的信息摘要：
{context.previous_results[-1][:1000]}

请在此基础上补充新发现的信息。"""

        prompt = f"""总结以下搜索结果，提取产业链关键信息：

搜索结果：
{search_results}
{context_prompt}

请总结：
1. 产业链各阶段（上游/中游/下游）
2. 各阶段的关键环节
3. 各环节的技术和产品类别
4. 主要上市公司

输出格式：结构化的产业链摘要"""

        response = await self.anthropic.messages.create(
            model=self.model,
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}]
        )

        return response.content[0].text

    async def _assess_coverage(
        self,
        summary: str,
        context: ExplorationContext,
        all_results: List[str]
    ) -> CoverageAssessment:
        """
        评估覆盖度（混合指标）

        Args:
            summary: 当前总结
            context: 探索上下文
            all_results: 所有搜索结果

        Returns:
            覆盖度评估结果
        """

        # 1. 量化指标（基于summary解析）
        quantity_score = self._assess_quantity(summary)

        # 2. 质量指标（信息来源多样性）
        quality_score = len(context.search_queries) / 5.0
        quality_score = min(quality_score, 1.0)

        # 3. 完整性指标（产业链完整度）
        completeness_score = self._assess_completeness(summary)

        # 4. AI判断
        ai_assessment = await self._ai_assess_coverage(
            summary,
            context,
            all_results
        )

        # 综合得分（可调权重）
        total_score = (
            0.25 * quantity_score +
            0.25 * quality_score +
            0.25 * completeness_score +
            0.25 * ai_assessment["score"]
        )

        # 从环境变量读取阈值，默认0.75
        threshold = float(os.getenv("COVERAGE_THRESHOLD", "0.75"))

        return CoverageAssessment(
            is_adequate=total_score >= threshold,
            score=total_score,
            dimensions={
                "quantity": quantity_score,
                "quality": quality_score,
                "completeness": completeness_score,
                "ai_judgment": ai_assessment["score"]
            },
            gaps=ai_assessment["gaps"],
            suggestions=ai_assessment["suggestions"]
        )

    def _assess_quantity(self, summary: str) -> float:
        """
        评估数量指标

        Args:
            summary: 产业链摘要

        Returns:
            数量得分 (0-1)
        """
        # 简单实现：检查是否提到足够多的环节和企业
        segments_count = summary.count("环节") + summary.count("segment")
        companies_count = summary.count("公司") + summary.count("企业")

        score = min((segments_count / 6.0 + companies_count / 10.0) / 2, 1.0)
        return score

    def _assess_completeness(self, summary: str) -> float:
        """
        评估完整性指标

        Args:
            summary: 产业链摘要

        Returns:
            完整性得分 (0-1)
        """
        # 检查是否覆盖上中下游
        has_upstream = "上游" in summary or "upstream" in summary.lower()
        has_midstream = "中游" in summary or "midstream" in summary.lower()
        has_downstream = "下游" in summary or "downstream" in summary.lower()

        covered = sum([has_upstream, has_midstream, has_downstream])
        return covered / 3.0

    async def _ai_assess_coverage(
        self,
        summary: str,
        context: ExplorationContext,
        all_results: List[str]
    ) -> Dict:
        """
        AI评估覆盖度

        Args:
            summary: 当前总结
            context: 探索上下文
            all_results: 所有搜索结果

        Returns:
            包含score/gaps/suggestions的字典
        """

        prompt = f"""评估以下产业链探索的覆盖度：

当前总结：
{summary}

评估标准：
1. 产业链各阶段都有2-4个环节
2. 至少3个不同来源交叉验证（已搜索{len(context.search_queries)}次）
3. 每个环节有明确的技术/产品定义
4. 识别出主要上市公司

请评估：
- 综合得分（0-1）
- 发现的遗漏点（列表）
- 改进建议（列表）

输出JSON格式：
{{
  "score": 0.85,
  "gaps": ["缺少下游应用场景", "未提及国际龙头企业"],
  "suggestions": ["补充搜索下游应用", "搜索国际市场信息"]
}}"""

        try:
            response = await self.anthropic.messages.create(
                model=self.model,
                max_tokens=1024,
                messages=[{"role": "user", "content": prompt}]
            )

            # 解析JSON响应
            result_text = response.content[0].text

            # 提取JSON
            if "```json" in result_text:
                json_start = result_text.find("```json") + 7
                json_end = result_text.find("```", json_start)
                result_text = result_text[json_start:json_end].strip()
            elif "```" in result_text:
                json_start = result_text.find("```") + 3
                json_end = result_text.find("```", json_start)
                result_text = result_text[json_start:json_end].strip()

            return json.loads(result_text)

        except Exception as e:
            logger.warning(f"AI评估覆盖度失败: {e}，使用降级返回")
            # 降级返回
            return {
                "score": 0.7,
                "gaps": [],
                "suggestions": []
            }

    async def _generate_structure(
        self,
        summary: str,
        context: ExplorationContext
    ) -> IndustryStructure:
        """
        生成最终的产业链结构

        Args:
            summary: 产业链摘要
            context: 探索上下文

        Returns:
            结构化的产业链数据
        """

        prompt = f"""基于以下产业链研究总结，生成结构化的产业链骨架。

研究总结：
{summary}

输出YAML格式的产业链结构，格式如下：
```yaml
industry:
  name: "产业名称"
  code: "industry_code"
  description: "产业描述"

structure:
  - stage: "上游"
    stage_code: "upstream"
    description: "上游阶段描述"
    segments:
      - name: "环节名称"
        code: "segment_code"
        description: "环节描述"
        key_categories: ["类别1", "类别2"]

  - stage: "中游"
    stage_code: "midstream"
    description: "中游阶段描述"
    segments:
      - name: "环节名称"
        code: "segment_code"
        description: "环节描述"
        key_categories: ["类别1", "类别2"]

  - stage: "下游"
    stage_code: "downstream"
    description: "下游阶段描述"
    segments:
      - name: "环节名称"
        code: "segment_code"
        description: "环节描述"
        key_categories: ["类别1", "类别2"]
```

请输出完整的YAML结构。"""

        response = await self.anthropic.messages.create(
            model=self.model,
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}]
        )

        yaml_text = response.content[0].text

        # 解析YAML
        if "```yaml" in yaml_text:
            yaml_start = yaml_text.find("```yaml") + 7
            yaml_end = yaml_text.find("```", yaml_start)
            yaml_text = yaml_text[yaml_start:yaml_end].strip()
        elif "```" in yaml_text:
            yaml_start = yaml_text.find("```") + 3
            yaml_end = yaml_text.find("```", yaml_start)
            yaml_text = yaml_text[yaml_start:yaml_end].strip()

        try:
            data = yaml.safe_load(yaml_text)
            structure = IndustryStructure(**data)
            return structure
        except Exception as e:
            logger.error(f"解析产业链结构失败: {e}")
            logger.error(f"YAML内容:\n{yaml_text}")
            raise ValueError(f"无法解析产业链结构: {e}")

    async def explore_with_timeout(
        self,
        industry_name: str,
        timeout_seconds: int = 120
    ) -> Tuple[IndustryStructure, ExplorationContext]:
        """
        带超时保护的探索

        Args:
            industry_name: 产业名称
            timeout_seconds: 超时时间（秒）

        Returns:
            (产业结构, 探索上下文)

        Raises:
            asyncio.TimeoutError: 探索超时
        """
        try:
            return await asyncio.wait_for(
                self.explore_until_adequate(industry_name),
                timeout=timeout_seconds
            )
        except asyncio.TimeoutError:
            logger.warning(f"探索超时（{timeout_seconds}秒），尝试返回当前最佳结果")
            # 如果有部分结果，尝试返回
            raise asyncio.TimeoutError(
                f"产业链探索超时（{timeout_seconds}秒），请稍后重试"
            )
