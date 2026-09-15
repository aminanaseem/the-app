#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { createRequire } from 'node:module'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { DatabaseSync } = require('node:sqlite')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const DB_PATH = process.env.TODO_DB_PATH || path.join(REPO_ROOT, 'data', 'todos.db')

function openDb() {
  const db = new DatabaseSync(DB_PATH)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA synchronous = NORMAL')
  return db
}

const server = new McpServer({ name: 'the-app', version: '1.0.0' })

server.tool(
  'get_todos',
  'List all todos from the SQLite database',
  async () => {
    if (!fs.existsSync(DB_PATH)) {
      return {
        content: [{ type: 'text', text: 'No database found yet. Start the server first (npm start).' }],
      }
    }
    const db = openDb()
    try {
      const todos = db
        .prepare('SELECT id, title, status, created_at, completed_at FROM todos ORDER BY created_at DESC, id DESC')
        .all()
        .map((r) => ({ ...r, completed: r.status === 'completed' }))
      return {
        content: [{ type: 'text', text: JSON.stringify(todos, null, 2) }],
      }
    } finally {
      db.close()
    }
  }
)

server.tool(
  'explain_code',
  'Search the codebase for a pattern and return matching file snippets with context',
  { query: z.string().describe('Search term or regex pattern') },
  async ({ query }) => {
    let re
    try {
      re = new RegExp(query, 'i')
    } catch {
      re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    }

    const SEARCH_DIRS = ['server', 'client', 'tests', 'mcp-server']
    const results = []

    for (const dir of SEARCH_DIRS) {
      const absDir = path.join(REPO_ROOT, dir)
      if (!fs.existsSync(absDir)) continue
      walk(absDir, re, results)
    }

    if (results.length === 0) {
      return { content: [{ type: 'text', text: `No matches found for: ${query}` }] }
    }

    const summary = results
      .slice(0, 10)
      .map((r) => `${r.relPath}:${r.line}\n${r.snippet}`)
      .join('\n\n')

    return {
      content: [{ type: 'text', text: `${results.length} match(es), showing up to 10:\n\n${summary}` }],
    }
  }
)

function walk(dir, re, results) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      walk(abs, re, results)
    } else if (/\.(js|ts|mjs|md|json|html|css)$/.test(entry.name)) {
      const lines = fs.readFileSync(abs, 'utf-8').split('\n')
      for (let i = 0; i < lines.length; i++) {
        if (re.test(lines[i])) {
          const start = Math.max(0, i - 1)
          const end = Math.min(lines.length, i + 2)
          results.push({
            relPath: path.relative(REPO_ROOT, abs).replace(/\\/g, '/'),
            line: i + 1,
            snippet: lines.slice(start, end).join('\n'),
          })
        }
      }
    }
  }
}

server.tool(
  'where_is_state_stored',
  'Describe where and how application state is stored',
  async () => {
    const exists = fs.existsSync(DB_PATH)
    let tableInfo = 'Database not found yet.'
    let todos = []

    if (exists) {
      const db = openDb()
      try {
        const info = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='todos'").get()
        tableInfo = info ? info.sql : 'todos table not found.'
        todos = db.prepare('SELECT COUNT(*) AS count FROM todos').all()
      } finally {
        db.close()
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              driver: 'SQLite (node:sqlite built-in)',
              path: DB_PATH,
              tableSchema: tableInfo,
              rowCount: todos[0]?.count ?? 0,
              note: 'All app state lives in this single-file SQLite database. The server creates data/todos.db at startup if it does not exist.',
            },
            null,
            2
          ),
        },
      ],
    }
  }
)

const transport = new StdioServerTransport()
await server.connect(transport)