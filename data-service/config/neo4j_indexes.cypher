// Neo4j索引和约束定义
// 在Neo4j启动后执行此脚本创建必要的索引

// Industry节点索引
CREATE INDEX industry_code_idx IF NOT EXISTS FOR (i:Industry) ON (i.code);
CREATE INDEX industry_id_idx IF NOT EXISTS FOR (i:Industry) ON (i.id);
CREATE CONSTRAINT industry_id_unique IF NOT EXISTS FOR (i:Industry) REQUIRE i.id IS UNIQUE;

// Stage节点索引
CREATE INDEX stage_code_idx IF NOT EXISTS FOR (s:Stage) ON (s.code);
CREATE CONSTRAINT stage_id_unique IF NOT EXISTS FOR (s:Stage) REQUIRE s.id IS UNIQUE;

// Segment节点索引
CREATE INDEX segment_code_idx IF NOT EXISTS FOR (s:Segment) ON (s.code);
CREATE CONSTRAINT segment_id_unique IF NOT EXISTS FOR (s:Segment) REQUIRE s.id IS UNIQUE;

// Company节点索引
CREATE INDEX company_ticker_idx IF NOT EXISTS FOR (c:Company) ON (c.ticker);
CREATE INDEX company_name_idx IF NOT EXISTS FOR (c:Company) ON (c.name);
CREATE CONSTRAINT company_id_unique IF NOT EXISTS FOR (c:Company) REQUIRE c.id IS UNIQUE;
