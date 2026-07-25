"""
Opinion Aggregation Service
Aggregates and analyzes influencer opinions by domain and time window.
"""
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from collections import defaultdict, Counter
import json
import re


class OpinionAggregationService:
    """Service for aggregating and analyzing influencer opinions"""

    def __init__(self, prisma_client):
        """
        Initialize the service

        Args:
            prisma_client: Prisma database client
        """
        self.prisma = prisma_client

    def _parse_time_window(self, time_window: str) -> int:
        """
        Parse time window string to days

        Args:
            time_window: Time window string (e.g., '3d', '7d', '30d')

        Returns:
            Number of days
        """
        match = re.match(r'(\d+)d', time_window)
        if not match:
            return 7  # Default to 7 days
        return int(match.group(1))

    def _calculate_engagement_factor(self, engagement_str: Optional[str]) -> float:
        """
        Calculate engagement factor from engagement JSON

        Args:
            engagement_str: JSON string with likes, comments, shares

        Returns:
            Engagement factor (0-1)
        """
        if not engagement_str:
            return 0.1  # Minimum factor

        try:
            engagement = json.loads(engagement_str)
            likes = engagement.get("likes", 0)
            comments = engagement.get("comments", 0)
            shares = engagement.get("shares", 0)

            # Formula: min(1.0, (likes + comments*2 + shares*3) / 1000)
            score = (likes + comments * 2 + shares * 3) / 1000
            return min(1.0, score)
        except (json.JSONDecodeError, TypeError):
            return 0.1

    def _calculate_composite_score(
        self,
        confidence: float,
        credibility: float,
        engagement_factor: float
    ) -> float:
        """
        Calculate composite score for opinion quality

        Args:
            confidence: Opinion confidence (0-1)
            credibility: Influencer credibility (0-1)
            engagement_factor: Engagement factor (0-1)

        Returns:
            Composite score (0-1)
        """
        return confidence * credibility * engagement_factor

    def _extract_keywords(self, text: str) -> List[str]:
        """
        Extract keywords from text (simplified Chinese text processing)

        Args:
            text: Text to extract keywords from

        Returns:
            List of keywords
        """
        # Common keywords in AI/tech domain
        keywords = []
        common_terms = [
            "AI", "算力", "GPU", "芯片", "需求", "增长", "市场",
            "价格", "成本", "供应", "需求", "前景", "发展",
            "竞争", "技术", "产业", "应用", "数据中心"
        ]

        for term in common_terms:
            if term in text:
                keywords.append(term)

        return keywords

    def _identify_consensus(self, posts: List[Dict]) -> List[Dict]:
        """
        Identify consensus points from opinions (simplified keyword clustering)

        Args:
            posts: List of influencer posts

        Returns:
            List of consensus points
        """
        # Extract all keywords and their associated posts
        keyword_posts = defaultdict(list)

        for post in posts:
            text = (post.get("opinionSummary", "") + " " + post.get("content", ""))
            keywords = self._extract_keywords(text)

            for keyword in keywords:
                keyword_posts[keyword].append(post)

        # Find keywords mentioned by multiple influencers
        consensus_points = []

        for keyword, related_posts in keyword_posts.items():
            if len(related_posts) >= 2:  # At least 2 mentions
                # Calculate average confidence
                confidences = [
                    p.get("opinionConfidence", 0)
                    for p in related_posts
                    if p.get("opinionConfidence")
                ]
                avg_confidence = sum(confidences) / len(confidences) if confidences else 0

                consensus_points.append({
                    "theme": keyword,
                    "supporting_count": len(related_posts),
                    "keywords": [keyword],
                    "avg_confidence": round(avg_confidence, 2)
                })

        # Sort by supporting count (descending)
        consensus_points.sort(key=lambda x: x["supporting_count"], reverse=True)

        # Group similar keywords into themes (simplified version)
        # Take top 5 consensus points
        return consensus_points[:5]

    def _generate_timeline(self, posts: List[Dict]) -> List[Dict]:
        """
        Generate timeline of opinions grouped by date

        Args:
            posts: List of influencer posts

        Returns:
            List of timeline entries
        """
        # Group posts by date
        daily_posts = defaultdict(list)

        for post in posts:
            publish_time = post.get("publishTime")
            if publish_time:
                date_key = publish_time.strftime("%Y-%m-%d")
                daily_posts[date_key].append(post)

        # Generate timeline entries
        timeline = []

        for date_key, day_posts in daily_posts.items():
            stance_counts = Counter(
                p.get("opinionStance") for p in day_posts if p.get("opinionStance")
            )

            sentiments = [
                p.get("sentiment", 0)
                for p in day_posts
                if p.get("sentiment") is not None
            ]
            avg_sentiment = sum(sentiments) / len(sentiments) if sentiments else 0

            timeline.append({
                "date": date_key,
                "bullish_count": stance_counts.get("bullish", 0),
                "neutral_count": stance_counts.get("neutral", 0),
                "bearish_count": stance_counts.get("bearish", 0),
                "avg_sentiment": round(avg_sentiment, 2)
            })

        # Sort by date (descending)
        timeline.sort(key=lambda x: x["date"], reverse=True)

        return timeline

    async def aggregate_domain_opinions(
        self,
        domain_code: str,
        time_window: str = "7d"
    ) -> Dict:
        """
        Aggregate opinions by domain and time window

        Args:
            domain_code: Domain code (e.g., 'AI_CHIP')
            time_window: Time window string (e.g., '3d', '7d', '30d')

        Returns:
            Aggregated opinion data
        """
        # Parse time window
        days = self._parse_time_window(time_window)
        cutoff_date = datetime.now() - timedelta(days=days)

        # Fetch posts from database
        posts = await self.prisma.influencerpost.find_many(
            where={
                "primaryDomain": domain_code,
                "publishTime": {"gte": cutoff_date},
                "aiProcessed": True
            },
            include={
                "influencer": True
            },
            order_by={"publishTime": "desc"}
        )

        # Handle empty results
        if not posts:
            return {
                "domain": domain_code,
                "time_window": time_window,
                "statistics": {
                    "total_opinions": 0,
                    "stance_distribution": {
                        "bullish": 0,
                        "neutral": 0,
                        "bearish": 0
                    },
                    "avg_confidence": 0,
                    "avg_sentiment": 0,
                    "avg_credibility": 0
                },
                "top_opinions": [],
                "consensus_points": [],
                "timeline": []
            }

        # Calculate statistics
        stance_counts = Counter(p.get("opinionStance") for p in posts if p.get("opinionStance"))

        confidences = [p.get("opinionConfidence", 0) for p in posts if p.get("opinionConfidence")]
        sentiments = [p.get("sentiment", 0) for p in posts if p.get("sentiment") is not None]
        credibilities = [p.get("credibilityScore", 0) for p in posts if p.get("credibilityScore")]

        avg_confidence = sum(confidences) / len(confidences) if confidences else 0
        avg_sentiment = sum(sentiments) / len(sentiments) if sentiments else 0
        avg_credibility = sum(credibilities) / len(credibilities) if credibilities else 0

        statistics = {
            "total_opinions": len(posts),
            "stance_distribution": {
                "bullish": stance_counts.get("bullish", 0),
                "neutral": stance_counts.get("neutral", 0),
                "bearish": stance_counts.get("bearish", 0)
            },
            "avg_confidence": round(avg_confidence, 2),
            "avg_sentiment": round(avg_sentiment, 2),
            "avg_credibility": round(avg_credibility, 2)
        }

        # Calculate composite scores and sort for top opinions
        opinions_with_scores = []

        for post in posts:
            confidence = post.get("opinionConfidence", 0) or 0
            credibility = post.get("credibilityScore", 0) or 0
            engagement_factor = self._calculate_engagement_factor(post.get("engagement"))

            composite_score = self._calculate_composite_score(
                confidence,
                credibility,
                engagement_factor
            )

            influencer = post.get("influencer", {})

            opinions_with_scores.append({
                "post_id": post.get("id"),
                "influencer_name": influencer.get("name", "Unknown") if influencer else "Unknown",
                "opinion_summary": post.get("opinionSummary", ""),
                "stance": post.get("opinionStance", "neutral"),
                "composite_score": round(composite_score, 2),
                "publish_time": post.get("publishTime").isoformat() if post.get("publishTime") else None
            })

        # Sort by composite score (descending) and take top opinions
        opinions_with_scores.sort(key=lambda x: x["composite_score"], reverse=True)
        top_opinions = opinions_with_scores[:10]  # Top 10

        # Identify consensus points
        consensus_points = self._identify_consensus(posts)

        # Generate timeline
        timeline = self._generate_timeline(posts)

        return {
            "domain": domain_code,
            "time_window": time_window,
            "statistics": statistics,
            "top_opinions": top_opinions,
            "consensus_points": consensus_points,
            "timeline": timeline
        }

    async def compare_influencers(
        self,
        influencer_ids: List[str],
        domain_code: str,
        days: int = 7
    ) -> Dict:
        """
        Compare multiple influencers' opinions in a domain

        Args:
            influencer_ids: List of influencer IDs to compare
            domain_code: Domain code
            days: Number of days to look back

        Returns:
            Comparison data
        """
        cutoff_date = datetime.now() - timedelta(days=days)

        # Fetch posts for specified influencers
        posts = await self.prisma.influencerpost.find_many(
            where={
                "influencerId": {"in": influencer_ids},
                "primaryDomain": domain_code,
                "publishTime": {"gte": cutoff_date},
                "aiProcessed": True
            },
            include={
                "influencer": True
            },
            order_by={"publishTime": "desc"}
        )

        # Fetch influencer details
        influencers = await self.prisma.influencer.find_many(
            where={"id": {"in": influencer_ids}}
        )

        influencer_map = {inf["id"]: inf for inf in influencers}

        # Group posts by influencer
        influencer_posts = defaultdict(list)
        for post in posts:
            influencer_posts[post["influencerId"]].append(post)

        # Build comparison data
        comparison = []

        for inf_id in influencer_ids:
            inf_posts = influencer_posts.get(inf_id, [])
            influencer_info = influencer_map.get(inf_id, {})

            if not inf_posts:
                comparison.append({
                    "influencer_id": inf_id,
                    "name": influencer_info.get("name", "Unknown"),
                    "platform": influencer_info.get("platform", "Unknown"),
                    "opinion_count": 0,
                    "stance_distribution": {
                        "bullish": 0,
                        "neutral": 0,
                        "bearish": 0
                    },
                    "avg_confidence": 0,
                    "avg_credibility": 0,
                    "avg_sentiment": 0,
                    "opinions": []
                })
                continue

            # Calculate statistics for this influencer
            stance_counts = Counter(p.get("opinionStance") for p in inf_posts if p.get("opinionStance"))

            confidences = [p.get("opinionConfidence", 0) for p in inf_posts if p.get("opinionConfidence")]
            credibilities = [p.get("credibilityScore", 0) for p in inf_posts if p.get("credibilityScore")]
            sentiments = [p.get("sentiment", 0) for p in inf_posts if p.get("sentiment") is not None]

            avg_confidence = sum(confidences) / len(confidences) if confidences else 0
            avg_credibility = sum(credibilities) / len(credibilities) if credibilities else 0
            avg_sentiment = sum(sentiments) / len(sentiments) if sentiments else 0

            # Format opinions
            opinions = [
                {
                    "post_id": p.get("id"),
                    "summary": p.get("opinionSummary", ""),
                    "stance": p.get("opinionStance", "neutral"),
                    "confidence": p.get("opinionConfidence", 0),
                    "publish_time": p.get("publishTime").isoformat() if p.get("publishTime") else None
                }
                for p in inf_posts[:5]  # Top 5 recent opinions
            ]

            comparison.append({
                "influencer_id": inf_id,
                "name": influencer_info.get("name", "Unknown"),
                "platform": influencer_info.get("platform", "Unknown"),
                "opinion_count": len(inf_posts),
                "stance_distribution": {
                    "bullish": stance_counts.get("bullish", 0),
                    "neutral": stance_counts.get("neutral", 0),
                    "bearish": stance_counts.get("bearish", 0)
                },
                "avg_confidence": round(avg_confidence, 2),
                "avg_credibility": round(avg_credibility, 2),
                "avg_sentiment": round(avg_sentiment, 2),
                "opinions": opinions
            })

        return {
            "domain": domain_code,
            "time_window": f"{days}d",
            "influencers": comparison
        }
