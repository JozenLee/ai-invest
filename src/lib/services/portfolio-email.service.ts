import { connect, type TLSSocket } from 'node:tls'
import { inflateSync } from 'node:zlib'

export interface ParsedFundHolding {
  ticker: string
  name: string
  quantity: number
  unitNav: number
}

export interface ParsedPortfolioEmails {
  cashBalance: number
  holdings: ParsedFundHolding[]
  balanceSubject: string
  holdingsSubject: string
  balanceDate?: string
  holdingsDate?: string
}

type EmailMessage = { subject: string; date?: string; text: string; attachments: Buffer[] }

const DEFAULT_MAILBOX = 'INBOX'

// 基金资产证明中的名称使用了 PDF 自定义字体，无法稳定从文本层还原；
// 代码名称表用于把证明里的基金代码映射为可读名称。
const FUND_NAMES: Record<string, string> = {
  '001634': '万家瑞祥混合C',
  '002963': '易方达黄金ETF联接C',
  '006697': '华宝中证银行ETF联接C',
  '011609': '易方达上证科创50联接C',
  '011949': '东吴多策略混合C',
  '014767': '景顺长城华城稳健6个月持有期混合A',
  '015454': '中欧中证500指数增强C',
  '015528': '弘毅远方汽车产业升级混合C',
  '017470': '嘉实上证科创板芯片ETF发起联接C',
  '018173': '华泰柏瑞中证电力全指ETF发起式联接C',
  '018463': '德邦稳盈增长灵活配置混合C',
  '019667': '易方达中证创新药产业ETF联接发起式C',
  '020973': '易方达机器人ETF联接C',
  '021842': '国富全球科技互联混合(QDII)人民币C',
  '024975': '华泰柏瑞上证科创板半导体材料设备主题ETF发起式联接C',
  '025833': '天弘电网设备特高压指数C',
  '026211': '平安科技精选混合发起式C',
  '026213': '工银科技智选混合C',
  '026449': '大摩沪港深科技混合C',
  '026633': '平安半导体领航精选混合发起式C',
}

function decodeQuotedPrintable(value: string) {
  return value
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-F]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
}

function decodeBody(raw: string) {
  const parts = raw.split(/\r?\n\r?\n/)
  const headers = parts.shift() ?? ''
  let body = parts.join('\n\n')
  const transfer = headers.match(/content-transfer-encoding:\s*([^\s]+)/i)?.[1]?.toLowerCase()
  if (transfer === 'base64') {
    try { body = Buffer.from(body.replace(/\s/g, ''), 'base64').toString('utf8') } catch { /* keep raw */ }
  } else if (transfer === 'quoted-printable') {
    body = decodeQuotedPrintable(body)
  }
  return body
}

function htmlToText(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/tr\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim()
}

function textFromRawEmail(raw: string) {
  const decoded = raw.split(/--[^\r\n]+/).map(decodeBody).join('\n')
  return htmlToText(decoded)
}

function headerValue(raw: string, name: string) {
  return raw.match(new RegExp(`^${name}:\\s*(.+)$`, 'im'))?.[1]?.trim() ?? ''
}

function decodeHeader(value: string) {
  return value.replace(/=\?UTF-8\?([BQ])\?([^?]+)\?=/gi, (_, encoding: string, content: string) => {
    if (encoding.toUpperCase() === 'B') {
      try { return Buffer.from(content, 'base64').toString('utf8') } catch { return content }
    }
    return decodeQuotedPrintable(content.replace(/_/g, ''))
  })
}

function parseMessage(raw: string): EmailMessage {
  const attachments = raw.split(/--[^\r\n]+/).flatMap(part => {
    const headers = part.split(/\r?\n\r?\n/)[0] ?? ''
    if (!/application\/(?:pdf|octet-stream)/i.test(headers) || !/filename=[\s\S]*\.pdf/i.test(headers)) return []
    const body = part.split(/\r?\n\r?\n/).slice(1).join('\n\n')
    try { return [Buffer.from(body.replace(/\s/g, ''), 'base64')] } catch { return [] }
  })
  return { subject: decodeHeader(headerValue(raw, 'Subject')), date: headerValue(raw, 'Date'), text: textFromRawEmail(raw), attachments }
}

