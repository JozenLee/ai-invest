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

export function chineseNarrative(value:string){return value
  .replace(/risk-off/gi,'风险收缩').replace(/ETF/g,'指数基金').replace(/\bAI\b/g,'人工智能')
  .replace(/\bAIGC\b/g,'生成式人工智能').replace(/evidenceId/gi,'证据编号').replace(/ruleBoundary/g,'规则边界')
  .replace(/source-linked-not-independently-verified/gi,'来源关联但未经独立核验').replace(/H1/g,'上半年').replace(/Q2/g,'二季度')
  .replace(/\bPE\b/g,'市盈率').replace(/\bPB\b/g,'市净率').replace(/\bMA20\b/g,'20日均线').replace(/\bMA60\b/g,'60日均线')
  .replace(/\bPCB\b/g,'印制电路板').replace(/\bIDC\b/g,'数据中心').replace(/\bVendor Code\b/gi,'供应商代码')
  .replace(/\bblocked\b/gi,'证据受限').replace(/\bnegative\b/gi,'消极').replace(/\bpositive\b/gi,'积极').replace(/\bneutral\b/gi,'中性')
  .replace(/\bgrowing\b/gi,'成长期').replace(/\bemerging\b/gi,'萌芽期').replace(/\bmature\b/gi,'成熟期').replace(/\bdeclining\b/gi,'衰退期')
  .replace(/\bdown\b/gi,'下行').replace(/\bup\b/gi,'上行').replace(/\bstable\b/gi,'震荡').replace(/\bunknown\b/gi,'未知')}

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
  counterEvidence:'反向证据',counter_evidence:'反向证据',claim:'判断',thesis:'研究论点',etfImplications:'指数基金影响',scenarios:'情景分析',
  base:'基准情景',bull:'乐观情景',bear:'悲观情景',period:'报告期',reportType:'报表类型',publishDate:'发布日期',currency:'币种',
  status:'状态',quality:'数据质量',count:'数量',total:'总数',name:'名称',code:'代码',ticker:'证券代码',description:'说明',weight:'权重',
  role:'产业角色',fact:'事实摘要',evidenceId:'证据编号',industry_stage:'产业环节',segments:'细分环节',companies:'关联企业',assessment:'分析判断',
  verification:'证据属性',ratioSources:'比率来源',reportedRatios:'披露比率',type:'类型',importance:'重要程度',confidence:'可信度',
  tacticalView:'20日战术观点',strategicView:'6—12个月产业观点',horizon:'观察周期',signal:'规则信号',conditions:'成立条件',valuation:'估值判断',
  probability:'情景概率',expectedReturn:'预期收益',caliber:'数据口径',barrier:'潜在壁垒',qualityWarning:'质量警告',
}
