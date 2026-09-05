import asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock
import pytest
from models.article import RawArticle, AnalyzedArticle
from workers.ai_analyzer import AIAnalyzer
from services.fetch_service import FetchService

@pytest.mark.asyncio
async def test_missing_taxonomy_never_marks_articles_as_classified(monkeypatch):
    monkeypatch.setenv('AI_NEWS_BATCH_TIMEOUT_SECONDS', '0.01')
    analyzer = AIAnalyzer.__new__(AIAnalyzer)
    analyzer.claude_client = object()
    analyzer.concurrency = 2
    analyzer.redis_client = None
    analyzer.industry_segments = {}
    analyzer.load_industry_segments = AsyncMock()
    rows = [RawArticle(id=str(i),title='新闻'+str(i),content='内容',source='test',publishTime='2026-09-04') for i in range(2)]
    async def analyze(article, semaphore):
        if article.id == '1': await asyncio.sleep(1)
        return AnalyzedArticle(**article.dict(),aiProcessed=True)
    analyzer._analyze_with_semaphore = analyze
    results = await analyzer.analyze_batch(rows)
    assert len(results) == 2
    assert not results[0].aiProcessed
    assert not results[1].aiProcessed
    assert results[1].aiError
    assert results[1].title == rows[1].title

def test_source_timestamps_are_normalized_to_utc():
    service = FetchService()
    assert service._parse_publish_time('2026-09-04 10:00:00') == datetime(2026,9,4,2,tzinfo=timezone.utc)
    assert service._parse_publish_time('2026-09-04T02:00:00Z') == datetime(2026,9,4,2,tzinfo=timezone.utc)

@pytest.mark.asyncio
async def test_fetch_status_updates_are_awaited_and_partial_classification_is_visible(monkeypatch):
    monkeypatch.setattr('services.fetch_service.db.execute', lambda *args: [])
    service = FetchService()
    for name, result in [('_create_fetch_log','log'),('_get_provider',object()),('_fetch_data',[{'title':'新闻'}]),('_filter_duplicates',[{'title':'新闻'}]),('_process_with_ai',[{'title':'新闻','aiError':'timeout','aiProcessed':False}]),('_store_to_database',1),('_update_fetch_log',None),('_update_source_status',None)]:
        monkeypatch.setattr(service,name,AsyncMock(return_value=result))
    await service.execute_fetch_task('source',{})
    assert service._update_fetch_log.await_args.kwargs['status'] == 'partial'
    assert service._update_source_status.await_args.kwargs['status'] == 'partial'

def test_missing_news_urls_do_not_collide_in_unique_index(monkeypatch,tmp_path):
    from db import Database
    database=Database(str(tmp_path/'news.db'))
    columns='id TEXT PRIMARY KEY,title TEXT,content TEXT,summary TEXT,source TEXT,url TEXT UNIQUE,publishTime TEXT,category TEXT,categoryId TEXT,categoryConfidence REAL,domainId TEXT,domainIds TEXT,segmentCodes TEXT,sourceId TEXT,sentiment REAL,sentimentLabel TEXT,sentimentConfidence REAL,impact INTEGER,keywords TEXT,entities TEXT,sectors TEXT,aiProcessed INTEGER,aiProcessedAt TEXT,expiresAt TEXT,createdAt TEXT'
    database.update('CREATE TABLE NewsArticle ('+columns+')')
    monkeypatch.setattr(database,'get_category_id_by_code',lambda code:None)
    assert database.insert_news_article({'id':'first','title':'一','content':'内容','url':''})
    assert database.insert_news_article({'id':'second','title':'二','content':'内容','url':''})
    assert len(database.execute('SELECT id FROM NewsArticle WHERE url IS NULL'))==2
