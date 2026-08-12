"""
趋势分析服务（知识图谱版本）
基于知识图谱的产业细分领域（segmentCodes）进行趋势分析
"""

import os
import json
import logging
import aiohttp
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import anthropic

logger = logging.getLogger(__name__)


class TrendAnalysisServiceV3:
    """基于知识图谱的趋势分析服务"""

    def __init__(self, db):
        self.db = db
        self.model = os.getenv('CLAUDE_MODEL', 'claude-sonnet-4-20250514')

        # 知识图谱缓存
        self.industries = []
        self.segments_by_industry = {}  # {industry_code: [segments]}
        self.all_segments = {}  # {segment_code: segment_info}
        self.last_sync_time = None

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
            logger.warning('ANTHROPIC_API_KEY未设置，AI深度分析功能不可用')

    async def sync_knowledge_graph(self):
        """从知识图谱API同步产业结构"""
        try:
            # 每小时最多同步一次
            if self.last_sync_time and (datetime.now() - self.last_sync_time).seconds < 3600:
                return

            base_url = os.getenv('DATA_SERVICE_URL', 'http://localhost:8000')

            async with aiohttp.ClientSession() as session:
                # 获取产业列表
                async with session.get(f'{base_url}/api/v1/industries') as resp:
                    if resp.status != 200:
                        logger.error(f"获取产业列表失败: {resp.status}")
                        return
                    industries_data = await resp.json()
                    self.industries = industries_data  # 直接是数组

                # 获取每个产业的细分领域
                self.segments_by_industry = {}
                self.all_segments = {}

                for industry in self.industries:
                    industry_id = industry['id']
                    industry_code = industry['code']

                    async with session.get(f'{base_url}/api/v1/industries/{industry_id}/graph') as graph_resp:
                        if graph_resp.status != 200:
                            continue
                        graph_data = await graph_resp.json()
                        # API直接返回 {industry: ..., stages: [...]}
                        stages = graph_data.get('stages', [])

                        segments = []
                        for stage in stages:
                            for segment in stage.get('segments', []):
                                segment_info = {
                                    'industry_code': industry_code,
                                    'industry_name': industry['name'],
                                    'stage_code': stage['code'],
                                    'stage_name': stage['name'],
                                    'segment_code': segment['code'],
                                    'segment_name': segment['name'],
                                    'description': segment.get('description', '')
                                }
                                segments.append(segment_info)
                                self.all_segments[segment['code']] = segment_info

                        self.segments_by_industry[industry_code] = segments

            self.last_sync_time = datetime.now()
            logger.info(f"知识图谱同步完成: {len(self.industries)} 个产业, {len(self.all_segments)} 个细分领域")

        except Exception as e:
            logger.error(f"同步知识图谱失败: {e}")
            import traceback
            logger.error(traceback.format_exc())

    async def analyze_all_segments_lightweight(
        self, news_count: int = 50
    ) -> List[Dict[str, Any]]:
        """
        轻量级分析所有产业（一级标签）
        按知识图谱的一级产业分类，不细分到segment

        Args:
            news_count: 分析的新闻数量

        Returns:
            产业趋势摘要列表
        """
        try:
            # 确保知识图谱已同步
            await self.sync_knowledge_graph()

            if not self.industries:
                logger.warning("知识图谱为空，无法分析")
                return []

            # 获取最近的新闻（包含segmentCodes的）
            news_list = await self._get_recent_news_with_segments(news_count)
            if not news_list:
                logger.warning("未获取到新闻数据")
                return []

            logger.info(f"获取到 {len(news_list)} 条新闻，开始分析产业趋势")

            # 为每个产业生成轻量级分析
            summaries = []
            for industry in self.industries:
                try:
                    summary = await self._analyze_industry_lightweight(
                        industry, news_list
                    )
                    if summary and summary['relatedNewsCount'] > 0:
                        summaries.append(summary)
                except Exception as e:
                    logger.error(f"分析产业 {industry['name']} 失败: {e}")
                    continue

            logger.info(f"成功分析 {len(summaries)} 个产业")
            return summaries

        except Exception as e:
            logger.error(f"轻量级分析失败: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return []

    async def _get_recent_news_with_segments(self, limit: int) -> List[Dict[str, Any]]:
        """获取有segmentCodes的最近新闻"""
        try:
            # 使用同步的数据库访问
            import sqlite3

            # 获取数据库路径
            db_path = os.getenv('DATABASE_PATH', '../prisma/dev.db')
            if not os.path.isabs(db_path):
                # 相对于当前工作目录
                db_path = os.path.join(os.getcwd(), '..', 'prisma', 'dev.db')

            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()

            cursor.execute(
                """
                SELECT id, title, content, summary, source, url, publishTime,
                       category, categoryId, sentiment, sentimentLabel, impact,
                       entities, sectors, keywords, segmentCodes, domainIds
                FROM NewsArticle
                WHERE segmentCodes IS NOT NULL AND segmentCodes != '[]'
                ORDER BY publishTime DESC
                LIMIT ?
                """,
                (limit,)
            )

            rows = cursor.fetchall()
            news_list = []

            for row in rows:
                try:
                    segment_codes = json.loads(row[15]) if row[15] else []
                    domain_ids = json.loads(row[16]) if row[16] else []

                    news_list.append({
                        'id': row[0],
                        'title': row[1],
                        'content': row[2],
                        'summary': row[3],
                        'source': row[4],
                        'url': row[5],
                        'publishTime': row[6],
                        'category': row[7],
                        'categoryId': row[8],
                        'sentiment': row[9],
                        'sentimentLabel': row[10],
                        'impact': row[11],
                        'entities': json.loads(row[12]) if row[12] else {},
                        'sectors': json.loads(row[13]) if row[13] else [],
                        'keywords': json.loads(row[14]) if row[14] else [],
                        'segmentCodes': segment_codes,
                        'domainIds': domain_ids,
                    })
                except Exception as e:
                    logger.error(f"解析新闻行失败: {e}")
                    continue

            conn.close()
            return news_list

        except Exception as e:
            logger.error(f"获取新闻失败: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return []

    async def _analyze_segment_lightweight(
        self, segment_info: Dict[str, Any], all_news: List[Dict[str, Any]]
    ) -> Optional[Dict[str, Any]]:
        """轻量级分析单个细分领域"""
        try:
            segment_code = segment_info['segment_code']

            # 筛选该细分领域的新闻
            filtered_news = [
                news for news in all_news
                if segment_code in news.get('segmentCodes', [])
            ]

            if not filtered_news:
                return None

            # 计算情感分布
            sentiment_dist = self.calculate_sentiment_distribution(filtered_news)

            # 计算趋势方向
            trend_direction, confidence = self._calculate_trend(
                sentiment_dist, len(filtered_news)
            )

            return {
                "domainCode": segment_code,  # 保持字段名兼容前端
                "domainName": f"{segment_info['industry_name']} · {segment_info['segment_name']}",
                "industry": segment_info['industry_name'],
                "segment": segment_info['segment_name'],
                "stage": segment_info['stage_name'],
                "trendDirection": trend_direction,
                "confidenceScore": confidence,
                "sentimentDistribution": sentiment_dist,
                "relatedNewsCount": len(filtered_news),
                "topNews": filtered_news[:5],
                "lastUpdated": datetime.now().isoformat(),
            }

        except Exception as e:
            logger.error(f"分析细分领域失败: {e}")
            return None

    async def _analyze_industry_lightweight(
        self, industry: Dict[str, Any], all_news: List[Dict[str, Any]]
    ) -> Optional[Dict[str, Any]]:
        """轻量级分析单个产业（一级标签）"""
        try:
            industry_code = industry['code']

            # 获取该产业下的所有细分领域代码
            segments = self.segments_by_industry.get(industry_code, [])
            segment_codes = [s['segment_code'] for s in segments]

            if not segment_codes:
                return None

            # 筛选该产业的新闻（新闻的segmentCodes中包含该产业的任一细分领域）
            filtered_news = [
                news for news in all_news
                if any(seg in news.get('segmentCodes', []) for seg in segment_codes)
            ]

            if not filtered_news:
                return None

            # 计算情感分布
            sentiment_dist = self.calculate_sentiment_distribution(filtered_news)

            # 计算趋势方向
            trend_direction, confidence = self._calculate_trend(
                sentiment_dist, len(filtered_news)
            )

            # 生成简短展望
            short_outlook = self._generate_short_outlook(
                industry['name'], trend_direction, sentiment_dist
            )

            return {
                "domainCode": industry_code,  # 保持字段名兼容前端
                "domainName": industry['name'],
                "trendDirection": trend_direction,
                "confidenceScore": confidence,
                "sentimentDistribution": sentiment_dist,
                "relatedNewsCount": len(filtered_news),
                "relatedNews": filtered_news[:30],  # 返回最多30条新闻（与V2服务保持一致）
                "keyDrivers": [],  # 轻量级分析不包含AI生成内容
                "keyRisks": [],
                "shortTermOutlook": short_outlook,
            }

        except Exception as e:
            logger.error(f"分析产业失败: {e}")
            return None

    def _generate_short_outlook(
        self, industry_name: str, trend_direction: str, sentiment_dist: Dict[str, int]
    ) -> str:
        """生成简短展望"""
        total = sum(sentiment_dist.values())
        bullish_pct = sentiment_dist['bullish'] / total * 100 if total > 0 else 0
        bearish_pct = sentiment_dist['bearish'] / total * 100 if total > 0 else 0

        if trend_direction == 'bullish':
            return f"{industry_name}领域近期利好消息占比{bullish_pct:.0f}%，短期趋势向好"
        elif trend_direction == 'bearish':
            return f"{industry_name}领域近期利空消息占比{bearish_pct:.0f}%，短期承压"
        else:
            return f"{industry_name}领域近期消息中性，市场观望情绪较浓"


    def calculate_sentiment_distribution(self, news_list: List[Dict[str, Any]]) -> Dict[str, int]:
        """计算情感分布"""
        bullish = sum(1 for n in news_list if n.get('sentiment') and n['sentiment'] > 0.2)
        bearish = sum(1 for n in news_list if n.get('sentiment') and n['sentiment'] < -0.2)
        neutral = len(news_list) - bullish - bearish

        return {
            "bullish": bullish,
            "neutral": neutral,
            "bearish": bearish
        }

    def _calculate_trend(
        self, sentiment_dist: Dict[str, int], total_count: int
    ) -> tuple[str, float]:
        """计算趋势方向和置信度"""
        if total_count == 0:
            return "neutral", 0.0

        bullish_ratio = sentiment_dist['bullish'] / total_count
        bearish_ratio = sentiment_dist['bearish'] / total_count

        # 判断趋势方向
        if bullish_ratio > 0.4:
            direction = "bullish"
            confidence = min(bullish_ratio, 0.9)
        elif bearish_ratio > 0.4:
            direction = "bearish"
            confidence = min(bearish_ratio, 0.9)
        else:
            direction = "neutral"
            confidence = 0.5

        # 根据样本量调整置信度
        sample_factor = min(total_count / 10, 1.0)
        confidence = confidence * sample_factor

        return direction, round(confidence, 2)


# 全局单例
_service_instance = None

def get_trend_analysis_service_v3(db):
    """获取趋势分析服务实例"""
    global _service_instance
    if _service_instance is None:
        _service_instance = TrendAnalysisServiceV3(db)
    return _service_instance
