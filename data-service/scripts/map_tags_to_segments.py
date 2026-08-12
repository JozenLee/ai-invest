#!/usr/bin/env python3
"""
映射Tags到Segments
在Neo4j中建立Segment与Tag的关联关系
"""
import asyncio
import sys
import os

# 添加项目根目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.neo4j_service import get_neo4j_service
from db import Database
import json


async def map_tags_to_segments():
    """
    建立Segment -> TagRef关联
    基于关键词和名称相似度进行匹配
    """
    neo4j = get_neo4j_service()
    db = Database()

    try:
        print("=" * 60)
        print("开始映射Tags到Segments")
        print("=" * 60)

        # 1. 获取所有Segment
        print("\n[1/4] 从Neo4j获取所有Segment...")
        segments = await neo4j.get_all_industry_segments_for_classification(use_cache=False)
        print(f"✓ 获取了 {len(segments)} 个Segment")

        if not segments:
            print("✗ 没有找到任何Segment，请先创建产业图谱")
            return

        # 2. 从SQLite获取所有Tag（只读）
        print("\n[2/4] 从SQLite获取所有Tag...")
        conn = db.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, code, name, keywords FROM Tag WHERE isActive = 1"
        )
        tags = cursor.fetchall()

        tags_list = [
            {
                'id': tag['id'],
                'code': tag['code'],
                'name': tag['name'],
                'keywords': json.loads(tag['keywords']) if tag['keywords'] else []
            }
            for tag in tags
        ]
        conn.close()
        print(f"✓ 获取了 {len(tags_list)} 个活跃Tag")

        # 3. 为每个Segment匹配Tags
        print("\n[3/4] 为每个Segment匹配Tags...")
        total_mappings = 0

        for i, segment in enumerate(segments):
            segment_code = segment['segment_code']
            segment_name = segment['segment_name']
            segment_desc = segment.get('description', '')
            segment_keywords = segment.get('keywords', [])

            matched_tag_codes = []

            # 基于关键词和名称匹配
            for tag in tags_list:
                if is_tag_relevant_to_segment(tag, segment):
                    matched_tag_codes.append(tag['code'])

            # 4. 在Neo4j中建立关联
            if matched_tag_codes:
                # 建立HAS_TAG关系
                count = await neo4j.link_segment_to_tags(
                    segment_code,
                    matched_tag_codes,
                    relevance=1.0
                )

                # 同时更新Segment的tag_codes属性
                await neo4j.update_segment_classification_metadata(
                    segment_code,
                    tag_codes=matched_tag_codes
                )

                total_mappings += count
                print(f"  [{i+1}/{len(segments)}] {segment_name}: {count} 个Tag")
            else:
                print(f"  [{i+1}/{len(segments)}] {segment_name}: 无匹配Tag")

        print(f"\n✓ 完成映射：{len(segments)} 个Segment，共 {total_mappings} 个关联")

        # 5. 清除缓存
        print("\n[4/4] 清除缓存...")
        from services.cache_service import cache_service
        cache_service.invalidate_all_graph_cache()
        print("✓ 缓存已清除")

        print("\n" + "=" * 60)
        print("映射完成！")
        print("=" * 60)

    except Exception as e:
        print(f"\n✗ 映射失败: {e}")
        import traceback
        traceback.print_exc()
    finally:
        await neo4j.close()


def is_tag_relevant_to_segment(tag: dict, segment: dict) -> bool:
    """
    判断Tag是否与Segment相关

    Args:
        tag: Tag数据 {code, name, keywords}
        segment: Segment数据 {segment_code, segment_name, keywords, description}

    Returns:
        bool: 是否相关
    """
    tag_name = tag['name'].lower()
    tag_keywords = [kw.lower() for kw in tag.get('keywords', [])]

    segment_name = segment['segment_name'].lower()
    segment_text = f"{segment_name} {segment.get('description', '')}".lower()
    segment_keywords = [kw.lower() for kw in segment.get('keywords', [])]

    # 规则1: Tag关键词匹配Segment文本
    for keyword in tag_keywords:
        if keyword and keyword in segment_text:
            return True

    # 规则2: Segment关键词匹配Tag名称或关键词
    for keyword in segment_keywords:
        if keyword:
            if keyword in tag_name:
                return True
            for tag_kw in tag_keywords:
                if keyword in tag_kw or tag_kw in keyword:
                    return True

    # 规则3: 名称直接匹配
    if tag_name and (tag_name in segment_name or segment_name in tag_name):
        return True

    # 规则4: Tag名称在Segment文本中
    if tag_name and len(tag_name) > 2 and tag_name in segment_text:
        return True

    return False


if __name__ == '__main__':
    asyncio.run(map_tags_to_segments())
