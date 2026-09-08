# data-service/services/industry_explorer.py
import os
import yaml
import json
import asyncio
import html
import re
from urllib.parse import quote
import xml.etree.ElementTree as ET
import aiohttp
from typing import Dict, List, Optional, Tuple
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
    ExplorationResult,
    EvidenceRef,
    SegmentRelationshipInfo,
)
from services.graph_cognition import assess_structure_cognition, build_cognition_repair_prompt
from services.representative_company_resolver import (
    RepresentativeCompanyResolver,
    normalize_security_code,
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
        self.company_resolver = RepresentativeCompanyResolver()

    async def explore_structure(
        self,
        industry_name: str,
        description: Optional[str] = None,
    ) -> IndustryStructure:
        """
        第一轮：探索产业链结构

        Args:
            industry_name: 产业名称，如"AI算力硬件"

        Returns:
            IndustryStructure: 产业链骨架
        """
        # 1. 搜索产业研究资料
        search_context, evidence = await self._search_industry_info(industry_name)

        # 2. 生成结构化Prompt
        prompt = self._build_structure_prompt(industry_name, search_context, description)

        # 3. 调用Claude分析
        response = await self._call_claude_for_structure(prompt)

        # 4. 解析YAML响应并在进入人工审核前执行确定性认知门禁。
        structure = self._parse_structure_response(response, industry_name)
        structure.evidence = evidence
        structure = await self._repair_structure_if_needed(structure)

        return structure

    async def refine_structure(
        self,
        current_structure: IndustryStructure,
        feedback_comments: str
    ) -> IndustryStructure:
        """
        根据用户反馈优化产业链结构（增量迭代）

        Args:
            current_structure: 当前的产业链结构
            feedback_comments: 用户反馈意见

        Returns:
            IndustryStructure: 优化后的产业链结构
        """
        # 1. 将当前结构转换为YAML字符串
        current_yaml = self._structure_to_yaml(current_structure)

        # 2. 构建优化Prompt（结合当前结构和反馈）
        prompt = self._build_refine_prompt(
            current_structure.industry.name,
            current_yaml,
            feedback_comments
        )

        # 3. 调用Claude进行增量优化
        response = await self._call_claude_for_structure(prompt)

        # 4. 解析优化后的结构
        refined_structure = self._parse_structure_response(
            response,
            current_structure.industry.name
        )
        refined_structure.evidence = current_structure.evidence
        refined_structure = await self._repair_structure_if_needed(refined_structure, max_attempts=1)

        return refined_structure

    async def _repair_structure_if_needed(
        self,
        structure: IndustryStructure,
        max_attempts: Optional[int] = None,
    ) -> IndustryStructure:
        allowed_urls = {item.url for item in structure.evidence}
        evidence = structure.evidence
        attempts = max_attempts if max_attempts is not None else max(0, int(os.getenv("GRAPH_STRUCTURE_REPAIR_ATTEMPTS", "2")))
        for attempt in range(attempts + 1):
            for relationship in structure.relationships:
                relationship.evidence_urls = [url for url in relationship.evidence_urls if url in allowed_urls]
            assessment = assess_structure_cognition(structure)
            if assessment["passed"] or attempt >= attempts:
                if not assessment["passed"]:
                    print(f"[WARNING] 产业认知门禁仍有问题，交由人工审核: {assessment['issues']}")
                return structure
            repair_prompt = build_cognition_repair_prompt(
                structure.industry.name,
                self._structure_to_yaml(structure),
                assessment,
            )
            repaired = await self._call_claude_for_structure(repair_prompt)
            structure = self._parse_structure_response(repaired, structure.industry.name)
            structure.evidence = evidence
        return structure

    def _structure_to_yaml(self, structure: IndustryStructure) -> str:
        """将IndustryStructure转换为YAML字符串"""
        data = {
            "industry": {
                "name": structure.industry.name,
                "code": structure.industry.code,
                "description": structure.industry.description
            },
            "structure": [],
            "relationships": [
                relationship.model_dump(by_alias=True)
                for relationship in structure.relationships
            ],
        }

        for stage in structure.structure:
            stage_data = {
                "stage": stage.stage,
                "stage_code": stage.stage_code,
                "description": stage.description,
                "segments": []
            }
            for seg_index, segment in enumerate(stage.segments):
                segment_data = {
                    "name": segment.name,
                    "code": segment.code,
                    "description": segment.description,
                    "key_categories": segment.key_categories or [],
                    "order": segment.order if segment.order is not None else seg_index
                }
                stage_data["segments"].append(segment_data)
            data["structure"].append(stage_data)

        return yaml.dump(data, allow_unicode=True, sort_keys=False)

    def _build_refine_prompt(
        self,
        industry_name: str,
        current_yaml: str,
        feedback: str
    ) -> str:
        """构建结构优化Prompt"""

        # 从current_yaml中提取现有的segment codes
        import re
        existing_codes = re.findall(r'code:\s+(\S+)', current_yaml)
        segment_codes_hint = ""
        if existing_codes:
            segment_codes_hint = f"\n\n**当前环节code列表：**\n" + "\n".join([f"  - {code}" for code in existing_codes])

        prompt = f"""你是一位专业的产业分析师。用户对「{industry_name}」的产业链结构提出了反馈意见，请根据反馈进行增量优化。

**当前结构（YAML格式）：**
```yaml
{current_yaml}
```{segment_codes_hint}

**用户反馈意见：**
{feedback}

**任务：**
1. 仔细阅读用户的反馈意见
2. 在当前结构的基础上进行针对性优化：
   - 如果用户要求补充某些环节/阶段，则添加相应内容
   - 如果用户要求删除/合并某些内容，则进行调整
   - 如果用户要求修改描述或分类，则更新相应字段
3. 保持结构的完整性和逻辑性
4. 确保优化后的结构符合产业实际情况

**关键约束（保护企业数据）：**
⚠️ 对于保留的环节，必须保持原有的 code 不变！
- 保留的环节：使用原有的 code（如上面列出的code）
- 新增的环节：生成新的 code（使用小写字母和下划线）
- 删除的环节：直接从结构中移除即可
- 合并的环节：选择其中一个现有code保留，删除其他的

为什么要保持code不变？因为每个segment.code关联了企业数据，改变code会导致企业数据丢失！

**输出格式（YAML）：**
输出完整的优化后的产业链结构，格式与当前结构相同：
```yaml
industry:
  name: {industry_name}
  code: 产业代码
  description: 产业描述

structure:
  - stage: 阶段名称
    stage_code: 阶段代码
    description: 阶段描述
    segments:
      - name: 环节名称
        code: 环节代码  # ⚠️ 保留的环节使用原有code
        description: 环节描述
        key_categories: [类别列表]

relationships:
  - from: 源环节code
    to: 目标环节code
    type: SUPPLIES
    direction: positive
    weight: 0.7
    confidence: 0.8
    lag: 中期
    description: 关系说明
    evidence_urls: []
```

**要求：**
- 必须输出完整的YAML结构，不能省略未修改的部分
- 根据用户反馈进行针对性修改
- ⚠️ 保留的环节必须使用原有code，不能随意改变
- 同步维护 relationships；删除环节时必须删除引用它的关系
- 保持YAML格式正确
- 只输出YAML，不要其他解释

**⚠️ 关键约束（产业名称）：**
- industry.name 必须使用上面指定的名称：「{industry_name}」
- 不要对名称进行任何修改、美化或翻译
- 即使名称包含测试后缀、时间戳或看起来不规范，也必须原样保留
- 例如：如果输入是"AI算力硬件_test_20240807"，输出也必须是"AI算力硬件_test_20240807"

请输出优化后的完整YAML：
"""
        return prompt

    async def _search_industry_info(
        self,
        industry_name: str,
    ) -> Tuple[str, List[EvidenceRef]]:
        """搜索产业链相关信息"""
        queries = [
            f"{industry_name} 产业链 上中下游 价值链 研究报告",
            f"{industry_name} 核心产品 成本构成 供需传导 产业瓶颈",
            f"{industry_name} 指数编制方案 成分行业分类 产业链图谱",
        ]

        context_parts = []
        evidence: List[EvidenceRef] = []
        seen_urls = set()
        for query in queries:
            try:
                result = await asyncio.to_thread(
                    self.tavily.search,
                    query=query,
                    search_depth="advanced",
                    max_results=5,
                    include_answer=True,
                )
                if result.get("answer"):
                    context_parts.append(f"检索主题：{query}\n综述：{result['answer']}")
                for item in result.get("results", [])[:5]:
                    title = item.get('title', '')
                    url = item.get('url', '')
                    if not title or not url or url in seen_urls:
                        continue
                    seen_urls.add(url)
                    excerpt = item.get('content', '')[:700]
                    context_parts.append(f"检索主题：{query}\n来源：{title}\n链接：{url}\n内容：{excerpt}")
                    evidence.append(EvidenceRef(title=title, url=url, excerpt=excerpt))
            except Exception as error:
                print(f"检索主题失败，继续其他认知维度: {query}: {error}")

        if evidence:
            return "\n\n".join(context_parts), evidence

        fallback = await self._google_news_search(queries[0], 8)
        context_parts = [f"来源：{item['title']}\n链接：{item['url']}\n内容：{item['content']}" for item in fallback]
        evidence = [EvidenceRef(title=item["title"], url=item["url"], excerpt=item["content"], source_type="google_news_rss") for item in fallback]
        return "\n\n".join(context_parts), evidence

    async def _google_news_search(self, query: str, max_results: int = 5) -> List[Dict[str, str]]:
        """Keyless read-only fallback used when the primary search quota is exhausted."""
        url = f"https://news.google.com/rss/search?q={quote(query)}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans"
        headers = {"User-Agent": "ai-invest-research/1.0"}
        try:
            async with aiohttp.ClientSession(headers=headers) as session:
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=20)) as response:
                    response.raise_for_status()
                    xml_text = await response.text()
            root = ET.fromstring(xml_text)
            results = []
            for item in root.findall("./channel/item")[:max_results]:
                title = (item.findtext("title") or "").strip()
                link = (item.findtext("link") or "").strip()
                description = re.sub(r"<[^>]+>", " ", html.unescape(item.findtext("description") or ""))
                description = re.sub(r"\s+", " ", description).strip()[:500]
                if title and link:
                    results.append({"title": title, "url": link, "content": description or title})
            return results
        except Exception as error:
            print(f"Google News RSS回退失败: {error}")
            return []

    def _build_structure_prompt(
        self,
        industry_name: str,
        context: str,
        description: Optional[str] = None,
    ) -> str:
        """构建第一轮探索Prompt"""
        code = self._generate_industry_code(industry_name)

        scope = description.strip() if description and description.strip() else "未额外限定，以产业通行口径为准"
        prompt = f"""你是一位专业的产业分析师。请分析「{industry_name}」产业链结构。

**用户定义的研究边界：**
{scope}

**参考资料：**
{context}

**任务：**
1. 识别产业链的上游、中游、下游阶段
2. 列出每个阶段包含的关键环节（segment）
3. 每个环节需包含：名称、功能描述、核心技术/产品类别
4. 给出环节之间可用于事件传导的有向关系，必须能由参考资料支持
5. 用统一产业认知口径建模：
   - 节点表示稳定的价值创造角色，不把单个企业、宽泛主题或一次性事件作为环节
   - SUPPLIES 表示产品/服务供给，INFLUENCES 表示需求/技术/价格影响，CONSTRAINS 表示产能/成本/政策约束，SUBSTITUTES 表示替代
   - description 必须写清传导变量和兑现条件，例如“需求量→产能利用率→盈利”，不能只写“相关”
   - 主干关系应形成上游→中游→下游的可达路径，辅以必要的跨阶段反馈关系

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

relationships:
  - from: upstream_segment_code
    to: downstream_segment_code
    type: SUPPLIES  # 仅限 SUPPLIES/INFLUENCES/CONSTRAINS/SUBSTITUTES
    direction: positive  # positive/negative/mixed
    weight: 0.7
    confidence: 0.8
    lag: 中期
    description: 关系及传导条件
    evidence_urls: [支持该关系的参考资料链接]
```

**要求：**
- 基于最新产业研究和市场报告
- 聚焦A股/港股/美股上市公司相关领域
- 环节划分要清晰，避免重叠
- 每个阶段2-4个环节为宜
- code使用英文小写下划线格式
- relationships 的 from/to 必须引用本次输出的 segment code
- 禁止自环、重复边和没有机制说明的弱关系
- 证据不足的关系不要输出，不得用常识补全来源
- 只输出YAML，不要其他解释

**⚠️ 关键约束（产业名称）：**
- industry.name 必须使用上面指定的名称：「{industry_name}」
- 不要对名称进行任何修改、美化或翻译
- 即使名称包含测试后缀、时间戳或看起来不规范，也必须原样保留
- 例如：如果输入是"AI算力硬件_test_20240807"，输出也必须是"AI算力硬件_test_20240807"

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

    async def _call_claude_for_structure(self, prompt: str, timeout: Optional[int] = None) -> str:
        """调用Claude API进行结构分析

        Args:
            prompt: AI提示词
            timeout: 超时时间（秒），默认90秒

        Returns:
            YAML格式的响应文本

        Raises:
            asyncio.TimeoutError: 当API调用超时
        """
        timeout = timeout or max(90, int(os.getenv("GRAPH_AI_TIMEOUT_SECONDS", "240")))
        try:
            message = await asyncio.wait_for(
                self.anthropic.messages.create(
                    model=self.model,
                    max_tokens=max(4096, int(os.getenv("GRAPH_STRUCTURE_MAX_TOKENS", "8192"))),
                    temperature=0.3,  # 较低温度保证稳定性
                    messages=[{
                        "role": "user",
                        "content": prompt
                    }]
                ),
                timeout=timeout
            )

            response_text = "".join(
                block.text for block in message.content
                if getattr(block, "type", None) == "text" and getattr(block, "text", None)
            ).strip()
            if not response_text:
                raise ValueError("AI响应不包含文本内容")

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
        except asyncio.TimeoutError:
            raise Exception(f"AI调用超时（{timeout}秒），请稍后重试")

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

            # ⚠️ 关键修复：强制使用原始输入的产业名称
            # AI可能会修改名称（去掉测试后缀、美化等），这会导致前端显示不一致
            if data["industry"]["name"] != industry_name:
                print(f"[WARNING] AI修改了产业名称: '{data['industry']['name']}' -> '{industry_name}'（已强制修正）")
                data["industry"]["name"] = industry_name

            segment_codes = {
                segment.get("code")
                for stage in data.get("structure", [])
                for segment in stage.get("segments", [])
                if isinstance(segment, dict) and segment.get("code")
            }
            normalized_relationships = []
            seen_relationships = set()
            relation_aliases = {"ENABLES": "INFLUENCES", "DRIVES_DEMAND": "INFLUENCES"}
            for raw_relation in data.get("relationships", []) or []:
                if not isinstance(raw_relation, dict):
                    continue
                candidate = dict(raw_relation)
                candidate["type"] = relation_aliases.get(
                    str(candidate.get("type", "")).upper(),
                    str(candidate.get("type", "")).upper(),
                )
                if candidate.get("from") not in segment_codes or candidate.get("to") not in segment_codes:
                    continue
                if candidate.get("from") == candidate.get("to"):
                    continue
                relation_key = (candidate.get("from"), candidate.get("to"), candidate.get("type"))
                if relation_key in seen_relationships:
                    continue
                try:
                    normalized_relationships.append(
                        SegmentRelationshipInfo(**candidate).model_dump(by_alias=True)
                    )
                    seen_relationships.add(relation_key)
                except Exception as relation_error:
                    print(f"跳过无效环节关系: {relation_error}")
            data["relationships"] = normalized_relationships

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

        # 为每个segment限流并行填充；模型网关在高并发时会出现部分超时。
        concurrency = max(1, int(os.getenv("GRAPH_COMPANY_CONCURRENCY", "8")))
        semaphore = asyncio.Semaphore(concurrency)

        async def fill_with_retry(stage_name: str, segment: SegmentInfo):
            async with semaphore:
                last_error = None
                for attempt in range(3):
                    try:
                        detail = await self._fill_segment(
                            industry_name=structure.industry.name,
                            stage_name=stage_name,
                            segment=segment,
                        )
                        if not detail.companies:
                            raise ValueError("企业候选为空")
                        return detail
                    except Exception as error:
                        last_error = error
                        if attempt < 2:
                            await asyncio.sleep(2)
                raise last_error

        tasks = []
        for stage in structure.structure:
            for segment in stage.segments:
                task = fill_with_retry(stage.stage, segment)
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
                "total_relationships": sum(len(d.relationships) for d in details.values()),
                "structure_cognition": assess_structure_cognition(structure),
                "company_selection": "etf_holdings_first_then_business_validation",
            }
        )

    async def refine_companies(
        self,
        current_result: ExplorationResult,
        feedback_comments: str
    ) -> ExplorationResult:
        """
        根据用户反馈优化企业信息（增量迭代）

        Args:
            current_result: 当前的探索结果（包含结构和企业信息）
            feedback_comments: 用户反馈意见

        Returns:
            ExplorationResult: 优化后的探索结果
        """
        # 1. 分析用户反馈，确定需要补充哪些环节
        affected_segments = await self._analyze_companies_feedback(
            current_result,
            feedback_comments
        )

        # 2. 对需要补充的环节重新搜索和填充
        details = dict(current_result.details)  # 复制现有数据

        for segment_code in affected_segments:
            # 找到对应的segment信息
            segment_info = None
            stage_name = None
            for stage in current_result.structure.structure:
                for seg in stage.segments:
                    if seg.code == segment_code:
                        segment_info = seg
                        stage_name = stage.stage
                        break
                if segment_info:
                    break

            if segment_info:
                # 重新填充该环节，结合用户反馈
                refined_detail = await self._refill_segment_with_feedback(
                    industry_name=current_result.structure.industry.name,
                    stage_name=stage_name,
                    segment=segment_info,
                    current_detail=details.get(segment_code),
                    feedback=feedback_comments
                )
                details[segment_code] = refined_detail

        return ExplorationResult(
            structure=current_result.structure,
            details=details,
            metadata={
                "total_companies": sum(len(d.companies) for d in details.values()),
                "total_relationships": sum(len(d.relationships) for d in details.values())
            }
        )

    async def refine_unified(
        self,
        current_structure: IndustryStructure,
        current_result: Optional[ExplorationResult],
        feedback_comments: str
    ) -> tuple[IndustryStructure, ExplorationResult]:
        """
        统一优化产业结构和企业信息（增量迭代）

        Args:
            current_structure: 当前的产业链结构
            current_result: 当前的探索结果（包含企业信息）
            feedback_comments: 用户反馈意见

        Returns:
            tuple[IndustryStructure, ExplorationResult]: 优化后的结构和探索结果
        """
        import logging
        logger = logging.getLogger(__name__)

        logger.info(f"[refine_unified] 开始统一优化")
        logger.info(f"[refine_unified] 产业: {current_structure.industry.name}")
        logger.info(f"[refine_unified] 反馈意见: {feedback_comments}")

        # 1. 将当前结构转换为YAML字符串
        current_yaml = self._structure_to_yaml(current_structure)
        logger.info(f"[refine_unified] YAML长度: {len(current_yaml)} 字符")

        # 2. 构建统一优化Prompt（结合当前结构、企业信息和反馈）
        prompt = self._build_unified_refine_prompt(
            current_structure.industry.name,
            current_yaml,
            current_result,
            feedback_comments
        )
        logger.info(f"[refine_unified] Prompt长度: {len(prompt)} 字符")

        # 3. 调用Claude进行增量优化
        logger.info(f"[refine_unified] 开始调用Claude API...")
        response = await self._call_claude_for_structure(prompt)
        logger.info(f"[refine_unified] Claude响应长度: {len(response)} 字符")

        # 4. 解析优化后的结构
        logger.info(f"[refine_unified] 开始解析结构...")
        refined_structure = self._parse_structure_response(
            response,
            current_structure.industry.name
        )
        refined_structure.evidence = current_structure.evidence
        refined_structure = await self._repair_structure_if_needed(refined_structure, max_attempts=1)
        logger.info(f"[refine_unified] 结构解析完成，阶段数: {len(refined_structure.structure)}")

        # 5. 如果结构发生了变化（新增或删除环节），需要相应调整企业信息
        if current_result:
            logger.info(f"[refine_unified] 开始处理企业信息...")

            # 记录原有的segment codes（用于调试）
            original_codes = set(current_result.details.keys())
            logger.info(f"[refine_unified] 原有环节codes: {sorted(original_codes)}")

            # 保留现有企业数据，为新环节创建空的details
            details = dict(current_result.details)

            # 记录优化后的segment codes
            refined_codes = {
                seg.code
                for stage in refined_structure.structure
                for seg in stage.segments
            }
            logger.info(f"[refine_unified] 优化后环节codes: {sorted(refined_codes)}")

            # 检测code变化（可能导致企业数据丢失）
            added_codes = refined_codes - original_codes
            removed_codes = original_codes - refined_codes
            kept_codes = original_codes & refined_codes

            if added_codes:
                logger.info(f"[refine_unified] 新增环节: {sorted(added_codes)}")
            if removed_codes:
                logger.info(f"[refine_unified] 删除环节: {sorted(removed_codes)}")
            if kept_codes:
                logger.info(f"[refine_unified] 保留环节: {sorted(kept_codes)} (共{len(kept_codes)}个)")

            # 🔧 智能匹配逻辑：尝试将被删除环节的企业数据合并到相似的保留环节
            # 场景1：AI改变了code（removed有，added也有）
            # 场景2：AI删除了重复环节（removed有，added没有，但kept中有相似的）
            if removed_codes:
                logger.info(f"[refine_unified] 检测到环节删除，启动智能匹配...")

                # 构建原始segment的name到code的映射
                original_name_to_code = {}
                original_code_to_name = {}
                for stage in current_result.structure.structure:
                    for seg in stage.segments:
                        original_name_to_code[seg.name] = seg.code
                        original_code_to_name[seg.code] = seg.name

                # 构建优化后segment的code到name的映射
                refined_code_to_name = {}
                for stage in refined_structure.structure:
                    for seg in stage.segments:
                        refined_code_to_name[seg.code] = seg.name

                # 尝试匹配：将被删除环节的企业数据合并到相似的保留环节
                code_mapping = {}  # old_code -> new_code (new_code可能在kept_codes或added_codes中)
                merge_targets = kept_codes | added_codes  # 保留的 + 新增的都是潜在合并目标

                # 第一轮：精确名称匹配（适用于added_codes场景）
                if added_codes:
                    for new_code in list(added_codes):
                        new_name = refined_code_to_name.get(new_code)
                        if new_name and new_name in original_name_to_code:
                            old_code = original_name_to_code[new_name]
                            if old_code in removed_codes:
                                code_mapping[old_code] = new_code
                                logger.info(f"[refine_unified] 精确匹配: {old_code} -> {new_code} (名称: {new_name})")

                # 第二轮：Code相似度匹配（核心逻辑，处理所有场景）
                remaining_targets = merge_targets - set(code_mapping.values())
                remaining_removed = removed_codes - set(code_mapping.keys())

                if remaining_targets and remaining_removed:
                    logger.info(f"[refine_unified] 启动模糊匹配 (目标: {len(remaining_targets)}个, 删除: {len(remaining_removed)}个)")

                    for target_code in remaining_targets:
                        best_match = None
                        best_score = 0

                        for old_code in remaining_removed:
                            # 跳过已经映射过的
                            if old_code in code_mapping:
                                continue

                            # 计算code相似度
                            # 1. 检查去掉's'后是否相同（处理复数：ai_chips ↔ ai_chip, ai_servers ↔ ai_server）
                            if target_code.rstrip('s') == old_code.rstrip('s'):
                                score = 0.95
                            # 2. 检查是否一个是另一个的子串
                            elif target_code in old_code or old_code in target_code:
                                score = 0.9
                            # 3. 计算字符相似度
                            else:
                                # 共同字符数 / 总字符数
                                common = sum(1 for c in target_code if c in old_code)
                                score = common / max(len(target_code), len(old_code))

                            if score > best_score and score >= 0.7:  # 阈值70%
                                best_score = score
                                best_match = old_code

                        # 如果找到相似的被删除环节，则合并其企业数据
                        if best_match and best_match in details:
                            code_mapping[best_match] = target_code
                            action = "合并" if target_code in kept_codes else "迁移"
                            logger.info(f"[refine_unified] 模糊匹配: {best_match} -> {target_code} (相似度: {best_score:.2f}, 动作: {action})")

                # 应用映射：将旧code的企业数据迁移或合并到新code
                for old_code, new_code in code_mapping.items():
                    if old_code in details:
                        old_companies = details[old_code].companies

                        # 如果目标code已经有企业数据（合并场景），则追加
                        if new_code in details and details[new_code].companies:
                            existing_count = len(details[new_code].companies)
                            details[new_code].companies.extend(old_companies)
                            logger.info(f"[refine_unified] 合并企业数据: {old_code}({len(old_companies)}家) -> {new_code}(原有{existing_count}家, 合并后{len(details[new_code].companies)}家)")
                        else:
                            # 否则直接迁移
                            details[new_code] = details[old_code]
                            logger.info(f"[refine_unified] 迁移企业数据: {old_code} -> {new_code} ({len(old_companies)}家企业)")

                        # 更新企业的segment_code
                        for company in old_companies:
                            company.segment_code = new_code

                        # 标记已处理
                        removed_codes.discard(old_code)
                        if new_code in added_codes:
                            added_codes.discard(new_code)

            # 为新增的segment添加空details
            for stage in refined_structure.structure:
                for segment in stage.segments:
                    if segment.code not in details:
                        logger.info(f"[refine_unified] 为新环节创建空details: {segment.name} ({segment.code})")
                        details[segment.code] = SegmentDetail(companies=[], relationships=[])

            # 移除已删除segment的details
            valid_segment_codes = refined_codes
            removed_details = {k: len(v.companies) for k, v in details.items() if k not in valid_segment_codes}
            if removed_details:
                logger.warning(f"[refine_unified] 将删除这些环节的企业数据: {removed_details}")

            details = {k: v for k, v in details.items() if k in valid_segment_codes}

            # 统计保留的企业数据
            kept_companies_count = sum(len(details[code].companies) for code in kept_codes if code in details)
            logger.info(f"[refine_unified] 保留的企业数据: {kept_companies_count}家企业")

            # 6. 根据反馈补充企业信息
            logger.info(f"[refine_unified] 分析需要补充企业的环节...")
            affected_segments = await self._analyze_companies_feedback(
                ExplorationResult(structure=refined_structure, details=details),
                feedback_comments
            )
            logger.info(f"[refine_unified] 需要补充企业的环节数: {len(affected_segments)}")

            # 限制补充范围：只补充反馈中明确提到的环节
            # 对于新增环节，如果反馈没有明确要求补充企业，先留空
            for segment_code in affected_segments:
                logger.info(f"[refine_unified] 处理环节: {segment_code}")
                # 找到对应的segment信息
                segment_info = None
                stage_name = None
                for stage in refined_structure.structure:
                    for seg in stage.segments:
                        if seg.code == segment_code:
                            segment_info = seg
                            stage_name = stage.stage
                            break
                    if segment_info:
                        break

                if segment_info:
                    # 只有当反馈明确要求补充企业信息时才调用AI
                    # 必须同时满足：
                    # 1. 有动作词（补充/增加/添加）
                    # 2. 有企业相关词（企业/公司/龙头）或具体企业名称
                    has_action = any(word in feedback_comments for word in ["补充", "增加", "添加"])
                    has_enterprise = any(word in feedback_comments for word in ["企业", "公司", "龙头", "长电", "通富", "华天"])

                    should_refill = has_action and has_enterprise

                    logger.info(f"[refine_unified] 环节 {segment_code} 判断: has_action={has_action}, has_enterprise={has_enterprise}, should_refill={should_refill}")

                    if should_refill:
                        logger.info(f"[refine_unified] 开始补充环节 {segment_code} 的企业信息...")
                        # 重新填充该环节
                        refined_detail = await self._refill_segment_with_feedback(
                            industry_name=refined_structure.industry.name,
                            stage_name=stage_name,
                            segment=segment_info,
                            current_detail=details.get(segment_code),
                            feedback=feedback_comments
                        )
                        details[segment_code] = refined_detail
                        logger.info(f"[refine_unified] 环节 {segment_code} 补充完成，企业数: {len(refined_detail.companies)}")
                    else:
                        logger.info(f"[refine_unified] 跳过环节 {segment_code}（反馈未明确要求补充企业）")

            refined_result = ExplorationResult(
                structure=refined_structure,
                details=details,
                metadata={
                    "total_companies": sum(len(d.companies) for d in details.values()),
                    "total_relationships": sum(len(d.relationships) for d in details.values())
                }
            )
        else:
            # 如果还没有企业信息，只返回结构
            refined_result = ExplorationResult(
                structure=refined_structure,
                details={},
                metadata={}
            )

        return refined_structure, refined_result

    def _build_unified_refine_prompt(
        self,
        industry_name: str,
        current_yaml: str,
        current_result: Optional[ExplorationResult],
        feedback: str
    ) -> str:
        """构建统一优化Prompt（同时处理结构和企业）"""

        # 统计当前企业信息
        company_summary = ""
        if current_result:
            company_summary = "\n\n**当前企业分布：**\n"
            for stage in current_result.structure.structure:
                for segment in stage.segments:
                    detail = current_result.details.get(segment.code)
                    if detail:
                        company_count = len(detail.companies)
                        company_names = [c.name for c in detail.companies[:3]]
                        company_summary += f"- {segment.name}（code: {segment.code}）：{company_count}家企业"
                        if company_names:
                            company_summary += f"（如：{', '.join(company_names)}等）"
                        company_summary += "\n"

        # 提取当前所有segment codes，用于约束AI保持code稳定
        existing_segment_codes = []
        if current_result:
            for stage in current_result.structure.structure:
                for segment in stage.segments:
                    existing_segment_codes.append(f"  - {segment.code}: {segment.name}")

        segment_codes_section = ""
        if existing_segment_codes:
            segment_codes_section = "\n\n**当前环节code列表：**\n" + "\n".join(existing_segment_codes)

        prompt = f"""你是一位专业的产业分析师。用户对「{industry_name}」的知识图谱提出了反馈意见，请根据反馈进行增量优化。

