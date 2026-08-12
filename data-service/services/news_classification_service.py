# data-service/services/news_classification_service.py
"""
新闻分类服务（基于知识图谱）
使用Claude API根据产业图谱的Segment对新闻进行分类
"""
import os
import json
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import anthropic

from services.neo4j_service import Neo4jService
from services.cache_service import cache_service

logger = logging.getLogger(__name__)


class NewsClassificationService:
    """新闻分类服务（基于知识图谱）"""

    def __init__(self, neo4j_service: Neo4jService, db):
        self.neo4j = neo4j_service
        self.db = db
        self.model = os.getenv('CLAUDE_MODEL', 'claude-sonnet-4-20250514')

        # 初始化Claude客户端
        api_key = os.getenv('ANTHROPIC_API_KEY')
        base_url = os.getenv('ANTHROPIC_BASE_URL')

        if api_key:
            if base_url:
                self.client = anthropic.Anthropic(api_key=api_key, base_url=base_url)
                logger.info(f'Claude API客户端初始化成功 (base_url: {base_url})')
            else:
                self.client = anthropic.Anthropic(api_key=api_key)
                logger.info('Claude API客户端初始化成功 (官方API)')
        else:
            self.client = None
            logger.warning('ANTHROPIC_API_KEY未设置，分类功能不可用')

        # Segment缓存（定期刷新）
        self._segment_cache = None
        self._cache_updated_at = None
        self._cache_ttl = 300  # 5分钟

    async def classify_news(
        self,
        news: Dict[str, Any],
        use_cache: bool = True
    ) -> Dict[str, Any]:
        """
        对新闻进行AI分类

        Args:
            news: 新闻数据 {title, content, source, publish_time}
            use_cache: 是否使用缓存的Segment列表

        Returns:
            Dict: {
                "matched_segments": [
                    {
                        "industry_code": "ai_hardware",
                        "segment_code": "chip_design",
                        "confidence": 0.85,
                        "matched_keywords": ["GPU", "英伟达"]
                    }
                ],
                "matched_tags": ["tag_gpu", "tag_ai_chip"],
                "has_impact": True
            }
        """
        if not self.client:
            logger.error('Claude客户端未初始化，无法进行分类')
            return {
                "matched_segments": [],
                "matched_tags": [],
                "has_impact": False,
                "error": "Claude API未配置"
            }

        # 1. 刷新Segment缓存（如果需要）
        await self._refresh_segment_cache_if_needed(use_cache)

        if not self._segment_cache:
            logger.error('无法获取Segment列表')
            return {
                "matched_segments": [],
                "matched_tags": [],
                "has_impact": False,
                "error": "Segment列表为空"
            }

        # 2. 关键词预过滤（减少传递给AI的候选项）
        filtered_segments = self._prefilter_segments(news, self._segment_cache)

        if not filtered_segments:
            logger.info(f'新闻未匹配任何Segment关键词: {news.get("title", "")[:50]}')
            return {
                "matched_segments": [],
                "matched_tags": [],
                "has_impact": False
            }

        # 3. 构造AI分类Prompt
        prompt = self._build_classification_prompt(news, filtered_segments)

        # 4. 调用Claude API
        try:
            classification_result = await self._call_claude_classification(prompt)
        except Exception as e:
            logger.error(f'Claude API调用失败: {e}')
            return {
                "matched_segments": [],
                "matched_tags": [],
                "has_impact": False,
                "error": str(e)
            }

        # 5. 解析结果并提取Tag codes
        result = self._parse_classification_result(classification_result, filtered_segments)

        return result

    async def _refresh_segment_cache_if_needed(self, use_cache: bool = True):
        """刷新Segment缓存（如果需要）"""
        now = datetime.now()

        # 检查是否需要刷新
        if (
            use_cache and
            self._segment_cache is not None and
            self._cache_updated_at is not None and
            (now - self._cache_updated_at).total_seconds() < self._cache_ttl
        ):
            return

        # 尝试从Redis缓存获取
        if use_cache:
            cached_segments = cache_service.get('cache:classification:segments')
            if cached_segments:
                self._segment_cache = cached_segments
                self._cache_updated_at = now
                logger.info(f'从缓存加载 {len(cached_segments)} 个Segment')
                return

        # 从Neo4j获取
        logger.info('从Neo4j加载Segment列表...')
        segments = await self.neo4j.get_all_industry_segments_for_classification()

        self._segment_cache = segments
        self._cache_updated_at = now

        # 存入Redis缓存（1小时）
        cache_service.set('cache:classification:segments', segments, ttl=3600)

        logger.info(f'加载了 {len(segments)} 个Segment用于分类')

    def _prefilter_segments(
        self,
        news: Dict[str, Any],
        segments: List[Dict[str, Any]],
        max_candidates: int = 30
    ) -> List[Dict[str, Any]]:
        """
        基于关键词预过滤Segment（减少AI候选项）

        Args:
            news: 新闻数据
            segments: 所有Segment列表
            max_candidates: 最大候选数量

        Returns:
            List[Dict]: 过滤后的Segment列表
        """
        title = news.get('title', '').lower()
        content = news.get('content', '').lower()
        text = f"{title} {content[:500]}"  # 只取前500字符

        matched_segments = []

        for segment in segments:
            keywords = segment.get('keywords', [])
            if not keywords:
                # 如果没有关键词，使用Segment名称作为关键词
                keywords = [segment['segment_name']]

            # 检查是否有关键词匹配
            match_count = 0
            matched_kws = []

            for keyword in keywords:
                if keyword.lower() in text:
                    match_count += 1
                    matched_kws.append(keyword)

            if match_count > 0:
                matched_segments.append({
                    **segment,
                    'match_count': match_count,
                    'matched_keywords': matched_kws
                })

        # 按匹配数量排序
        matched_segments.sort(key=lambda x: x['match_count'], reverse=True)

        # 限制数量
        return matched_segments[:max_candidates]

    def _build_classification_prompt(
        self,
        news: Dict[str, Any],
        segments: List[Dict[str, Any]]
    ) -> str:
        """
        构造分类Prompt

        Args:
            news: 新闻数据
            segments: 候选Segment列表

        Returns:
            str: Prompt文本
        """
        # 构建Segment候选列表
        segment_list = []
        for i, seg in enumerate(segments[:20]):  # 最多20个候选
            segment_list.append(
                f"{i+1}. [{seg['industry_name']} - {seg['stage_name']}] "
                f"{seg['segment_name']} (代码: {seg['segment_code']})\n"
                f"   关键词: {', '.join(seg.get('keywords', [])[:5])}"
            )

        segments_text = "\n".join(segment_list)

        prompt = f"""你是一个金融新闻分类专家。请根据以下产业图谱对新闻进行精确分类。

## 新闻标题
{news.get('title', '')}

## 新闻内容
{news.get('content', '')[:800]}

## 可选分类（产业图谱Segments）
{segments_text}

## 分类规则
1. 从上述Segment列表中选择所有直接相关的分类（支持多选）
2. 只选择新闻内容明确提及的Segment
3. 如果新闻与产业图谱完全无关，返回空列表
4. 为每个匹配项提供置信度分数（0-1）和匹配原因

## 输出格式（JSON）
{{
    "matched_segments": [
        {{
            "segment_code": "chip_design",
            "confidence": 0.85,
            "reason": "新闻提到英伟达GPU芯片设计"
        }}
    ],
    "has_impact": true
}}

请直接返回JSON，不要包含其他文字。"""

        return prompt

    async def _call_claude_classification(self, prompt: str) -> Dict[str, Any]:
        """
        调用Claude API进行分类

        Args:
            prompt: 分类提示词

        Returns:
            Dict: Claude返回的分类结果
        """
        try:
            message = self.client.messages.create(
                model=self.model,
                max_tokens=1024,
                temperature=0.3,  # 降低温度以获得更一致的结果
                messages=[
                    {
                        "role": "user",
                        "content": prompt
                    }
                ]
            )

            # 提取文本内容
            response_text = message.content[0].text

            # 尝试提取JSON（处理markdown代码块包裹的情况）
            import re

            # 先尝试提取```json...```包裹的内容
            json_match = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', response_text, re.DOTALL)
            if json_match:
                json_text = json_match.group(1).strip()
            else:
                # 如果没有代码块，尝试直接提取JSON对象
                json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
                if json_match:
                    json_text = json_match.group(0)
                else:
                    json_text = response_text

            # 解析JSON
            result = json.loads(json_text)

            return result

        except json.JSONDecodeError as e:
            logger.error(f'Claude返回的不是有效JSON: {e}')
            logger.error(f'原始响应: {response_text[:500]}')
            raise
        except Exception as e:
            logger.error(f'Claude API调用失败: {e}')
            raise

    def _parse_classification_result(
        self,
        classification: Dict[str, Any],
        segments: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        解析分类结果并提取Tag codes

        Args:
            classification: Claude返回的分类结果
            segments: 候选Segment列表（包含tag_codes）

        Returns:
            Dict: 标准化的分类结果
        """
        matched_segments = classification.get('matched_segments', [])
        has_impact = classification.get('has_impact', len(matched_segments) > 0)

        # 构建segment_code到segment的映射
        segment_map = {seg['segment_code']: seg for seg in segments}

        # 提取所有Tag codes
        all_tag_codes = set()
        enriched_segments = []

        for match in matched_segments:
            segment_code = match.get('segment_code')

            if segment_code in segment_map:
                segment = segment_map[segment_code]

                # 添加产业和阶段信息
                enriched_match = {
                    **match,
                    'industry_code': segment['industry_code'],
                    'industry_name': segment['industry_name'],
                    'stage_code': segment['stage_code'],
                    'stage_name': segment['stage_name'],
                    'segment_name': segment['segment_name']
                }
                enriched_segments.append(enriched_match)

                # 收集Tag codes
                tag_codes = segment.get('tag_codes', [])
                all_tag_codes.update(tag_codes)

        return {
            'matched_segments': enriched_segments,
            'matched_tags': list(all_tag_codes),
            'has_impact': has_impact
        }

    async def classify_batch(
        self,
        news_list: List[Dict[str, Any]],
        max_concurrent: int = 5
    ) -> List[Dict[str, Any]]:
        """
        批量分类新闻

        Args:
            news_list: 新闻列表
            max_concurrent: 最大并发数

        Returns:
            List[Dict]: 分类结果列表
        """
        import asyncio

        # 预加载Segment缓存
        await self._refresh_segment_cache_if_needed()

        # 分批处理
        results = []
        for i in range(0, len(news_list), max_concurrent):
            batch = news_list[i:i + max_concurrent]

            # 并发分类
            tasks = [self.classify_news(news) for news in batch]
            batch_results = await asyncio.gather(*tasks, return_exceptions=True)

            # 处理异常
            for j, result in enumerate(batch_results):
                if isinstance(result, Exception):
                    logger.error(f'分类失败: {batch[j].get("title", "")[:50]} - {result}')
                    results.append({
                        'matched_segments': [],
                        'matched_tags': [],
                        'has_impact': False,
                        'error': str(result)
                    })
                else:
                    results.append(result)

        return results

    async def invalidate_cache(self):
        """清除分类缓存（当知识图谱更新时调用）"""
        self._segment_cache = None
        self._cache_updated_at = None
        cache_service.delete('cache:classification:segments')
        logger.info('分类缓存已清除')


# 全局实例（延迟初始化）
_classification_service: Optional[NewsClassificationService] = None


def get_classification_service(neo4j_service: Neo4jService, db) -> NewsClassificationService:
    """获取分类服务单例"""
    global _classification_service
    if _classification_service is None:
        _classification_service = NewsClassificationService(neo4j_service, db)
    return _classification_service
