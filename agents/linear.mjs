#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

if (!process.env.LINEAR_API_KEY) {
  console.error('LINEAR_API_KEY env var required')
  process.exit(1)
}

const agentsDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(agentsDir, '..')
const serverEntry = path.join(repoRoot, 'mcp-server', 'linear', 'index.js')

const [cmd, ...args] = process.argv.slice(2)

const proc = spawn(process.execPath, [serverEntry], {
  cwd: repoRoot,
  env: process.env,
  stdio: ['pipe', 'pipe', 'pipe'],
  windowsHide: true,
})

const pending = new Map()
let nextId = 1

function send(method, params = {}) {
  const id = nextId++
  proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
}

let stderrBuf = ''
process.stderr.write('')
proc.stderr.on('data', (d) => (stderrBuf += d.toString()))

const rl = createInterface({ input: proc.stdout })
rl.on('line', (line) => {
  if (!line.trim()) return
  let msg
  try {
    msg = JSON.parse(line)
  } catch {
    return
  }
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)))
    else resolve(msg.result)
  }
})

proc.on('error', (err) => fail(`MCP server error: ${err.message}`))
proc.on('exit', (code) => {
  if (pending.size > 0) {
    for (const { reject } of pending.values()) {
      reject(new Error(stderrBuf.trim() || `MCP server exited early (code ${code})`))
    }
    pending.clear()
  }
})

function fail(message, exitCode = 1) {
  const out = stderrBuf.trim()
  if (out) console.error(out)
  console.error(message)
  try {
    proc.kill()
  } catch {}
  process.exit(exitCode)
}

async function callTool(name, toolArgs) {
  const result = await send('tools/call', { name, arguments: toolArgs })
  if (result.isError) {
    const text = (result.content || []).map((c) => c.text).join('\n')
    throw new Error(text || `tool ${name} failed`)
  }
  const text = (result.content || []).map((c) => c.text).join('\n')
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function flagValue(name, fallback) {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : fallback
}

async function main() {
  const init = await send('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'the-app-linear-cli', version: '1.0.0' },
  })
  if (!init.serverInfo) throw new Error('MCP server did not initialize properly')
  proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n')

  if (cmd === 'list') {
    const issues = await callTool('list_issues', {
      state: flagValue('--state', undefined),
      label: flagValue('--label', undefined),
      limit: 50,
    })
    for (const i of issues) {
      const lbl = (i.labels || []).join(',')
      console.log(`${i.identifier} [${i.state}]${lbl ? ' {' + lbl + '}' : ''} ${i.title} (${i.id})`)
    }
  } else if (cmd === 'create') {
    const title = args[0]
    const issue = await callTool('create_issue', {
      title,
      description: flagValue('--desc', undefined),
      stateName: flagValue('--state', 'Backlog'),
      labels: flagValue('--label', undefined) ? [flagValue('--label', undefined)] : undefined,
    })
    console.log(JSON.stringify(issue, null, 2))
  } else if (cmd === 'state') {
    const [id, stateName] = args
    const issue = await callTool('update_issue_status', { id, status: stateName })
    console.log(JSON.stringify(issue, null, 2))
  } else if (cmd === 'get') {
    const [id] = args
    const issue = await callTool('get_issue', { id })
    console.log(JSON.stringify(issue, null, 2))
  } else {
    fail('usage: linear.mjs list [--state <s>] [--label <l>] | create <title> [--desc <d>] [--label <l>] [--state <s>] | state <id> <state> | get <id>')
  }
}

main().catch((err) => fail(`error: ${err.message}`)).finally(() => proc.kill())