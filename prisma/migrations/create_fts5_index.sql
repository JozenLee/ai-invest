-- 创建 FTS5 全文搜索虚拟表
-- 为 NewsArticle 表的 title, content, summary 字段建立全文索引

-- 创建 FTS5 虚拟表（使用 content 选项关联到 NewsArticle 表）
CREATE VIRTUAL TABLE IF NOT EXISTS NewsArticleFTS USING fts5(
    title,
    content,
    summary,
    content='NewsArticle',
    content_rowid='rowid',
    tokenize='unicode61 remove_diacritics 2'
);

-- 创建触发器：插入时同步到 FTS 表
CREATE TRIGGER IF NOT EXISTS NewsArticle_ai AFTER INSERT ON NewsArticle BEGIN
    INSERT INTO NewsArticleFTS(rowid, title, content, summary)
    VALUES (new.rowid, new.title, new.content, new.summary);
END;

-- 创建触发器：删除时同步到 FTS 表
CREATE TRIGGER IF NOT EXISTS NewsArticle_ad AFTER DELETE ON NewsArticle BEGIN
    DELETE FROM NewsArticleFTS WHERE rowid = old.rowid;
END;

-- 创建触发器：更新时同步到 FTS 表
CREATE TRIGGER IF NOT EXISTS NewsArticle_au AFTER UPDATE ON NewsArticle BEGIN
    DELETE FROM NewsArticleFTS WHERE rowid = old.rowid;
    INSERT INTO NewsArticleFTS(rowid, title, content, summary)
    VALUES (new.rowid, new.title, new.content, new.summary);
END;

-- 为现有数据建立索引
INSERT INTO NewsArticleFTS(rowid, title, content, summary)
SELECT rowid, title, content, summary FROM NewsArticle;

-- 优化 FTS 索引
INSERT INTO NewsArticleFTS(NewsArticleFTS) VALUES('optimize');
