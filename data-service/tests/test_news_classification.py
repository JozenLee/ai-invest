import json
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from db import Database
from models.article import RawArticle
from services import news_classification as module

@pytest.mark.asyncio
async def test_true_batch_and_persistent_content_cache(monkeypatch,tmp_path):
    database=Database(str(tmp_path/'cache.db'))
    database.update('CREATE TABLE raw_payloads (id TEXT PRIMARY KEY,datasetKey TEXT,targetCode TEXT,provider TEXT,payload TEXT,contentHash TEXT,fetchedAt TEXT)')
    monkeypatch.setattr(module,'db',database)
    async def respond(**kwargs):
        data=json.loads(kwargs['messages'][0]['content'])
        return SimpleNamespace(content=[SimpleNamespace(text=json.dumps([{'id':r['id'],'segment_codes':['chip'],'sentiment':0.4,'impact':3} for r in data]))])
    create=AsyncMock(side_effect=respond)
    analyzer=SimpleNamespace(model='test',segments_prompt='chip:芯片',industry_segments={'chip':{}},claude_client=SimpleNamespace(messages=SimpleNamespace(create=create)))
    rows=[RawArticle(id=str(i),title='芯片'+str(i),content='有实质内容的芯片产业报道'+str(i),source='source',publishTime='2026-09-04') for i in range(12)]
    first=await module.classify_batch(analyzer,rows)
    assert len(first)==12 and all(row.aiProcessed for row in first)
    assert create.await_count==2
    assert first.stats['apiRequests']==2
    second=await module.classify_batch(analyzer,rows)
    assert second.stats['cacheHits']==12 and second.stats['apiRequests']==0
    assert create.await_count==2
    analyzer.model='changed-model'
    third=await module.classify_batch(analyzer,rows[:1])
    assert third.stats['cacheHits']==0

@pytest.mark.asyncio
async def test_failed_batch_retains_news_without_fake_classification(monkeypatch,tmp_path):
    database=Database(str(tmp_path/'cache.db'))
    database.update('CREATE TABLE raw_payloads (id TEXT PRIMARY KEY,payload TEXT,fetchedAt TEXT)')
    monkeypatch.setattr(module,'db',database)
    analyzer=SimpleNamespace(model='test',segments_prompt='chip',industry_segments={'chip':{}},claude_client=SimpleNamespace(messages=SimpleNamespace(create=AsyncMock(side_effect=RuntimeError('failure')))))
    rows=[RawArticle(id='1',title='标题',content='原文',source='test',publishTime='2026-09-04')]
    result=await module.classify_batch(analyzer,rows)
    assert result[0].content=='原文' and not result[0].aiProcessed and result[0].sentiment is None
