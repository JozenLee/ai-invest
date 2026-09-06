"""Audit configured sources, or reclassify retained news using the current taxonomy.

Default is read-only source auditing. --reclassify updates only classification fields.
"""
import asyncio
import json
import sys
from pathlib import Path
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
load_dotenv(Path(__file__).resolve().parents[2] / '.env', override=True)
from db import db
from services.fetch_service import FetchService
from workers.ai_analyzer import AIAnalyzer
from models.article import RawArticle

async def main():
    if '--reclassify' in sys.argv:
        analyzer = AIAnalyzer()
        await analyzer.load_industry_segments()
        if not analyzer.industry_segments or not analyzer.claude_client:
            raise RuntimeError('分类服务或词典不可用，未改动数据')
        # 空标签既可能确实无关，也可能来自历史空词典；重新核验而非强制打标签。
        rows = db.execute("SELECT * FROM NewsArticle WHERE aiProcessed=0 OR (aiProcessedAt IS NULL AND (segmentCodes IS NULL OR segmentCodes='[]')) ORDER BY publishTime DESC")
        for start in range(0, len(rows), 30):
            batch = rows[start:start+30]
            result = await analyzer.analyze_batch([RawArticle(id=row['id'],title=row['title'],content=row['content'] or '',source=row['source'],url=row['url'],publishTime=str(row['publishTime'])) for row in batch])
            for article in result:
                if article.aiProcessed:
                    db.update('UPDATE NewsArticle SET segmentCodes=?,sentiment=?,impact=?,aiProcessed=1,aiProcessedAt=?,aiError=NULL WHERE id=?', (json.dumps(article.segmentCodes),article.sentiment,article.impact,article.aiProcessedAt.isoformat(),article.id))
            print(json.dumps({'checked': min(start+30,len(rows)), 'total':len(rows), 'classified':sum(row.aiProcessed for row in result), 'tagged':sum(bool(row.segmentCodes) for row in result)}), flush=True)
        await analyzer.claude_client.close()
        return
    service = FetchService()
    for row in db.execute('SELECT * FROM DataSource WHERE isActive=1 ORDER BY id'):
        if '--refresh-failed' in sys.argv and row['lastFetchStatus'] not in ('failed', 'partial'):
            continue
        config = {**json.loads(row['config']), 'provider': row['provider'], 'limit': 3}
        try:
            if '--refresh-failed' in sys.argv:
                result = await service.execute_fetch_task(row['id'], config)
                print(json.dumps(result, ensure_ascii=False), flush=True)
                continue
            provider = await service._get_provider(row['driverType'], config)
            items = await asyncio.wait_for(service._fetch_data(provider, config), timeout=75)
            print(json.dumps({'id':row['id'],'count':len(items),'status':'available' if items else 'empty'},ensure_ascii=False),flush=True)
        except Exception as error:
            print(json.dumps({'id':row['id'],'status':'failed','error':str(error)[:400]},ensure_ascii=False),flush=True)

if __name__ == '__main__':
    asyncio.run(main())
