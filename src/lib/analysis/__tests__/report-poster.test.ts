import { describe, it, expect } from 'vitest'
import { renderReportPoster, wrapPosterText } from '../report-poster'
import { parseSocialReport, REPORT_SECTIONS } from '../social-report'
const report={version:2,title:'AI算力硬件观察',subtitle:'示例，不代表真实市场判断',takeaways:['需求','盈利','风险'],sections:REPORT_SECTIONS.map(title=>({title,body:'证据与日期待核验'})),risks:['需求风险','估值风险','数据风险']}
describe('one-page research template',()=>{
  it('validates exact standardized sections and rejects overflow instead of truncating',()=>{
    expect(parseSocialReport(JSON.stringify(report)).version).toBe(2)
    expect(()=>parseSocialReport(JSON.stringify({...report,subtitle:'字'.repeat(81)}))).toThrow()
    expect(()=>parseSocialReport(JSON.stringify({...report,sections:report.sections.slice(1)}))).toThrow()
  })
  it('renders all sections and risk disclosures in one escaped SVG',()=>{
    const svg=renderReportPoster(parseSocialReport(JSON.stringify({...report,title:'<script>标题'})),{industry:'AI硬件',date:'2026-09-04'})
    expect(svg.match(/<svg /g)).toHaveLength(1)
    expect(svg).not.toContain('<script>')
    expect(svg).toContain('&lt;script&gt;')
    for(const title of REPORT_SECTIONS) expect(svg).toContain(title)
    expect(svg).toContain('不构成投资建议')
    expect(svg).toContain('数据风险')
  })
  it('wraps CJK and long unbroken source text',()=>{
    expect(wrapPosterText('甲乙丙丁',50,25)).toEqual(['甲乙','丙丁'])
    expect(wrapPosterText('https://example.com/long/path',80,20).length).toBeGreaterThan(1)
  })
})
