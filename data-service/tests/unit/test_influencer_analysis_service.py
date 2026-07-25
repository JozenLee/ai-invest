"""
Unit tests for InfluencerAnalysisService
测试AI分析大V观点的核心服务
"""

import pytest
import json
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch
from anthropic import AsyncAnthropic
from anthropic.types import Message, ContentBlock, TextBlock, Usage


@pytest.fixture
def mock_db():
    """模拟数据库连接"""
    db = AsyncMock()
    db.get_connection = MagicMock()
    return db


@pytest.fixture
def mock_post():
    """模拟大V帖子数据"""
    return {
        'id': 'post_123',
        'influencerId': 'inf_456',
        'content': '英伟达发布新一代B100 GPU，性能提升3倍，AI算力领先，看好AI芯片板块中长期投资价值。供应链消息显示订单已排到明年Q2，国产替代加速。',
        'publishTime': '2026-07-25T10:30:00Z',
        'engagement': json.dumps({'likes': 1200, 'comments': 89, 'shares': 340})
    }


@pytest.fixture
def mock_influencer():
    """模拟大V信息"""
    return {
        'id': 'inf_456',
        'name': '芯片观察员',
        'platform': 'weibo',
        'accountId': '12345678'
    }


@pytest.fixture
def mock_claude_response():
    """模拟Claude API成功响应"""
    response_json = {
        "opinion_summary": "英伟达新一代GPU算力提升显著，看好AI芯片板块中长期投资价值",
        "opinion_stance": "bullish",
        "opinion_confidence": 0.85,
        "main_points": [
            "新GPU算力提升3倍，技术领先优势扩大",
            "AI服务器需求持续旺盛，订单饱满",
            "国产替代加速，供应链机会增多"
        ],
        "arguments": [
            {
                "type": "data",
                "content": "英伟达B100 GPU性能提升3倍",
                "credibility": 0.9
            },
            {
                "type": "source",
                "content": "供应链消息显示订单排期已到明年Q2",
                "credibility": 0.7
            }
        ],
        "credibility_score": 0.8,
        "primary_domain": "AI_CHIP",
        "secondary_domains": ["AI_SERVER", "AI_INFRASTRUCTURE"],
        "domain_scores": {
            "AI_CHIP": 0.9,
            "AI_SERVER": 0.7,
            "AI_INFRASTRUCTURE": 0.5
        },
        "sentiment": 0.75,
        "sentiment_aspects": {
            "technology": 0.9,
            "market": 0.7,
            "companies": 0.8,
            "policy": 0.6
        },
        "risks": [
            "地缘政治风险",
            "估值过高风险"
        ],
        "investment_implications": "积极",
        "time_horizon": "medium"
    }

    # 模拟Claude Message对象
    mock_message = MagicMock(spec=Message)
    mock_message.content = [
        MagicMock(spec=TextBlock, text=json.dumps(response_json, ensure_ascii=False))
    ]
    return mock_message


@pytest.fixture
def mock_claude_response_with_markdown():
    """模拟Claude API返回markdown包裹的JSON"""
    response_json = {
        "opinion_summary": "测试摘要",
        "opinion_stance": "neutral",
        "opinion_confidence": 0.7,
        "main_points": ["论点1", "论点2"],
        "arguments": [],
        "credibility_score": 0.6,
        "primary_domain": "AI_CHIP",
        "secondary_domains": [],
        "domain_scores": {"AI_CHIP": 0.8},
        "sentiment": 0.0,
        "sentiment_aspects": {},
        "risks": [],
        "investment_implications": "中性",
        "time_horizon": "short"
    }

    markdown_wrapped = f"```json\n{json.dumps(response_json, ensure_ascii=False)}\n```"

    mock_message = MagicMock(spec=Message)
    mock_message.content = [
        MagicMock(spec=TextBlock, text=markdown_wrapped)
    ]
    return mock_message


@pytest.mark.asyncio
async def test_analyze_post_success(mock_db, mock_post, mock_influencer, mock_claude_response):
    """测试：成功分析大V帖子并保存到数据库"""
    from services.influencer_analysis_service import InfluencerAnalysisService

    # 配置mock数据库
    mock_conn = AsyncMock()
    mock_cursor = AsyncMock()
    mock_cursor.fetchone.side_effect = [
        mock_post,  # 第一次查询post
        mock_influencer  # 第二次查询influencer
    ]
    mock_conn.execute.return_value = mock_cursor
    mock_conn.__aenter__.return_value = mock_conn
    mock_conn.__aexit__.return_value = None
    mock_db.get_connection.return_value = mock_conn

    # Mock Claude API
    with patch('services.influencer_analysis_service.AsyncAnthropic') as MockAnthropic:
        mock_client = AsyncMock()
        mock_client.messages.create.return_value = mock_claude_response
        MockAnthropic.return_value = mock_client

        # 创建服务实例
        service = InfluencerAnalysisService(db=mock_db, anthropic_api_key='test-key')

        # 执行分析
        result = await service.analyze_post('post_123')

        # 验证结果
        assert result is not None
        assert result['opinion_summary'] == "英伟达新一代GPU算力提升显著，看好AI芯片板块中长期投资价值"
        assert result['opinion_stance'] == "bullish"
        assert result['opinion_confidence'] == 0.85
        assert result['primary_domain'] == "AI_CHIP"
        assert result['credibility_score'] == 0.8
        assert result['sentiment'] == 0.75

        # 验证数据库更新被调用
        execute_calls = [call for call in mock_conn.execute.call_args_list if 'UPDATE InfluencerPost' in str(call)]
        assert len(execute_calls) > 0


