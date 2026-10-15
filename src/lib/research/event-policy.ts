/** Governance notices remain auditable but must not become risk signals merely
 * because their legal boilerplate contains words such as ‘处罚’ or ‘立案’. */
export const administrativeTitle=/登记|股东会|股东大会|过户|翌日披露|章程|工商变更|会议材料|管理制度|内部控制|董事会成员|员工多元化|对外投资与担保|最近五年不存在|转股价格修正|关于召开.*说明会|关于参加.*说明会|业绩说明会的公告|激励对象名单|薪酬(?:与|和)考核委员会|离任暨聘任|聘任.*总裁|内幕信息知情人|法律意见书|董事会第.*次会议决议|监事会第.*次会议决议|发行保荐书|募集说明书|审核问询函回复.*提示性公告|向特定对象发行.*股票|权益分派实施公告|部分股票解除质押|股份解除质押|回购公司股份|股票交易异常波动公告/

/** Operational filings can be valid primary evidence while still carrying very
 * little information about demand, earnings or industry transmission. */
export const lowDecisionValueTitle=/闲置募集资金.*现金管理|现金管理.*进展公告|股票期权激励计划.*考核管理办法|员工持股计划.*管理办法|H股公告[（(]?(?:中期|年度)报告[）)]?$|发行结果暨股本变动|衍生品交易业务的公告|套期保值型衍生品交易/

/** Market-rumour enforcement or clarification is auditable context, not direct
 * evidence that supply, demand or company fundamentals changed. */
export const nonMaterialRiskTitle=/算力卡.*传闻.*造谣者.*处罚|传闻.*造谣者.*处罚|澄清.*(?:市场)?传闻/

/** Digest and strategy-column titles mix unrelated claims and must be split or
 * corroborated before becoming decision evidence. */
export const digestTitle=/新闻精选|要闻汇总|早间新闻|晚间新闻|周末要闻|迷雾与罗盘|缩量环境.*策略|策略周报|行业周报|市场周报/
