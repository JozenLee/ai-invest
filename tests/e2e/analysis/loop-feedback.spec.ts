import { expect, test } from '@playwright/test'
import { fixture } from '../../../src/lib/research/__tests__/fixtures'

test('闭环反馈区分模型失败、无有效动作与未成熟成交，适配窄屏',async({page})=>{
  const snapshot=fixture()
  await page.route('**/api/**',async route=>{
    const pathname=new URL(route.request().url()).pathname
    let body:unknown={}
    if(pathname==='/api/data-subscriptions/industries')body={data:[{id:'ai',name:'测试领域'}]}
    else if(pathname==='/api/analysis/privacy')body={destination:'fixture'}
    else if(pathname==='/api/analysis/comprehensive')body=[]
    else if(pathname==='/api/analysis/reports')body={reports:[]}
    else if(pathname==='/api/research/ai')body={profile:snapshot.profile,schedule:{enabled:false,times:['19:30']},history:[],evaluation:null}
    else if(pathname==='/api/research/ai/validation')body={result:null,runs:[]}
    else if(pathname==='/api/research/ai/lab')body={settings:{enabled:true},experiment:null,history:[],loopMetrics:{products:10,executableActions:0,increase:0,reduce:0,requiresNewAnalysis:10,basis:'持有和观望不计入有效动作',reanalysis:{status:'failed',reasons:['403 Insufficient account balance']},blockers:[{count:10,reason:'旧观点需要重新分析'}]}}
    else if(pathname==='/api/research/ai/daily')body={
      plan:{id:'plan',strategyId:'test',sourceAsOf:snapshot.asOf,portfolioAsOf:null,validUntil:null,blockers:[],actions:[],checklist:[],feedback:[],summary:'等待数据'},
      strategies:[{id:'test',name:'综合报告统一目标'}],automation:{enabled:true},accountReview:null,
      report:{historical:{observations:0,returnPct:null,maxDrawdownPct:null}},
      attribution:{fills:0,valued:0,pending:0,netContribution:null,executionShortfall:null,rows:[],basis:'不等于账户净收益或策略胜率。'},
    }
    await route.fulfill({contentType:'application/json',body:JSON.stringify(body)})
  })
  await page.goto('/comprehensive-analysis?industryId=ai&tab=lab')
  const feedback=page.getByLabel('实操性与迭代反馈')
  await expect(feedback).toContainText('当前有效非零动作 0/10')
  await expect(feedback).toContainText('完整分析失败')
  await feedback.getByText('查看动作阻塞原因').click()
  await expect(feedback.getByText('10只产品 · 旧观点需要重新分析')).toBeVisible()
  await page.setViewportSize({width:375,height:812})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
  await feedback.screenshot({path:'test-results/loop-feedback-mobile.png'})
  await page.goto('/comprehensive-analysis?industryId=ai&tab=daily')
  await expect(page.getByLabel('成交反馈评价')).toContainText('尚无确认成交记录，不能评价真实执行效果')
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
  await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'})
  await page.getByLabel('成交反馈评价').screenshot({path:'test-results/execution-feedback-mobile.png'})
})