@pytest.mark.asyncio
async def test_analyze_post_invalid_json(mock_db, mock_post, mock_influencer):
    """测试：Claude API返回无效JSON的处理"""
    from services.influencer_analysis_service import InfluencerAnalysisService

    # 配置mock数据库
    mock_conn = AsyncMock()
    mock_cursor = AsyncMock()
    mock_cursor.fetchone.side_effect = [mock_post, mock_influencer]
    mock_conn.execute.return_value = mock_cursor
    mock_conn.__aenter__.return_value = mock_conn
    mock_conn.__aexit__.return_value = None
    mock_db.get_connection.return_value = mock_conn

    # Mock Claude API返回无效JSON
    mock_message = MagicMock(spec=Message)
    mock_message.content = [
        MagicMock(spec=TextBlock, text="这不是有效的JSON格式")
    ]

    with patch('services.influencer_analysis_service.AsyncAnthropic') as MockAnthropic:
        mock_client = AsyncMock()
        mock_client.messages.create.return_value = mock_message
        MockAnthropic.return_value = mock_client

        service = InfluencerAnalysisService(db=mock_db, anthropic_api_key='test-key')

        # 执行分析，应该抛出异常或返回None
        result = await service.analyze_post('post_123')

        # 验证错误被记录
        assert result is None or 'error' in result


@pytest.mark.asyncio
async def test_analyze_post_api_error(mock_db, mock_post, mock_influencer):
    """测试：Claude API错误处理"""
    from services.influencer_analysis_service import InfluencerAnalysisService

    # 配置mock数据库
    mock_conn = AsyncMock()
    mock_cursor = AsyncMock()
    mock_cursor.fetchone.side_effect = [mock_post, mock_influencer]
    mock_conn.execute.return_value = mock_cursor
    mock_conn.__aenter__.return_value = mock_conn
    mock_conn.__aexit__.return_value = None
    mock_db.get_connection.return_value = mock_conn

    # Mock Claude API抛出异常
    with patch('services.influencer_analysis_service.AsyncAnthropic') as MockAnthropic:
        mock_client = AsyncMock()
        mock_client.messages.create.side_effect = Exception("API timeout")
        MockAnthropic.return_value = mock_client

        service = InfluencerAnalysisService(db=mock_db, anthropic_api_key='test-key')

        # 执行分析
        result = await service.analyze_post('post_123')

        # 验证错误处理
        assert result is None or 'error' in result

        # 验证aiError字段被更新
        update_calls = [call for call in mock_conn.execute.call_args_list if 'UPDATE InfluencerPost' in str(call)]
        assert len(update_calls) > 0


@pytest.mark.asyncio
async def test_analyze_post_saves_all_fields(mock_db, mock_post, mock_influencer, mock_claude_response):
    """测试：验证所有AI分析字段正确保存到数据库"""
    from services.influencer_analysis_service import InfluencerAnalysisService

    # 配置mock数据库
    mock_conn = AsyncMock()
    mock_cursor = AsyncMock()
    mock_cursor.fetchone.side_effect = [mock_post, mock_influencer]
    mock_conn.execute.return_value = mock_cursor
    mock_conn.__aenter__.return_value = mock_conn
    mock_conn.__aexit__.return_value = None
    mock_db.get_connection.return_value = mock_conn

    # Mock Claude API
    with patch('services.influencer_analysis_service.AsyncAnthropic') as MockAnthropic:
        mock_client = AsyncMock()
        mock_client.messages.create.return_value = mock_claude_response
        MockAnthropic.return_value = mock_client

        service = InfluencerAnalysisService(db=mock_db, anthropic_api_key='test-key')

        # 执行分析
        result = await service.analyze_post('post_123')

        # 获取UPDATE调用的SQL和参数
        update_calls = [call for call in mock_conn.execute.call_args_list if 'UPDATE InfluencerPost' in str(call)]
        assert len(update_calls) > 0

        # 验证关键字段存在
        update_call = update_calls[0]
        sql = update_call[0][0] if update_call[0] else ""

        # 检查所有必需字段在UPDATE语句中
        required_fields = [
            'aiProcessed', 'aiProcessedAt',
            'opinionSummary', 'opinionStance', 'opinionConfidence',
            'mainPoints', 'arguments', 'credibilityScore',
            'primaryDomain', 'secondaryDomains', 'domainScores',
            'sentiment', 'sentimentAspects',
            'risks', 'investmentImplications'
        ]

        for field in required_fields:
            assert field in sql, f"Field {field} should be in UPDATE statement"


@pytest.mark.asyncio
async def test_analyze_post_with_markdown_wrapped_json(mock_db, mock_post, mock_influencer, mock_claude_response_with_markdown):
    """测试：处理markdown包裹的JSON响应"""
    from services.influencer_analysis_service import InfluencerAnalysisService

    # 配置mock数据库
    mock_conn = AsyncMock()
    mock_cursor = AsyncMock()
    mock_cursor.fetchone.side_effect = [mock_post, mock_influencer]
    mock_conn.execute.return_value = mock_cursor
    mock_conn.__aenter__.return_value = mock_conn
    mock_conn.__aexit__.return_value = None
    mock_db.get_connection.return_value = mock_conn

    # Mock Claude API
    with patch('services.influencer_analysis_service.AsyncAnthropic') as MockAnthropic:
        mock_client = AsyncMock()
        mock_client.messages.create.return_value = mock_claude_response_with_markdown
        MockAnthropic.return_value = mock_client

        service = InfluencerAnalysisService(db=mock_db, anthropic_api_key='test-key')

        # 执行分析
        result = await service.analyze_post('post_123')

        # 验证能够正确解析markdown包裹的JSON
        assert result is not None
        assert result['opinion_summary'] == "测试摘要"
        assert result['opinion_stance'] == "neutral"
