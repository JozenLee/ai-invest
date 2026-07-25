"""
Influencer Analysis Service
使用Claude API分析大V观点帖子
"""

import asyncio
import logging
import json
import os
import re
import time
from typing import Dict, Optional, Any
from datetime import datetime
from anthropic import AsyncAnthropic

logger = logging.getLogger(__name__)


class InfluencerAnalysisService:
    """大V观点分析服务"""

    def __init__(self, db=None, anthropic_api_key: Optional[str] = None):
        """
        初始化分析服务

        Args:
            db: 数据库实例
            anthropic_api_key: Claude API密钥
        """
        self.db = db

        # 获取API密钥和配置
        api_key = anthropic_api_key or os.getenv('ANTHROPIC_API_KEY')
        base_url = os.getenv('ANTHROPIC_BASE_URL')

        if not api_key:
            logger.warning("未配置ANTHROPIC_API_KEY，AI分析功能将不可用")
            self.claude_client = None
        else:
            # 初始化Claude客户端
            client_kwargs = {'api_key': api_key}
            if base_url:
                client_kwargs['base_url'] = base_url
                logger.info(f"使用自定义API端点: {base_url}")

            self.claude_client = AsyncAnthropic(**client_kwargs)

        # 获取模型配置
        self.model = os.getenv('CLAUDE_MODEL', 'claude-3-5-sonnet-20241022')

        logger.info(f"大V分析服务初始化完成，模型: {self.model}")

    async def analyze_post(self, post_id: str) -> Optional[Dict[str, Any]]:
        """
        分析单个大V帖子

        Args:
            post_id: 帖子ID

        Returns:
            分析结果字典，如果失败返回None
        """
        if not self.claude_client:
            logger.error("Claude API未配置，无法进行分析")
            return None

        start_time = time.time()

        try:
            # 1. 从数据库获取帖子和大V信息
            post = await self._get_post(post_id)
            if not post:
                logger.error(f"帖子不存在: {post_id}")
                return None

            influencer = await self._get_influencer(post['influencerId'])
            if not influencer:
                logger.error(f"大V不存在: {post['influencerId']}")
                return None

            logger.info(
                f"Starting analysis for post: {post_id}, "
                f"influencer: {influencer.get('name', 'unknown')}, "
                f"platform: {influencer.get('platform', 'unknown')}"
            )

            # 2. 解析互动数据
            engagement = self._parse_engagement(post.get('engagement'))

            # 3. 构建prompt
            prompt_start = time.time()
            prompt = self._build_prompt(post, influencer, engagement)
            prompt_elapsed = time.time() - prompt_start
            logger.debug(f"Prompt built in {prompt_elapsed:.3f}s, length: {len(prompt)} chars")

            # 4. 调用Claude API（15秒超时）
            api_start = time.time()
            logger.info(f"Calling Claude API for post: {post_id}")
            analysis = await asyncio.wait_for(
                self._call_claude_api(prompt),
                timeout=15.0
            )
            api_elapsed = time.time() - api_start
            logger.info(f"Claude API call completed in {api_elapsed:.2f}s for post: {post_id}")

            # 5. 保存分析结果到数据库
            save_start = time.time()
            await self._save_analysis(post_id, analysis)
            save_elapsed = time.time() - save_start

            total_elapsed = time.time() - start_time
            logger.info(
                f"Analysis completed for post {post_id}: "
                f"total {total_elapsed:.2f}s (API: {api_elapsed:.2f}s, save: {save_elapsed:.2f}s), "
                f"stance: {analysis.get('opinion_stance', 'unknown')}, "
                f"domain: {analysis.get('primary_domain', 'unknown')}"
            )
            return analysis

        except asyncio.TimeoutError:
            elapsed = time.time() - start_time
            error_msg = "Claude API调用超时"
            logger.warning(f"{error_msg} after {elapsed:.2f}s: {post_id}")
            await self._save_error(post_id, error_msg)
            return None

        except Exception as e:
            elapsed = time.time() - start_time
            error_msg = f"分析失败: {str(e)}"
            logger.error(
                f"{error_msg} after {elapsed:.2f}s, 帖子: {post_id}",
                exc_info=True
            )
            await self._save_error(post_id, error_msg)
            return None

    async def _get_post(self, post_id: str) -> Optional[Dict]:
        """从数据库获取帖子信息"""
        try:
            async with self.db.get_connection() as conn:
                cursor = await conn.execute(
                    "SELECT * FROM InfluencerPost WHERE id = ?",
                    (post_id,)
                )
                row = await cursor.fetchone()
                if row:
                    return dict(row)
                return None
        except Exception as e:
            logger.error(f"获取帖子失败: {e}")
            return None

    async def _get_influencer(self, influencer_id: str) -> Optional[Dict]:
        """从数据库获取大V信息"""
        try:
            async with self.db.get_connection() as conn:
                cursor = await conn.execute(
                    "SELECT * FROM Influencer WHERE id = ?",
                    (influencer_id,)
                )
                row = await cursor.fetchone()
                if row:
                    return dict(row)
                return None
        except Exception as e:
            logger.error(f"获取大V信息失败: {e}")
            return None

    def _parse_engagement(self, engagement_json: Optional[str]) -> Dict[str, int]:
        """解析互动数据JSON"""
        if not engagement_json:
            return {'likes': 0, 'comments': 0, 'shares': 0}

        try:
            data = json.loads(engagement_json)
            return {
                'likes': data.get('likes', 0),
                'comments': data.get('comments', 0),
                'shares': data.get('shares', 0)
            }
        except Exception:
            return {'likes': 0, 'comments': 0, 'shares': 0}

    def _build_prompt(self, post: Dict, influencer: Dict, engagement: Dict) -> str:
        """
        构建Claude API分析prompt

        Args:
            post: 帖子数据
            influencer: 大V信息
            engagement: 互动数据

        Returns:
            完整的prompt字符串
        """
        prompt = f"""分析以下大V观点：

大V信息：
- 姓名：{influencer.get('name', '未知')}
- 平台：{influencer.get('platform', '未知')}

帖子内容：
{post['content']}

发布时间：{post.get('publishTime', '未知')}
互动数据：点赞 {engagement['likes']}，评论 {engagement['comments']}，转发 {engagement['shares']}

请提供JSON格式分析，包含以下维度：

1. opinion_summary: 核心观点摘要（30-50字）
2. opinion_stance: bullish|neutral|bearish（看多/中性/看空）
3. opinion_confidence: 0-1（观点置信度，基于论据充分性）
4. main_points: 关键论点数组（3-5个）

5. arguments: 论据评估数组，每个包含：
   - type: data|experience|logic|source（数据支撑/行业经验/逻辑推理/消息来源）
   - content: 论据内容
   - credibility: 0-1（可信度）

6. credibility_score: 0-1（综合可信度分数）

7. primary_domain: 主要领域，从以下选择：
   - AI_CHIP（AI芯片）
   - AI_SERVER（AI服务器）
   - AI_STORAGE（AI存储）
   - AI_NETWORK（AI网络）
   - AI_APPLICATION（AI应用）
   - AI_INFRASTRUCTURE（AI基础设施）
   - MARKET_GENERAL（市场综合）

8. secondary_domains: 次要领域数组（可多选，从上述列表）

9. domain_scores: 各领域相关度评分对象（0-1）

10. sentiment: -1到1（情绪分数，-1极度悲观，0中性，1极度乐观）

11. sentiment_aspects: 情绪方面对象，包含：
    - technology: 对技术的情绪
    - market: 对市场的情绪
    - companies: 对公司的情绪
    - policy: 对政策的情绪

12. risks: 风险点数组（提及的风险）

13. investment_implications: 投资含义 - 积极|中性|谨慎

14. time_horizon: 时间维度 - short|medium|long（短期/中期/长期）

返回纯JSON格式，不要包含markdown代码块标记。

示例输出：
{{
  "opinion_summary": "英伟达新一代GPU算力提升显著，看好AI芯片板块中长期投资价值",
  "opinion_stance": "bullish",
  "opinion_confidence": 0.85,
  "main_points": [
    "新GPU算力提升3倍，技术领先优势扩大",
    "AI服务器需求持续旺盛，订单饱满",
    "国产替代加速，供应链机会增多"
  ],
  "arguments": [
    {{
      "type": "data",
      "content": "英伟达B100 GPU性能提升3倍",
      "credibility": 0.9
    }},
    {{
      "type": "source",
      "content": "供应链消息显示订单排期已到明年Q2",
      "credibility": 0.7
    }}
  ],
  "credibility_score": 0.8,
  "primary_domain": "AI_CHIP",
  "secondary_domains": ["AI_SERVER", "AI_INFRASTRUCTURE"],
  "domain_scores": {{
    "AI_CHIP": 0.9,
    "AI_SERVER": 0.7,
    "AI_INFRASTRUCTURE": 0.5
  }},
  "sentiment": 0.75,
  "sentiment_aspects": {{
    "technology": 0.9,
    "market": 0.7,
    "companies": 0.8,
    "policy": 0.6
  }},
  "risks": [
    "地缘政治风险",
    "估值过高风险"
  ],
  "investment_implications": "积极",
  "time_horizon": "medium"
}}"""

        return prompt

    async def _call_claude_api(self, prompt: str) -> Dict[str, Any]:
        """
        调用Claude API进行分析

        Args:
            prompt: 分析prompt

        Returns:
            分析结果字典

        Raises:
            ValueError: 如果API返回无效JSON
            Exception: 其他API错误
        """
        message = await self.claude_client.messages.create(
            model=self.model,
            max_tokens=2048,
            messages=[
                {"role": "user", "content": prompt}
            ]
        )

        # 解析响应
        content = message.content[0].text

        # 提取JSON（处理markdown包裹的情况）
        json_text = self._extract_json(content)

        try:
            result = json.loads(json_text)
            return result
        except json.JSONDecodeError as e:
            logger.error(f"JSON解析失败: {e}, 内容: {json_text[:200]}")
            raise ValueError(f"Claude API返回无效JSON: {e}")

    def _extract_json(self, text: str) -> str:
        """
        从文本中提取JSON（处理markdown包裹）

        Args:
            text: 原始文本

        Returns:
            提取的JSON字符串
        """
        # 尝试提取markdown代码块中的JSON
        markdown_pattern = r'```(?:json)?\s*(\{.*?\})\s*```'
        match = re.search(markdown_pattern, text, re.DOTALL)
        if match:
            return match.group(1)

        # 尝试直接匹配JSON对象
        json_pattern = r'\{.*\}'
        match = re.search(json_pattern, text, re.DOTALL)
        if match:
            return match.group(0)

        # 如果都没匹配，返回原文本
        return text

    async def _save_analysis(self, post_id: str, analysis: Dict[str, Any]):
        """
        保存分析结果到数据库

        Args:
            post_id: 帖子ID
            analysis: 分析结果
        """
        try:
            now = datetime.now().isoformat()

            async with self.db.get_connection() as conn:
                await conn.execute("""
                    UPDATE InfluencerPost
                    SET aiProcessed = 1,
                        aiProcessedAt = ?,
                        opinionSummary = ?,
                        opinionStance = ?,
                        opinionConfidence = ?,
                        mainPoints = ?,
                        arguments = ?,
                        credibilityScore = ?,
                        primaryDomain = ?,
                        secondaryDomains = ?,
                        domainScores = ?,
                        sentiment = ?,
                        sentimentAspects = ?,
                        risks = ?,
                        investmentImplications = ?,
                        updatedAt = ?
                    WHERE id = ?
                """, (
                    now,
                    analysis.get('opinion_summary'),
                    analysis.get('opinion_stance'),
                    analysis.get('opinion_confidence'),
                    json.dumps(analysis.get('main_points', []), ensure_ascii=False),
                    json.dumps(analysis.get('arguments', []), ensure_ascii=False),
                    analysis.get('credibility_score'),
                    analysis.get('primary_domain'),
                    json.dumps(analysis.get('secondary_domains', []), ensure_ascii=False),
                    json.dumps(analysis.get('domain_scores', {}), ensure_ascii=False),
                    analysis.get('sentiment'),
                    json.dumps(analysis.get('sentiment_aspects', {}), ensure_ascii=False),
                    json.dumps(analysis.get('risks', []), ensure_ascii=False),
                    analysis.get('investment_implications'),
                    now,
                    post_id
                ))

            logger.debug(f"分析结果已保存: {post_id}")

        except Exception as e:
            logger.error(f"保存分析结果失败: {e}, 帖子: {post_id}")
            raise e

    async def _save_error(self, post_id: str, error_msg: str):
        """
        保存分析错误信息

        Args:
            post_id: 帖子ID
            error_msg: 错误信息
        """
        try:
            async with self.db.get_connection() as conn:
                await conn.execute("""
                    UPDATE InfluencerPost
                    SET aiProcessed = 0,
                        aiError = ?,
                        updatedAt = ?
                    WHERE id = ?
                """, (
                    error_msg,
                    datetime.now().isoformat(),
                    post_id
                ))

            logger.debug(f"错误信息已保存: {post_id}")

        except Exception as e:
            logger.error(f"保存错误信息失败: {e}")
