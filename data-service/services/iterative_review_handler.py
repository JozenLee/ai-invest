# data-service/services/iterative_review_handler.py
import json
import yaml
import asyncio
import logging
from typing import Any
from anthropic import AsyncAnthropic

from models.industry_models import IndustryStructure, ExplorationResult, SegmentDetail
from models.review_models import ReviewFeedback
from models.coverage_models import ExplorationContext
from services.claude_search_service import ClaudeSearchService
from services.recursive_explorer import RecursiveExplorer

logger = logging.getLogger(__name__)


class IterativeReviewHandler:
    """迭代Review处理器"""

    def __init__(
        self,
        search_service: ClaudeSearchService,
        explorer: RecursiveExplorer
    ):
        """
        初始化迭代Review处理器

        Args:
            search_service: Claude搜索服务实例
            explorer: 递归探索引擎实例
        """
        self.search = search_service
        self.explorer = explorer
        self.anthropic = search_service.anthropic
        self.model = search_service.model

    async def refine_structure(
        self,
        current_structure: IndustryStructure,
        feedback: ReviewFeedback,
        context: ExplorationContext
    ) -> IndustryStructure:
        """
        根据用户反馈增量优化结构

        Args:
            current_structure: 当前产业链结构
            feedback: 用户反馈
            context: 探索上下文

        Returns:
            优化后的产业链结构
        """
        logger.info(f"开始优化产业链结构，反馈已批准={feedback.approved}")

        if feedback.modified_data:
            # 用户直接修改了数据，使用修改后的版本
            logger.info("使用用户直接修改的数据")
            try:
                return IndustryStructure(**feedback.modified_data)
            except Exception as e:
                logger.error(f"解析用户修改数据失败: {e}")
                raise ValueError(f"用户修改的数据格式无效: {e}")

        # 用户提供了评论，让AI增量生成
        if not feedback.comments:
            logger.warning("用户未提供评论，返回原结构")
            return current_structure

        logger.info(f"根据用户评论进行AI增量优化: {feedback.comments[:100]}...")

        prompt = f"""用户对产业链结构提出了以下反馈：

用户评论：
{feedback.comments}

当前结构：
{current_structure.model_dump_json(indent=2, exclude_none=True)}

请根据反馈优化结构：
1. 如需补充信息，先使用web_search工具搜索
2. 保留正确的部分，只修改或补充有问题的部分
3. 输出完整的优化后结构（YAML格式）

请开始优化。"""

        # 使用工具调用，让AI自主决定是否需要搜索
        result = await self.search.search_with_tools(prompt, max_iterations=5)

        # 解析YAML
        try:
            yaml_text = self._extract_yaml(result)
            data = yaml.safe_load(yaml_text)
            optimized_structure = IndustryStructure(**data)
            logger.info(f"结构优化完成，包含 {len(optimized_structure.structure)} 个阶段")
            return optimized_structure
        except Exception as e:
            logger.error(f"解析优化后的结构失败: {e}")
            logger.error(f"AI返回内容:\n{result[:500]}...")
            raise ValueError(f"无法解析优化后的结构: {e}")

    async def refine_companies(
        self,
        current_result: ExplorationResult,
        feedback: ReviewFeedback,
        context: ExplorationContext
    ) -> ExplorationResult:
        """
        根据用户反馈增量优化企业信息

        Args:
            current_result: 当前探索结果
            feedback: 用户反馈
            context: 探索上下文

        Returns:
            优化后的探索结果
        """
        logger.info(f"开始优化企业信息，反馈已批准={feedback.approved}")

        if feedback.modified_data:
            # 用户直接修改
            logger.info("使用用户直接修改的企业数据")
            try:
                return ExplorationResult(**feedback.modified_data)
            except Exception as e:
                logger.error(f"解析用户修改数据失败: {e}")
                raise ValueError(f"用户修改的数据格式无效: {e}")

        # AI增量补充
        if not feedback.comments:
            logger.warning("用户未提供评论，返回原结果")
            return current_result

        logger.info(f"根据用户评论进行AI增量补充: {feedback.comments[:100]}...")

        # 将当前企业信息转换为可序列化格式
        current_details = {}
        for segment_code, detail in current_result.details.items():
            current_details[segment_code] = {
                "companies": [
                    company.model_dump(exclude_none=True)
                    for company in detail.companies
                ],
                "relationships": [
                    rel.model_dump(exclude_none=True, by_alias=True)
                    for rel in detail.relationships
                ]
            }

        prompt = f"""用户对企业信息提出了以下反馈：

用户评论：
{feedback.comments}

当前企业信息：
{json.dumps(current_details, indent=2, ensure_ascii=False)}

产业链结构（参考）：
{current_result.structure.model_dump_json(indent=2, exclude_none=True)}

请根据反馈优化：
1. 如需补充企业信息，使用web_search搜索
2. 保留正确的企业，只修改或补充有问题的部分
3. 输出完整的优化后details（JSON格式）

输出格式：
{{
  "segment_code_1": {{
    "companies": [...],
    "relationships": [...]
  }},
  "segment_code_2": {{
    "companies": [...],
    "relationships": [...]
  }}
}}

请开始优化。"""

        # 使用工具调用
        result = await self.search.search_with_tools(prompt, max_iterations=5)

        # 解析JSON
        try:
            json_text = self._extract_json(result)
            details_data = json.loads(json_text)

            # 更新result的details
            new_result = current_result.model_copy(deep=True)
            new_result.details = {}

            for segment_code, detail_dict in details_data.items():
                new_result.details[segment_code] = SegmentDetail(**detail_dict)

            logger.info(f"企业信息优化完成，包含 {len(new_result.details)} 个环节")
            return new_result

        except Exception as e:
            logger.error(f"解析优化后的企业信息失败: {e}")
            logger.error(f"AI返回内容:\n{result[:500]}...")
            raise ValueError(f"无法解析优化后的企业信息: {e}")

    async def refine_with_retry(
        self,
        current_data: Any,
        feedback: ReviewFeedback,
        context: ExplorationContext,
        phase: str = "structure",
        max_retries: int = 2
    ) -> Any:
        """
        带重试的优化

        Args:
            current_data: 当前数据（IndustryStructure或ExplorationResult）
            feedback: 用户反馈
            context: 探索上下文
            phase: 阶段类型 "structure" 或 "companies"
            max_retries: 最大重试次数

        Returns:
            优化后的数据

        Raises:
            Exception: 所有重试都失败后抛出异常
        """
        logger.info(f"开始带重试的{phase}优化，最大重试次数={max_retries}")

        for attempt in range(max_retries + 1):
            try:
                if phase == "structure":
                    if not isinstance(current_data, IndustryStructure):
                        raise ValueError(f"phase=structure时，current_data必须是IndustryStructure类型")
                    return await self.refine_structure(
                        current_data,
                        feedback,
                        context
                    )
                elif phase == "companies":
                    if not isinstance(current_data, ExplorationResult):
                        raise ValueError(f"phase=companies时，current_data必须是ExplorationResult类型")
                    return await self.refine_companies(
                        current_data,
                        feedback,
                        context
                    )
                else:
                    raise ValueError(f"未知的phase类型: {phase}")

            except Exception as e:
                if attempt < max_retries:
                    logger.warning(
                        f"{phase}优化失败（尝试 {attempt + 1}/{max_retries + 1}），"
                        f"1秒后重试: {e}"
                    )
                    await asyncio.sleep(1)
                else:
                    logger.error(f"{phase}优化最终失败: {e}")
                    raise

    def _extract_yaml(self, text: str) -> str:
        """
        从文本中提取YAML代码块

        Args:
            text: 包含YAML的文本

        Returns:
            提取的YAML文本
        """
        if "```yaml" in text:
            yaml_start = text.find("```yaml") + 7
            yaml_end = text.find("```", yaml_start)
            if yaml_end > yaml_start:
                return text[yaml_start:yaml_end].strip()
        elif "```yml" in text:
            yaml_start = text.find("```yml") + 6
            yaml_end = text.find("```", yaml_start)
            if yaml_end > yaml_start:
                return text[yaml_start:yaml_end].strip()
        elif "```" in text:
            yaml_start = text.find("```") + 3
            yaml_end = text.find("```", yaml_start)
            if yaml_end > yaml_start:
                return text[yaml_start:yaml_end].strip()

        # 如果没有代码块标记，尝试返回整个文本
        logger.warning("未找到YAML代码块标记，尝试解析整个文本")
        return text.strip()

    def _extract_json(self, text: str) -> str:
        """
        从文本中提取JSON代码块

        Args:
            text: 包含JSON的文本

        Returns:
            提取的JSON文本
        """
        if "```json" in text:
            json_start = text.find("```json") + 7
            json_end = text.find("```", json_start)
            if json_end > json_start:
                return text[json_start:json_end].strip()
        elif "```" in text:
            json_start = text.find("```") + 3
            json_end = text.find("```", json_start)
            if json_end > json_start:
                return text[json_start:json_end].strip()

        # 尝试查找JSON对象的开始和结束
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            return text[start:end + 1].strip()

        # 如果没有代码块标记，尝试返回整个文本
        logger.warning("未找到JSON代码块标记，尝试解析整个文本")
        return text.strip()


# 全局实例管理
_review_handler = None


def get_review_handler(
    search_service: ClaudeSearchService = None,
    explorer: RecursiveExplorer = None
) -> IterativeReviewHandler:
    """
    获取Review处理器单例

    Args:
        search_service: Claude搜索服务（首次调用时必须提供）
        explorer: 递归探索引擎（首次调用时必须提供）

    Returns:
        IterativeReviewHandler实例
    """
    global _review_handler

    if _review_handler is None:
        if search_service is None or explorer is None:
            raise ValueError("首次调用get_review_handler必须提供search_service和explorer参数")
        _review_handler = IterativeReviewHandler(search_service, explorer)

    return _review_handler
