const values:Record<string,string>={
  'risk-off':'风险收缩',blocked:'证据受限',watch:'持续观察',eligible:'满足实验条件',
  available:'可用',limited:'有限',missing:'缺失',partial:'部分可用',success:'成功',failed:'失败',
  up:'上行',down:'下行',stable:'震荡',unknown:'未知',low:'低',medium:'中',high:'高',
  positive:'积极',neutral:'中性',negative:'消极',emerging:'萌芽期',growing:'成长期',mature:'成熟期',declining:'衰退期',
  met:'已满足',unmet:'未满足',lead:'待核实线索',evidence:'有效证据',true:'是',false:'否',
}

export function chineseValue(value:unknown){
  if(typeof value!=='string')return value
  return values[value.trim()]||chineseNarrative(value)
}

const sourceEndpointLabels:Record<string,string>={
  fund_daily:'基金日线',fund_adj:'基金复权因子',fund_nav:'基金净值',fund_portfolio:'基金定期持仓',
  etf_basic:'指数基金基础信息',etf_share_size:'指数基金份额规模',index_daily:'指数日线',index_dailybasic:'指数当期估值',
  index_weight:'指数成分权重',daily_basic:'股票基础估值',trade_cal:'交易日历',moneyflow_ind_dc:'行业资金流向',
  moneyflow_ind_ths:'行业资金流向',moneyflow_mkt_dc:'市场资金流向',margin:'融资融券',rt_k:'实时行情',
}

function chineseSourceTokens(value:string){
  let output=value
    .replace(/Tushare\/index_weight\+daily_basic/gi,'金融数据聚合服务（指数成分权重与基础估值）')
    .replace(/Tushare\/research-bundle/gi,'金融数据聚合服务（研究数据包）')
  for(const [endpoint,label] of Object.entries(sourceEndpointLabels)){
    const escaped=endpoint.replace(/[.*+?^$()|[\]\\{}]/g,'\\$&')
    output=output.replace(new RegExp('Tushare/'+escaped,'gi'),'金融数据聚合服务（'+label+'）')
  }
  return output
  .replace(/Tushare\/([^\s,;，；]+)/gi,'金融数据聚合服务（$1）')
  .replace(/eastmoney[\/_-](?:public[\/_-])direct/gi,'东方财富公开直连数据')
  .replace(/eastmoney[\/_-]direct/gi,'东方财富直连数据')
  .replace(/eastmoney_public_direct/gi,'东方财富公开直连数据')
  .replace(/eastmoney\/orderbook/gi,'东方财富买卖盘')
  .replace(/yfinance_news/gi,'公开市场资讯')
  .replace(/neo4j-versioned-industry-graph/gi,'版本化产业知识图谱')
  .replace(/local-company-daily/gi,'本地企业日线')
  .replace(/stock_announcement/gi,'公司公告')
  .replace(/research_calendar/gi,'研究交易日历')
  .replace(/sector_capital_flow/gi,'领域资金流向')
  .replace(/etf_research/gi,'指数基金研究数据')
  .replace(/orderbook/gi,'买卖盘')
  .replace(/ConnectionError/gi,'网络连接失败')
  .replace(/Promax/gi,'金融数据聚合接口')
  .replace(/web_search/gi,'公开网络检索')
  .replace(/market_main_flow/gi,'市场主力资金流向')
  .replace(/margin_balance/gi,'融资融券余额')
  .replace(/research_profile/gi,'研究范围配置')
  .replace(/news_taxonomy/gi,'资讯产业分类')
  .replace(/industry_graph/gi,'产业知识图谱')
  .replace(/subscription-database/gi,'本地订阅数据库')
  .replace(/tushare_fund_portfolio/gi,'金融数据聚合服务（基金定期持仓）')
  .replace(/\bTushare\b/gi,'金融数据聚合服务')
}