**当前产业链结构（YAML格式）：**
```yaml
{current_yaml}
```
{company_summary}{segment_codes_section}

**用户反馈意见：**
{feedback}

**任务：**
1. 仔细阅读用户的反馈意见
2. 在当前结构的基础上进行针对性优化：
   - 如果用户要求补充某些环节/阶段，则添加相应内容
   - 如果用户要求删除/合并某些内容，则进行调整
   - 如果用户要求修改描述或分类，则更新相应字段
   - 如果用户要求补充企业信息，主要在enterprise_requirements中体现
3. 保持结构的完整性和逻辑性
4. 确保优化后的结构符合产业实际情况

**关键约束（保护企业数据）：**
⚠️ 对于保留的环节，必须保持原有的 code 不变！
- 保留的环节：使用原有的 code（如上面列出的code）
- 新增的环节：生成新的 code（使用小写字母和下划线，如 new_segment_name）
- 删除的环节：直接从结构中移除即可
- 合并的环节：选择其中一个现有code保留，删除其他的

为什么要保持code不变？因为每个segment.code关联了企业数据，改变code会导致企业数据丢失！

**输出格式（YAML）：**
输出完整的优化后的产业链结构，格式与当前结构相同：
```yaml
industry:
  name: {industry_name}
  code: 产业代码
  description: 产业描述

structure:
  - stage: 阶段名称
    stage_code: 阶段代码
    description: 阶段描述
    segments:
      - name: 环节名称
        code: 环节代码  # ⚠️ 保留的环节使用原有code
        description: 环节描述
        key_categories: [类别列表]

relationships:
  - from: 源环节code
    to: 目标环节code
    type: SUPPLIES
    direction: positive
    weight: 0.7
    confidence: 0.8
    lag: 中期
    description: 关系说明
    evidence_urls: []
```