function number(value: string) {
  return Number(value.replace(/[￥¥,，\s]/g, ''))
}

function extractPdfText(pdf: Buffer) {
  let text = ''
  for (const match of pdf.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    try {
      const decoded = inflateSync(Buffer.from(match[1].replace(/[\r\n]+$/, ''), 'latin1')).toString('latin1')
      if (!decoded.includes('BT')) continue
      for (const item of decoded.matchAll(/\(((?:\\.|[^()])*)\)Tj/g)) {
        text += item[1].replace(/\\([()\\])/g, '$1').replace(/\0/g, '') + ' '
      }
    } catch { /* non-text PDF stream */ }
  }
  return text
}

export function parseFundPdf(pdf: Buffer) {
  const tokens = extractPdfText(pdf).split(/\s+/).filter(Boolean)
  const holdings: ParsedFundHolding[] = []
  for (let index = 0; index < tokens.length; index += 1) {
    const ticker = tokens[index]
    if (!/^\d{6}$/.test(ticker)) continue
    const quantity = Number(tokens[index + 1])
    const unitNav = Number(tokens[index + 2])
    if (!Number.isFinite(quantity) || !Number.isFinite(unitNav) || !tokens[index + 3]?.startsWith('2026')) continue
    holdings.push({ ticker, name: FUND_NAMES[ticker] ?? `基金 ${ticker}`, quantity, unitNav })
  }
  return holdings
}

export function parseBalancePdf(pdf: Buffer) {
  const values = [...extractPdfText(pdf).matchAll(/\b\d{2,}[\d,]*(?:\.\d{1,2})\b/g)].map(match => number(match[0]))
  const balance = Math.max(...values.filter(value => value >= 1000))
  if (!Number.isFinite(balance)) throw new Error('未能从余额宝资产查询情况告知书中识别余额')
  return balance
}

export function parsePortfolioEmails(messages: EmailMessage[]): ParsedPortfolioEmails {
  const withFunds = messages.map(message => ({ message, holdings: message.attachments.flatMap(parseFundPdf) }))
  const funds = withFunds.find(item => item.holdings.length > 0)
  const balance = messages.find(message => message.attachments.some(attachment => parseFundPdf(attachment).length === 0))
  if (!balance || !funds) throw new Error('邮箱中未找到完整的两类支付宝业务凭证邮件')
  return {
    cashBalance: parseBalancePdf(balance.attachments[0]),
    holdings: funds.holdings,
    balanceSubject: balance.subject,
    holdingsSubject: funds.message.subject,
    balanceDate: balance.date,
    holdingsDate: funds.message.date,
  }
}

class ImapClient {
  private socket: TLSSocket
  private buffer = ''
  private tag = 0

  constructor() {
    this.socket = connect({ host: process.env.PORTFOLIO_IMAP_HOST ?? 'imap.163.com', port: Number(process.env.PORTFOLIO_IMAP_PORT ?? 993), servername: process.env.PORTFOLIO_IMAP_HOST ?? 'imap.163.com' })
    this.socket.setMaxListeners(0)
  }

  private readUntil(predicate: (value: string) => boolean) {
    return new Promise<string>((resolve, reject) => {
      const onData = (chunk: Buffer) => {
        this.buffer += chunk.toString('utf8')
        if (predicate(this.buffer)) { this.socket.off('data', onData); resolve(this.buffer) }
      }
      this.socket.on('data', onData).once('error', reject)
    })
  }

  private async command(command: string) {
    const id = `A${++this.tag}`
    this.socket.write(`${id} ${command}\r\n`)
    const response = await this.readUntil(value => new RegExp(`\\r?\\n${id} (OK|NO|BAD)`).test(value))
    this.buffer = ''
    if (!new RegExp(`\\r?\\n${id} OK`).test(response)) throw new Error(`IMAP 命令失败: ${command}`)
    return response
  }

