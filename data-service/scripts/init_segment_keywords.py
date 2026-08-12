#!/usr/bin/env python3
"""
初始化Segment关键词
为每个Segment生成新闻匹配关键词
"""
import asyncio
import sys
import os

# 添加项目根目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.neo4j_service import get_neo4j_service
import anthropic
import json


async def init_segment_keywords():
    """
    从Neo4j加载所有Segment，为每个Segment生成关键词
    """
    neo4j = get_neo4j_service()

    # 初始化Claude客户端
    api_key = os.getenv('ANTHROPIC_API_KEY')
    base_url = os.getenv('ANTHROPIC_BASE_URL')

    if not api_key:
        print("✗ ANTHROPIC_API_KEY未设置")
        return

    if base_url:
        client = anthropic.Anthropic(api_key=api_key, base_url=base_url)
    else:
        client = anthropic.Anthropic(api_key=api_key)

    try:
        print("=" * 60)
        print("开始初始化Segment关键词")
        print("=" * 60)

        # 1. 获取所有Segment
        print("\n[1/3] 从Neo4j获取所有Segment...")
        segments = await neo4j.get_all_industry_segments_for_classification(use_cache=False)
        print(f"✓ 获取了 {len(segments)} 个Segment")

        if not segments:
            print("✗ 没有找到任何Segment，请先创建产业图谱")
            return

        # 2. 为每个Segment生成关键词
        print("\n[2/3] 为每个Segment生成关键词...")

        for i, segment in enumerate(segments):
            segment_code = segment['segment_code']
            segment_name = segment['segment_name']
            segment_desc = segment.get('description', '')
            industry_name = segment['industry_name']
            stage_name = segment['stage_name']

            # 检查是否已有关键词
            existing_keywords = segment.get('keywords', [])
            if existing_keywords and len(existing_keywords) > 0:
                print(f"  [{i+1}/{len(segments)}] {segment_name}: 已有 {len(existing_keywords)} 个关键词，跳过")
                continue

            # 使用Claude生成关键词
            try:
                keywords = await generate_keywords(
                    client,
                    industry_name,
                    stage_name,
                    segment_name,
                    segment_desc
                )

                # 更新Neo4j
                await neo4j.update_segment_classification_metadata(
                    segment_code,
                    news_keywords=keywords
                )

                print(f"  [{i+1}/{len(segments)}] {segment_name}: 生成了 {len(keywords)} 个关键词")
                print(f"      关键词: {', '.join(keywords[:5])}")

            except Exception as e:
                print(f"  [{i+1}/{len(segments)}] {segment_name}: 生成失败 - {e}")

        # 3. 清除缓存
        print("\n[3/3] 清除缓存...")
        from services.cache_service import cache_service
        cache_service.invalidate_all_graph_cache()
        print("✓ 缓存已清除")

        print("\n" + "=" * 60)
        print("初始化完成！")
        print("=" * 60)

    except Exception as e:
        print(f"\n✗ 初始化失败: {e}")
        import traceback
        traceback.print_exc()
    finally:
        await neo4j.close()


async def generate_keywords(
    client: anthropic.Anthropic,
    industry_name: str,
    stage_name: str,
    segment_name: str,
    description: str
) -> list[str]:
    """
    使用Claude生成Segment的新闻匹配关键词

    Args:
        client: Anthropic客户端
        industry_name: 产业名称
        stage_name: 阶段名称
        segment_name: 环节名称
        description: 环节描述

    Returns:
        list[str]: 关键词列表
    """
    prompt = f"""你是一个关键词提取专家。请为以下产业链环节生成新闻匹配关键词。

## 产业信息
- 产业: {industry_name}
- 阶段: {stage_name}
- 环节: {segment_name}
- 描述: {description}

## 任务
生成10-20个关键词，用于在新闻中匹配该环节。关键词应该包括：
1. 环节的核心技术术语
2. 相关的产品名称
3. 行业标准术语
4. 常见的缩写和简称
5. 相关的公司类型

## 输出格式（JSON）
{{
    "keywords": ["关键词1", "关键词2", ...]
}}

请直接返回JSON，不要包含其他文字。"""

    try:
        message = client.messages.create(
            model=os.getenv('ANTHROPIC_MODEL', 'claude-sonnet-4-20250514'),
            max_tokens=1024,
            temperature=0.3,
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ]
        )

        # 提取文本内容
        response_text = message.content[0].text

        # 解析JSON
        result = json.loads(response_text)
        keywords = result.get('keywords', [])

        return keywords

    except Exception as e:
        print(f"    ✗ Claude API调用失败: {e}")
        # 返回基础关键词（从名称和描述中提取）
        return [segment_name]


if __name__ == '__main__':
    asyncio.run(init_segment_keywords())
