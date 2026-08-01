import pytest
import os
from services.kg.neo4j_service import Neo4jService

def test_neo4j_connection():
    """Test Neo4j connection can be established"""
    uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
    user = os.getenv("NEO4J_USER", "neo4j")
    password = os.getenv("NEO4J_PASSWORD", "password")

    service = Neo4jService(uri, user, password)
    assert service.verify_connection() == True
    service.close()
