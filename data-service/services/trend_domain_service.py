"""
趋势分析服务（重构版）
直接基于NewsArticle.domainIds字段和ETF领域配置
不再依赖Domain表
"""

import os
import json
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import anthropic

logger = logging.getLogger(__name__)

# ETF领域配置（与前端src/config/etf-domains.ts保持一致）
ETF_DOMAINS = [
    {"code": "semiconductor", "name": "半导体", "category": "科技", "keywords": ["半导体", "芯片", "晶圆", "光刻机", "封装测试"]},
    {"code": "ai", "name": "人工智能", "category": "科技", "keywords": ["人工智能", "AI", "大模型", "GPT", "深度学习"]},
    {"code": "ai_hardware", "name": "AI算力硬件", "category": "科技", "keywords": ["AI算力", "GPU", "AI芯片", "算力硬件", "AI服务器"]},
    {"code": "computing", "name": "算力设备", "category": "科技", "keywords": ["服务器", "数据中心", "GPU", "算力", "云计算"]},
    {"code": "robotics", "name": "机器人", "category": "科技", "keywords": ["机器人", "工业机器人", "服务机器人", "自动化"]},
    {"code": "communication", "name": "通信设备", "category": "科技", "keywords": ["5G", "通信", "基站", "光通信", "物联网"]},
    {"code": "software", "name": "软件互联网", "category": "科技", "keywords": ["软件", "互联网", "SaaS", "云服务", "电商"]},
    {"code": "new_energy_vehicle", "name": "新能源车", "category": "新能源", "keywords": ["新能源车", "电动车", "智能汽车", "特斯拉", "比亚迪"]},
    {"code": "battery", "name": "电池储能", "category": "新能源", "keywords": ["电池", "锂电", "储能", "宁德时代", "钠电池"]},
    {"code": "photovoltaic", "name": "光伏产业", "category": "新能源", "keywords": ["光伏", "太阳能", "组件", "硅料", "逆变器"]},
    {"code": "wind_power", "name": "风电产业", "category": "新能源", "keywords": ["风电", "风力发电", "海上风电", "风机"]},
    {"code": "innovative_drug", "name": "创新药", "category": "医药", "keywords": ["创新药", "新药", "生物制药", "抗体药物"]},
    {"code": "medical_device", "name": "医疗器械", "category": "医药", "keywords": ["医疗器械", "医疗设备", "影像设备", "手术机器人"]},
    {"code": "equipment", "name": "高端装备", "category": "制造", "keywords": ["装备制造", "机床", "工业母机", "精密仪器"]},
    {"code": "military", "name": "国防军工", "category": "制造", "keywords": ["军工", "国防", "航空航天", "导弹", "雷达"]},
    {"code": "food_beverage", "name": "食品饮料", "category": "消费", "keywords": ["食品", "饮料", "白酒", "乳制品", "调味品"]},
    {"code": "consumer_electronics", "name": "消费电子", "category": "消费", "keywords": ["手机", "消费电子", "可穿戴", "智能硬件"]},
    {"code": "finance", "name": "金融", "category": "其他", "keywords": ["银行", "证券", "保险", "金融科技"]},
    {"code": "real_estate", "name": "房地产", "category": "其他", "keywords": ["房地产", "地产", "物业", "REITs"]},
    {"code": "agriculture", "name": "农业", "category": "其他", "keywords": ["农业", "种业", "化肥", "农药", "养殖"]},
    {"code": "environment", "name": "环保", "category": "其他", "keywords": ["环保", "水处理", "固废处理", "大气治理"]},
]


