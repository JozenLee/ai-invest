#!/usr/bin/env python3
"""
修复现有产业图谱中 segment 的 order 字段
将每个阶段中的 segments 按照当前顺序分配递增的 order 值
"""
import asyncio
import sys
from pathlib import Path

# 添加父目录到路径
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.neo4j_service import get_neo4j_service


async def fix_segment_orders():
    """修复所有产业的 segment order"""
    neo4j = get_neo4j_service()

    # 获取所有产业
    industries = await neo4j.list_industries()
    print(f"找到 {len(industries)} 个产业")

    for industry in industries:
        industry_id = industry['id']
        industry_name = industry['name']
        print(f"\n处理产业: {industry_name} ({industry_id})")

        # 获取泳道数据
        swimlane = await neo4j.get_industry_swimlane_data(industry_id)
        if not swimlane or 'lanes' not in swimlane:
            print(f"  ⚠️  无泳道数据，跳过")
            continue

        # 遍历每个阶段
        for stage_code, lane_data in swimlane['lanes'].items():
            stage_name = lane_data['stage']['name']
            segments = lane_data['segments']

            print(f"  阶段: {stage_name} - {len(segments)} 个环节")

            # 为每个 segment 分配递增的 order
            for order, segment in enumerate(segments):
                segment_id = segment['id']
                segment_name = segment['name']
                current_order = segment.get('order', 0)

                # 只更新 order 为 0 或 None 的 segment
                if current_order == 0 or current_order is None:
                    # 使用 Neo4j 服务更新节点属性
                    async with neo4j.session() as session:
                        query = """
                        MATCH (s:Segment {id: $segment_id})
                        SET s.order = $order
                        RETURN s.name as name, s.order as new_order
                        """
                        result = await session.run(
                            query,
                            segment_id=segment_id,
                            order=order
                        )
                        record = await result.single()
                        if record:
                            print(f"    ✓ {segment_name}: order = {order}")
                        else:
                            print(f"    ✗ {segment_name}: 更新失败")
                else:
                    print(f"    - {segment_name}: order = {current_order} (已有值，跳过)")

    print("\n✅ 修复完成")


if __name__ == "__main__":
    asyncio.run(fix_segment_orders())
