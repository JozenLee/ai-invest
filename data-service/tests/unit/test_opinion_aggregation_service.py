"""
Unit tests for Opinion Aggregation Service
"""
import pytest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from services.opinion_aggregation_service import OpinionAggregationService


@pytest.fixture
def mock_prisma():
    """Mock Prisma client"""
    prisma = MagicMock()
    prisma.influencerpost = MagicMock()
    prisma.influencer = MagicMock()
    return prisma


@pytest.fixture
def service(mock_prisma):
    """Create service instance with mocked Prisma"""
    return OpinionAggregationService(mock_prisma)


@pytest.fixture
def sample_posts():
    """Sample influencer posts for testing"""
    now = datetime.now()
    return [
        {
            "id": "post1",
            "influencerId": "inf1",
            "content": "AI算力需求持续增长，看好GPU市场",
            "publishTime": now - timedelta(days=1),
            "opinionSummary": "AI算力需求增长",
            "opinionStance": "bullish",
            "opinionConfidence": 0.85,
            "credibilityScore": 0.8,
            "primaryDomain": "AI_CHIP",
            "sentiment": 0.7,
            "engagement": '{"likes": 500, "comments": 50, "shares": 20}',
            "influencer": {
                "id": "inf1",
                "name": "科技分析师A",
                "platform": "weibo"
            }
        },
        {
            "id": "post2",
            "influencerId": "inf2",
            "content": "GPU价格上涨，算力成本压力大",
            "publishTime": now - timedelta(days=2),
            "opinionSummary": "算力成本压力",
            "opinionStance": "bearish",
            "opinionConfidence": 0.7,
            "credibilityScore": 0.75,
            "primaryDomain": "AI_CHIP",
            "sentiment": -0.4,
            "engagement": '{"likes": 200, "comments": 30, "shares": 10}',
            "influencer": {
                "id": "inf2",
                "name": "投资顾问B",
                "platform": "xueqiu"
            }
        },
        {
            "id": "post3",
            "influencerId": "inf1",
            "content": "新能源车销量数据符合预期",
            "publishTime": now - timedelta(days=3),
            "opinionSummary": "销量符合预期",
            "opinionStance": "neutral",
            "opinionConfidence": 0.6,
            "credibilityScore": 0.8,
            "primaryDomain": "AI_CHIP",
            "sentiment": 0.0,
            "engagement": '{"likes": 300, "comments": 20, "shares": 5}',
            "influencer": {
                "id": "inf1",
                "name": "科技分析师A",
                "platform": "weibo"
            }
        },
        {
            "id": "post4",
            "influencerId": "inf3",
            "content": "AI芯片需求强劲，GPU供不应求",
            "publishTime": now - timedelta(days=1),
            "opinionSummary": "GPU需求强劲",
            "opinionStance": "bullish",
            "opinionConfidence": 0.9,
            "credibilityScore": 0.85,
            "primaryDomain": "AI_CHIP",
            "sentiment": 0.8,
            "engagement": '{"likes": 800, "comments": 80, "shares": 40}',
            "influencer": {
                "id": "inf3",
                "name": "半导体专家C",
                "platform": "weibo"
            }
        },
        {
            "id": "post5",
            "influencerId": "inf2",
            "content": "算力需求推动AI产业发展",
            "publishTime": now - timedelta(days=4),
            "opinionSummary": "算力需求推动发展",
            "opinionStance": "bullish",
            "opinionConfidence": 0.75,
            "credibilityScore": 0.75,
            "primaryDomain": "AI_CHIP",
            "sentiment": 0.6,
            "engagement": '{"likes": 400, "comments": 40, "shares": 15}',
            "influencer": {
                "id": "inf2",
                "name": "投资顾问B",
                "platform": "xueqiu"
            }
        },
        {
            "id": "post6",
            "influencerId": "inf1",
            "content": "AI算力需求旺盛，GPU市场前景广阔",
            "publishTime": now - timedelta(days=5),
            "opinionSummary": "GPU市场前景好",
            "opinionStance": "bullish",
            "opinionConfidence": 0.8,
            "credibilityScore": 0.8,
            "primaryDomain": "AI_CHIP",
            "sentiment": 0.75,
            "engagement": '{"likes": 600, "comments": 60, "shares": 25}',
            "influencer": {
                "id": "inf1",
                "name": "科技分析师A",
                "platform": "weibo"
            }
        },
        {
            "id": "post7",
            "influencerId": "inf4",
            "content": "算力市场竞争加剧",
            "publishTime": now - timedelta(days=10),
            "opinionSummary": "市场竞争加剧",
            "opinionStance": "neutral",
            "opinionConfidence": 0.65,
            "credibilityScore": 0.7,
            "primaryDomain": "AI_CHIP",
            "sentiment": 0.1,
            "engagement": '{"likes": 150, "comments": 15, "shares": 5}',
            "influencer": {
                "id": "inf4",
                "name": "行业观察员D",
                "platform": "weibo"
            }
        }
    ]


