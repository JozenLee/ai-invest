/** fund_basic uses m_fee (annual percent). Do not guess a fee from an ETF
 * classification row or mistake an absent value for a zero-fee product. */
export function managementFeePct(rows: Array<Record<string,unknown>>,ticker:string,legacy:Record<string,unknown>={}) {
  const code=(value:unknown)=>String(value||'').replace(/\.(SH|SZ)$/i,'')
  const row=rows.find(row=>code(row.ts_code)===ticker)
  const value=row?.m_fee??(code(legacy.ts_code)===ticker?legacy.m_fee??legacy.mgt_fee:null)
  if(value===null||value===undefined||value==='')return null
  const number=Number(value)
  return Number.isFinite(number)&&number>=0&&number<=10?number:null
}
