import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { openDb } from '../server/db.js'
import { createApp } from '../server/app.js'
import request from 'supertest'

describe('persistence', () => {
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
})