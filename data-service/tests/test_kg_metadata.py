"""
Test KG metadata tables (KGDomain and KGNewsLink)
"""
import pytest
import aiosqlite
from datetime import datetime
import os

# Database path - same as used by db.py
DB_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "prisma", "dev.db")


@pytest.mark.asyncio
async def test_create_kg_domain():
    """Test creating a KG domain record"""
    async with aiosqlite.connect(DB_PATH) as conn:
        conn.row_factory = aiosqlite.Row

        # Insert test domain
        now = datetime.now().isoformat()
        await conn.execute("""
            INSERT INTO kg_domains (code, name, version, enabled, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?)
        """, ("test-domain", "Test Domain", "1.0", 1, now, now))
        await conn.commit()

        # Verify insertion
        cursor = await conn.execute("""
            SELECT code, name, version, enabled FROM kg_domains WHERE code = ?
        """, ("test-domain",))
        row = await cursor.fetchone()

        assert row is not None
        assert row["code"] == "test-domain"
        assert row["name"] == "Test Domain"
        assert row["version"] == "1.0"
        assert row["enabled"] == 1

        # Cleanup
        await conn.execute("DELETE FROM kg_domains WHERE code = ?", ("test-domain",))
        await conn.commit()


@pytest.mark.asyncio
async def test_create_kg_domain_with_description():
    """Test creating a KG domain with optional description"""
    async with aiosqlite.connect(DB_PATH) as conn:
        conn.row_factory = aiosqlite.Row

        # Insert test domain with description
        now = datetime.now().isoformat()
        await conn.execute("""
            INSERT INTO kg_domains (code, name, description, version, enabled, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, ("test-domain-2", "Test Domain 2", "Test description", "1.0", 1, now, now))
        await conn.commit()

        # Verify insertion
        cursor = await conn.execute("""
            SELECT description FROM kg_domains WHERE code = ?
        """, ("test-domain-2",))
        row = await cursor.fetchone()

        assert row is not None
        assert row["description"] == "Test description"

        # Cleanup
        await conn.execute("DELETE FROM kg_domains WHERE code = ?", ("test-domain-2",))
        await conn.commit()


@pytest.mark.asyncio
async def test_kg_domain_unique_code():
    """Test that domain code is unique"""
    async with aiosqlite.connect(DB_PATH) as conn:
        conn.row_factory = aiosqlite.Row

        try:
            # Insert first domain
            now = datetime.now().isoformat()
            await conn.execute("""
                INSERT INTO kg_domains (code, name, version, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?)
            """, ("unique-test", "Domain 1", "1.0", now, now))
            await conn.commit()

            # Try to insert duplicate - should fail
            with pytest.raises(aiosqlite.IntegrityError):
                await conn.execute("""
                    INSERT INTO kg_domains (code, name, version, createdAt, updatedAt)
                    VALUES (?, ?, ?, ?, ?)
                """, ("unique-test", "Domain 2", "1.0", now, now))
                await conn.commit()
        finally:
            # Cleanup
            await conn.execute("DELETE FROM kg_domains WHERE code = ?", ("unique-test",))
            await conn.commit()


@pytest.mark.asyncio
async def test_create_kg_news_link():
    """Test creating a news link with domain relation"""
    async with aiosqlite.connect(DB_PATH) as conn:
        conn.row_factory = aiosqlite.Row

        try:
            # Create domain first
            now = datetime.now().isoformat()
            await conn.execute("""
                INSERT INTO kg_domains (code, name, version, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?)
            """, ("test-domain-news", "Test Domain", "1.0", now, now))
            await conn.commit()

            # Create news link
            await conn.execute("""
                INSERT INTO kg_news_links
                (domainCode, url, title, publishedAt, source, createdAt)
                VALUES (?, ?, ?, ?, ?, ?)
            """, ("test-domain-news", "https://example.com/news", "Test News", now, "test-rss", now))
            await conn.commit()

            # Verify insertion
            cursor = await conn.execute("""
                SELECT domainCode, url, title, extracted, entityCount, relationCount
                FROM kg_news_links WHERE url = ?
            """, ("https://example.com/news",))
            row = await cursor.fetchone()

            assert row is not None
            assert row["domainCode"] == "test-domain-news"
            assert row["url"] == "https://example.com/news"
            assert row["title"] == "Test News"
            assert row["extracted"] == 0  # False
            assert row["entityCount"] == 0
            assert row["relationCount"] == 0
        finally:
            # Cleanup (news link deleted automatically due to CASCADE)
            await conn.execute("DELETE FROM kg_domains WHERE code = ?", ("test-domain-news",))
            await conn.commit()


@pytest.mark.asyncio
async def test_kg_news_link_unique_constraint():
    """Test that (domainCode, url) is unique"""
    async with aiosqlite.connect(DB_PATH) as conn:
        conn.row_factory = aiosqlite.Row

        try:
            # Create domain
            now = datetime.now().isoformat()
            await conn.execute("""
                INSERT INTO kg_domains (code, name, version, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?)
            """, ("test-domain-dup", "Test Domain", "1.0", now, now))
            await conn.commit()

            # Insert first news link
            await conn.execute("""
                INSERT INTO kg_news_links
                (domainCode, url, title, publishedAt, source, createdAt)
                VALUES (?, ?, ?, ?, ?, ?)
            """, ("test-domain-dup", "https://example.com/dup", "News 1", now, "test", now))
            await conn.commit()

            # Try to insert duplicate - should fail
            with pytest.raises(aiosqlite.IntegrityError):
                await conn.execute("""
                    INSERT INTO kg_news_links
                    (domainCode, url, title, publishedAt, source, createdAt)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, ("test-domain-dup", "https://example.com/dup", "News 2", now, "test", now))
                await conn.commit()
        finally:
            # Cleanup
            await conn.execute("DELETE FROM kg_domains WHERE code = ?", ("test-domain-dup",))
            await conn.commit()


