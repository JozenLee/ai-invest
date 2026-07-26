import pytest
from providers.bilibili_provider import extract_category_from_official


def test_extract_category_from_title():
    """测试从official.title提取领域"""
    user_info = {
        'name': '测试用户',
        'official': {
            'type': 0,
            'title': '科技数码领域创作者'
        }
    }
    result = extract_category_from_official(user_info)
    assert result == '科技'


def test_extract_category_from_desc():
    """测试从official.desc提取领域"""
    user_info = {
        'name': '测试用户',
        'official': {
            'type': 0,
            'desc': '知名财经博主'
        }
    }
    result = extract_category_from_official(user_info)
    assert result == '财经'


def test_extract_category_no_official():
    """测试无认证信息时返回默认值"""
    user_info = {
        'name': '测试用户'
    }
    result = extract_category_from_official(user_info)
    assert result == '未分类'


def test_extract_category_keywords():
    """测试关键词匹配"""
    test_cases = [
        ('科技数码领域UP主', '科技'),
        ('财经投资博主', '财经'),
        ('半导体行业观察', '半导体'),
        ('AI技术分享', 'AI'),
        ('知名美食博主', '未分类'),  # 美食不在关键词列表中
    ]
    for desc, expected in test_cases:
        user_info = {'official': {'type': 0, 'desc': desc}}
        result = extract_category_from_official(user_info)
        assert result == expected, f"Failed for desc: {desc}, got {result}, expected {expected}"
