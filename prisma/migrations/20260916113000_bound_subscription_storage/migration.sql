UPDATE "subscription_configuration"
SET "payload" = json_set(
  "payload",
  '$.policies.sector_capital_flow.tradingIntervalSeconds', 300,
  '$.policies.etf_realtime.tradingIntervalSeconds', 1800,
  '$.policies.constituent_stock_realtime.tradingIntervalSeconds', 10800
)
WHERE "id" = 'global';

UPDATE "subscription_datasets"
SET "tradingIntervalSeconds" = CASE "datasetKey"
      WHEN 'sector_capital_flow' THEN 300
      WHEN 'etf_realtime' THEN 1800
      WHEN 'constituent_stock_realtime' THEN 10800
      ELSE "tradingIntervalSeconds"
    END,
    "retentionDays" = CASE "datasetKey"
      WHEN 'research_calendar' THEN 30
      WHEN 'index_realtime' THEN 7
      WHEN 'etf_realtime' THEN 2
      WHEN 'constituent_stock_realtime' THEN 2
      WHEN 'index_daily' THEN 14
      WHEN 'etf_daily' THEN 14
      WHEN 'constituent_stock_daily' THEN 14
      WHEN 'etf_holdings' THEN 30
      WHEN 'etf_research' THEN 14
      WHEN 'stock_financial' THEN 14
      WHEN 'stock_announcement' THEN 30
      WHEN 'sector_capital_flow' THEN 120
      WHEN 'market_volume' THEN 180
      WHEN 'market_main_flow' THEN 180
      WHEN 'margin_balance' THEN 180
      WHEN 'northbound_flow' THEN 180
      WHEN 'dragon_tiger' THEN 120
      ELSE "retentionDays"
    END
WHERE "datasetKey" IN (
  'research_calendar','index_realtime','etf_realtime','constituent_stock_realtime',
  'index_daily','etf_daily','constituent_stock_daily','etf_holdings','etf_research',
  'stock_financial','stock_announcement','sector_capital_flow','market_volume',
  'market_main_flow','margin_balance','northbound_flow','dragon_tiger'
);
