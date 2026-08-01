"""Neo4j database service for knowledge graph storage"""
import logging
from typing import Optional
from neo4j import GraphDatabase, Driver

logger = logging.getLogger(__name__)


class Neo4jService:
    """Neo4j graph database operations"""

    def __init__(self, uri: str, user: str, password: str):
        """
        Initialize Neo4j connection

        Args:
            uri: Neo4j connection URI (e.g. bolt://localhost:7687)
            user: Database username
            password: Database password
        """
        self.uri = uri
        self.driver: Optional[Driver] = None
        try:
            self.driver = GraphDatabase.driver(uri, auth=(user, password))
            logger.info(f"Neo4j driver created for {uri}")
        except Exception as e:
            logger.error(f"Failed to create Neo4j driver: {e}")
            raise

    def verify_connection(self) -> bool:
        """
        Verify database connection is working

        Returns:
            True if connection successful, False otherwise
        """
        if not self.driver:
            return False

        try:
            self.driver.verify_connectivity()
            logger.info("Neo4j connection verified")
            return True
        except Exception as e:
            logger.error(f"Neo4j connection failed: {e}")
            return False

    def close(self):
        """Close database connection"""
        if self.driver:
            self.driver.close()
            logger.info("Neo4j connection closed")