class TrendAnalysisService:
    """趋势分析服务（重构版）"""

    def __init__(self, db):
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
        轻量级分析所有ETF领域（不调用AI）
        直接基于domainIds字段统计

        Args:
            news_count: 分析的新闻数量（从最近的N条新闻中进行领域分类统计）

        Returns:
            领域趋势摘要列表
        """
        try:
            # 1. 获取最近的指定数量新闻（只要有domainIds的）
            news_list = await self._get_recent_news_with_domains(news_count)
            if not news_list:
                logger.warning("未获取到新闻数据")
                return []

            logger.info(f"获取到 {len(news_list)} 条新闻，开始分析领域趋势")

            # 2. 为每个ETF领域生成轻量级分析（不再限制每个领域的新闻数量）
            summaries = []
            for domain_config in ETF_DOMAINS:
                try:
                    summary = await self._analyze_domain_lightweight_new(
                        domain_config, news_list
                    )
                    if summary and summary['relatedNewsCount'] > 0:
                        summaries.append(summary)
                except Exception as e:
                    logger.error(f"分析领域 {domain_config['name']} 失败: {e}")
                    continue

            logger.info(f"成功分析 {len(summaries)} 个领域")
            return summaries

        except Exception as e:
            logger.error(f"轻量级分析失败: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return []

    async def analyze_domain_detailed(
        self, domain_code: str, news_count: int = 50, include_ai: bool = False
    ) -> Optional[Dict[str, Any]]:
        """
        完整分析单个领域

        Args:
            domain_code: 领域代码
            news_count: 分析的新闻数量（从最近N条新闻中筛选该领域的）
            include_ai: 是否包含AI深度分析（默认False，按需生成）

        Returns:
            领域详细分析结果
        """
        try:
            # 1. 获取领域配置
            domain_config = self._get_domain_config(domain_code)
            if not domain_config:
                logger.error(f"未找到领域配置: {domain_code}")
                return None

            # 2. 获取最近的N条新闻（与概览页面使用相同的数据源，保证一致性）
            all_news = await self._get_recent_news_with_domains(news_count)

            if not all_news:
                logger.warning("未获取到新闻数据")
                return None

            # 3. 从这N条新闻中筛选出该领域的新闻
            filtered_news = [
                news for news in all_news
                if domain_code in news.get('domainIds', [])
            ]

            if not filtered_news:
                logger.warning(f"领域 {domain_code} 在最近{news_count}条新闻中没有找到相关内容")
                # 返回一个空但结构完整的结果，而不是None
                return {
                    "domainCode": domain_code,
                    "domainName": domain_config['name'],
                    "trendDirection": "neutral",
                    "confidenceScore": 0.0,
                    "sentimentDistribution": {
                        "bullish": 0,
                        "neutral": 0,
                        "bearish": 0
                    },
                    "relatedNewsCount": 0,
                    "relatedNews": [],
                    "relatedDomains": [],
                    "keyDrivers": [],
                    "keyRisks": [],
                    "currentStatus": f"{domain_config['name']}领域暂无相关新闻",
                    "shortTermOutlook": "暂无数据，无法分析",
                    "mediumTermOutlook": "暂无数据，无法分析",
                    "allKeyDrivers": [],
                    "allKeyRisks": [],
                    "aiInsight": "",
                    "lastUpdated": datetime.now().isoformat(),
                    "noData": True  # 标记为无数据状态
                }

            logger.info(f"领域 {domain_code} 在最近{news_count}条新闻中找到 {len(filtered_news)} 条相关新闻")

            # 4. 轻量级统计
            sentiment_dist = self.calculate_sentiment_distribution(filtered_news)
            trend_direction, confidence = self._calculate_trend(
                sentiment_dist, len(filtered_news)
            )

            # 5. 组装基础结果（快速返回）
            result = {
                "domainCode": domain_code,
                "domainName": domain_config['name'],
                "trendDirection": trend_direction,
                "confidenceScore": confidence,
                "sentimentDistribution": sentiment_dist,
                "relatedNewsCount": len(filtered_news),
                "relatedNews": filtered_news[:30],  # 返回最多30条
                "relatedDomains": [],  # 暂时留空，后续可添加
                "keyDrivers": [],  # 初始化为空数组
                "keyRisks": [],  # 初始化为空数组
                "lastUpdated": datetime.now().isoformat(),
            }

            # 6. AI深度分析（仅在明确请求时生成）
            ai_insight = None
            if include_ai and self.client:
                logger.info(f"开始为领域 {domain_code} 生成AI分析...")
                # 使用实际筛选出的新闻数量，不硬编码限制
                ai_insight = await self.generate_ai_insight(
                    domain_config['name'], filtered_news
                )

            # 添加AI分析结果或占位符
            if ai_insight:
                drivers = ai_insight.get("keyDrivers", [])
                risks = ai_insight.get("keyRisks", [])
                result.update({
                    "currentStatus": ai_insight.get("currentStatus"),
                    "shortTermOutlook": ai_insight.get("shortTermOutlook"),
                    "mediumTermOutlook": ai_insight.get("mediumTermOutlook"),
                    "keyDrivers": drivers[:2] if drivers else [],  # 摘要版本只取前2条
                    "keyRisks": risks[:2] if risks else [],  # 摘要版本只取前2条
                    "allKeyDrivers": drivers,
                    "allKeyRisks": risks,
                    "aiInsight": "",  # 暂时留空，可后续添加额外洞察
                })
            else:
                # 无AI时使用简单规则（或返回空值让前端显示"生成"按钮）
                result.update({
                    "currentStatus": f"{domain_config['name']}领域近期动态活跃",
                    "shortTermOutlook": self._generate_short_outlook(
                        domain_config['name'], trend_direction, sentiment_dist
                    ),
                    "mediumTermOutlook": "中期趋势需持续观察",
                    "keyDrivers": [],
                    "keyRisks": [],
                    "allKeyDrivers": [],
                    "allKeyRisks": [],
                    "aiInsight": "",
                })

            return result

        except Exception as e:
            logger.error(f"详细分析失败: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return None

    # ==================== 核心统计方法 ====================

    async def _get_recent_news_with_domains(self, limit: int) -> List[Dict[str, Any]]:
        """获取有domainIds的最近新闻"""
        try:
            conn = self.db.get_connection()
            try:
                cursor = conn.execute("""
                    SELECT id, title, content, summary, source, url, publishTime,
                           category, sentiment, sentimentLabel, impact,
                           domainIds, keywords, entities
                    FROM NewsArticle
                    WHERE domainIds IS NOT NULL
                      AND domainIds != '[]'
                      AND domainIds NOT LIKE '%irrelevant%'
                    ORDER BY publishTime DESC
                    LIMIT ?
                """, (limit,))
                rows = cursor.fetchall()

                news_list = []
                for row in rows:
                    news = dict(row)
                    # 解析domainIds JSON
                    try:
                        news['domainIds'] = json.loads(news['domainIds']) if news.get('domainIds') else []
                    except:
                        news['domainIds'] = []
                    news_list.append(news)

                return news_list
            finally:
                conn.close()

        except Exception as e:
            logger.error(f"获取新闻失败: {e}")
            return []

    async def _get_news_by_domain(
        self, domain_code: str, limit: int
    ) -> List[Dict[str, Any]]:
        """获取特定领域的新闻"""
        try:
            conn = self.db.get_connection()
            try:
                cursor = conn.execute("""
                    SELECT id, title, content, summary, source, url, publishTime,
                           category, sentiment, sentimentLabel, impact,
                           domainIds, keywords, entities
                    FROM NewsArticle
                    WHERE domainIds LIKE ?
                    ORDER BY publishTime DESC
                    LIMIT ?
                """, (f'%"{domain_code}"%', limit))
                rows = cursor.fetchall()

                news_list = []
                for row in rows:
                    news = dict(row)
                    # 解析domainIds JSON
                    try:
                        news['domainIds'] = json.loads(news['domainIds']) if news.get('domainIds') else []
                    except:
                        news['domainIds'] = []
                    news_list.append(news)

                return news_list
            finally:
                conn.close()

        except Exception as e:
            logger.error(f"获取领域新闻失败: {e}")
            return []

    async def _analyze_domain_lightweight_new(
        self, domain_config: Dict, news_list: List[Dict]
    ) -> Optional[Dict[str, Any]]:
        """
        轻量级分析单个领域（新版）

        Args:
            domain_config: 领域配置
            news_list: 已筛选的新闻列表（从这些新闻中统计该领域的数据）
        """
        try:
            domain_code = domain_config['code']

            # 筛选该领域的新闻（不再限制数量，因为news_list已经是限定数量的）
            filtered_news = [
                news for news in news_list
                if domain_code in news.get('domainIds', [])
            ]

            if not filtered_news:
                return None

            # 统计情绪分布
            sentiment_dist = self.calculate_sentiment_distribution(filtered_news)

            # 计算趋势方向和置信度
            trend_direction, confidence = self._calculate_trend(
                sentiment_dist,
                len(filtered_news)
            )

            # 生成短期展望
            short_outlook = self._generate_short_outlook(
                domain_config['name'],
                trend_direction,
                sentiment_dist
            )

            return {
                "domainCode": domain_code,
                "domainName": domain_config['name'],
                "trendDirection": trend_direction,
                "confidenceScore": confidence,
                "sentimentDistribution": sentiment_dist,
                "relatedNewsCount": len(filtered_news),
                "keyDrivers": [],
                "keyRisks": [],
                "shortTermOutlook": short_outlook
            }

        except Exception as e:
            logger.error(f"轻量级分析失败: {e}")
            return None

    def calculate_sentiment_distribution(
        self, news_list: List[Dict]
    ) -> Dict[str, int]:
        """
        统计情绪分布（基于sentiment字段值，与前端显示逻辑一致）
        """
        bullish = 0
        bearish = 0
        neutral = 0

        for news in news_list:
            sentiment = news.get('sentiment')

            # 与前端getSentimentInfo相同的逻辑
            if sentiment is None or abs(sentiment) <= 0.2:
                neutral += 1
            elif sentiment > 0.2:
                bullish += 1
            else:  # sentiment < -0.2
                bearish += 1

        return {
            "bullish": bullish,
            "neutral": neutral,
            "bearish": bearish
        }

    def _calculate_trend(
        self, sentiment_dist: Dict[str, int], total_news: int
    ) -> tuple[str, float]:
        """
        计算趋势方向和置信度
        """
        if total_news == 0:
            return "neutral", 0.0

        bullish = sentiment_dist['bullish']
        bearish = sentiment_dist['bearish']
        neutral = sentiment_dist['neutral']

        # 计算净情绪比例
        net_sentiment_ratio = (bullish - bearish) / total_news

        # 确定趋势方向
        if net_sentiment_ratio > 0.15:
            trend_direction = "bullish"
        elif net_sentiment_ratio < -0.15:
            trend_direction = "bearish"
        else:
            trend_direction = "neutral"

        # 计算置信度（基于样本量和情绪集中度）
        sample_confidence = min(total_news / 20, 1.0)  # 20条新闻达到最高样本置信度
        sentiment_strength = abs(net_sentiment_ratio)  # 情绪强度
        confidence = (sample_confidence * 0.5 + sentiment_strength * 0.5)

        return trend_direction, round(confidence, 2)

    def _generate_short_outlook(
        self, domain_name: str, trend_direction: str, sentiment_dist: Dict[str, int]
    ) -> str:
        """生成短期展望文本"""
        total = sum(sentiment_dist.values())
        if total == 0:
            return f"{domain_name}领域近期新闻较少，趋势不明朗"

        bullish_pct = sentiment_dist['bullish'] / total * 100
        bearish_pct = sentiment_dist['bearish'] / total * 100

        if trend_direction == "bullish":
            return f"{domain_name}领域短期看涨，利好消息占比{bullish_pct:.0f}%，市场情绪积极"
        elif trend_direction == "bearish":
            return f"{domain_name}领域短期看跌，利空消息占比{bearish_pct:.0f}%，市场情绪谨慎"
        else:
            return f"{domain_name}领域短期趋势中性，市场观望情绪较浓"

    def _get_domain_config(self, code: str) -> Optional[Dict]:
        """根据代码获取领域配置"""
        for domain in ETF_DOMAINS:
            if domain['code'] == code:
                return domain
        return None

    # ==================== AI分析方法 ====================

    async def generate_ai_insight(
        self, domain_name: str, news_list: List[Dict]
    ) -> Optional[Dict[str, Any]]:
        """AI生成深度洞察"""
        if not self.client or not news_list:
            return None

        try:
            # 准备新闻摘要（使用传入的所有新闻，由Claude自动总结）
            news_summaries = []
            for news in news_list:
                title = news.get('title', '')
                summary = news.get('summary') or title[:50]
                sentiment_label = news.get('sentimentLabel', 'neutral')
                news_summaries.append(f"- [{sentiment_label}] {title}: {summary}")

            news_text = "\n".join(news_summaries)

            prompt = f"""你是一位资深的{domain_name}领域投资分析师。请基于以下最新新闻，给出该领域的投资趋势分析。

