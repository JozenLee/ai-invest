import pytest
from unittest.mock import Mock, AsyncMock, patch
from datetime import datetime
from services.kg.collector_service import KGCollectorService
from services.kg.domain_manager import DomainManager


@pytest.fixture
def domain_manager():
    """Create DomainManager fixture"""
    return DomainManager()


@pytest.fixture
def collector_service(domain_manager):
    """Create KGCollectorService fixture"""
    return KGCollectorService(domain_manager)


@pytest.mark.asyncio
async def test_collect_nonexistent_domain(collector_service):
    """Test collecting from non-existent domain returns empty list"""
    result = await collector_service.collect_domain_data("nonexistent-domain")
    assert result == []


@pytest.mark.asyncio
async def test_collect_openbb_data_mock(collector_service):
    """Test OpenBB data collection with mocked DataService"""

    # Mock the DataService.get_stock_spot method
    import pandas as pd
    mock_stock_data = pd.DataFrame([{
        "market_cap": 2000000000000,
        "price": 450.50,
        "ticker": "NVDA"
    }])

    with patch('services.data_service.DataService') as MockDataService:
        mock_instance = MockDataService.return_value
        mock_instance.get_stock_spot = AsyncMock(return_value=mock_stock_data)

        result = await collector_service.collect_domain_data("ai-hardware")

        # Should collect data from OpenBB source (3 companies in config)
        structured_items = [item for item in result if item["type"] == "structured_data"]
        assert len(structured_items) >= 1

        # Check first item structure
        if structured_items:
            item = structured_items[0]
            assert item["source"] == "openbb"
            assert item["entity_type"] == "hardware_company"
            assert "data" in item
            assert "name" in item["data"]
            assert "ticker" in item["data"]


@pytest.mark.asyncio
async def test_collect_rss_data_mock(collector_service):
    """Test RSS data collection with mocked feed"""

    # Create a mock RSS feed response
    mock_rss_content = """<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
        <channel>
            <title>Test Feed</title>
            <item>
                <title>NVIDIA Announces New GPU</title>
                <link>https://example.com/nvidia-gpu</link>
                <pubDate>Mon, 01 Aug 2026 10:00:00 GMT</pubDate>
                <description>NVIDIA launches new AI accelerator</description>
            </item>
        </channel>
    </rss>"""

    # Mock httpx response
    mock_response = Mock()
    mock_response.text = mock_rss_content
    mock_response.raise_for_status = Mock()

    collector_service.session.get = AsyncMock(return_value=mock_response)

    # Add RSS source to ai-hardware domain config for testing
    domain = collector_service.domain_manager.get_domain("ai-hardware")
    if domain:
        # Temporarily add RSS source
        from services.kg.models import DataSourceConfig
        rss_source = DataSourceConfig(
            name="test-rss",
            type="rss",
            enabled=True,
            config={"feeds": ["https://example.com/feed.xml"]}
        )
        domain.data_sources.append(rss_source)

        result = await collector_service.collect_domain_data("ai-hardware")

        # Check for news articles
        news_items = [item for item in result if item["type"] == "news_article"]
        assert len(news_items) >= 1

        if news_items:
            item = news_items[0]
            assert item["source"] == "rss"
            assert item["title"] == "NVIDIA Announces New GPU"
            assert item["url"] == "https://example.com/nvidia-gpu"
            assert isinstance(item["published_at"], datetime)


@pytest.mark.asyncio
async def test_collector_service_close(collector_service):
    """Test closing HTTP session"""
    await collector_service.close()
    # Session should be closed (no exception)
