// 创建索引
CREATE INDEX industry_code IF NOT EXISTS FOR (i:Industry) ON (i.code);
CREATE INDEX industry_id IF NOT EXISTS FOR (i:Industry) ON (i.id);
CREATE INDEX stage_code IF NOT EXISTS FOR (s:Stage) ON (s.code);
CREATE INDEX segment_code IF NOT EXISTS FOR (seg:Segment) ON (seg.code);
CREATE INDEX company_ticker IF NOT EXISTS FOR (c:Company) ON (c.ticker);
CREATE INDEX company_name IF NOT EXISTS FOR (c:Company) ON (c.name);

// 创建唯一约束
CREATE CONSTRAINT industry_id_unique IF NOT EXISTS FOR (i:Industry) REQUIRE i.id IS UNIQUE;
CREATE CONSTRAINT company_id_unique IF NOT EXISTS FOR (c:Company) REQUIRE c.id IS UNIQUE;
CREATE CONSTRAINT stage_id_unique IF NOT EXISTS FOR (s:Stage) REQUIRE s.id IS UNIQUE;
CREATE CONSTRAINT segment_id_unique IF NOT EXISTS FOR (seg:Segment) REQUIRE seg.id IS UNIQUE;