@pytest.mark.asyncio
async def test_aggregate_domain_opinions_statistics(service, mock_prisma, sample_posts):
    """Test 1: Statistics calculation is correct"""
    # Filter posts within 7 days
    now = datetime.now()
    posts_7d = [p for p in sample_posts if (now - p["publishTime"]).days < 7]

    mock_prisma.influencerpost.find_many = AsyncMock(return_value=posts_7d)

    result = await service.aggregate_domain_opinions("AI_CHIP", "7d")

    assert result["domain"] == "AI_CHIP"
    assert result["time_window"] == "7d"

    stats = result["statistics"]
    assert stats["total_opinions"] == 6
    assert stats["stance_distribution"]["bullish"] == 4
    assert stats["stance_distribution"]["neutral"] == 1
    assert stats["stance_distribution"]["bearish"] == 1

    # Check averages
    assert 0.7 < stats["avg_confidence"] < 0.8
    assert 0.4 < stats["avg_sentiment"] < 0.5
    assert 0.75 < stats["avg_credibility"] < 0.8


@pytest.mark.asyncio
async def test_aggregate_domain_opinions_time_filter(service, mock_prisma, sample_posts):
    """Test 2: Time window filtering works correctly"""
    now = datetime.now()

    # Test 3d filter
    posts_3d = [p for p in sample_posts if (now - p["publishTime"]).days < 3]
    mock_prisma.influencerpost.find_many = AsyncMock(return_value=posts_3d)

    result = await service.aggregate_domain_opinions("AI_CHIP", "3d")
    assert result["statistics"]["total_opinions"] == len(posts_3d)
    assert result["statistics"]["total_opinions"] >= 3  # At least 3 posts within 3 days

    # Test 30d filter
    mock_prisma.influencerpost.find_many = AsyncMock(return_value=sample_posts)
    result = await service.aggregate_domain_opinions("AI_CHIP", "30d")
    assert result["statistics"]["total_opinions"] == len(sample_posts)
    assert result["statistics"]["total_opinions"] == 7


@pytest.mark.asyncio
async def test_top_opinions_sorting(service, mock_prisma, sample_posts):
    """Test 3: High quality opinions are sorted correctly"""
    now = datetime.now()
    posts_7d = [p for p in sample_posts if (now - p["publishTime"]).days < 7]

    mock_prisma.influencerpost.find_many = AsyncMock(return_value=posts_7d)

    result = await service.aggregate_domain_opinions("AI_CHIP", "7d")

    top_opinions = result["top_opinions"]
    assert len(top_opinions) > 0

    # Check that opinions are sorted by composite score (descending)
    scores = [op["composite_score"] for op in top_opinions]
    assert scores == sorted(scores, reverse=True)

    # Check that top opinion has highest score
    top_opinion = top_opinions[0]
    assert top_opinion["post_id"] == "post4"  # Highest confidence and credibility
    assert top_opinion["composite_score"] > 0.6


