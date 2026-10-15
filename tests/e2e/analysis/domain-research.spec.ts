import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

test('真实冻结证据生成的领域观点在桌面与手机可读，旧报告保持兼容', async ({ page, request }) => {
  test.setTimeout(360000)
  const file = process.env.DOMAIN_RESULT_PATH
  if (!file) throw new Error('请设置 DOMAIN_RESULT_PATH，指向真实模型验证生成的JSON')
  await expect.poll(() => {
    try { return JSON.parse(readFileSync(file, 'utf8')).domainResearch?.status } catch { return undefined }
  }, { timeout: 300000, intervals: [2000] }).toBe('completed')
  const experiment = JSON.parse(readFileSync(file, 'utf8'))
  expect(experiment.postReview?.passed).not.toBe(false)
  expect(experiment.domainResearch.status).toBe('completed')
  const response = await request.get(`/api/analysis/reports/${experiment.sourceReportId}`)
  expect(response.ok()).toBeTruthy()
  const report = await response.json()
  const original = JSON.parse(report.dataJson)
  const payload = { ...report, dataJson: JSON.stringify({ ...original, domainResearch: experiment.domainResearch, domainComparison: experiment.comparison }) }
  await page.route(`**/api/analysis/reports/${experiment.sourceReportId}`, route => route.fulfill({ json: payload }))
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`/comprehensive-analysis/report/${experiment.sourceReportId}`)
  await expect(page.getByRole('heading', { name: '领域投资价值', exact: true })).toBeVisible()
  await expect(page.getByText(experiment.domainResearch.opinion.conclusion, { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: '原分步流程基线', exact: true })).toBeVisible()
  await page.getByText('与原分步流程对照', { exact: true }).click()
  await expect(page.getByText(/尚无前向收益证据/)).toBeVisible()
  await page.getByRole('heading', { name: '领域投资价值', exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: '.runtime/domain-research/desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('heading', { name: '领域投资价值', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.getByRole('heading', { name: '领域投资价值', exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: '.runtime/domain-research/mobile.png' })
  await page.unroute(`**/api/analysis/reports/${experiment.sourceReportId}`)
  await page.reload()
  await expect(page.getByRole('heading', { name: '综合投资结论', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})
