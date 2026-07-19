-- 数据库性能优化
-- 添加索引以提升查询性能

-- NewsArticle 表索引
CREATE INDEX IF NOT EXISTS idx_news_publish_time ON NewsArticle(publishTime DESC);
CREATE INDEX IF NOT EXISTS idx_news_category ON NewsArticle(category);
CREATE INDEX IF NOT EXISTS idx_news_sentiment ON NewsArticle(sentiment);
CREATE INDEX IF NOT EXISTS idx_news_category_id ON NewsArticle(categoryId);
CREATE INDEX IF NOT EXISTS idx_news_domain_id ON NewsArticle(domainId);
CREATE INDEX IF NOT EXISTS idx_news_source_id ON NewsArticle(sourceId);
CREATE INDEX IF NOT EXISTS idx_news_ai_processed ON NewsArticle(aiProcessed);
CREATE INDEX IF NOT EXISTS idx_news_expires_at ON NewsArticle(expiresAt);

-- 复合索引（常用查询组合）
CREATE INDEX IF NOT EXISTS idx_news_category_publish ON NewsArticle(category, publishTime DESC);
CREATE INDEX IF NOT EXISTS idx_news_sentiment_publish ON NewsArticle(sentiment, publishTime DESC);
CREATE INDEX IF NOT EXISTS idx_news_category_sentiment ON NewsArticle(category, sentiment);

-- DataSource 表索引
CREATE INDEX IF NOT EXISTS idx_datasource_active ON DataSource(isActive);
CREATE INDEX IF NOT EXISTS idx_datasource_type ON DataSource(type);
CREATE INDEX IF NOT EXISTS idx_datasource_last_fetch ON DataSource(lastFetchAt DESC);

-- DataSourceLog 表索引
CREATE INDEX IF NOT EXISTS idx_log_source_id ON DataSourceLog(sourceId);
CREATE INDEX IF NOT EXISTS idx_log_status ON DataSourceLog(status);
CREATE INDEX IF NOT EXISTS idx_log_created_at ON DataSourceLog(createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_log_source_created ON DataSourceLog(sourceId, createdAt DESC);

-- Influencer 表索引
CREATE INDEX IF NOT EXISTS idx_influencer_category ON Influencer(category);
CREATE INDEX IF NOT EXISTS idx_influencer_active ON Influencer(isActive);

-- InfluencerPost 表索引
CREATE INDEX IF NOT EXISTS idx_post_influencer_id ON InfluencerPost(influencerId);
CREATE INDEX IF NOT EXISTS idx_post_publish_time ON InfluencerPost(publishTime DESC);
CREATE INDEX IF NOT EXISTS idx_post_influencer_publish ON InfluencerPost(influencerId, publishTime DESC);

-- NewsCategory 表索引
CREATE INDEX IF NOT EXISTS idx_category_active ON NewsCategory(isActive);
CREATE INDEX IF NOT EXISTS idx_category_code ON NewsCategory(code);

-- Domain 表索引
CREATE INDEX IF NOT EXISTS idx_domain_active ON Domain(isActive);

-- 分析 SQLite 以优化查询计划
ANALYZE;

-- 显示索引创建结果
SELECT 'Indexes created successfully' as status;
