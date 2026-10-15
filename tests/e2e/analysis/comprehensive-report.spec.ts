import { expect, test } from '@playwright/test'

type ReportSummary = { id: string }
type ReportDetail = { id: string; dataJson?: string }
type RunGraph = { nodes: Array<{ id: string; execution?: { status?: string } | null }> }
type RunWorkspace = { steps: Array<{ stepName: string; status: string }> }

test('已完成轮次可从综合分析工作台闭环阅读完整报告', async ({ page, request }) => {
  const requestedReportId = process.env.REPORT_ID
  const reportId = requestedReportId || await request
    .get('/api/analysis/reports?type=comprehensive&view=summary&limit=1')
    .then(async response => {
      expect(response.ok()).toBeTruthy()
      const payload = await response.json() as { reports?: ReportSummary[] }
      return payload.reports?.[0]?.id
    })

  test.skip(!reportId, '本地数据库没有可用于真实闭环验收的综合报告')

  const detailResponse = await request.get(`/api/analysis/reports/${encodeURIComponent(reportId!)}`)
  expect(detailResponse.ok()).toBeTruthy()
  const report = await detailResponse.json() as ReportDetail
  const structured = JSON.parse(report.dataJson || '{}') as { metadata?: { runId?: string } }
  const runId = structured.metadata?.runId
  expect(runId, '报告必须关联生成它的执行轮次').toBeTruthy()

  await page.goto(`/comprehensive-analysis?runId=${encodeURIComponent(runId!)}`)
  await expect(page.getByRole('heading', { name: '综合分析', exact: true })).toBeVisible()
  await expect(page.getByRole('progressbar', { name: '综合分析进度' })).toHaveAttribute('aria-valuenow', '100')
  const [graph, workspace] = await Promise.all([
    request.get(`/api/analysis/comprehensive/${encodeURIComponent(runId!)}?view=graph`).then(response => response.json() as Promise<RunGraph>),
    request.get(`/api/analysis/comprehensive/${encodeURIComponent(runId!)}?view=workspace`).then(response => response.json() as Promise<RunWorkspace>),
  ])
  const graphStates = graph.nodes.map(node => [node.id, node.execution?.status || 'PENDING']).sort()
  const workspaceStates = workspace.steps.map(step => [step.stepName, step.status]).sort()
  expect(graphStates).toEqual(workspaceStates)
  const topologyNodes = page.locator('[aria-label^="工作流拓扑画布"] [data-workflow-node]')
  await expect(topologyNodes).toHaveCount(graph.nodes.length)
  await expect(page.locator('[aria-label^="工作流拓扑画布"] [data-workflow-node][data-node-status="COMPLETED"]')).toHaveCount(graph.nodes.filter(node=>node.execution?.status==='COMPLETED').length)
  await expect(page.getByText(`/ ${graph.nodes.length} 节点`, { exact: true })).toBeVisible()
  const reportLink = page.getByRole('link', { name: '阅读报告' })
  await expect(reportLink).toHaveAttribute('href', `/comprehensive-analysis/report/${reportId}`)
  await reportLink.click()

  await expect(page).toHaveURL(new RegExp(`/comprehensive-analysis/report/${reportId}`))
  await expect(page.locator('main')).toHaveCount(1)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('region', { name: '报告使用边界' })).toBeVisible()
  await expect(page.getByText(/^(交易时段 · 实时数据|非交易时段 · 最新收盘数据|仅供投资参考)$/, { exact: true }).first()).toBeVisible()

  const expectedPages: Record<string, RegExp> = {
    summary: /综合投资结论/,
    analysis: /研究分析与依据/,
    decisions: /AI逐产品投资决策/,
    portfolio: /组合|持仓/,
    readiness: /数据、质量与复盘附录/,
    publish: /发布|图文/,
  }
  const navigation = page.getByRole('navigation', { name: '报告子页面' })
  const links = navigation.getByRole('link')
  expect(await links.count()).toBeGreaterThanOrEqual(5)
  for (let index = 0; index < await links.count(); index += 1) {
    const href = await links.nth(index).getAttribute('href')
    const pageId = new URL(href!, 'http://localhost').searchParams.get('page')!
    await page.goto(href!)
    await expect(page.locator('main')).toHaveCount(1)
    await expect(page.locator('main')).toContainText(expectedPages[pageId])
    await expect(page.getByText(/^(报告读取失败|报告不存在|请求失败)$/)).toHaveCount(0)
  }

  for (const viewport of [{ width: 375, height: 812 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport)
    await page.goto(`/comprehensive-analysis/report/${reportId}?page=summary`)
    await expect(page.getByRole('heading', { name: '综合投资结论' })).toBeVisible()
    const widths = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }))
    expect(widths.document).toBeLessThanOrEqual(widths.viewport + 1)
  }
})

test('执行就绪度与归档合同、数据缺口保持一致',async({request,page})=>{
  const listing=await request.get('/api/analysis/reports?type=comprehensive&view=summary&limit=1').then(response=>response.json())
  const reportId=listing.reports?.[0]?.id
  test.skip(!reportId,'没有归档报告')
  const report=await request.get(`/api/analysis/reports/${reportId}`).then(response=>response.json())
  const data=JSON.parse(report.dataJson)
  const advice=typeof data.investmentAdvice==='string'?JSON.parse(data.investmentAdvice):data.investmentAdvice
  const products=advice?.productDecisions||[]
  if(products.length&&products.every((row:{executionContract?:{status:string}})=>row.executionContract?.status!=='verified')){
    expect(data.reportQuality.executionReadinessScore).toBe(0)
    expect(listing.reports[0].quality.executionReadinessScore).toBe(0)
  }
  if(data.integrityWarnings?.length)expect(data.decisionTiming.executionReady).toBe(false)
  await page.goto(`/comprehensive-analysis/report/${reportId}?page=readiness`)
  await page.locator('summary').filter({hasText:'报告等级：'}).click()
  await expect(page.getByText('执行合同与组合就绪度',{exact:false})).toBeVisible()
  await expect(page.getByText('数据准备度',{exact:false})).toBeVisible()
})

test('规则复核关联新快照并保留原AI观点来源',async({request})=>{
  const listing=await request.get('/api/analysis/reports?type=comprehensive&view=summary&limit=10').then(response=>response.json())
  const summary=listing.reports?.find((row:{metadata?:{kind:string}})=>row.metadata?.kind==='review')
  test.skip(!summary,'没有规则复核报告')
  const report=await request.get(`/api/analysis/reports/${summary.id}`).then(response=>response.json())
  const data=JSON.parse(report.dataJson)
  const advice=typeof data.investmentAdvice==='string'?JSON.parse(data.investmentAdvice):data.investmentAdvice
  expect(advice.reviewAudit.reviewedAsOf).toBe(data.researchEvaluation.asOf)
  expect(data.metadata.parentRunId).toBeTruthy()
  for(const product of advice.productDecisions){
    expect(product.executionContract.asOf).toBe(data.researchEvaluation.asOf)
    expect(product.reviewProvenance.sourceReportId).toBeTruthy()
    expect(Date.parse(product.reviewProvenance.sourceAsOf)).toBeLessThan(Date.parse(product.reviewProvenance.reviewedAsOf))
  }
})