**要求：**
- 必须输出完整的YAML结构，不能省略未修改的部分
- 根据用户反馈进行针对性修改
- ⚠️ 保留的环节必须使用原有code，不能随意改变
- 必须同步维护 relationships；删除环节时删除所有引用关系
- 未被反馈涉及的关系保持原样，证据不足不得新增关系
- 保持YAML格式正确
- 只输出YAML，不要其他解释

**⚠️ 关键约束（产业名称）：**
- industry.name 必须使用上面指定的名称：「{industry_name}」
- 不要对名称进行任何修改、美化或翻译
- 即使名称包含测试后缀、时间戳或看起来不规范，也必须原样保留
- 例如：如果输入是"AI算力硬件_test_20240807"，输出也必须是"AI算力硬件_test_20240807"

请输出优化后的完整YAML：
"""
        return prompt

    async def _analyze_companies_feedback(
        self,
        current_result: ExplorationResult,
        feedback: str
    ) -> list[str]:
        """
        分析用户反馈，确定需要补充的环节

        Returns:
            需要补充的segment_code列表
        """
        # 简化实现：如果反馈中提到了具体环节名称，则补充该环节
        # 否则补充所有环节
        affected = []

        for stage in current_result.structure.structure:
            for segment in stage.segments:
                # 如果反馈中提到了该环节，标记为需要补充
                if segment.name in feedback or segment.code in feedback:
                    affected.append(segment.code)

        # 如果没有找到具体环节，限制为最多5个环节（避免全量更新耗时过长）
        if not affected:
            count = 0
            for stage in current_result.structure.structure:
                for segment in stage.segments:
                    affected.append(segment.code)
                    count += 1
                    if count >= 5:  # 最多补充5个环节
                        break
                if count >= 5:
                    break

            if count > 0:
                print(f"[analyze_companies_feedback] 未指定具体环节，将补充前{count}个环节")

        return affected

    async def _refill_segment_with_feedback(
        self,
        industry_name: str,
        stage_name: str,
        segment: SegmentInfo,
        current_detail: Optional[SegmentDetail],
        feedback: str
    ) -> SegmentDetail:
        """
        结合用户反馈增量补充环节信息（保留现有企业）
        """
        # 1. 搜索该segment的关键企业（结合反馈关键词）
        holding_candidates = await self.company_resolver.resolve_candidates(industry_name, segment)
        candidate_names = " ".join(item["name"] for item in holding_candidates[:12])
        search_query = f"{segment.name} 主营业务 产业地位 {industry_name} {feedback} {candidate_names}"
        search_context = await self._search_segment_companies(search_query)

        # 2. 构建当前企业列表的JSON字符串（用于增量合并）
        current_companies_json = "[]"
        if current_detail and current_detail.companies:
            import json
            current_companies_json = json.dumps(
                [
                    {
                        "name": c.name,
                        "name_en": c.name_en,
                        "ticker": c.ticker,
                        "exchange": c.exchange,
                        "country": c.country,
                        "market_position": c.market_position,
                        "key_products": c.key_products,
                        "description": c.description,
                        "evidence_urls": c.evidence_urls,
                        "representative_etfs": [item.model_dump(mode="json") for item in c.representative_etfs],
                        "representative_indices": [item.model_dump(mode="json") for item in c.representative_indices],
                        "match_source": c.match_source,
                        "match_confidence": c.match_confidence,
                        "representativeness_score": c.representativeness_score,
                        "selection_reason": c.selection_reason,
                        "value_signals": c.value_signals,
                    }
                    for c in current_detail.companies
                ],
                ensure_ascii=False,
                indent=2
            )

        # 3. 生成增量补充Prompt
        prompt = self._build_refine_companies_prompt(
            industry_name=industry_name,
            stage_name=stage_name,
            segment=segment,
            context=search_context,
            current_companies_json=current_companies_json,
            feedback=feedback,
            holding_candidates=holding_candidates,
        )

        # 4. 调用Claude进行增量补充
        response = await self._call_claude_for_companies(prompt)

        # 5. 解析响应
        detail = self._parse_company_response(response, segment.code)
        self._retain_search_evidence(detail, search_context)

        return detail

    async def _fill_segment(
        self,
        industry_name: str,
        stage_name: str,
        segment: SegmentInfo
    ) -> SegmentDetail:
        """填充单个segment的企业信息"""

        # 1. 先从相关ETF的真实持仓构造可投资企业候选，再用联网资料验证主营归属。
        holding_candidates = await self.company_resolver.resolve_candidates(industry_name, segment)
        candidate_names = " ".join(item["name"] for item in holding_candidates[:12])
        search_query = f"{segment.name} 主营业务 产业地位 {industry_name} {candidate_names}"
        search_context = await self._search_segment_companies(search_query)

        # 2. 生成填充Prompt
        prompt = self._build_company_prompt(
            industry_name=industry_name,
            stage_name=stage_name,
            segment=segment,
            context=search_context,
            holding_candidates=holding_candidates,
        )

        # 3. 调用Claude提取
        response = await self._call_claude_for_companies(prompt)

        # 4. 解析响应
        detail = self._parse_company_response(response, segment.code, holding_candidates)
        self._retain_search_evidence(detail, search_context)

        # 模型异常或验证过严时仍可用持仓事实产生可审核候选，不回退到无约束编造。
        if not detail.companies and holding_candidates:
            detail = self.company_resolver.fallback_detail(holding_candidates, segment.code)

        return detail

    @staticmethod
    def _retain_search_evidence(detail: SegmentDetail, search_context: str) -> None:
        """Reject model-supplied URLs that were not present in the search evidence."""
        import re
        allowed_urls = set(re.findall(r"链接：(https?://\S+)", search_context))
        for company in detail.companies:
            company.evidence_urls = [url for url in company.evidence_urls if url in allowed_urls]
        for relationship in detail.relationships:
            relationship.evidence_urls = [url for url in relationship.evidence_urls if url in allowed_urls]

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
                    f"{item.get('title', '')}\n"
                    f"链接：{item.get('url', '')}\n"
                    f"{item.get('content', '')[:400]}"
                )

            return "\n\n".join(context_parts)
        except Exception as e:
            print(f"搜索企业失败: {e}")
            fallback = await self._google_news_search(query, 5)
            return "\n\n".join(
                f"{item['title']}\n链接：{item['url']}\n{item['content']}"
                for item in fallback
            )

    def _build_company_prompt(
        self,
        industry_name: str,
        stage_name: str,
        segment: SegmentInfo,
        context: str,
        holding_candidates: Optional[List[Dict]] = None,
    ) -> str:
        """构建企业填充Prompt"""
        holdings_section = ""
        if holding_candidates:
            holdings_section = f"""
