# data-service/services/impact_calculator.py
"""
影响因子计算器
基于金融分析方法计算新闻对知识图谱节点的影响因子
"""
import math
import logging
from typing import Dict, List, Any, Optional
from datetime import datetime

from services.neo4j_service import Neo4jService

logger = logging.getLogger(__name__)


class ImpactFactorCalculator:
    """
    影响因子计算器
    参考金融分析方法：事件驱动量化模型
    """

    def __init__(self, neo4j_service: Neo4jService, db):
        self.neo4j = neo4j_service
        self.db = db

        # 影响因子权重配置
        self.BASE_WEIGHTS = {
            'direct': 1.0,      # 直接提及
            'upstream': 0.8,    # 上游节点
            'downstream': 0.6,  # 下游节点
            'indirect': 0.3     # 间接关联
        }

        # 传导衰减系数
        self.PROPAGATION_DECAY = 0.9

        # 时间衰减系数（λ参数）
        self.TIME_DECAY_LAMBDA = 0.1

    def calculate_node_impact(
        self,
        news: Dict[str, Any],
        target_segment: Dict[str, Any],
        graph_context: Dict[str, Any]
    ) -> float:
        """
        计算新闻对某个Segment节点的影响因子

        影响因子 = 基础权重 × 情感分数 × 传导衰减系数 × 时间衰减系数

        Args:
            news: 新闻数据（包含sentiment, confidence, matched_segments等）
            target_segment: 目标Segment信息
            graph_context: 图谱上下文（包含影响链路）

        Returns:
            float: 影响因子分数（0-1）
        """
        # 1. 计算基础权重
        base_weight = self._calculate_base_weight(
            news, target_segment, graph_context
        )

        if base_weight == 0:
            return 0.0

        # 2. 情感分数
        sentiment = news.get('sentiment', 0.0)
        confidence = news.get('sentiment_confidence', 0.8)
        sentiment_score = abs(sentiment) * confidence

        # 3. 传导衰减
        distance = self._get_propagation_distance(
            news.get('matched_segments', []),
            target_segment,
            graph_context
        )
        propagation_decay = self.PROPAGATION_DECAY ** distance

        # 4. 时间衰减
        publish_time = news.get('publish_time')
        if isinstance(publish_time, str):
            publish_time = datetime.fromisoformat(publish_time.replace('Z', '+00:00'))

        days_ago = (datetime.now(publish_time.tzinfo) - publish_time).days
        time_decay = math.exp(-self.TIME_DECAY_LAMBDA * days_ago)

        # 计算最终影响因子
        impact_factor = (
            base_weight *
            sentiment_score *
            propagation_decay *
            time_decay
        )

        return round(impact_factor, 4)

    def _calculate_base_weight(
        self,
        news: Dict[str, Any],
        target_segment: Dict[str, Any],
        graph_context: Dict[str, Any]
    ) -> float:
        """
        计算基础权重

        Args:
            news: 新闻数据
            target_segment: 目标Segment
            graph_context: 图谱上下文

        Returns:
            float: 基础权重
        """
        target_code = target_segment['segment_code']
        matched_segments = news.get('matched_segments', [])

        # 直接提及
        for match in matched_segments:
            if match.get('segment_code') == target_code:
                return self.BASE_WEIGHTS['direct']

        # 检查上下游关系
        upstream = graph_context.get('upstream', [])
        downstream = graph_context.get('downstream', [])

        for up in upstream:
            if up['segment_code'] == target_code:
                return self.BASE_WEIGHTS['upstream']

        for down in downstream:
            if down['segment_code'] == target_code:
                return self.BASE_WEIGHTS['downstream']

        # 间接关联（同产业其他Segment）
        for match in matched_segments:
            if match.get('industry_code') == target_segment.get('industry_code'):
                return self.BASE_WEIGHTS['indirect']

        return 0.0

    def _get_propagation_distance(
        self,
        matched_segments: List[Dict[str, Any]],
        target_segment: Dict[str, Any],
        graph_context: Dict[str, Any]
    ) -> int:
        """
        获取传导距离

        Args:
            matched_segments: 匹配的Segment列表
            target_segment: 目标Segment
            graph_context: 图谱上下文

        Returns:
            int: 传导距离（0=直接提及，1=相邻，2+=间接）
        """
        target_code = target_segment['segment_code']

        # 直接提及
        for match in matched_segments:
            if match.get('segment_code') == target_code:
                return 0

        # 检查上下游关系中的距离
        upstream = graph_context.get('upstream', [])
        downstream = graph_context.get('downstream', [])

        for up in upstream:
            if up['segment_code'] == target_code:
                return up.get('distance', 1)

        for down in downstream:
            if down['segment_code'] == target_code:
                return down.get('distance', 1)

        # 间接关联
        return 3

    async def calculate_chain_impacts(
        self,
        news: Dict[str, Any],
        industry_code: str,
        segment_code: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        计算影响链路中所有节点的影响因子

        Args:
            news: 新闻数据（包含matched_segments）
            industry_code: 产业代码
            segment_code: 环节代码（可选，如果为空则计算整个产业）

        Returns:
            Dict: {
                "direct_nodes": [{segment_code, segment_name, impact_factor}, ...],
                "upstream_affected": [...],
                "downstream_affected": [...],
                "total_impact_score": 7.5
            }
        """
        matched_segments = news.get('matched_segments', [])

        if not matched_segments:
            return {
                "direct_nodes": [],
                "upstream_affected": [],
                "downstream_affected": [],
                "total_impact_score": 0.0
            }

        # 如果指定了segment_code，以它为中心计算
        # 否则，以第一个匹配的Segment为中心
        if segment_code:
            center_segment = next(
                (s for s in matched_segments if s['segment_code'] == segment_code),
                matched_segments[0]
            )
        else:
            center_segment = matched_segments[0]

        # 获取影响链路
        graph_context = await self.neo4j.get_segment_impact_chain(
            industry_code=industry_code,
            segment_code=center_segment['segment_code'],
            max_depth=3
        )

        if not graph_context:
            logger.warning(f"无法获取Segment的影响链路: {center_segment['segment_code']}")
            return {
                "direct_nodes": [],
                "upstream_affected": [],
                "downstream_affected": [],
                "total_impact_score": 0.0
            }

        # 计算直接提及节点的影响因子
        direct_nodes = []
        for match in matched_segments:
            impact = self.calculate_node_impact(
                news,
                match,
                graph_context
            )
            direct_nodes.append({
                'segment_code': match['segment_code'],
                'segment_name': match['segment_name'],
                'industry_code': match['industry_code'],
                'impact_factor': impact,
                'impact_type': 'direct'
            })

        # 计算上游受影响节点
        upstream_affected = []
        for up in graph_context.get('upstream', []):
            impact = self.calculate_node_impact(
                news,
                up,
                graph_context
            )
            if impact > 0.05:  # 过滤掉影响很小的节点
                upstream_affected.append({
                    'segment_code': up['segment_code'],
                    'segment_name': up['segment_name'],
                    'industry_code': up['industry_code'],
                    'distance': up.get('distance', 1),
                    'impact_factor': impact,
                    'impact_type': 'upstream'
                })

        # 计算下游受影响节点
        downstream_affected = []
        for down in graph_context.get('downstream', []):
            impact = self.calculate_node_impact(
                news,
                down,
                graph_context
            )
            if impact > 0.05:
                downstream_affected.append({
                    'segment_code': down['segment_code'],
                    'segment_name': down['segment_name'],
                    'industry_code': down['industry_code'],
                    'distance': down.get('distance', 1),
                    'impact_factor': impact,
                    'impact_type': 'downstream'
                })

        # 计算总影响分数
        all_impacts = (
            [n['impact_factor'] for n in direct_nodes] +
            [n['impact_factor'] for n in upstream_affected] +
            [n['impact_factor'] for n in downstream_affected]
        )
        total_impact_score = sum(all_impacts)

        return {
            "direct_nodes": direct_nodes,
            "upstream_affected": upstream_affected,
            "downstream_affected": downstream_affected,
            "cross_industry": graph_context.get('cross_industry', []),
            "total_impact_score": round(total_impact_score, 2),
            "center_segment": {
                "segment_code": center_segment['segment_code'],
                "segment_name": center_segment['segment_name'],
                "industry_code": industry_code
            }
        }

    async def calculate_and_save_impacts(
        self,
        news_id: str,
        news: Dict[str, Any],
        industry_code: str
    ) -> int:
        """
        计算影响因子并保存到数据库

        Args:
            news_id: 新闻ID
            news: 新闻数据
            industry_code: 产业代码

        Returns:
            int: 保存的影响因子记录数量
        """
        # 计算影响链路
        impact_chain = await self.calculate_chain_impacts(
            news, industry_code
        )

        # 保存到数据库
        saved_count = 0

        all_nodes = (
            impact_chain['direct_nodes'] +
            impact_chain['upstream_affected'] +
            impact_chain['downstream_affected']
        )

        for node in all_nodes:
            try:
                # 使用raw SQL插入（Prisma不支持upsert复合唯一键）
                query = """
                INSERT INTO NewsImpactFactor (
                    id, newsId, industryCode, segmentCode,
                    impactFactor, impactType, distance, calculation, createdAt
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(newsId, industryCode, segmentCode)
                DO UPDATE SET
                    impactFactor = excluded.impactFactor,
                    impactType = excluded.impactType,
                    distance = excluded.distance,
                    calculation = excluded.calculation
                """

                calculation = {
                    'sentiment': news.get('sentiment'),
                    'confidence': news.get('sentiment_confidence', 0.8),
                    'publish_time': news.get('publish_time'),
                    'calculated_at': datetime.now().isoformat()
                }

                import uuid
                values = (
                    str(uuid.uuid4()),
                    news_id,
                    node['industry_code'],
                    node['segment_code'],
                    node['impact_factor'],
                    node['impact_type'],
                    node.get('distance', 0),
                    str(calculation),
                    datetime.now().isoformat()
                )

                await self.db.execute(query, values)
                saved_count += 1

            except Exception as e:
                logger.error(f"保存影响因子失败: {e}")
                continue

        logger.info(f"保存了 {saved_count} 个影响因子记录")
        return saved_count


# 全局实例
_impact_calculator: Optional[ImpactFactorCalculator] = None


def get_impact_calculator(neo4j_service: Neo4jService, db) -> ImpactFactorCalculator:
    """获取影响因子计算器单例"""
    global _impact_calculator
    if _impact_calculator is None:
        _impact_calculator = ImpactFactorCalculator(neo4j_service, db)
    return _impact_calculator
