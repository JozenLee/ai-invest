import { analysisFieldLabels, chineseValue } from './chinese-labels'

export type DataRecord = Record<string, unknown>
export const isRecord = (value: unknown): value is DataRecord => Boolean(value && typeof value === 'object' && !Array.isArray(value))

export function parseStructuredValue(value: unknown): unknown {
  let current = value
  for (let attempt = 0; attempt < 3 && typeof current === 'string'; attempt++) {
    const text = current.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    if (!/^[{[\"]/.test(text)) break
    try { current = JSON.parse(text) } catch { break }
  }
  return current
}

/** Drop absent values only. False, zero, unknown states and diagnostic messages are evidence. */
export function cleanStructuredValue(value: unknown): unknown {
  const parsed = parseStructuredValue(value)
  if (parsed == null || (typeof parsed === 'string' && !parsed.trim()) || (typeof parsed === 'number' && !Number.isFinite(parsed))) return undefined
  if (Array.isArray(parsed)) {
    const rows = parsed.map(cleanStructuredValue).filter(item => item !== undefined)
    return rows.length ? rows : undefined
  }
  if (isRecord(parsed)) {
    const entries = Object.entries(parsed).map(([key, item]) => [key, cleanStructuredValue(item)] as const).filter(([, item]) => item !== undefined)
    return entries.length ? Object.fromEntries(entries) : undefined
  }
  return parsed
}

const labels: Record<string, string> = {
  technicalReadiness:'技术样本缺口与参考',referenceSession:'共同完整参考日',latestPriceDate:'日线日期',latestFactorDate:'复权因子日期',latestIndexDate:'跟踪指数日期',reference:'历史参考',field:'数据字段',ratingBasis:'评级来源说明',informationStatus:'经济信息验证状态',disclosureTimeline:'披露时间核验',observedPublicationAt:'本轮材料发布日期',firstDisclosureAt:'首次披露日',discoveryPlan:'候选发现与核验流程',unknownSignalPct:'未知信号占比（%）',
  timezone:'时区',timeZone:'时区',tradingDate:'交易日期',policy:'时效规则',morningSession:'上午交易时段',afternoonSession:'下午交易时段',maxQuoteAgeSeconds:'行情有效时长（秒）',maxEventCheckAgeSeconds:'公告检查有效时长（秒）',company:'企业研判',reportId:'报告编号',sessionDate:'报告交易日',comprehensiveConclusion:'历史综合结论',title:'标题',unknownEvidenceSummary:'未知证据汇总',unknownConditionTypes:'未知条件类型',affectedETFCount:'受影响基金数',comparisonDate:'比较日期',candidate:'候选产品',exclusions:'排除原因',reviewChanges:'本轮变化',from:'此前状态',to:'当前状态',changedConditions:'变化条件',leftIndexCode:'对比指数一',rightIndexCode:'对比指数二',commonHoldings:'共同持仓',weightedOverlapPct:'持仓加权重叠（%）',periods:'披露期间',inputs:'输入依据',multiFactorAverageScore:'多因子平均评分',profitGrowthPositive:'盈利增长企业数',profitGrowthKnown:'盈利数据已知企业数',cashQualityHealthy:'现金流健康企业数',cashQualityKnown:'现金流已知企业数',decomposition:'因素拆解',id:'记录编号',evidencedRelations:'有证据关系数',relationEvidencePct:'关系证据覆盖（%）',segmentEtfCoveragePct:'环节基金覆盖（%）',segmentIndexCoveragePct:'环节指数覆盖（%）',companySegmentCoveragePct:'企业环节归属（%）',companyEtfCoveragePct:'企业基金映射（%）',holdingVerifiedCoveragePct:'持仓验证覆盖（%）',stageCode:'阶段代码',segmentCode:'环节代码',focus:'研究重点',recommendationSource:'建议来源',ruleAssessment:'规则评估',riskOff:'风险收缩',eligible:'满足条件',productSelection:'产品选择',structureRevisionId:'结构版本',
  companyCount:'企业数量',multiPeriodFinancialCount:'多期财务企业数',segmentCount:'环节数量',mappedCompanyCount:'已映射企业数',positiveProfitGrowth:'盈利增长企业数',medianProfitGrowthPct:'盈利增长中位数（%）',healthyCashConversion:'现金转化健康企业数',medianCashConversionPct:'现金转化中位数（%）',sampleScope:'样本范围',graphMapping:'图谱映射',matchConfidence:'匹配可信度',representativeEtfs:'代表基金',holdingWeight:'持仓权重',reportPeriod:'报告期间',ratios:'财务比率',netMarginPct:'净利率（%）',debtToAssetsPct:'资产负债率（%）',operatingCashToProfitPct:'经营现金与利润比（%）',ROE:'净资产收益率',financialGaps:'财务数据缺口',contentTypes:'内容类型',snapshotId:'快照编号',indexBreadth:'指数广度',mappedIndices:'映射指数数',usableIndices:'可用指数数',aboveMA20:'高于20日均线数量',ruleAction:'规则动作',researchOnly:'仅用于研究',trigger:'触发条件',expiresAt:'失效时间',ma20:'20日均线',ma60:'60日均线',volatilityPct:'波动率（%）',premiumPct:'溢价率（%）',amount20:'20日成交额',flowSum:'资金流合计',flowNetPct:'净流入比例（%）',flowDays:'资金样本天数',adjusted:'是否复权',trackingErrorPct:'跟踪误差（%）',disclosedWeightPct:'披露权重（%）',availability:'可用性',nav:'净值',navSource:'净值来源',navStatus:'净值状态',navDetail:'净值说明',shareChangePct:'份额变化（%）',valuationDate:'估值日期',valuationSource:'估值来源',top10WeightPct:'前十大持仓权重（%）',holdingsPeriod:'持仓披露期',alternatives:'备选产品',exposure:'产业暴露',weightPct:'权重（%）',changes:'变化记录',omittedConditions:'不适用条件',evidenceTotal:'证据总数',eventsTotal:'事件总数',results:'回放结果',trades:'交易记录',skipped:'跳过记录',returnPct:'收益率（%）',benchmarkReturnPct:'基准收益（%）',excessReturnPct:'超额收益（%）',turnover:'换手率',sharpeRatio:'夏普比率',informationRatio:'信息比率',observations:'观察记录',costs:'费用假设',commissionBps:'佣金（基点）',slippageBps:'滑点（基点）',snapshots:'历史快照',continuityGuard:'连续性校验',validatedReport:'报告校验',subtitle:'副标题',takeaways:'核心要点',sections:'报告章节',body:'正文',tickers:'证券代码',etfs:'指数基金',price:'价格',change:'价格变化',intraday:'盘中行情',aligned:'是否对齐',ma:'移动均线',ma5:'5日均线',ma10:'10日均线',macd:'平滑异同移动平均线',dif:'快慢均线差',dea:'信号线',dmi:'趋向指标',pdi:'上升方向指标',mdi:'下降方向指标',adx:'平均趋向指数',adxr:'趋向评估值',boll:'布林带',upper:'上轨',middle:'中轨',lower:'下轨',bandwidth:'带宽',percentB:'布林位置',sar:'抛物线转向指标',isLong:'是否多头',af:'加速因子',ep:'极值价格',momentum:'动量指标',rsi:'相对强弱指标',rsi6:'6日相对强弱指标',rsi24:'24日相对强弱指标',kdj:'随机指标',k:'快速随机值',d:'慢速随机值',j:'随机偏离值',cci:'顺势指标',wr:'威廉指标',obv:'能量潮',vwap:'成交量加权均价',volumeRatio:'量比',sector:'板块',net:'净流入',netPct:'净流入比例（%）',sectorCount:'板块数量',coveredSectorCount:'覆盖板块数',referenceIndicators:'参考指标',mainFlow:'主力资金',exchangeName:'交易所',margin:'融资融券',allocationVersion:'配置版本',allocationBasis:'配置依据',readiness:'执行准备情况',appliedToAllocation:'是否应用至配置',totalAssets:'总资产',cashTargetFloorPct:'现金下限（%）',mappingCoveragePct:'映射覆盖（%）',verifiedMappingCoveragePct:'已核验映射覆盖（%）',domainMappingCoveragePct:'领域映射覆盖（%）',productMappingCoveragePct:'产品映射覆盖（%）',costCoveragePct:'费用覆盖（%）',riskDiagnostics:'风险诊断',concentrationHhi:'集中度指数',effectiveFundCount:'有效基金数',volatilityCoveragePct:'波动率覆盖（%）',unverifiedExposurePct:'未核验暴露（%）',contributions:'风险贡献',adjustmentPlan:'调整计划',completed:'已完成',remainingCashGapPct:'剩余现金缺口（%）',remainingIndustryReductionPct:'剩余领域减仓（%）',steps:'操作步骤',executable:'是否可执行',actions:'动作清单',currentWeightPct:'当前权重（%）',targetWeightPct:'目标权重（%）',changeWeightPct:'权重变化（%）',amount:'金额',estimatedUnits:'预计份额',estimatedFee:'预计费用',batches:'分批计划',mapping:'映射关系',fundType:'基金类型',targetEtfCode:'目标基金代码',targetIndexCode:'目标指数代码',decisionTicker:'规则产品代码',method:'计算方法',verified:'是否核验',domainVerified:'领域是否核验',gates:'执行门禁',met:'是否满足',riskProfile:'风险偏好',investHorizon:'投资周期',minCashRatio:'最低现金比例',maxIndustryRatio:'最高领域比例',maxFundRatio:'最高基金比例',maxSingleAdjustmentRatio:'单次最高调整比例',stagedAdjustment:'是否分批调整',disclaimer:'适用说明',
  references:'来源与日期',aiAnalysis:'持仓智能研判',aiNarrative:'持仓解读',conclusionApplication:'综合结论如何应用于持仓',ruleProducts:'规则产品数',historyReports:'历史报告数',selectedHistoryReports:'采用历史报告数',
  system:'系统角色提示',user:'用户',assistant:'模型',messages:'输入消息',text:'正文',
  industry:'研究产业',asOf:'证据截止时间',decisionTiming:'数据时效',analysisFocus:'分析要求',historicalReportContext:'历史观点参照',ruleBoundary:'规则边界',unknownSummary:'待核验条件汇总',
  graph:'产业图谱',coverage:'覆盖情况',marketSignals:'市场信号',marketReference:'市场参考',marketReferenceData:'市场参考数据',marketReferenceIndicators:'市场参考指标',
  decisionRules:'逐产品规则',decisionEventEvidence:'决策事件证据',indexOverlaps:'指数持仓重叠',valuationScenarios:'估值情景',sourceModules:'上游研判',etfMapping:'基金与指数映射',products:'产品信息',productComparison:'同指数产品比较',mappingLimit:'映射边界',
  dimensions:'分维度研判',judgment:'判断',dataBoundary:'数据边界',riskLevel:'风险等级',keyCompanies:'代表企业',chainStructure:'产业链结构',
  representativeCompanies:'代表企业',segmentAggregates:'环节聚合',financials:'财务数据',announcements:'公告',events:'事件',news:'资讯研判',investment:'投资结论',
  state:'规则状态',unheldAction:'未持有时的动作',heldAction:'已持有时的动作',invalidation:'失效条件',gaps:'证据缺口',decisions:'逐产品判断',validation:'校验结果',
  key:'条件标识',label:'条件名称',operator:'比较方式',threshold:'规则阈值',passed:'是否通过',issues:'校验问题',warnings:'提示信息',errors:'错误信息',message:'状态说明',referenceIssues:'引用异常',
  indexCode:'指数代码',indexName:'指数名称',etfCode:'基金代码',etfName:'基金名称',stockCode:'企业代码',stockName:'企业名称',
  capturedAt:'归档时间',startedAt:'开始时间',completedAt:'完成时间',publishedAt:'发布时间',sourceDate:'来源日期',previousOpportunity:'此前机会',currentEvidence:'本轮证据',implication:'操作含义',actionImplication:'操作含义',
  corrections:'已完成的校正',referenceCorrections:'引用校正',dateBasis:'日期口径',inputEvidenceIds:'底层证据编号',citationRegistry:'可引用证据',outputValidations:'输出校验',attempt:'请求序号',durationMs:'耗时（毫秒）',timeoutMs:'超时上限（毫秒）',maxTokens:'输出上限',max_tokens:'输出上限',model:'模型名称',stopReason:'结束原因',stop_reason:'结束原因',usage:'用量',input_tokens:'输入用量',output_tokens:'输出用量',
  temperature:'采样温度',effort:'推理强度',characters:'输入字符数',numericValues:'数值数量',unexpandedPlaceholders:'未展开占位符',
  factorDiagnostics:'多因子诊断',factorScore:'多因子评分',factorRegime:'多因子状态',distanceToMA20Pct:'距20日均线（%）',rsi12:'12日相对强弱指标',annualizedVolatilityPct:'年化波动率（%）',maxDrawdownPct:'最大回撤（%）',maxDrawdown120Pct:'120日最大回撤（%）',downsideVolatilityPct:'下行波动率（%）',
  dailyChangePct:'当日涨跌幅（%）',return20Pct:'20日收益（%）',return60Pct:'60日收益（%）',return120Pct:'120日收益（%）',relative20Pct:'20日相对收益（%）',relative60Pct:'60日相对收益（%）',technicalStatus:'技术数据状态',periodStart:'区间开始',periodEnd:'区间结束',
  feePct:'费用率（%）',pe:'市盈率',pb:'市净率',navDate:'净值日期',pePercentileHistory:'历史市盈率分位',pbPercentileHistory:'历史市净率分位',valuationHistoryStart:'估值样本开始日期',valuationSampleCount:'估值样本数',
  revisionId:'图谱版本',version:'版本',contentHash:'内容校验标识',mappingRevisionId:'映射版本',mappingContentHash:'映射校验标识',mappingPublishedAt:'映射发布时间',mappingSource:'映射来源',sourceFetchedAt:'来源采集时间',industryEvidenceCount:'产业证据数量',
  stages:'产业阶段',relations:'传导关系',etfExposure:'基金产业暴露',companyMappings:'企业映射',eventMappings:'事件映射',holdingVerified:'持仓是否已核验',mappingBasis:'映射依据',usableFor:'适用用途',matchedCompanies:'匹配企业',matchedEtfs:'匹配基金',matchedIndices:'匹配指数',
  sourceCode:'来源代码',sourceName:'来源名称',targetCode:'目标代码',targetName:'目标名称',target:'目标',direction:'传导方向',lag:'传导时滞',evidenceCount:'证据数量',relevance:'相关程度',disclosedHoldings:'披露持仓',
  category:'事件分类',excerpt:'内容摘要',url:'来源链接',evidenceStatus:'证据状态',evidenceGrade:'证据等级',sourceTier:'来源等级',independentSourceCount:'独立来源数量',materialityScore:'重要性评分',
  expectedSession:'研究基准日',closeDataSession:'最近收盘日',eventCutoff:'事件截止时间',phase:'执行时段',executionReady:'是否满足执行时效',quoteAsOf:'行情时间',eventCheckAsOf:'公告检查时间',validUntil:'有效期',reasons:'限制原因',basis:'口径说明',intradayApplicability:'盘中数据适用性',
}

export function fieldLabel(key: string): string {
  const camel = key.replace(/[-_]([a-z])/g, (_, c: string) => c.toUpperCase())
  const found = labels[key] || analysisFieldLabels[key] || labels[camel] || analysisFieldLabels[camel]
  if (found) return found
  if (/[\u3400-\u9fff]/.test(key) || /^\d/.test(key)) return key
  return '扩展信息'
}

const enumLabels: Record<string, string> = {
  corrected:'已校正',end_turn:'正常完成',max_tokens:'输出达到上限',stop_sequence:'命中停止条件',tool_use:'请求工具调用',fallback:'已使用降级结果',skipped:'已跳过',
  system:'系统',user:'用户',assistant:'模型',text:'文本',COMPLETED:'已完成',RUNNING:'进行中',FAILED:'失败',PENDING:'等待中',SKIPPED:'已跳过',
  '>':'大于','>=':'大于等于','<':'小于','<=':'小于等于','==':'等于','===':'等于','!=':'不等于',
}
export function displayValue(value: unknown): string {
  if (value == null) return '—'
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value === 'number') return value.toLocaleString('zh-CN', { maximumFractionDigits: 6 })
  if (typeof value === 'string') {
    const errors: Record<string,string> = { 'Request was aborted.':'请求已中止', 'Connection error.':'连接异常', 'Request timed out.':'请求超时', 'fetch failed':'数据请求失败' }
    return errors[value] || enumLabels[value] || String(chineseValue(value))
  }
  return ''
}

export type ContentSection = { kind: 'text' | 'data' | 'invalid'; value: unknown }
/** Balanced scanning ignores braces inside JSON strings and preserves surrounding instructions. */
export function splitStructuredContent(content: string): ContentSection[] {
  const sections: ContentSection[] = []
  let cursor = 0
  for (let start = 0; start < content.length; start++) {
    if (content[start] !== '{' && content[start] !== '[') continue
    const stack: string[] = []
    let quoted = false, escaped = false, end = start
    for (; end < content.length; end++) {
      const char = content[end]
      if (quoted) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') quoted = false; continue }
      if (char === '"') { quoted = true; continue }
      if (char === '{' || char === '[') stack.push(char)
      else if (char === '}' || char === ']') {
        if (stack.pop() !== (char === '}' ? '{' : '[')) break
        if (!stack.length) { end++; break }
      }
    }
    const candidate = content.slice(start, end)
    try {
      const data: unknown = JSON.parse(candidate)
      const before = content.slice(cursor, start).replace(/```(?:json)?\s*$/i, '').trim()
      if (before) sections.push({ kind:'text', value:before })
      sections.push({ kind:'data', value:data })
      cursor = end
      if (content.slice(cursor).match(/^\s*```/)) cursor += content.slice(cursor).match(/^\s*```/)![0].length
      start = cursor - 1
    } catch {
      // Do not turn fragments of malformed JSON into seemingly valid conclusions.
      if (/^(?:\{\s*"|\[\s*(?:\{|"|-?\d|true|false|null))/.test(candidate)) {
        const before = content.slice(cursor, start).replace(/```(?:json)?\s*$/i, '').trim()
        if (before) sections.push({ kind:'text', value:before })
        sections.push({ kind:'invalid', value:content.slice(start).replace(/\s*```$/, '') })
        return sections
      }
      start = Math.max(start, end - 1)
    }
  }
  const tail = content.slice(cursor).trim()
  if (tail) sections.push({ kind:'text', value:tail })
  return sections
}