@pytest.mark.asyncio
async def test_consensus_identification(service, mock_prisma, sample_posts):
    """Test 4: Consensus identification through keyword frequency"""
    now = datetime.now()
    posts_7d = [p for p in sample_posts if (now - p["publishTime"]).days < 7]

    mock_prisma.influencerpost.find_many = AsyncMock(return_value=posts_7d)

    result = await service.aggregate_domain_opinions("AI_CHIP", "7d")

    consensus_points = result["consensus_points"]
    assert len(consensus_points) > 0

    # Check that consensus points have required fields
    for point in consensus_points:
        assert "theme" in point
        assert "supporting_count" in point
        assert "keywords" in point
        assert "avg_confidence" in point
        assert point["supporting_count"] >= 2  # At least 2 supporting opinions

    # The most common theme should be about AI/GPU/算力
    top_consensus = consensus_points[0]
    assert top_consensus["supporting_count"] >= 3


@pytest.mark.asyncio
async def test_compare_influencers(service, mock_prisma, sample_posts):
    """Test 5: Compare influencers functionality"""
    now = datetime.now()
    posts_7d = [p for p in sample_posts if (now - p["publishTime"]).days < 7]

    # Filter posts for specific influencers
    inf1_posts = [p for p in posts_7d if p["influencerId"] == "inf1"]
    inf2_posts = [p for p in posts_7d if p["influencerId"] == "inf2"]

    def mock_find_many(*args, **kwargs):
        where = kwargs.get("where", {})
        influencer_id = where.get("influencerId", {}).get("in", [])

        if "inf1" in influencer_id and "inf2" in influencer_id:
            return AsyncMock(return_value=[p for p in posts_7d if p["influencerId"] in ["inf1", "inf2"]])()
        return AsyncMock(return_value=[])()

    mock_prisma.influencerpost.find_many = mock_find_many

    # Mock influencer details
    mock_prisma.influencer.find_many = AsyncMock(return_value=[
        {"id": "inf1", "name": "科技分析师A", "platform": "weibo"},
        {"id": "inf2", "name": "投资顾问B", "platform": "xueqiu"}
    ])

    result = await service.compare_influencers(["inf1", "inf2"], "AI_CHIP", 7)

    assert result["domain"] == "AI_CHIP"
    assert result["time_window"] == "7d"
    assert len(result["influencers"]) == 2

    # Check influencer comparison data
    for inf in result["influencers"]:
        assert "influencer_id" in inf
        assert "name" in inf
        assert "opinion_count" in inf
        assert "stance_distribution" in inf
        assert "avg_confidence" in inf
        assert "avg_credibility" in inf
        assert "opinions" in inf


@pytest.mark.asyncio
async def test_empty_results(service, mock_prisma):
    """Test 6: Handle empty results gracefully"""
    mock_prisma.influencerpost.find_many = AsyncMock(return_value=[])

    result = await service.aggregate_domain_opinions("AI_CHIP", "7d")

    assert result["statistics"]["total_opinions"] == 0
    assert result["statistics"]["stance_distribution"]["bullish"] == 0
    assert result["statistics"]["avg_confidence"] == 0
    assert len(result["top_opinions"]) == 0
    assert len(result["consensus_points"]) == 0
    assert len(result["timeline"]) == 0


@pytest.mark.asyncio
async def test_timeline_generation(service, mock_prisma, sample_posts):
    """Test 7: Timeline generation groups by date correctly"""
    now = datetime.now()
    posts_7d = [p for p in sample_posts if (now - p["publishTime"]).days < 7]

    mock_prisma.influencerpost.find_many = AsyncMock(return_value=posts_7d)

    result = await service.aggregate_domain_opinions("AI_CHIP", "7d")

    timeline = result["timeline"]
    assert len(timeline) > 0

    # Check timeline structure
    for entry in timeline:
        assert "date" in entry
        assert "bullish_count" in entry
        assert "neutral_count" in entry
        assert "bearish_count" in entry
        assert "avg_sentiment" in entry

    # Timeline should be sorted by date (descending)
    dates = [entry["date"] for entry in timeline]
    assert dates == sorted(dates, reverse=True)
