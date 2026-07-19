"""
Provider Schema 定义
为每个 Provider 定义完整的 JSON Schema，支持前端动态表单生成
"""
from typing import Dict, Any


PROVIDER_SCHEMAS: Dict[str, Dict[str, Any]] = {
    'akshare': {
        'name': 'akshare',
        'displayName': 'AKShare财经数据',
        'description': '获取A股市场数据、新闻和财经资讯',
        'category': 'market_data',
        'requiresAuth': False,
        'configSchema': {
            'type': 'object',
            'required': ['interval', 'categories'],
            'properties': {
                'interval': {
                    'type': 'integer',
                    'title': '采集间隔（分钟）',
                    'description': '定时采集的时间间隔',
                    'default': 60,
                    'minimum': 10,
                    'maximum': 1440,
                },
                'categories': {
                    'type': 'array',
                    'title': '数据类别',
                    'description': '要采集的数据类型',
                    'items': {
                        'type': 'string',
                        'enum': ['news', 'market', 'financial_report'],
                    },
                    'default': ['news'],
                    'minItems': 1,
                },
                'keywords': {
                    'type': 'array',
                    'title': '关键词过滤',
                    'description': '筛选包含特定关键词的内容（可选）',
                    'items': {
                        'type': 'string',
                    },
                    'default': [],
                },
            },
        },
        'supportedFeatures': ['auto_fetch', 'scheduled', 'batch_import'],
    },

    'bilibili': {
        'name': 'bilibili',
        'displayName': 'B站',
        'description': '获取B站UP主的视频和动态内容',
        'category': 'social_media',
        'requiresAuth': False,
        'configSchema': {
            'type': 'object',
            'required': ['uid'],
            'properties': {
                'uid': {
                    'type': 'integer',
                    'title': 'UP主UID',
                    'description': 'B站用户的唯一标识符',
                    'minimum': 1,
                    'examples': [123456],
                },
                'fetch_types': {
                    'type': 'array',
                    'title': '采集类型',
                    'description': '要采集的内容类型',
                    'items': {
                        'type': 'string',
                        'enum': ['videos', 'dynamics'],
                    },
                    'default': ['videos', 'dynamics'],
                    'minItems': 1,
                },
                'limit': {
                    'type': 'integer',
                    'title': '每次采集数量',
                    'description': '单次采集的内容数量上限',
                    'default': 20,
                    'minimum': 1,
                    'maximum': 50,
                },
                'credential': {
                    'type': 'object',
                    'title': 'B站凭证（可选）',
                    'description': '用于访问需要登录的接口',
                    'properties': {
                        'sessdata': {
                            'type': 'string',
                            'title': 'SESSDATA',
                            'description': 'B站登录凭证',
                        },
                        'bili_jct': {
                            'type': 'string',
                            'title': 'bili_jct',
                            'description': 'B站CSRF令牌',
                        },
                        'buvid3': {
                            'type': 'string',
                            'title': 'buvid3',
                            'description': 'B站设备标识',
                        },
                    },
                },
            },
        },
        'supportedFeatures': ['auto_fetch', 'manual_trigger', 'user_info'],
    },

    'weibo': {
        'name': 'weibo',
        'displayName': '微博',
        'description': '获取微博用户的微博动态（当前为模拟数据）',
        'category': 'social_media',
        'requiresAuth': False,
        'isMock': True,
        'configSchema': {
            'type': 'object',
            'required': ['uid'],
            'properties': {
                'uid': {
                    'type': 'string',
                    'title': '微博UID',
                    'description': '微博用户的唯一标识符',
                    'pattern': '^[0-9]+$',
                    'examples': ['1234567890'],
                },
                'limit': {
                    'type': 'integer',
                    'title': '每次采集数量',
                    'description': '单次采集的微博数量上限',
                    'default': 20,
                    'minimum': 1,
                    'maximum': 50,
                },
                'include_retweets': {
                    'type': 'boolean',
                    'title': '包含转发',
                    'description': '是否包含用户转发的微博',
                    'default': True,
                },
            },
        },
        'supportedFeatures': ['auto_fetch', 'manual_trigger', 'user_info'],
        'notice': '当前版本使用模拟数据，实际API接口开发中',
    },

    'xiaohongshu': {
        'name': 'xiaohongshu',
        'displayName': '小红书',
        'description': '获取小红书用户的笔记内容（当前为模拟数据）',
        'category': 'social_media',
        'requiresAuth': False,
        'isMock': True,
        'configSchema': {
            'type': 'object',
            'required': ['user_id'],
            'properties': {
                'user_id': {
                    'type': 'string',
                    'title': '小红书用户ID',
                    'description': '小红书用户的唯一标识符',
                    'pattern': '^[a-zA-Z0-9]+$',
                    'examples': ['abc123def456'],
                },
                'limit': {
                    'type': 'integer',
                    'title': '每次采集数量',
                    'description': '单次采集的笔记数量上限',
                    'default': 20,
                    'minimum': 1,
                    'maximum': 50,
                },
                'content_types': {
                    'type': 'array',
                    'title': '内容类型',
                    'description': '要采集的内容类型',
                    'items': {
                        'type': 'string',
                        'enum': ['note', 'video'],
                    },
                    'default': ['note', 'video'],
                    'minItems': 1,
                },
            },
        },
        'supportedFeatures': ['auto_fetch', 'manual_trigger', 'user_info'],
        'notice': '当前版本使用模拟数据，实际API接口开发中',
    },

    'rss': {
        'name': 'rss',
        'displayName': 'RSS订阅源',
        'description': '订阅并采集RSS/Atom feed内容',
        'category': 'feed',
        'requiresAuth': False,
        'configSchema': {
            'type': 'object',
            'required': ['feed_url'],
            'properties': {
                'feed_url': {
                    'type': 'string',
                    'title': 'Feed URL',
                    'description': 'RSS/Atom订阅源地址',
                    'format': 'uri',
                    'examples': ['https://example.com/feed.xml'],
                },
                'interval': {
                    'type': 'integer',
                    'title': '检查间隔（分钟）',
                    'description': '检查更新的时间间隔',
                    'default': 30,
                    'minimum': 5,
                    'maximum': 1440,
                },
                'limit': {
                    'type': 'integer',
                    'title': '每次获取数量',
                    'description': '单次获取的文章数量上限',
                    'default': 20,
                    'minimum': 1,
                    'maximum': 100,
                },
            },
        },
        'supportedFeatures': ['auto_fetch', 'scheduled'],
        'notice': 'RSS Provider 即将上线',
    },
}


