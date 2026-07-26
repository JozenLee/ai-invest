"""
内容分析服务
使用Claude API分析新闻和大V动态的情感、主题、投资理念
"""

import os
import json
import logging
from typing import List, Dict, Optional, Any
from datetime import datetime

logger = logging.getLogger(__name__)

# 尝试导入Anthropic SDK
try:
    import anthropic
    HAS_ANTHROPIC = True
except ImportError:
    HAS_ANTHROPIC = False
    logger.warning('Anthropic SDK未安装，内容分析功能将使用简化版本')


class ContentAnalyzer:
    """内容分析服务"""

    def __init__(self):
        self.client = None
        self.model = os.getenv('CLAUDE_MODEL', 'claude-sonnet-4-20250514')
        if HAS_ANTHROPIC:
            api_key = os.getenv('ANTHROPIC_API_KEY')
            base_url = os.getenv('ANTHROPIC_BASE_URL')
            if api_key:
                # 支持自定义API基础URL（用于第三方代理）
                if base_url:
                    self.client = anthropic.Anthropic(
                        api_key=api_key,
                        base_url=base_url
                    )
                    logger.info(f'Claude API客户端初始化成功 (base_url: {base_url}, model: {self.model})')
                else:
                    self.client = anthropic.Anthropic(api_key=api_key)
                    logger.info(f'Claude API客户端初始化成功 (官方API, model: {self.model})')
            else:
                logger.warning('ANTHROPIC_API_KEY未设置，AI分析功能不可用')

    async def analyze_sentiment(self, content: str) -> float:
        """
        分析情感分数
        返回值: -1 (极度利空) 到 +1 (极度利好)
        """
        if not self.client:
            # 简化版本：基于关键词判断
            return self._simple_sentiment(content)

        try:
            prompt = f"""分析以下内容的情感倾向，返回一个-1到1之间的浮点数：
- -1表示极度利空
- 0表示中性
- +1表示极度利好

只返回数字，不要其他内容。

内容：
{content[:1000]}"""

            response = self.client.messages.create(
                model=self.model,
                max_tokens=10,
                messages=[{"role": "user", "content": prompt}]
            )

            result = response.content[0].text.strip()
            # 提取数字
            import re
            numbers = re.findall(r'-?\d+\.?\d*', result)
            if numbers:
                score = float(numbers[0])
                return max(-1, min(1, score))  # 限制在-1到1之间
            return 0.0

        except Exception as e:
            logger.error(f'AI情感分析失败: {e}')
            return self._simple_sentiment(content)

    async def extract_topics(self, content: str) -> List[str]:
        """提取主题/观点"""
        if not self.client:
            return self._simple_topics(content)

        try:
            prompt = f"""从以下内容中提取3-5个关键主题或观点，用JSON数组格式返回。
例如：["AI芯片需求增长", "供应链紧张", "投资机会"]

内容：
{content[:1000]}"""

            response = self.client.messages.create(
                model=self.model,
                max_tokens=100,
                messages=[{"role": "user", "content": prompt}]
            )

            result = response.content[0].text.strip()
            # 尝试解析JSON
            try:
                topics = json.loads(result)
                if isinstance(topics, list):
                    return topics[:5]
            except:
                pass

            return self._simple_topics(content)

        except Exception as e:
            logger.error(f'AI主题提取失败: {e}')
            return self._simple_topics(content)

    async def match_domains(self, content: str, tags: List[str] = None) -> List[str]:
        """匹配相关领域"""
        domains = []
        content_lower = content.lower()

        # 领域关键词映射
        domain_keywords = {
            'ai': ['ai', '人工智能', '芯片', 'gpu', '服务器', '数据中心', '算力', '大模型', '深度学习'],
            'new_energy': ['新能源', '光伏', '风电', '储能', '锂电', '电池', '电动车', '充电桩'],
            'medical': ['医药', '医疗', '创新药', '生物', '疫苗', '医疗器械', 'cxo'],
            'semiconductor': ['半导体', '芯片', '晶圆', '封装', '光刻', '集成电路'],
            'internet': ['互联网', '电商', '社交', '游戏', '云计算', 'saas'],
            'finance': ['金融', '银行', '保险', '证券', '基金', '投资'],
        }

        # 匹配领域
        for domain, keywords in domain_keywords.items():
            for keyword in keywords:
                if keyword in content_lower:
                    if domain not in domains:
                        domains.append(domain)
                    break

        # 如果有标签，也加入匹配
        if tags:
            for tag in tags:
                tag_lower = tag.lower()
                for domain, keywords in domain_keywords.items():
                    if any(kw in tag_lower for kw in keywords):
                        if domain not in domains:
                            domains.append(domain)

        return domains

    async def extract_investment_ideas(self, content: str) -> Dict[str, Any]:
        """
        提取投资理念
        返回: {
            "观点": "...",
            "逻辑": "...",
            "建议": "...",
            "风险": "..."
        }
        """
        if not self.client:
            return self._simple_investment_ideas(content)

        try:
            prompt = f"""从以下内容中提取投资相关的信息，返回JSON格式：
{{
    "观点": "主要投资观点",
    "逻辑": "投资逻辑",
    "建议": "投资建议",
    "风险": "风险提示"
}}

如果某个字段无法提取，填写"未提及"。

内容：
{content[:1500]}"""

            response = self.client.messages.create(
                model=self.model,
                max_tokens=200,
                messages=[{"role": "user", "content": prompt}]
            )

            result = response.content[0].text.strip()
            try:
                ideas = json.loads(result)
                return ideas
            except:
                return self._simple_investment_ideas(content)

        except Exception as e:
            logger.error(f'AI投资理念提取失败: {e}')
            return self._simple_investment_ideas(content)

    async def generate_summary(self, content: str, max_length: int = 100) -> str:
        """生成摘要"""
        if not self.client:
            return content[:max_length] + '...' if len(content) > max_length else content

        try:
            prompt = f"""为以下内容生成一个{max_length}字以内的摘要：

{content[:2000]}"""

            response = self.client.messages.create(
                model=self.model,
                max_tokens=max_length,
                messages=[{"role": "user", "content": prompt}]
            )

            return response.content[0].text.strip()

        except Exception as e:
            logger.error(f'AI摘要生成失败: {e}')
            return content[:max_length] + '...' if len(content) > max_length else content

    # 简化版本方法（无AI时使用）

    def _simple_sentiment(self, content: str) -> float:
        """简化版情感分析"""
        positive_words = ['利好', '上涨', '增长', '突破', '创新', '机会', '看好', '推荐', '优秀']
        negative_words = ['利空', '下跌', '下降', '风险', '危机', '问题', '困难', '挑战', '谨慎']

        content_lower = content.lower()
        positive_count = sum(1 for word in positive_words if word in content_lower)
        negative_count = sum(1 for word in negative_words if word in content_lower)

        total = positive_count + negative_count
        if total == 0:
            return 0.0

        return (positive_count - negative_count) / total

    def _simple_topics(self, content: str) -> List[str]:
        """简化版主题提取"""
        # 常见主题关键词
        topic_keywords = [
            'AI', '芯片', '半导体', '新能源', '光伏', '电动车',
            '医药', '金融', '互联网', '5G', '物联网', '区块链',
            '供应链', '产能', '技术', '创新', '政策', '监管'
        ]

        topics = []
        for keyword in topic_keywords:
            if keyword in content:
                topics.append(keyword)

        return topics[:5] if topics else ['其他']

    async def analyze_news_batch(
        self,
        news_list: List[Dict[str, str]],
        batch_size: int = 10
    ) -> List[Dict[str, Any]]:
        """
        批量分析新闻

        Args:
            news_list: 新闻列表，每条包含 title 和 content
            batch_size: 批次大小

        Returns:
            分析结果列表，每条包含：
            - summary: AI生成的摘要（30-50字）
            - sentiment: 情感分数 (-1 到 1)
            - sentimentLabel: 情感标签 (bullish/neutral/bearish)
            - sentimentConfidence: 置信度 (0 到 1)
            - category: 分类（22个类别之一）
            - categoryConfidence: 分类置信度
            - impact: 影响力等级 (1-5)
            - keywords: 关键词列表
            - entities: 实体列表
            - domains: 关联领域
        """
        results = []

        # 分批处理
        for i in range(0, len(news_list), batch_size):
            batch = news_list[i:i + batch_size]
            batch_results = await self._analyze_batch(batch)
            results.extend(batch_results)

        return results

    async def _analyze_batch(self, batch: List[Dict[str, str]]) -> List[Dict[str, Any]]:
        """处理单个批次 - 使用单个API调用获取所有分析结果"""
        results = []

        for item in batch:
            try:
                title = item.get("title", "")
                content = item.get("content", "")
                combined_text = f"{title}\n\n{content}"

                # 使用单个API调用获取所有分析结果
                analysis = await self._analyze_single_comprehensive(title, content)

                results.append(analysis)

            except Exception as e:
                logger.error(f"批量分析单条失败: {e}")
                results.append(self._get_default_analysis())

        return results

    async def _analyze_single_comprehensive(self, title: str, content: str) -> Dict[str, Any]:
        """使用单个API调用进行综合分析"""
        if not self.client:
            return await self._fallback_analysis(title, content)

        try:
            combined_text = f"{title}\n\n{content[:1500]}"

            prompt = f"""请对以下新闻进行全面分析，以JSON格式返回结果：

{{
  "summary": "新闻摘要（30-50字）",
  "category": "分类代码（ai/chip/earnings/policy等22个类别之一）",
  "domains": ["领域代码1", "领域代码2"],
  "sentiment": 情感分数（-1到1的浮点数，若irrelevant则为null）,
  "impact": 影响力等级（1-5的整数）,
  "keywords": ["关键词1", "关键词2", "关键词3"]
}}

分类代码说明（保持与历史数据兼容）：
科技类: ai, chip, internet, product, breakthrough
财经类: earnings, merger, capital, macro
政策类: policy, regulation, government
社会类: event, consume
国际类: geopolitics, global_market, trade
产业类: supply, capacity, competition, new_energy, medical

领域代码说明（对应ETF指数分类，选择1-3个最相关的）：
科技类: semiconductor(半导体), ai(人工智能), computing(算力设备), robotics(机器人), communication(通信设备), software(软件互联网)
新能源: new_energy_vehicle(新能源车), battery(电池储能), photovoltaic(光伏), wind_power(风电)
医药类: innovative_drug(创新药), medical_device(医疗器械)
制造类: equipment(高端装备), military(国防军工)
消费类: food_beverage(食品饮料), consumer_electronics(消费电子)
其他: finance(金融), real_estate(房地产), agriculture(农业), environment(环保)
特殊: irrelevant(与股市投资无关)

重要规则：
1. 如果新闻与股市投资完全无关（纯娱乐、体育、社会民生等），domains返回["irrelevant"]，sentiment返回null，impact返回1
2. 对于irrelevant新闻，不要标注利好/利空/中性，影响力必须为1
3. domains应按相关度从高到低排序，最多3个
4. 多个领域相关的新闻应打上所有相关标签（如："芯片制造设备"应标注["semiconductor", "equipment"]）
5. 新能源相关新闻应根据具体内容选择：new_energy_vehicle(新能源车)、battery(电池储能)、photovoltaic(光伏)、wind_power(风电)，不要使用new_energy

新闻内容：
{combined_text}

请严格按照JSON格式返回，不要添加其他说明文字。"""

            response = self.client.messages.create(
                model=self.model,
                max_tokens=400,
                messages=[{"role": "user", "content": prompt}]
            )

            result_text = response.content[0].text.strip()

            # 移除可能的代码块标记
            if result_text.startswith("```json"):
                result_text = result_text[7:]  # 移除 ```json
            if result_text.startswith("```"):
                result_text = result_text[3:]  # 移除 ```
            if result_text.endswith("```"):
                result_text = result_text[:-3]  # 移除结尾 ```
            result_text = result_text.strip()

            # 解析JSON响应
            try:
                analysis = json.loads(result_text)

                # 验证和规范化数据
                summary = analysis.get("summary", title[:50])
                category = analysis.get("category", "global_market")
                domains = analysis.get("domains", [])

                # 验证domains格式
                if not isinstance(domains, list):
                    domains = []

                # 修正常见的领域代码错误
                domain_mapping = {
                    "new_energy": "battery",  # 新能源 → 电池储能（宁德时代等）
                    "医药": "innovative_drug",
                    "医疗": "medical_device",
                }
                domains = [domain_mapping.get(d, d) for d in domains]
                domains = domains[:3]  # 最多保留3个

                # 检查是否为无影响新闻
                is_irrelevant = "irrelevant" in domains

                # 情感处理
                sentiment_raw = analysis.get("sentiment")
                if is_irrelevant or sentiment_raw is None:
                    sentiment = None
                    sentiment_label = None
                else:
                    sentiment = float(sentiment_raw)
                    sentiment = max(-1.0, min(1.0, sentiment))
                    # 生成情感标签
                    if sentiment > 0.2:
                        sentiment_label = "bullish"
                    elif sentiment < -0.2:
                        sentiment_label = "bearish"
                    else:
                        sentiment_label = "neutral"

                impact = int(analysis.get("impact", 3))

                # irrelevant新闻强制impact=1
                if is_irrelevant:
                    impact = 1
                else:
                    impact = max(1, min(5, impact))

                keywords = analysis.get("keywords", [])

                return {
                    "summary": summary,
                    "sentiment": sentiment,
                    "sentimentLabel": sentiment_label,
                    "sentimentConfidence": 0.85 if sentiment is not None else None,
                    "category": category,
                    "categoryConfidence": 0.85,
                    "impact": impact,
                    "keywords": keywords[:10],
                    "entities": [],  # 可以后续优化
                    "domains": domains
                }

            except json.JSONDecodeError as e:
                logger.error(f"JSON解析失败: {e}, 返回文本: {result_text[:200]}")
                return await self._fallback_analysis(title, content)

        except Exception as e:
            logger.error(f"综合分析失败: {e}")
            return await self._fallback_analysis(title, content)

    async def _fallback_analysis(self, title: str, content: str) -> Dict[str, Any]:
        """降级分析方案"""
        combined_text = f"{title}\n\n{content}"

        # 简单摘要
        summary = content[:50] if content else title[:50]

        # 简单分类
        category = self._simple_categorize(combined_text)

        # 简单领域判断
        domains = self._simple_domains(combined_text)

        # 检查是否为无影响新闻
        is_irrelevant = "irrelevant" in domains

        # 简单情感（无影响新闻不标注情感）
        if is_irrelevant:
            sentiment = None
            sentiment_label = None
            sentiment_confidence = None
        else:
            sentiment = self._simple_sentiment(combined_text)
            sentiment_label = self._get_sentiment_label(sentiment)
            sentiment_confidence = 0.5

        # 简单影响力
        impact = self._simple_impact(combined_text, sentiment or 0.0, category)

        # 简单关键词
        keywords = self._simple_keywords(combined_text)

        return {
            "summary": summary,
            "sentiment": sentiment,
            "sentimentLabel": sentiment_label,
            "sentimentConfidence": sentiment_confidence,
            "category": category,
            "categoryConfidence": 0.6,
            "impact": impact,
            "keywords": keywords,
            "entities": [],
            "domains": domains
        }

    def _get_sentiment_label(self, sentiment: float) -> str:
        """根据情感分数获取标签"""
        if sentiment > 0.2:
            return "bullish"
        elif sentiment < -0.2:
            return "bearish"
        else:
            return "neutral"

    async def categorize_news(self, content: str) -> tuple:
        """
        新闻分类

        Returns:
            (category, confidence)
        """
        if not self.client:
            return self._simple_categorize(content), 0.6

        try:
            prompt = f"""分析以下新闻内容，从以下22个类别中选择最合适的一个：

科技类:
- ai: 人工智能、大模型相关
- chip: 芯片、半导体相关
- internet: 互联网、电商、社交
- product: 产品发布、新品推出
- breakthrough: 技术突破、研发创新

财经类:
- earnings: 财报、业绩、营收、利润
- merger: 合作、并购、收购、战略
- capital: 上市、IPO、融资、股市
- macro: GDP、CPI、央行、货币政策

政策类:
- policy: 产业政策、补贴、规划
- regulation: 监管、制裁、管制、限制
- government: 政府动态、部委、国务院

社会类:
- event: 社会事件、突发事件
- consume: 消费、生活、零售

国际类:
- geopolitics: 地缘政治、国际关系
- global_market: 全球市场、海外市场
- trade: 国际贸易、进出口

产业类:
- supply: 供应链、出货、订单
- capacity: 产能扩张、建厂、投产
- competition: 竞争格局、市场份额
- new_energy: 新能源、光伏、电动车
- medical: 医药、医疗、创新药

只返回类别代码，不要其他内容。

内容：
{content[:800]}"""

            response = self.client.messages.create(
                model=self.model,
                max_tokens=30,
                messages=[{"role": "user", "content": prompt}]
            )

            result = response.content[0].text.strip().lower()
            valid_categories = [
                "ai", "chip", "internet", "product", "breakthrough",
                "earnings", "merger", "capital", "macro",
                "policy", "regulation", "government",
                "event", "consume",
                "geopolitics", "global_market", "trade",
                "supply", "capacity", "competition", "new_energy", "medical"
            ]

            for cat in valid_categories:
                if cat in result:
                    return cat, 0.85

            return "global_market", 0.5

        except Exception as e:
            logger.error(f"AI分类失败: {e}")
            return self._simple_categorize(content), 0.6

    async def assess_impact(self, content: str, sentiment: float, category: str) -> int:
        """
        评估新闻影响力

        Args:
            content: 新闻内容
            sentiment: 情感分数
            category: 新闻分类

        Returns:
            影响力等级 (1-5)
        """
        if not self.client:
            return self._simple_impact(content, sentiment, category)

        try:
            prompt = f"""评估以下新闻对投资市场的影响力，返回1-5的整数：
1 = 影响很小（常规新闻）
2 = 影响较小（行业动态）
3 = 中等影响（重要企业新闻）
4 = 较大影响（行业重大事件）
5 = 重大影响（市场级事件）

只返回数字，不要其他内容。

新闻分类: {category}
情感倾向: {sentiment}

内容：
{content[:600]}"""

            response = self.client.messages.create(
                model=self.model,
                max_tokens=10,
                messages=[{"role": "user", "content": prompt}]
            )

            result = response.content[0].text.strip()
            # 提取数字
            import re
            numbers = re.findall(r'\d+', result)
            if numbers:
                impact = int(numbers[0])
                return max(1, min(5, impact))  # 限制在1-5之间

            return 3  # 默认中等影响

        except Exception as e:
            logger.error(f"影响力评估失败: {e}")
            return self._simple_impact(content, sentiment, category)

    def _simple_impact(self, content: str, sentiment: float, category: str) -> int:
        """简化版影响力评估"""
        impact = 3  # 默认中等

        # 根据分类调整
        high_impact_categories = ["policy", "regulation", "macro", "geopolitics", "breakthrough"]
        if category in high_impact_categories:
            impact += 1

        # 根据情感强度调整
        if abs(sentiment) > 0.7:
            impact += 1

        # 根据关键词调整
        high_impact_keywords = [
            "重大", "突破", "首次", "历史", "创纪录", "禁止", "制裁",
            "暴跌", "暴涨", "崩盘", "危机", "IPO", "并购", "破产"
        ]
        if any(kw in content for kw in high_impact_keywords):
            impact += 1

        return max(1, min(5, impact))

    async def extract_keywords(self, content: str, max_keywords: int = 10) -> List[str]:
        """提取关键词"""
        if not self.client:
            return self._simple_keywords(content)

        try:
            prompt = f"""从以下内容中提取5-10个最重要的关键词，用JSON数组格式返回。
例如：["AI芯片", "英伟达", "算力需求", "供应链"]

内容：
{content[:1000]}"""

            response = self.client.messages.create(
                model=self.model,
                max_tokens=100,
                messages=[{"role": "user", "content": prompt}]
            )

            result = response.content[0].text.strip()
            try:
                keywords = json.loads(result)
                if isinstance(keywords, list):
                    return keywords[:max_keywords]
            except:
                pass

            return self._simple_keywords(content)

        except Exception as e:
            logger.error(f"关键词提取失败: {e}")
            return self._simple_keywords(content)

    async def extract_entities(self, content: str) -> List[Dict[str, str]]:
        """
        实体识别

        Returns:
            [{"type": "company", "name": "英伟达"}, ...]
        """
        if not self.client:
            return self._simple_entities(content)

        try:
            prompt = f"""从以下内容中识别实体（公司、产品、技术、人物），用JSON数组格式返回。
每个实体包含type（company/product/tech/person）和name。
例如：[{{"type": "company", "name": "英伟达"}}, {{"type": "product", "name": "H100"}}]

内容：
{content[:1000]}"""

            response = self.client.messages.create(
                model=self.model,
                max_tokens=150,
                messages=[{"role": "user", "content": prompt}]
            )

            result = response.content[0].text.strip()
            try:
                entities = json.loads(result)
                if isinstance(entities, list):
                    return entities[:15]
            except:
                pass

            return self._simple_entities(content)

        except Exception as e:
            logger.error(f"实体识别失败: {e}")
            return self._simple_entities(content)

    def _simple_categorize(self, content: str) -> str:
        """简化版分类（降级方案）"""
        content_lower = content.lower()

        # 科技类
        if any(kw in content_lower for kw in ["人工智能", "大模型", "深度学习", "机器学习"]):
            return "ai"
        elif any(kw in content_lower for kw in ["芯片", "半导体", "晶圆", "GPU", "CPU"]):
            return "chip"
        elif any(kw in content_lower for kw in ["互联网", "电商", "社交", "游戏", "云计算"]):
            return "internet"
        elif any(kw in content_lower for kw in ["发布", "新品", "产品", "推出"]):
            return "product"
        elif any(kw in content_lower for kw in ["技术", "突破", "研发", "创新"]):
            return "breakthrough"

        # 财经类
        elif any(kw in content_lower for kw in ["财报", "业绩", "营收", "利润", "净利润"]):
            return "earnings"
        elif any(kw in content_lower for kw in ["合作", "并购", "收购", "战略", "投资"]):
            return "merger"
        elif any(kw in content_lower for kw in ["上市", "ipo", "融资", "股市", "股价"]):
            return "capital"
        elif any(kw in content_lower for kw in ["gdp", "cpi", "央行", "货币", "经济"]):
            return "macro"

        # 政策类
        elif any(kw in content_lower for kw in ["政策", "补贴", "规划", "意见"]):
            return "policy"
        elif any(kw in content_lower for kw in ["制裁", "管制", "限制", "出口管制", "监管"]):
            return "regulation"
        elif any(kw in content_lower for kw in ["政府", "国务院", "部委", "发改委"]):
            return "government"

        # 社会类
        elif any(kw in content_lower for kw in ["事故", "灾害", "突发"]):
            return "event"
        elif any(kw in content_lower for kw in ["消费", "零售", "购物", "生活"]):
            return "consume"

        # 国际类
        elif any(kw in content_lower for kw in ["地缘", "冲突", "战争", "外交"]):
            return "geopolitics"
        elif any(kw in content_lower for kw in ["海外", "美股", "欧洲", "日本"]):
            return "global_market"
        elif any(kw in content_lower for kw in ["贸易", "进出口", "关税"]):
            return "trade"

        # 产业类
        elif any(kw in content_lower for kw in ["供应", "出货", "订单"]):
            return "supply"
        elif any(kw in content_lower for kw in ["扩产", "建厂", "投产", "产能"]):
            return "capacity"
        elif any(kw in content_lower for kw in ["市场份额", "竞争", "格局"]):
            return "competition"
        elif any(kw in content_lower for kw in ["新能源", "光伏", "风电", "电动车", "锂电"]):
            return "new_energy"
        elif any(kw in content_lower for kw in ["医药", "医疗", "创新药", "疫苗"]):
            return "medical"

        # 默认
        else:
            return "global_market"

    def _simple_keywords(self, content: str) -> List[str]:
        """简化版关键词提取"""
        # 常见投资关键词
        keywords = ["AI", "芯片", "半导体", "GPU", "算力", "新能源", "电动车",
                   "光伏", "锂电", "医药", "创新药", "互联网", "云计算"]

        found = []
        for kw in keywords:
            if kw in content:
                found.append(kw)

        return found[:10]

    def _simple_entities(self, content: str) -> List[Dict[str, str]]:
        """简化版实体识别"""
        # 常见公司名
        companies = ["英伟达", "AMD", "英特尔", "台积电", "三星", "华为", "苹果",
                    "微软", "谷歌", "特斯拉", "比亚迪", "宁德时代"]

        entities = []
        for company in companies:
            if company in content:
                entities.append({"type": "company", "name": company})

        return entities[:10]

    def _simple_domains(self, content: str) -> List[str]:
        """简化版领域判断（基于关键词匹配）"""
        content_lower = content.lower()
        domains = []

        # 领域关键词映射（对应ETF指数分类）
        domain_keywords = {
            'semiconductor': ['半导体', '芯片', '晶圆', '封测', 'ic', '集成电路', 'gpu', 'cpu', '光刻'],
            'ai': ['人工智能', 'ai', '大模型', '算力', '深度学习', '机器学习', 'gpt'],
            'computing': ['服务器', '数据中心', '云计算', '边缘计算', 'idc', '光模块'],
            'robotics': ['机器人', '工业机器人', '服务机器人', '人形机器人', '自动化'],
            'communication': ['5g', '6g', '通信', '基站', '光通信', '光纤', '物联网'],
            'software': ['软件', 'saas', '云服务', '互联网', '电商', '社交', '游戏'],
            'new_energy_vehicle': ['新能源车', '电动车', '新能源汽车', '智能驾驶', '自动驾驶', '充电桩'],
            'battery': ['锂电池', '动力电池', '储能', '钠电池', '固态电池', '电解液'],
            'photovoltaic': ['光伏', '太阳能', '硅料', '硅片', '电池片', '组件', '逆变器'],
            'wind_power': ['风电', '风力发电', '风机', '海上风电'],
            'innovative_drug': ['创新药', '生物制药', 'cxo', '抗体药', '基因治疗', '细胞治疗'],
            'medical_device': ['医疗器械', '医疗设备', '高值耗材', 'ivd', '体外诊断'],
            'equipment': ['高端装备', '工业母机', '机床', '精密仪器', '工程机械'],
            'military': ['军工', '国防', '航空', '航天', '导弹', '卫星', '无人机'],
            'food_beverage': ['白酒', '啤酒', '饮料', '乳制品', '调味品', '食品'],
            'consumer_electronics': ['消费电子', '手机', '可穿戴设备', '家电', 'ar', 'vr'],
            'finance': ['银行', '券商', '保险', '金融', '证券', '基金'],
            'real_estate': ['房地产', '地产', '物业', '建材', 'reits'],
            'agriculture': ['农业', '种植', '养殖', '种业', '化肥', '农药'],
            'environment': ['环保', '水务', '污水处理', '固废', '垃圾处理'],
            'irrelevant': ['娱乐明星', '演唱会', '电影', '电视剧', '综艺', '足球', '篮球', '体育赛事', '网红', '八卦']
        }

        # 匹配领域
        for domain, keywords in domain_keywords.items():
            for keyword in keywords:
                if keyword in content_lower:
                    if domain not in domains:
                        domains.append(domain)
                    break

        # 如果没有匹配到任何领域，返回空列表（不默认为irrelevant）
        return domains[:3]  # 最多返回3个

    def _get_default_analysis(self) -> Dict[str, Any]:
        """获取默认分析结果"""
        return {
            "summary": "",
            "sentiment": None,
            "sentimentLabel": None,
            "sentimentConfidence": None,
            "category": "global_market",
            "categoryConfidence": 0.3,
            "impact": 3,
            "keywords": [],
            "entities": [],
            "domains": []
        }


# 全局实例
content_analyzer = ContentAnalyzer()
