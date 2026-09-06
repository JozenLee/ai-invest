"""
AI分析工作协程池
使用Claude API进行新闻内容分析
"""

import asyncio
import logging
import json
import os
import aiohttp
from typing import List, Optional, Dict, Any
from datetime import datetime
from anthropic import AsyncAnthropic

from models.article import RawArticle, AnalyzedArticle

logger = logging.getLogger(__name__)


class AIAnalyzer:
    """AI分析协程池"""

    def __init__(self, concurrency: int = 5, anthropic_api_key: Optional[str] = None):
        """
        初始化AI分析器

        Args:
            concurrency: 并发协程数量，默认5
            anthropic_api_key: Claude API密钥
        """
        self.concurrency = concurrency
        self.logger = logger

        # 获取API密钥和配置
        api_key = anthropic_api_key or os.getenv('ANTHROPIC_API_KEY')
        base_url = os.getenv('ANTHROPIC_BASE_URL')

        if not api_key:
            logger.warning("未配置ANTHROPIC_API_KEY，AI分析功能将不可用")

        # 初始化Claude客户端，支持自定义base_url
        if api_key:
            client_kwargs = {'api_key': api_key}
            if base_url:
                client_kwargs['base_url'] = base_url
                logger.info(f"使用自定义API端点: {base_url}")

            self.claude_client = AsyncAnthropic(**client_kwargs)
        else:
            self.claude_client = None

        self.redis_client = None  # 可选Redis客户端

        # 获取模型配置
        self.model = os.getenv('CLAUDE_MODEL', 'claude-3-5-sonnet-20241022')

        # 知识图谱产业结构缓存
        self.industry_segments: Dict[str, Any] = {}
        self.segments_prompt = ""

        logger.info(f"AI分析器初始化完成，并发数: {concurrency}, 模型: {self.model}")

    async def load_industry_segments(self, max_retries: int = 3, retry_delay: float = 2.0):
        """
        从知识图谱API动态加载产业细分领域结构
        用于AI分类的prompt构建

        Args:
            max_retries: 最大重试次数，默认3次
            retry_delay: 重试延迟（秒），默认2秒
        """
        for attempt in range(max_retries):
            try:
                base_url = os.getenv('DATA_SERVICE_URL', 'http://localhost:8000')

                # 每次重试都创建新的session
                async with aiohttp.ClientSession() as session:
                    # 获取所有产业列表
                    async with session.get(f'{base_url}/api/v1/industries', timeout=aiohttp.ClientTimeout(total=10)) as resp:
                        if resp.status != 200:
                            logger.warning(f"获取产业列表失败: {resp.status} (尝试 {attempt + 1}/{max_retries})")
                            if attempt < max_retries - 1:
                                await asyncio.sleep(retry_delay)
                                continue
                            return

                        industries = await resp.json()
                        logger.info(f"加载到 {len(industries)} 个产业")

                    # 收集所有产业的细分领域
                    all_segments = []
                    for industry in industries:
                        industry_id = industry['id']
                        industry_code = industry['code']
                        industry_name = industry['name']

                        # 为每个产业创建新的session
                        async with aiohttp.ClientSession() as session:
                            # 获取产业的图谱结构
                            async with session.get(
                                f'{base_url}/api/v1/industries/{industry_id}/graph',
                                timeout=aiohttp.ClientTimeout(total=10)
                            ) as graph_resp:
                                if graph_resp.status != 200:
                                    logger.warning(f"获取产业 {industry_name} 的图谱失败")
                                    continue

                                graph_data = await graph_resp.json()

                                # 提取所有细分领域（忽略阶段信息）
                                for stage in graph_data.get('stages', []):
                                    for segment in stage.get('segments', []):
                                        segment_info = {
                                            'industry_code': industry_code,
                                            'industry_name': industry_name,
                                            'segment_code': segment['code'],
                                            'segment_name': segment['name'],
                                            'description': segment.get('description', '')
                                        }
                                        all_segments.append(segment_info)

                                        # 存储到缓存（用于后续映射）
                                        self.industry_segments[segment['code']] = segment_info

                    # 构建用于prompt的细分领域列表
                    self._build_segments_prompt(all_segments)

                logger.info(f"✅ 成功加载 {len(all_segments)} 个产业细分领域")
                return  # 成功加载，退出重试循环

            except Exception as e:
                logger.warning(f"加载产业细分领域失败 (尝试 {attempt + 1}/{max_retries}): {e}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(retry_delay)
                else:
                    logger.error(f"所有重试均失败，AI分析将不包含产业细分领域分类")
                    # 失败时使用空的分类体系，不阻塞服务启动

    def _build_segments_prompt(self, segments: List[Dict[str, Any]]):
        """
        构建用于AI分析prompt的细分领域描述

        Args:
            segments: 所有细分领域的列表
        """
        # 按产业分组
        by_industry = {}
        for seg in segments:
            industry_name = seg['industry_name']
            if industry_name not in by_industry:
                by_industry[industry_name] = []
            by_industry[industry_name].append(seg)

        # 构建prompt文本
        lines = ["产业细分领域分类（两级：产业 > 细分领域）：\n"]
        for industry_name, segs in by_industry.items():
            lines.append(f"\n【{industry_name}】")
            for seg in segs:
                lines.append(f"  - {seg['segment_code']}: {seg['segment_name']} - {seg['description']}")

        self.segments_prompt = "\n".join(lines)
        logger.info(f"产业细分领域prompt已构建，共 {len(segments)} 个领域")

    async def analyze_batch(self, articles: List[RawArticle]) -> List[AnalyzedArticle]:
        """
        批量分析新闻（并发控制）

        Args:
            articles: 原始新闻列表

        Returns:
            分析后的新闻列表
        """
        if not articles:
            return []

        if not self.claude_client:
            logger.warning("Claude API未配置，返回未分析的文章")
            return [AnalyzedArticle(**article.dict(), aiProcessed=False, aiError='AI分类服务未配置') for article in articles]

        if not getattr(self, 'industry_segments', None):
            await self.load_industry_segments()
        if not self.industry_segments:
            return [AnalyzedArticle(**article.model_dump(), aiProcessed=False, aiError='产业分类词典未加载，等待重试') for article in articles]

        if getattr(self, 'industry_segments', None):
            from services.news_classification import classify_batch
            return await classify_batch(self, articles)

        logger.info(f"开始批量分析 {len(articles)} 条新闻")

        semaphore = asyncio.Semaphore(self.concurrency)

        tasks = [asyncio.create_task(self._analyze_with_semaphore(article, semaphore)) for article in articles]
        _, pending = await asyncio.wait(tasks, timeout=float(os.getenv('AI_NEWS_BATCH_TIMEOUT_SECONDS', '90')))
        for task in pending:
            task.cancel()
        await asyncio.gather(*pending, return_exceptions=True)
        results = []
        for article, task in zip(articles, tasks):
            if task.cancelled() or task.exception():
                results.append(AnalyzedArticle(**article.dict(), aiProcessed=False, aiError='AI分类超时或失败，保留原文等待重试'))
            else:
                results.append(task.result())

        # 分离成功/失败
        succeeded = [r for r in results if isinstance(r, AnalyzedArticle)]
        failed = [r for r in results if isinstance(r, Exception)]

        logger.info(f"批量分析完成: 成功 {len(succeeded)}, 失败 {len(failed)}")

        # 失败的写入延迟队列（如果Redis可用）
        if failed and self.redis_client:
            await self._enqueue_retry(failed)

        return succeeded

    async def _analyze_with_semaphore(
        self,
        article: RawArticle,
        semaphore: asyncio.Semaphore
    ) -> AnalyzedArticle:
        """
        带信号量的分析（并发控制）

        Args:
            article: 原始新闻
            semaphore: 信号量

        Returns:
            分析后的新闻
        """
        async with semaphore:
            return await self._analyze_single(article)

    async def _analyze_single(self, article: RawArticle) -> AnalyzedArticle:
        """
        单条分析（30秒超时 - 给Claude API足够时间响应）

        Args:
            article: 原始新闻

        Returns:
            分析后的新闻（简化版 - 只包含产业细分和影响力）
        """
        try:
            # 调用Claude API（30秒超时）
            analysis = await asyncio.wait_for(
                self._call_claude_api(article),
                timeout=30.0
            )

            # 获取产业细分领域codes（由AI直接返回）
            segment_codes = analysis.get('segment_codes', [])

            return AnalyzedArticle(
                **article.dict(),
                segmentCodes=segment_codes,  # 产业细分领域codes
                sentiment=analysis.get('sentiment'),  # 情绪分数 -1到1
                impact=analysis.get('impact'),  # 影响力等级 1-5
                aiProcessed=True,
                aiProcessedAt=datetime.now()
            )

        except asyncio.TimeoutError:
            logger.warning(f"AI分析超时: {article.title[:50]}")
            return AnalyzedArticle(**article.dict(), aiProcessed=False, aiError='AI分类超时')
        except Exception as e:
            logger.error(f"AI分析失败: {e}, 文章: {article.title[:50]}")
            return AnalyzedArticle(
                **article.dict(),
                aiProcessed=False,
                aiError=str(e)
            )

    async def _call_claude_api(self, article: RawArticle) -> dict:
        """
        调用Claude API进行分析（简化版 - 只提取产业细分、情绪和影响力）

        Args:
            article: 原始新闻

        Returns:
            分析结果字典 {"segment_codes": [...], "sentiment": -1~1, "impact": 1-5}
        """
        # 构建产业细分领域部分的prompt
        segments_section = ""
        if self.segments_prompt:
            segments_section = f"""

{self.segments_prompt}

请根据新闻内容，从上述产业细分领域中选择1-3个最相关的领域代码（segment_code）。
"""
        else:
            segments_section = """

注意：产业细分领域分类暂未加载，请在segment_codes字段返回空数组[]。
"""

        prompt = f"""请分析以下财经新闻，提供结构化的分析结果：

标题：{article.title}
内容：{article.content[:800]}
来源：{article.source}

请提供以下分析：

1. **产业细分领域**（segment_codes）：从上述产业细分领域中选择1-3个最相关的领域代码

2. **情绪判断**（sentiment）：判断新闻对相关产业的情绪倾向，返回-1到1之间的数值
   - 正值（0.3~1.0）：利好消息
     * 0.7~1.0：重大利好（业绩大增、重大突破、政策支持）
     * 0.3~0.7：一般利好（订单增加、合作达成、产品发布）
   - 负值（-1.0~-0.3）：利空消息
     * -1.0~-0.7：重大利空（业绩暴跌、重大事故、严厉监管）
     * -0.7~-0.3：一般利空（竞争加剧、成本上升、订单减少）
   - 接近0（-0.3~0.3）：中性消息（行业动态、数据统计、一般报道）

   **判断标准**：
   - 重点关注对公司/行业**盈利能力、市场份额、发展前景**的实质影响
   - "规模化出货"、"订单增加"、"业绩翻倍" = 利好
   - "产能扩张"、"技术突破"、"政策支持" = 利好
   - "市场萎缩"、"亏损扩大"、"监管收紧" = 利空
   - 纯事实陈述、数据报告、行业动态 = 中性

3. **影响力等级**（impact）：1-5级别
   - 1: 微小影响（行业日常动态、边缘消息）
   - 2: 较小影响（单个公司常规新闻）
   - 3: 中等影响（行业趋势、重要合作）
   - 4: 较大影响（政策变化、重大技术突破、龙头公司重大事件）
   - 5: 重大影响（行业格局变化、重大政策、颠覆性技术）
{segments_section}

以JSON格式返回，格式如下：
{{
  "segment_codes": ["ai_chip_design", "ai_server_board"],
  "sentiment": 0.8,
  "impact": 4
}}"""

        message = await self.claude_client.messages.create(
            model=self.model,
            max_tokens=1024,
            messages=[
                {"role": "user", "content": prompt}
            ]
        )

        # 解析JSON响应
        content = message.content[0].text

        # 尝试提取JSON
        import re
        json_match = re.search(r'\{.*\}', content, re.DOTALL)
        if json_match:
            result = json.loads(json_match.group())

            # 确保必需字段存在并设置默认值
            if 'segment_codes' not in result:
                result['segment_codes'] = []
            if 'sentiment' not in result:
                result['sentiment'] = 0.0  # 默认中性
            if 'impact' not in result:
                result['impact'] = 3  # 默认中等影响

            # 验证sentiment范围
            sentiment = result.get('sentiment', 0.0)
            if not isinstance(sentiment, (int, float)) or sentiment < -1 or sentiment > 1:
                logger.warning(f"sentiment值异常: {sentiment}，重置为0")
                result['sentiment'] = 0.0

            # 验证impact范围
            impact = result.get('impact', 3)
            if not isinstance(impact, int) or impact < 1 or impact > 5:
                logger.warning(f"impact值异常: {impact}，重置为3")
                result['impact'] = 3

            # 调试日志
            logger.info(f"AI分析结果: title={article.title[:30]}, segment_codes={result.get('segment_codes', [])}, sentiment={result.get('sentiment')}, impact={result.get('impact')}")

            return result
        else:
            raise ValueError("Claude API未返回有效JSON")

    async def _enqueue_retry(self, failed_items: List[Exception]):
        """
        将失败的任务加入Redis重试队列

        Args:
            failed_items: 失败的异常列表
        """
        # TODO: 实现Redis重试队列
        logger.info(f"将 {len(failed_items)} 个失败任务加入重试队列（未实现）")