export function chineseNarrative(value:string){return chineseSourceTokens(value)
  .replace(/risk-off/gi,'风险收缩').replace(/ETF/g,'指数基金').replace(/\bAI\b/g,'人工智能')
  .replace(/\bAIGC\b/g,'生成式人工智能').replace(/evidenceId/gi,'证据编号').replace(/ruleBoundary/g,'规则边界')
  .replace(/source-linked-not-independently-verified/gi,'来源关联但未经独立核验').replace(/H1/g,'上半年').replace(/Q2/g,'二季度')
  .replace(/\bPE\b/g,'市盈率').replace(/\bPB\b/g,'市净率').replace(/\bMA20\b/g,'20日均线').replace(/\bMA60\b/g,'60日均线')
  .replace(/\bPCB\b/g,'印制电路板').replace(/\bIDC\b/g,'数据中心').replace(/\bVendor Code\b/gi,'供应商代码')
  .replace(/\bblocked\b/gi,'证据受限').replace(/\bnegative\b/gi,'消极').replace(/\bpositive\b/gi,'积极').replace(/\bneutral\b/gi,'中性')
  .replace(/\bgrowing\b/gi,'成长期').replace(/\bemerging\b/gi,'萌芽期').replace(/\bmature\b/gi,'成熟期').replace(/\bdeclining\b/gi,'衰退期')
  .replace(/\bdown\b/gi,'下行').replace(/\bup\b/gi,'上行').replace(/\bstable\b/gi,'震荡').replace(/\bunknown\b/gi,'未知')
  .replace(/fund_adj/gi,'基金复权因子').replace(/trade_cal/gi,'交易日历').replace(/index_dailybasic/gi,'指数当期估值')
  .replace(/生成时点不在收盘前决策窗口 14:20–14:50/g,'当前不在沪深连续交易时段')
  .replace(/盘中执行时效已通过/g,'交易时段数据时效已通过')
  .replace(/趋势与技术指标使用最近完整收盘日；盘中实时行情只用于当前价格与时效复核；事件仅纳入冻结截点前可见内容。/g,'趋势与技术指标使用最近完整收盘日；交易时段内再追加实时行情与公告时效复核。')
  .replace(/历史分位样本不足，不判断贵贱或安全边际。/g,'现有数据源不提供可靠历史估值序列，历史分位不纳入报告流程。')
  .replace(/holdingVerified\s*=\s*false/gi,'持仓验证为否').replace(/经营现金\/利润/g,'经营现金与利润比率')
  .replace(/matchConfidence/gi,'映射可信度').replace(/representativenessScore/gi,'产业代表性评分').replace(/matchedProducts/gi,'关联产品')
  .replace(/\bgraph\b/gi,'产业知识图谱')}

export function chineseSource(value:string){return chineseNarrative(value)
  .replace(/research-bundle/gi,'研究数据包').replace(/trade_cal/gi,'交易日历').replace(/fund_adj/gi,'复权因子')
  .replace(/frozen-local-daily/gi,'冻结本地日线').replace(/local-index-daily/gi,'本地指数日线')
  .replace(/etf_daily/gi,'指数基金日线').replace(/etf_research/gi,'指数基金研究数据').replace(/etf_holdings/gi,'指数基金定期持仓')
  .replace(/stock_financial/gi,'企业财务报表').replace(/stock_announcement/gi,'公司公告')}

export const analysisFieldLabels:Record<string,string>={
  analysis:'分析结论',score:'参考评分',rating:'研究评级',trend:'趋势判断',risk_level:'风险等级',drivers:'驱动因素',outlook:'后续观察',
  key_companies:'重点企业证据',chain_structure:'产业链结构',catalysts:'催化因素',risks:'风险提示',sentiment:'资讯倾向',stage:'产业阶段',
  facts:'证据事实',inference:'分析推断',boundary:'证据边界',data_scope:'数据范围',evidence_boundary:'适用边界',conclusion:'结论',source:'来源',
  date:'日期',content:'内容',details:'说明',evidence:'依据',risk:'风险',driver:'驱动因素',watch_points:'后续观察',watchlist:'跟踪清单',
  counterEvidence:'反向证据',counter_evidence:'反向证据',claim:'判断',executiveSummary:'综合投资结论',allocationStance:'配置立场',keyDrivers:'关键驱动',mainRisks:'主要风险',actionPlan:'行动建议',reviewTriggers:'复核触发项',thesis:'研究论点',etfImplications:'指数基金影响',scenarios:'情景分析',
  base:'基准情景',bull:'乐观情景',bear:'悲观情景',period:'报告期',reportType:'报表类型',publishDate:'发布日期',currency:'币种',
  status:'状态',quality:'数据质量',count:'数量',total:'总数',name:'名称',code:'代码',ticker:'证券代码',description:'说明',weight:'权重',
  role:'产业角色',fact:'事实摘要',evidenceId:'证据编号',industry_stage:'产业环节',segments:'细分环节',companies:'关联企业',assessment:'分析判断',
  verification:'证据属性',ratioSources:'比率来源',reportedRatios:'披露比率',type:'类型',importance:'重要程度',confidence:'可信度',
  tacticalView:'20日战术观点',strategicView:'6—12个月产业观点',horizon:'观察周期',signal:'规则信号',conditions:'成立条件',valuation:'估值判断',
  probability:'情景概率',expectedReturn:'预期收益',caliber:'数据口径',barrier:'潜在壁垒',qualityWarning:'质量警告',
  recommendation:'建议方向',unheld:'未持有',held:'已持有',reason:'判断依据',positiveSignals:'支持信号',negativeSignals:'反向信号',dataIssues:'数据限制',action:'建议动作',waitFor:'等待确认',
  operatingEvidence:'经营证据',graphPath:'产业链位置',selectionReason:'入选依据',mappingConfidence:'映射可信度',matchedProducts:'关联产品',
  exposureRationale:'产业暴露依据',evidenceBoundary:'证据边界',confidencePct:'建议置信度',segmentSignals:'产业环节信号',
  companySignal:'企业信号',eventSignal:'事件信号',etfExposure:'指数基金暴露',affectedCompanies:'影响企业',affectedEtfs:'影响的指数基金',path:'传导路径',event:'事件',
  segment:'细分环节',link:'传导作用',publishDates:'发布日期',sources:'来源',evidenceIds:'证据编号',
}
