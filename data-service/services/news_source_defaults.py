"""Idempotent news catalog restoration; preserve user edits and enable/disable choices."""
import json
from pathlib import Path
from db import db

TUSHARE_CHANNELS = {'sina': '新浪财经', 'wallstreetcn': '华尔街见闻', '10jqka': '同花顺', 'eastmoney': '东方财富', 'yuncaijing': '云财经', 'fenghuang': '凤凰新闻', 'jinrongjie': '金融界', 'cls': '财联社', 'yicai': '第一财经'}
MAJOR_CHANNELS = ['新华网','凤凰财经','同花顺','新浪财经','华尔街见闻','中证网','财新网','第一财经','财联社']

def source_catalog():
    rows = json.loads((Path(__file__).resolve().parents[2] / 'config/news-sources.json').read_text())
    priority = {'tushare': 0, 'newsnow': 1, 'akshare': 2}
    return sorted(rows, key=lambda row: (priority.get(row['provider'], 99), row['id']))

def ensure_news_sources():
    for row in source_catalog():
        enabled = bool(row.get('enabled', True))
        db.execute_many("""INSERT OR IGNORE INTO DataSource
            (id,name,type,driverType,provider,category,config,updateFrequency,isActive,errorMessage,createdAt,updatedAt)
            VALUES (?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)""",
            [(row['id'],row['name'],row['type'],row['driverType'],row['provider'],row['category'],json.dumps(row['config'],ensure_ascii=False),row['updateFrequency'],enabled,row.get('errorMessage'))])
        # Do not create a second scheduler for an existing source.
        if not db.execute('SELECT id FROM SchedulerJob WHERE sourceId=? LIMIT 1', (row['id'],)):
            db.execute_many("""INSERT OR IGNORE INTO SchedulerJob
                (id,sourceId,scheduleType,scheduleConfig,isEnabled,createdAt,updatedAt)
                VALUES (?,?, 'interval',?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)""",
                [('schedule-' + row['id'],row['id'],json.dumps({'intervalMinutes':row['updateFrequency']}),enabled)])
    db.update("UPDATE subscription_datasets SET enabled=0 WHERE datasetKey='market_news'")