**ETF/指数持仓候选（确定性候选集）：**
```json
{json.dumps(holding_candidates, ensure_ascii=False)}
```
只能从上述候选集中选择企业；持仓仅证明可投资暴露，不等同于主营属于该环节。
"""
        prompt = f"""你是一位专业的产业研究员。请为「{segment.name}」环节填充详细信息。

**背景：**
- 产业：{industry_name}
- 阶段：{stage_name}
- 环节：{segment.name}
- 描述：{segment.description}
- 核心类别：{', '.join(segment.key_categories or [])}

**搜索到的市场信息：**
{context}
{holdings_section}

**任务：**
提取该环节的主要上市公司（3-8家），包括：
- 龙头企业（行业领导者）
- 主要企业（市场份额较大）
- 新兴企业（成长潜力大）

**输出格式（JSON）：**
```json
{{
  "companies": [
    {{
      "name": "企业中文名称",
      "name_en": "企业英文名称（可选）",
      "ticker": "股票代码",
      "exchange": "交易所（如SH/SZ/NASDAQ/NYSE）",
      "country": "国家代码（如CN/US/JP）",
      "market_position": "市场地位（leader/major/emerging）",
      "key_products": ["主要产品1", "主要产品2"],
      "description": "企业简介（1-2句话）",
      "evidence_urls": ["直接支持企业归属和主营判断的搜索结果链接"],
      "selection_reason": "为什么其能代表该环节，而不只是被ETF持有",
      "value_signals": {{"business_fit": 0.0, "competitive_position": 0.0, "evidence_quality": 0.0}}
    }}
  ],
  "relationships": []
}}
```

