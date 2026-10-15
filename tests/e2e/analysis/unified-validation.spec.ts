import {expect,test} from '@playwright/test'
import {fixture} from '../../../src/lib/research/__tests__/fixtures'
import {datasetFromSnapshot} from '../../../src/lib/research/lab/experiment'
import {createPolicy,decideAllocation,type AllocationInput} from '../../../src/lib/research/strategy/kernel'
import {compareUnifiedStrategies,defaultProtocol} from '../../../src/lib/research/strategy/validation'

test('统一策略验证可登记候选、显示边界并精确重放，兼容移动端',async({page})=>{
  const snapshot=fixture(),date=snapshot.etfs[0].bars[80].date
  const input:AllocationInput={snapshotId:'historical',asOf:`${date}T15:30:00+08:00`,generatedAt:`${date}T16:00:00+08:00`,sourceDate:date,policy:createPolicy(),evidence:[{id:'proof',businessAt:date,publishedAt:`${date}T15:00:00+08:00`,observedAt:`${date}T15:10:00+08:00`,hash:'proof'}],products:[{ticker:'159995',indexCode:'980017.SZ',direction:'increase',adjustmentPct:10,verified:true,validUntil:`${snapshot.etfs[0].bars[81].date}T15:00:00+08:00`,reason:'测试研究观点',trigger:'收盘确认',invalidation:'趋势失效',evidenceIds:['proof'],opinionId:'opinion'}]}
  const data=datasetFromSnapshot(snapshot)
  const result=compareUnifiedStrategies(data,[{decisionId:'decision',availableAt:input.generatedAt,input,allocation:decideAllocation(input)}],createPolicy({adjustmentScale:.5}),defaultProtocol(data))
  let posted=false,verified=false
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url()),pathname=url.pathname
    let body:unknown={}
    if(pathname==='/api/data-subscriptions/industries')body={data:[{id:'ai',name:'测试领域'}]}
    else if(pathname==='/api/analysis/privacy')body={destination:'fixture'}
    else if(pathname==='/api/analysis/comprehensive')body=[]
    else if(pathname==='/api/analysis/reports')body={reports:[]}
    else if(pathname==='/api/research/ai')body={profile:snapshot.profile,schedule:{enabled:false,times:['19:30']},history:[],evaluation:null}
    else if(pathname==='/api/research/ai/lab')body={settings:{enabled:false},experiment:null,history:[]}
    else if(pathname==='/api/research/ai/validation'){
      if(route.request().method()==='GET')body={result:null,runs:[]}
      else {const request=route.request().postDataJSON();if(request.action==='compare'){expect(request.adjustmentScale).toBe(.5);posted=true;body={id:'validation-fixture',result}}else{expect(request.id).toBe('validation-fixture');verified=true;body={verified:true}}}
    }
    await route.fulfill({contentType:'application/json',body:JSON.stringify(body)})
  })
  await page.goto('/comprehensive-analysis?industryId=ai&tab=lab')
  const panel=page.getByRole('region',{name:'统一策略历史验证'})
  await expect(panel.getByText(/尚无统一策略验证记录/)).toBeVisible()
  await panel.getByLabel('候选调整幅度').selectOption('0.5')
  await panel.getByRole('button',{name:'登记候选并对照验证'}).click()
  await expect(panel.getByText('原始统一目标',{exact:true})).toBeVisible()
  await expect(panel.getByText(/有效样本不足/)).toBeVisible()
  await panel.getByRole('button',{name:'精确重放本次结果'}).click()
  await expect(panel.getByRole('status')).toContainText('重放通过')
  expect(posted&&verified).toBe(true)
  await page.setViewportSize({width:1280,height:2000})
  await panel.screenshot({path:'test-results/unified-validation-desktop.png'})
  await page.setViewportSize({width:375,height:812})
  await expect(panel.getByRole('button',{name:'登记候选并对照验证'})).toBeVisible()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
  await page.setViewportSize({width:375,height:2600})
  await panel.screenshot({path:'test-results/unified-validation-mobile.png'})
})
