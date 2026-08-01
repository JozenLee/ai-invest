"""Data collection service for knowledge graph construction"""
import logging
import httpx
import feedparser
from typing import List, Optional
from datetime import datetime
from services.kg.domain_manager import DomainManager

logger = logging.getLogger(__name__)


class KGCollectorService:
    """Collects data from various sources for knowledge graph construction"""

    def __init__(self, domain_manager: DomainManager):
        """
        Initialize collector service

        Args:
            domain_manager: Domain configuration manager
        """
        self.domain_manager = domain_manager
        self.session = httpx.AsyncClient(timeout=30.0)

    async def collect_domain_data(self, domain_code: str) -> List[dict]:
        """
        Collect data for a specific domain from all enabled sources

        Args:
            domain_code: Domain code (e.g. 'ai-hardware')

        Returns:
            List of collected data items with structure:
            {
                "type": "structured_data" | "news_article",
                "source": "openbb" | "rss",
                "entity_type": "hardware_company" (for structured_data),
                "data": {...} (for structured_data),
                "url": "..." (for news_article),
                "title": "..." (for news_article),
                "published_at": datetime (for news_article),
            }
        """
        domain = self.domain_manager.get_domain(domain_code)
        if not domain:
            logger.error(f"Domain not found: {domain_code}")
            return []

        all_data = []

        for source_config in domain.data_sources:
            if not source_config.enabled:
                logger.info(f"Skipping disabled source: {source_config.name}")
                continue

            try:
                logger.info(f"Collecting from source: {source_config.name}")

                if source_config.type == "api":
                    if source_config.name == "openbb":
                        data = await self._collect_api_data_openbb(source_config)
                    else:
                        logger.warning(f"Unknown API source: {source_config.name}")
                        data = []

                elif source_config.type == "rss":
                    data = await self._collect_rss_data(source_config)

                else:
                    logger.warning(f"Unsupported source type: {source_config.type}")
                    data = []

                all_data.extend(data)
                logger.info(f"Collected {len(data)} items from {source_config.name}")

            except Exception as e:
                logger.error(f"Error collecting from {source_config.name}: {e}")
                continue

        return all_data

    async def _collect_api_data_openbb(self, source_config) -> List[dict]:
        """
        Collect data from OpenBB API

        Args:
            source_config: DataSourceConfig for OpenBB

        Returns:
            List of structured data items
        """
        # Import here to avoid circular dependency
        from services.data_service import DataService

        data_service = DataService()
        results = []

        companies = source_config.config.get("companies", [])

        for company in companies:
            ticker = company["ticker"]
            name = company["name"]

            try:
                # Get stock data using available method (get_stock_spot)
                stock_data_df = await data_service.get_stock_spot([ticker])

                if not stock_data_df.empty:
                    # Extract first row as dict
                    stock_data = stock_data_df.iloc[0].to_dict()

                    results.append({
                        "type": "structured_data",
                        "source": "openbb",
                        "entity_type": "hardware_company",
                        "data": {
                            "name": name,
                            "ticker": ticker,
                            "market_cap": stock_data.get("market_cap") or stock_data.get("总市值"),
                            "price": stock_data.get("price") or stock_data.get("最新价") or stock_data.get("现价"),
                            "country": "USA"
                        },
                        "timestamp": datetime.now()
                    })

            except Exception as e:
                logger.error(f"Error fetching OpenBB data for {ticker}: {e}")
                continue

        return results

    async def _collect_rss_data(self, source_config) -> List[dict]:
        """
        Collect news articles from RSS feeds

        Args:
            source_config: DataSourceConfig for RSS

        Returns:
            List of news article items
        """
        results = []
        feeds = source_config.config.get("feeds", [])

        for feed_url in feeds:
            try:
                # Fetch RSS feed
                response = await self.session.get(feed_url)
                response.raise_for_status()

                # Parse feed
                feed = feedparser.parse(response.text)

                for entry in feed.entries:
                    # Extract publication date
                    pub_date = None
                    if hasattr(entry, 'published_parsed') and entry.published_parsed:
                        from time import mktime
                        pub_date = datetime.fromtimestamp(mktime(entry.published_parsed))
                    elif hasattr(entry, 'updated_parsed') and entry.updated_parsed:
                        from time import mktime
                        pub_date = datetime.fromtimestamp(mktime(entry.updated_parsed))
                    else:
                        pub_date = datetime.now()

                    results.append({
                        "type": "news_article",
                        "source": "rss",
                        "url": entry.link,
                        "title": entry.title,
                        "published_at": pub_date,
                        "summary": getattr(entry, 'summary', ''),
                        "feed_url": feed_url
                    })

                logger.info(f"Collected {len(feed.entries)} articles from {feed_url}")

            except Exception as e:
                logger.error(f"Error collecting RSS from {feed_url}: {e}")
                continue

        return results

    async def close(self):
        """Close HTTP session"""
        await self.session.aclose()
