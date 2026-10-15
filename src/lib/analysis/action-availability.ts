import type { AIProductDecision } from './investment-conclusion'
export function actionAvailability(decision:AIProductDecision|null|undefined,executionReady=true,now=Date.now()){
  const contract=decision?.executionContract
  const expired=!!contract&&(!Number.isFinite(Date.parse(contract.asOf))||!Number.isFinite(Date.parse(contract.validUntil))||Date.parse(contract.validUntil)<=now||Date.parse(contract.asOf)>now)
  const triggersMet=(contract?.triggerRules||[]).every(rule=>rule.status===(rule.requiredStatus||'met'))
  const available=!!decision&&executionReady&&contract?.status==='verified'&&!expired&&triggersMet&&!contract.blockers?.length&&!contract.manualReviewConditions?.length
  return {available,expired,unheld:available?decision!.unheldAction:'暂无有效建议',held:available?decision!.heldAction:'暂无有效建议',reason:expired?'原建议已过期，需要按最新证据复核':!available?'证据或执行条件尚未通过；不能把缺失解释为持有':'本轮建议有效，执行前仍需核验实时交易条件'}
}
