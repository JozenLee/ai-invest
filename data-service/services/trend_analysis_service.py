"""
趋势分析服务
提供领域趋势的轻量级分析和完整AI分析
"""

import os
import json
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import anthropic

logger = logging.getLogger(__name__)

# 尝试导入sklearn
try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    HAS_SKLEARN = True
except ImportError:
    HAS_SKLEARN = False
    logger.warning('sklearn未安装，TF-IDF功能将使用简化版本')


class TrendAnalysisService:
    """趋势分析服务"""

    def __init__(self, data_service, db):
        self.data_service = data_service
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
            logger.warning('ANTHROPIC_API_KEY未设置，AI深度分析功能不可用')

    async def analyze_all_domains_lightweight(
        self, news_count: int = 50
    ) -> List[Dict[str, Any]]:
        """
        轻量级分析所有领域（不调用AI）

        Args:
            news_count: 分析的新闻数量

        Returns:
            领域趋势摘要列表
        """
        try:
            # 1. 获取所有活跃领域
            domains = await self._get_active_domains()
            if not domains:
                logger.warning("未找到活跃领域")
                return []

            # 2. 获取最近的新闻
            news_list = await self._get_recent_news(news_count)
            if not news_list:
                logger.warning("未获取到新闻数据")
                return []

            # 3. 为每个领域生成轻量级分析
            summaries = []
            for domain in domains:
                try:
                    summary = await self._analyze_domain_lightweight(domain, news_list)
                    if summary:
                        summaries.append(summary)
                except Exception as e:
                    logger.error(f"分析领域 {domain.get('name')} 失败: {e}")
                    continue

            return summaries

        except Exception as e:
            logger.error(f"轻量级分析失败: {e}")
            return []

    async def analyze_domain_detailed(
        self, domain_code: str, news_count: int = 50
    ) -> Optional[Dict[str, Any]]:
        """
        完整分析单个领域（调用AI）

        Args:
            domain_code: 领域代码
            news_count: 分析的新闻数量

        Returns:
            领域详细分析结果
        """
        try:
            # 1. 获取领域信息
            domain = await self._get_domain_by_code(domain_code)
            if not domain:
                logger.error(f"未找到领域: {domain_code}")
                return None

            # 2. 获取相关新闻
            news_list = await self._get_recent_news(news_count * 3)  # 获取更多新闻用于筛选
            filtered_news = self.filter_news_by_keywords(
                news_list,
                self._parse_keywords(domain.get('keywords'))
            )[:news_count]

            if not filtered_news:
                logger.warning(f"领域 {domain_code} 没有找到相关新闻")
                return None

            # 3. 轻量级分析
            sentiment_dist = self.calculate_sentiment_distribution(filtered_news)
            trend_direction, confidence = self._calculate_trend(sentiment_dist, len(filtered_news))

            # 4. AI深度分析
            ai_insight = None
            if self.client:
                ai_insight = await self.generate_ai_insight(domain.get('name'), filtered_news)

            # 5. 查询关联领域
            related_domains = await self.find_related_domains(domain)

            # 6. 组装结果
            result = {
                "domainCode": domain.get('code'),
                "domainName": domain.get('name'),
                "trendDirection": trend_direction,
                "confidenceScore": confidence,
                "sentimentDistribution": sentiment_dist,
                "relatedNewsCount": len(filtered_news),
                "relatedNews": filtered_news,
                "lastUpdated": datetime.now().isoformat(),
            }

            # 添加AI分析结果
            if ai_insight:
                all_drivers = ai_insight.get("keyDrivers", [])
                all_risks = ai_insight.get("keyRisks", [])
                result.update({
                    "currentStatus": ai_insight.get("currentStatus"),
                    "shortTermOutlook": ai_insight.get("shortTermOutlook"),
                    "mediumTermOutlook": ai_insight.get("mediumTermOutlook"),
                    "keyDrivers": all_drivers[:2],  # Top 2 for summary
                    "keyRisks": all_risks[:2],      # Top 2 for summary
                    "allKeyDrivers": all_drivers,   # Full list for detail page
                    "allKeyRisks": all_risks,       # Full list for detail page
                    "aiConfidence": ai_insight.get("confidenceLevel", 0.5),
                })
            else:
                # 使用TF-IDF提取关键主题作为降级方案
                topics = self.extract_key_topics_tfidf(filtered_news, top_n=5)
                positive_topics = topics[:2]
                negative_topics = topics[-2:] if len(topics) > 2 else []

                result.update({
                    "currentStatus": f"{domain.get('name')}领域近期共有{len(filtered_news)}条相关新闻",
                    "shortTermOutlook": f"基于新闻数据，{trend_direction}情绪占主导",
                    "mediumTermOutlook": "需持续关注后续发展",
                    "keyDrivers": positive_topics,
                    "keyRisks": negative_topics,
                    "allKeyDrivers": positive_topics,  # Same as keyDrivers for non-AI
                    "allKeyRisks": negative_topics,    # Same as keyRisks for non-AI
                    "aiConfidence": 0.3,
                })

            # 添加关联领域
            result["relatedDomains"] = related_domains

            return result

        except Exception as e:
            logger.error(f"详细分析失败: {e}")
            return None

    def filter_news_by_keywords(
        self, news_list: List[Dict], keywords: List[str]
    ) -> List[Dict]:
        """
        根据关键词筛选新闻

        Args:
            news_list: 新闻列表
            keywords: 关键词列表

        Returns:
            筛选后的新闻列表（按相关性和时间排序）
        """
        if not keywords:
            return news_list

        filtered = []
        for news in news_list:
            title = str(news.get('title', '')).lower()
            content = str(news.get('content', '')).lower()

            # 标题匹配权重更高
            title_matches = sum(1 for kw in keywords if kw.lower() in title)
            content_matches = sum(1 for kw in keywords if kw.lower() in content)

            if title_matches > 0 or content_matches > 0:
                relevance_score = title_matches * 0.7 + content_matches * 0.3
                news_copy = news.copy()
                news_copy['relevance_score'] = relevance_score
                filtered.append(news_copy)

        # 按相关性和时间排序
        filtered.sort(
            key=lambda x: (x.get('relevance_score', 0), x.get('publishTime', '')),
            reverse=True
        )

        return filtered

    def calculate_sentiment_distribution(
        self, news_list: List[Dict]
    ) -> Dict[str, int]:
        """
        统计情绪分布（基于关键词）

        Args:
            news_list: 新闻列表

        Returns:
            情绪分布统计
        """
        positive_keywords = ['上涨', '利好', '突破', '增长', '扩产', '创新', '领先', '强劲', '看好', '推荐']
        negative_keywords = ['下跌', '利空', '风险', '限制', '下滑', '下降', '危机', '困难', '谨慎', '警惕']

        bullish = 0
        bearish = 0
        neutral = 0

        for news in news_list:
            text = f"{news.get('title', '')} {news.get('content', '')}".lower()

            pos_count = sum(1 for kw in positive_keywords if kw in text)
            neg_count = sum(1 for kw in negative_keywords if kw in text)

            if pos_count > neg_count:
                bullish += 1
            elif neg_count > pos_count:
                bearish += 1
            else:
                neutral += 1

        return {
            "bullish": bullish,
            "neutral": neutral,
            "bearish": bearish
        }

    def extract_key_topics_tfidf(
        self, news_list: List[Dict], top_n: int = 5
    ) -> List[str]:
        """
        使用TF-IDF提取关键主题

        Args:
            news_list: 新闻列表
            top_n: 返回的主题数量

        Returns:
            关键主题列表
        """
        if not HAS_SKLEARN or not news_list:
            return self._simple_topic_extraction(news_list, top_n)

        try:
            # 提取文本
            texts = [
                f"{news.get('title', '')} {news.get('content', '')}"
                for news in news_list
            ]

            # TF-IDF向量化
            vectorizer = TfidfVectorizer(
                max_features=20,
                stop_words=None,  # 中文停用词需要自定义
                ngram_range=(1, 2)
            )
            tfidf_matrix = vectorizer.fit_transform(texts)

            # 获取特征词和分数
            feature_names = vectorizer.get_feature_names_out()
            scores = tfidf_matrix.sum(axis=0).A1

            # 排序并返回Top N
            top_indices = scores.argsort()[-top_n:][::-1]
            topics = [feature_names[i] for i in top_indices]

            return topics

        except Exception as e:
            logger.error(f"TF-IDF提取失败: {e}")
            return self._simple_topic_extraction(news_list, top_n)

    async def generate_ai_insight(
        self, domain_name: str, news_list: List[Dict]
    ) -> Optional[Dict[str, Any]]:
        """
        调用Claude API生成深度分析

        Args:
            domain_name: 领域名称
            news_list: 新闻列表

        Returns:
            AI分析结果
        """
        if not self.client:
            logger.warning("Claude客户端未初始化")
            return None

        try:
            # 构建新闻摘要
            news_summary = "\n".join([
                f"{i+1}. {news.get('title')} (发布时间: {news.get('publishTime', 'N/A')})"
                for i, news in enumerate(news_list[:20])  # 限制20条以控制token
            ])

            prompt = f"""角色：你是一位专业的A股投资分析师，专注于AI硬件产业链。

任务：基于以下{len(news_list)}条关于{domain_name}领域的最新新闻，生成投资趋势分析。

新闻列表：
{news_summary}

请按以下JSON格式输出（只返回JSON，不要其他内容）：
{{
  "currentStatus": "当前状态描述（50字内）",
  "shortTermOutlook": "短期展望（1-2周，100字内）",
  "mediumTermOutlook": "中期展望（1-3月，100字内）",
  "keyDrivers": ["驱动因素1", "驱动因素2", "驱动因素3"],
  "keyRisks": ["风险点1", "风险点2", "风险点3"],
  "confidenceLevel": 0.75
}}"""

            response = self.client.messages.create(
                model=self.model,
                max_tokens=500,
                messages=[{"role": "user", "content": prompt}]
            )

            result_text = response.content[0].text.strip()

            # 尝试解析JSON
            try:
                result = json.loads(result_text)
                return result
            except json.JSONDecodeError:
                logger.error(f"AI返回的内容不是有效JSON: {result_text[:200]}")
                return None

        except Exception as e:
            logger.error(f"AI分析失败: {e}")
            return None

    async def find_related_domains(
        self, domain: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        查询关联领域

        Args:
            domain: 领域信息

        Returns:
            关联领域列表
        """
        try:
            # 解析图谱节点ID
            graph_node_ids = self._parse_graph_nodes(domain.get('graphNodes'))
            if not graph_node_ids:
                return []

            # 查询关联的图谱边和节点
            related = []
            async with self.db.get_connection() as conn:
                for node_id in graph_node_ids:
                    # 查询与该节点相连的边
                    cursor = await conn.execute("""
                        SELECT DISTINCT
                            ge.id as edge_id,
                            ge.weight,
                            ge.direction,
                            ge.description,
                            gn.id as related_node_id,
                            gn.name as related_node_name
                        FROM GraphEdge ge
                        JOIN GraphNode gn ON (
                            (ge.sourceId = ? AND ge.targetId = gn.id) OR
                            (ge.targetId = ? AND ge.sourceId = gn.id)
                        )
                        WHERE ge.weight > 0.5
                        LIMIT 5
                    """, (node_id, node_id))

                    rows = await cursor.fetchall()
                    for row in rows:
                        row_dict = dict(row)

                        # 查询关联领域
                        related_domain = await self._find_domain_by_graph_node(
                            row_dict['related_node_id']
                        )

                        if related_domain:
                            # 生成关联说明
                            explanation = await self.generate_domain_relation_explanation(
                                domain.get('name'),
                                related_domain.get('name'),
                                row_dict['weight']
                            )

                            related.append({
                                "code": related_domain.get('code'),
                                "name": related_domain.get('name'),
                                "correlation": row_dict['weight'],
                                "direction": row_dict['direction'],
                                "explanation": explanation or row_dict.get('description', '')
                            })

            return related[:5]  # 返回最多5个关联领域

        except Exception as e:
            logger.error(f"查询关联领域失败: {e}")
            return []

    async def generate_domain_relation_explanation(
        self, domain1: str, domain2: str, correlation: float
    ) -> Optional[str]:
        """
        AI生成关联说明

        Args:
            domain1: 领域1名称
            domain2: 领域2名称
            correlation: 关联强度

        Returns:
            关联说明文本
        """
        if not self.client:
            return None

        try:
            prompt = f"""角色：产业链分析师

任务：用一句话（50字内）描述{domain1}与{domain2}的关联关系

上下文：
- 关联强度：{correlation:.2f}
- 产业链位置：请推测两者在产业链中的位置关系

输出示例："半导体领域上涨通常会带动PCB板块，因为芯片生产需要高端PCB基板，滞后期约1-2周"

请直接输出关联说明，不要其他内容："""

            response = self.client.messages.create(
                model=self.model,
                max_tokens=100,
                messages=[{"role": "user", "content": prompt}]
            )

            return response.content[0].text.strip()

        except Exception as e:
            logger.error(f"生成关联说明失败: {e}")
            return None

    # ==================== 私有辅助方法 ====================

    async def _get_active_domains(self) -> List[Dict[str, Any]]:
        """获取所有活跃领域"""
        try:
            async with self.db.get_connection() as conn:
                cursor = await conn.execute(
                    "SELECT * FROM Domain WHERE isActive = 1 ORDER BY createdAt"
                )
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]
        except Exception as e:
            logger.error(f"获取领域失败: {e}")
            return []

    async def _get_domain_by_code(self, code: str) -> Optional[Dict[str, Any]]:
        """根据代码获取领域"""
        try:
            async with self.db.get_connection() as conn:
                cursor = await conn.execute(
                    "SELECT * FROM Domain WHERE code = ? AND isActive = 1",
                    (code,)
                )
                row = await cursor.fetchone()
                return dict(row) if row else None
        except Exception as e:
            logger.error(f"获取领域失败: {e}")
            return None

    async def _get_recent_news(self, limit: int = 50) -> List[Dict[str, Any]]:
        """获取最近的新闻"""
        try:
            # 从数据库获取
            async with self.db.get_connection() as conn:
                cursor = await conn.execute("""
                    SELECT * FROM NewsArticle
                    ORDER BY publishTime DESC
                    LIMIT ?
                """, (limit,))
                rows = await cursor.fetchall()
                news_list = [dict(row) for row in rows]

            # 如果数据库中新闻不足，从数据服务获取
            if len(news_list) < limit // 2:
                logger.info("数据库新闻不足，从数据服务获取")
                import pandas as pd
                df = await self.data_service.get_news(keyword="财联社", limit=limit)
                if not df.empty:
                    # 转换为字典列表
                    for _, row in df.iterrows():
                        news_list.append({
                            'id': f"temp_{len(news_list)}",
                            'title': str(row.get('新闻标题', '')),
                            'content': str(row.get('新闻内容', '')),
                            'publishTime': str(row.get('发布时间', datetime.now().isoformat())),
                            'source': '财联社',
                            'url': str(row.get('新闻链接', ''))
                        })

            return news_list

        except Exception as e:
            logger.error(f"获取新闻失败: {e}")
            return []

    async def _analyze_domain_lightweight(
        self, domain: Dict[str, Any], news_list: List[Dict]
    ) -> Optional[Dict[str, Any]]:
        """轻量级分析单个领域"""
        try:
            # 筛选相关新闻
            keywords = self._parse_keywords(domain.get('keywords'))
            filtered_news = self.filter_news_by_keywords(news_list, keywords)

            if not filtered_news:
                return None

            # 统计情绪分布
            sentiment_dist = self.calculate_sentiment_distribution(filtered_news)

            # 计算趋势方向和置信度
            trend_direction, confidence = self._calculate_trend(
                sentiment_dist,
                len(filtered_news)
            )

            # 提取关键主题
            topics = self.extract_key_topics_tfidf(filtered_news, top_n=4)
            key_drivers = topics[:2]
            key_risks = topics[-2:] if len(topics) > 2 else []

            # 生成短期展望
            short_outlook = self._generate_short_outlook(
                domain.get('name'),
                trend_direction,
                sentiment_dist
            )

            return {
                "domainCode": domain.get('code'),
                "domainName": domain.get('name'),
                "trendDirection": trend_direction,
                "confidenceScore": confidence,
                "sentimentDistribution": sentiment_dist,
                "relatedNewsCount": len(filtered_news),
                "keyDrivers": key_drivers,
                "keyRisks": key_risks,
                "shortTermOutlook": short_outlook
            }

        except Exception as e:
            logger.error(f"轻量级分析失败: {e}")
            return None

    def _parse_keywords(self, keywords_json: Optional[str]) -> List[str]:
        """解析关键词JSON"""
        if not keywords_json:
            return []
        try:
            return json.loads(keywords_json)
        except:
            return []

    def _parse_graph_nodes(self, graph_nodes_json: Optional[str]) -> List[str]:
        """解析图谱节点JSON"""
        if not graph_nodes_json:
            return []
        try:
            return json.loads(graph_nodes_json)
        except:
            return []

    def _calculate_trend(
        self, sentiment_dist: Dict[str, int], news_count: int
    ) -> tuple:
        """
        计算趋势方向和置信度

        Returns:
            (trend_direction, confidence_score)
        """
        bullish = sentiment_dist.get('bullish', 0)
        neutral = sentiment_dist.get('neutral', 0)
        bearish = sentiment_dist.get('bearish', 0)
        total = bullish + neutral + bearish

        if total == 0:
            return 'neutral', 0.0

        bullish_pct = bullish / total
        bearish_pct = bearish / total

        # 判断趋势方向
        if bullish_pct > 0.5:
            trend = 'bullish'
        elif bearish_pct > 0.5:
            trend = 'bearish'
        elif abs(bullish_pct - bearish_pct) < 0.2:
            trend = 'neutral'
        elif bullish_pct > bearish_pct:
            trend = 'bullish'
        else:
            trend = 'bearish'

        # 计算置信度
        sentiment_clarity = max(bullish_pct, neutral / total if total > 0 else 0, bearish_pct)
        news_confidence = min(news_count / 50, 1.0)
        confidence = sentiment_clarity * 0.5 + news_confidence * 0.5

        return trend, round(confidence, 2)

    def _generate_short_outlook(
        self, domain_name: str, trend_direction: str, sentiment_dist: Dict[str, int]
    ) -> str:
        """生成短期展望文本"""
        total = sum(sentiment_dist.values())
        if total == 0:
            return f"{domain_name}领域近期缺少相关新闻，趋势不明"

        trend_text = {
            'bullish': '看涨',
            'neutral': '中性',
            'bearish': '看跌'
        }.get(trend_direction, '中性')

        bullish_pct = sentiment_dist['bullish'] / total * 100
        bearish_pct = sentiment_dist['bearish'] / total * 100

        return f"{domain_name}市场情绪偏向{trend_text}，" \
               f"利好新闻占{bullish_pct:.0f}%，利空新闻占{bearish_pct:.0f}%"

    def _simple_topic_extraction(
        self, news_list: List[Dict], top_n: int
    ) -> List[str]:
        """简化版主题提取（降级方案）"""
        # 常见投资关键词
        keywords = [
            "AI", "芯片", "半导体", "GPU", "算力", "数据中心",
            "新能源", "电动车", "光伏", "锂电", "医药", "创新药",
            "互联网", "云计算", "供应链", "产能", "技术创新", "政策"
        ]

        keyword_counts = {}
        for news in news_list:
            text = f"{news.get('title', '')} {news.get('content', '')}"
            for kw in keywords:
                if kw in text:
                    keyword_counts[kw] = keyword_counts.get(kw, 0) + 1

        # 排序并返回Top N
        sorted_keywords = sorted(
            keyword_counts.items(),
            key=lambda x: x[1],
            reverse=True
        )

        return [kw for kw, _ in sorted_keywords[:top_n]]

    async def _find_domain_by_graph_node(
        self, node_id: str
    ) -> Optional[Dict[str, Any]]:
        """根据图谱节点ID查找领域"""
        try:
            async with self.db.get_connection() as conn:
                cursor = await conn.execute(
                    "SELECT * FROM Domain WHERE graphNodes LIKE ? AND isActive = 1",
                    (f'%"{node_id}"%',)
                )
                row = await cursor.fetchone()
                return dict(row) if row else None
        except Exception as e:
            logger.error(f"查找领域失败: {e}")
            return None