**要求：**
- 优先选择A股上市公司，其次港股、美股
- 必须包含股票代码和交易所
- 若提供了ETF持仓候选，只能选择候选中的ticker；优先跨ETF覆盖广、权重高且主营证据充分的企业
- 每家企业的主营归属需有搜索证据；若暂缺网页证据，可保留持仓候选但降低 evidence_quality，不得编造链接
- value_signals 是研究优先级而非买入评分，不评估股价涨跌或收益率
- 只输出JSON，不要其他解释
"""
        return prompt

    def _build_refine_companies_prompt(
        self,
        industry_name: str,
        stage_name: str,
        segment: SegmentInfo,
        context: str,
        current_companies_json: str,
        feedback: str,
        holding_candidates: Optional[List[Dict]] = None,
    ) -> str:
        """构建企业增量补充Prompt（增量模式）"""
        holding_section = ""
        if holding_candidates:
            holding_section = f"""
**可新增的ETF持仓候选集：**
```json
{json.dumps(holding_candidates, ensure_ascii=False)}
```
新增企业只能来自该候选集；现有企业可保留，但必须维持原有来源与映射字段。
"""
        prompt = f"""你是一位专业的产业研究员。用户对「{segment.name}」环节的企业列表提出了反馈意见，请根据反馈进行增量补充。