def get_provider_schema(provider_name: str) -> Dict[str, Any]:
    """
    获取指定 Provider 的 Schema

    Args:
        provider_name: Provider 名称

    Returns:
        Provider Schema 字典

    Raises:
        ValueError: 如果 Provider 不存在
    """
    if provider_name not in PROVIDER_SCHEMAS:
        available = list(PROVIDER_SCHEMAS.keys())
        raise ValueError(f"Unknown provider: {provider_name}. Available: {available}")

    return PROVIDER_SCHEMAS[provider_name]


def list_provider_schemas() -> list[Dict[str, Any]]:
    """
    列出所有 Provider 的 Schema

    Returns:
        Provider Schema 列表
    """
    return list(PROVIDER_SCHEMAS.values())


def validate_provider_config(provider_name: str, config: Dict[str, Any]) -> tuple[bool, list[str]]:
    """
    验证 Provider 配置是否符合 Schema

    Args:
        provider_name: Provider 名称
        config: 配置字典

    Returns:
        (是否有效, 错误信息列表)
    """
    try:
        schema = get_provider_schema(provider_name)
    except ValueError as e:
        return False, [str(e)]

    errors = []
    config_schema = schema['configSchema']
    required_fields = config_schema.get('required', [])
    properties = config_schema.get('properties', {})

    # 检查必填字段
    for field in required_fields:
        if field not in config:
            errors.append(f"Missing required field: {field}")

    # 检查字段类型和约束
    for field, value in config.items():
        if field not in properties:
            continue

        prop = properties[field]
        expected_type = prop.get('type')

        # 类型检查
        if expected_type == 'integer' and not isinstance(value, int):
            errors.append(f"Field '{field}' must be an integer")
        elif expected_type == 'string' and not isinstance(value, str):
            errors.append(f"Field '{field}' must be a string")
        elif expected_type == 'boolean' and not isinstance(value, bool):
            errors.append(f"Field '{field}' must be a boolean")
        elif expected_type == 'array' and not isinstance(value, list):
            errors.append(f"Field '{field}' must be an array")
        elif expected_type == 'object' and not isinstance(value, dict):
            errors.append(f"Field '{field}' must be an object")

        # 数值范围检查
        if expected_type == 'integer':
            if 'minimum' in prop and value < prop['minimum']:
                errors.append(f"Field '{field}' must be >= {prop['minimum']}")
            if 'maximum' in prop and value > prop['maximum']:
                errors.append(f"Field '{field}' must be <= {prop['maximum']}")

        # 数组长度检查
        if expected_type == 'array':
            if 'minItems' in prop and len(value) < prop['minItems']:
                errors.append(f"Field '{field}' must have at least {prop['minItems']} items")
            if 'maxItems' in prop and len(value) > prop['maxItems']:
                errors.append(f"Field '{field}' must have at most {prop['maxItems']} items")

    return len(errors) == 0, errors


def get_provider_categories() -> Dict[str, list[str]]:
    """
    获取 Provider 按类别分组

    Returns:
        {类别: [Provider名称列表]}
    """
    categories: Dict[str, list[str]] = {}

    for name, schema in PROVIDER_SCHEMAS.items():
        category = schema.get('category', 'other')
        if category not in categories:
            categories[category] = []
        categories[category].append(name)

    return categories


# 测试代码
if __name__ == '__main__':
    print("=== Available Providers ===")
    for schema in list_provider_schemas():
        print(f"\n{schema['displayName']} ({schema['name']})")
        print(f"  Category: {schema['category']}")
        print(f"  Description: {schema['description']}")
        print(f"  Requires Auth: {schema['requiresAuth']}")
        print(f"  Features: {', '.join(schema['supportedFeatures'])}")
        if schema.get('isMock'):
            print(f"  ⚠️  {schema.get('notice', 'Using mock data')}")

    print("\n=== Provider Categories ===")
    categories = get_provider_categories()
    for category, providers in categories.items():
        print(f"{category}: {', '.join(providers)}")

    print("\n=== Config Validation Test ===")
    # 测试有效配置
    valid_config = {
        'uid': 123456,
        'fetch_types': ['videos'],
        'limit': 20,
    }
    is_valid, errors = validate_provider_config('bilibili', valid_config)
    print(f"Bilibili config valid: {is_valid}")

    # 测试无效配置
    invalid_config = {
        'fetch_types': ['videos'],
    }
    is_valid, errors = validate_provider_config('bilibili', invalid_config)
    print(f"Bilibili config invalid: {not is_valid}, errors: {errors}")
