"""
全局AI分析器服务
提供单例AI分析器实例，避免重复加载产业细分领域
"""

import logging

logger = logging.getLogger(__name__)

# 全局AI分析器实例（由main.py启动时初始化）
_global_ai_analyzer = None


def set_global_analyzer(analyzer):
    """设置全局AI分析器实例"""
    global _global_ai_analyzer
    _global_ai_analyzer = analyzer
    logger.info(f"全局AI分析器已设置: {len(analyzer.industry_segments)} 个产业细分领域")


def get_global_analyzer():
    """获取全局AI分析器实例"""
    return _global_ai_analyzer


def is_analyzer_ready():
    """检查AI分析器是否就绪"""
    return _global_ai_analyzer is not None and len(_global_ai_analyzer.industry_segments) > 0