@pytest.mark.asyncio
async def test_kg_news_link_cascade_delete():
    """Test that deleting domain cascades to news links"""
    async with aiosqlite.connect(DB_PATH) as conn:
        conn.row_factory = aiosqlite.Row

        # Enable foreign key constraints (required for SQLite)
        await conn.execute("PRAGMA foreign_keys = ON")

        # Create domain
        now = datetime.now().isoformat()
        await conn.execute("""
            INSERT INTO kg_domains (code, name, version, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?)
        """, ("test-cascade", "Test Domain", "1.0", now, now))
        await conn.commit()

        # Create news link
        await conn.execute("""
            INSERT INTO kg_news_links
            (domainCode, url, title, publishedAt, source, createdAt)
            VALUES (?, ?, ?, ?, ?, ?)
        """, ("test-cascade", "https://example.com/cascade", "Test", now, "test", now))
        await conn.commit()

        # Verify link exists
        cursor = await conn.execute("""
            SELECT COUNT(*) as count FROM kg_news_links WHERE domainCode = ?
        """, ("test-cascade",))
        row = await cursor.fetchone()
        assert row["count"] == 1

        # Delete domain
        await conn.execute("DELETE FROM kg_domains WHERE code = ?", ("test-cascade",))
        await conn.commit()

        # Verify link was cascade deleted
        cursor = await conn.execute("""
            SELECT COUNT(*) as count FROM kg_news_links WHERE domainCode = ?
        """, ("test-cascade",))
        row = await cursor.fetchone()
        assert row["count"] == 0


@pytest.mark.asyncio
async def test_update_kg_news_link_extraction():
    """Test updating news link after extraction"""
    async with aiosqlite.connect(DB_PATH) as conn:
        conn.row_factory = aiosqlite.Row

        try:
            # Create domain
            now = datetime.now().isoformat()
            await conn.execute("""
                INSERT INTO kg_domains (code, name, version, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?)
            """, ("test-extract", "Test Domain", "1.0", now, now))
            await conn.commit()

            # Create news link
            await conn.execute("""
                INSERT INTO kg_news_links
                (domainCode, url, title, publishedAt, source, createdAt)
                VALUES (?, ?, ?, ?, ?, ?)
            """, ("test-extract", "https://example.com/extract", "Test", now, "test", now))
            await conn.commit()

            # Update after extraction
            extracted_at = datetime.now().isoformat()
            await conn.execute("""
                UPDATE kg_news_links
                SET extracted = ?, extractedAt = ?, entityCount = ?, relationCount = ?
                WHERE domainCode = ? AND url = ?
            """, (1, extracted_at, 5, 10, "test-extract", "https://example.com/extract"))
            await conn.commit()

            # Verify update
            cursor = await conn.execute("""
                SELECT extracted, entityCount, relationCount
                FROM kg_news_links WHERE url = ?
            """, ("https://example.com/extract",))
            row = await cursor.fetchone()

            assert row["extracted"] == 1
            assert row["entityCount"] == 5
            assert row["relationCount"] == 10
        finally:
            # Cleanup
            await conn.execute("DELETE FROM kg_domains WHERE code = ?", ("test-extract",))
            await conn.commit()


@pytest.mark.asyncio
async def test_query_unextracted_news_links():
    """Test querying news links that haven't been extracted"""
    async with aiosqlite.connect(DB_PATH) as conn:
        conn.row_factory = aiosqlite.Row

        try:
            # Create domain
            now = datetime.now().isoformat()
            await conn.execute("""
                INSERT INTO kg_domains (code, name, version, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?)
            """, ("test-query", "Test Domain", "1.0", now, now))
            await conn.commit()

            # Create multiple news links
            for i in range(3):
                await conn.execute("""
                    INSERT INTO kg_news_links
                    (domainCode, url, title, publishedAt, source, extracted, createdAt)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, ("test-query", f"https://example.com/news{i}", f"News {i}", now, "test", 0, now))

            # Mark one as extracted
            await conn.execute("""
                UPDATE kg_news_links
                SET extracted = 1
                WHERE url = ?
            """, ("https://example.com/news1",))
            await conn.commit()

            # Query unextracted (should use index on domainCode, extracted)
            cursor = await conn.execute("""
                SELECT COUNT(*) as count
                FROM kg_news_links
                WHERE domainCode = ? AND extracted = 0
            """, ("test-query",))
            row = await cursor.fetchone()

            assert row["count"] == 2
        finally:
            # Cleanup
            await conn.execute("DELETE FROM kg_domains WHERE code = ?", ("test-query",))
            await conn.commit()