  async fetchRecent() {
    await this.readUntil(value => /\* OK/.test(value)); this.buffer = ''
    await this.command(`LOGIN ${JSON.stringify(process.env.PORTFOLIO_IMAP_USER ?? 'jozenlee@163.com')} ${JSON.stringify(process.env.PORTFOLIO_IMAP_PASSWORD ?? '')}`)
    await this.command(`SELECT ${DEFAULT_MAILBOX}`)
    const search = await this.command('UID SEARCH SUBJECT "支付宝业务凭证"')
    const ids = search.match(/\* SEARCH\s+([0-9 ]+)/)?.[1]?.trim().split(/\s+/).slice(-10) ?? []
    const messages: EmailMessage[] = []
    for (const id of ids) {
      const result = await this.command(`UID FETCH ${id} (BODY.PEEK[])`)
      const raw = result.match(/\{\d+\}\r?\n([\s\S]*?)\r?\nA\d+ OK/)?.[1] ?? result
      messages.push(parseMessage(raw))
    }
    await this.command('LOGOUT'); this.socket.end()
    return messages
  }
}

class Pop3Client {
  private socket: TLSSocket
  private buffer = ''

  constructor() {
    this.socket = connect({ host: process.env.PORTFOLIO_POP3_HOST ?? 'pop.163.com', port: Number(process.env.PORTFOLIO_POP3_PORT ?? 995), servername: process.env.PORTFOLIO_POP3_HOST ?? 'pop.163.com' })
    this.socket.setMaxListeners(0)
  }

  private readUntil(predicate: (value: string) => boolean) {
    return new Promise<string>((resolve, reject) => {
      const onData = (chunk: Buffer) => {
        this.buffer += chunk.toString('utf8')
        if (predicate(this.buffer)) { this.socket.off('data', onData); resolve(this.buffer) }
      }
      this.socket.on('data', onData).once('error', reject)
    })
  }

  private async command(command: string, multiline = false) {
    this.socket.write(`${command}\r\n`)
    const response = await this.readUntil(value => multiline ? /\r?\n\.\r?\n/.test(value) : /\r?\n/.test(value))
    this.buffer = ''
    if (!response.startsWith('+OK')) throw new Error(`POP3 命令失败: ${command.split(' ')[0]}`)
    return response
  }

  async fetchRecent() {
    await this.readUntil(value => value.startsWith('+OK')); this.buffer = ''
    const user = process.env.PORTFOLIO_IMAP_USER ?? 'jozenlee@163.com'
    const password = process.env.PORTFOLIO_IMAP_PASSWORD ?? ''
    await this.command(`USER ${user}`)
    await this.command(`PASS ${password}`)
    const list = await this.command('LIST', true)
    const ids = [...list.matchAll(/^(\d+)\s+\d+$/gm)].map(match => Number(match[1])).slice(-20)
    const messages: EmailMessage[] = []
    for (const id of ids) {
      const response = await this.command(`RETR ${id}`, true)
      const raw = response.replace(/^\+OK[^\r\n]*\r?\n/, '').replace(/\r?\n\.\r?\n$/, '').replace(/\r?\n\.\./g, '\r\n.')
      messages.push(parseMessage(raw))
    }
    await this.command('QUIT')
    this.socket.end()
    return messages
  }
}

export async function readPortfolioEmails() {
  if (!process.env.PORTFOLIO_IMAP_PASSWORD) throw new Error('未配置 PORTFOLIO_IMAP_PASSWORD（请使用 163 邮箱授权码）')
  const protocol = process.env.PORTFOLIO_MAIL_PROTOCOL ?? 'pop3'
  const messages = protocol === 'imap'
    ? await new ImapClient().fetchRecent()
    : await new Pop3Client().fetchRecent()
  return parsePortfolioEmails(messages)
}
