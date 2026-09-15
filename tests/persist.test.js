import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { openDb } from '../server/db.js'
import { createApp } from '../server/app.js'
import request from 'supertest'

const require = createRequire(import.meta.url)
const { DatabaseSync } = require('node:sqlite')

describe('persistence', () => {
  it('enables WAL journaling on file-backed databases', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'the-app-'))
    const dbPath = path.join(dir, 'wal.db')
    const db = openDb(dbPath)
    const row = db.prepare('PRAGMA journal_mode').get()
    expect(row.journal_mode).toBe('wal')
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('keeps todos across a database reopen (file-backed)', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'the-app-'))
    const dbPath = path.join(dir, 'todos.db')

    const db1 = openDb(dbPath)
    const app1 = createApp(db1)
    await request(app1).post('/api/todos').send({ title: 'sticky todo' })
    db1.close()

    const db2 = openDb(dbPath)
    const app2 = createApp(db2)
    const res = await request(app2).get('/api/todos')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].title).toBe('sticky todo')

    db2.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('migrates a legacy (completed-column) database to the status schema', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'the-app-'))
    const dbPath = path.join(dir, 'legacy.db')

    const legacy = new DatabaseSync(dbPath)
    legacy.exec(`
      CREATE TABLE todos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
    legacy.prepare('INSERT INTO todos (title, completed) VALUES (?, ?)').run('done legacy', 1)
    legacy.prepare('INSERT INTO todos (title, completed) VALUES (?, ?)').run('open legacy', 0)
    legacy.close()

    const db = openDb(dbPath)
    const app = createApp(db)
    const res = await request(app).get('/api/todos')
    const byTitle = Object.fromEntries(res.body.map((t) => [t.title, t]))
    expect(byTitle['done legacy'].status).toBe('completed')
    expect(byTitle['done legacy'].completed).toBe(true)
    expect(byTitle['done legacy'].completedAt).toBeTruthy()
    expect(byTitle['open legacy'].status).toBe('not_started')
    expect(byTitle['open legacy'].completed).toBe(false)
    expect(byTitle['open legacy'].completedAt).toBeNull()

    db.close()
    rmSync(dir, { recursive: true, force: true })
  })
})