新闻列表（共{len(news_list)}条）：
{news_text}

请以JSON格式返回分析结果：
{{
  "currentStatus": "当前状态描述（50字内）",
  "shortTermOutlook": "短期展望（1-3个月，100字内）",
  "mediumTermOutlook": "中期展望（3-6个月，100字内）",
  "keyDrivers": ["关键驱动因素1", "关键驱动因素2", "关键驱动因素3"],
  "keyRisks": ["主要风险1", "主要风险2"]
}}

注意：
1. 基于新闻内容客观分析，不做过度推测
2. 驱动因素和风险要具体、可验证
3. 避免空泛的表述，给出可执行的洞察

请只返回JSON，不要其他说明："""

            response = self.client.messages.create(
                model=self.model,
                max_tokens=600,
                messages=[{"role": "user", "content": prompt}]
            )

            result_text = response.content[0].text.strip()

            # 移除可能的代码块标记
            if result_text.startswith("```json"):
                result_text = result_text[7:]
            if result_text.startswith("```"):
                result_text = result_text[3:]
            if result_text.endswith("```"):
                result_text = result_text[:-3]
            result_text = result_text.strip()

            analysis = json.loads(result_text)
            return analysis

        except Exception as e:
            logger.error(f"AI洞察生成失败: {e}")
            return None


# 创建全局实例的工厂函数
_service_instance = None

def get_domain_trend_service(db):
    """获取基于传统领域数据的趋势分析服务实例。"""
    global _service_instance
    if _service_instance is None:
        _service_instance = TrendAnalysisService(db)
    return _service_instance