**背景：**
- 产业：{industry_name}
- 阶段：{stage_name}
- 环节：{segment.name}
- 描述：{segment.description}
- 核心类别：{', '.join(segment.key_categories or [])}

**当前已有企业列表（JSON格式）：**
```json
{current_companies_json}
```

**用户反馈意见：**
{feedback}

**搜索到的补充信息：**
{context}
{holding_section}

**任务：**
1. 仔细阅读用户的反馈意见和当前企业列表
2. 在当前企业列表的基础上进行针对性补充：
   - 如果用户要求补充某类企业，则在列表中添加相应企业
   - 如果用户要求删除某些企业，则从列表中移除
   - 如果用户要求修改企业信息，则更新相应字段
   - 保留用户未提及的现有企业
3. 确保企业信息准确、完整

**输出格式（JSON）：**
输出完整的优化后的企业列表，格式与当前列表相同：
```json
{{
  "companies": [
    {{
      "name": "企业中文名称",
      "name_en": "企业英文名称（可选）",
      "ticker": "股票代码",
      "exchange": "交易所（如SH/SZ/NASDAQ/NYSE）",
      "country": "国家代码（如CN/US/JP）",
      "market_position": "市场地位（leader/major/emerging）",
      "key_products": ["主要产品1", "主要产品2"],
      "description": "企业简介（1-2句话）",
      "evidence_urls": ["直接支持企业归属和主营判断的搜索结果链接"]
    }}
  ],
  "relationships": []
}}
```

