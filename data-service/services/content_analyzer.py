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
        if HAS_ANTHROPIC:
            api_key = os.getenv('ANTHROPIC_API_KEY')
            if api_key:
                self.client = anthropic.Anthropic(api_key=api_key)
                logger.info('Claude API客户端初始化成功')
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
                model="claude-sonnet-4-20250514",
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
                model="claude-sonnet-4-20250514",
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
                model="claude-sonnet-4-20250514",
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
                model="claude-sonnet-4-20250514",
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

    def _simple_investment_ideas(self, content: str) -> Dict[str, str]:
        """简化版投资理念提取"""
        return {
            '观点': content[:100] + '...' if len(content) > 100 else content,
            '逻辑': '未提及',
            '建议': '未提及',
            '风险': '未提及'
        }


# 全局实例
content_analyzer = ContentAnalyzer()
