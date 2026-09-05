import { config } from 'dotenv'
import { createRequire } from 'node:module'
import { randomUUID, createHash } from 'node:crypto'
config({ quiet: true })
const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')

// Exact reviewed targets, not a blanket deletion of user-created sources.
export const removals: Record<string, string | null> = {
  ds_cls: 'tushare-news', ds_eastmoney: 'tushare-news-eastmoney',
  ds_akshare_cailian: 'tushare-news', ds_akshare_caixin: 'tushare-major-6',
  'newsnow-cls-hot': 'tushare-news', 'newsnow-wallstreetcn-hot': 'tushare-news-wallstreetcn',
  ds_bilibili_tech: null, ds_36kr: null, ds_pingwest: null, ds_geekpark: null,
  ds_jiemian: null, ds_caixin: 'tushare-major-6', ds_douyin_finance: null,
  ds_sina_finance: 'tushare-major-3', ds_leiphone: null, ds_weibo_tech: null,
  ds_xueqiu: null, ds_youtube_tech: null, ds_zhihu_finance: null,
  'newsnow-36kr': null, 'newsnow-jinse': null,
  'tushare-news-yuncaijing': null, 'tushare-news-fenghuang': null,
  'tushare-news-jinrongjie': null, 'tushare-news-sina': 'tushare-major-3',
}

const db = new Database((process.env.DATABASE_URL || 'file:./prisma/dev.db').replace(/^file:/, ''))
db.pragma('foreign_keys = ON')
db.pragma('busy_timeout = 30000')
try {
  const targets = Object.entries(removals).flatMap(([id, replacement]) => {
    const source = db.prepare('SELECT * FROM DataSource WHERE id=?').get(id)
    if (!source) return []
    if (replacement && !db.prepare('SELECT id FROM DataSource WHERE id=?').get(replacement)) throw new Error('替代源不存在: ' + replacement)
    return [{ id, replacement, source, logs: db.prepare('SELECT * FROM DataSourceLog WHERE sourceId=?').all(id), schedules: db.prepare('SELECT * FROM SchedulerJob WHERE sourceId=?').all(id) }]
  })
  console.log(JSON.stringify(targets.map(({id, replacement,source,logs,schedules}) => ({id,name:source.name,replacement,logs:logs.length,schedules:schedules.length}))))
  if (process.argv.includes('--apply')) {
    db.transaction(() => {
      for (const target of targets) {
        const payload = JSON.stringify({ ...target, archivedAt: new Date().toISOString(), reason: '按Tushare→NewsNow→AKShare清理无效和重复源' })
        db.prepare('INSERT INTO raw_payloads (id,datasetKey,targetCode,provider,payload,contentHash,fetchedAt) VALUES (?,?,?,?,?,?,?)').run(randomUUID(),'deleted_news_source',target.id,target.source.provider,payload,createHash('sha256').update(payload).digest('hex'),new Date().toISOString())
        db.prepare('UPDATE NewsArticle SET sourceId=? WHERE sourceId=?').run(target.replacement,target.id)
        db.prepare('DELETE FROM DataSourceLog WHERE sourceId=?').run(target.id)
        db.prepare('DELETE FROM SchedulerJob WHERE sourceId=?').run(target.id)
        db.prepare('DELETE FROM DataSource WHERE id=?').run(target.id)
      }
      const legacyLinks: Record<string,string> = { ds_newsnow_cailian: 'tushare-news', ds_newsnow_thepaper: 'newsnow-thepaper', ds_newsnow_wallstreet: 'tushare-news-wallstreetcn' }
      for (const [oldId, newId] of Object.entries(legacyLinks)) {
        const articles = db.prepare('SELECT id,sourceId FROM NewsArticle WHERE sourceId=?').all(oldId)
        if (!articles.length) continue
        const payload = JSON.stringify({ articles, newSourceId: newId, reason: '修复原先已不存在的媒体源引用，保留原始source名称' })
        db.prepare('INSERT INTO raw_payloads (id,datasetKey,targetCode,provider,payload,contentHash,fetchedAt) VALUES (?,?,?,?,?,?,?)').run(randomUUID(),'news_source_relink',oldId,'local',payload,createHash('sha256').update(payload).digest('hex'),new Date().toISOString())
        db.prepare('UPDATE NewsArticle SET sourceId=? WHERE sourceId=?').run(newId,oldId)
      }
    })()
    console.log(JSON.stringify({ removed:targets.length, remaining:db.prepare('SELECT count(*) AS count FROM DataSource').get().count, archived:true }))
  }
} finally { db.close() }
