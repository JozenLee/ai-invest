import type { SocialReport } from './social-report'

const palette = { ink: '#12283A', muted: '#526574', paper: '#F3F5F3', card: '#FFFFFF', teal: '#007D77', line: '#DCE4E2', risk: '#FFF0D9' }
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!))
// Conservative glyph widths keep CJK and Latin source labels inside the same grid.
export function wrapPosterText(value: string, width: number, size: number): string[] {
  return value.split('\n').flatMap(paragraph => {
    const lines: string[] = []; let line = '', used = 0
    for (const char of Array.from(paragraph)) {
      const advance = /[\u0000-\u007f]/.test(char) ? size * .65 : size
      if (used + advance > width && line) {
        // Move the preceding glyph with closing punctuation to avoid orphan punctuation.
        if (/[，。；：！？、）】》%]/.test(char) && line.length > 1) {
          const glyphs = Array.from(line); const last = glyphs.pop()!
          lines.push(glyphs.join('')); line = last; used = /[\u0000-\u007f]/.test(last) ? size*.65 : size
        } else { lines.push(line); line = ''; used = 0 }
      }
      line += char; used += advance
    }
    lines.push(line); return lines
  })
}

/** One deterministic layout for browser preview and server-side PNG publication. */
export function renderReportPoster(report: SocialReport, meta: { industry: string; date: string }) {
  const parts: string[] = []
  const rect = (x: number,y: number,w: number,h: number,fill: string,r = 18) => parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"/>`)
  const text = (value: string,x: number,y: number,width: number,size = 25,color = palette.ink,bold = false) => {
    const lines = wrapPosterText(value,width,size)
    lines.forEach((line,i) => parts.push(`<text x="${x}" y="${y+i*size*1.5}" font-size="${size}" font-weight="${bold?700:400}" fill="${color}">${escape(line)}</text>`))
    return lines.length*size*1.5
  }
  rect(0,0,1200,360,palette.ink,0)
  text('产业研究 / INDUSTRY BRIEF',48,55,1104,20,'#80DDD0',true)
  text(meta.industry+'  ·  '+meta.date+'  ·  研究快照',48,96,1104,20,'#DCE4E2')
  const titleHeight = text(report.title,48,158,1104,48,'#FFFFFF',true)
  let y = 158+titleHeight+12
  y += text(report.subtitle,48,y,1104,26,'#DCE4E2')+30
  // Header expands for legacy reports; no clipping or silent content truncation.
  parts.unshift(`<rect width="1200" height="${y}" fill="${palette.ink}"/>`)
  y = Math.max(390,y+30)
  if (report.metrics?.length) {
    const rows = report.metrics
    for (let offset=0; offset<rows.length; offset+=3) {
      const batch=rows.slice(offset,offset+3)
      const h=Math.max(...batch.map(m => wrapPosterText(m.label,320,23).length*35+wrapPosterText(m.source,320,17).length*26+128))
      batch.forEach((m,i) => {
        const x=48+i*376; rect(x,y,352,h,palette.card)
        let top=y+35; top+=text(m.label,x+16,top,320,23,palette.muted)
        top+=text(m.value,x+16,top+12,320,40,palette.teal,true)+16
        top+=text(m.date+' · 单日涨跌幅',x+16,top,320,17,palette.muted)
        text(m.source,x+16,top,320,17,palette.muted)
      }); y+=h+20
    }
  }
  let h=report.takeaways.reduce((sum,row) => sum+wrapPosterText(row,1020,25).length*37.5+10,60)+20
  rect(48,y,1104,h,'#E0F0EC')
  text('核心判断',72,y+37,1020,23,palette.teal,true)
  let top=y+80
  report.takeaways.forEach((row,i) => { text(String(i+1).padStart(2,'0'),72,top,45,23,palette.teal,true); top+=text(row,126,top,1000,25)+10 })
  y+=h+22
  for(let index=0; index<report.sections.length; index+=2) {
    const pair=report.sections.slice(index,index+2)
    const cardWidth = pair.length === 1 ? 1104 : 540
    h=Math.max(...pair.map(s=>wrapPosterText(s.body,cardWidth-52,25).length*37.5+wrapPosterText(s.title,cardWidth-70,25).length*37.5+66))
    pair.forEach((section,i) => {
      const x=48+i*564; rect(x,y,cardWidth,h,palette.card)
      rect(x+24,y+25,4,27,palette.teal,2)
      const titleH=text(section.title,x+42,y+48,cardWidth-70,25,palette.ink,true)
      text(section.body,x+24,y+60+titleH,cardWidth-52,25,palette.muted)
    }); y+=h+20
  }
  h=report.risks.reduce((sum,row) => sum+wrapPosterText('• '+row,1056,23).length*34.5+8,68)+16
  rect(48,y,1104,h,palette.risk)
  text('风险与失效条件',72,y+38,1056,24,'#805112',true)
  top=y+78
  report.risks.forEach(row=>{top+=text('• '+row,72,top,1056,23,'#714A19')+8})
  y+=h+40
  y+=text('AI辅助研究 · 数据日期以各指标为准 · 仅供交流，不构成投资建议。',48,y,1104,20,palette.muted)
  const height=Math.max(1800,Math.ceil(y+30))
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${height}" viewBox="0 0 1200 ${height}" role="img"><title>${escape(report.title)}</title><rect width="1200" height="${height}" fill="${palette.paper}"/><g font-family="PingFang SC, Noto Sans CJK SC, Microsoft YaHei, sans-serif">${parts.join('')}</g></svg>`
}
