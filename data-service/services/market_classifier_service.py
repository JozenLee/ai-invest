# 市场分类服务
# 使用AI对指数和ETF进行智能领域分类

import os
import json
from typing import List, Dict, Optional
from anthropic import Anthropic

# 领域分类定义
DOMAIN_CATEGORIES = {
    "ai_computing": {
        "name": "AI算力",
        "keywords": ["AI", "人工智能", "算力", "算法", "深度学习", "机器学习", "GPU", "智能计算", "智算", "算能"],
        "description": "人工智能计算基础设施，包括算力芯片、AI服务器、云计算等"
    },
    "semiconductor": {
        "name": "半导体芯片",
        "keywords": ["半导体", "芯片", "集成电路", "晶圆", "IC", "存储芯片", "模拟芯片", "芯", "半导"],
        "description": "芯片设计、制造、封装测试等产业链"
    },
    "communication": {
        "name": "通信设备",
        "keywords": ["通信", "5G", "6G", "光通信", "光模块", "基站", "网络设备", "通讯", "光模"],
        "description": "通信网络基础设施和设备"
    },
    "new_energy": {
        "name": "新能源",
        "keywords": ["新能源", "光伏", "风电", "储能", "电池", "锂电", "氢能", "太阳能"],
        "description": "新能源发电、储能及相关设备"
    },
    "new_energy_vehicle": {
        "name": "新能源汽车",
        "keywords": ["新能源汽车", "电动汽车", "智能驾驶", "自动驾驶", "车联网", "动力电池"],
        "description": "新能源汽车整车及零部件"
    },
    "consumption": {
        "name": "消费",
        "keywords": ["消费", "食品", "饮料", "零售", "家电", "服装", "化妆品", "日用品"],
        "description": "消费品制造和零售"
    },
    "healthcare": {
        "name": "医药医疗",
        "keywords": ["医药", "医疗", "生物", "制药", "医疗器械", "CXO", "创新药", "健康"],
        "description": "医药研发、制造和医疗服务"
    },
    "finance": {
        "name": "金融",
        "keywords": ["金融", "银行", "证券", "保险", "信托", "基金"],
        "description": "银行、证券、保险等金融服务"
    },
    "real_estate": {
        "name": "地产建筑",
        "keywords": ["地产", "房地产", "建筑", "建材", "装修", "家居"],
        "description": "房地产开发和建筑建材"
    },
    "electronics": {
        "name": "消费电子",
        "keywords": ["消费电子", "手机", "平板", "可穿戴", "智能硬件", "电子元器件", "电子", "家电", "数码"],
        "description": "消费电子产品及零部件"
    },
    "media": {
        "name": "传媒互联网",
        "keywords": ["传媒", "互联网", "游戏", "视频", "社交", "电商", "广告"],
        "description": "互联网应用和数字媒体"
    },
    "industrial": {
        "name": "工业制造",
        "keywords": ["工业", "制造", "机械", "自动化", "机器人", "数控"],
        "description": "工业设备和智能制造"
    },
    "military": {
        "name": "国防军工",
        "keywords": ["军工", "国防", "航空", "航天", "船舶", "兵器"],
        "description": "国防军工装备"
    },
    "biotechnology": {
        "name": "生物科技",
        "keywords": ["生物科技", "基因", "细胞治疗", "生物制药", "疫苗"],
        "description": "生物技术和基因工程"
    }
}


