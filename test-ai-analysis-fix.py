"""
测试AI分析修复 - 验证摘要和标签是否正确生成
"""

import asyncio
import sys
import os
from pathlib import Path

# 加载.env文件
from dotenv import load_dotenv
env_path = Path(__file__).parent / '.env'
load_dotenv(env_path)

# 添加data-service到路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'data-service'))

from models.article import RawArticle
from workers.ai_analyzer import AIAnalyzer


async def test_ai_analysis():
    """测试AI分析是否正确提取摘要和标签"""

    # 创建测试新闻
    test_article = RawArticle(
        id="test_001",
        title="英伟达发布新一代H200 GPU，AI算力提升3倍",
        content="""
        美国芯片巨头英伟达今日正式发布新一代H200 Tensor Core GPU，
        专为大规模AI训练和推理设计。相比上一代H100，H200的HBM3e内存容量提升至141GB，
        带宽达到4.8TB/s，整体AI推理性能提升近3倍。

        英伟达CEO黄仁勋表示，H200将进一步推动生成式AI的发展，
        预计2024年第二季度开始向云服务商和企业客户出货。
        台积电将负责H200的5纳米工艺代工生产。

        受此消息提振，英伟达股价盘前上涨5.2%，AI产业链相关公司如台积电、
        SK海力士等也纷纷走强。分析师认为，AI算力需求的持续增长将带动整个半导体行业景气度提升。
        """,
        source="财联社",
        url="https://www.cls.cn/detail/test",
        publishTime="2026-07-25 10:30:00"
    )

    print("=" * 80)
    print("测试AI分析功能")
    print("=" * 80)
    print(f"\n原始新闻:")
    print(f"  标题: {test_article.title}")
    print(f"  来源: {test_article.source}")
    print(f"  内容长度: {len(test_article.content)} 字符")

    # 初始化AI分析器
    analyzer = AIAnalyzer(concurrency=1)

    if not analyzer.claude_client:
        print("\n❌ 错误: ANTHROPIC_API_KEY 未配置")
        return

    print("\n正在调用Claude API分析...")

    # 执行分析
    analyzed = await analyzer._analyze_single(test_article)

    print("\n" + "=" * 80)
    print("分析结果:")
    print("=" * 80)

    print(f"\n1. 摘要 (summary):")
    print(f"   {analyzed.summary or '(未生成)'}")

    print(f"\n2. 分类 (categoryId):")
    print(f"   {analyzed.categoryId or '(未识别)'} (置信度: {analyzed.categoryConfidence:.2f})")

    print(f"\n3. 领域 (domainIds):")
    print(f"   {analyzed.domainIds or []}")

    print(f"\n4. 情感分析:")
    print(f"   标签: {analyzed.sentimentLabel or 'N/A'}")
    print(f"   分数: {analyzed.sentiment or 'N/A'}")
    print(f"   置信度: {analyzed.sentimentConfidence:.2f}")

    print(f"\n5. 影响力:")
    print(f"   级别: {analyzed.impact or 'N/A'}/5")

    print(f"\n6. 关键词 (keywords):")
    import json
    keywords = json.loads(analyzed.keywords) if analyzed.keywords else []
    print(f"   {keywords}")

    print(f"\n7. 实体 (entities):")
    entities = json.loads(analyzed.entities) if analyzed.entities else {}
    for key, values in entities.items():
        print(f"   {key}: {values}")

    print(f"\n8. 相关板块 (sectors):")
    sectors = json.loads(analyzed.sectors) if analyzed.sectors else []
    print(f"   {sectors}")

    print(f"\n9. AI处理状态:")
    print(f"   已处理: {analyzed.aiProcessed}")
    print(f"   处理时间: {analyzed.aiProcessedAt}")
    if analyzed.aiError:
        print(f"   错误: {analyzed.aiError}")

    # 验证关键字段
    print("\n" + "=" * 80)
    print("验证结果:")
    print("=" * 80)

    issues = []

    if not analyzed.summary or analyzed.summary == test_article.title:
        issues.append("❌ 摘要未生成或等于标题")
    else:
        print("✅ 摘要已正确生成")

    if not analyzed.categoryId:
        issues.append("❌ 分类未识别")
    else:
        print(f"✅ 分类已识别: {analyzed.categoryId}")

    if not analyzed.domainIds or len(analyzed.domainIds) == 0:
        issues.append("❌ 领域未识别")
    else:
        print(f"✅ 领域已识别: {', '.join(analyzed.domainIds)}")

    if not keywords or len(keywords) == 0:
        issues.append("❌ 关键词未提取")
    else:
        print(f"✅ 关键词已提取: {len(keywords)}个")

    if not sectors or len(sectors) == 0:
        issues.append("❌ 板块未识别")
    else:
        print(f"✅ 板块已识别: {', '.join(sectors)}")

    if issues:
        print("\n发现问题:")
        for issue in issues:
            print(f"  {issue}")
        return False
    else:
        print("\n✅ 所有验证通过！")
        return True


if __name__ == "__main__":
    success = asyncio.run(test_ai_analysis())
    sys.exit(0 if success else 1)
