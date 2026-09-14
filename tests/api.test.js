import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../server/app.js'
import { openDb } from '../server/db.js'

describe('todo API', () => {
  let app
  let db

  beforeEach(() => {
    db = openDb(':memory:')
    app = createApp(db)
  })

  it('starts with an empty list', async () => {
    const res = await request(app).get('/api/todos')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('adds a todo', async () => {
    const res = await request(app).post('/api/todos').send({ title: 'buy milk' })
    expect(res.status).toBe(201)
    expect(res.body.title).toBe('buy milk')
    expect(res.body.completed).toBe(false)
    expect(res.body.id).toBeGreaterThan(0)
  })

  it('rejects a blank title', async () => {
    const res = await request(app).post('/api/todos').send({ title: '   ' })
    expect(res.status).toBe(400)
  })

  it('rejects an empty-string title', async () => {
    const res = await request(app).post('/api/todos').send({ title: '' })
    expect(res.status).toBe(400)
  })

  it('rejects a missing title field', async () => {
    const res = await request(app).post('/api/todos').send({})
    expect(res.status).toBe(400)
  })

  it('rejects a non-string title field', async () => {
    const res = await request(app).post('/api/todos').send({ title: 123 })
    expect(res.status).toBe(400)
  })

  it('rejects a title longer than 200 characters', async () => {
    const res = await request(app)
      .post('/api/todos')
      .send({ title: 'x'.repeat(201) })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('200')
  })

  it('accepts a title of exactly 200 characters', async () => {
    const res = await request(app).post('/api/todos').send({ title: 'y'.repeat(200) })
    expect(res.status).toBe(201)
  })

  it('completes a todo', async () => {
    const added = await request(app).post('/api/todos').send({ title: 'task' })
    const res = await request(app)
      .patch(`/api/todos/${added.body.id}`)
      .send({ completed: true })
    expect(res.status).toBe(200)
    expect(res.body.completed).toBe(true)
  })

  it('un-completes a todo', async () => {
    const added = await request(app).post('/api/todos').send({ title: 'task' })
    await request(app).patch(`/api/todos/${added.body.id}`).send({ completed: true })
    const res = await request(app)
      .patch(`/api/todos/${added.body.id}`)
      .send({ completed: false })
    expect(res.status).toBe(200)
    expect(res.body.completed).toBe(false)
  })

  it('deletes a todo', async () => {
    const added = await request(app).post('/api/todos').send({ title: 'task' })
    const res = await request(app).delete(`/api/todos/${added.body.id}`)
    expect(res.status).toBe(204)
    const list = await request(app).get('/api/todos')
    expect(list.body).toEqual([])
  })

  it('returns 404 when completing a missing todo', async () => {
    const res = await request(app).patch('/api/todos/999').send({ completed: true })
    expect(res.status).toBe(404)
  })

  it('toggles completion with a bare PATCH (no body)', async () => {
    const added = await request(app).post('/api/todos').send({ title: 'task' })
    const first = await request(app).patch(`/api/todos/${added.body.id}`)
    expect(first.status).toBe(200)
    expect(first.body.completed).toBe(true)
    const second = await request(app).patch(`/api/todos/${added.body.id}`)
    expect(second.body.completed).toBe(false)
  })

  it('rejects a non-boolean completed field', async () => {
    const added = await request(app).post('/api/todos').send({ title: 'task' })
    const res = await request(app)
      .patch(`/api/todos/${added.body.id}`)
      .send({ completed: 'true' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when deleting a missing todo', async () => {
    const res = await request(app).delete('/api/todos/999')
    expect(res.status).toBe(404)
  })

  it('returns 400 for a non-numeric id', async () => {
    const res = await request(app).patch('/api/todos/abc').send({ completed: true })
    expect(res.status).toBe(400)
  })

  describe('strict id validation', () => {
    const badIds = ['1e2', '1.0', '12x', 'abc', '0x1', '+1', '-1', ' 1']
    for (const bad of badIds) {
      it(`rejects PATCH /api/todos/${bad}`, async () => {
        const res = await request(app).patch(`/api/todos/${encodeURIComponent(bad)}`).send({ completed: true })
        expect(res.status).toBe(400)
      })
      it(`rejects DELETE /api/todos/${bad}`, async () => {
        const res = await request(app).delete(`/api/todos/${encodeURIComponent(bad)}`)
        expect(res.status).toBe(400)
      })
    }

    it('still accepts a canonical numeric id', async () => {
      const added = await request(app).post('/api/todos').send({ title: 'ok' })
      const res = await request(app).delete(`/api/todos/${added.body.id}`)
      expect(res.status).toBe(204)
    })
  })

  it('bulk-deletes only completed todos', async () => {
    await request(app).post('/api/todos').send({ title: 'a' })
    const b = await request(app).post('/api/todos').send({ title: 'b' })
    await request(app).post('/api/todos').send({ title: 'c' })
    await request(app).patch(`/api/todos/${b.body.id}`).send({ completed: true })

    const res = await request(app).delete('/api/todos?scope=completed')
    expect(res.status).toBe(204)

    const list = await request(app).get('/api/todos')
    expect(list.body.map((t) => t.title).sort()).toEqual(['a', 'c'])
  })

  it('rejects an unsupported delete scope', async () => {
    const res = await request(app).delete('/api/todos?scope=all')
    expect(res.status).toBe(400)
  })
})