class MarketClassifierService:
    """市场分类服务 - 使用AI进行智能分类"""

    def __init__(self):
        self.client = None
        api_key = os.getenv('ANTHROPIC_API_KEY')
        base_url = os.getenv('ANTHROPIC_BASE_URL')

        if api_key:
            self.client = Anthropic(
                api_key=api_key,
                base_url=base_url if base_url else None
            )
        else:
            print("[MarketClassifier] ANTHROPIC_API_KEY 未配置，AI分类功能不可用")

    def _build_classification_prompt(self, items: List[Dict], item_type: str) -> str:
        """构建分类提示词"""

        # 领域定义
        domains_desc = "\n".join([
            f"- {key}: {info['name']} - {info['description']}"
            for key, info in DOMAIN_CATEGORIES.items()
        ])

        # 待分类项目
        items_desc = "\n".join([
            f"{i+1}. {item.get('code', item.get('ticker', ''))}: {item['name']}"
            for i, item in enumerate(items)
        ])

        prompt = f"""你是一个专业的金融市场分类专家。请将以下{item_type}按所属领域进行分类。

## 可选领域分类
{domains_desc}

## 待分类的{item_type}
{items_desc}

## 分类要求
1. 每个{item_type}可以属于1-3个领域
2. 根据{item_type}名称判断其核心业务领域
3. 如果名称模糊，优先选择最主要的领域
4. 返回JSON格式，格式如下：

{{
  "classifications": [
    {{
      "code": "指数代码或ETF代码",
      "name": "{item_type}名称",
      "domains": ["领域key1", "领域key2"],
      "confidence": 0.95,
      "reasoning": "分类理由"
    }}
  ]
}}

请直接返回JSON，不要其他解释。"""

        return prompt

    def _classify_by_rules(self, items: List[Dict]) -> List[Dict]:
        """
        基于规则的分类（AI不可用时的降级方案）

        使用关键词匹配进行分类
        """
        results = []

        for item in items:
            name = item.get('name', '')
            matched_domains = []
            confidences = []

            # 遍历所有领域，检查关键词匹配
            for domain_key, domain_info in DOMAIN_CATEGORIES.items():
                keywords = domain_info['keywords']
                match_count = sum(1 for kw in keywords if kw in name)

                if match_count > 0:
                    matched_domains.append(domain_key)
                    # 简单的置信度计算：匹配关键词数量 / 总关键词数量
                    confidence = min(match_count / len(keywords), 1.0)
                    confidences.append(confidence)

            # 如果没有匹配，尝试部分匹配
            if not matched_domains:
                for domain_key, domain_info in DOMAIN_CATEGORIES.items():
                    keywords = domain_info['keywords']
                    for kw in keywords:
                        if len(kw) >= 2 and kw[:2] in name:
                            matched_domains.append(domain_key)
                            confidences.append(0.5)
                            break

            # 限制最多3个领域，按置信度排序
            if matched_domains:
                sorted_pairs = sorted(zip(matched_domains, confidences), key=lambda x: x[1], reverse=True)
                matched_domains = [p[0] for p in sorted_pairs[:3]]
                avg_confidence = sum([p[1] for p in sorted_pairs[:3]]) / len(sorted_pairs[:3])
            else:
                avg_confidence = 0.0

            results.append({
                "code": item.get('code', item.get('ticker', '')),
                "name": name,
                "domains": matched_domains,
                "confidence": round(avg_confidence, 2),
                "reasoning": f"规则匹配（关键词）" if matched_domains else "未匹配到领域"
            })

        return results

    async def classify_items(self, items: List[Dict], item_type: str = "指数") -> List[Dict]:
        """
        使用AI对市场项目进行分类

        Args:
            items: 待分类项目列表，每项包含 code/ticker, name
            item_type: 项目类型，"指数" 或 "ETF"

        Returns:
            分类结果列表
        """
        if not items:
            return []

        # 如果AI不可用，使用规则分类
        if not self.client:
            print("[MarketClassifier] AI未配置，使用规则分类")
            return self._classify_by_rules(items)

        # 分批处理（每批最多50个）
        batch_size = 50
        all_results = []

        for i in range(0, len(items), batch_size):
            batch = items[i:i + batch_size]

            try:
                prompt = self._build_classification_prompt(batch, item_type)

                # 使用环境变量配置的模型，默认为 claude-sonnet-5
                model = os.getenv('CLAUDE_MODEL', 'claude-sonnet-5')

                response = self.client.messages.create(
                    model=model,
                    max_tokens=8000,
                    messages=[{
                        "role": "user",
                        "content": prompt
                    }]
                )

                # 解析响应
                content = response.content[0].text

                # 提取JSON（可能被markdown包裹）
                if "```json" in content:
                    content = content.split("```json")[1].split("```")[0].strip()
                elif "```" in content:
                    content = content.split("```")[1].split("```")[0].strip()

                result = json.loads(content)
                all_results.extend(result.get("classifications", []))

                print(f"[MarketClassifier] 已分类 {len(batch)} 个{item_type}")

            except Exception as e:
                print(f"[MarketClassifier] AI分类失败: {e}，降级使用规则分类")
                # 降级：使用规则分类
                rule_results = self._classify_by_rules(batch)
                all_results.extend(rule_results)

        return all_results

    async def classify_by_domain(
        self,
        items: List[Dict],
        domain_key: str,
        item_type: str = "指数"
    ) -> List[Dict]:
        """
        对所有项目进行分类，然后筛选出指定领域的项目

        Args:
            items: 待分类项目列表
            domain_key: 目标领域key（如：ai_computing, new_energy）
            item_type: 项目类型

        Returns:
            属于指定领域的项目列表（包含分类信息）
        """
        if domain_key not in DOMAIN_CATEGORIES:
            raise ValueError(f"未知的领域: {domain_key}，可选: {list(DOMAIN_CATEGORIES.keys())}")

        # 使用AI分类
        classifications = await self.classify_items(items, item_type)

        # 筛选出属于目标领域的项目
        result = []
        for classification in classifications:
            if domain_key in classification.get("domains", []):
                # 合并原始数据和分类结果
                original_item = next(
                    (item for item in items
                     if item.get('code', item.get('ticker', '')) == classification['code']),
                    None
                )
                if original_item:
                    result.append({
                        **original_item,
                        "classification": {
                            "domains": classification.get("domains", []),
                            "confidence": classification.get("confidence", 0),
                            "reasoning": classification.get("reasoning", "")
                        }
                    })

        return result

    def get_available_domains(self) -> List[Dict]:
        """获取可用的领域分类列表"""
        return [
            {
                "key": key,
                "name": info["name"],
                "description": info["description"]
            }
            for key, info in DOMAIN_CATEGORIES.items()
        ]


# 单例
market_classifier_service = MarketClassifierService()
