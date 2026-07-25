"""
AI分析工作协程池
使用Claude API进行新闻内容分析
"""

import asyncio
import logging
import json
import os
from typing import List, Optional
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

        # 获取API密钥
        api_key = anthropic_api_key or os.getenv('ANTHROPIC_API_KEY')
        if not api_key:
            logger.warning("未配置ANTHROPIC_API_KEY，AI分析功能将不可用")

        self.claude_client = AsyncAnthropic(api_key=api_key) if api_key else None
        self.redis_client = None  # 可选Redis客户端

        logger.info(f"AI分析器初始化完成，并发数: {concurrency}")

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
            return [AnalyzedArticle(**article.dict(), aiProcessed=False) for article in articles]

        logger.info(f"开始批量分析 {len(articles)} 条新闻")

        semaphore = asyncio.Semaphore(self.concurrency)

        tasks = [
            self._analyze_with_semaphore(article, semaphore)
            for article in articles
        ]

        try:
            # 整批超时90秒
            results = await asyncio.wait_for(
                asyncio.gather(*tasks, return_exceptions=True),
                timeout=90.0
            )
        except asyncio.TimeoutError:
            logger.error("批量分析超时（90秒）")
            results = []

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
        单条分析（15秒超时）

        Args:
            article: 原始新闻

        Returns:
            分析后的新闻
        """
        try:
            # 调用Claude API（15秒超时）
            analysis = await asyncio.wait_for(
                self._call_claude_api(article),
                timeout=15.0
            )

            # 映射分类和领域
            category_id = await self._map_category(analysis.get('category', ''))
            domain_ids = await self._map_domains(analysis.get('keywords', []))

            return AnalyzedArticle(
                **article.dict(),
                categoryId=category_id,
                categoryConfidence=analysis.get('category_confidence', 0.0),
                domainId=domain_ids[0] if domain_ids else None,
                domainIds=domain_ids,
                sentiment=analysis.get('sentiment', {}).get('score'),
                sentimentLabel=analysis.get('sentiment', {}).get('label'),
                sentimentConfidence=analysis.get('sentiment', {}).get('confidence', 0.0),
                impact=analysis.get('impact', {}).get('magnitude'),
                keywords=json.dumps(analysis.get('keywords', []), ensure_ascii=False),
                entities=json.dumps(analysis.get('entities', {}), ensure_ascii=False),
                sectors=json.dumps(analysis.get('sectors', []), ensure_ascii=False),
                aiProcessed=True,
                aiProcessedAt=datetime.now()
            )

        except asyncio.TimeoutError:
            logger.warning(f"AI分析超时: {article.title[:50]}")
            return AnalyzedArticle(**article.dict(), aiProcessed=False)
        except Exception as e:
            logger.error(f"AI分析失败: {e}, 文章: {article.title[:50]}")
            return AnalyzedArticle(
                **article.dict(),
                aiProcessed=False,
                aiError=str(e)
            )

    async def _call_claude_api(self, article: RawArticle) -> dict:
        """
        调用Claude API进行分析

        Args:
            article: 原始新闻

        Returns:
            分析结果字典
        """
        prompt = f"""请分析以下财经新闻，提供结构化的分析结果：

标题：{article.title}
内容：{article.content[:500]}
来源：{article.source}

请提供以下分析：
1. 分类（category）：从以下选择 - policy/earnings/product/partnership/supply/tech/regulation/market
2. 情感（sentiment）：分数-1到1（score），标签bullish/neutral/bearish（label），置信度0-1（confidence）
3. 影响力（impact）：1-5级别（magnitude）
4. 关键词（keywords）：3-5个关键词数组
5. 实体（entities）：companies（公司数组）, sectors（板块数组）, products（产品数组）
6. 相关板块（sectors）：半导体/光通信/服务器/存储/散热/PCB/AI应用

以JSON格式返回，格式如下：
{{
  "category": "tech",
  "category_confidence": 0.9,
  "sentiment": {{"score": 0.8, "label": "bullish", "confidence": 0.85}},
  "impact": {{"magnitude": 4}},
  "keywords": ["AI", "芯片", "需求"],
  "entities": {{"companies": ["英伟达"], "sectors": ["半导体"], "products": ["GPU"]}},
  "sectors": ["半导体", "AI应用"]
}}"""

        message = await self.claude_client.messages.create(
            model="claude-3-5-sonnet-20241022",
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
            return json.loads(json_match.group())
        else:
            raise ValueError("Claude API未返回有效JSON")

    async def _map_category(self, ai_category: str) -> Optional[str]:
        """
        映射AI分类到数据库categoryId

        Args:
            ai_category: AI返回的分类代码

        Returns:
            数据库中的categoryId
        """
        # 分类映射表
        category_map = {
            'policy': 'policy',
            'earnings': 'earnings',
            'product': 'product',
            'partnership': 'merger',
            'supply': 'supply',
            'tech': 'breakthrough',
            'regulation': 'regulation',
            'market': 'global_market'
        }
        return category_map.get(ai_category, 'market')

    async def _map_domains(self, keywords: List[str]) -> List[str]:
        """
        映射关键词到领域IDs

        Args:
            keywords: AI提取的关键词列表

        Returns:
            匹配的领域ID列表
        """
        # 领域关键词映射
        domain_keywords = {
            'ai': ['AI', '人工智能', '大模型', 'GPT', '算力'],
            'chip': ['芯片', '半导体', 'GPU', 'CPU', 'ASIC'],
            'optics': ['光模块', '光通信', 'CPO', '光芯片'],
            'server': ['服务器', '数据中心', '云计算'],
            'storage': ['存储', 'HBM', '内存', 'SSD'],
            'cooling': ['液冷', '散热', '冷却'],
            'pcb': ['PCB', '基板', '载板']
        }

        matched_domains = []
        keywords_str = ' '.join(keywords)

        for domain_id, kws in domain_keywords.items():
            if any(kw in keywords_str for kw in kws):
                matched_domains.append(domain_id)

        return matched_domains

    async def _enqueue_retry(self, failed_items: List[Exception]):
        """
        将失败的任务加入Redis重试队列

        Args:
            failed_items: 失败的异常列表
        """
        # TODO: 实现Redis重试队列
        logger.info(f"将 {len(failed_items)} 个失败任务加入重试队列（未实现）")
