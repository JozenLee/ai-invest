CREATE TABLE IF NOT EXISTS publish_schedule (
  id TEXT PRIMARY KEY NOT NULL,
  payload TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS publish_schedule_runs (
  id TEXT PRIMARY KEY NOT NULL,
  slot TEXT NOT NULL,
  industryId TEXT NOT NULL,
  status TEXT NOT NULL,
  config TEXT NOT NULL,
  runId TEXT,
  reportId TEXT,
  error TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  UNIQUE(slot, industryId)
);
