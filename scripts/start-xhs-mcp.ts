import { config } from 'dotenv'
import { spawn } from 'node:child_process'
import { openSync, closeSync } from 'node:fs'
import path from 'node:path'
config({ quiet: true })
async function main() {
  const base = process.env.XHS_MCP_URL || 'http://127.0.0.1:18060'
  const url = new URL(base)
  if (!['localhost','127.0.0.1'].includes(url.hostname)) throw new Error('仅支持启动本机 MCP')
  try { await fetch(base + '/health', { signal: AbortSignal.timeout(2000) }); console.log('MCP 已运行'); return } catch {}
  const directory = path.join(process.cwd(), '.xhs-mcp')
  const log = openSync(path.join(directory, 'mcp.log'), 'a', 0o600)
  const child = spawn(path.join(directory, 'bin/xiaohongshu-mcp'), ['-port', '127.0.0.1:' + (url.port || '18060')], { cwd: path.join(directory, 'data'), detached: true, stdio: ['ignore', log, log], env: { ...process.env, AUTH_TOKEN: process.env.XHS_MCP_AUTH_TOKEN || '' } })
  child.once('error', error => { console.error(error); process.exitCode = 1 })
  child.unref(); closeSync(log)
  console.log('小红书 MCP 已派发启动，监听本机端口 ' + url.port)
}
void main().catch(error => { console.error(error); process.exitCode = 1 })
