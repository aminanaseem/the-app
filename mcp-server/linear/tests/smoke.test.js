import { describe, it, expect } from 'vitest'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SERVER = path.resolve(__dirname, '..', 'index.js')

const EXPECTED_TOOLS = [
  'list_issues',
  'get_issue',
  'create_issue',
  'update_issue',
  'update_issue_status',
  'add_issue_comment',
  'list_projects',
  'get_project',
]

function mcpLink({ env }) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [SERVER], {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let stderr = ''
    proc.stderr.on('data', (d) => (stderr += d.toString()))
    const pending = new Map()
    let nextId = 1
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
        const { resolve: r, reject: j } = pending.get(msg.id)
        pending.delete(msg.id)
        if (msg.error) j(new Error(msg.error.message || JSON.stringify(msg.error)))
        else r(msg.result)
      }
    })
    proc.on('exit', (code) => {
      for (const { reject: j } of pending.values()) j(new Error(stderr.trim() || `MCP server exited ${code}`))
      pending.clear()
    })
    proc.on('error', reject)

    const send = (method, params = {}) => {
      const id = nextId++
      proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
      return new Promise((r, j) => pending.set(id, { resolve: r, reject: j }))
    }

    resolve({
      proc,
      stderr: () => stderr,
      send,
      close: () => proc.kill(),
    })
  })
}

describe('Linear MCP server smoke test', () => {
  it('starts and exposes all 8 expected tools', { timeout: 15000 }, async () => {
    const link = await mcpLink({ env: { LINEAR_API_KEY: 'lin_test_key' } })
    try {
      const init = await link.send('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'smoke-test', version: '1.0.0' },
      })
      expect(init.serverInfo.name).toBe('the-app-linear')
      expect(init.protocolVersion).toBeTruthy()

      const listed = await link.send('tools/list', {})
      const names = listed.tools.map((t) => t.name).sort()
      expect(names).toEqual([...EXPECTED_TOOLS].sort())
    } finally {
      link.close()
    }
  })

  it('returns an error result for an unknown tool', async () => {
    const link = await mcpLink({ env: { LINEAR_API_KEY: 'lin_test_key' } })
    try {
      await link.send('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'smoke-test', version: '1.0.0' },
      })
      const result = await link.send('tools/call', { name: 'no_such_tool', arguments: {} })
      expect(result.isError).toBe(true)
      const text = result.content.map((c) => c.text).join('\n')
      expect(text).toMatch(/no_such_tool/)
    } finally {
      link.close()
    }
  })

  it('returns a validation error for bad tool arguments', async () => {
    const link = await mcpLink({ env: { LINEAR_API_KEY: 'lin_test_key' } })
    try {
      await link.send('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'smoke-test', version: '1.0.0' },
      })
      const result = await link.send('tools/call', { name: 'create_issue', arguments: {} })
      expect(result.isError).toBe(true)
      const text = result.content.map((c) => c.text).join('\n')
      expect(text).toMatch(/title/)
    } finally {
      link.close()
    }
  })

  it('exits with a clear error when LINEAR_API_KEY is missing', async () => {
    const link = await mcpLink({ env: { LINEAR_API_KEY: '' } })
    const exit = await new Promise((resolve, reject) => {
      link.proc.on('exit', (code) => resolve(code))
      link.proc.on('error', reject)
      setTimeout(() => reject(new Error('server did not exit')), 5000)
    })
    expect(exit).not.toBe(0)
    expect(link.stderr()).toMatch(/LINEAR_API_KEY/)
    link.close()
  })
})