**要求：**
- 必须输出完整的企业列表，包括现有企业和新增企业
- 根据用户反馈进行针对性修改，不要完全重新生成
- 保留用户未提及的现有企业
- 只输出JSON，不要其他解释
- 优先选择A股上市公司，其次港股、美股
- 必须包含股票代码和交易所
- 新增企业必须提供至少一个搜索结果中的 evidence_urls
"""
        return prompt

    async def _call_claude_for_companies(self, prompt: str, timeout: Optional[int] = None) -> str:
        """调用Claude API提取企业信息

        Args:
            prompt: AI提示词
            timeout: 超时时间（秒），默认90秒

        Returns:
            JSON格式的响应文本

        Raises:
            asyncio.TimeoutError: 当API调用超时
        """
        timeout = timeout or max(90, int(os.getenv("GRAPH_AI_TIMEOUT_SECONDS", "240")))
        try:
            message = await asyncio.wait_for(
                self.anthropic.messages.create(
                    model=self.model,
                    max_tokens=max(4096, int(os.getenv("GRAPH_COMPANY_MAX_TOKENS", "6144"))),
                    temperature=0.3,
                    messages=[{
                        "role": "user",
                        "content": prompt
                    }]
                ),
                timeout=timeout
            )

            response_text = "".join(
                block.text for block in message.content
                if getattr(block, "type", None) == "text" and getattr(block, "text", None)
            ).strip()
            if not response_text:
                raise ValueError("AI响应不包含文本内容")

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
        except asyncio.TimeoutError:
            raise Exception(f"AI调用超时（{timeout}秒），请稍后重试")

    def _parse_company_response(
        self,
        json_text: str,
        segment_code: str,
        holding_candidates: Optional[List[Dict]] = None,
    ) -> SegmentDetail:
        """解析JSON响应"""
        try:
            data = json.loads(json_text)
            candidate_by_code = {
                normalize_security_code(item.get("ticker")): item
                for item in (holding_candidates or [])
            }

            companies = []
            for raw_company in data.get("companies", []):
                try:
                    company = dict(raw_company)
                    code = normalize_security_code(company.get("ticker"))
                    if candidate_by_code and code not in candidate_by_code:
                        print(f"跳过不在ETF持仓候选集的企业: {company.get('name')} {code}")
                        continue
                    if code:
                        company["ticker"] = code
                    candidate = candidate_by_code.get(code)
                    if candidate:
                        company["representative_etfs"] = candidate["representative_etfs"]
                        company["match_source"] = candidate["match_source"]
                        company["match_confidence"] = candidate["match_confidence"]
                        company["representativeness_score"] = candidate["representativeness_score"]
                        company["selection_reason"] = company.get("selection_reason") or candidate["selection_reason"]
                    company["segment_code"] = segment_code
                    companies.append(CompanyInfo(**company))
                except Exception as company_error:
                    print(f"跳过无效企业: {company_error}")
            relationships = []
            for raw_relationship in data.get("relationships", []):
                try:
                    relationship = dict(raw_relationship)
                    if "type" not in relationship:
                        # Free-form relationship text cannot safely become a graph edge.
                        continue
                    relationships.append(RelationshipInfo(**relationship))
                except Exception as relationship_error:
                    print(f"跳过无效企业关系: {relationship_error}")

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
